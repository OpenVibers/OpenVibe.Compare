(function (root) {
'use strict';
function weights(comparison, input = {}) {
  return Object.fromEntries(comparison.criteria.map(c => {
    const n = Object.hasOwn(input, c.id) ? Number(input[c.id]) : c.weight;
    return [c.id, Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : c.weight];
  }));
}
function rank(comparison, input = {}) {
  const w = weights(comparison, input);
  const by = new Map(comparison.results.map(r => [`${r.thing}\0${r.criterion}`, r.value]));
  const criteria = comparison.criteria.filter(c => w[c.id] > 0 && comparison.results.some(r => r.criterion === c.id));
  const ranges = Object.fromEntries(criteria.map(c => {
    const vs = comparison.results.filter(r => r.criterion === c.id).map(r => r.value);
    return [c.id, [Math.min(...vs), Math.max(...vs)]];
  }));
  return comparison.things.map(thing => {
    let sum = 0, total = 0, missing = false;
    for (const c of criteria) {
      const v = by.get(`${thing.id}\0${c.id}`), [lo, hi] = ranges[c.id];
      if (v === undefined) { missing = true; continue; }
      const n = hi === lo ? 0.5 : c.better === 'lower' ? (hi-v)/(hi-lo) : (v-lo)/(hi-lo);
      sum += n*w[c.id]; total += w[c.id];
    }
    return { thing, score: missing || !total ? null : 100*sum/total };
  }).sort((a,b) => (b.score ?? -1)-(a.score ?? -1) || a.thing.name.localeCompare(b.thing.name));
}
const api = { rank, weights };
if (typeof module === 'object') module.exports = api; else root.CompareRank = api;
})(globalThis);
