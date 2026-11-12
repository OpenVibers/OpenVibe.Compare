'use strict';
/** The /compute page: filters, sorts and a side-by-side over Exchange's reviewed compute prices. */
const kit = require('openvibe-shared/kit');
const { PAGE, MONTH_HOURS, select, href, label } = require('./compute');

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const json = (v) => JSON.stringify(v).replace(/</g, '\\u003c');
const day = (iso) => (iso ? iso.slice(0, 10) : '—');
const month = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—');
const money = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return '—';
    const digits = Math.abs(n) >= 1 ? 2 : 4;
    return `$${n.toFixed(digits).replace(/\.?0+$/, '')}`;
};
const precise = (v) => { const n = Number(v); return Number.isFinite(n) ? `$${n.toFixed(8).replace(/\.?0+$/, '')}` : '—'; };
const gb = (mb) => (Number.isFinite(Number(mb)) && Number(mb) > 0 ? `${Math.round(Number(mb) / 1024 * 10) / 10} GB` : null);
const memory = (o) => (o.kind === 'gpu' ? [o.gpu, gb(o.gpu_mb)].filter(Boolean).join(' · ') : [o.cpu ? `${o.cpu} vCPU` : null, gb(o.ram_mb)].filter(Boolean).join(' · '));
const checkedLabel = (c) => (c.checked_days_ago == null ? 'at an unknown date' : c.checked_days_ago === 0 ? 'today' : c.checked_days_ago === 1 ? '1 day ago' : `${c.checked_days_ago} days ago`);
const offerName = (o) => `${o.provider} ${memory(o) || label(o.kind)}${o.kind === 'gpu' ? ` (${o.interruptible ? 'interruptible' : 'on demand'})` : ''}`;
const badge = (text, tone = '') => kit.badge(text, tone);

function cheapestLine(compute) {
    const pick = (kind) => compute.offers.find((o) => o.id === compute.cheapest[kind]);
    const parts = [];
    for (const kind of ['gpu', 'cpu']) {
        const o = pick(kind);
        if (o) parts.push(`cheapest ${kind === 'gpu' ? 'GPU' : 'computer'}: <strong>${esc(o.provider)} ${esc(memory(o) || '')}</strong> at ${money(o.hourly)}/hour`);
    }
    return parts.length ? ` · ${parts.join(' · ')}` : '';
}

function sortNav(q) {
    const sorts = [['hourly', 'price per hour'], ['gpu-hour', 'price per GPU GB-hour'], ['month', 'price per month (24/7)']];
    return `<nav class="compute-sort" aria-label="Sort prices"><span>Sort by</span>${sorts.map(([v, l]) => `<a href="${esc(href(q, { sort: v }))}"${q.sort === v ? ' aria-current="true"' : ''}>${esc(l)}</a>`).join('')}</nav>`;
}

function pickLink(o, q) {
    const picked = q.pick.includes(o.id);
    if (picked) return { href: href(q, { pick: q.pick.filter((id) => id !== o.id) }), label: 'Remove from side-by-side' };
    if (q.pick.length >= 3) return { href: null, label: 'Side-by-side is full (3)' };
    return { href: href(q, { pick: [...q.pick, o.id] }), label: 'Add to side-by-side' };
}

function flags(o) {
    return [
        o.cheapest ? badge(`Cheapest ${o.kind === 'gpu' ? 'GPU' : 'computer'}`, 'ok') : '',
        o.interruptible ? badge('Interruptible') : '',
        o.expired ? badge('Review overdue', 'warn') : '',
    ].filter(Boolean).join('');
}

function useLinks() {
    return `<span class="compute-use-links">Use it on OpenVibe: <a href="https://openvibe.exchange/models">models on Exchange</a> · <a href="https://openvibe.run/">computers on Run</a></span>`;
}

function card(o, q) {
    const p = pickLink(o, q);
    return `<article class="ovk-card compute-card" data-offer="${esc(o.id)}">
<h2><span>${esc(o.provider)}</span> <small class="compute-kind">${label(o.kind)}</small>${flags(o)}</h2>
<p class="compute-price"><b>${money(o.hourly)}</b> per hour</p>
<dl class="compute-facts">
<div><dt>${o.kind === 'gpu' ? 'GPU' : 'Computer'}</dt><dd>${esc(memory(o) || 'Not stated')}</dd></div>
<div><dt>Region</dt><dd>${esc(o.region || 'Not stated')}</dd></div>
<div><dt>Per month (${MONTH_HOURS} h, 24/7)</dt><dd>${money(o.monthly_24_7)}</dd></div>
<div><dt>${o.kind === 'gpu' ? 'Per GPU GB-hour' : 'Per second'}</dt><dd>${o.kind === 'gpu' && o.hourly_per_gpu_gb != null ? money(o.hourly_per_gpu_gb) : precise(o.per_second)}</dd></div>
<div><dt>Checked</dt><dd><time datetime="${esc(o.checked_at)}">${day(o.checked_at)}</time></dd></div>
<div><dt>Billing</dt><dd>${o.billing_seconds ? `per second (${o.billing_seconds} s) ` : 'per second'}</dd></div>
</dl>
${o.promotion ? `<p class="compute-promo">${esc(o.promotion)}${o.promotion_expires ? ` (ends ${esc(day(o.promotion_expires))})` : ''}</p>` : ''}
${o.expired ? `<p class="compute-overdue">Review date passed <time datetime="${esc(o.expires_at)}">${esc(month(o.expires_at))}</time>: this is the last reviewed price, not a re-checked one.</p>` : ''}
<p class="compute-links"><a href="${esc(o.source)}">Provider price</a>${p.href ? ` · <a href="${esc(p.href)}" rel="nofollow">${esc(p.label)}</a>` : ` · <span>${esc(p.label)}</span>`}</p>
<p class="compute-use">${useLinks()}</p>
</article>`;
}

function table(offers, q) {
    return `<div class="compute-table"><table><caption>Compute prices, cheapest first</caption><thead><tr><th scope="col">Provider</th><th scope="col">Kind and resources</th><th scope="col">Region</th><th scope="col">Per hour</th><th scope="col">Per GPU GB-hour</th><th scope="col">Per month (${MONTH_HOURS} h)</th><th scope="col">Notes</th><th scope="col">Side-by-side</th></tr></thead><tbody>${offers.map((o) => {
        const p = pickLink(o, q);
        return `<tr data-offer="${esc(o.id)}"><th scope="row"><a href="${esc(o.source)}">${esc(o.provider)}</a><br><small>${esc(o.id)}</small></th><td>${esc(memory(o) || 'Not stated')}</td><td>${esc(o.region || '—')}</td><td class="compute-num">${money(o.hourly)}</td><td class="compute-num">${o.hourly_per_gpu_gb != null ? money(o.hourly_per_gpu_gb) : '—'}</td><td class="compute-num">${money(o.monthly_24_7)}</td><td>${flags(o) || '—'}${o.promotion ? `<br><small>${esc(o.promotion)}</small>` : ''}${o.expired ? `<br><small>Review date passed ${esc(day(o.expires_at))}</small>` : ''}</td><td>${p.href ? `<a href="${esc(p.href)}" rel="nofollow">${esc(q.pick.includes(o.id) ? 'Remove' : 'Add')}</a>` : '—'}</td></tr>`;
    }).join('')}</tbody></table></div>`;
}

function sideBySide(picks, q) {
    const rows = [
        ['Kind', (o) => label(o.kind)],
        ['Resources', (o) => esc(memory(o) || '—')],
        ['Region', (o) => esc(o.region || '—')],
        ['Per hour', (o) => money(o.hourly)],
        ['Per second', (o) => precise(o.per_second)],
        ['Per month (24/7)', (o) => money(o.monthly_24_7)],
        ['Per GPU GB-hour', (o) => (o.hourly_per_gpu_gb != null ? money(o.hourly_per_gpu_gb) : '—')],
        ['Interruptible', (o) => (o.interruptible ? 'Yes' : 'No')],
        ['Billing', (o) => esc(o.billing_seconds ? `per second (${o.billing_seconds} s)` : 'per second')],
        ['Promotion', (o) => (o.promotion ? esc(o.promotion) : '—')],
        ['Checked', (o) => `<time datetime="${esc(o.checked_at)}">${day(o.checked_at)}</time>`],
        ['Review due', (o) => `<time datetime="${esc(o.expires_at)}">${esc(day(o.expires_at))}</time>${o.expired ? ` ${badge('Overdue', 'warn')}` : ''}`],
        ['Provider price', (o) => `<a href="${esc(o.source)}">${esc(o.provider)}</a>`],
        ['Use it on OpenVibe', () => `<a href="https://openvibe.exchange/models">models on Exchange</a> · <a href="https://openvibe.run/">computers on Run</a>`],
    ];
    return `<section class="compute-side" id="side-by-side" aria-labelledby="side-title"><h2 id="side-title">Side-by-side</h2><p>Two or three picks, the facts that differ.</p><div class="compute-side-scroll"><table><caption>${picks.length} offers side by side</caption><thead><tr><th scope="col">Field</th>${picks.map((o) => `<th scope="col">${esc(o.provider)}<br><small>${esc(memory(o) || label(o.kind))}${o.kind === 'gpu' ? ` · ${o.interruptible ? 'interruptible' : 'on demand'}` : ''}</small><br><a href="${esc(href(q, { pick: q.pick.filter((id) => id !== o.id) }))}">Remove</a></th>`).join('')}</tr></thead><tbody>${rows.map(([name, value]) => `<tr><th scope="row">${name}</th>${picks.map((o) => `<td>${value(o)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`;
}

function filters(compute, q) {
    const gpus = [...new Set(compute.offers.map((o) => o.gpu).filter(Boolean))].sort();
    const regions = [...new Set(compute.offers.map((o) => o.region).filter(Boolean))].sort();
    if (q.gpu && !gpus.includes(q.gpu)) gpus.push(q.gpu);
    if (q.region && !regions.includes(q.region)) regions.push(q.region);
    return `<form class="compute-filters" method="get" action="/compute"><fieldset><legend>Filter prices</legend>
${kit.selectRow({ name: 'kind', label: 'Kind', options: [['', 'GPUs and computers'], ['gpu', 'GPUs'], ['cpu', 'Computers']], value: q.kind })}
${kit.selectRow({ name: 'gpu', label: 'GPU model', options: [['', 'Any GPU model'], ...gpus.map((g) => [g, g])], value: q.gpu })}
${kit.selectRow({ name: 'region', label: 'Region', options: [['', 'Any region'], ...regions.map((r) => [r, r])], value: q.region })}
${kit.selectRow({ name: 'interruptible', label: 'Pricing', options: [['', 'Any pricing'], ['no', 'On demand'], ['yes', 'Interruptible']], value: q.interruptible })}
${q.sort !== 'hourly' ? `<input type="hidden" name="sort" value="${esc(q.sort)}">` : ''}${q.pick.length ? `<input type="hidden" name="pick" value="${esc(q.pick.join(','))}">` : ''}
<p class="compute-submit"><button class="ovk-btn ovk-btn--primary" type="submit">Show prices</button> <a href="/compute">Reset</a></p>
</fieldset></form>`;
}

function body(compute, query) {
    const { q, offers, picks } = select(compute, query);
    const when = checkedLabel(compute);
    return `${kit.head({ title: 'Compute prices', icon: 'server', sub: `What an hour of a GPU or a computer costs at each provider, checked ${when}.`, sticky: false })}
<p class="compute-source">Data from <a href="${esc(PAGE)}">OpenVibe.Exchange</a> · <a href="/api/v1/compute">JSON</a> · USD${compute.checked_at ? ` · checked <time datetime="${esc(compute.checked_at)}">${esc(day(compute.checked_at))}</time>` : ''}</p>
${compute.unavailable ? kit.notice({ kind: 'warn', text: compute.unavailable }) : ''}
${compute.expired_count ? kit.notice({ kind: 'warn', text: `${compute.expired_count} offer${compute.expired_count === 1 ? '' : 's'} passed the review date${compute.expired_at ? ` on ${month(compute.expired_at)}` : ''}; shown as the last reviewed price, not as current.` }) : ''}
${filters(compute, q)}
${sortNav(q)}
<p role="status" class="compute-count">${offers.length === compute.offers.length ? `${offers.length} offer${offers.length === 1 ? '' : 's'}` : `${offers.length} of ${compute.offers.length} offers`}${cheapestLine(compute)}</p>
${picks.length ? `<p class="compute-picked">Side-by-side: ${picks.map((o) => esc(offerName(o))).join(' vs ')}${picks.length < 2 ? ' (pick one more)' : ` · <a href="${esc(href(q, { pick: [] }))}">Clear</a>`}</p>` : ''}
${offers.length ? `<div class="compute-cards">${offers.map((o) => card(o, q)).join('')}</div>${table(offers, q)}` : `<p class="compute-empty">No offers match these filters. <a href="/compute">Clear them</a>.</p>`}
${picks.length >= 2 ? sideBySide(picks, q) : ''}
<section class="compute-use"><h2>Use it on OpenVibe</h2><p>${useLinks()}. The provider sets the price above; OpenVibe's own rate for a model run is on <a href="https://openvibe.exchange/models">Exchange</a>.</p></section>
`;
}

function markdown(compute, query) {
    const { q, offers, picks } = select(compute, query);
    const lines = [`# Compute prices`, '', `What an hour of a GPU or a computer costs at each provider, checked ${checkedLabel(compute)}.`, '', `Data from [OpenVibe.Exchange](${PAGE}); JSON at https://openvibe.compare/api/v1/compute. Prices in USD, reviewed on provider price pages.`, ''];
    if (compute.unavailable) lines.push(`> ${compute.unavailable}`, '');
    if (compute.expired_count) lines.push(`> ${compute.expired_count} offers passed their review date; shown as the last reviewed price, not as current.`, '');
    if (q.kind || q.gpu || q.region || q.interruptible) lines.push(`Filtered: ${[q.kind && label(q.kind), q.gpu, q.region, q.interruptible && (q.interruptible === 'yes' ? 'interruptible' : 'on demand')].filter(Boolean).join(', ')}.`, '');
    lines.push(`Sorted by ${q.sort === 'gpu-hour' ? 'price per GPU GB-hour' : q.sort === 'month' ? 'price per month' : 'price per hour'}.`, '');
    for (const o of offers) {
        lines.push(`## ${offerName(o)}`, '');
        lines.push(`- Kind: ${label(o.kind)}`);
        lines.push(`- Region: ${o.region || 'not stated'}`);
        lines.push(`- Per hour: ${money(o.hourly)}${o.cheapest ? ' (cheapest of its kind)' : ''}`);
        if (o.hourly_per_gpu_gb != null) lines.push(`- Per GPU GB-hour: ${money(o.hourly_per_gpu_gb)}`);
        lines.push(`- Per month (${MONTH_HOURS} h, 24/7): ${money(o.monthly_24_7)}`);
        lines.push(`- Interruptible: ${o.interruptible ? 'yes' : 'no'}`);
        lines.push(`- Checked: ${day(o.checked_at)}; review due: ${o.expires_at ? day(o.expires_at) : 'not stated'}${o.expired ? ' (passed)' : ''}`);
        if (o.promotion) lines.push(`- Promotion: ${o.promotion}`);
        lines.push(`- Source: [${o.provider} price page](${o.source})`, '');
    }
    if (picks.length) {
        lines.push('## Side-by-side', '');
        for (const o of picks) lines.push(`### ${offerName(o)}`, `- ${money(o.hourly)} per hour; ${o.hourly_per_gpu_gb != null ? `${money(o.hourly_per_gpu_gb)} per GPU GB-hour; ` : ''}${money(o.monthly_24_7)} per month (24/7); ${o.interruptible ? 'interruptible' : 'on demand'}`, '');
    }
    lines.push('## Use it on OpenVibe', '', 'Run models on [OpenVibe.Exchange](https://openvibe.exchange/models) or computers and jobs on [OpenVibe.Run](https://openvibe.run/).', '');
    return lines.join('\n');
}

function jsonLd(compute) {
    return {
        '@context': 'https://schema.org', '@type': 'Dataset', name: 'Compute prices',
        description: 'What an hour of a GPU or a computer costs at each reviewed provider, from OpenVibe.Exchange.',
        url: 'https://openvibe.compare/compute', dateModified: compute.checked_at || compute.retrieved_at,
        creator: { '@type': 'Organization', name: 'OpenVibe' },
        distribution: { '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: 'https://openvibe.compare/api/v1/compute' },
    };
}

module.exports = { body, markdown, jsonLd, checkedLabel };
