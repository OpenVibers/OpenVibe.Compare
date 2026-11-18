'use strict';

// The AI catalogue and Exchange market joined into the rows the AI pages show. The first offer supplies the
// displayed prices: lowest known own-page output price, then input price. Unknown prices sort last; never turn
// null into a free price.
const { bare, catalogIndex } = require('./ai-join');

const sameEndpoint = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
const amount = (v) => v == null || !Number.isFinite(Number(v)) ? Infinity : Number(v);

function mergeMarket(catalogue, market) {
    if (!market || !Array.isArray(market.offers)) return catalogue;
    const models = new Map();
    const findCat = catalogIndex(catalogue && catalogue.models);
    for (const offer of market.offers) {
        const key = bare(offer.model);
        const cat = findCat(offer.model);
        let model = models.get(key);
        if (!model) {
            model = { ...cat, slug: cat && cat.slug || offer.model, canonical: cat && cat.canonical || offer.model,
                name: offer.name, kind: offer.kind, maker: offer.maker, open_weights: offer.open_weights,
                context: offer.context, max_output: offer.max_output, licence: offer.licence,
                field_sources: offer.field_sources, routed: false, uncensored: false, offers: [] };
            models.set(key, model);
        }
        const measured = offer.routed && cat && cat.offers && cat.offers.find((o) => o.provider === offer.provider && sameEndpoint(o.model, offer.provider_model));
        model.offers.push({ ...(measured || {}), ...offer, model: offer.provider_model, license: offer.licence,
            source: { name: 'Provider price page', url: offer.price_source, date: offer.price_checked_at, sample_size: measured && measured.requests_7d != null ? measured.requests_7d : null } });
        model.routed ||= offer.routed;
        model.uncensored ||= offer.uncensored;
    }
    // Routed models with no own-page pricebook entry still remain discoverable.
    for (const cat of catalogue && catalogue.models || []) {
        const key = bare(cat.slug || cat.canonical);
        const model = models.get(key);
        if (!model) {
            models.set(key, { ...cat, routed: true, offers: (cat.offers || []).map((o) => ({ ...o, routed: true })) });
            continue;
        }
        for (const offer of cat.offers || []) {
            model.routed = true;
            const matched = model.offers.find((o) => o.provider === offer.provider && sameEndpoint(o.model, offer.model));
            if (matched) { Object.assign(matched, { ...offer, ...matched, routed: true }); continue; }
            // A routed endpoint may not have a pricebook observation yet. Keep its measurements,
            // but only a sourced page price may compete with the market's advertised prices.
            model.offers.push({ ...offer, routed: true,
                price: /^https:\/\//.test(offer.price_source || '') ? offer.price : null,
                source: offer.source || { name: 'OpenVibe.AI', date: catalogue.generated_at || null, sample_size: offer.requests_7d != null ? offer.requests_7d : null } });
        }
    }
    for (const model of models.values()) model.offers.sort((a, b) => amount(a.price && a.price.out) - amount(b.price && b.price.out) || amount(a.price && a.price.in) - amount(b.price && b.price.in));
    return { ...catalogue, generated_at: market.generated_at, metadata: market.metadata, stale: market.stale || false, models: [...models.values()] };
}

// The last merge, kept while the catalogue and the market are the ones it was made from (11-18 profile: mergeMarket was
// 68 of a 581 ms stall's samples, redone every two minutes over unchanged data).
let lastMerge = null;
const mergeKey = (catalogue, market) => [catalogue && catalogue.generated_at, catalogue && Array.isArray(catalogue.models) ? catalogue.models.length : -1,
    market && market.generated_at, market && Array.isArray(market.offers) ? market.offers.length : -1, market && market.stale ? 1 : 0].join('|');

async function comparisonCatalogue(client) {
    if (!client) return null;
    const [catalogue, market] = await Promise.all([client.catalog(), client.market && client.market()]);
    // Only a market that says when it was made can be matched; without generated_at every read is merged afresh.
    const key = market && market.generated_at && catalogue && catalogue.generated_at ? mergeKey(catalogue, market) : null;
    if (key && lastMerge && lastMerge.key === key) return lastMerge.value;
    const value = mergeMarket(catalogue, market);
    lastMerge = key ? { key, value } : null;
    return value;
}

module.exports = { mergeMarket, comparisonCatalogue };
