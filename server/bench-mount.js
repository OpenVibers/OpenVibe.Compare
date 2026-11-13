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
 *   mountBench({ env, store, log }) → null | { app, host, hosts, ctx, start({ port }), stop() }
 *   host: Bench's own hostname; hosts: it and Bench's render origin (OV_RENDER_ORIGIN, else bench-render.openvibe.services)
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
    // Bench answers as part of Compare: its own NODE_ENV unless the file says, and never a port of its own.
    own = { NODE_ENV: env.NODE_ENV || 'production', ...own };
    const config = require('./bench/server/config').load(own);
    const { createApp } = require('./bench/server/app');
    const built = await createApp({ config, env: own, ...(store ? { store } : {}), log });
    const bench = require('./bench/server/index');
    let extra = [];
    return {
        app: built.app,
        host: hostOf(config.baseUrl),
        hosts: [hostOf(config.baseUrl), hostOf(env.OV_RENDER_ORIGIN || own.OV_RENDER_ORIGIN || 'https://bench-render.openvibe.services')].filter(Boolean),
        ctx: built.ctx,
        /** Bench's jobs, publisher, telemetry and Events subscriptions; `port` is Compare's (for /internal/events). */
        start({ port } = {}) { extra = bench.startServices(built.ctx, { port }); },
        /** Stop Bench's background work and close its database, in order. */
        async stop() {
            for (const close of bench.closers(built.ctx, { extra })) {
                try { await close(); } catch (err) { log.warn && log.warn('[compare] bench close:', (err && err.message) || err); }
            }
        },
    };
}

module.exports = { mountBench };
