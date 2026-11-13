# OpenVibe.Compare
Source-linked comparisons for anything

Compare v1 serves public comparisons at https://openvibe.compare. Run `npm ci`, then `npm start`; check with `ov test`.

Data: Exchange price-book market and its reviewed compute tariffs, Report's public AI performance rows (30 days, model group), Bench public arena/verified runs, Codes harness catalog, Billing public plans. Reads are coalesced and cached for ten minutes. Price provenance retains the provider's checked date; a board without an update timestamp labels its date as the observation date. Failed feeds produce explicit unavailable states. The AI models comparison shows Report's measured time to first token p50, tokens per second p50 and success rate beside each provider's price; a model under 20 calls or with Report down is a dash, never zero. There is no private data or paid execution. Compute prices are read from OpenVibe.Exchange's `GET /api/compute/prices`; Compare adds only derived arithmetic (per month at 24/7, per GPU GB-hour), never a copied tariff.

Pages: `/`, `/comparisons/:slug`, `/things/:id` (URI-encoded identity), `/compute` (filters by kind, GPU model, region and interruptible; sorts by price per hour, per GPU GB-hour and per month at 24/7; a two- or three-offer side-by-side), and the AI pages `/ai` (hub), `/ai/leaderboard`, `/ai/providers`, `/ai/models/:model`, `/ai/compare` and `/ai/compare/:a-vs-:b` (canonical sorted pair; two agents get a model/harness/interaction split), `/ai/harnesses` (each harness's effect with its interval), `/ai/matrix` (harness × model), `/ai/method`, `/ai/feed.xml`, `/ai/:ref` (a Bench task kind or benchmark) and `/ai/arena`. The old `/comparisons/ai-models` and an AI model's `/things/:id` 301 to the AI pages. AI ratings and prices come from OpenVibe.AI's catalogue and Exchange market joined to OpenVibe.Bench's boards through `openvibe-sdk/bench`; Report's measured rows sit beside the prices. JSON at `/api/v1/comparisons[/slug]` and `/api/v1/compute`. Pages negotiate `Accept: text/markdown`. Dataset JSON-LD, sitemap and llms.txt are generated from the same data. Desktop tables and phone cards share ranking logic; compute cards run to 899 px and its table starts at 900 px. Weight URL parameters are `w.<criterion>`; all-zero weights leave things unranked. Builder and version-history fields are reserved, with no write API in v1.

Launch: Host register-compare.py registers port 5280 with a lifecycle override until the separate Contracts manifest is released. Use merge-deploy.sh, then ov-vhost-install for deploy/nginx/openvibe.compare.conf. No database or service credentials are required.

<!-- versions:start -->
- openvibe-sdk: v0.161.0
- openvibe-shared: v4.239.0
<!-- versions:end -->
