# AGENTS.md — OpenVibe.Compare

## Project overview

Public, source-linked comparisons for the OpenVibe network: AI models (price and measured Bench
quality/speed), AI coding agents (Codes harnesses plus verified Bench runs), OpenVibe plans
(Billing's public plan list) and compute prices (Exchange's reviewed GPU/computer tariffs).
Node.js/Express, fed entirely by other services' public APIs, **no database, no accounts, no write
API**. Server-rendered pages; `openvibe-shared` for the shell.

- Origin `https://openvibe.compare`, port `5280`, unit `openvibe-compare.service`.
- One rule above all: **missing evidence is not zero**. A thing without a measurement is unranked,
  never scored 0; a failed feed shows an explicit unavailable state and fills nothing in.

## What it owns

- `GET /` — the comparison index and search.
- `GET /comparisons/:slug` — one comparison; weight overrides via `?w.<criterion>=`.
- `GET /things/:id` — one thing across every comparison that contains it; `/models/:org/:model`
  301s here.
- `GET /compute` — compute prices from Exchange: filters, sorts and a two/three-offer side-by-side.
- `GET /api/v1/comparisons[/:slug]` and `GET /api/v1/compute` — the same data as JSON, CORS-allowed
  for the origins in [server/origins.json](server/origins.json).
- `robots.txt`, `sitemap.xml`, `llms.txt`, Dataset JSON-LD, and `Accept: text/markdown` negotiation —
  all generated from the same data, never hand-written separately.

It owns no private data, no paid execution, no builder or version-history write (reserved in the
schema with no API in v1).

## Who it reads

Seven feeds in [server/data.js](server/data.js) `ENDPOINTS`, and the compute book in
[server/compute.js](server/compute.js) `SOURCE`:

| Feed | What |
|---|---|
| `api.openvibe.exchange/api/v1/exchange/market` | dated offers and checked prices (AI Exchange) |
| `bench.openvibe.services/api/v1/boards/chat.arena` | Arena Elo and median response time (OpenVibe.Bench) |
| `bench.openvibe.services/api/v1/runs?kind=codes.patch` / `codes.ticket` | verified Bench runs (OpenVibe.Bench) |
| `openvibe.codes/api/v1/harnesses` | coding harness catalog (OpenVibe.Codes) |
| `billing.openvibe.network/api/v1/plans` | published plans (OpenVibe.Billing) |
| `openvibe.report/api/v1/ai/performance?group=model&days=30` | measured AI time to first token, tokens per second and success rate, public model rows with a 20-call floor (OpenVibe.Report) |
| `openvibe.exchange/api/compute/prices` | reviewed compute tariffs per provider and region (OpenVibe.Exchange) |

It does not call AI, Live, Network or any authenticated API. Nothing here writes anywhere.

## Repository map

- **Entry:** [server/index.js](server/index.js) — listens on `PORT || 5280`, graceful SIGTERM.
- **App/routes:** [server/app.js](server/app.js) — security headers, static `public/`, `/shared`,
  health/ready, `/release.json`, `/api/v1`, pages, 404 and 503.
- **Data:** [server/data.js](server/data.js) — fetches the seven feeds (8 s timeout; 3 s for Report), builds the three
  comparisons, coalesces concurrent reads and caches for ten minutes; a failed feed becomes `null`.
- **Compute:** [server/compute.js](server/compute.js) normalizes Exchange's tariffs and derives the
  month (730 h) and GPU GB-hour prices; [server/compute-views.js](server/compute-views.js) renders the
  page, Markdown and Dataset JSON-LD. A failed feed is not cached.
- **Views:** [server/views.js](server/views.js) — HTML, markdown, escaping, JSON-LD, the method text.
- **Ranking:** [public/rank.js](public/rank.js) — the one ranking implementation, required by both the
  server views and the browser.
- **Browser:** [public/comparison.js](public/comparison.js), [public/compare-account.js](public/compare-account.js),
  [public/compare.css](public/compare.css).
- **Deploy:** [deploy/systemd/openvibe-compare.service](deploy/systemd/openvibe-compare.service),
  [deploy/nginx/openvibe.compare.conf](deploy/nginx/openvibe.compare.conf).

## Commands

```bash
npm ci
npm start            # node server/index.js, http://127.0.0.1:5280
npm test             # node --test test/*.test.js
ov test              # the harness's sharded run of what the change reaches
node --check <file.js>
```

There is no `dev` script and no build step: edit `server/` or `public/` and restart.

## Testing

`test/compare.test.js` and `test/compute.test.js` use Node's built-in test runner with fixture feeds. It pins the rules that
matter: every measurement is finite, dated, sourced, and references a known thing and criterion;
missing evidence stays missing; exact model identity only; ranking handles direction, equal values,
zero/invalid weights and all-zero weights (unranked); pages and JSON agree. `ov test` runs the same
file and `test/compute.test.js` plus the repository checks the harness adds.

## Conventions

- **Compact, single-line JS** is the house style here (`server/app.js`, `server/data.js`); match the
  file you edit rather than reformatting it.
- CommonJS, `'use strict'`, 4 spaces in the newer data helpers, no linter.
- All user-visible data is escaped with `views.esc`; JSON is embedded with `json()` (escapes `<`).
- Reuse `openvibe-shared/kit`, `openvibe-shared/shell` and `openvibe-shared/serve` instead of new
  layout or asset code.

## Data and provenance rules

- A result needs a finite number, a parseable date, and an `https:` source URL; otherwise it is not
  added ([server/data.js](server/data.js) `result`).
- Prices: the cheapest dated offer by input + output, both from the same provider. Provider feedback
  and observation dates are labelled; no price is estimated.
- Arena quality: at least ten judged games and **exact** model identity (`r.model === id`); no fuzzy
  joins, because a fuzzy join silently compares a different model revision.
- Measured AI columns: Report's public model rows over 30 days, matched by the full thing id or the
  offer's provider model name. Report groups by model name across providers, so the values describe the
  model, not one provider's serving; under 20 calls or a failed feed is a dash, never zero.
- Coding agents: only `provenance === 'verified'` runs; benchmark version and model form separate
  criteria; newest verified run per harness/cohort.
- Plans: packages and memberships have separate units and are never ranked together.
- Ranking: min–max within the comparison then a weighted mean on 0–100; equal values get 50;
  criteria with no measurements are excluded; all-zero weights leave everything unranked.

## Deploy

No database and no service credentials. The unit runs `/opt/openvibe.compare/server/index.js` on
`127.0.0.1:5280`, env `/etc/openvibe/compare.env`. The README's launch path predates ovhost:
`register-compare.py` registers port 5280 with a lifecycle override until a Contracts manifest is
released, then `merge-deploy.sh` and `ov-vhost-install deploy/nginx/openvibe.compare.conf`. Keep the
vhost and unit in sync with [deploy/](deploy/); a docs-only change needs no deploy.

## Pitfalls

- **Do not invent a write path.** Builder and version history are deliberately absent from v1.
- **Do not cache a failed feed into an old value.** It is `null` for that read; the next request
  retries, and the comparison lists it as unavailable.
- **Do not hand-write `sitemap.xml`, `llms.txt` or JSON-LD.** They are generated from `getData()` and
  `getCompute()` so they cannot drift from the pages.
- **Compute is read from Exchange, never copied.** A tariff's checked date and review date are shown
  as published; an offer past `expires_at` is marked, never presented as current.
- **Keep `public/rank.js` framework-free and dual-use** (server `require` and browser global); the
  test loads it both ways.
- **CORS is an exact allow-list** ([server/origins.json](server/origins.json)); no `*` and no
  credentials.
- **`Accept: text/markdown`** on `/`, `/comparisons/:slug`, `/things/:id` and `/compute` is part of
  the product; keep it when touching the views.
- **Do not remove the 503 handler**: an unexpected feed failure must answer explicitly, not 500.

## Documentation

The [README.md](README.md) is the whole product brief (there is no `docs/`). Contracts, if a manifest
is added later, live in OpenVibe.Contracts.
