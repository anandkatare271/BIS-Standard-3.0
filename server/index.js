import express from "express";
import cors from "cors";
import multer from "multer";
import path from "node:path";
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

const VALID_STATUSES = ["Current", "Superseded", "Under Revision", "Withdrawn"];

app.put("/api/standards/:id", route((req, res) => {
  const existing = getStandard(req.params.id);
  if (!existing) return res.status(404).json({ error: "Standard not found" });
  const patch = req.body || {};
  if (patch.status !== undefined && !VALID_STATUSES.includes(patch.status)) {
    return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` });
  }
  upsertStandard({ ...existing, ...patch, id: req.params.id });
  res.json(getStandard(req.params.id));
}));

app.post("/api/seed", route((_req, res) => {
  const n = seedStandards();
  res.json({ ok: true, standards: n });
}));

app.post("/api/analyze", route((req, res) => {
  const text = (req.body?.text || "").toString().trim();
  if (!text) return res.status(400).json({ error: "text is required" });
  const catalog = listStandards();
  if (catalog.length === 0) {
    return res.status(503).json({ error: "Standards catalog is empty - run `npm run seed`" });
  }
  const result = runAnalysis(text, catalog);
  const analysisId = saveAnalysis(result);
  const time = new Date().toLocaleTimeString("en-IN");
  addAudit(analysisId, "Analysis run", null, time);
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
});
