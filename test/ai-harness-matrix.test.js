'use strict';

// The harness board, the harness × model matrix and an agent pair: each with a stubbed Bench factor fit, an empty
// fit, and Bench down. A page that cannot read the fit still answers 200 with words, never a blank or a zero.
const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createApp } = require('../server/app');
const { createAi } = require('../server/ai-data');
const { gapParts } = require('../public/ai-factors');

const at = '2026-11-13T00:00:00.000Z';
const KINDS = [
    { id: 'code', room: 'codes', judge: 'test_suite', name: 'Code' },
    { id: 'chat', room: 'exchange', judge: 'human_pairwise', name: 'Chat' },
];
const catalogue = {
    generated_at: at,
    models: [
        { slug: 'gpt-5-mini', canonical: 'gpt-5-mini', name: 'gpt-5-mini', kind: 'chat', maker: 'OpenAI', offers: [] },
        { slug: 'glm-5.3', canonical: 'glm-5.3', name: 'glm-5.3', kind: 'chat', maker: 'Z.ai', offers: [] },
    ],
};
const market = { generated_at: at, offers: [] };
const perf = { range: { from: '2026-10-15', to: '2026-11-13' }, rows: [] };

const fit = {
    task_kind: 'code', category: null, days: 90, matches: 180, games: 180, style_control: true,
    models: [
        { model: 'gpt-5-mini', score: 1050, ci_lower: 1020, ci_upper: 1080, games: 100 },
        { model: 'glm-5.3', score: 1030, ci_lower: 1000, ci_upper: 1060, games: 80 },
    ],
    harnesses: [
        { harness: 'codex', effect: 45, ci_lower: 20, ci_upper: 70, games: 110 },
        { harness: 'opencode', effect: -15, ci_lower: -40, ci_upper: 10, games: 70 },
        { harness: 'aider', effect: 5, ci_lower: -20, ci_upper: 30, games: 20 },
    ],
    agents: [
        { id: 'agent:codex+gpt-5-mini#0123abcd', model: 'gpt-5-mini', harness: 'codex', score: 1095, ci_lower: 1070, ci_upper: 1120, factors: { model: { score: 1050 }, harness: { score: 45 }, interaction: { score: 0 } } },
        { id: 'agent:opencode+gpt-5-mini#0123abcd', model: 'gpt-5-mini', harness: 'opencode', score: 1035, ci_lower: 1010, ci_upper: 1060, factors: { model: { score: 1050 }, harness: { score: -15 }, interaction: { score: 0 } } },
        { id: 'agent:codex+glm-5.3#0123abcd', model: 'glm-5.3', harness: 'codex', score: 1040, ci_lower: 1015, ci_upper: 1065, factors: { model: { score: 1030 }, harness: { score: 45 }, interaction: { score: -35 } } },
        { id: 'agent:opencode+glm-5.3#0123abcd', model: 'glm-5.3', harness: 'opencode', score: 1070, ci_lower: 1045, ci_upper: 1095, factors: { model: { score: 1030 }, harness: { score: -15 }, interaction: { score: 55 } } },
    ],
    method: 'penalised conditional logit: agent = model + harness + model×harness, 150 bootstrap draws, seed 20261113',
};
const emptyFit = { task_kind: 'code', category: null, days: 90, matches: 0, games: 0, style_control: true, models: [], harnesses: [], agents: [], method: fit.method };

const json = (body) => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, text: async () => JSON.stringify(body), json: async () => body });

function stub({ down = false, empty = false } = {}) {
    return async (url) => {
        const u = new URL(url);
        const p = u.pathname;
        if (p === '/api/v1/factors') {
            if (down) throw Error('offline');
            const days = Number(u.searchParams.get('days')) || 90;
            const task_kind = u.searchParams.get('task_kind') || 'code';
            return json(empty ? { ...emptyFit, task_kind, days } : { ...fit, task_kind, days });
        }
        if (down) throw Error('offline');
        if (p === '/api/v1/exchange/catalog') return json(catalogue);
        if (p === '/api/v1/exchange/market') return json(market);
        if (p === '/api/v1/ai/performance') return json(perf);
        if (p === '/api/v1/kinds') return json({ count: KINDS.length, kinds: KINDS });
        if (p.startsWith('/api/v1/ratings/')) return json({ board: { kind_id: p.split('/').at(-1), rows: [] } });
        if (p.startsWith('/api/v1/boards/')) return json({ board: { kind_id: p.split('/').at(-1), type: 'elo', rows: [] } });
        return json(null);
    };
}

async function withServer(opts, fn) {
    const ai = createAi({ fetchImpl: stub(opts), log: { warn() {} } });
    const server = createApp({ ai }).listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
        await fn(`http://127.0.0.1:${server.address().port}`);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
}

test('the harness board draws each effect with its interval on one scale, games and the agents it appears in', async () => {
    await withServer({}, async (base) => {
        const r = await fetch(`${base}/ai/harnesses?task_kind=code&days=90`);
        assert.equal(r.status, 200);
        const html = await r.text();
        assert.match(html, /Harness effects/);
        assert.match(html, /\+45 Elo/);
        assert.match(html, /95% 20 to 70/);
        assert.match(html, /110 games/);
        assert.match(html, /class="ai-hstrip"/);
        assert.match(html, /--zero:/);
        // Every agent number names its harness.
        assert.match(html, /<b>codex<\/b><span aria-hidden="true">\+<\/span>gpt-5-mini/);
        assert.match(html, /<b>opencode<\/b><span aria-hidden="true">\+<\/span>glm-5\.3/);
        assert.match(html, /95% 1070–1120/);
        assert.match(html, /aider/);
        assert.match(html, /name="task_kind"/);
        assert.match(html, /name="days"/);
        assert.match(html, /neutral harness <code>ov-bare<\/code>/);
        assert.doesNotMatch(html, /No harness has enough matches yet/);
    });
});

test('the matrix is a labelled table (cards under 600 px), not run cells, the best pair per model and named interactions', async () => {
    await withServer({}, async (base) => {
        const r = await fetch(`${base}/ai/matrix?task_kind=code&days=90`);
        assert.equal(r.status, 200);
        const html = await r.text();
        assert.match(html, /Harness × model/);
        assert.match(html, /ovk-table--stack/);
        assert.match(html, /data-label="gpt-5-mini"/);
        assert.match(html, /title="codex\+gpt-5-mini · 95% interval 1070–1120"/);
        assert.match(html, /best pair/);
        assert.match(html, /not run/);
        assert.match(html, /Interactions over 30 points/);
        assert.match(html, /<b>opencode<\/b> gains 55 points with glm-5\.3/);
        assert.match(html, /<b>codex<\/b> loses 35 points with glm-5\.3/);
        assert.match(html, /Harness × model matrix|Harness × model/);
    });
});

test('an agent pair splits its gap into the model, the harness and the two together', async () => {
    await withServer({}, async (base) => {
        const r = await fetch(`${base}/ai/compare/codex%2Bgpt-5-mini-vs-opencode%2Bglm-5.3`);
        assert.equal(r.status, 200);
        const html = await r.text();
        assert.match(html, /Of this 25-point gap, \+20 is the model, \+60 the harness, -55 the two together/);
        assert.match(html, /id="ai-gap-data"/);
        assert.match(html, /id="ai-gap-split"/);
        assert.match(html, /\/ai-factors\.js/);
        assert.match(html, /codex<\/b><span aria-hidden="true">\+<\/span>gpt-5-mini/);
        assert.match(html, /OpenVibe\.Bench's Code fit over 365 days/);
    });
});

test('an empty answer says what fills the board, and the hub links both pages', async () => {
    await withServer({ empty: true }, async (base) => {
        const harnesses = await (await fetch(`${base}/ai/harnesses`)).text();
        assert.match(harnesses, /No harness has enough matches yet: a harness shows after it has run against others on the same tasks\./);
        const matrix = await (await fetch(`${base}/ai/matrix`)).text();
        assert.match(matrix, /No harness × model pair has run yet: a cell fills when an agent has run on that harness and model on the same tasks\./);
        const pair = await fetch(`${base}/ai/compare/codex%2Bgpt-5-mini-vs-opencode%2Bglm-5.3`);
        assert.equal(pair.status, 200);
        assert.doesNotMatch(await pair.text(), /Of this .*point gap/);
        const hub = await (await fetch(`${base}/ai`)).text();
        assert.match(hub, /href="\/ai\/harnesses"/);
        assert.match(hub, /href="\/ai\/matrix"/);
        assert.match(hub, /Harness and model, apart/);
    });
});

test('Bench down still answers 200 with words on each page', async () => {
    await withServer({ down: true }, async (base) => {
        for (const path of ['/ai/harnesses', '/ai/matrix']) {
            const r = await fetch(base + path);
            assert.equal(r.status, 200, path);
            const html = await r.text();
            assert.match(html, /OpenVibe\.Bench did not answer its factor board\. This page comes back when it answers; nothing is filled in\./, path);
        }
        const pair = await fetch(`${base}/ai/compare/codex%2Bgpt-5-mini-vs-opencode%2Bglm-5.3`);
        assert.equal(pair.status, 200);
        const html = await pair.text();
        assert.match(html, /codex\+gpt-5-mini vs opencode\+glm-5\.3/);
        assert.doesNotMatch(html, /Of this .*point gap/);
        assert.doesNotMatch(html, /id="ai-gap-data"/);
    });
});

test('the sitemap carries the two pages', async () => {
    await withServer({}, async (base) => {
        const xml = await (await fetch(`${base}/sitemap.xml`)).text();
        assert.match(xml, /https:\/\/openvibe\.compare\/ai\/harnesses/);
        assert.match(xml, /https:\/\/openvibe\.compare\/ai\/matrix/);
    });
});

test('gapParts hands OVMetrics.split a size per part and keeps the sign', () => {
    const parts = gapParts({ model: 20, harness: 60, interaction: -55 });
    assert.deepEqual(parts.map((p) => [p.key, p.value, p.signed, p.tone]), [['model', 20, 20, 1], ['harness', 60, 60, 2], ['interaction', 55, -55, 3]]);
    assert.equal(gapParts({ model: null, harness: null, interaction: null }).length, 0);
});
