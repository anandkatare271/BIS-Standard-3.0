# IS-Match AI

Standards recommendation engine for public procurement. Describe what you are buying —
in English, Hindi or Hinglish, or paste a tender PDF — and it returns the Indian
Standards that apply, the allied, normative, test and installation standards they pull
in, version currency, certification guidance and a compliance risk score.

Two engines produce that answer, and the split is deliberate:

- A **deterministic matcher** (`shared/matching.js`) scores the query against the
  catalog and walks the standards relation graph. It decides which standards are
  returned. It needs no network and no API key.
- **Claude** (optional) reads messy tender text into structured facets and writes the
  per-standard reasoning. It never selects or invents a standard number, so there is
  nothing to hallucinate and the audit trail still explains every selection.

If the AI path is unavailable — no key, a timeout, a network failure, or the kill
switch — the app falls back to the deterministic engine and labels the result
`Rule-based` instead of `AI-assisted`. It does not break.

## Run

```bash
npm install
npm run dev
```

- UI: http://localhost:5173
- API: http://localhost:3001

The database is created and seeded automatically on first boot. **Node 22.5 or newer is
required** — `server/db.js` uses the built-in `node:sqlite`, which does not exist on
Node 18 or 20.

### Enabling the AI path

Optional. Without it everything works, using the deterministic engine.

```bash
cp .env.example .env      # then paste your key into ANTHROPIC_API_KEY
```

Get a key at https://console.anthropic.com (API keys → Create Key; the account needs
credit). Roughly **$0.02 per analysis**, and repeated queries are served from an
in-process cache. `.env` is gitignored — never commit it.

`AI_ENABLED=false` forces the deterministic engine even when a key is present. Useful
if the venue network is unreliable.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Runs the API (watch mode) and the Vite dev server together |
| `npm run server` | API only, no watch (`PORT` env var, default 3001) |
| `npm run server:watch` | API only, restarts on changes to `server/` or `shared/` |
| `npm run client` | Vite dev server only |
| `npm run seed` | Re-seeds standards from `shared/standards.json` (upsert; analyses are untouched) |
| `npm test` | Unit tests for the matching engine and the AI fallback contract |
| `npm run smoke` | Renders every page in Node — catches runtime errors a build cannot |
| `npm run check` | `test` + `smoke`. Run this before committing |
| `npm run build` | Production build into `dist/` |

## Layout

```
shared/standards.json   Canonical standards catalog (single source of truth)
shared/matching.js      Scoring, relation-graph tiering, compliance — shared by API and UI
server/db.js            SQLite schema and queries (node:sqlite, no native deps)
server/ai.js            Claude integration: facet extraction, explanations, fallback
server/index.js          REST API
src/App.jsx             UI (imports the shared catalog and engine)
src/api.js              Fetch wrappers
tests/                  node:test suites
data/is-match.db        SQLite database (gitignored, created on first boot)
```

The catalog and matcher live in `shared/` so the API and the browser run **the same code**
against **the same data**. The UI bundles `shared/standards.json` as an offline fallback:
if the API is unreachable it still analyzes locally, and the header switches from
"Live SQLite catalog" to "Local demo catalog".

## How matching works

1. Keywords are weighted by how rare they are in the catalog, so a term like `safety`
   — which appears across PPE, switchgear, lighting and IT rows — counts for far less
   than `safety helmet`. A match must be worth at least 30% of the best match to appear.
2. The strongest matches become **Primary**, weaker direct matches **Allied**.
3. From the Primary matches, the relation graph is walked out: `normative`, `test`,
   `safety`, `installation` and `material` edges become **Normative**, **Test** and
   **Installation** recommendations. This is what surfaces standards the query never
   mentions — the pipe-laying code of practice alongside the pipe, the cement test
   method alongside the cement.
4. All seven compliance scores are computed from the result set: version currency from
   how many matched standards are still `Current`, normative coverage from how many of
   their own references resolved, and so on.

A query that matches nothing returns no recommendations and says so, rather than
guessing.

## API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Liveness, catalog row count and AI path status |
| `GET` | `/api/standards` | Full catalog; `?q=` searches number, title, category, domain and keywords |
| `GET` | `/api/standards/:id` | One standard |
| `PUT` | `/api/standards/:id` | Update a standard — **requires admin token** |
| `POST` | `/api/seed` | Re-seed the catalog — **requires admin token** |
| `POST` | `/api/analyze` | Analyze text; returns `mode: "ai" \| "rule-based"` |
| `GET` | `/api/session` | Most recent analysis with its decisions and audit trail |
| `GET` | `/api/analyses` | Saved analysis history |
| `GET` | `/api/analyses/:id` | Reopen a saved analysis |
| `POST` | `/api/decisions` | Record accept / reject / not-applicable / expert-review |
| `POST` | `/api/extract-text` | Extract text from an uploaded PDF, DOCX or TXT (8 MB cap) |

Every endpoint returns JSON on failure, including validation errors, unknown routes and
oversized uploads.

### Write protection

With `ADMIN_TOKEN` set, catalog writes require `Authorization: Bearer <token>`. Reads,
analysis and decisions stay open, so the demo needs no login. With the variable unset
the gate is open and the server says so at startup.

**Set `ADMIN_TOKEN` before exposing this on a public URL** — otherwise anyone can
rewrite the catalog the recommendations are built from.

To supply it from the UI, in the browser console:

```js
sessionStorage.setItem("adminToken", "<the token>")
```

## Deploying

The Express server serves `dist/` and the API on the same origin, so the frontend's
relative `/api` calls work in production with no extra configuration.

```bash
npm run build && npm start
```

**Two things will catch you out:**

**Node version.** `node:sqlite` needs Node ≥ 22.5. Most platforms default to 18 or 20,
where the app fails at import with no obvious cause. `package.json` pins `engines`;
make sure your host respects it, or set the Node version explicitly.

**SQLite is a file on disk.** On an ephemeral filesystem the catalog re-seeds fine, but
every saved analysis, decision and audit-log entry is lost on restart — which is exactly
the persistence the app is demonstrating. You need a persistent volume mounted at
`data/`.

That rules out serverless hosts (Vercel, Netlify) without rearchitecting. Use a
platform with persistent disks — Render, Railway or Fly.io.

### Render

| Setting | Value |
| --- | --- |
| Build command | `npm install && npm run build` |
| Start command | `npm start` |
| Node version | `22` or later (env var `NODE_VERSION`) |
| Disk | Mount at `/opt/render/project/src/data`, 1 GB is ample |

Environment variables to set: `ANTHROPIC_API_KEY` (optional), `ADMIN_TOKEN`
(**do set this**), and `AI_ENABLED` if you want the kill switch. `PORT` is supplied by
the platform and picked up automatically.

## Data disclaimer

The 113 standards in `shared/standards.json` are **illustrative sample data**. The IS
numbers were recalled from the public BIS catalogue and are **not verified** against
live BIS records or current Quality Control Orders — every row carries
`verified: false` and a `source` field saying so.

Certification guidance is a prompt to go and check, not a compliance determination.
Verify against current BIS notifications and QCOs before using any of it in a real
tender.

Coverage is strongest for cement, structural steel, cables, pipes and PPE. Furniture is
the thinnest category — it is built around wood-panel standards (plywood, MDF,
blockboard, flush doors) rather than furniture-specific ones.
