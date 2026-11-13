# OpenVibe.Compare
Source-linked comparisons for anything

Compare v1 serves public comparisons at https://openvibe.compare. Run `npm ci`, then `npm start`; check with `ov test`.

Data: Exchange price-book market and its reviewed compute tariffs, Bench public arena/verified runs, Codes harness catalog, Billing public plans. Reads are coalesced and cached for ten minutes. Price provenance retains the provider's checked date; a board without an update timestamp labels its date as the observation date. Failed feeds produce explicit unavailable states. There is no private data or paid execution. Compute prices are read from OpenVibe.Exchange's `GET /api/compute/prices`; Compare adds only derived arithmetic (per month at 24/7, per GPU GB-hour), never a copied tariff.

Pages: `/`, `/comparisons/:slug`, `/things/:id` (URI-encoded identity), and `/compute` (filters by kind, GPU model, region and interruptible; sorts by price per hour, per GPU GB-hour and per month at 24/7; a two- or three-offer side-by-side). JSON at `/api/v1/comparisons[/slug]` and `/api/v1/compute`. Pages negotiate `Accept: text/markdown`. Dataset JSON-LD, sitemap and llms.txt are generated from the same data. Desktop tables and phone cards share ranking logic; compute cards run to 899 px and its table starts at 900 px. Weight URL parameters are `w.<criterion>`; all-zero weights leave things unranked. Builder and version-history fields are reserved, with no write API in v1.

Launch: Host register-compare.py registers port 5280 with a lifecycle override until the separate Contracts manifest is released. Use merge-deploy.sh, then ov-vhost-install for deploy/nginx/openvibe.compare.conf. No database or service credentials are required.

<!-- versions:start -->
- openvibe-shared: v4.232.0
<!-- versions:end -->
