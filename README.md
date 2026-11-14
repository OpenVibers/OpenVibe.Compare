# OpenVibe.Compare
Source-linked comparisons for anything

Compare v1 serves public comparisons at https://openvibe.compare. Run `npm ci`, then `npm start`; check with `ov test`.

Data: Exchange price-book market and its reviewed compute tariffs, Report's public AI performance rows (30 days, model group), Bench public arena/verified runs, Codes harness catalog, Billing public plans. Reads are coalesced and cached for ten minutes. Price provenance retains the provider's checked date; a board without an update timestamp labels its date as the observation date. Failed feeds produce explicit unavailable states. The AI models comparison shows Report's measured time to first token p50, tokens per second p50 and success rate beside each provider's price; a model under 20 calls or with Report down is a dash, never zero. There is no private data or paid execution. Compute prices are read from OpenVibe.Exchange's `GET /api/compute/prices`; Compare adds only derived arithmetic (per month at 24/7, per GPU GB-hour), never a copied tariff.

Pages: `/`, `/comparisons/:slug`, `/things/:id` (URI-encoded identity), `/compute` (filters by kind, GPU model, region and interruptible; sorts by price per hour, per GPU GB-hour and per month at 24/7; a two- or three-offer side-by-side), and the AI pages `/ai` (hub), `/ai/leaderboard`, `/ai/providers`, `/ai/models/:model`, `/ai/compare` and `/ai/compare/:a-vs-:b` (canonical sorted pair; two agents get a model/harness/interaction split), `/ai/harnesses` (each harness's effect with its interval), `/ai/matrix` (harness × model), `/ai/method`, `/ai/feed.xml`, `/ai/:ref` (a Bench task kind or benchmark) and `/ai/arena`. The old `/comparisons/ai-models` and an AI model's `/things/:id` 301 to the AI pages. AI ratings and prices come from OpenVibe.AI's catalogue and Exchange market joined to OpenVibe.Bench's boards through `openvibe-sdk/compare`; Report's measured rows sit beside the prices. Every public AI page links to Bench's owner page (`https://bench.openvibe.services/benchmarks/mine`), where a signed-in person finds their own benchmarks, runs and share settings. JSON at `/api/v1/comparisons[/slug]` and `/api/v1/compute`. Pages negotiate `Accept: text/markdown`. Dataset JSON-LD, sitemap and llms.txt are generated from the same data. Desktop tables and phone cards share ranking logic; compute cards run to 899 px and its table starts at 900 px. Weight URL parameters are `w.<criterion>`; all-zero weights leave things unranked. Builder and version-history fields are reserved, with no write API in v1.

**Bench's API is served here too** (plan §X step 1, 11-13): every `/api/v1/` path Compare does not answer itself (`kinds`, `benchmarks`, `ratings`, `boards`, `runs`, `models` …) goes to OpenVibe.Bench at the edge (`deploy/nginx/openvibe.compare.conf`), so `https://openvibe.compare/api/v1/kinds` is Bench's `/api/v1/kinds`. Compare's own `/api/v1/compute` and `/api/v1/comparisons` stay Compare's.

**Bench lives here now** (plan §X step 2, 11-13). Bench's code is `server/bench` (moved with `git subtree`, so its
history is kept; `server/bench/test` runs in `npm test`). With `BENCH_ENV_FILE` set (production: `/etc/openvibe/bench.env`),
Compare's own process mounts Bench's app behind Compare's routes and runs Bench's jobs, publisher and Events subscriptions,
against Bench's same database with Bench's own role (`server/bench-mount.js`); that file is parsed on its own, so Bench's
`DATABASE_URL`, `PORT` and OAuth client never collide with Compare's. A request for Bench's own host
(`bench.openvibe.services`) is Bench's whole. Without `BENCH_ENV_FILE` Compare runs alone, as before.

The cutover (each step alone, each undone alone): (b) this code, deployed with `BENCH_ENV_FILE` unset, changes nothing;
(c) set `Environment=BENCH_ENV_FILE=/etc/openvibe/bench.env` on `openvibe-compare.service`, point both vhosts' Bench
upstream (`127.0.0.1:5230`) at Compare's `127.0.0.1:5280`, then stop and disable `openvibe-bench.socket` and
`openvibe-bench.service` (kept installed for one release window as the rollback); (d) only then the data move (`ov_bench`
into Compare's own database or schema: expand, copy, verify, contract after the 7-day window).

Launch: Host register-compare.py registers port 5280 with a lifecycle override until the separate Contracts manifest is released. Use merge-deploy.sh, then ov-vhost-install for deploy/nginx/openvibe.compare.conf. No database or service credentials are required.

<!-- versions:start -->
- openvibe-contracts: v0.422.0
- openvibe-sdk: v0.168.0
- openvibe-shared: v4.249.0
<!-- versions:end -->
