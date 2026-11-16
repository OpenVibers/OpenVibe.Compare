'use strict';
// A model's link from another site lands on its page, and "not here" is a page (the owner, 11-16: Exchange's How it ranks
// opened /things/openai%2Fgpt-5-nano, a bare "Not Found"; "all these links are broken").
const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createApp } = require('../server/app');
const { createAi } = require('../server/ai-data');

const stubs = () => ({
    getData: async () => [],
    getCompute: async () => ({ checked_at: null, offers: [] }),
    ai: createAi({ fetchImpl: async () => new Response('{}', { status: 503 }) }),
    sso: { router: (express) => express.Router(), optionalAuth: () => (_q, _r, n) => n() },
});

test('/things/<model id> goes to the model page; an unknown thing and an unknown path are pages', async () => {
    const server = createApp(stubs()).listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
        for (const id of ['openai%2Fgpt-5-nano', 'openai:gpt-5-nano', 'deepseek%2Fdeepseek-flash']) {
            const r = await fetch(`${base}/things/${id}`, { redirect: 'manual' });
            assert.equal(r.status, 301, id);
            assert.equal(r.headers.get('location'), `/ai/models/${encodeURIComponent(decodeURIComponent(id))}`, id);
        }
        const thing = await fetch(`${base}/things/no-such-thing`);
        assert.equal(thing.status, 404);
        assert.match(await thing.text(), /This comparison is not here[\s\S]*href="\/ai"/, 'a page with ways on, not a bare "Not Found"');
        const path = await fetch(`${base}/nowhere/at/all`, { headers: { accept: 'text/html' } });
        assert.equal(path.status, 404);
        assert.match(await path.text(), /This page is not here/);
        const api = await fetch(`${base}/nowhere`, { headers: { accept: 'application/json' } });
        assert.deepEqual(await api.json(), { error: 'not_found' });
    } finally {
        server.close();
    }
});
