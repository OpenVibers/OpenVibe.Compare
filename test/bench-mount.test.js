'use strict';
// Bench inside Compare (plan §X step 2b): without BENCH_ENV_FILE Compare serves its own pages and nothing of Bench; with
// it, Compare's process answers Bench's API (the kinds, a preflight with Bench's own methods) behind Compare's own
// routes, Compare's read-only API keeps its CORS, Compare's pages stay Compare's, and Bench's work stops cleanly.
// Bench's own mocks (server/bench/test/helpers) stand in for Network and AI; its database is a temp PGlite.
const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createApp } = require('../server/app');
const { mountBench } = require('../server/bench-mount');
const { createAi } = require('../server/ai-data');

const stubs = () => ({
    getData: async () => [],
    getCompute: async () => ({ checked_at: null, offers: [] }),
    ai: createAi({ fetchImpl: async () => new Response('{}', { status: 503 }) }),
    sso: { router: (express) => express.Router(), optionalAuth: () => (_q, _r, n) => n() },
});

async function listen(app) {
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    return { server, base: `http://127.0.0.1:${server.address().port}` };
}

test('without BENCH_ENV_FILE Compare is alone', async () => {
    assert.equal(await mountBench({ env: {} }), null);
    const { server, base } = await listen(createApp(stubs()));
    try {
        assert.equal((await fetch(`${base}/api/health`)).status, 200);
        assert.equal((await fetch(`${base}/api/v1/kinds`)).status, 404, 'no Bench, no Bench API');
    } finally { server.close(); }
});

test('with Bench mounted, Compare answers Bench\'s API behind its own routes', async () => {
    const { startNetwork } = require('../server/bench/test/helpers/network');
    const { startAi } = require('../server/bench/test/helpers/ai');
    const network = await startNetwork({});
    const ai = await startAi({});
    const testdb = await require('../server/bench/test/helpers/db').testDb({});
    const { createStore } = require('../server/bench/server/db');
    const benchEnv = {
        NODE_ENV: 'test', BASE_URL: 'https://bench.openvibe.services', TRUST_PROXY: '1',
        OV_NETWORK_URL: network.url, OV_NETWORK_INTERNAL_URL: network.url, OV_NETWORK_ISSUER: network.url,
        OV_OAUTH_CLIENT_ID: 'bench', OV_OAUTH_CLIENT_SECRET: 'bench-secret', COOKIE_SECURE: 'false',
        OV_AI_INTERNAL_URL: ai.url, BENCH_DRILL: '1', BENCH_JOB_INTERVAL_MS: '100000',
    };
    const silent = { log() {}, info() {}, warn() {}, error() {} };
    const bench = await mountBench({ benchEnv, store: createStore(testdb.db), log: silent });
    assert.ok(bench && bench.app && bench.ctx, 'Bench is mounted');
    assert.equal(bench.host, 'bench.openvibe.services');
    assert.deepEqual(bench.hosts, ['bench.openvibe.services', 'bench-render.openvibe.services'], 'Bench\'s render origin is Bench\'s too');
    const { server, base } = await listen(createApp({ ...stubs(), bench: bench.app, benchHost: bench.hosts }));
    try {
        const kinds = await fetch(`${base}/api/v1/kinds`);
        assert.equal(kinds.status, 200, 'Bench\'s kinds, through Compare');
        const body = await kinds.json();
        assert.ok(Array.isArray(body.kinds) && body.kinds.length > 0, 'the kinds are Bench\'s');
        // Compare's own read-only API keeps its own answer and CORS.
        const own = await fetch(`${base}/api/v1/comparisons`, { headers: { Origin: 'https://openvibe.compare' } });
        assert.equal(own.status, 200);
        assert.deepEqual(await own.json(), { comparisons: [] });
        // A preflight for Bench's API is Bench's to answer, not Compare's GET-only one.
        const pre = await fetch(`${base}/api/v1/kinds`, { method: 'OPTIONS', headers: { Origin: 'https://openvibe.network', 'Access-Control-Request-Method': 'POST' } });
        assert.notEqual(pre.headers.get('access-control-allow-methods'), 'GET, HEAD, OPTIONS', 'Compare\'s CORS does not answer for Bench');
        // Compare's pages stay Compare's.
        assert.equal((await fetch(`${base}/api/health`)).headers.get('content-type').startsWith('application/json'), true);
        assert.deepEqual(await (await fetch(`${base}/api/health`)).json(), { status: 'ok', service: 'compare' });
        // A request for Bench's own host is Bench's whole: Compare's health is not answered there.
        // (fetch cannot set Host, so node:http asks.)
        const onBench = await new Promise((resolve, reject) => {
            const req = require('node:http').request(`${base}/api/health`, { headers: { Host: 'bench.openvibe.services' } }, (res) => {
                let text = ''; res.on('data', (d) => { text += d; }); res.on('end', () => resolve(text));
            });
            req.on('error', reject); req.end();
        });
        assert.ok(!/"service":"compare"/.test(onBench), `Bench answers its own host (got ${onBench.slice(0, 80)})`);
        // Bench's background work starts and stops; its database closes last.
        bench.start({ port: server.address().port });
        await bench.stop();
    } finally {
        server.close();
        await network.close?.();
        await ai.close?.();
    }
});
