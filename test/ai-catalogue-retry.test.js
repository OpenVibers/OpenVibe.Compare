'use strict';
// A failed Exchange market read is tried again within seconds, and only a real last good copy is ever served stale
// (11-14: one timeout while the AI service restarted left /ai with "0 models from 0 providers" for minutes).
const test = require('node:test');
const assert = require('node:assert/strict');
const { createAiCatalogue, TTL_MS, RETRY_MS } = require('../server/ai-catalogue');

const page = { generated_at: '2026-11-14T00:00:00.000Z', next_cursor: null, offers: [{ model: 'alpha', price: { out: 2 } }] };
function harness() {
    let clock = 0;
    let answer = null;
    let calls = 0;
    const fetchImpl = async () => {
        calls++;
        if (answer === 'fail') throw new Error('timeout');
        return { ok: true, status: 200, headers: { get: () => 'application/json' }, text: async () => JSON.stringify(answer), json: async () => answer };
    };
    const cat = createAiCatalogue({ fetchImpl, now: () => clock, log: { warn() {}, error() {}, info() {} } });
    return { cat, set: (a) => { answer = a; }, tick: (ms) => { clock += ms; }, calls: () => calls };
}

test('a first failure is retried after RETRY_MS, not after the full TTL', async () => {
    assert.ok(RETRY_MS < TTL_MS);
    const h = harness();
    h.set('fail');
    assert.equal(await h.cat.market(), null, 'nothing to show yet');
    const after = h.calls();
    h.tick(RETRY_MS - 1);
    assert.equal(await h.cat.market(), null);
    assert.equal(h.calls(), after, 'no new read inside the retry window');
    h.set(page);
    h.tick(2);
    const m = await h.cat.market();
    assert.equal(m.offers.length, 1, 'the market is back within seconds');
    assert.equal(m.stale, false);
});

test('a failure after a good read serves the good copy, stale; two failures never invent an empty market', async () => {
    const h = harness();
    h.set(page);
    assert.equal((await h.cat.market()).offers.length, 1);
    h.set('fail');
    h.tick(TTL_MS + 1);
    const stale = await h.cat.market();
    assert.equal(stale.stale, true);
    assert.equal(stale.offers.length, 1, 'the last good copy');
    h.tick(RETRY_MS + 1);
    const again = await h.cat.market();
    assert.equal(again.offers.length, 1, 'still the last good copy after a second failure');

    const cold = harness();
    cold.set('fail');
    assert.equal(await cold.cat.market(), null);
    cold.tick(RETRY_MS + 1);
    assert.equal(await cold.cat.market(), null, 'no { stale: true } shell without offers');
});
