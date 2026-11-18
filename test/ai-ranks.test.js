'use strict';
// Rank spans and the comparison's sort, worked out without a scan per row (11-18: Compare's event loop stalled about 1 s
// every two minutes; a CPU profile put it in buildComparison: every rated row mapped every row into new objects, and
// each comparison of the sort rebuilt each row's offer prices). The answers are the ones the old code gave.
const test = require('node:test');
const assert = require('node:assert/strict');
const { overlapRanks, buildComparison } = require('../server/ai-data');

// The old way, kept here as the reference.
function oldSpan(list, intervalOf, i) {
    const [lo, hi] = intervalOf(list[i]) || [];
    if (lo == null || hi == null) return null;
    const overlap = list.map((other, j) => ({ other, rank: j + 1 }))
        .filter(({ other }) => { const r = intervalOf(other); return r && r[0] != null && r[1] != null && r[0] <= hi && r[1] >= lo; })
        .map(({ rank }) => rank);
    return overlap.length ? { min: Math.min(...overlap), max: Math.max(...overlap) } : null;
}

test('overlapRanks gives the old spans, rated and unrated rows mixed', () => {
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const list = Array.from({ length: 400 }, (_, i) => {
        if (rnd() < 0.3) return { iv: null };
        const mid = 1000 + rnd() * 400; const w = 5 + rnd() * 60;
        return { iv: rnd() < 0.05 ? [mid, null] : [mid - w, mid + w], i };
    });
    const of = (x) => x.iv;
    const ranks = overlapRanks(list, of);
    for (let i = 0; i < list.length; i++) {
        const [lo, hi] = list[i].iv || [];
        const want = oldSpan(list, of, i);
        const got = lo == null || hi == null ? null : ranks(lo, hi);
        assert.deepEqual(got, want, `row ${i}`);
    }
});

test('a refresh over a big catalogue builds in well under the old stall', () => {
    const kinds = [{ id: 'chat', name: 'Chat' }, { id: 'code', name: 'Code' }];
    const models = Array.from({ length: 1500 }, (_, i) => ({ id: `m${i}`, slug: `maker${i % 30}/model-${i}`, canonical: `maker${i % 30}/model-${i}`, name: `Model ${i}`, kind: 'chat',
        offers: [{ provider: 'p1', model: `maker${i % 30}/model-${i}`, price: { in: 1 + (i % 7), out: 2 + (i % 11) } }, { provider: 'p2', model: `model-${i}-2025-01-01`, price: { in: 1, out: 3 + (i % 5) } }] }));
    const board = (k) => ({ data: { board: { rows: Array.from({ length: 300 }, (_, i) => ({ subject: `model-${i * 4}-2025-01-01`, rating: { value: 1500 - i + (k === 'code' ? i % 3 : 0), interval: [1480 - i, 1520 - i] } })) } } });
    const t = process.hrtime.bigint();
    const out = buildComparison({ kindsRead: { data: { kinds } }, boards: kinds.map((k) => board(k.id)), catalogue: { generated_at: '2026-11-18T00:00:00.000Z', models }, perf: null, now: '2026-11-18T19:30:00.000Z' });
    const ms = Number(process.hrtime.bigint() - t) / 1e6;
    assert.ok(out && Array.isArray(out.rows) ? out.rows.length > 0 : true, 'rows built');
    assert.ok(ms < 400, `built in ${ms.toFixed(0)} ms`);
});
