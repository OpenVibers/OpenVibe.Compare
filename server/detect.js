'use strict';
/**
 * "Was this written by an AI?" on Compare: /ai/detect (the owner, 2026-11-19: "the best possible multi model multi
 * harness AI detection type feature", beside a detector that called a person's complaint about it "100% AI GPT").
 *
 * OpenVibe.Exchange runs the check (POST /api/v1/detect, its server/detect): signed in, a panel of judge models from
 * different makers reads the passage on the person's own AI allowance; signed out, the writing-style signals only.
 * Compare draws the answer, a comparison like everything here: the verdict in words with the judges' range (never one
 * number dressed up as proof), every judge side by side with the words it quoted, the passage with the sentences two
 * signals agree on marked, the style measurements, and what no detector can do. Nothing is stored here or there.
 *
 *   GET  /ai/detect     the form and how it works
 *   POST /ai/detect     a passage → the reading (this site's Origin only)
 */
const express = require('express');

const EXCHANGE = String(process.env.OV_EXCHANGE_INTERNAL_URL || 'http://127.0.0.1:5150').replace(/\/+$/, '');
const MAX_CHARS = 12000;
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (p) => `${Math.round(Number(p) * 100)}%`;
const TONE = { likely_ai: 'ai', leans_ai: 'ai-lean', likely_human: 'human', leans_human: 'human-lean', disagree: 'unsure', unsure: 'unsure', too_short: 'unsure', style_only: 'unsure' };
const FEATURE = {
    sentence_length_variation: ['Sentence-length variation', 'How much sentence lengths vary. People writing freely usually vary more (above 0.5).'],
    markers_per_1k_words: ['Overused phrases', 'Phrases language models overuse, per 1,000 words.'],
    transition_openers_share: ['Stock openers', 'Share of sentences that open with “Moreover,”, “Furthermore,” and the like.'],
    contractions_per_1k_words: ['Contractions', '“Don’t”, “it’s”: per 1,000 words. Model prose uses fewer.'],
    sentence_length_mean: ['Average sentence', 'Words per sentence.'],
    lexical_variety: ['Word variety', 'Share of different words in each 50-word window (shown, not scored).'],
};

/** The passage as Exchange reads it, so the sentence places it answers line up with what is drawn here. */
const normal = (text) => String(text || '').replace(/\r\n?/g, '\n').trim().slice(0, MAX_CHARS);

function form(text = '', { signedIn = false } = {}) {
    return `<form class="dt-form" method="post" action="/ai/detect" data-dt-form>
<label class="dt-label" for="dt-text">Paste the passage</label>
<textarea id="dt-text" name="text" required minlength="30" maxlength="${MAX_CHARS}" rows="9" placeholder="A few paragraphs work best: under 50 words, no detector can tell.">${esc(text)}</textarea>
<div class="dt-row"><span class="dt-count" data-dt-count aria-live="polite"></span>
<button class="dt-go" type="submit"><i data-ov-icon="search" aria-hidden="true"></i><span>Check the text</span></button></div>
<p class="dt-busy" data-dt-busy hidden><span class="dt-spin" aria-hidden="true"></span>${signedIn ? 'Four judges are reading it, side by side. About ten seconds.' : 'Measuring the writing style.'}</p>
${signedIn ? '' : '<p class="dt-hint"><a href="/auth/login?next=%2Fai%2Fdetect">Sign in</a> to have a panel of AI judges from different makers read it too, free within your daily AI allowance. Signed out, only the writing-style signals run.</p>'}
</form>`;
}

const HOW = `<section class="dt-card dt-how" id="how" aria-labelledby="dt-how-h"><h2 id="dt-how-h"><i data-ov-icon="info" aria-hidden="true"></i> How it reads a passage</h2>
<ol class="dt-steps">
<li><b>A panel, not one model.</b> Judges from different makers (Anthropic, OpenAI, DeepSeek, Meta) read the passage independently and each gives an estimate, a confidence and the exact words it based that on. A quote that is not in your passage is thrown away.</li>
<li><b>Writing-style measurements.</b> Sentence-length variation, phrases models overuse, stock openers and contractions: the same numbers every time, weak on their own and counted lightly.</li>
<li><b>An honest verdict.</b> The judges' range is shown, not one number. When they disagree, or the passage is short, the answer is “can’t tell”. A sentence is marked only when two signals point at it.</li>
</ol>
<p class="dt-muted">Not yet: detectors that read a model's own token probabilities (Binoculars, Fast-DetectGPT). Independent tests find even the best single detectors miss or misfire on technical and edited text, which is why this shows every reading side by side.</p>
</section>`;

const CAVEATS = [
    'No detector can prove who wrote a text. Do not use this, or any detector, as the only reason to accuse someone.',
    'Formal, short, edited, translated and non-native writing is flagged far more often than it should be, by every detector.',
    'A text drafted with AI and rewritten by a person, or the other way round, is often both.',
];
const LIMITS = (caveats = CAVEATS) => `<section class="dt-card dt-limits" aria-labelledby="dt-lim-h"><h2 id="dt-lim-h"><i data-ov-icon="alert" aria-hidden="true"></i> What no detector can do</h2>
<ul>${(caveats || []).map((c) => `<li>${esc(c)}</li>`).join('')}</ul></section>`;

/** The person-to-AI scale: the judges' range as a band, each judge a dot, the style lean a hollow ring. */
function scale(r) {
    const dots = (r.judges || []).filter((j) => j.ok).map((j) => `<span class="dt-dot" style="left:${Math.round(j.estimate * 100)}%" title="${esc(`${j.maker}: ${pct(j.estimate)}`)}"></span>`).join('');
    const band = r.range ? `<span class="dt-band" style="left:${Math.round(r.range[0] * 100)}%;width:${Math.max(1, Math.round((r.range[1] - r.range[0]) * 100))}%"></span>` : '';
    const style = r.style && r.style.estimate != null ? `<span class="dt-ring" style="left:${Math.round(r.style.estimate * 100)}%" title="Writing style: ${pct(r.style.estimate)}"></span>` : '';
    return `<div class="dt-scale" role="img" aria-label="${esc(r.range ? `The judges' estimates run from ${pct(r.range[0])} to ${pct(r.range[1])} AI-like` : 'Writing-style lean only')}"><div class="dt-track">${band}${dots}${style}</div><div class="dt-ends"><span>Written by a person</span><span>Written by an AI</span></div></div>`;
}

function verdictCard(r) {
    const tone = TONE[r.verdict] || 'unsure';
    const agree = r.agreement ? { strong: 'The judges agree closely.', some: 'The judges mostly agree.', weak: 'The judges agree only loosely.', none: 'The judges disagree.' }[r.agreement] : '';
    const line = r.range
        ? `${r.judges_answered} of ${r.judges_asked} judge${r.judges_asked === 1 ? '' : 's'} answered: ${r.range[0] === r.range[1] ? pct(r.range[0]) : `${pct(r.range[0])} to ${pct(r.range[1])}`} AI-like. ${agree}`
        : r.verdict === 'too_short' ? `${r.words} words: too few for any detector to say.` : 'Writing-style signals only, which are weak on their own.';
    return `<section class="dt-card dt-verdict dt-${tone}" aria-labelledby="dt-v-h"><p class="dt-kicker">The reading</p><h2 id="dt-v-h">${esc(r.label)}</h2><p class="dt-line">${esc(line)}</p>${scale(r)}
${(r.notes || []).length ? `<ul class="dt-notes">${r.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}</section>`;
}

function judgesCard(r) {
    if (!(r.judges || []).length) return '';
    const items = r.judges.map((j) => {
        if (!j.ok) return `<li class="dt-judge is-off"><div class="dt-jhead"><b>${esc(j.maker)}</b><span class="dt-model">${esc(j.name || j.model)}</span><span class="dt-est">no answer</span></div><p class="dt-muted">${esc(j.error || 'It did not answer.')}</p></li>`;
        const ev = (j.evidence || []).map((e) => `<li class="dt-ev dt-ev-${e.points_to === 'human' ? 'human' : 'ai'}"><q>${esc(e.quote)}</q><span>${e.points_to === 'human' ? 'reads human' : 'reads AI'}${e.why ? ` · ${esc(e.why)}` : ''}</span></li>`).join('');
        return `<li class="dt-judge"><div class="dt-jhead"><b>${esc(j.maker)}</b><span class="dt-model">${esc(j.name || j.model)}</span><span class="dt-est">${pct(j.estimate)} <small>${esc(j.confidence)} confidence</small></span></div>
<div class="dt-meter" aria-hidden="true"><span style="width:${Math.round(j.estimate * 100)}%"></span></div>
<p>${esc(j.summary)}</p>${ev ? `<details><summary>The words it quoted (${(j.evidence || []).length})</summary><ul class="dt-evs">${ev}</ul></details>` : ''}</li>`;
    }).join('');
    return `<section class="dt-card" aria-labelledby="dt-j-h"><h2 id="dt-j-h"><i data-ov-icon="users" aria-hidden="true"></i> The judges, side by side</h2><ul class="dt-judges">${items}</ul></section>`;
}

/** The passage with its sentences marked where the reading points at them. */
function passageCard(text, r) {
    const marks = (r.sentences || []).filter((s) => s.level && Number.isInteger(s.start) && Number.isInteger(s.end) && s.end <= text.length).sort((a, b) => a.start - b.start);
    let out = '', at = 0;
    for (const s of marks) {
        if (s.start < at) continue;
        out += esc(text.slice(at, s.start));
        const label = { ai: 'Two signals point at this sentence as AI-like', ai_weak: 'One signal points at this sentence as AI-like', human: 'A judge points at this sentence as human' }[s.level];
        const why = (s.reasons || []).join('; ');
        out += `<mark class="dt-m dt-m-${s.level}" title="${esc(`${label}${why ? `: ${why}` : ''}`)}">${esc(text.slice(s.start, s.end))}</mark>`;
        at = s.end;
    }
    out += esc(text.slice(at));
    const counts = { ai: marks.filter((m) => m.level === 'ai').length, weak: marks.filter((m) => m.level === 'ai_weak').length, human: marks.filter((m) => m.level === 'human').length };
    return `<section class="dt-card" aria-labelledby="dt-p-h"><h2 id="dt-p-h"><i data-ov-icon="file-text" aria-hidden="true"></i> Your passage</h2>
<p class="dt-legend"><span><mark class="dt-m dt-m-ai">two signals: AI-like</mark> ${counts.ai}</span><span><mark class="dt-m dt-m-ai_weak">one signal</mark> ${counts.weak}</span><span><mark class="dt-m dt-m-human">reads human</mark> ${counts.human}</span></p>
<div class="dt-text">${out}</div><p class="dt-muted">${r.words} words. Hover or long-press a marked sentence for why.</p></section>`;
}

function styleCard(r) {
    const f = (r.style && r.style.features) || {};
    const rows = Object.keys(FEATURE).filter((k) => f[k] != null).map((k) => `<tr><th scope="row">${esc(FEATURE[k][0])}<small>${esc(FEATURE[k][1])}</small></th><td>${esc(f[k])}</td></tr>`).join('');
    return `<section class="dt-card" aria-labelledby="dt-s-h"><h2 id="dt-s-h"><i data-ov-icon="sliders" aria-hidden="true"></i> Writing-style signals</h2>
${(r.style && r.style.notes || []).length ? `<ul class="dt-notes">${r.style.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
<div class="dt-table"><table><tbody>${rows}</tbody></table></div><p class="dt-muted">Weak on their own: formal, edited and non-native writing looks “AI-like” here too, so they count lightly and never decide alone.</p></section>`;
}

function intro() {
    return `<header class="dt-head"><p class="dt-kicker"><a href="/ai">AI</a></p><h1>Was this written by an AI?</h1>
<p class="dt-lede">Several AI models from different makers read your text side by side, with the words they based it on, plus writing-style measurements. You get their range and where they agree, and “can’t tell” when that is the honest answer. Never a single score sold as proof.</p></header>`;
}

function createDetectRoutes({ page, baseUrl = 'https://openvibe.compare', fetchImpl = globalThis.fetch, exchangeUrl = EXCHANGE }) {
    const r = express.Router();
    const show = (req, res, status, body) => res.status(status).type('html').send(page('Was this written by an AI?', `<link rel="stylesheet" href="/detect.css"><div class="dt-page">${body}</div><script src="/detect.js" defer></script>`, '/ai/detect'));
    r.get('/ai/detect', (req, res) => {
        res.set('Cache-Control', req.user ? 'private, no-store' : 'public, max-age=300');
        return show(req, res, 200, `${intro()}<section class="dt-card">${form('', { signedIn: !!req.user })}</section>${HOW}${LIMITS()}`);
    });
    r.post('/ai/detect', express.urlencoded({ extended: false, limit: '96kb' }), async (req, res) => {
        res.set('Cache-Control', 'no-store');
        if (req.get('origin') !== new URL(baseUrl).origin) return res.sendStatus(403);
        const text = normal(req.body && req.body.text);
        const signedIn = !!(req.user && req.token);
        if (text.length < 30) return show(req, res, 422, `${intro()}<section class="dt-card"><p class="dt-problem" role="alert">Paste a passage of at least a few sentences.</p>${form(text, { signedIn })}</section>${HOW}`);
        let data = null, status = 502;
        try {
            const upstream = await fetchImpl(`${exchangeUrl}/api/v1/detect`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', accept: 'application/json', ...(signedIn ? { authorization: `Bearer ${req.token}` } : {}) },
                body: JSON.stringify({ text }), redirect: 'error', signal: AbortSignal.timeout(90000),
            });
            status = upstream.status;
            data = await upstream.json().catch(() => null);
        } catch { data = null; }
        if (!data || status !== 200 || !data.verdict) {
            const why = data && data.detail ? data.detail : 'The check could not run just now. Try again in a moment.';
            return show(req, res, status === 422 ? 422 : 502, `${intro()}<section class="dt-card"><p class="dt-problem" role="alert">${esc(why)}</p>${form(text, { signedIn })}</section>`);
        }
        return show(req, res, 200, `${intro()}${verdictCard(data)}${judgesCard(data)}${passageCard(text, data)}${styleCard(data)}${LIMITS(data.caveats && data.caveats.length ? data.caveats : CAVEATS)}<section class="dt-card"><h2>Check another passage</h2>${form('', { signedIn })}</section>${HOW}`);
    });
    return r;
}

module.exports = { createDetectRoutes, normal, passageCard, verdictCard };
