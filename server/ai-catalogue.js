'use strict';

// OpenVibe.AI's public catalogue and Exchange market, read the way Report reads them: the catalogue names a
// model and its providers; the market adds the own-page prices and the measured traffic. Both are held two
// minutes; a market read that answers once keeps its last good copy (marked stale) while Exchange is down.
const { requestJson, trim, TIMEOUT_MS } = require('./ai-source');

const TTL_MS = 120_000;
// A failed market read is tried again after this, not after the full TTL: one timeout while the AI service restarted
// (the 11-14 pin round) left /ai with no models for minutes. The last good copy serves meanwhile, marked stale.
const RETRY_MS = 15_000;

function createAiCatalogue({ config = {}, fetchImpl = globalThis.fetch, log = console, now = () => Date.now(), timeoutMs = TIMEOUT_MS } = {}) {
    // OV_AI_INTERNAL_URL: OpenVibe.AI on this host (production: http://127.0.0.1:4700), as Bench is read over loopback.
    // Through the edge, a boot's paged market reads met the public API's rate limit (HTTP 429, 11-14).
    const baseUrl = trim(config.aiUrl || process.env.OV_AI_INTERNAL_URL || 'https://api.openvibe.exchange');
    let hit = null;
    let pending = null;

    async function catalog() {
        if (hit && hit.expires > now()) return hit.value;
        if (!pending) pending = (async () => {
            const data = await requestJson(`${baseUrl}/api/v1/exchange/catalog`, { fetchImpl, log, label: 'ai exchange catalog', timeoutMs });
            if (data && Array.isArray(data.models)) hit = { value: data, expires: now() + TTL_MS };
            pending = null;
            return data && Array.isArray(data.models) ? data : null;
        })();
        return pending;
    }

    let marketHit = null;
    let marketPending = null;

    async function market() {
        if (marketHit && marketHit.expires > now()) return marketHit.value;
        if (!marketPending) marketPending = (async () => {
            const offers = [];
            const seen = new Set();
            let cursor = null;
            let first = null;
            do {
                const suffix = cursor == null ? '' : `&cursor=${encodeURIComponent(cursor)}`;
                const data = await requestJson(`${baseUrl}/api/v1/exchange/market?limit=500${suffix}`, { fetchImpl, log, label: 'ai exchange market', timeoutMs });
                if (!data || !Array.isArray(data.offers) || !('next_cursor' in data) || (data.next_cursor != null && typeof data.next_cursor !== 'string') || (first && first.generated_at !== data.generated_at) || seen.has(data.next_cursor) || seen.size > 1000) {
                    // Only a real last good copy is served stale: after two failures in a row the old code spread null
                    // into { stale: true }, a "market" with no offers.
                    const value = marketHit && marketHit.value ? { ...marketHit.value, stale: true } : null;
                    marketHit = { value, expires: now() + RETRY_MS };
                    return value;
                }
                first ||= data;
                offers.push(...data.offers);
                cursor = data.next_cursor;
                if (cursor != null) seen.add(cursor);
            } while (cursor != null);
            const value = { ...first, offers, next_cursor: null, stale: false };
            marketHit = { value, expires: now() + TTL_MS };
            return value;
        })().finally(() => { marketPending = null; });
        return marketPending;
    }

    return { catalog, market, baseUrl, ttlMs: TTL_MS };
}

module.exports = { createAiCatalogue, TTL_MS, RETRY_MS };
