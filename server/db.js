import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data");
fs.mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(path.join(dataDir, "is-match.db"));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS standards (
    id TEXT PRIMARY KEY,
    number TEXT NOT NULL,
    title TEXT NOT NULL,
    category TEXT,
    domain TEXT,
    year INTEGER,
    status TEXT,
    latest_version TEXT,
    amendments_json TEXT,
    superseded_note TEXT,
    scope TEXT,
    keywords_json TEXT,
    relations_json TEXT,
    certification_json TEXT
  );

  CREATE TABLE IF NOT EXISTS analyses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query TEXT NOT NULL,
    language TEXT,
    scenario_key TEXT,
    product TEXT,
    result_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS decisions (
    analysis_id INTEGER NOT NULL,
    standard_id TEXT NOT NULL,
    decision TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (analysis_id, standard_id),
    FOREIGN KEY (analysis_id) REFERENCES analyses(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    analysis_id INTEGER,
    action TEXT NOT NULL,
    standard_id TEXT,
    time TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (analysis_id) REFERENCES analyses(id) ON DELETE SET NULL
  );
`);

export function rowToStandard(row) {
  if (!row) return null;
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    category: row.category,
    domain: row.domain,
    year: row.year,
    status: row.status,
    latestVersion: row.latest_version,
    amendments: JSON.parse(row.amendments_json || "[]"),
    supersededNote: row.superseded_note || undefined,
    scope: row.scope,
    keywords: JSON.parse(row.keywords_json || "[]"),
    relations: JSON.parse(row.relations_json || "{}"),
    certification: JSON.parse(row.certification_json || "{}"),
  };
}

export function listStandards() {
  return db.prepare("SELECT * FROM standards ORDER BY category, number").all().map(rowToStandard);
}

export function getStandard(id) {
  return rowToStandard(db.prepare("SELECT * FROM standards WHERE id = ?").get(id));
}

/** Case-insensitive search over number, title, category and the keyword list. */
export function searchStandards(term) {
  const like = `%${term.toLowerCase()}%`;
  return db.prepare(`
    SELECT * FROM standards
    WHERE lower(number) LIKE ?
       OR lower(title) LIKE ?
       OR lower(category) LIKE ?
       OR lower(domain) LIKE ?
       OR lower(keywords_json) LIKE ?
    ORDER BY category, number
  `).all(like, like, like, like, like).map(rowToStandard);
}

export function upsertStandard(s) {
  db.prepare(`
    INSERT INTO standards (
      id, number, title, category, domain, year, status, latest_version,
      amendments_json, superseded_note, scope, keywords_json, relations_json, certification_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      number = excluded.number,
      title = excluded.title,
      category = excluded.category,
      domain = excluded.domain,
      year = excluded.year,
      status = excluded.status,
      latest_version = excluded.latest_version,
      amendments_json = excluded.amendments_json,
      superseded_note = excluded.superseded_note,
      scope = excluded.scope,
      keywords_json = excluded.keywords_json,
      relations_json = excluded.relations_json,
      certification_json = excluded.certification_json
  `).run(
    s.id,
    s.number,
    s.title,
    s.category,
    s.domain,
    s.year,
    s.status,
    s.latestVersion,
    JSON.stringify(s.amendments || []),
    s.supersededNote || null,
    s.scope,
    JSON.stringify(s.keywords || []),
    JSON.stringify(s.relations || {}),
    JSON.stringify(s.certification || {}),
  );
}

export const SEED_PATH = path.join(root, "shared", "standards.json");

function readSeedFile() {
  if (!fs.existsSync(SEED_PATH)) {
    throw new Error(`Seed catalog not found at ${SEED_PATH}`);
  }
  const seed = JSON.parse(fs.readFileSync(SEED_PATH, "utf8"));
  if (!Array.isArray(seed) || seed.length === 0) {
    throw new Error("Seed catalog is empty or not an array");
  }
  return seed;
}

/** node:sqlite has no transaction() helper, so wrap the batch by hand. */
function inTransaction(fn) {
  db.exec("BEGIN");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function countStandards() {
  return db.prepare("SELECT COUNT(*) AS n FROM standards").get().n;
}

/** Loads the seed catalog. Existing rows are updated, so this is safe to re-run. */
export function seedStandards() {
  const seed = readSeedFile();
  inTransaction(() => {
    for (const s of seed) upsertStandard(s);
  });
  return seed.length;
}

export function seedIfEmpty() {
  const count = countStandards();
  if (count > 0) return count;
  return seedStandards();
}

export function saveAnalysis(result) {
  const info = db.prepare(`
    INSERT INTO analyses (query, language, scenario_key, product, result_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    result.query,
    result.language,
    result.scenarioKey,
    result.product,
    JSON.stringify(result),
    new Date().toISOString(),
  );
  return Number(info.lastInsertRowid);
}

function buildSession(row) {
  if (!row) return null;
  const decisions = db.prepare("SELECT standard_id, decision FROM decisions WHERE analysis_id = ?").all(row.id);
  const audit = db.prepare("SELECT action, standard_id, time FROM audit_log WHERE analysis_id = ? ORDER BY id DESC LIMIT 30").all(row.id);
  return {
    analysisId: row.id,
    analysis: JSON.parse(row.result_json),
    decisions: Object.fromEntries(decisions.map((d) => [d.standard_id, d.decision])),
    auditLog: audit.map((a) => ({ time: a.time, action: a.action, standardId: a.standard_id })),
  };
}

export function getLatestSession() {
  return buildSession(db.prepare("SELECT * FROM analyses ORDER BY id DESC LIMIT 1").get());
}

export function getSession(analysisId) {
  return buildSession(db.prepare("SELECT * FROM analyses WHERE id = ?").get(analysisId));
}

/** Analysis history for the dashboard — metadata only, no result payloads. */
export function listAnalyses(limit = 20) {
  return db.prepare(`
    SELECT a.id, a.query, a.language, a.scenario_key, a.product, a.created_at,
           (SELECT COUNT(*) FROM decisions d WHERE d.analysis_id = a.id) AS decision_count
    FROM analyses a
    ORDER BY a.id DESC
    LIMIT ?
  `).all(limit).map((r) => ({
    analysisId: r.id,
    query: r.query,
    language: r.language,
    scenarioKey: r.scenario_key,
    product: r.product,
    createdAt: r.created_at,
    decisionCount: r.decision_count,
  }));
}

export function upsertDecision(analysisId, standardId, decision) {
  db.prepare(`
    INSERT INTO decisions (analysis_id, standard_id, decision, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(analysis_id, standard_id) DO UPDATE SET decision = excluded.decision, updated_at = excluded.updated_at
  `).run(analysisId, standardId, decision, new Date().toISOString());
}

export function addAudit(analysisId, action, standardId, time) {
  db.prepare(`
    INSERT INTO audit_log (analysis_id, action, standard_id, time, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(analysisId || null, action, standardId || null, time, new Date().toISOString());
}
