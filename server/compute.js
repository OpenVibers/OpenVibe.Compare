'use strict';
/** Compute prices on OpenVibe.Compare: read once from OpenVibe.Exchange, normalized, never copied.
 *  Exchange publishes reviewed provider tariffs at GET /api/compute/prices; Compare adds only derived
 *  arithmetic (per month at 24/7 and per GPU GB-hour) and the page's filters, sorts and picks. */
const SOURCE = 'https://openvibe.exchange/api/compute/prices';
const PAGE = 'https://openvibe.exchange/compute';
const MONTH_HOURS = 730;
const DAY = 86400000;
const KINDS = ['gpu', 'cpu'];
const SORTS = ['hourly', 'gpu-hour', 'month'];

const text = (v) => (typeof v === 'string' ? v : '');
const positive = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
const nonNegative = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : null; };
const iso = (v) => {
    if (v == null || v === '') return null;
    const t = typeof v === 'number' ? v : Date.parse(String(v));
    return Number.isFinite(t) ? new Date(t).toISOString() : null;
};
const label = (kind) => (kind === 'gpu' ? 'GPU' : 'computer');

function offer(p, now) {
    if (!p || typeof p.id !== 'string' || !p.id) return null;
    const hourly = positive(p.hourly);
    const kind = KINDS.includes(p.kind) ? p.kind : null;
    const checked_at = iso(p.checked_at);
    const source = text(p.source);
    if (!hourly || !kind || !checked_at || !/^https:\/\//.test(source)) return null;
    const gpu_mb = kind === 'gpu' ? positive(p.gpu_mb) : null;
    const expires_at = iso(p.expires_at);
    const per_second = positive(p.per_second) || hourly / 3600;
    return {
        id: p.id,
        provider: text(p.provider) || 'unknown',
        region: text(p.region) || null,
        kind,
        cpu: nonNegative(p.cpu),
        ram_mb: positive(p.ram_mb),
        gpu: kind === 'gpu' ? text(p.gpu) || 'GPU' : null,
        gpu_mb,
        hourly,
        per_second,
        monthly_24_7: Math.round(hourly * MONTH_HOURS * 10000) / 10000,
        hourly_per_gpu_gb: gpu_mb ? Math.round(hourly / (gpu_mb / 1024) * 10000) / 10000 : null,
        billing_seconds: positive(p.billing_seconds),
        interruptible: Boolean(p.interruptible),
        promotion: text(p.promotion) || null,
        promotion_expires: iso(p.promotion_expires),
        checked_at,
        expires_at,
        expired: Boolean(expires_at && Date.parse(expires_at) < now),
        source,
    };
}

function buildCompute(feed, now = Date.now()) {
    if (!feed || !Array.isArray(feed.prices)) {
        return {
            source: SOURCE, page: PAGE, checked_at: null, checked_days_ago: null, retrieved_at: new Date(now).toISOString(),
            offers: [], cheapest: { gpu: null, cpu: null }, expired_count: 0,
            unavailable: 'OpenVibe.Exchange did not answer, so no compute price is shown as current.',
        };
    }
    const offers = feed.prices.map((p) => offer(p, now)).filter(Boolean)
        .sort((a, b) => a.hourly - b.hourly || a.provider.localeCompare(b.provider) || a.id.localeCompare(b.id));
    const checked_at = iso(feed.checked_at) || [...offers].map((o) => o.checked_at).sort().at(-1) || null;
    const cheapest = { gpu: null, cpu: null };
    // An offer past its review date is not marked cheapest: the badge means a current price.
    for (const pool of [offers.filter((o) => !o.expired), offers]) for (const o of pool) if (!cheapest[o.kind]) cheapest[o.kind] = o.id;
    for (const o of offers) o.cheapest = o.id === cheapest[o.kind];
    const expired = offers.filter((o) => o.expired);
    return {
        source: SOURCE, page: PAGE, checked_at,
        checked_days_ago: checked_at ? Math.max(0, Math.floor((now - Date.parse(checked_at)) / DAY)) : null,
        retrieved_at: new Date(now).toISOString(),
        offers, cheapest,
        expired_count: expired.length,
        expired_at: expired.length ? expired.map((o) => o.expires_at).sort()[0] : null,
    };
}

function parseQuery(query = {}) {
    const pick = [...new Set(text(query.pick).split(',').map((s) => s.trim()).filter(Boolean))].slice(0, 3);
    return {
        kind: KINDS.includes(text(query.kind)) ? text(query.kind) : '',
        gpu: text(query.gpu).slice(0, 80),
        region: text(query.region).slice(0, 80),
        interruptible: ['yes', 'no'].includes(text(query.interruptible)) ? text(query.interruptible) : '',
        sort: SORTS.includes(text(query.sort)) ? text(query.sort) : 'hourly',
        pick,
    };
}

function sortOffers(offers, sort) {
    const value = (o) => (sort === 'gpu-hour' ? o.hourly_per_gpu_gb : sort === 'month' ? o.monthly_24_7 : o.hourly);
    return [...offers].sort((a, b) => {
        const x = value(a), y = value(b);
        if (x == null && y == null) return a.hourly - b.hourly;
        if (x == null) return 1;
        if (y == null) return -1;
        return x - y || a.provider.localeCompare(b.provider) || a.id.localeCompare(b.id);
    });
}

/** What the page shows for one query: the filters, the sorted offers, and the picks that still exist. */
function select(compute, query = {}) {
    const q = parseQuery(query);
    const offers = (compute.offers || []).filter((o) =>
        (!q.kind || o.kind === q.kind) &&
        (!q.gpu || o.gpu === q.gpu) &&
        (!q.region || o.region === q.region) &&
        (!q.interruptible || o.interruptible === (q.interruptible === 'yes')));
    const picks = q.pick.map((id) => (compute.offers || []).find((o) => o.id === id)).filter(Boolean);
    return { q, offers: sortOffers(offers, q.sort), picks };
}

/** The query string without the defaults, so every link stays short and shareable. */
function queryString(q = {}) {
    const p = new URLSearchParams();
    if (q.kind) p.set('kind', q.kind);
    if (q.gpu) p.set('gpu', q.gpu);
    if (q.region) p.set('region', q.region);
    if (q.interruptible) p.set('interruptible', q.interruptible);
    if (q.sort && q.sort !== 'hourly') p.set('sort', q.sort);
    if (q.pick && q.pick.length) p.set('pick', q.pick.join(','));
    return p;
}
const href = (q, changes = {}) => { const s = queryString({ ...q, ...changes }).toString(); return `/compute${s ? `?${s}` : ''}`; };

function api(compute) {
    return {
        source: 'OpenVibe.Exchange',
        source_url: compute.source,
        page: compute.page,
        retrieved_at: compute.retrieved_at,
        checked_at: compute.checked_at,
        currency: 'USD',
        month_hours: MONTH_HOURS,
        offers: compute.offers,
        cheapest: compute.cheapest,
        expired_count: compute.expired_count,
        ...(compute.unavailable ? { unavailable: compute.unavailable } : {}),
    };
}

function createCompute({ fetchImpl = fetch, now = Date.now, ttl = 600000 } = {}) {
    let cached, expires = 0, pending;
    return async function get() {
        if (cached && now() < expires) return cached;
        if (pending) return pending;
        pending = (async () => {
            let feed = null;
            try {
                const r = await fetchImpl(SOURCE, { signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json' } });
                if (r.ok) feed = await r.json();
            } catch { feed = null; }
            // A failed feed is not cached into a value: the next request retries it.
            if (!feed) return buildCompute(null, now());
            cached = buildCompute(feed, now());
            expires = now() + ttl;
            return cached;
        })().finally(() => { pending = null; });
        return pending;
    };
}

module.exports = { SOURCE, PAGE, MONTH_HOURS, buildCompute, createCompute, parseQuery, select, sortOffers, queryString, href, api, label };
