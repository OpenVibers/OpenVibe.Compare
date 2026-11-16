'use strict';

/**
 * The ways to work a task, compared (the owner, 11-16: "use an agent or harness or model system or a decisions API or swap
 * between and benchmark the different ways"): OpenVibe.Actor's leaderboard of its engines (Actor's agent on a model, one
 * model, the Decisions API, a coding harness, OpenAI's agent, the open model), read from its public
 * GET /api/v1/engines/leaderboard. Every side of a comparison on openvibe.actor/compare is graded on one rubric (0 wrong
 * to 4 excellent) by OpenVibe.AI's Decisions API; this page shows the totals. Held for sixty seconds; a read that answered
 * once keeps its last good copy while Actor is away, marked stale.
 */
const { trim, requestJson } = require('./ai-source');

const TTL_MS = 60_000;

function createWays({ fetchImpl = globalThis.fetch, base = process.env.COMPARE_ACTOR_URL || 'https://openvibe.actor', log = console, now = () => Date.now() } = {}) {
    const url = `${trim(base)}/api/v1/engines/leaderboard`;
    let last = null;   // { at, engines }
    async function board() {
        if (last && now() - last.at < TTL_MS) return { engines: last.engines, read_at: new Date(last.at).toISOString(), stale: false };
        const j = await requestJson(url, { fetchImpl, log, label: 'Actor ways' });
        if (j && Array.isArray(j.engines)) {
            last = { at: now(), engines: j.engines.slice(0, 50) };
            return { engines: last.engines, read_at: new Date(last.at).toISOString(), stale: false };
        }
        if (last) return { engines: last.engines, read_at: new Date(last.at).toISOString(), stale: true };
        return { engines: null, read_at: null, stale: false };
    }
    return { board, url };
}

module.exports = { createWays };
