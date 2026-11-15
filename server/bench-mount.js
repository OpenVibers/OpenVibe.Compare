'use strict';
/**
 * Bench inside Compare (plan §X step 2b, 11-13). Bench's code lives in server/bench (its history kept by git subtree);
 * Compare's process mounts Bench's Express app (its API, MCP, battles, imports, render routes) behind Compare's own
 * routes and runs Bench's background work, against Bench's SAME database with Bench's own role: nothing is copied.
 *
 * Bench is mounted only when BENCH_ENV_FILE names Bench's env file (production: /etc/openvibe/bench.env). That file is
 * parsed on its own, never merged into Compare's process.env, so Bench's DATABASE_URL, PORT and OAuth client do not
 * collide with Compare's. Without it Compare serves its own pages as before.
 *
 *   mountBench({ env, store, log }) → null | { app, host, hosts, ctx, port, listenOwn(), start({ port }), stop() }
 *   host: Bench's own hostname; hosts: it and Bench's render origin (OV_RENDER_ORIGIN, else bench-render.openvibe.services)
 *   port: Bench's own loopback port (BENCH_PORT, else the PORT in Bench's env file, else 5230: its manifest's
 *   internalOrigin); listenOwn() serves Bench's app alone there, so Network's status page and anything that calls Bench
 *   over loopback reach Bench's own /api/health and /api/ready (11-15: /status said Bench was down, because it probed
 *   127.0.0.1:5230 and nothing listened there since the cutover).
 */
const fs = require('node:fs');

const hostOf = (url) => { try { return new URL(url).hostname.toLowerCase(); } catch { return null; } };

async function mountBench({ env = process.env, store = null, log = console, benchEnv = null } = {}) {
    let own = benchEnv;
    if (!own) {
        const file = env.BENCH_ENV_FILE;
        if (!file) return null;
        own = require('dotenv').parse(fs.readFileSync(file));
    }
    // Bench answers as part of Compare: its own NODE_ENV unless the file says. Its PORT is its loopback address only.
    const port = Number(env.BENCH_PORT || own.PORT) || 5230;
    own = { NODE_ENV: env.NODE_ENV || 'production', ...own };
    const config = require('./bench/server/config').load(own);
    const { createApp } = require('./bench/server/app');
    const built = await createApp({ config, env: own, ...(store ? { store } : {}), log });
    const bench = require('./bench/server/index');
    let extra = [];
    let ownServer = null;
    return {
        app: built.app,
        host: hostOf(config.baseUrl),
        hosts: [hostOf(config.baseUrl), hostOf(env.OV_RENDER_ORIGIN || own.OV_RENDER_ORIGIN || 'https://bench-render.openvibe.services')].filter(Boolean),
        ctx: built.ctx,
        port,
        /**
         * Bench's app alone on its own loopback port. A port that is taken (the old openvibe-bench unit started by hand)
         * is logged and left: Compare still serves Bench by host name, so nothing else stops.
         */
        listenOwn({ host = '127.0.0.1', at = port } = {}) {
            return new Promise((resolve) => {
                const s = require('node:http').createServer(built.app);
                s.keepAliveTimeout = 65_000;
                s.once('error', (err) => { if (log.warn) log.warn(`[compare] Bench's own port ${at}: ${(err && err.code) || err}`); resolve(null); });
                s.listen(at, host, () => { ownServer = s; resolve(s); });
            });
        },
        /** Bench's jobs, publisher, telemetry and Events subscriptions; `port` is Compare's (for /internal/events). */
        start({ port } = {}) { extra = bench.startServices(built.ctx, { port }); },
        /** Stop Bench's background work and close its database, in order. */
        async stop() {
            if (ownServer) { const s = ownServer; ownServer = null; if (s.closeAllConnections) s.closeAllConnections(); await new Promise((r) => s.close(() => r())); }
            for (const close of bench.closers(built.ctx, { extra })) {
                try { await close(); } catch (err) { log.warn && log.warn('[compare] bench close:', (err && err.message) || err); }
            }
        },
    };
}

module.exports = { mountBench };
