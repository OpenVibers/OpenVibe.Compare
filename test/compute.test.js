'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { buildCompute, createCompute, select, parseQuery, SOURCE, MONTH_HOURS } = require('../server/compute');
const computeViews = require('../server/compute-views');
const { build } = require('../server/data');

const at = '2026-11-11T00:00:00.000Z';
const now = Date.parse('2026-11-12T12:00:00.000Z');
const until = Date.parse('2026-11-18T00:00:00Z');
const gpu = (id, provider, gpu, gpu_mb, hourly, extra = {}) => ({ id, provider, kind: 'gpu', gpu, gpu_mb, hourly, per_second: hourly / 3600, billing_seconds: 1, checked_at: at, expires_at: until, source: `https://example.com/${provider}`, ...extra });
const cpu = (id, provider, region, cpu, ram_mb, hourly) => ({ id, provider, region, kind: 'cpu', cpu, ram_mb, gpu_mb: 0, hourly, per_second: hourly / 3600, billing_seconds: 1, checked_at: at, expires_at: until, source: `https://example.com/${provider}` });
const feed = {
    checked_at: at,
    prices: [
        gpu('daytona-4090-preemptible', 'daytona', 'RTX 4090', 24576, .57, { interruptible: true }),
        gpu('runpod-4090-pod', 'runpod', 'RTX 4090', 24576, .89, { promotion: '$10 credit' }),
        gpu('daytona-4090-ondemand', 'daytona', 'RTX 4090', 24576, .99),
        cpu('fly-iad-2x2', 'fly', 'iad', 2, 2048, 13.39 / 720),
        cpu('baseten-us-pdx-1-2x4', 'baseten', 'us-pdx-1', 2, 4096, .2154),
        { ...gpu('old-4090', 'old', 'RTX 4090', 24576, .5), checked_at: '2026-10-01T00:00:00.000Z', expires_at: '2026-11-01T00:00:00Z' },
        { id: 'bad-source', provider: 'x', kind: 'gpu', gpu: 'RTX 4090', gpu_mb: 1024, hourly: 1, checked_at: at, source: 'http://insecure.example.com' },
        { id: 'bad-price', provider: 'x', kind: 'gpu', hourly: 0, checked_at: at, source: 'https://example.com/x' },
    ],
};
const compute = buildCompute(feed, now);

test('compute prices are normalized, derived from Exchange fields, and invalid rows are left out', () => {
    assert.equal(compute.offers.length, 6);
    assert.equal(compute.unavailable, undefined);
    assert.equal(compute.checked_at, at);
    assert.equal(compute.checked_days_ago, 1);
    assert.equal(compute.source, SOURCE);
    assert.equal(compute.offers[0].id, 'fly-iad-2x2');
    const pre = compute.offers.find((o) => o.id === 'daytona-4090-preemptible');
    assert.equal(pre.cheapest, true);
    assert.equal(pre.currency, 'USD');
    assert.equal(pre.hourly, .57);
    assert.equal(pre.monthly_24_7, Math.round(.57 * MONTH_HOURS * 10000) / 10000);
    assert.equal(pre.hourly_per_gpu_gb, Math.round(.57 / 24 * 10000) / 10000);
    assert.equal(pre.interruptible, true);
    assert.equal(compute.cheapest.gpu, 'daytona-4090-preemptible');
    assert.equal(compute.cheapest.cpu, 'fly-iad-2x2');
    assert.equal(compute.expired_count, 1);
    assert.equal(compute.expired_at, '2026-11-01T00:00:00.000Z');
    assert.equal(compute.offers.filter((o) => o.cheapest).length, 2);
    assert.equal(computeViews.checkedLabel(compute), '1 day ago');
});

test('filters, places for the missing GPU GB-hour, and picks respect the query and the 3-pick limit', () => {
    assert.deepEqual(select(compute, { kind: 'gpu' }).offers.map((o) => o.id), ['old-4090', 'daytona-4090-preemptible', 'runpod-4090-pod', 'daytona-4090-ondemand']);
    assert.deepEqual(select(compute, { kind: 'gpu', interruptible: 'yes' }).offers.map((o) => o.id), ['daytona-4090-preemptible']);
    assert.deepEqual(select(compute, { interruptible: 'no', kind: 'cpu' }).offers.map((o) => o.id), ['fly-iad-2x2', 'baseten-us-pdx-1-2x4']);
    assert.deepEqual(select(compute, { region: 'us-pdx-1' }).offers.map((o) => o.id), ['baseten-us-pdx-1-2x4']);
    assert.deepEqual(select(compute, { gpu: 'RTX 4090' }).offers.length, 4);
    const byGpuHour = select(compute, { sort: 'gpu-hour' }).offers;
    assert.equal(byGpuHour[0].id, 'old-4090');
    assert.deepEqual(byGpuHour.slice(-2).map((o) => o.kind), ['cpu', 'cpu']);
    const q = parseQuery({ pick: 'runpod-4090-pod,daytona-4090-preemptible,fly-iad-2x2,baseten-us-pdx-1-2x4,nope', sort: 'nope' });
    assert.deepEqual(q.pick, ['runpod-4090-pod', 'daytona-4090-preemptible', 'fly-iad-2x2']);
    assert.equal(q.sort, 'hourly');
    assert.deepEqual(select(compute, { pick: 'runpod-4090-pod,nope' }).picks.map((o) => o.id), ['runpod-4090-pod']);
});

test('the page shows both layouts, the source line, the cheapest of each kind, expiry and a 2-3 pick side-by-side', () => {
    const html = computeViews.body(compute, {});
    assert.match(html, /compute-cards/);
    assert.match(html, /compute-table/);
    assert.match(html, /Data from <a href="https:\/\/openvibe\.exchange\/compute">OpenVibe\.Exchange<\/a>/);
    assert.match(html, /checked 1 day ago/);
    assert.match(html, /Cheapest GPU/);
    assert.match(html, /Cheapest computer/);
    assert.match(html, /per GPU GB-hour/);
    assert.match(html, /Per month \(730 h, 24\/7\)/);
    assert.match(html, /Provider price/);
    assert.match(html, /https:\/\/example\.com\/daytona/);
    assert.match(html, /models on Exchange/);
    assert.match(html, /computers on Run/);
    assert.match(html, /Review overdue/);
    assert.match(html, /passed the review date/);
    assert.match(html, /name="kind"/);
    assert.match(html, /name="gpu"/);
    assert.match(html, /name="region"/);
    assert.match(html, /name="interruptible"/);
    assert.doesNotMatch(html, /id="side-by-side"/);
    const picked = computeViews.body(compute, { pick: 'runpod-4090-pod,daytona-4090-preemptible,fly-iad-2x2' });
    assert.match(picked, /id="side-by-side"/);
    assert.match(picked, /3 offers side by side/);
    assert.match(picked, /Remove/);
    assert.match(computeViews.body(compute, { kind: 'cpu' }), /2 of 6 offers/);
});

test('markdown and Dataset JSON-LD are generated from the same selection', () => {
    const md = computeViews.markdown(compute, { kind: 'gpu', pick: 'runpod-4090-pod,daytona-4090-preemptible' });
    assert.match(md, /# Compute prices/);
    assert.match(md, /checked 1 day ago/);
    assert.match(md, /Data from \[OpenVibe\.Exchange\]/);
    assert.match(md, /daytona/);
    assert.match(md, /cheapest of its kind/);
    assert.match(md, /## Side-by-side/);
    assert.doesNotMatch(md, /fly-iad/);
    const ld = computeViews.jsonLd(compute);
    assert.equal(ld['@type'], 'Dataset');
    assert.equal(ld.contentUrl, undefined);
    assert.equal(ld.distribution.contentUrl, 'https://openvibe.compare/api/v1/compute');
    assert.equal(ld.dateModified, at);
});

test('the cache coalesces, lasts ten minutes, and a failed feed is not cached into a value', async () => {
    let calls = 0, t = now;
    const get = createCompute({ now: () => t, fetchImpl: async (url) => {
        calls++;
        assert.equal(url, SOURCE);
        return { ok: true, json: async () => feed };
    } });
    await Promise.all([get(), get()]);
    assert.equal(calls, 1);
    t += 599999;
    await get();
    assert.equal(calls, 1);
    t += 2;
    await get();
    assert.equal(calls, 2);
    let failures = 0;
    const down = createCompute({ now: () => t, fetchImpl: async () => { failures++; throw Error('offline'); } });
    assert.equal((await down()).unavailable, 'OpenVibe.Exchange did not answer, so no compute price is shown as current.');
    await down();
    assert.equal(failures, 2);
});

test('API, page, phone/table markup, filters, Markdown, discovery and CORS', async () => {
    const { createApp } = require('../server/app');
    const fixture = { market: { offers: [] }, harnesses: { harnesses: [] }, runs: { runs: [] }, plans: { plans: [] }, quality: { board: { rows: [] } } };
    const data = build(fixture, at);
    const server = createApp({ getData: async () => data, getCompute: async () => compute }).listen(0, '127.0.0.1');
    await new Promise((r) => server.once('listening', r));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
        let r = await fetch(base + '/api/v1/compute', { headers: { Origin: 'https://openvibe.network' } });
        assert.equal(r.status, 200);
        assert.equal(r.headers.get('access-control-allow-origin'), 'https://openvibe.network');
        const body = await r.json();
        assert.equal(body.source, 'OpenVibe.Exchange');
        assert.equal(body.source_url, SOURCE);
        assert.equal(body.offers.length, 6);
        assert.equal(body.offers[0].currency, 'USD');
        assert.equal(body.cheapest.gpu, 'daytona-4090-preemptible');
        assert.equal(body.month_hours, MONTH_HOURS);
        r = await fetch(base + '/api/v1/compute', { headers: { Origin: 'https://evil.example' } });
        assert.equal(r.headers.get('access-control-allow-origin'), null);

        const html = await (await fetch(base + '/compute?kind=gpu&interruptible=yes&sort=gpu-hour')).text();
        assert.match(html, /compute-cards/);
        assert.match(html, /compute-table/);
        assert.match(html, /Dataset/);
        assert.match(html, /contentUrl":"https:\/\/openvibe\.compare\/api\/v1\/compute/);
        assert.match(html, /name="interruptible"/);
        assert.match(html, /href="\/compute\?kind=gpu&amp;interruptible=yes&amp;sort=month"/);
        assert.equal((html.match(/data-offer="runpod-4090-pod"/g) || []).length, 0);
        const picked = await (await fetch(base + '/compute?pick=runpod-4090-pod,daytona-4090-preemptible')).text();
        assert.match(picked, /id="side-by-side"/);
        assert.match(picked, /2 offers side by side/);
        const md = await (await fetch(base + '/compute', { headers: { Accept: 'text/markdown' } })).text();
        assert.match(md, /# Compute prices/);
        assert.match(md, /OpenVibe\.Exchange/);
        const llms = await (await fetch(base + '/llms.txt')).text();
        assert.match(llms, /\[Compute prices\]\(https:\/\/openvibe\.compare\/compute\)/);
        assert.match(llms, /Compute JSON: https:\/\/openvibe\.compare\/api\/v1\/compute/);
        const sitemap = await (await fetch(base + '/sitemap.xml')).text();
        assert.match(sitemap, /<loc>https:\/\/openvibe\.compare\/compute<\/loc><lastmod>2026-11-11T00:00:00.000Z<\/lastmod>/);
        const home = await (await fetch(base + '/')).text();
        assert.match(home, /href="\/compute"/);
        assert.match(home, /Compute prices/);
        assert.match(home, /cheapest GPU/);
        const homeMd = await (await fetch(base + '/', { headers: { Accept: 'text/markdown' } })).text();
        assert.match(homeMd, /\[Compute prices\]\(\/compute\)/);
        for (const url of ['/compute', '/api/v1/compute']) assert.equal((await fetch(base + url)).status, 200, url);
    } finally {
        await new Promise((r) => server.close(r));
    }
});

test('an unavailable Exchange is an explicit unavailable state on the page and the API', async () => {
    const down = buildCompute(null, now);
    assert.equal(down.offers.length, 0);
    assert.match(computeViews.body(down, {}), /did not answer/);
    assert.match(computeViews.body(down, {}), /0 offers/);
    assert.match(computeViews.markdown(down, {}), /did not answer/);
    const { createApp } = require('../server/app');
    const fixture = { market: { offers: [] }, harnesses: { harnesses: [] }, runs: { runs: [] }, plans: { plans: [] }, quality: { board: { rows: [] } } };
    const server = createApp({ getData: async () => build(fixture, at), getCompute: async () => down }).listen(0, '127.0.0.1');
    await new Promise((r) => server.once('listening', r));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
        const body = await (await fetch(base + '/api/v1/compute')).json();
        assert.deepEqual(body.offers, []);
        assert.match(body.unavailable, /did not answer/);
        assert.equal((await fetch(base + '/compute')).status, 200);
    } finally {
        await new Promise((r) => server.close(r));
    }
});
