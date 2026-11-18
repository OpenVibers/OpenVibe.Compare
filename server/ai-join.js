'use strict';

// Bench names a model as its maker's API does ("gpt-5-nano-2025-08-07"); the Exchange catalogue names it by
// maker and family ("openai/gpt-5-nano"). They are the same model when the names agree once the maker prefix
// and a date or channel suffix are dropped. Used by the AI pages so both sides join the same way.
const bare = (v) => String(v || '').toLowerCase()
    .replace(/^[^/]+\//, '')
    .replace(/[-_@:](\d{4}-?\d{2}-?\d{2}|latest|free)$/, '');

function findCatalogModel(models, id) {
    const list = Array.isArray(models) ? models : [];
    return list.find((m) => [m.slug, m.canonical, m.id].includes(id))
        || list.find((m) => [m.slug, m.canonical, m.name, ...(m.offers || []).map((o) => o.model)].some((v) => v && bare(v) === bare(id)))
        || null;
}

/**
 * findCatalogModel for many lookups over one catalogue (11-18: Compare's event loop stalled about 1 s every two minutes,
 * 18% of the time over 0.5 s: each refresh ran the bare-name pass over every model and offer for every Bench row,
 * 1.7 s for 600 rows over 2,000 models). The same answers: an exact slug, canonical or id first, else a bare name of the
 * slug, canonical, name or an offer's model; the first model in catalogue order wins either way.
 */
function catalogIndex(models) {
    const list = Array.isArray(models) ? models : [];
    const exact = new Map();
    const loose = new Map();
    for (const m of list) {
        if (!m) continue;
        for (const v of [m.slug, m.canonical, m.id]) if (v != null && !exact.has(v)) exact.set(v, m);
        for (const v of [m.slug, m.canonical, m.name, ...(m.offers || []).map((o) => o && o.model)]) {
            if (!v) continue;
            const k = bare(v);
            if (!loose.has(k)) loose.set(k, m);
        }
    }
    // An empty or missing id keeps the old scan's answer (it can match a model whose name is missing).
    return (id) => (id == null || id === '' ? findCatalogModel(list.filter(Boolean), id) : exact.get(id) || loose.get(bare(id)) || null);
}

// The maker: the catalogue's own, else the prefix of the catalogue's name, else the prefix of Bench's name.
function makerOf(cat, id) {
    if (cat && cat.maker) return cat.maker;
    const named = String(cat && (cat.canonical || cat.slug) || id || '');
    return named.includes('/') ? named.split('/')[0] : null;
}

module.exports = { bare, findCatalogModel, catalogIndex, makerOf };
