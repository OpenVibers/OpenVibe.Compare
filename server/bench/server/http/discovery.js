'use strict';

/**
 * Crawl artifacts for bench.openvibe.services. Sign-in, the API and the internal route are not for crawlers.
 */
const seo = require('openvibe-shared/seo');
const cache = require('openvibe-shared/cache-policy');
const { asyncRouter } = require('./router');

const SITE_NAME = 'OpenVibe.Bench';
const DESCRIPTION = 'OpenVibe.Bench is one AI benchmark and comparison engine for every room: blind votes, rubrics, graders, test suites and game outcomes, with reproducible pinned rounds and an open dataset per kind.';
const DISALLOW = ['/auth/', '/api/', '/internal', '/metrics', '/mcp'];

function homeJsonLd(config) {
    const site = String(config.baseUrl).replace(/\/+$/, '');
    return [
        seo.jsonLd.website({ name: SITE_NAME, url: site, description: DESCRIPTION }),
        seo.jsonLd.webPage({ name: SITE_NAME, url: `${site}/`, description: DESCRIPTION, siteUrl: site }),
    ];
}

const PAGES = [
    { path: '/', changefreq: 'daily', priority: 1.0, title: 'OpenVibe.Bench home', text: 'One benchmark engine for every room: the kinds, boards and open dataset.' },
    { path: '/docs', changefreq: 'weekly', priority: 0.6, title: 'The Bench API', text: 'The Bench JSON API, boards, dataset and MCP tools.' },
];

function createDiscoveryRoutes(ctx) {
    const { config } = ctx;
    const r = asyncRouter();
    const site = String(config.baseUrl).replace(/\/+$/, '');
    const abs = (p) => `${site}${p}`;
    const TEXT = cache.htmlHeaders({ maxAge: 3600 });

    r.get('/robots.txt', (_req, res) => {
        res.type('text/plain').set('Cache-Control', TEXT).send(
            '# bench.openvibe.services: its pages moved to OpenVibe.Compare (each one a 301 there); its sitemap is Compare\'s.\n'
            + seo.robotsTxt({ sitemaps: ['https://openvibe.compare/sitemap.xml'], disallow: DISALLOW }));
    });

    r.get('/llms.txt', (_req, res) => {
        // AGT-5: own pages link their Markdown twins (openvibe-shared 4.108.0); ## Optional is what an agent may skip.
        res.type('text/plain').set('Cache-Control', TEXT).send(seo.llmsTxt({
            name: SITE_NAME,
            summary: DESCRIPTION,
            markdown: true,
            base: site,
            details: 'GET /api/v1/kinds lists the benchmark kinds. GET /api/v1/boards/:kind?type=elo|willing|pareto|cost renders a board as JSON; the chat.willing board is 18+ and marks itself adult: true. GET /api/v1/datasets/:kind.jsonl is the open dataset without voter ids. GET /api/v1/datasets/benchmarks.jsonl is every public benchmark and its runs. GET /api/v1/datasets/eee is Bench’s public runs as Every Eval Ever records (JSONL, paged), and GET /api/v1/external/records is the imported Every Eval Ever records with their provenance. POST /mcp is the Model Context Protocol endpoint.',
            sections: [
                { title: 'Start here', links: [{ title: SITE_NAME, url: abs('/') }, { title: 'The API', url: abs('/docs') }] },
                { title: 'Machine-readable', links: [{ title: 'Kinds (JSON)', url: abs('/api/v1/kinds') }] },
            ],
            optional: [{ title: 'Sitemap', url: abs('/sitemap.xml') }, { title: 'Full text for language models', url: abs('/llms-full.txt') }, { title: 'Release metadata (JSON)', url: abs('/release.json') }],
        }));
    });

    r.get('/llms-full.txt', (_req, res) => {
        res.type('text/plain').set('Cache-Control', TEXT).send(seo.llmsFull({
            site: SITE_NAME,
            summary: 'The Bench home and its API docs, in full.',
            base: site,
            maxBytes: 256 * 1024,
            // The API page in full (SEO-33: it was one line), from the same view /docs renders.
            sections: [{ title: 'Pages', pages: PAGES.map((p) => (p.path === '/docs' ? { url: p.path, title: p.title, html: require('../views').docs() } : { url: p.path, title: p.title, text: p.text })) }],
        }));
    });

    // Bench's pages are 301s to their OpenVibe.Compare pages (app.js): a sitemap listing them listed nothing but redirects
    // (the network SEO crawl of 2026-11-21, OpenSEO's rules). It is empty; Compare's sitemap lists the pages.
    r.get('/sitemap.xml', (_req, res) => {
        res.type('application/xml').set('Cache-Control', TEXT).send(seo.sitemapXml([]));
    });
    return r;
}

module.exports = { createDiscoveryRoutes, homeJsonLd, PAGES, DESCRIPTION, SITE_NAME };
