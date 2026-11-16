'use strict';
/**
 * A link to another OpenVibe site, drawn as the network's cross-site link: the site's own mark, its name, what is there
 * (the owner, 11-16: "custom links … all site icons with them"; "Report's own data … doesn't use our cross-site links").
 */
const icons = require('openvibe-shared/ov-icons');

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** siteLink('https://openvibe.exchange/compute', 'exchange', 'OpenVibe.Exchange', 'compute prices') */
function siteLink(href, app, name, what = '') {
    return `<a class="ai-site-link" href="${esc(href)}"><span class="ai-site-mark" aria-hidden="true">${icons.appHtml(app, { size: 22 })}</span><span><b>${esc(name)}</b>${what ? ` ${esc(what)}` : ''}</span></a>`;
}

module.exports = { siteLink };
