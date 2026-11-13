'use strict';
/**
 * The Arena on Compare (plan §V.2 / 16a, 11-13: openvibe.compare/arena is the front door; it was Report's /ai/arena).
 * Exchange keeps the Arena's data, private-round access and Bench's vote rules; Compare shows its rounds and passes asks
 * and votes through, as the signed-in person:
 *
 *   GET  /arena, /arena/:id      → Exchange GET  /api/v1/arena/rounds[/:id]   (an escaped HTML fragment)
 *   POST /arena                  → Exchange POST /api/v1/arena/rounds         (a new round → 303 to it)
 *   POST /arena/:id/vote         → Exchange POST /api/v1/arena/rounds/:id/votes
 *
 * A POST needs a signed-in person (else to sign-in) and this site's Origin (else 403). The person's token (audience
 * openvibe.network, which Exchange verifies) goes along so Exchange applies their access. Links in the fragment that
 * pointed at Exchange's /arena paths stay on /arena here; its rankings links point at Compare's /ai.
 */
const express = require('express');

const EXCHANGE_ARENA = String(process.env.OV_EXCHANGE_ARENA_URL || 'https://openvibe.exchange/api/v1/arena').replace(/\/+$/, '');
const LOCATION = /^\/(?:ai\/)?arena(?:\/[a-zA-Z0-9_-]+)?$/;

/** Exchange's fragment, with its links moved to Compare's paths. */
function relink(html) {
    return String(html)
        .replace(/(href|action)="\/arena\/ask"/g, '$1="/arena"')
        .replace(/href="\/rankings/g, 'href="/ai')
        .replace(/(href|action)="\/ai\/arena/g, '$1="/arena');
}

/** Exchange answers a new round with where it lives; Compare's own path for it. */
const localPath = (location) => String(location).replace(/^\/ai\/arena/, '/arena');

function createArenaRoutes({ page, baseUrl, fetchImpl = globalThis.fetch }) {
    const r = express.Router();
    r.use(['/arena', '/arena/:id', '/arena/:id/vote'], express.urlencoded({ extended: false, limit: '64kb' }));
    const show = (req, res, status, body) => res.status(status).type('html').send(page('The Arena', `<link rel="stylesheet" href="/arena.css">${body}`, req.path));
    r.all(['/arena', '/arena/:id', '/arena/:id/vote'], async (req, res, next) => {
        if (!['GET', 'POST'].includes(req.method)) return next();
        if (req.path.endsWith('/vote') && req.method === 'GET') return res.redirect(303, req.path.replace(/\/vote$/, ''));
        res.set('Cache-Control', 'no-store');
        if (req.method === 'POST' && (!req.user || !req.token)) return res.redirect(303, `/auth/login?next=${encodeURIComponent(req.originalUrl)}`);
        if (req.method === 'POST' && req.get('origin') !== new URL(baseUrl).origin) return res.sendStatus(403);
        let path = '/rounds';
        if (req.params.id) path += `/${encodeURIComponent(req.params.id)}`;
        if (req.path.endsWith('/vote')) path += '/votes';
        try {
            const upstream = await fetchImpl(EXCHANGE_ARENA + path, {
                method: req.method,
                headers: { ...(req.token ? { authorization: `Bearer ${req.token}` } : {}), 'content-type': 'application/json' },
                ...(req.method === 'POST' ? { body: JSON.stringify(req.body || {}) } : {}),
                redirect: 'error',
                signal: AbortSignal.timeout(120000),
            });
            const data = await upstream.json();
            if (data.location && LOCATION.test(data.location)) return res.redirect(303, localPath(data.location));
            const body = typeof data.html === 'string' ? relink(data.html) : '<p>The Arena is unavailable. Try again shortly.</p>';
            return show(req, res, upstream.status, body);
        } catch {
            return show(req, res, 502, '<p>The Arena could not answer. Please try again.</p>');
        }
    });
    return r;
}

module.exports = { createArenaRoutes, relink, localPath };
