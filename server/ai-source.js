'use strict';

// The AI pages read public feeds only. One short failure log line, Compare's 8 s timeout and a
// parameter rule: a source that cannot answer is null, never an exception the page has to catch.
const TIMEOUT_MS = 8_000;

const trim = (s) => String(s || '').replace(/\/+$/, '');

function reasonOf(err) {
    if (!err) return 'no response';
    if (err.name === 'TimeoutError' || err.name === 'AbortError') return 'timeout';
    return String(err.message || err).replace(/\s+/g, ' ').slice(0, 160);
}

function warn(log, message) {
    const line = `[OpenVibe.Compare] ${String(message).replace(/\s+/g, ' ').slice(0, 240)}`;
    try {
        const fn = (log && (log.warn || log.error)) || console.warn;
        fn.call(log || console, line);
    } catch {
        /* logging must never fail the page */
    }
}

async function requestJson(url, { fetchImpl = globalThis.fetch, log = console, label = 'source', timeoutMs = TIMEOUT_MS } = {}) {
    let res;
    try {
        const signal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
            ? AbortSignal.timeout(timeoutMs)
            : undefined;
        res = await fetchImpl(url, { headers: { Accept: 'application/json' }, signal });
    } catch (err) {
        warn(log, `${label} failed: ${reasonOf(err)}`);
        return null;
    }
    if (!res || !res.ok) {
        if (!res || res.status !== 404) warn(log, `${label} failed: HTTP ${res ? res.status : 'no response'}`);
        return null;
    }
    try {
        return await res.json();
    } catch (err) {
        warn(log, `${label} failed: ${reasonOf(err)}`);
        return null;
    }
}

module.exports = { TIMEOUT_MS, trim, warn, reasonOf, requestJson };
