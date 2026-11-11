# OpenVibe.Compare
Source-linked comparisons for anything

Compare v1 serves public comparisons at https://openvibe.compare. Run `npm ci`, then `npm start`; check with `ov test`.

Data: Exchange price-book market, Bench public arena/verified runs, Codes harness catalog, Billing public plans. Reads are coalesced and cached for ten minutes. Price provenance retains the provider's checked date; a board without an update timestamp labels its date as the observation date. Failed feeds produce explicit unavailable states. There is no private data or paid execution.

Pages: `/`, `/comparisons/:slug`, `/things/:id` (URI-encoded identity); JSON at `/api/v1/comparisons[/slug]`. Pages negotiate `Accept: text/markdown`. Dataset JSON-LD, sitemap and llms.txt are generated from the same data. Desktop tables and phone cards share ranking logic. Weight URL parameters are `w.<criterion>`; all-zero weights leave things unranked. Builder and version-history fields are reserved, with no write API in v1.

Launch: Host register-compare.py registers port 5280 with a lifecycle override until the separate Contracts manifest is released. Use merge-deploy.sh, then ov-vhost-install for deploy/nginx/openvibe.compare.conf. No database or service credentials are required.

<!-- versions:start -->
- openvibe-shared: v4.205.0
<!-- versions:end -->
