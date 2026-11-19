'use strict';
// "Was this written by an AI?" on Compare (/ai/detect, server/detect.js; the owner, 2026-11-19). What this proves:
//   - the page and its form answer, and say what signing in adds;
//   - a check needs this site's Origin;
//   - signed out it asks Exchange with no token (the style signals); signed in, with the person's own token;
//   - the reading shows the verdict in words, every judge, and the sentences marked where Exchange placed them,
//     with the passage escaped (nothing in it becomes markup);
//   - the home and the sitemap list it (test/compare.test.js, with real data).
const assert = require('assert');
const http = require('http');

const PASSAGE = 'Plain words first. Moreover, it serves as a testament to human ingenuity <script>alert(1)</script>. A last sentence here.';
const seen = [];
const exchange = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
        const text = JSON.parse(body).text;
        seen.push({ path: req.url, auth: req.headers.authorization || null, text });
        const start = text.indexOf('Moreover'), end = text.indexOf('</script>.') + '</script>.'.length;
        const signedIn = !!req.headers.authorization;
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(signedIn ? {
            method: 'detect@1', verdict: 'leans_ai', label: 'Leans AI, not conclusive', estimate: 0.66, range: [0.6, 0.72], agreement: 'some',
            judges_answered: 2, judges_asked: 2, words: 20,
            judges: [
                { model: 'shared/claude-haiku', name: 'Claude Haiku', maker: 'Anthropic', ok: true, estimate: 0.72, confidence: 'medium', summary: 'Stock phrasing.', evidence: [{ quote: 'serves as a testament to human ingenuity', points_to: 'ai', why: 'cliché', sentence: 1 }] },
                { model: 'deepseek/deepseek-flash', name: 'DeepSeek Flash', maker: 'DeepSeek', ok: true, estimate: 0.6, confidence: 'low', summary: 'Hard to say.', evidence: [] },
            ],
            sentences: [{ i: 0, start: 0, end: 18, level: null, reasons: [] }, { i: 1, start, end, level: 'ai', reasons: ['cliché'] }],
            style: { estimate: 0.7, features: { sentence_length_variation: 0.3, markers_per_1k_words: 50 }, notes: ['1 phrase language models overuse: “testament to”.'] },
            caveats: ['No detector can prove who wrote a text.'], notes: [],
        } : {
            method: 'detect@1', verdict: 'style_only', label: 'Writing-style signals only', estimate: null, range: null, agreement: null,
            judges_answered: 0, judges_asked: 0, words: 20, judges: [], sentences: [],
            style: { estimate: 0.7, features: {}, notes: [] }, caveats: ['No detector can prove who wrote a text.'],
            notes: ['Sign in to have the panel of AI judges read it as well; signed out, only the writing-style signals run.'],
        }));
    });
});

(async () => {
    await new Promise((r) => exchange.listen(0, '127.0.0.1', r));
    process.env.OV_EXCHANGE_INTERNAL_URL = `http://127.0.0.1:${exchange.address().port}`;
    const express = require('express');
    const { createApp } = require('../server/app');
    const sso = {
        router: () => express.Router(),
        optionalAuth: () => (req, _res, next) => { if (/me=1/.test(String(req.headers.cookie || ''))) { req.user = { id: 'usr_1', username: 'ada' }; req.token = 'person-token'; } next(); },
    };
    const app = createApp({ getData: async () => [], getCompute: async () => ({}), ai: { comparison: async () => ({ rows: [], tasks: [], updated_at: '2026-11-19T00:00:00Z' }) }, sso });
    const server = app.listen(0, '127.0.0.1');
    await new Promise((r) => server.once('listening', r));
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = (headers) => fetch(`${base}/ai/detect`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://openvibe.compare', ...headers }, body: new URLSearchParams({ text: PASSAGE }).toString() });
    try {
        const page = await fetch(`${base}/ai/detect`);
        assert.strictEqual(page.status, 200);
        const html = await page.text();
        assert.ok(html.includes('Was this written by an AI?') && html.includes('action="/ai/detect"'), 'the form');
        assert.ok(html.includes('How it reads a passage') && html.includes('No detector can prove who wrote a text'), 'how it works, and its limits');
        assert.ok(html.includes('Sign in</a> to have a panel of AI judges'), 'what signing in adds');

        const foreign = await fetch(`${base}/ai/detect`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://evil.example' }, body: 'text=hello+there+world+this+is+long+enough' });
        assert.strictEqual(foreign.status, 403, 'another site cannot post');

        const out = await post({});
        assert.strictEqual(out.status, 200);
        assert.ok((await out.text()).includes('Writing-style signals only'));
        assert.strictEqual(seen.at(-1).auth, null, 'signed out: no token goes to Exchange');

        const mine = await post({ cookie: 'me=1' });
        const got = await mine.text();
        assert.strictEqual(mine.status, 200);
        assert.strictEqual(seen.at(-1).auth, 'Bearer person-token', 'signed in: the person\'s own token');
        assert.strictEqual(seen.at(-1).text, PASSAGE);
        assert.ok(got.includes('Leans AI, not conclusive') && got.includes('60% to 72% AI-like'), 'the verdict in words, with the range');
        assert.ok(got.includes('Claude Haiku') && got.includes('DeepSeek Flash'), 'every judge');
        assert.ok(got.includes('<mark class="dt-m dt-m-ai"'), 'the sentence two signals agree on is marked');
        assert.ok(got.includes('it serves as a testament to human ingenuity &lt;script&gt;alert(1)&lt;/script&gt;.</mark>'), 'marked where Exchange placed it, and escaped');
        assert.ok(!got.includes('<script>alert(1)</script>'), 'the passage never becomes markup');

        console.log('detect page: the form, Origin, signed out and signed in, the reading drawn and escaped');
    } finally {
        server.close();
        exchange.close();
    }
})().catch((err) => { console.error(err); process.exit(1); });
