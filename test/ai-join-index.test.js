'use strict';
// The catalogue index answers as findCatalogModel does, without a scan per lookup (11-18: Compare's event loop stalled
// about 1 s every two minutes, 18% of the time over 0.5 s, while each refresh ran the bare-name pass over every model
// and offer for every Bench row).
const test = require('node:test');
const assert = require('node:assert/strict');
const { findCatalogModel, catalogIndex } = require('../server/ai-join');

const models = [
    { id: 'm1', slug: 'openai/gpt-5-nano', canonical: 'openai/gpt-5-nano', name: 'GPT-5 nano', offers: [{ model: 'openai/gpt-5-nano' }, { model: 'gpt-5-nano-2025-08-07' }] },
    { id: 'm2', slug: 'meta/llama-3.1-8b', canonical: 'meta/llama-3.1-8b', name: 'Llama 3.1 8B', offers: [{ model: 'llama-3.1-8b:free' }] },
    // A second model that also bare-matches "gpt-5-nano": the first in catalogue order wins, as before.
    { id: 'm3', slug: 'other/gpt-5-nano', canonical: 'other/gpt-5-nano', name: 'Other nano', offers: [] },
    { id: 'm4', slug: 'z/exact-only', canonical: null, name: null },
    null,
];

test('the index gives the same model as findCatalogModel for every kind of name', () => {
    const find = catalogIndex(models);
    const ids = ['openai/gpt-5-nano', 'm2', 'gpt-5-nano-2025-08-07', 'GPT-5-NANO', 'llama-3.1-8b', 'llama-3.1-8b-latest', 'other/gpt-5-nano',
        'z/exact-only', 'exact-only', 'nothing-like-it', '', null, undefined];
    for (const id of ids) assert.equal(find(id), findCatalogModel(models.filter(Boolean), id), String(id));
    assert.equal(find('other/gpt-5-nano').id, 'm3', 'an exact name beats an earlier bare match');
    assert.equal(find('gpt-5-nano').id, 'm1', 'the first in catalogue order among bare matches');
});

test('no catalogue: nothing found', () => {
    assert.equal(catalogIndex(null)('anything'), null);
    assert.equal(catalogIndex([])('anything'), null);
});

test('a big catalogue is indexed once, not scanned per lookup', () => {
    const big = Array.from({ length: 2000 }, (_, i) => ({ id: `m${i}`, slug: `maker${i % 40}/family-${i}`, canonical: `maker${i % 40}/family-${i}`, name: `Family ${i}`,
        offers: [{ model: `family-${i}-2025-08-07` }, { model: `family-${i}:free` }] }));
    const t = process.hrtime.bigint();
    const find = catalogIndex(big);
    for (let i = 0; i < 600; i++) find(`family-${i * 3}-2025-08-07`);
    const ms = Number(process.hrtime.bigint() - t) / 1e6;
    assert.ok(ms < 200, `600 lookups over 2,000 models in ${ms.toFixed(1)} ms`);
});
