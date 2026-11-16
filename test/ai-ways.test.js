'use strict';
// /ai/ways (11-16): OpenVibe.Actor's leaderboard of the ways to work a task, read from its public JSON and held a minute;
// the last good copy while Actor is away (marked stale); an empty board says how to make one; the hub links it.
const assert = require('assert');
const { createWays } = require('../server/ai-ways');
const views = require('../server/ai-views');

(async () => {
    let calls = 0, up = true, clock = 0;
    const board = { engines: [
        { engine: { kind: 'model' }, label: 'One model', runs: 4, finished: 4, wins: 3, mean_score: 3.4, out_of: 4, median_seconds: 6.2, mean_cost_usd: 0.0012 },
        { engine: { kind: 'decisions' }, label: 'Decisions', runs: 4, finished: 3, wins: 1, mean_score: 2.9, out_of: 4, median_seconds: 4.1, mean_cost_usd: 0.0003 },
    ], scope: 'everyone' };
    const fetchImpl = async (url) => { calls++; assert.strictEqual(url, 'https://openvibe.actor/api/v1/engines/leaderboard'); if (!up) throw new Error('offline'); return { ok: true, status: 200, json: async () => board }; };
    const ways = createWays({ fetchImpl, log: { warn() {} }, now: () => clock });
    let d = await ways.board();
    assert.deepStrictEqual([d.engines.length, d.stale], [2, false]);
    await ways.board();
    assert.strictEqual(calls, 1, 'held a minute');
    clock = 120_000; up = false;
    d = await ways.board();
    assert.deepStrictEqual([d.engines.length, d.stale], [2, true], 'the last good copy, marked stale');

    let html = views.ways(d);
    assert.match(html, /<h1>Ways to work a task<\/h1>/);
    assert.match(html, /One model/);
    assert.match(html, /3\.40/);
    assert.match(html, /OpenVibe\.Actor is unavailable/);
    assert.match(html, /https:\/\/openvibe\.actor\/compare/);
    html = views.ways({ engines: [] });
    assert.match(html, /No comparison has been graded yet\. <a href="https:\/\/openvibe\.actor\/compare">Run one on OpenVibe\.Actor<\/a>/);
    html = views.ways({ engines: null });
    assert.match(html, /could not be read just now/);
    assert.match(views.hub({ rows: [] }), /<a href="\/ai\/ways">Ways to work a task<\/a>/, 'the hub links it');
    const never = createWays({ fetchImpl: async () => { throw new Error('offline'); }, log: { warn() {} } });
    assert.strictEqual((await never.board()).engines, null, 'never read: null, not an empty board');
    console.log('ai-ways: Actor\'s ways leaderboard read and held, stale when away, empty and unreadable states, linked from the hub');
})().catch((e) => { console.error(e); process.exit(1); });
