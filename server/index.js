import express from "express";
import cors from "cors";
import multer from "multer";
import path from "node:path";
import { timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  seedIfEmpty,
  seedStandards,
  countStandards,
  listStandards,
  searchStandards,
  getStandard,
  upsertStandard,
  saveAnalysis,
  getLatestSession,
  getSession,
  listAnalyses,
  upsertDecision,
  addAudit,
} from "./db.js";
import { runAnalysis } from "../shared/matching.js";
import { analyzeWithAI, aiStatus, prewarm } from "./ai.js";

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const frontendDir = path.join(root, "dist");

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static(frontendDir));

/** Wraps a handler so a thrown error becomes a 500 instead of killing the process. */
const route = (handler) => (req, res, next) => {
  try {
    return Promise.resolve(handler(req, res, next)).catch(next);
  } catch (err) {
    return next(err);
  }
};

let catalogSize = 0;
try {
  catalogSize = seedIfEmpty();
  console.log(`SQLite ready - ${catalogSize} standards in catalog`);
} catch (err) {
  console.error(`Could not seed the standards catalog: ${err.message}`);
  console.error("The API will still start, but /api/standards will be empty until `npm run seed` succeeds.");
}

app.get("/api/health", route((_req, res) => {
  res.json({
    ok: true,
    service: "IS-Match AI",
    database: "sqlite",
    standards: countStandards(),
    ai: aiStatus(),
  });
}));

app.get("/api/standards", route((req, res) => {
  const q = (req.query.q || "").toString().trim();
  res.json(q ? searchStandards(q) : listStandards());
}));

app.get("/api/standards/:id", route((req, res) => {
  const row = getStandard(req.params.id);
  if (!row) return res.status(404).json({ error: "Standard not found" });
  res.json(row);
}));

/**
 * Write protection for the catalog.
 *
 * Reads stay open, so the demo needs no login. Catalog writes do not: on a
 * public URL, PUT /api/standards/:id let anyone rewrite the standards the
 * recommendations are built from, and the Officer/Expert/Admin selector in the
 * UI is presentation only and never reached the server.
 *
 * With no ADMIN_TOKEN set the gate stays open and says so at startup, so
 * local development is unchanged.
 */
const adminToken = process.env.ADMIN_TOKEN || "";

/** Constant-time compare so the token cannot be recovered by timing. */
function tokenMatches(supplied) {
  const a = Buffer.from(String(supplied || ""));
  const b = Buffer.from(adminToken);
  return a.length === b.length && timingSafeEqual(a, b);
}

const requireAdmin = (req, res, next) => {
  if (!adminToken) return next();
  const header = req.get("authorization") || "";
  const supplied = header.startsWith("Bearer ") ? header.slice(7) : req.get("x-admin-token");
  if (!tokenMatches(supplied)) {
    return res.status(401).json({ error: "This endpoint requires a valid admin token" });
  }
  return next();
};

const VALID_STATUSES = ["Current", "Superseded", "Under Revision", "Withdrawn"];

app.put("/api/standards/:id", requireAdmin, route((req, res) => {
  const existing = getStandard(req.params.id);
  if (!existing) return res.status(404).json({ error: "Standard not found" });
  const patch = req.body || {};
  if (patch.status !== undefined && !VALID_STATUSES.includes(patch.status)) {
    return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` });
  }
  upsertStandard({ ...existing, ...patch, id: req.params.id });
  res.json(getStandard(req.params.id));
}));

app.post("/api/seed", requireAdmin, route((_req, res) => {
  const n = seedStandards();
  res.json({ ok: true, standards: n });
}));

app.post("/api/analyze", route(async (req, res) => {
  const text = (req.body?.text || "").toString().trim();
  if (!text) return res.status(400).json({ error: "text is required" });
  const catalog = listStandards();
  if (catalog.length === 0) {
    return res.status(503).json({ error: "Standards catalog is empty - run `npm run seed`" });
  }

  // The AI path is an enhancement, never a dependency. Any failure inside it
  // returns null and this falls through to the engine the app shipped with.
  const assisted = await analyzeWithAI(text, catalog, runAnalysis);
  const result = assisted ?? { ...runAnalysis(text, catalog), mode: "rule-based" };

  const analysisId = saveAnalysis(result);
  const time = new Date().toLocaleTimeString("en-IN");
  addAudit(analysisId, result.mode === "ai" ? "AI-assisted analysis run" : "Analysis run", null, time);
  res.json({ analysisId, ...result });
}));

app.get("/api/session", route((_req, res) => {
  res.json(getLatestSession());
}));

app.get("/api/analyses", route((_req, res) => {
  res.json(listAnalyses());
}));

app.get("/api/analyses/:id", route((req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id must be an integer" });
  const session = getSession(id);
  if (!session) return res.status(404).json({ error: "Analysis not found" });
  res.json(session);
}));

const VALID_DECISIONS = ["accepted", "rejected", "not_applicable", "expert_review"];

app.post("/api/decisions", route((req, res) => {
  const { analysisId, standardId, decision } = req.body || {};
  if (!analysisId || !standardId || !decision) {
    return res.status(400).json({ error: "analysisId, standardId and decision are required" });
  }
  if (!VALID_DECISIONS.includes(decision)) {
    return res.status(400).json({ error: `decision must be one of: ${VALID_DECISIONS.join(", ")}` });
  }
  if (!getSession(Number(analysisId))) {
    return res.status(404).json({ error: "Analysis not found" });
  }
  if (!getStandard(standardId)) {
    return res.status(404).json({ error: "Standard not found" });
  }
  upsertDecision(Number(analysisId), standardId, decision);
  const time = new Date().toLocaleTimeString("en-IN");
  addAudit(Number(analysisId), decision, standardId, time);
  res.json({ ok: true, time });
}));

app.post("/api/extract-text", upload.single("file"), route(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "file is required" });
  const name = (req.file.originalname || "").toLowerCase();
  const mime = req.file.mimetype || "";
  if (name.endsWith(".txt") || mime.startsWith("text/")) {
    return res.json({ text: req.file.buffer.toString("utf8") });
  }
  if (name.endsWith(".pdf") || mime === "application/pdf") {
    // pdf-parse's package entry runs a debug harness when loaded bare; go to the lib directly.
    const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
    const parsed = await pdfParse(req.file.buffer);
    return res.json({ text: parsed.text || "" });
  }
  if (name.endsWith(".docx") || mime.includes("wordprocessingml")) {
    const mammoth = await import("mammoth");
    const parsed = await mammoth.extractRawText({ buffer: req.file.buffer });
    return res.json({ text: parsed.value || "" });
  }
  return res.status(415).json({ error: "Supported uploads: PDF, DOCX, TXT" });
}));

app.use("/api", (req, res) => {
  res.status(404).json({ error: `No such endpoint: ${req.method} /api${req.path}` });
});

app.get("*splat", (req, res, next) => {
  if (req.method === "GET") {
    return res.sendFile(path.join(frontendDir, "index.html"), (err) => {
      if (err) next(err);
    });
  }
  next();
});

// Multer, malformed-JSON and handler errors all land here as JSON rather than an HTML stack page.
app.use((err, _req, res, _next) => {
  const status = err.status || (err.code === "LIMIT_FILE_SIZE" ? 413 : 500);
  console.error(`${status} ${err.message}`);
  res.status(status).json({ error: err.message || "Internal server error" });
});

const port = Number(process.env.PORT || 3001);
app.listen(port, () => {
  console.log(`IS-Match AI API listening on http://localhost:${port}`);
  const ai = aiStatus();
  console.log(
    ai.configured
      ? `AI path: ${ai.reason} (${ai.model}, ${ai.timeoutMs}ms timeout)`
      : `AI path: ${ai.reason} - analysis will use the rule-based engine`,
  );
  console.log(
    adminToken
      ? "Catalog writes: protected by ADMIN_TOKEN"
      : "Catalog writes: OPEN - set ADMIN_TOKEN before exposing this on a public URL",
  );
  if (ai.configured && catalogSize > 0) prewarm(listStandards());
});
