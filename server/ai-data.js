'use strict';

// The AI pages' data: OpenVibe.Bench's boards (through openvibe-sdk/bench), the AI catalogue and Exchange
// market, and Report's measured model rows. Missing evidence is not zero: a source that does not answer
// leaves its part with a worded status and a dash, never a made-up value.
const { createAiCatalogue } = require('./ai-catalogue');
const { comparisonCatalogue } = require('./ai-market');
const { findCatalogModel, makerOf } = require('./ai-join');
const { createBenchClient, isKindId, isModelName, normaliseTab } = require('./ai-bench');
const { requestJson } = require('./ai-source');
const { measuredRows, measuredOf } = require('./data');

const TTL_MS = 120_000;
const PERF_URL = 'https://openvibe.report/api/v1/ai/performance?group=model&days=30';

const number = (v) => v == null || !Number.isFinite(Number(v)) ? null : Number(v);
const iso = (v) => v && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null;
const measuredAt = (perf) => iso(perf && perf.range && perf.range.to ? `${perf.range.to}T00:00:00.000Z` : null);

function measuredRow(feed, row, at) {
    if (!row) return null;
    const ttft = number(row.ttft_ms && row.ttft_ms.p50);
    const tps = number(row.tps && row.tps.p50);
    const success = number(row.success_rate);
    if (ttft == null && tps == null && success == null) return null;
    return { ttft, tps, success, calls: number(row.calls), as_of: at, source_url: PERF_URL };
}

function buildComparison({ kindsRead = null, boards = [], catalogue = null, perf = null, now = new Date().toISOString() } = {}) {
    const kinds = kindsRead && kindsRead.data && Array.isArray(kindsRead.data.kinds) ? kindsRead.data.kinds : [];
    const perfRows = measuredRows(perf);
    const perfAt = measuredAt(perf) || iso(now);
    const catModels = (catalogue && catalogue.models || []).map((model) => ({ ...model, offers: (model.offers || []).map((offer) => ({ ...offer, source: offer.source || { name: 'OpenVibe.AI', date: catalogue.generated_at || null, sample_size: offer.requests_7d != null ? offer.requests_7d : null } })) }));
    const findCat = (id) => findCatalogModel(catModels, id);
    const measuredFor = (id, offers = []) => {
        const row = measuredOf(perfRows, id, { provider_model: offers.map((o) => o.provider_model).find(Boolean) });
        if (row) return measuredRow(perf, row, perfAt);
        for (const offer of offers) {
            const match = measuredOf(perfRows, id, offer);
            if (match) return measuredRow(perf, match, perfAt);
        }
        return null;
    };
    const rows = [];
    for (let i = 0; i < boards.length; i += 1) {
        const board = boards[i];
        if (!kinds[i] || !board) continue;
        const list = board.data && board.data.board && Array.isArray(board.data.board.rows) ? board.data.board.rows : [];
        for (const entry of list) {
            const id = entry.subject || entry.model || entry.name;
            if (!id) continue;
            const cat = findCat(id);
            const offers = cat && Array.isArray(cat.offers) ? cat.offers : [];
            rows.push({ id, routed: cat ? cat.routed !== false : false, kind: kinds[i].id, model_kind: cat && cat.kind || 'chat', maker: makerOf(cat, id), weights: cat && (cat.weights || (cat.open_weights == null ? null : cat.open_weights ? 'open' : 'closed')), status: cat && cat.status || 'current', uncensored: Boolean(cat && cat.uncensored), community: Boolean(cat && cat.community), rating: { value: entry.elo == null || Number(entry.games) === 0 ? null : Number(entry.elo), interval: Number(entry.games) === 0 ? [null, null] : [entry.ci_lower == null ? null : entry.ci_lower, entry.ci_upper == null ? null : entry.ci_upper], source: 'OpenVibe.Bench', date: board.at || null, sample_size: entry.games == null ? null : entry.games }, benchmark: { value: entry.score == null ? null : Number(entry.score), reason: entry.score == null ? 'No benchmark score.' : undefined }, provider_offers: offers, measured: measuredFor(id, offers), source: { name: 'OpenVibe.Bench', date: board.at || null, sample_size: entry.games == null ? null : entry.games } });
        }
    }
    const grouped = new Map();
    for (const row of rows) {
        const existing = grouped.get(row.id);
        if (existing) existing.task_ratings.push({ kind: row.kind, rating: row.rating, benchmark: row.benchmark });
        else grouped.set(row.id, { ...row, task_ratings: [{ kind: row.kind, rating: row.rating, benchmark: row.benchmark }] });
    }
    rows.length = 0;
    rows.push(...grouped.values());
    // Every model the Exchange sells is listed with its prices: a model without Bench games yet shows as
    // not rated, never as missing.
    const ratedCats = new Set(rows.map((row) => findCat(row.id)).filter(Boolean));
    for (const cat of catModels) {
        if (ratedCats.has(cat)) continue;
        const id = cat.slug || cat.canonical || cat.id;
        if (!id) continue;
        const offers = Array.isArray(cat.offers) ? cat.offers : [];
        rows.push({ id, routed: cat.routed !== false, kind: cat.kind || null, model_kind: cat.kind || 'chat', maker: makerOf(cat, id), weights: cat.weights || (cat.open_weights == null ? null : cat.open_weights ? 'open' : 'closed'), status: cat.status || 'current', uncensored: Boolean(cat.uncensored), community: Boolean(cat.community), rating: { value: null, interval: [null, null], source: 'OpenVibe.Bench', date: null, sample_size: 0 }, benchmark: { value: null, reason: 'Not rated yet.' }, provider_offers: offers, measured: measuredFor(id, offers), source: { name: 'OpenVibe.AI', date: catalogue.generated_at || null, sample_size: null }, task_ratings: [], unrated: true });
    }
    for (const kind of kinds) {
        const ranked = rows.map((row) => ({ row, task: row.task_ratings.find((rating) => rating.kind === kind.id) })).filter((x) => x.task).sort((a, b) => (b.task.rating.value == null ? -Infinity : b.task.rating.value) - (a.task.rating.value == null ? -Infinity : a.task.rating.value));
        ranked.forEach(({ task }, i) => {
            const [lo, hi] = task.rating.interval || [];
            if (lo == null || hi == null) return;
            const overlap = ranked.map((other, j) => ({ other, rank: j + 1 })).filter(({ other }) => other.task.rating.interval && other.task.rating.interval[0] != null && other.task.rating.interval[1] != null && other.task.rating.interval[0] <= hi && other.task.rating.interval[1] >= lo).map(({ rank }) => rank);
            task.rank = overlap.length ? { min: Math.min(...overlap), max: Math.max(...overlap), position: i + 1 } : null;
        });
    }
    const outPrice = (r) => Math.min(...(r.provider_offers || []).map((o) => o.price && o.price.out != null ? Number(o.price.out) : NaN).filter(Number.isFinite), Infinity);
    rows.sort((a, b) => (b.rating.value == null ? -Infinity : b.rating.value) - (a.rating.value == null ? -Infinity : a.rating.value)
        || (b.routed === true) - (a.routed === true)
        || outPrice(a) - outPrice(b)
        || String(a.id).localeCompare(String(b.id)));
    rows.forEach((row, i) => {
        const [lo, hi] = row.rating.interval || [];
        if (lo == null || hi == null) row.rank = null;
        else {
            const overlap = rows.map((other, j) => ({ other, rank: j + 1 })).filter(({ other }) => other.rating.interval && other.rating.interval[0] != null && other.rating.interval[1] != null && other.rating.interval[0] <= hi && other.rating.interval[1] >= lo).map(({ rank }) => rank);
            row.rank = overlap.length ? { min: Math.min(...overlap), max: Math.max(...overlap), position: i + 1 } : null;
        }
    });
    const tasks = kinds.map((kind) => ({ id: kind.id, name: kind.name }));
    const catOffers = catModels.flatMap((m) => (m.offers || []).map((o) => ({ ...o, routed: o.routed !== false, model: m.slug })));
    const stale = [kindsRead, ...boards].filter((r) => r && r.stale).map((r) => r.at).filter(Boolean).sort()[0] || null;
    const availability = [];
    if (!kinds.length) availability.push({ id: 'bench', text: 'OpenVibe.Bench is unavailable; ratings show as not rated.' });
    if (!catalogue) availability.push({ id: 'catalogue', text: "The AI catalogue and Exchange market are unavailable; only Bench's ratings are listed." });
    else if (catalogue.stale) availability.push({ id: 'market', text: 'The Exchange market is unavailable; showing the last good copy.' });
    if (!perf) availability.push({ id: 'perf', text: "OpenVibe.Report's measured AI performance is unavailable; the measured columns show a dash." });
    const dates = rows.map((r) => r.source && r.source.date).filter(iso).concat([perfAt, catalogue && catalogue.generated_at].filter(iso));
    return { rows, providers: catOffers, tasks, catalogue, availability, stale, measured_at: perfAt, updated_at: dates.sort().at(-1) || iso(now) };
}

function createAi({ fetchImpl = globalThis.fetch, log = console, now = () => new Date().toISOString(), ttl = TTL_MS, bench = null, catalogue = null } = {}) {
    const clock = typeof now === 'function' ? now : () => new Date().toISOString();
    const benchClient = bench || createBenchClient({ fetchImpl, log, now: () => Date.parse(clock()) || Date.now() });
    const catClient = catalogue || createAiCatalogue({ fetchImpl, log, now: () => Date.parse(clock()) || Date.now() });
    let cached = null;
    let expires = 0;
    let pending = null;

    async function comparison() {
        const at = clock();
        if (cached && Date.parse(at) < expires) return cached;
        if (pending) return pending;
        pending = (async () => {
            const [kindsRead, cat, perf] = await Promise.all([
                benchClient.kinds(),
                comparisonCatalogue(catClient),
                requestJson(PERF_URL, { fetchImpl, log, label: 'Report AI performance', timeoutMs: 3000 }),
            ]);
            const kinds = kindsRead && kindsRead.data && Array.isArray(kindsRead.data.kinds) ? kindsRead.data.kinds : [];
            const boards = await Promise.all(kinds.map((kind) => benchClient.board(kind.id, 'elo')));
            const data = buildComparison({ kindsRead, boards, catalogue: cat, perf, now: at });
            cached = data;
            expires = Date.parse(at) + ttl;
            return data;
        })().finally(() => { pending = null; });
        return pending;
    }

    const readRows = (read) => read && read.data && read.data.board && Array.isArray(read.data.board.rows) ? read.data.board.rows : [];

    async function kindBoard(kindId, tab) {
        if (!benchClient.isKindId(kindId)) return null;
        const [kinds, board, cost, benchmarks, runs, overview] = await Promise.all([
            benchClient.kinds(),
            benchClient.board(kindId, tab),
            tab === 'pareto' ? benchClient.board(kindId, 'cost') : Promise.resolve(null),
            benchClient.benchmarks(),
            benchClient.runs({ kind: kindId, limit: 8 }),
            benchClient.overview(),
        ]);
        const kind = kinds && kinds.data && Array.isArray(kinds.data.kinds) ? kinds.data.kinds.find((k) => k.id === kindId) : null;
        if (kinds && !kind) return null;
        const kindBenchmarks = benchmarks && benchmarks.data && Array.isArray(benchmarks.data.benchmarks)
            ? benchmarks.data.benchmarks.filter((b) => b.kind === kindId) : [];
        const rankings = await Promise.all(kindBenchmarks.map((b) => benchClient.rankings(b.id, 'score')));
        return { kindId, kind, tab, board, cost, kinds, benchmarks, rankings, runs, overview, stale: [kinds, board, cost, benchmarks, runs, overview].filter((r) => r && r.stale).map((r) => r.at).filter(Boolean).sort()[0] || null };
    }

    async function benchmarkPage(benchmarkId) {
        if (!benchClient.isBenchmarkId(benchmarkId)) return null;
        const [benchmark, rankings, runs, overview] = await Promise.all([
            benchClient.benchmark(benchmarkId), benchClient.rankings(benchmarkId, 'score'), benchClient.runs({ benchmark: benchmarkId, limit: 20 }), benchClient.overview(),
        ]);
        const list = overview && overview.data && Array.isArray(overview.data.list) ? overview.data.list : null;
        if (list && !list.some((b) => b.id === benchmarkId)) return null;
        return { benchmarkId, benchmark, rankings, runs, overview, stale: [benchmark, rankings, runs, overview].filter((r) => r && r.stale).map((r) => r.at).filter(Boolean).sort()[0] || null };
    }

    async function method() {
        const [overview, kinds] = await Promise.all([benchClient.overview(), benchClient.kinds()]);
        return { overview, kinds, stale: [overview, kinds].filter((r) => r && r.stale).map((r) => r.at).filter(Boolean).sort()[0] || null };
    }

    async function feed() {
        const [runs, overview] = await Promise.all([benchClient.runs({ limit: 20 }), benchClient.overview()]);
        return { runs, overview };
    }

    async function modelPage(id) {
        if (!benchClient.isModelName(id)) return null;
        const [data, detail] = await Promise.all([comparison(), benchClient.modelDetail(id)]);
        const row = data.rows.find((x) => x.id === id) || null;
        return { id, detail, row, providers: data.providers, availability: data.availability, sourceDate: detail && detail.at, stale: detail && detail.stale ? detail.at : null };
    }

    async function compare(models = []) {
        const data = await comparison();
        return { models: models.map((id) => data.rows.find((x) => x.id === id) || { id, reason: 'No public model data.' }), options: data.rows.map((x) => x.id), availability: data.availability, stale: data.stale, measured_at: data.measured_at };
    }

    async function leaderboard(query = {}) {
        const data = await comparison();
        const nz = (x) => x == null || x === '' ? NaN : Number(x);
        let rows = data.rows;
        if (query.kind) rows = rows.map((x) => {
            const task = x.task_ratings.find((rating) => rating.kind === query.kind);
            return task ? { ...x, kind: query.kind, rating: task.rating, benchmark: task.benchmark } : x.kind === query.kind ? x : null;
        }).filter(Boolean);
        const type = ['chat', 'embedding', 'stt', 'all'].includes(query.type) ? query.type : 'chat';
        if (type !== 'all') rows = rows.filter((x) => (x.model_kind || 'chat') === type);
        if (query.maker) rows = rows.filter((x) => String(x.maker || '').toLowerCase() === String(query.maker).toLowerCase());
        if (query.weights) rows = rows.filter((x) => x.weights === query.weights || (query.weights === 'open' && x.weights === 'open_weights'));
        if (query.status !== 'all') rows = rows.filter((x) => x.status === (query.status || 'current'));
        if (query.uncensored) rows = rows.filter((x) => x.uncensored);
        if (query.community) rows = rows.filter((x) => x.community);
        if (query.price) rows = rows.filter((x) => x.provider_offers.some((o) => {
            const p = nz(o.price && o.price.out);
            return query.price === 'free' ? (o.free === true || o.free_now === true || p === 0) : !Number.isFinite(p) ? false : query.price === 'low' ? p <= 1 : query.price === 'mid' ? p > 1 && p <= 10 : query.price === 'high' ? p > 10 : true;
        }));
        if (query.q) rows = rows.filter((x) => `${x.id} ${x.maker || ''}`.toLowerCase().includes(String(query.q).toLowerCase()));
        if (query.sort === 'name') rows.sort((a, b) => String(a.id).localeCompare(String(b.id)));
        if (query.sort === 'price') rows.sort((a, b) => Math.min(...a.provider_offers.map((o) => nz(o.price && o.price.out)).filter(Number.isFinite), Infinity) - Math.min(...b.provider_offers.map((o) => nz(o.price && o.price.out)).filter(Number.isFinite), Infinity));
        if (query.sort === 'speed') rows.sort((a, b) => Math.min(...a.provider_offers.filter((o) => Number(o.requests_7d) > 0).map((o) => nz(o.speed && o.speed.p50_ms)).filter(Number.isFinite), Infinity) - Math.min(...b.provider_offers.filter((o) => Number(o.requests_7d) > 0).map((o) => nz(o.speed && o.speed.p50_ms)).filter(Number.isFinite), Infinity));
        if (query.sort === 'rating') rows.sort((a, b) => (b.rating.value == null ? -Infinity : b.rating.value) - (a.rating.value == null ? -Infinity : a.rating.value));
        return { rows, filters: query, availability: data.availability, stale: data.stale, measured_at: data.measured_at };
    }

    return {
        comparison, kindBoard, benchmarkPage, method, feed, modelPage, compare, leaderboard,
        bench: benchClient, catalogue: catClient, readRows, ttlMs: ttl,
        isKindId: benchClient.isKindId, isBenchmarkId: benchClient.isBenchmarkId, isModelName: benchClient.isModelName, normaliseTab: benchClient.normaliseTab,
    };
}

module.exports = { createAi, buildComparison, measuredRow, TTL_MS, PERF_URL };
