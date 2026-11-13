'use strict';

// Compare's AI pages: Report's AI comparison pages moved here (hub, leaderboard, providers, a model, a
// comparison, the Bench boards and the method). One way to show each thing everywhere:
//  - a model is its maker's mark, a readable name and its tags;
//  - a rating is the number with its spread and the votes it rests on, or "Not rated yet";
//  - a price is the cheapest provider's own-page price;
//  - speed and uptime are measured on the Exchange's real traffic, shown only where traffic went;
//  - Report's measured first token, tokens per second and success sit beside the prices, and are a dash
//    when Report has no row (under 20 calls in 30 days, or the source is down).
// A column or section earns its place: it shows when some row has a value, and a missing value reads in words.
const kit = require('openvibe-shared/kit');
const { parts, PARTS_CSS } = require('openvibe-shared/showcase');
const marks = require('openvibe-shared/ai-marks');
const metrics = require('openvibe-shared/ov-metrics');
const v = require('./views');

const esc = v.esc;
const BENCH = 'https://bench.openvibe.services';
const PERF = 'https://openvibe.report/api/v1/ai/performance?group=model&days=30';
const value = (x) => x == null || !Number.isFinite(Number(x)) ? null : Number(x);
const idPath = (id) => `/ai/models/${encodeURIComponent(id || '')}`;
const act = (href, label) => kit.button({ href, label, kind: 'quiet', icon: 'forward' });
const quiet = (text) => `<span class="ai-quiet">${esc(text)}</span>`;
const money = (x) => value(x) == null ? null : Number(x) === 0 ? 'Free' : kit.num(x, 'money');
const ms = (x) => value(x) == null ? null : kit.num(x, 'ms');
const share = (x) => { const n = x != null && typeof x === 'object' ? x.value : x; return value(n) == null ? null : `${(Number(n) * 100).toFixed(Number(n) > 0 && Number(n) < 0.01 ? 2 : 1)}%`; };
const word = { ms: metrics.format.ms, tps: metrics.format.tps, rate: metrics.format.rate };
const measuredWord = { ttft: metrics.format.ms, tps: metrics.format.tps, success: metrics.format.rate };
const sourceHint = (s) => { const x = s && typeof s === 'object' ? s : { name: s }; return `Source: ${x.name || 'not listed'}${x.date ? ` · ${String(x.date).slice(0, 10)}` : ''}${x.sample_size != null ? ` · n = ${x.sample_size}` : ''}`; };
const readData = (r) => (r && r.data != null ? r.data : null);
const jsonData = (x) => JSON.stringify(x).replace(/</g, '\\u003c');
// A16 (plan 2026-11-13 Y.1): Bench's owner page (/benchmarks/mine) is where a person's own benchmarks,
// runs and share settings live. The public AI pages never linked to it, so someone who had evaluated a
// model themselves had no way back from the comparison they were reading.
const mineNote = (lead = 'Ran a benchmark yourself?') => `<p class="ai-fine">${esc(lead)} <a href="${BENCH}/benchmarks/mine">Your own benchmarks and runs</a> live on Bench (sign in).</p>`;

// Bench's factor board covers these task kinds and windows; the page's form offers exactly these.
const FACTOR_KINDS = [['code', 'Code'], ['chat', 'Chat'], ['design', 'Design'], ['image', 'Image'], ['speech', 'Speech'], ['search', 'Search'], ['computer', 'Computer use'], ['game', 'Games']];
const FACTOR_DAYS = [[7, '7 days'], [30, '30 days'], [90, '90 days'], [365, '365 days']];
const KIND_NAME = Object.fromEntries(FACTOR_KINDS);

const HEAD = `<link rel="stylesheet" href="/ai-comparison.css"><link rel="stylesheet" href="/shared/kit-data.css"><link rel="stylesheet" href="/shared/showcase.css"><style>${marks.CSS}\n${PARTS_CSS}</style>`;
function page(title, description, body, path, ld = []) {
    return v.page(title, `<div class="ai-page">${body}</div>`, path, ld, { head: HEAD, description });
}
function monthLabel() {
    return new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
function benchState(stale) {
    if (!stale) return '';
    return `<p class="ai-fine" role="status">OpenVibe.Bench is unavailable. Showing the last good copy, read ${esc(String(stale).slice(0, 16).replace('T', ' '))} UTC.</p>`;
}
function availabilityBlock(data = {}) {
    const notes = (data.availability || []).map((x) => `<p class="ai-note" role="status">${esc(x.text)}</p>`);
    const stale = data.stale ? benchState(data.stale) : '';
    return stale + notes.join('');
}

// ── A model ──
function makerName(row) {
    const key = marks.family(row && row.maker) || marks.family(row && row.id);
    return key ? marks.NAMES[key] : (row && row.maker) || null;
}
const shortName = (id) => String(id || '').replace(/^[^/]+\//, '') || String(id || '');
function tags(row) {
    const t = [];
    if (typeof row.routed === 'boolean') t.push(kit.badge(row.routed ? 'Routed here' : 'Not routed here'));
    if (row.weights === 'open' || row.weights === 'open_weights') t.push(kit.badge('Open weights'));
    if (row.uncensored) t.push(kit.badge('18+', 'warn'));
    if (row.community) t.push(kit.badge('Community machines'));
    return t.join('');
}
function modelCell(row, { size = 28 } = {}) {
    const maker = makerName(row);
    return `<a class="ai-model" href="${idPath(row.id)}" title="${esc(row.id)}">${marks.mark(row.maker || row.id, { size, label: false })}`
        + `<span class="ai-model-text"><b>${esc(shortName(row.id))}</b><small>${esc(maker || 'Maker not listed')}${tags(row) ? ` ${tags(row)}` : ''}</small></span></a>`;
}

// ── Numbers on a model ──
const rated = (row) => row && row.rating && value(row.rating.value) != null;
function ratingCell(row, { range = false } = {}) {
    if (!rated(row)) return quiet('Not rated yet');
    const n = Math.round(Number(row.rating.value));
    const [lo, hi] = (row.rating.interval || []).map(value);
    const games = value(row.rating.sample_size);
    const spread = lo != null && hi != null ? (range ? `${Math.round(lo)}–${Math.round(hi)}` : `± ${Math.round((hi - lo) / 2)}`) : '';
    const votes = games != null ? `${games.toLocaleString('en-US')} ${games === 1 ? 'game' : 'games'}` : '';
    return `<span class="ai-rating" title="${esc(sourceHint(row.rating))}"><b>${n}</b>${spread || votes ? `<small>${esc([spread, votes].filter(Boolean).join(' · '))}</small>` : ''}</span>`;
}
const rankText = (row, i) => row.rank && row.rank.min != null ? (row.rank.min === row.rank.max ? String(row.rank.min) : `${row.rank.min}–${row.rank.max}`) : (rated(row) ? String(i + 1) : '–');
const offersOf = (row) => (row && row.provider_offers || []).filter(Boolean);
const measuredOffer = (o) => o.routed !== false && Number(o.requests_7d) > 0;
function cheapest(row) {
    const priced = offersOf(row).filter((o) => o.price && value(o.price.out) != null);
    return priced.sort((a, b) => Number(a.price.out) - Number(b.price.out))[0] || null;
}
function fastest(row) {
    const timed = offersOf(row).filter((o) => measuredOffer(o) && o.speed && value(o.speed.p50_ms) != null);
    return timed.sort((a, b) => Number(a.speed.p50_ms) - Number(b.speed.p50_ms))[0] || null;
}
function priceCell(row) {
    const o = cheapest(row);
    if (!o) return quiet('No price listed');
    const n = offersOf(row).filter((x) => x.price && value(x.price.out) != null).length;
    const via = n > 1 ? `cheapest of ${n} providers` : `via ${providerName(o)}`;
    return `<span class="ai-price" title="${esc(sourceHint(o.source || { name: o.provider_name }))}"><b>${esc(money(o.price.out))}</b> out · ${esc(money(o.price.in) || '–')} in<small>per 1M tokens, ${esc(via)}</small></span>`;
}
function speedCell(row) {
    const o = fastest(row);
    if (!o) return quiet('No traffic yet');
    return `<span title="${esc(sourceHint({ name: 'OpenVibe.AI, real traffic', sample_size: o.requests_7d }))}"><b>${esc(ms(o.speed.p50_ms))}</b><small>typical reply · p95 ${esc(ms(o.speed.p95_ms) || '–')}</small></span>`;
}
function uptimeCell(row) {
    const o = fastest(row) || offersOf(row).find(measuredOffer);
    if (!o || share(o.uptime) == null) return quiet('No traffic yet');
    return `<b${Number(o.uptime) < 0.95 ? ' class="ai-bad"' : ''}>${esc(share(o.uptime))}</b><small>${esc(Number(o.requests_7d).toLocaleString('en-US'))} requests in 7 days</small>`;
}
function measuredCell(row, key) {
    const m = row && row.measured;
    const text = m && measuredWord[key] ? measuredWord[key](m[key]) : '—';
    if (!m || m[key] == null) return `<span class="ovm-unknown" title="Report lists a model after 20 calls in 30 days">${esc(text)}</span>`;
    return `<span title="${esc(`OpenVibe.Report public model row; ${m.calls == null ? 'calls not reported' : `${Number(m.calls).toLocaleString('en-US')} calls in 30 days`}`)}"><b>${esc(text)}</b><small>${m.calls == null ? '30-day row' : `${Number(m.calls).toLocaleString('en-US')} calls`}</small></span>`;
}
function measuredNote(data = {}) {
    if ((data.availability || []).some((x) => x.id === 'perf')) return '';
    return `<p class="ai-fine">Measured columns: OpenVibe.Report's public model rows over 30 days, matched exactly to the model or its provider model name. A model needs 20 calls to be listed; a dash is not a zero. <a href="${PERF}">Report's open data</a>.</p>`;
}

// ── The leaderboard table ──
function board(rows, { full = false, measured = true } = {}) {
    const has = (fn) => rows.some(fn);
    const columns = [
        has(rated) && { key: 'rank', label: 'Rank', num: true, html: true },
        { key: 'model', label: 'Model', primary: true, html: true },
        has(rated) && { key: 'rating', label: 'Rating', html: true },
        has((r) => cheapest(r)) && { key: 'price', label: 'Price', html: true },
        measured && { key: 'ttft', label: 'First token p50', html: true },
        measured && { key: 'tps', label: 'Tokens/s p50', html: true },
        measured && { key: 'success', label: 'Success', html: true },
        has((r) => fastest(r)) && { key: 'speed', label: 'Reply time', html: true },
        full && has((r) => offersOf(r).some((o) => measuredOffer(o) && share(o.uptime) != null)) && { key: 'uptime', label: 'Uptime 7 d', html: true },
        full && has((r) => r.benchmark && value(r.benchmark.value) != null) && { key: 'bench', label: 'Bench score', html: true },
    ].filter(Boolean);
    const data = rows.map((r, i) => ({
        rank: `<span class="ai-rank${rated(r) && i < 3 ? ' is-top' : ''}">${esc(rankText(r, i))}</span>`,
        model: modelCell(r),
        rating: ratingCell(r),
        price: priceCell(r),
        ttft: measuredCell(r, 'ttft'),
        tps: measuredCell(r, 'tps'),
        success: measuredCell(r, 'success'),
        speed: speedCell(r),
        uptime: uptimeCell(r),
        bench: r.benchmark && value(r.benchmark.value) != null ? `<b>${esc(kit.num(r.benchmark.value))}</b>` : quiet('No runs yet'),
    }));
    const none = rows.length && !has(rated) ? `<p class="ai-note">No model has blind votes or runs yet, so nothing is ranked: these are the models with their prices and measured speed. <a href="https://openvibe.exchange/arena">Vote in the Arena</a> to rate them.</p>` : '';
    const wrapped = data.map((d) => Object.fromEntries(Object.entries(d).map(([k, val]) => [k, k === 'model' ? val : `<span class="ai-cell">${val}</span>`])));
    return none + kit.table({ columns, rows: wrapped, label: 'AI models', empty: 'No model matches these filters.' }).replace('class="ovk-table"', 'class="ovk-table ai-board"');
}

function dataLinks() {
    return `<p class="ai-data">Data: <a href="/api/v1/comparisons/ai-models">JSON</a> · <a href="/ai/method">How it is measured</a></p>`;
}

// ── /ai ──
const PICK_LABELS = { overall: 'Best overall', value: 'Best value', fastest: 'Fastest', open: 'Best open weights', code: 'Best for code', writing: 'Best for writing', uncensored: 'Best uncensored 18+', free: 'Best free' };
function pickNumber(id, row) {
    if (id === 'value' || id === 'free') { const o = cheapest(row); return !o ? '' : Number(o.price.out) === 0 ? 'Free' : `${money(o.price.out)} per 1M out`; }
    if (id === 'fastest') { const o = fastest(row); return o ? `${ms(o.speed.p50_ms)} typical reply` : ''; }
    return rated(row) ? `Rating ${Math.round(row.rating.value)}` : '';
}
function hub(data = {}) {
    const rows = data.rows || [];
    const month = monthLabel();
    const chat = rows.filter((r) => (r.model_kind || 'chat') === 'chat');
    const ratedRows = chat.filter(rated);
    const best = (list) => [...list].sort((a, b) => b.rating.value - a.rating.value)[0];
    const nz = (x) => x == null || x === '' ? NaN : Number(x);
    const cheapestOf = (r) => Math.min(...(r.provider_offers || []).map((o) => nz(o.price && o.price.out)).filter(Number.isFinite), Infinity);
    const fastestOf = (r) => Math.min(...(r.provider_offers || []).filter((o) => Number(o.requests_7d) > 0).map((o) => nz(o.speed && o.speed.p50_ms)).filter(Number.isFinite), Infinity);
    const free = (r) => (r.provider_offers || []).some((o) => o.free === true || o.free_now === true || nz(o.price && o.price.out) === 0);
    const taskRows = (kind) => ratedRows.map((row) => { const task = row.task_ratings.find((x) => x.kind === kind && x.rating && x.rating.value != null); return task ? { ...row, kind, rating: task.rating, benchmark: task.benchmark } : null; }).filter(Boolean);
    const choose = (id, model, why) => ({ id, model: model || null, why: model ? why : 'Not enough source data to establish this pick.' });
    const picks = [
        choose('overall', best(ratedRows), 'Highest rating from blind votes and open runs.'),
        choose('value', ratedRows.filter((r) => Number.isFinite(cheapestOf(r))).sort((a, b) => cheapestOf(a) - cheapestOf(b))[0], 'Lowest output price among rated models.'),
        choose('fastest', chat.filter((r) => Number.isFinite(fastestOf(r))).sort((a, b) => fastestOf(a) - fastestOf(b))[0], 'Fastest typical reply on real traffic this week.'),
        choose('open', best(ratedRows.filter((r) => ['open', 'open_weights'].includes(r.weights))), 'Highest-rated model with open weights.'),
        choose('code', best(taskRows('code')), 'Highest rating on code tasks.'),
        choose('writing', best(taskRows('writing')), 'Highest rating on writing tasks.'),
        choose('uncensored', best(ratedRows.filter((r) => r.uncensored)), 'Highest-rated uncensored model; 18+.'),
        choose('free', best(ratedRows.filter(free)) || chat.find(free), 'Free to use now through the Exchange.'),
    ];
    const providers = data.providers || [];
    const tasks = data.tasks || [];
    const others = rows.length - chat.length;
    const providerNames = new Set(providers.map(providerName).filter(Boolean));
    const measuredOffers = providers.filter(measuredOffer);
    const made = picks.filter((p) => p.model);
    const pending = picks.filter((p) => !p.model).map((p) => PICK_LABELS[p.id] || p.id);
    const pickList = made.map((p) => `<li><a class="ai-pick" href="${idPath(p.model.id)}"><span class="ai-pick-k">${esc(PICK_LABELS[p.id] || p.id)}</span>`
        + `<span class="ai-pick-m">${marks.mark(p.model.maker || p.model.id, { size: 32, label: false })}<b>${esc(shortName(p.model.id))}</b></span>`
        + `${pickNumber(p.id, p.model) ? `<span class="ai-pick-n">${esc(pickNumber(p.id, p.model))}</span>` : ''}<small>${esc(p.why || '')}</small></a></li>`).join('');
    const pairs = ratedRows.slice(0, 16).reduce((a, r, i, all) => { if (i % 2 === 0 && all[i + 1]) a.push([r, all[i + 1]]); return a; }, []).slice(0, 8);
    const sourceDate = rows.map((r) => r.source && r.source.date).find(Boolean) || 'date not reported by source';
    const faq = [
        ['How are ratings made?', `${ratedRows.length} models have a rating from blind pairwise votes and open runs on OpenVibe.Bench (Bradley-Terry with bootstrap intervals), dated ${sourceDate}.`],
        ['Where do prices come from?', `Each provider's own price page, read by OpenVibe.AI's pricebook; ${providers.length} provider and model offers are listed.`],
        ['What does the rank band mean?', 'Models whose rating intervals overlap share a band: the data cannot tell them apart yet.'],
        ['Why does a model say "Not rated yet"?', 'No blind votes or runs on it so far. Its prices and measured speed are still listed.'],
        ['How is speed measured?', `On real requests through OpenVibe.Exchange over seven days: ${measuredOffers.length} provider endpoints had traffic.`],
        ['How often does this change?', 'Ratings and prices refresh within two minutes of the sources changing.'],
    ];
    const body = `<header class="ai-head"><p class="ai-kicker">AI comparison · ${esc(month)}</p><h1>AI model leaderboard — ${esc(month)}</h1>`
        + `<p class="ai-lede">${rows.length} models from ${providerNames.size} providers. Ratings come from blind votes, prices from each provider's own page, and speed and uptime from real traffic. Measured first-token time, tokens per second and success come from OpenVibe.Report.</p>`
        + availabilityBlock(data)
        + kit.find({ action: '/ai/leaderboard', placeholder: 'Search a model or maker', label: 'Search models' })
        + kit.stats([[ratedRows.length, 'rated'], [rows.length, 'models listed'], [providerNames.size, 'providers'], [measuredOffers.length, 'measured endpoints']], { label: 'The leaderboard in numbers' })
        + `</header>`
        + (pickList || pending.length ? kit.section({ title: 'Top picks', body: `${pickList ? `<ul class="ai-picks">${pickList}</ul>` : ''}${pending.length ? `<p class="ai-fine">Not enough data yet for ${esc(pending.join(', '))}.</p>` : ''}` }) : '')
        + kit.section({ title: 'Harness and model, apart', body: `<p class="ai-fine">A coding agent is a harness driving a model, and the harness can move a score as much as the model. Bench fits the two apart, with an interval on each harness effect. Every agent number here names its harness.</p><ul class="ai-chips"><li><a href="/ai/harnesses">Harness effects</a></li><li><a href="/ai/matrix">Harness × model matrix</a></li><li><a href="/ai/method">How the fit works</a></li></ul>` })
        // A phone shows the parts below the top picks one at a time as tabs; every part stays in the HTML.
        + parts({ name: 'board', label: 'The leaderboard\'s parts', items: [
            { id: 'leaderboard', label: 'Leaderboard', count: chat.length, html: kit.section({ title: 'Leaderboard', count: chat.length, actions: [act('/ai/leaderboard', chat.length > 25 ? `All ${chat.length} models` : 'Filter and sort')], body: board(chat.slice(0, 25)) + (others ? `<p class="ai-fine">Chat models only. ${others} embedding and speech ${others === 1 ? 'model is' : 'models are'} in the <a href="/ai/leaderboard?type=all">full list</a>.</p>` : '') + dataLinks() + measuredNote(data) }) },
            { id: 'tasks', label: 'By task', count: tasks.length || '', html: (tasks.length ? kit.section({ title: 'Boards by task', body: `<ul class="ai-chips">${tasks.slice(0, 16).map((x) => `<li><a href="/ai/${encodeURIComponent(x.id)}">${esc(x.name || x.id)}</a></li>`).join('')}</ul>` }) : '') },
            { id: 'providers', label: 'Providers', count: measuredOffers.length || '', html: (measuredOffers.length ? kit.section({ title: 'Providers', actions: [act('/ai/providers', 'Every provider')], body: providerTable(measuredOffers.slice(0, 6)) }) : '') },
            { id: 'compare', label: 'Compare', html: (pairs.length ? kit.section({ title: 'Popular comparisons', body: `<ul class="ai-chips">${pairs.map(([a, b]) => `<li><a href="/ai/compare/${encodeURIComponent(a.id)}-vs-${encodeURIComponent(b.id)}">${esc(shortName(a.id))} vs ${esc(shortName(b.id))}</a></li>`).join('')}</ul>` }) : '') },
            { id: 'questions', label: 'Questions', html: kit.section({ title: 'Questions', body: faq.map(([q, a]) => kit.fold({ title: q, body: `<p>${esc(a)}</p>` })).join('') }) },
        ] })
        + mineNote('Ran a benchmark yourself?')
        + scriptLd({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) })
        + scriptLd({ '@context': 'https://schema.org', '@type': 'Dataset', name: 'OpenVibe AI model leaderboard', url: 'https://openvibe.compare/ai', variableMeasured: ['Bench rating', 'Provider price', 'Provider reply time', 'Provider uptime', 'Measured first token time', 'Measured tokens per second', 'Measured success rate'], distribution: { '@type': 'DataDownload', contentUrl: 'https://openvibe.compare/api/v1/comparisons/ai-models', encodingFormat: 'application/json' } });
    return page(`AI model leaderboard — ${month}`, `${rows.length} AI models compared: ratings from blind votes, provider prices and measured speed.`, body, '/ai');
}

function scriptLd(obj) {
    return `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;
}

// ── /ai/leaderboard ──
function leaderboard(data = {}) {
    const rows = data.rows || [];
    const filters = data.filters || {};
    const select = (name, label, opts) => `<label class="ai-filter"><span>${esc(label)}</span><select name="${name}">${opts.map(([val, t]) => `<option value="${esc(val)}"${String(filters[name] || '') === val ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
    const text = (name, label, placeholder) => `<label class="ai-filter"><span>${esc(label)}</span><input name="${name}" value="${esc(filters[name] || '')}" placeholder="${esc(placeholder)}"></label>`;
    const form = `<form class="ai-filters" action="/ai/leaderboard">`
        + `<label class="ai-filter ai-filter--q"><span>Search</span><input name="q" type="search" value="${esc(filters.q || '')}" placeholder="Model or maker"></label>`
        + select('type', 'Type', [['chat', 'Chat models'], ['embedding', 'Embeddings'], ['stt', 'Speech to text'], ['all', 'All']])
        + select('sort', 'Sort by', [['rating', 'Rating'], ['price', 'Output price'], ['speed', 'Reply time'], ['name', 'Name']])
        + select('weights', 'Weights', [['', 'Any'], ['open', 'Open weights'], ['closed', 'Closed']])
        + select('price', 'Price', [['', 'Any price'], ['free', 'Free'], ['low', 'Low'], ['mid', 'Mid'], ['high', 'High']])
        + text('maker', 'Maker', 'e.g. openai')
        + text('kind', 'Task', 'e.g. design.page')
        + select('status', 'Status', [['current', 'Current'], ['all', 'All']])
        + select('uncensored', '18+', [['', 'Any'], ['true', 'Uncensored only']])
        + select('community', 'Runs on', [['', 'Anywhere'], ['true', 'Community machines']])
        + `<button class="ovk-btn ovk-btn--primary">Apply</button></form>`;
    const body = `<header class="ai-head ai-head--page"><p class="ai-kicker"><a href="/ai">AI comparison</a></p><h1>AI model leaderboard</h1>`
        + `<p class="ai-lede">${rows.length} ${rows.length === 1 ? 'model' : 'models'}${rows.filter(rated).length ? `, ${rows.filter(rated).length} rated` : ''}. Rated models first, then the rest with their prices.</p></header>`
        + availabilityBlock(data) + form + board(rows, { full: true }) + measuredNote(data) + dataLinks()
        + mineNote('Ran a benchmark yourself?');
    return page('AI model leaderboard', 'Every AI model with its rating, provider prices and measured speed; filter and sort.', body, '/ai/leaderboard', [{ '@context': 'https://schema.org', '@type': 'Dataset', name: 'OpenVibe AI model leaderboard', url: 'https://openvibe.compare/ai/leaderboard' }]);
}

// ── /ai/providers ──
const ownServer = (p) => /^(local|whisper)$/i.test(String(p.provider || '')) || /on this host|\blocal\b/i.test(String(p.provider_name || ''));
const providerName = (p) => ownServer(p) ? 'OpenVibe server' : String(p.provider_name || p.provider || 'Provider').replace(/\s*\((?:the |an? )[^)]*\)\s*$/i, '');
const providerMark = (p) => ownServer(p) ? marks.mark('openvibe', { size: 24, label: false }) : marks.mark(p.provider || p.provider_name, { size: 24, label: false });
function providerTable(list) {
    const notUp = (p) => p.routed !== false && ['down', 'degraded'].includes(String(p.status || 'up'));
    const statusCell = (p) => {
        if (p.routed === false) return quiet('Not routed here');
        if (!notUp(p)) return 'Up';
        const down = String(p.status) === 'down';
        const why = p.status_reason ? `<small>${esc(p.status_reason)}</small>` : '';
        const since = p.status_since ? `<small>since ${esc(String(p.status_since).slice(0, 16).replace('T', ' '))} UTC</small>` : '';
        return `<b class="${down ? 'ai-bad' : 'ai-warn'}">${down ? 'Down' : 'Degraded'}</b>${why}${since}`;
    };
    const rows = list.map((p) => ({
        provider: `<span class="ai-prov">${providerMark(p)}<b>${esc(providerName(p))}</b></span>`,
        model: `<a href="${idPath(p.model)}">${esc(shortName(p.model))}</a>`,
        status: statusCell(p),
        price: p.price && value(p.price.out) != null ? `<b>${esc(money(p.price.out))}</b> out · ${esc(money(p.price.in) || '–')} in` : quiet('No price listed'),
        reply: p.routed === false ? quiet('Not routed here') : measuredOffer(p) && p.speed && value(p.speed.p50_ms) != null ? `<b>${esc(ms(p.speed.p50_ms))}</b><small>p95 ${esc(ms(p.speed.p95_ms) || '–')}</small>` : quiet('Not measured yet'),
        errors: p.routed === false ? quiet('Not routed here') : measuredOffer(p) && share(p.error_rate) != null ? `<b class="${Number(typeof p.error_rate === 'object' ? p.error_rate.value : p.error_rate) > 0.05 ? 'ai-bad' : ''}">${esc(share(p.error_rate))}</b>` : quiet('Not measured yet'),
        uptime: p.routed === false ? quiet('Not routed here') : measuredOffer(p) && share(p.uptime) != null ? `<b class="${Number(p.uptime) < 0.95 ? 'ai-bad' : ''}">${esc(share(p.uptime))}</b>` : quiet('Not measured yet'),
        requests: p.routed === false ? quiet('Not routed here') : measuredOffer(p) ? Number(p.requests_7d).toLocaleString('en-US') : quiet('Not measured yet'),
    }));
    return kit.table({
        columns: [
            { key: 'provider', label: 'Provider', primary: true, html: true },
            { key: 'model', label: 'Model', html: true },
            list.some(notUp) && { key: 'status', label: 'Status', html: true },
            { key: 'price', label: 'Price per 1M', html: true },
            { key: 'reply', label: 'Reply time', html: true },
            { key: 'errors', label: 'Errors', html: true },
            { key: 'uptime', label: 'Uptime 7 d', html: true },
            { key: 'requests', label: 'Requests 7 d', html: true },
        ].filter(Boolean),
        rows: rows.map((d) => Object.fromEntries(Object.entries(d).map(([k, val]) => [k, k === 'provider' ? val : `<span class="ai-cell">${val}</span>`]))), label: 'Providers', empty: 'No provider is listed yet.',
    });
}
function providers(data = {}) {
    const sorted = [...(data.providers || [])].sort((a, b) => (Number(b.requests_7d) || 0) - (Number(a.requests_7d) || 0));
    const body = `<header class="ai-head ai-head--page"><p class="ai-kicker"><a href="/ai">AI comparison</a></p><h1>AI providers</h1>`
        + `<p class="ai-lede">Every model and provider offer in the market. Prices come from each provider's own page. Reply time, errors and uptime are measured on real requests over the last seven days; offers outside the router say “Not routed here”, while routed offers without measurements say “Not measured yet”. Status is measured from the Exchange catalogue: down while an offer's circuit is open, degraded when more than 5% of at least 10 requests in the last hour failed, with the plain reason.</p></header>`
        + availabilityBlock(data) + providerTable(sorted);
    return page('AI providers', 'AI providers compared: price per million tokens, reply time, error rate and uptime measured on real traffic.', body, '/ai/providers');
}

// ── /ai/models/:id ──
function model(data = {}) {
    const id = data.id;
    const detail = readData(data.detail) || {};
    const row = data.row || null;
    const list = data.providers || [];
    const self = row || { id, provider_offers: list.filter((p) => p.model === id) };
    const offers = offersOf(self).length ? offersOf(self) : list.filter((p) => p.model === id);
    const tasks = (self.task_ratings || []).filter((t) => t.rating && value(t.rating.value) != null);
    const maker = makerName(self);
    const top = cheapest({ provider_offers: offers });
    const quick = fastest({ provider_offers: offers });
    const measured = self.measured || null;
    const facts = kit.stats([
        [rated(self) ? Math.round(self.rating.value) : 'Not rated yet', 'rating'],
        [top ? money(top.price.out) : null, 'cheapest output / 1M'],
        [measured && measured.ttft != null ? word.ms(measured.ttft) : null, 'first token p50'],
        [measured && measured.tps != null ? word.tps(measured.tps) : null, 'tokens/s p50'],
        [measured && measured.success != null ? word.rate(measured.success) : null, 'success'],
        [quick ? ms(quick.speed.p50_ms) : null, 'typical reply'],
        [offers.length || null, offers.length === 1 ? 'provider' : 'providers'],
    ], { label: `${id} in numbers` });
    const taskTable = tasks.length ? kit.table({
        columns: [{ key: 'task', label: 'Task', primary: true, html: true }, { key: 'rank', label: 'Rank' }, { key: 'rating', label: 'Rating', html: true }],
        rows: tasks.map((t) => ({ task: `<a href="/ai/${encodeURIComponent(t.kind)}">${esc(t.kind)}</a>`, rank: t.rank ? (t.rank.min === t.rank.max ? String(t.rank.min) : `${t.rank.min}–${t.rank.max}`) : 'Not enough data', rating: ratingCell({ rating: t.rating }, { range: true }) })),
        label: 'Task ratings',
    }) : `<p class="ai-fine">Not rated on any task yet: no blind votes or runs on this model so far.</p>`;
    const benchmarks = (detail.benchmarks || []).length ? kit.table({
        columns: [{ key: 'name', label: 'Benchmark', primary: true }, { key: 'score', label: 'Score' }, { key: 'runs', label: 'Runs' }, { key: 'last', label: 'Last run' }],
        rows: detail.benchmarks.map((b) => ({ name: b.title || b.benchmark_id, score: b.score == null ? 'Not measured' : String(b.score), runs: b.runs == null ? 'Not reported' : String(b.runs), last: b.last_run ? String(b.last_run).slice(0, 10) : '–' })),
        label: 'Benchmarks', caption: `OpenVibe.Bench${data.sourceDate ? ` · snapshot ${String(data.sourceDate).slice(0, 10)}` : ''}`,
    }) : '';
    const measuredTable = self.measured ? kit.table({
        columns: [{ key: 'measure', label: 'Measured', primary: true }, { key: 'p50', label: 'p50' }, { key: 'calls', label: 'Calls' }, { key: 'date', label: 'Window ends' }],
        rows: [
            { measure: 'Time to first token p50', p50: word.ms(self.measured.ttft), calls: self.measured.calls == null ? 'Not reported' : String(self.measured.calls), date: self.measured.as_of ? String(self.measured.as_of).slice(0, 10) : '—' },
            { measure: 'Tokens per second p50', p50: word.tps(self.measured.tps), calls: self.measured.calls == null ? 'Not reported' : String(self.measured.calls), date: self.measured.as_of ? String(self.measured.as_of).slice(0, 10) : '—' },
            { measure: 'Success rate', p50: word.rate(self.measured.success), calls: self.measured.calls == null ? 'Not reported' : String(self.measured.calls), date: self.measured.as_of ? String(self.measured.as_of).slice(0, 10) : '—' },
        ], label: 'Measured on real traffic', caption: 'OpenVibe.Report public model row, 30 days',
    }) : `<p class="ai-fine">No measured row from OpenVibe.Report: a model is listed after 20 calls in 30 days, and a dash is not a zero. <a href="${PERF}">Report's open data</a>.</p>`;
    const body = `<header class="ai-head ai-head--model"><p class="ai-kicker"><a href="/ai">AI comparison</a></p>`
        + `<div class="ai-model-head">${marks.mark(self.maker || id, { size: 56 })}<div><h1>${esc(shortName(id))}</h1><p class="ai-lede">${esc(maker || 'Maker not listed')}${tags(self) ? ` ${tags(self)}` : ''} · <code>${esc(id)}</code></p></div></div>`
        + facts + `</header>`
        + availabilityBlock(data)
        + kit.section({ title: 'Providers', count: offers.length, body: providerTable(offers) })
        + kit.section({ title: 'Measured on real traffic', count: self.measured ? 3 : null, body: measuredTable })
        + kit.section({ title: 'Task ratings', count: tasks.length || null, body: taskTable + benchmarks })
        + `<aside class="ai-try"><a class="ovk-btn ovk-btn--primary" href="https://openvibe.chat/vibe?models=${encodeURIComponent(id)}">Try it in Chat</a><a class="ovk-btn ovk-btn--quiet" href="https://openvibe.exchange/models/${encodeURIComponent(id)}">Use it from code</a></aside>`
        + mineNote('Ran this model yourself?');
    return page(`${shortName(id)} — AI model`, `${id}: rating, prices across providers and measured speed.`, body, idPath(id), [{ '@context': 'https://schema.org', '@type': 'Product', name: id, brand: maker || 'Unknown maker', url: `https://openvibe.compare${idPath(id)}` }]);
}

// ── /ai/compare ──
function compare(data = {}) {
    if (data.agentPair) return agentCompare(data, data.agentPair);
    const models = data.models || [];
    const options = data.options || [];
    const two = models.length === 2;
    const facts = (m) => [
        ['Rating', ratingCell(m, { range: true })],
        ['Price', priceCell(m)],
        ['First token p50', measuredCell(m, 'ttft')],
        ['Tokens/s p50', measuredCell(m, 'tps')],
        ['Success', measuredCell(m, 'success')],
        ['Reply time', speedCell(m)],
        ['Providers', offersOf(m).length ? String(offersOf(m).length) : quiet('None listed')],
    ];
    const cards = models.map((m) => `<article class="ai-vs-card">${modelCell(m, { size: 40 })}<dl>${facts(m).map(([k, val]) => `<div><dt>${esc(k)}</dt><dd>${val}</dd></div>`).join('')}</dl></article>`).join('');
    const list = `<datalist id="ai-models">${options.slice(0, 500).map((o) => `<option value="${esc(o)}"></option>`).join('')}</datalist>`;
    const form = `<form class="ai-filters ai-vs-form" action="/ai/compare"><label class="ai-filter"><span>First model</span><input name="a" list="ai-models" value="${esc(models[0] && models[0].id || '')}" required></label>`
        + `<label class="ai-filter"><span>Second model</span><input name="b" list="ai-models" value="${esc(models[1] && models[1].id || '')}" required></label><button class="ovk-btn ovk-btn--primary">Compare</button>${list}</form>`;
    const body = `<header class="ai-head ai-head--page"><p class="ai-kicker"><a href="/ai">AI comparison</a></p><h1>${two ? `${esc(shortName(models[0].id))} vs ${esc(shortName(models[1].id))}` : 'Compare AI models'}</h1>`
        + `${two ? '' : '<p class="ai-lede">Choose two models to compare: their ratings, prices and measured speed side by side.</p>'}</header>`
        + availabilityBlock(data) + (cards ? `<div class="ai-vs">${cards}</div>` : '') + form + measuredNote(data)
        + mineNote('Compared them yourself?');
    return page(two ? `${shortName(models[0].id)} vs ${shortName(models[1].id)}` : 'Compare AI models', 'Compare AI models side by side: ratings, prices and measured speed.', body, '/ai/compare');
}

// ── Harness and model, apart (/ai/harnesses, /ai/matrix, an agent pair) ──
const agentName = (a) => `<span class="ai-agent"><b>${esc(a.harness)}</b><span aria-hidden="true">+</span>${esc(a.model)}</span>`;
const agentSlug = (a) => `${a.harness}+${a.model}`;
const pairPath = (a, b) => {
    const [x, y] = [agentSlug(a), agentSlug(b)].sort();
    return `/ai/compare/${encodeURIComponent(x)}-vs-${encodeURIComponent(y)}`;
};
const eloText = (x) => value(x) == null ? '—' : String(Math.round(Number(x)));
const pointsText = (x) => { const n = value(x); return n == null ? '—' : `${n > 0 ? '+' : ''}${Math.round(n * 10) / 10}`; };
const agentScoreCell = (a) => {
    const lo = value(a.ci_lower), hi = value(a.ci_upper);
    const spread = lo != null && hi != null ? `${Math.round(lo)}–${Math.round(hi)}` : null;
    return `<b>${eloText(a.score)}</b>${spread ? `<small>95% ${esc(spread)}</small>` : ''}`;
};

function factorForm(path, data = {}) {
    const kinds = FACTOR_KINDS.map(([id, name]) => `<option value="${id}"${id === (data.taskKind || 'code') ? ' selected' : ''}>${esc(name)}</option>`).join('');
    const days = FACTOR_DAYS.map(([n, name]) => `<option value="${n}"${n === Number(data.days || 90) ? ' selected' : ''}>${esc(name)}</option>`).join('');
    return `<form class="ai-filters ai-factor-form" action="${esc(path)}" method="get"><label class="ai-filter"><span>Task kind</span><select name="task_kind">${kinds}</select></label><label class="ai-filter"><span>Window</span><select name="days">${days}</select></label><button class="ovk-btn ovk-btn--primary">Show</button></form>`;
}

function factorState(data = {}) {
    if (data.unavailable) return `<p class="ai-note" role="status">OpenVibe.Bench did not answer its factor board. This page comes back when it answers; nothing is filled in.</p>`;
    return data.stale ? benchState(data.stale) : '';
}

function factorMethod(fit, kind, days) {
    const matches = fit && fit.matches ? `${Number(fit.matches).toLocaleString('en-US')} matches` : 'no matches yet';
    return `<p class="ai-fine">${fit && fit.method ? `${esc(fit.method)}. ` : ''}Model and harness are fitted apart from every match of ${esc(KIND_NAME[kind] || kind)} in ${esc(String(days))} days (${esc(matches)}); the neutral harness <code>ov-bare</code> is the zero when it appears, otherwise the effects are centred on their average. <a href="${BENCH}/docs">Bench's method</a>.</p>`;
}

// One scale for every harness, so the strips compare by their position: zero is ov-bare when it anchored the fit.
function stripScale(harnesses) {
    const values = harnesses.flatMap((h) => [value(h.ci_lower), value(h.ci_upper), value(h.effect)]).filter((x) => x != null).concat([0]);
    const lo = Math.min(...values), hi = Math.max(...values);
    const pad = Math.max(10, (hi - lo) * 0.06);
    return { lo: lo - pad, hi: hi + pad };
}
function harnessStrip(h, scale) {
    const lo = value(h.ci_lower), hi = value(h.ci_upper), effect = value(h.effect);
    if (lo == null || hi == null || effect == null) return `<p class="ai-fine">Effect interval not reported for ${esc(h.harness)}.</p>`;
    const span = scale.hi - scale.lo || 1;
    const at = (x) => ((x - scale.lo) / span) * 100;
    const label = `${h.harness}: ${pointsText(effect)} Elo effect, 95% interval ${Math.round(lo)} to ${Math.round(hi)}`;
    return `<div class="ai-hstrip" role="img" aria-label="${esc(label)}" title="${esc(label)}" style="--zero:${at(0).toFixed(2)}%">`
        + `<span class="ai-hstrip-range" style="left:${at(lo).toFixed(2)}%;width:${Math.max(0, at(hi) - at(lo)).toFixed(2)}%"></span>`
        + `<span class="ai-hstrip-dot" style="left:${at(effect).toFixed(2)}%"></span></div>`;
}

// ── /ai/harnesses ──
function harnesses(data = {}) {
    const fit = data.fit || null;
    const list = fit ? fit.harnesses || [] : [];
    const agents = fit ? fit.agents || [] : [];
    const top = [...agents].sort((a, b) => (value(b.score) == null ? -Infinity : value(b.score)) - (value(a.score) == null ? -Infinity : value(a.score)));
    const byHarness = new Map();
    for (const a of agents) {
        if (!byHarness.has(a.harness)) byHarness.set(a.harness, []);
        byHarness.get(a.harness).push(a);
    }
    const scale = stripScale(list);
    const rows = list.map((h) => {
        const own = (byHarness.get(h.harness) || []).sort((a, b) => (value(b.score) == null ? -Infinity : value(b.score)) - (value(a.score) == null ? -Infinity : value(a.score)));
        const other = top.find((x) => !own.some((a) => a.id === x.id)) || null;
        const agentLine = own.length
            ? `<p class="ai-harness-agents">Agents: ${own.map((a) => {
                const body = other ? `<a href="${pairPath(a, other)}">${agentName(a)}</a> ${agentScoreCell(a)}` : `${agentName(a)} ${agentScoreCell(a)}`;
                return `<span class="ai-agent-item">${body}</span>`;
            }).join(' · ')}</p>`
            : `<p class="ai-harness-agents">No agent row names this harness yet.</p>`;
        return `<li class="ai-harness"><div class="ai-harness-head"><b>${esc(h.harness)}</b><span class="ai-harness-effect">${esc(pointsText(h.effect))} Elo</span>`
            + `<span class="ai-harness-meta">95% ${esc(value(h.ci_lower) == null ? '—' : `${Math.round(value(h.ci_lower))} to ${Math.round(value(h.ci_upper))}`)} · ${esc(value(h.games) == null ? 'games not reported' : `${Number(h.games).toLocaleString('en-US')} games`)}</span></div>`
            + harnessStrip(h, scale) + agentLine + `</li>`;
    }).join('');
    const empty = !list.length;
    const body = `<header class="ai-head ai-head--page"><p class="ai-kicker"><a href="/ai">AI comparison</a></p><h1>Harness effects</h1>`
        + `<p class="ai-lede">What a harness adds, in Elo points, apart from the model it drives. Each strip is its 95% interval on one scale; zero is <code>ov-bare</code> when it anchored the fit, otherwise the average harness. Kind and window choose the fit.</p>`
        + factorForm('/ai/harnesses', data) + `</header>`
        + factorState(data)
        + (!fit ? '' : kit.stats([[list.length, list.length === 1 ? 'harness' : 'harnesses'], [fit.games || 0, 'games'], [fit.matches || 0, 'matches'], [agents.length, agents.length === 1 ? 'agent' : 'agents'], [fit.models ? fit.models.length : 0, 'models']], { label: 'The harness board in numbers' }))
        + (empty ? kit.empty({ icon: 'trophy', title: 'No harness board yet', text: 'No harness has enough matches yet: a harness shows after it has run against others on the same tasks.' })
            : kit.section({ title: 'The harness board', count: list.length, body: `<ol class="ai-harness-board">${rows}</ol>${agents.length ? `<p class="ai-fine">An agent is named harness+model. <a href="/ai/matrix?task_kind=${encodeURIComponent(data.taskKind || 'code')}&days=${encodeURIComponent(String(data.days || 90))}">See every harness against every model</a>.</p>` : ''}` }))
        + (fit ? factorMethod(fit, data.taskKind || 'code', data.days || 90) : '');
    return page('Harness effects — AI', 'Each harness\'s effect apart from its model, with its 95% interval and games, from OpenVibe.Bench.', body, '/ai/harnesses', [{ '@context': 'https://schema.org', '@type': 'Dataset', name: 'OpenVibe harness effects', url: 'https://openvibe.compare/ai/harnesses' }]);
}

// ── /ai/matrix ──
function matrix(data = {}) {
    const fit = data.fit || null;
    const harnessList = fit ? (fit.harnesses || []) : [];
    const agents = fit ? fit.agents || [] : [];
    const models = fit ? [...(fit.models || [])].sort((a, b) => (value(b.score) == null ? -Infinity : value(b.score)) - (value(a.score) == null ? -Infinity : value(a.score))) : [];
    const shownModels = models.slice(0, 8);
    const shownHarnesses = harnessList.slice(0, 12);
    const cellOf = new Map(agents.map((a) => [`${a.harness}\u0000${a.model}`, a]));
    const bestOf = new Map();
    for (const h of shownHarnesses) for (const m of shownModels) {
        const a = cellOf.get(`${h.harness}\u0000${m.model}`);
        if (a && (bestOf.get(m.model) == null || (value(a.score) || -Infinity) > (value(bestOf.get(m.model).score) || -Infinity))) bestOf.set(m.model, a);
    }
    const tableRows = shownHarnesses.map((h) => {
        const row = { harness: `<b>${esc(h.harness)}</b><small>${esc(pointsText(h.effect))} Elo · ${esc(value(h.games) == null ? 'games not reported' : `${Number(h.games).toLocaleString('en-US')} games`)}</small>` };
        for (const m of shownModels) {
            const a = cellOf.get(`${h.harness}\u0000${m.model}`);
            if (!a) { row[`m:${m.model}`] = quiet('not run'); continue; }
            const lo = value(a.ci_lower), hi = value(a.ci_upper);
            const interval = lo != null && hi != null ? `95% interval ${Math.round(lo)}–${Math.round(hi)}` : 'interval not reported';
            const best = bestOf.get(m.model) === a;
            row[`m:${m.model}`] = `<span class="ai-cell" title="${esc(`${a.harness}+${a.model} · ${interval}`)}"><b>${esc(eloText(a.score))}</b><small>${lo != null && hi != null ? `± ${Math.round((hi - lo) / 2)}` : '—'}</small>${best ? ` ${kit.badge('best pair', 'accent')}` : ''}</span>`;
        }
        return row;
    });
    const columns = [{ key: 'harness', label: 'Harness', primary: true, html: true }].concat(shownModels.map((m) => ({ key: `m:${m.model}`, label: m.model, html: true })));
    const notable = agents.filter((a) => Math.abs(value(a.factors.interaction.score) || 0) > 30)
        .sort((a, b) => Math.abs(value(b.factors.interaction.score) || 0) - Math.abs(value(a.factors.interaction.score) || 0));
    const named = notable.slice(0, 8).map((a) => {
        const gain = value(a.factors.interaction.score) || 0;
        return `<b>${esc(a.harness)}</b> ${gain > 0 ? 'gains' : 'loses'} ${esc(Math.abs(Math.round(gain)))} points with ${esc(a.model)}`;
    }).join('; ');
    const interactionLine = notable.length
        ? `<p class="ai-interactions"><b>Interactions over 30 points:</b> ${named}${notable.length > 8 ? `; and ${notable.length - 8} more` : ''}.</p>`
        : `<p class="ai-interactions ai-fine">No interaction is over 30 points: in this fit every harness adds about the same with every model.</p>`;
    const hasCells = shownModels.length > 0 && shownHarnesses.length > 0 && agents.length > 0;
    const empty = !hasCells;
    const body = `<header class="ai-head ai-head--page"><p class="ai-kicker"><a href="/ai">AI comparison</a></p><h1>Harness × model</h1>`
        + `<p class="ai-lede">Every pair is an agent: one harness driving one model. A cell is that agent's score with its 95% interval in the tooltip; “not run” means no match has joined the two yet. The best pair for each model is marked, and interactions over 30 points are named below the table.</p>`
        + factorForm('/ai/matrix', data) + `</header>`
        + factorState(data)
        + (!fit ? '' : kit.stats([[shownHarnesses.length, 'harnesses'], [shownModels.length, 'models'], [agents.length, agents.length === 1 ? 'agent' : 'agents'], [fit.games || 0, 'games']], { label: 'The matrix in numbers' }))
        + (empty ? kit.empty({ icon: 'trophy', title: 'No agent yet', text: 'No harness × model pair has run yet: a cell fills when an agent has run on that harness and model on the same tasks.' })
            : kit.section({ title: 'The matrix', count: agents.length, body: kit.table({ caption: `Score by harness and model · ${KIND_NAME[data.taskKind] || data.taskKind || 'code'} · ${data.days || 90} days`, columns, rows: tableRows, label: 'Harness by model' }) + interactionLine }))
        + (models.length > shownModels.length ? `<p class="ai-fine">The ${shownModels.length} highest-rated models are shown; ${models.length - shownModels.length} more are in the fit.</p>` : '')
        + (fit ? factorMethod(fit, data.taskKind || 'code', data.days || 90) : '');
    return page('Harness × model — AI', 'Every harness and model as an agent, with its score, interval and interaction, from OpenVibe.Bench.', body, '/ai/matrix', [{ '@context': 'https://schema.org', '@type': 'Dataset', name: 'OpenVibe harness by model matrix', url: 'https://openvibe.compare/ai/matrix' }]);
}

// ── An agent pair: the gap, split ──
function agentCompare(data, pair) {
    const a = pair.a, b = pair.b;
    const gap = value(pair.gap) || 0;
    const lead = gap >= 0 ? a : b;
    const trail = gap >= 0 ? b : a;
    const sign = gap >= 0 ? 1 : -1;
    const part = (k) => { const n = value(pair.parts && pair.parts[k]); return n == null ? 0 : Math.round(sign * n * 10) / 10 || 0; };
    const parts = { model: part('model'), harness: part('harness'), interaction: part('interaction') };
    const gapText = Math.abs(Math.round(gap * 10) / 10);
    const sentence = gap === 0
        ? `${agentName(a)} and ${agentName(b)} are level. Of this 0-point gap, ${pointsText(parts.model)} is the model, ${pointsText(parts.harness)} the harness, ${pointsText(parts.interaction)} the two together.`
        : `${agentName(lead)} is ${gapText} Elo points ahead of ${agentName(trail)}. Of this ${gapText}-point gap, ${pointsText(parts.model)} is the model, ${pointsText(parts.harness)} the harness, ${pointsText(parts.interaction)} the two together.`;
    const negative = Object.values(parts).some((x) => x < 0);
    const sideFacts = (x) => [
        ['Harness', `<b>${esc(x.harness)}</b>`],
        ['Model', `<b>${esc(x.model)}</b>`],
        ['Agent score', agentScoreCell(x)],
        ['Model part', `${eloText(x.factors.model.score)} Elo`],
        ['Harness effect', `${pointsText(x.factors.harness.score)} Elo`],
        ['Interaction', `${pointsText(x.factors.interaction.score)} Elo`],
    ];
    const cards = [a, b].map((x) => `<article class="ai-vs-card"><h2>${agentName(x)}</h2><dl>${sideFacts(x).map(([k, val]) => `<div><dt>${esc(k)}</dt><dd>${val}</dd></div>`).join('')}</dl></article>`).join('');
    const options = data.options || [];
    const list = `<datalist id="ai-models">${options.slice(0, 500).map((o) => `<option value="${esc(o)}"></option>`).join('')}</datalist>`;
    const form = `<form class="ai-filters ai-vs-form" action="/ai/compare"><label class="ai-filter"><span>First entrant</span><input name="a" list="ai-models" value="${esc(agentSlug(a))}" required></label>`
        + `<label class="ai-filter"><span>Second entrant</span><input name="b" list="ai-models" value="${esc(agentSlug(b))}" required></label><button class="ovk-btn ovk-btn--primary">Compare</button>${list}</form>`;
    const split = { label: `Where the ${gapText}-point gap comes from`, parts };
    const canonical = pairPath(a, b);
    const body = `<header class="ai-head ai-head--page"><p class="ai-kicker"><a href="/ai">AI comparison</a></p><h1>${agentName(a)} vs ${agentName(b)}</h1>`
        + `<p class="ai-lede">Two agents on the same fit: the same model and harness contributions are added for each. ${fitNote(pair)}</p></header>`
        + availabilityBlock(data) + `<div class="ai-vs">${cards}</div>`
        + `<section class="ai-gap" aria-labelledby="ai-gap-title"><h2 id="ai-gap-title">The gap, split</h2><p class="ai-gap-say">${sentence}</p>`
        + `<div class="ai-gap-split" id="ai-gap-split"></div>`
        + (negative ? '<p class="ai-fine">A part below zero is drawn by its size; the sign is in the sentence above.</p>' : '')
        + `</section>`
        + form
        + `<p class="ai-fine">The split comes from OpenVibe.Bench's ${esc(KIND_NAME[pair.task_kind] || pair.task_kind || 'code')} fit over ${esc(String(pair.days || 365))} days (${esc(Number(pair.matches || 0).toLocaleString('en-US'))} matches).${pair.method ? ` ${esc(pair.method)}.` : ''} <a href="/ai/harnesses?task_kind=${encodeURIComponent(pair.task_kind || 'code')}&days=${encodeURIComponent(String(pair.days || 365))}">Every harness effect</a> · <a href="/ai/matrix?task_kind=${encodeURIComponent(pair.task_kind || 'code')}&days=${encodeURIComponent(String(pair.days || 365))}">The matrix</a>.</p>`
        + `<script type="application/json" id="ai-gap-data">${jsonData(split)}</script><script src="/ai-factors.js" defer></script>`
        + mineNote('Compared them yourself?');
    return page(`${agentSlug(a)} vs ${agentSlug(b)}`, `${agentSlug(a)} vs ${agentSlug(b)}: the score gap split into model, harness and interaction.`, body, canonical, [{ '@context': 'https://schema.org', '@type': 'Dataset', name: `${agentSlug(a)} vs ${agentSlug(b)}`, url: `https://openvibe.compare${canonical}` }]);
}

function fitNote(pair) {
    return `${esc(KIND_NAME[pair.task_kind] || pair.task_kind || 'Code')} · ${esc(String(pair.days || 365))} days · ${esc(Number(pair.games || 0).toLocaleString('en-US'))} games.`;
}


// ── The Bench pages (/ai/:ref): a task kind's board or one benchmark ──
const JUDGE_SHORT = { human_pairwise: 'blind votes', audience_poll: 'audience polls', rubric: 'a rubric', automatic_grader: 'a grader', test_suite: 'a test suite', game_outcome: 'game results' };
const ROOM_HOSTS = { chat: 'openvibe.chat', games: 'openvibe.games', search: 'search.openvibe.network', codes: 'openvibe.codes' };
const rowsOf = (read) => (read && read.data && read.data.board && Array.isArray(read.data.board.rows) ? read.data.board.rows : []);
const played = (rows) => {
    const list = rows || [];
    if (!list.some((r) => r && r.games != null)) return list.length > 0;
    return list.some((r) => (value(r && r.games) || 0) > 0);
};
const roomName = (id) => { const s = String(id || ''); return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; };
const howRated = (kind) => `Rated by ${JUDGE_SHORT[kind && kind.judge] || 'Bench'}`;
const METHOD = 'Ratings are Bradley–Terry Elo from Bench, with a 95% interval; a model with fewer than ten games is provisional.';
const modelPath = (model) => `/ai/models/${encodeURIComponent(model)}`;
const modelLink = (subject) => `<a href="${modelPath(subject)}">${esc(subject)}</a>`;
const dayTime = (s) => { const t = Date.parse(String(s || '')); return Number.isFinite(t) ? `${new Date(t).toISOString().slice(0, 10)} ${new Date(t).toISOString().slice(11, 16)} UTC` : String(s || ''); };
const usd = (x) => { const n = value(x); if (n == null) return '—'; if (!n) return '$0'; const a = Math.abs(n); if (a >= 1000) return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`; if (a >= 1) return `$${n.toFixed(2)}`; return `$${Number(n.toPrecision(2))}`; };
const scoreText = (x) => value(x) == null ? '—' : `${Math.round(Number(x) * 10) / 10}`;
const scoreCell = (x) => value(x) == null ? '—' : `<span title="${esc(String(x))} / score from Bench">${esc(scoreText(x))}</span>`;
const moneyCell = (x) => value(x) == null ? '—' : `<span title="${esc(String(x))} USD from Bench">${esc(usd(x))}</span>`;
function msText(x) {
    const n = value(x);
    if (n == null) return '—';
    if (n >= 60_000) return `${(n / 60_000).toFixed(n >= 600_000 ? 0 : 1).replace(/\.0$/, '')} min`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, '')} s`;
    return `${Math.round(n)} ms`;
}
const benchSpeedCell = (x) => value(x) == null ? '—' : `<span title="${esc(`${value(x)} ms from Bench`)}">${esc(msText(x))}</span>`;
const benchShare = (x) => { const n = value(x); return n == null ? '—' : `${Math.round(n * 100)}%`; };
const lastRunText = (x) => x ? `Last run ${dayTime(x)}` : 'No runs yet';
const provenanceCell = (p) => p === 'verified' ? '<span class="ai-fine">verified</span>' : p === 'submitted' ? '<span class="ai-flag">submitted</span>' : '—';
const byKindFromOverview = (overview) => {
    const map = new Map();
    for (const b of overview && Array.isArray(overview.list) ? overview.list : []) {
        if (!b || !b.kind || !b.last_run) continue;
        if (!map.has(b.kind) || String(b.last_run) > String(map.get(b.kind))) map.set(b.kind, b.last_run);
    }
    return map;
};
function frontier(rows, xKey, yKey) {
    return rows.map((r) => {
        const x = value(r[xKey]);
        const y = value(r[yKey]);
        const best = x != null && y != null && !rows.some((o) => {
            if (o === r) return false;
            const ox = value(o[xKey]);
            const oy = value(o[yKey]);
            return ox != null && oy != null && ox <= x && oy >= y && (ox < x || oy > y);
        });
        return { ...r, frontier: best, cost: x, quality: y };
    });
}
function paretoRows(pareto, cost) {
    const costs = new Map(rowsOf(cost).map((r) => [r.subject, value(r.cost_per_solved)]));
    const rows = rowsOf(pareto).map((r) => ({ ...r, quality: value(r.quality), costPerSolved: costs.get(r.subject) }));
    return frontier(rows.map((r) => ({ ...r, x: r.costPerSolved, y: r.quality })), 'x', 'y');
}
function paretoChart(rows) {
    const points = rows.filter((r) => r.quality != null && r.costPerSolved != null && r.costPerSolved >= 0);
    if (!points.length) return '<p class="ai-fine">No quality and cost per solved pairs yet.</p>';
    return kit.chart({
        type: 'scatter', title: 'Quality against cost per solved task', note: 'Up and to the left is better. The dashed line joins the models nothing beats on both.',
        x: { label: 'Cost per solved task (USD, lower is better)', fmt: (x) => usd(x) }, y: { label: 'Quality', fmt: (x) => `${Math.round(x)}%`, zero: false },
        points: points.map((r) => ({ label: r.subject, x: r.costPerSolved, y: r.quality * 100, best: r.frontier, mark: r.frontier || points.length <= 8, href: modelPath(r.subject) })),
        height: 260,
    });
}
function scoreCostChart(entries) {
    const rows = frontier(entries.filter((r) => value(r.cost_usd) != null && value(r.score) != null).map((r) => ({ ...r, x: value(r.cost_usd), y: value(r.score) })), 'x', 'y');
    if (!rows.length) return '';
    return kit.chart({
        type: 'scatter', title: 'Score against cost per run', note: 'Up and to the left is better. The dashed line joins the models nothing beats on both.',
        x: { label: 'Median cost of a run (USD, lower is better)', fmt: (x) => usd(x) }, y: { label: 'Score (0–100)', fmt: (x) => `${Math.round(x)}`, zero: false },
        points: rows.map((r) => ({ label: r.model, x: r.cost, y: r.quality, best: r.frontier, mark: r.frontier || rows.length <= 8, href: modelPath(r.model) })),
        height: 260,
    });
}
const TABS = [{ key: 'elo', label: 'Ranking' }, { key: 'pareto', label: 'Quality and cost' }, { key: 'cost', label: 'Cost per solved' }];

function emptyFor(kind) {
    const host = kind && kind.judge === 'human_pairwise' ? ROOM_HOSTS[kind.room] : null;
    if (host) return kit.empty({ icon: 'trophy', title: 'No votes yet', text: `This board fills as people compare two answers blind on ${roomName(kind.room)} and pick the better one.`, action: { href: `https://${host}/`, label: `Vote on ${roomName(kind.room)}`, icon: 'forward' } });
    return kit.empty({ icon: 'trophy', title: 'No results yet', text: kind ? `This board fills as models are run and ${JUDGE_SHORT[kind.judge] || 'Bench'} scores them.` : 'This board fills as models are run on Bench.' });
}

function boardPage(data = {}) {
    const { kindId, kind, tab, board: boardRead, cost, kinds, benchmarks, rankings = [], runs, overview } = data;
    const name = kind && kind.name || kindId;
    const rows = rowsOf(boardRead);
    const lastByKind = byKindFromOverview(readData(overview) || {});
    const kindLast = lastByKind.get(kindId) || null;
    const latest = readData(runs);
    const latestRows = latest && Array.isArray(latest.runs) ? latest.runs : [];
    const list = readData(benchmarks);
    const kindBenchmarks = list && Array.isArray(list.benchmarks) ? list.benchmarks.filter((x) => x.kind === kindId) : [];
    const byModel = new Map();
    kindBenchmarks.forEach((b, i) => {
        const r = readData(rankings[i]);
        const entries = r && r.rankings && Array.isArray(r.rankings.entries) ? r.rankings.entries : [];
        for (const e of entries) {
            if (!byModel.has(e.model)) byModel.set(e.model, { model: e.model, scores: [], costs: [], times: [], runs: 0, last_run: null });
            const x = byModel.get(e.model);
            if (value(e.score) != null) x.scores.push(value(e.score));
            if (value(e.cost_usd) != null) x.costs.push(value(e.cost_usd));
            if (value(e.ms) != null) x.times.push(value(e.ms));
            x.runs += Number(e.runs) || 0;
            if (e.last_run && (!x.last_run || e.last_run > x.last_run)) x.last_run = e.last_run;
        }
    });
    const median = (list) => { const s = list.filter((x) => x != null).sort((a, b) => a - b); if (!s.length) return null; const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
    const registryRows = [...byModel.values()].map((x) => ({ model: x.model, score: median(x.scores), cost: median(x.costs), speed: median(x.times), runs: x.runs, last_run: x.last_run })).sort((a, b) => (b.score == null ? -1 : b.score) - (a.score == null ? -1 : a.score) || a.model.localeCompare(b.model));
    const registryTable = registryRows.length ? kit.table({ caption: 'Published runs on this kind', columns: [
        { key: 'model', label: 'Model', primary: true, html: true }, { key: 'score', label: 'Median score', num: true, html: true },
        { key: 'runs', label: 'Runs', num: true, fmt: 'int' }, { key: 'cost', label: 'Cost/run', num: true, html: true },
        { key: 'speed', label: 'Speed/run', num: true, html: true }, { key: 'last', label: 'Last run', html: true },
    ], rows: registryRows.map((r) => ({ model: modelLink(r.model), score: scoreText(r.score), runs: r.runs, cost: moneyCell(r.cost), speed: benchSpeedCell(r.speed), last: r.last_run ? esc(dayTime(r.last_run)) : '—' })) }) : '';
    let content;
    if (!boardRead) content = kit.empty({ icon: 'trophy', title: 'Bench is unavailable', text: 'This board comes back as soon as Bench answers.' });
    else if (!played(rows) && registryRows.length) content = kit.notice({ kind: 'info', text: `No blind vote on this task kind yet. ${registryRows.length} ${registryRows.length === 1 ? 'model has' : 'models have'} verified runs below.` });
    else if (!played(rows)) content = emptyFor(kind);
    else if (tab === 'pareto') {
        const points = paretoRows(boardRead, cost);
        content = paretoChart(points) + (points.length ? kit.table({ caption: 'The numbers', columns: [
            { key: 'm', label: 'Model', primary: true, html: true }, { key: 'q', label: 'Quality', num: true, html: true },
            { key: 'c', label: 'Cost per solved', num: true, html: true }, { key: 'speed', label: 'Speed/run', num: true, html: true },
        ], rows: points.map((r) => ({ m: `${modelLink(r.subject)}${r.frontier ? ` ${kit.badge('frontier', 'accent')}` : ''}`, q: benchShare(r.quality), c: usd(r.costPerSolved), speed: benchSpeedCell(r.median_ms) })) }) : '');
    } else if (tab === 'cost') {
        const crows = rowsOf(cost).length ? rowsOf(cost) : rows;
        content = kit.table({ caption: 'Cost per solved task', columns: [
            { key: 'm', label: 'Model', primary: true, html: true }, { key: 'solved', label: 'Solved', num: true, fmt: 'int' },
            { key: 'entries', label: 'Entries', num: true, fmt: 'int' }, { key: 'total', label: 'Total cost', num: true, html: true },
            { key: 'per', label: 'Cost per solved', num: true, html: true }, { key: 'speed', label: 'Speed/run', num: true, html: true },
        ], rows: crows.map((r) => ({ m: modelLink(r.subject), solved: r.solved, entries: r.entries, total: usd(r.total_cost_usd), per: usd(r.cost_per_solved), speed: benchSpeedCell(r.median_ms) })) });
    } else {
        const floor = Math.floor((Math.min(...rows.map((r) => value(r.ci_lower) == null ? value(r.elo) == null ? 0 : value(r.elo) : value(r.ci_lower))) - 25) / 50) * 50;
        content = kit.rank({ label: `${name}: ranking`, base: floor, fmt: 'int', items: rows.map((r) => {
            const lo = value(r.ci_lower), hi = value(r.ci_upper), elo = value(r.elo);
            const costText = value(r.median_cost_usd) != null ? `${usd(r.median_cost_usd)}/run` : null;
            const speedText = value(r.median_ms) != null ? `${msText(r.median_ms)}/run` : null;
            return { name: r.subject, href: modelPath(r.subject), value: elo, interval: lo != null && hi != null && elo != null ? Math.round(Math.max(hi - elo, elo - lo)) : null,
                note: [value(r.games) != null ? `${Number(r.games).toLocaleString('en-US')} games` : '', value(r.win_rate) != null ? `${share(r.win_rate)} won` : '', costText, speedText, value(r.games) != null && Number(r.games) < 10 ? 'provisional' : ''].filter(Boolean).join(' · ') };
        }) }) + `<p class="ai-fine">${esc(METHOD)}</p>`
            + kit.table({ caption: 'Quality, price and speed side by side', columns: [
                { key: 'm', label: 'Model', primary: true, html: true }, { key: 'q', label: 'Quality', num: true, html: true },
                { key: 'games', label: 'Games', num: true, fmt: 'int' }, { key: 'won', label: 'Won', num: true, html: true },
                { key: 'cost', label: 'Cost/run', num: true, html: true }, { key: 'speed', label: 'Speed/run', num: true, html: true },
            ], rows: rows.map((r) => ({ m: modelLink(r.subject), q: `<span title="95% interval ${esc(`${r.ci_lower}–${r.ci_upper}`)}">${esc(r.elo == null ? '—' : Math.round(r.elo))}</span>`, games: r.games, won: benchShare(r.win_rate), cost: moneyCell(r.median_cost_usd), speed: benchSpeedCell(r.median_ms) })) });
    }
    const lastRunTable = latestRows.length ? kit.table({
        caption: 'Latest runs of this kind', columns: [
            { key: 'model', label: 'Model', primary: true, html: true }, { key: 'score', label: 'Score', num: true, html: true },
            { key: 'cost', label: 'Cost', num: true, html: true }, { key: 'speed', label: 'Time', num: true, html: true },
            { key: 'when', label: 'Published', html: true }, { key: 'how', label: 'How', html: true },
        ],
        rows: latestRows.map((r) => ({ model: modelLink(r.model), score: scoreCell(r.score), cost: usd(r.cost_usd), speed: benchSpeedCell(r.ms), when: esc(dayTime(r.created_at)), how: provenanceCell(r.provenance) })),
    }) : '<p class="ai-fine">No run of this task kind has been published yet.</p>';
    const head = kit.head({ title: name, sub: kind ? `${roomName(kind.room)} · ${howRated(kind)}${kindLast ? ` · ${lastRunText(kindLast)}` : ''}` : 'Bench results', back: { href: '/ai', label: 'AI' },
        tabs: played(rows) ? kit.tabs({ base: `/ai/${encodeURIComponent(kindId)}`, items: TABS, active: tab, label: 'Board view' }) : '' });
    const body = head + benchState(data.stale)
        + `<section aria-label="${esc(TABS.find((t) => t.key === tab)?.label || 'Board')}">${content}</section>`
        + (registryRows.length ? kit.section({ title: 'Verified runs on this task kind', count: registryRows.length, body: (registryRows.length > 1 ? scoreCostChart(registryRows.map((r) => ({ model: r.model, score: r.score, cost_usd: r.cost, ms: r.speed, runs: r.runs, last_run: r.last_run }))) : '') + registryTable }) : '')
        + kit.section({ title: 'Latest runs', count: latestRows.length, body: lastRunTable })
        + `<p class="ai-fine">Download the <a href="${BENCH}/api/v1/datasets/${encodeURIComponent(kindId)}.jsonl">dataset JSONL</a> from Bench.</p>`
        + mineNote('Ran this task kind yourself?');
    return page(`${name}: AI`, `${name}: which AI does it best, what it costs and how fast it is.`, body, `/ai/${encodeURIComponent(kindId)}`);
}

function benchmarkPage(data = {}) {
    const b = readData(data.benchmark);
    const rank = readData(data.rankings);
    const latest = readData(data.runs);
    const entries = rank && rank.rankings && Array.isArray(rank.rankings.entries) ? rank.rankings.entries : [];
    const latestRows = latest && Array.isArray(latest.runs) ? latest.runs : [];
    const meta = b && b.benchmark ? b.benchmark : null;
    const definition = b && b.definition ? b.definition : null;
    const tasks = definition && Array.isArray(definition.tasks) ? definition.tasks : [];
    const version = b && b.version ? b.version.version : null;
    const last = entries.reduce((at, e) => (!at || (e.last_run && e.last_run > at) ? e.last_run : at), null) || (latestRows[0] && latestRows[0].created_at) || null;
    if (!meta) {
        const body = kit.head({ title: 'Benchmark', sub: 'Bench results', back: { href: '/ai', label: 'AI' }, sticky: false })
            + benchState(data.stale) + kit.empty({ icon: 'trophy', title: 'Bench is unavailable', text: 'This benchmark comes back as soon as Bench answers.' });
        return page('AI benchmark', 'A benchmark of AI runs from OpenVibe.Bench.', body, '/ai');
    }
    const chart = scoreCostChart(entries);
    const leaderboardTable = entries.length ? kit.table({
        caption: 'Verified results', columns: [
            { key: 'model', label: 'Model', primary: true, html: true }, { key: 'score', label: 'Score', num: true, html: true },
            { key: 'runs', label: 'Runs', num: true, fmt: 'int' }, { key: 'range', label: 'Best / worst', num: true, html: true },
            { key: 'cost', label: 'Cost/run', num: true, html: true }, { key: 'speed', label: 'Speed/run', num: true, html: true },
            { key: 'solved', label: 'Cost per solved', num: true, html: true }, { key: 'last', label: 'Last run', html: true },
        ],
        rows: entries.map((e) => ({
            model: modelLink(e.model), score: scoreCell(e.score), runs: e.runs,
            range: `${scoreCell(e.max_score)} / ${scoreCell(e.min_score)}`, cost: moneyCell(e.cost_usd), speed: benchSpeedCell(e.ms),
            solved: moneyCell(e.cost_per_solved), last: e.last_run ? esc(dayTime(e.last_run)) : '—',
        })),
    }) : kit.empty({ icon: 'trophy', title: 'No verified results yet', text: 'This benchmark has no verified run yet. Submitted runs are labelled on the latest-runs list and never mixed into the ranking.' });
    const latestTable = latestRows.length ? kit.table({
        caption: 'Latest runs', columns: [
            { key: 'model', label: 'Model', primary: true, html: true }, { key: 'score', label: 'Score', num: true, html: true },
            { key: 'cost', label: 'Cost', num: true, html: true }, { key: 'speed', label: 'Time', num: true, html: true },
            { key: 'when', label: 'Published', html: true }, { key: 'how', label: 'How', html: true },
        ],
        rows: latestRows.map((r) => ({ model: modelLink(r.model), score: scoreCell(r.score), cost: usd(r.cost_usd), speed: benchSpeedCell(r.ms), when: esc(dayTime(r.created_at)), how: provenanceCell(r.provenance) })),
    }) : '<p class="ai-fine">No run has been published on this benchmark yet.</p>';
    const body = kit.head({ title: meta.title, sub: `${meta.kind || 'Benchmark'}${version ? ` · version ${version}` : ''} · ${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'} · ${lastRunText(last)}`, back: { href: '/ai', label: 'AI' }, sticky: false })
        + benchState(data.stale)
        + (meta.description ? `<p class="ai-lede">${esc(meta.description)}</p>` : '')
        + kit.stats([[entries.length, entries.length === 1 ? 'model ranked' : 'models ranked'], [latestRows.length, 'latest runs'], [tasks.length, tasks.length === 1 ? 'task' : 'tasks'], [last ? dayTime(last) : 'No runs yet', 'last run']], { label: `${meta.title} in numbers` })
        + chart + leaderboardTable
        + kit.section({ title: 'Latest runs', count: latestRows.length, body: latestTable })
        + `<p class="ai-fine"><a href="/ai/method">How the runs are judged</a> · <a href="/ai/compare?models=${entries.slice(0, 3).map((e) => encodeURIComponent(e.model)).join(',')}">Compare the leaders</a> · <a href="${BENCH}/api/v1/datasets/benchmarks.jsonl">Bench's open data</a></p>`
        + mineNote('Ran this benchmark yourself?');
    return page(`${meta.title}: AI benchmark`, `${meta.title}: verified AI results, cost and speed from OpenVibe.Bench.`, body, `/ai/${encodeURIComponent(meta.id)}`);
}

function methodPage(data = {}) {
    const o = readData(data.overview) || {};
    const list = data.kinds && data.kinds.data && Array.isArray(data.kinds.data.kinds) ? data.kinds.data.kinds : [];
    const byJudge = new Map();
    for (const k of list) {
        if (!byJudge.has(k.judge)) byJudge.set(k.judge, []);
        byJudge.get(k.judge).push(k);
    }
    const judgeRows = [...byJudge.entries()].map(([judge, ks]) => ({
        how: `<b>${esc(JUDGE_SHORT[judge] || judge)}</b>`, judge: esc(judge), jobs: esc(ks.map((k) => k.name || k.id).join(', ')),
    }));
    const body = kit.head({ title: 'How the AI results are judged', sub: 'The method behind every score, price and speed on these pages', back: { href: '/ai', label: 'AI' }, sticky: false })
        + benchState(data.stale)
        + `<section class="ai-method"><h2>What a score means</h2>
<p>A score is a run’s result on one benchmark, from 0 to 100. Bench’s frozen benchmark version names its tasks, its judges and how the task scores combine; the default is the mean of the task scores. A model’s score on a benchmark is the median of its <b>verified</b> runs, so one bad run does not decide the page. The best and worst columns are the runs themselves, not a second estimate.</p>
<h2>Quality, price and speed</h2>
<p><b>Quality</b> is that score. <b>Price</b> is the median cost of a run in US dollars, as the service that ran it published it; <b>cost per solved</b> is the run’s cost divided by its success rate (score ÷ 100), so it is the price of one solved task. <b>Cost per solved</b> is the same figure, named plainly. <b>Speed</b> is the median wall-clock time of a run. The quality-against-cost chart marks the frontier: the models nothing beats on both.</p>
<h2>How runs are judged</h2>
<p>Each task kind has one main judge. A benchmark may also name more judges in its definition; the exact list is in its public definition at <code>/api/v1/benchmarks/:id</code>.</p>
${judgeRows.length ? kit.table({ caption: 'Judges in use', columns: [{ key: 'how', label: 'How', html: true }, { key: 'judge', label: 'Bench judge' }, { key: 'jobs', label: 'Task kinds' }], rows: judgeRows }) : `<p class="ai-fine">${esc('Bench did not answer its kind list; the judge rules above are its published contract.')}</p>`}
<h2>Verified and submitted</h2>
<p>A <b>verified</b> run was executed by a service (openvibe.codes, Run, a Node worker); a <b>submitted</b> run was posted with a person’s token. The rankings read verified runs only, and a submitted run is labelled wherever the latest runs are listed.</p>
<h2>Model and harness, apart</h2>
<p>An agent is a harness driving a model, so an agent score has two parts. Bench's factor board fits <code>agent = model + harness + model×harness</code> over the same matches, with partial pooling and a 95% interval on each part; the neutral harness <code>ov-bare</code> is the zero when it appears (otherwise the effects are centred), so a harness's effect is in Elo points against that zero. A negative interaction says the harness adds less with that model than it does on average. <a href="/ai/harnesses">The harness board</a> and <a href="/ai/matrix">the harness × model matrix</a> draw those numbers; an agent pair's page splits its gap into the three parts.</p>
<h2>How often, and what is missing</h2>
<p>${o.runs == null ? 'Bench did not answer the public counts.' : `${Number(o.benchmarks || 0).toLocaleString('en-US')} public ${o.benchmarks === 1 ? 'benchmark' : 'benchmarks'}, ${Number(o.tasks || 0).toLocaleString('en-US')} ${o.tasks === 1 ? 'task' : 'tasks'}, ${Number(o.runs || 0).toLocaleString('en-US')} ${o.runs === 1 ? 'run' : 'runs'} from ${Number(o.models || 0).toLocaleString('en-US')} ${o.models === 1 ? 'model' : 'models'}; the newest run was ${o.last_run ? esc(dayTime(o.last_run)) : 'never published'}.`}</p>
<p class="ai-fine">A model with no verified run has no score here; a benchmark with no run says so. The public reads are Bench’s API at <a href="${BENCH}/docs">bench.openvibe.services/docs</a>; the open data is <a href="${BENCH}/api/v1/datasets/benchmarks.jsonl">benchmarks.jsonl</a> and the per-kind datasets. <a href="/ai/feed.xml">New results (RSS)</a> · <a href="https://openvibe.report/api/v1/ai/results">the same as JSON</a>.</p>`;
    return page('How the AI results are judged', 'The method behind OpenVibe.Bench’s scores, costs and speeds, and how to read them.', body, '/ai/method');
}

// ── /ai/feed.xml ──
function rss({ runs, overview, base = 'https://openvibe.compare' } = {}) {
    const xml = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const list = runs && runs.data && Array.isArray(runs.data.runs) ? runs.data.runs : [];
    const titles = new Map((overview && overview.data && Array.isArray(overview.data.list) ? overview.data.list : []).map((b) => [b.id, b.title]));
    const site = String(base || 'https://openvibe.compare').replace(/\/+$/, '');
    const unavailable = runs && runs.data ? '' : ' OpenVibe.Bench did not answer; no runs are listed.';
    const items = list.map((r) => {
        const title = `${r.model} on ${titles.get(r.benchmark_id) || r.benchmark_id}`;
        const link = `${site}/ai/${encodeURIComponent(r.benchmark_id)}`;
        const score = r.score == null ? 'no score' : `${Math.round(Number(r.score) * 10) / 10}/100`;
        const cost = r.cost_usd == null ? 'cost not given' : `$${Number(r.cost_usd).toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}`;
        const speed = r.ms == null ? 'time not given' : `${Math.round(Number(r.ms))} ms`;
        const at = Date.parse(r.created_at);
        return `<item><title>${xml(title)}</title><link>${xml(link)}</link><guid isPermaLink="false">${xml(r.id)}</guid>${Number.isFinite(at) ? `<pubDate>${new Date(at).toUTCString()}</pubDate>` : ''}<description>${xml(`${r.model} scored ${score} on ${titles.get(r.benchmark_id) || r.benchmark_id}, for ${cost} in ${speed} (${r.provenance || 'run'}).`)}</description></item>`;
    }).join('');
    const newest = list.length ? Date.parse(list[0].created_at) : NaN;
    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>OpenVibe AI: new results</title><link>${xml(`${site}/ai`)}</link><description>Verified and submitted AI runs as OpenVibe.Bench publishes them.${xml(unavailable)}</description><language>en</language>${Number.isFinite(newest) ? `<lastBuildDate>${new Date(newest).toUTCString()}</lastBuildDate>` : ''}${items}</channel></rss>`;
}

module.exports = {
    hub, leaderboard, providers, model, compare, boardPage, benchmarkPage, methodPage, rss, harnesses, matrix,
    availabilityBlock, measuredNote, benchState, page, scriptLd, PARTS_CSS,
};
