'use strict';

/**
 * OpenVibe.Bench's public reads, as Report reads them and through openvibe-sdk/bench:
 *   GET /api/v1/kinds                        every benchmark kind
 *   GET /api/v1/boards/:kind?type=elo|pareto|cost
 *   GET /api/v1/models/:model(/summary)      one model across every kind
 *   GET /api/v1/benchmarks[/:id]             public benchmarks and their definitions
 *   GET /api/v1/rankings?benchmark=&metric=  verified per-model medians
 *   GET /api/v1/runs?benchmark=&model=&kind= public runs newest first
 *   GET /api/v1/overview                     public counts and the newest runs
 *
 * Reads are public and held for sixty seconds; a read that answered once keeps its last good copy while
 * Bench is down, marked stale with the moment it was read. A read that never answered is null.
 */
const { trim, requestJson, TIMEOUT_MS } = require('./ai-source');
const { createClient } = require('openvibe-sdk/core');
const { createBenchClient: createSdkBench } = require('openvibe-sdk/bench');

const TTL_MS = 60_000;
const KIND_RE = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const BENCHMARK_RE = /^bmk_[0-9A-HJKMNP-TV-Z]{26}$/;
const MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._:+\/~\-]{0,119}$/;
const BOARD_TYPES = Object.freeze(['elo', 'pareto', 'cost']);
const METRICS = Object.freeze(['score', 'value', 'speed', 'consistency', 'horizon']);
const FACTOR_KINDS = Object.freeze(['chat', 'code', 'design', 'image', 'speech', 'search', 'computer', 'game']);
const FACTOR_DAYS = Object.freeze([7, 30, 90, 365]);

const isKindId = (value) => typeof value === 'string' && KIND_RE.test(value);
const isBenchmarkId = (value) => typeof value === 'string' && BENCHMARK_RE.test(value);
const isModelName = (value) => typeof value === 'string' && MODEL_RE.test(value);

function normaliseFactorKind(value) {
    const raw = Array.isArray(value) ? value[0] : value;
    return FACTOR_KINDS.includes(raw) ? raw : 'code';
}

function normaliseFactorDays(value) {
    const n = Number(Array.isArray(value) ? value[0] : value);
    return FACTOR_DAYS.includes(n) ? n : 90;
}

function normaliseMetric(value) {
    const raw = Array.isArray(value) ? value[0] : value;
    return METRICS.includes(raw) ? raw : 'score';
}

function normaliseLimit(value) {
    const n = parseInt(Array.isArray(value) ? value[0] : value, 10);
    return Number.isFinite(n) ? Math.min(100, Math.max(1, n)) : 20;
}

function normaliseTab(value) {
    const raw = Array.isArray(value) ? value[0] : value;
    return BOARD_TYPES.includes(raw) ? raw : 'elo';
}

function createBenchClient({ config = {}, fetchImpl = globalThis.fetch, log = console, now = () => Date.now(), timeoutMs = TIMEOUT_MS } = {}) {
    const baseUrl = trim(config.benchUrl || 'https://bench.openvibe.services');
    const clock = typeof now === 'function' ? now : () => Date.now();
    const shared = createSdkBench(createClient({ fetch: fetchImpl, retries: 0 }), { baseUrl });

    const boards = new Map();
    const models = new Map();
    const catalog = new Map();
    const results = new Map();

    function keep(store, key, data, cap) {
        store.set(key, data);
        while (store.size > cap) store.delete(store.keys().next().value);
    }

    async function read(store, key, path, label, cap, loader = null) {
        const atMs = clock();
        const hit = store.get(key);
        if (hit && hit.atMs + TTL_MS > atMs) return { data: hit.data, at: hit.at, stale: false };
        if (hit && hit.retryAtMs > atMs) return { data: hit.data, at: hit.at, stale: true };
        let data = null;
        if (loader) {
            try { data = await loader(); }
            catch (err) { log.warn(`[OpenVibe.Compare] ${label} unavailable: ${String(err && err.message || err).slice(0, 160)}`); }
        } else data = await requestJson(`${baseUrl}${path}`, { fetchImpl, log, timeoutMs, label });
        if (data === null) {
            if (hit) hit.retryAtMs = atMs + TTL_MS;
            return hit ? { data: hit.data, at: hit.at, stale: true } : null;
        }
        const entry = { data, atMs, at: new Date(atMs).toISOString() };
        keep(store, key, entry, cap);
        return { data, at: entry.at, stale: false };
    }

    function kinds() {
        return read(boards, 'kinds', '/api/v1/kinds', 'bench kinds', 500);
    }

    async function board(kindId, type = 'elo') {
        if (!isKindId(kindId) || !BOARD_TYPES.includes(type)) return null;
        return read(
            boards,
            `board:${kindId}:${type}`,
            `/api/v1/boards/${encodeURIComponent(kindId)}?type=${type}`,
            `bench board (${kindId}, ${type})`,
            500,
            type === 'elo' ? async () => {
                const data = await shared.ratings.get(kindId, { signal: AbortSignal.timeout(timeoutMs) });
                return { ...data, board: { ...data.board, rows: (data.board && data.board.rows || []).filter((row) => row.games >= 20) } };
            } : null,
        );
    }

    async function modelSummary(model) {
        if (!isModelName(model)) return null;
        return read(models, `model:${model}`, `/api/v1/models/${encodeURIComponent(model)}`, `bench model (${model})`, 200);
    }

    function benchmarks() {
        return read(catalog, 'benchmarks', '/api/v1/benchmarks?limit=200', 'bench benchmarks', 100);
    }

    async function benchmark(id) {
        if (!isBenchmarkId(id)) return null;
        return read(catalog, `benchmark:${id}`, `/api/v1/benchmarks/${encodeURIComponent(id)}`, `bench benchmark (${id})`, 500);
    }

    function overview() {
        return read(catalog, 'overview', '/api/v1/overview', 'bench overview', 20);
    }

    async function rankings(benchmarkId, metric = 'score') {
        if (!isBenchmarkId(benchmarkId) || !METRICS.includes(metric)) return null;
        return read(results, `rankings:${benchmarkId}:${metric}`, `/api/v1/rankings?benchmark=${encodeURIComponent(benchmarkId)}&metric=${metric}`, `bench rankings (${benchmarkId}, ${metric})`, 500);
    }

    async function runs({ benchmark = null, model = null, kind = null, limit = 20 } = {}) {
        if (benchmark != null && !isBenchmarkId(benchmark)) return null;
        if (model != null && !isModelName(model)) return null;
        if (kind != null && !isKindId(kind)) return null;
        const params = new URLSearchParams();
        if (benchmark) params.set('benchmark', benchmark);
        if (model) params.set('model', model);
        if (kind) params.set('kind', kind);
        params.set('limit', String(normaliseLimit(limit)));
        const query = params.toString();
        return read(results, `runs:${query}`, `/api/v1/runs?${query}`, `bench runs (${query})`, 500);
    }

    async function modelDetail(model) {
        if (!isModelName(model)) return null;
        return read(models, `detail:${model}`, `/api/v1/models/${encodeURIComponent(model)}/summary`, `bench model detail (${model})`, 200);
    }

    // Model and harness apart (bench.rating@1 1.1.0 factors): one fit per task kind, category and window.
    async function factors({ taskKind = 'code', category = null, days = 90 } = {}) {
        const kind = normaliseFactorKind(taskKind);
        const span = normaliseFactorDays(days);
        const cat = category ? String(category).slice(0, 64) : null;
        const params = new URLSearchParams({ task_kind: kind, days: String(span) });
        if (cat) params.set('category', cat);
        const query = params.toString();
        return read(results, `factors:${query}`, `/api/v1/factors?${query}`, `bench factors (${query})`, 500);
    }

    return {
        kinds, board, modelSummary, benchmarks, benchmark, overview, rankings, runs, modelDetail, factors,
        baseUrl, ttlMs: TTL_MS, isKindId, isBenchmarkId, isModelName, normaliseTab, normaliseMetric, normaliseLimit,
        normaliseFactorKind, normaliseFactorDays,
    };
}

module.exports = {
    createBenchClient, TTL_MS, BOARD_TYPES, METRICS, FACTOR_KINDS, FACTOR_DAYS,
    isKindId, isBenchmarkId, isModelName, normaliseTab, normaliseMetric, normaliseLimit, normaliseFactorKind, normaliseFactorDays,
};
