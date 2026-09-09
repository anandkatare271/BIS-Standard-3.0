# IS-Match AI

Standards recommendation engine for public procurement, wrapped around the original
`IS-Match-AI_1.jsx` prototype. The scenario matching engine, all UI pages and the demo
AI explanations are unchanged — they now run against a real Express + SQLite backend,
and standards, analyses, decisions and the audit trail persist across restarts.

## Run

```bash
npm install
npm run dev
```

- UI: http://localhost:5173
- API: http://localhost:3001

The database is created and seeded automatically on first boot, so `npm run seed` is
only needed if you edit `shared/standards.json` and want to push the changes into an
existing database.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Runs the API (watch mode) and the Vite dev server together |
| `npm run server` | API only, no watch (`PORT` env var, default 3001) |
| `npm run server:watch` | API only, restarts on changes to `server/` or `shared/` |
| `npm run client` | Vite dev server only |
| `npm run seed` | Re-seeds standards from `shared/standards.json` (upsert; analyses are untouched) |
| `npm run smoke` | Renders every page in Node and checks the matching engine — catches runtime errors a build cannot |
| `npm run build` | Production build into `dist/` |

## Layout

```
shared/standards.json   Canonical standards catalog (single source of truth)
shared/matching.js      Scenario matching engine — shared by API and UI
server/db.js            SQLite schema and queries (node:sqlite, no native deps)
server/index.js         REST API
src/App.jsx             UI (imports the shared catalog and engine)
src/api.js              Fetch wrappers
data/is-match.db        SQLite database (gitignored, created on first boot)
```

The catalog and engine live in `shared/` so the API and the browser run **the same code**
against **the same data**. The UI bundles `shared/standards.json` as an offline fallback:
if the API is unreachable it still analyzes locally, and the header switches from
"Live SQLite catalog" to "Local demo catalog".

## API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Liveness plus the catalog row count |
| `GET` | `/api/standards` | Full catalog; `?q=` searches number, title, category, domain and keywords |
| `GET` | `/api/standards/:id` | One standard |
| `PUT` | `/api/standards/:id` | Update a standard (admin status edits) |
| `POST` | `/api/seed` | Re-seed the catalog from `shared/standards.json` |
| `POST` | `/api/analyze` | Run the matching engine and persist the result |
| `GET` | `/api/session` | Most recent analysis with its decisions and audit trail |
| `GET` | `/api/analyses` | Saved analysis history |
| `GET` | `/api/analyses/:id` | Reopen a saved analysis |
| `POST` | `/api/decisions` | Record accept / reject / not-applicable / expert-review |
| `POST` | `/api/extract-text` | Extract text from an uploaded PDF, DOCX or TXT (8 MB cap) |

Every endpoint returns JSON on failure, including validation errors, unknown routes and
oversized uploads.

## Data disclaimer

The 22 standards in `shared/standards.json` are **illustrative sample data** for a
prototype. They are not verified against live BIS records, and the certification
guidance is not a compliance determination. Verify against current BIS notifications
and Quality Control Orders before using any of it in a real tender.
