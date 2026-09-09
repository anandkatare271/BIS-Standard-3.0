/**
 * Claude-assisted analysis.
 *
 * The division of labour matters and is deliberate:
 *
 *   Claude reads the tender text and produces structured facets plus a list of
 *   search terms drawn from the catalog's own vocabulary. The deterministic
 *   engine in shared/matching.js then does the actual matching against the
 *   catalog. Claude writes the per-standard reasoning for whatever the engine
 *   picked.
 *
 * Claude never chooses or invents a standard number. Every recommendation comes
 * from a catalog row selected by code, so the output stays auditable and there
 * is nothing to hallucinate. What Claude adds is the thing regex cannot do —
 * turning "procurement of luminaires for panchayat approach roads" into the
 * vocabulary the matcher actually indexes.
 *
 * Every failure path falls back to the rule-based engine. A missing key, a
 * timeout, a refusal, malformed output, or AI_ENABLED=false all degrade to the
 * behaviour the app had before this file existed.
 */

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import crypto from "node:crypto";

const MODEL = "claude-opus-5";

/** A live demo cannot wait. Past this, fall back rather than leave a spinner. */
const TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 15000);

/** Rehearsed queries should never hit the network twice. */
const CACHE_LIMIT = 64;
const cache = new Map();

export function aiConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY) && process.env.AI_ENABLED !== "false";
}

let client = null;
function getClient() {
  if (!client) {
    // maxRetries 1, not the default 2: three attempts against a 15s timeout is
    // 45 seconds of a judge watching a spinner.
    client = new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 1 });
  }
  return client;
}

/* ------------------------------------------------------------------ schemas */

const FacetSchema = z.object({
  product: z.string().describe("The item being procured, in plain words. Empty string if unclear."),
  material: z.string().describe("Material or construction, if stated. Empty string otherwise."),
  application: z.string().describe("Where or how it will be used. Empty string otherwise."),
  environment: z.string().describe("Installation environment, e.g. outdoor, buried, indoor. Empty string otherwise."),
  quantity: z.string().describe("Order quantity as written, digits only. Empty string if not stated."),
  citedStandards: z.array(z.string()).describe("Any IS/ISO/IEC numbers the text itself cites."),
  searchTerms: z.array(z.string()).describe(
    "3 to 10 terms taken from the supplied catalog vocabulary that best describe this item. " +
    "Use the vocabulary's exact wording. Do not invent terms that are not in it.",
  ),
});

const ExplanationSchema = z.object({
  summary: z.string().describe("Two sentences on what was procured and what the standards set covers."),
  explanations: z.array(
    z.object({
      id: z.string().describe("The standard id exactly as given."),
      reason: z.string().describe("One sentence on why this standard applies to this specific procurement."),
    }),
  ),
});

/* -------------------------------------------------------------- vocabulary */

const vocabCache = new WeakMap();

/**
 * The catalog's own keywords, grouped by category. Feeding this to Claude is
 * what keeps its search terms aligned with what the matcher indexes — without
 * it, Claude produces reasonable synonyms that score nothing.
 */
function vocabulary(catalog) {
  const cached = vocabCache.get(catalog);
  if (cached) return cached;

  const byCategory = new Map();
  for (const s of catalog) {
    if (!byCategory.has(s.category)) byCategory.set(s.category, new Set());
    for (const k of s.keywords || []) byCategory.get(s.category).add(k);
  }
  const text = [...byCategory]
    .map(([category, terms]) => `${category}: ${[...terms].join(", ")}`)
    .join("\n");

  vocabCache.set(catalog, text);
  return text;
}

const EXTRACT_SYSTEM = `You read Indian public-procurement tender text and extract structured facets from it.

The text may be English, Hindi, Hinglish, or a mix, and is often messy — pasted
from a PDF, full of boilerplate, with the actual item buried in it. Extract only
what the text genuinely says. Never infer a material, quantity or application
that is not there; leave the field as an empty string instead.

Your search terms are the important part. They are fed to a keyword matcher that
only knows the vocabulary below, so choose terms from it using its exact wording.
Terms outside this vocabulary match nothing and are wasted.

CATALOG VOCABULARY
`;

/* ------------------------------------------------------------------- calls */

async function extractFacets(text, catalog) {
  const response = await getClient().messages.parse({
    model: MODEL,
    max_tokens: 2048,
    output_config: { effort: "low", format: zodOutputFormat(FacetSchema) },
    system: [
      {
        type: "text",
        text: EXTRACT_SYSTEM + vocabulary(catalog),
        // Stable prefix across every request, so this is served from cache
        // after the first call. The tender text below it is the volatile part.
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: `TENDER TEXT\n\n${text.slice(0, 12000)}` }],
  });

  if (response.stop_reason === "refusal") throw new Error("extraction refused");
  if (!response.parsed_output) throw new Error("extraction returned no parsable output");
  return { facets: response.parsed_output, usage: response.usage };
}

/**
 * Only the directly-matched standards are sent for explanation.
 *
 * Explanation latency scales with the number of standards, and it was the
 * bottleneck: ten recommendations took ~12s. The graph-derived ones already
 * carry a better explanation than prose would be — "Referenced by IS 4984 as
 * an installation standard" states the actual provenance — so paying a model
 * to restate that is both slower and worse.
 */
const EXPLAIN_LIMIT = 6;

async function explainRecommendations(text, facets, recommendations, byId) {
  const target = recommendations
    .filter((r) => r.tier === "Primary" || r.tier === "Allied")
    .slice(0, EXPLAIN_LIMIT);

  if (target.length === 0) return { output: { summary: "", explanations: [] }, usage: {} };

  const listing = target
    .map((r) => {
      const s = byId.get(r.id);
      return `${r.id} | ${s.number} | ${s.title} | tier: ${r.tier} | scope: ${s.scope}`;
    })
    .join("\n");

  const response = await getClient().messages.parse({
    model: MODEL,
    max_tokens: 1536,
    output_config: { effort: "low", format: zodOutputFormat(ExplanationSchema) },
    system: [
      {
        // No cache_control here: this prompt is ~200 tokens, well under the
        // minimum cacheable prefix, so a breakpoint would silently do nothing.
        type: "text",
        text:
          "You explain why specific Indian Standards apply to a procurement.\n\n" +
          "The standards were already selected by a deterministic matching engine — do not " +
          "question the selection, add standards, or mention any standard not in the list. " +
          "Return an entry for every id given, each ONE sentence of at most 25 words, tied to " +
          "this particular procurement rather than restating the standard's title. Keep the " +
          "summary to a single sentence.\n\n" +
          "Tier meanings: Primary is the governing product standard; Allied has overlapping " +
          "scope; Normative is referenced by a primary standard; Test is the acceptance test " +
          "method; Installation governs site work.",
      },
    ],
    messages: [
      {
        role: "user",
        content:
          `PROCUREMENT\n${text.slice(0, 4000)}\n\n` +
          `EXTRACTED FACETS\n${JSON.stringify(facets, null, 2)}\n\n` +
          `SELECTED STANDARDS\n${listing}`,
      },
    ],
  });

  if (response.stop_reason === "refusal") throw new Error("explanation refused");
  if (!response.parsed_output) throw new Error("explanation returned no parsable output");
  return { output: response.parsed_output, usage: response.usage };
}

/* ------------------------------------------------------------------ helpers */

const hash = (text) => crypto.createHash("sha256").update(text).digest("hex");

function remember(key, value) {
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
  cache.set(key, value);
}

const price = (usage) =>
  ((usage.input_tokens ?? 0) * 5 +
    (usage.cache_creation_input_tokens ?? 0) * 6.25 +
    (usage.cache_read_input_tokens ?? 0) * 0.5 +
    (usage.output_tokens ?? 0) * 25) / 1e6;

/**
 * Runs the AI-assisted path. Returns null — never throws — if it cannot
 * complete, so the caller can fall through to the rule-based engine.
 *
 * @param {string} text        raw tender text
 * @param {object[]} catalog   standards catalog
 * @param {Function} runAnalysis  the deterministic engine
 */
export async function analyzeWithAI(text, catalog, runAnalysis) {
  if (!aiConfigured()) return null;

  const key = hash(text);
  const cached = cache.get(key);
  if (cached) return { ...cached, cached: true };

  const started = Date.now();
  try {
    const extractStarted = Date.now();
    const { facets, usage: extractUsage } = await extractFacets(text, catalog);
    const extractMs = Date.now() - extractStarted;

    // Feed the catalog's own vocabulary back into the matcher. The engine stays
    // the authority on which standards are returned.
    const enriched = [text, ...(facets.searchTerms || [])].join(" \n");
    const analysis = runAnalysis(enriched, catalog);

    if (analysis.recommendations.length === 0) {
      // Nothing matched even with Claude's help. Report that honestly rather
      // than asking Claude to justify an empty set.
      const result = {
        ...analysis,
        query: text,
        mode: "ai",
        aiSummary: "No standard in the catalog matched this description, even after AI extraction.",
        facets,
        costUsd: Number(price(extractUsage).toFixed(6)),
        elapsedMs: Date.now() - started,
      };
      remember(key, result);
      return result;
    }

    const byId = new Map(catalog.map((s) => [s.id, s]));
    const explainStarted = Date.now();
    const { output, usage: explainUsage } = await explainRecommendations(
      text, facets, analysis.recommendations, byId,
    );
    const explainMs = Date.now() - explainStarted;

    const reasonById = new Map((output.explanations || []).map((e) => [e.id, e.reason]));
    const recommendations = analysis.recommendations.map((r) => {
      const aiReason = reasonById.get(r.id);
      // The engine's own reasons are kept underneath — they are the audit trail
      // for why this standard was selected at all.
      return aiReason ? { ...r, reasons: [aiReason, ...r.reasons] } : r;
    });

    const facetFields = {
      ...(facets.product && { "Product": facets.product }),
      ...(facets.material && { "Material": facets.material }),
      ...(facets.application && { "Application": facets.application }),
      ...(facets.environment && { "Environment": facets.environment }),
      ...(facets.citedStandards?.length && { "Standards cited in the query": facets.citedStandards.join(", ") }),
    };

    const result = {
      ...analysis,
      query: text,
      recommendations,
      extracted: { ...facetFields, ...analysis.extracted },
      mode: "ai",
      aiSummary: output.summary,
      facets,
      costUsd: Number((price(extractUsage) + price(explainUsage)).toFixed(6)),
      elapsedMs: Date.now() - started,
      timings: {
        extractMs,
        explainMs,
        cacheRead: extractUsage.cache_read_input_tokens ?? 0,
        cacheWrite: extractUsage.cache_creation_input_tokens ?? 0,
      },
    };

    remember(key, result);
    return result;
  } catch (err) {
    // Logged, not surfaced: the user gets a working rule-based answer instead.
    console.warn(`AI path unavailable after ${Date.now() - started}ms - falling back: ${err.message}`);
    return null;
  }
}

/**
 * Writes the vocabulary prompt into the cache at boot.
 *
 * Without this the first real query of the session pays cache_creation — which
 * is what made the very first measured request 19s against ~10s for every one
 * after it. On a demo machine that first request is the one someone is
 * watching. Fire-and-forget: if it fails, nothing is lost.
 */
export function prewarm(catalog) {
  if (!aiConfigured()) return;
  const started = Date.now();
  extractFacets("cement", catalog)
    .then(({ usage }) => {
      const written = usage.cache_creation_input_tokens ?? 0;
      console.log(`AI prompt cache warmed in ${Date.now() - started}ms (${written} tokens written)`);
    })
    .catch((err) => console.warn(`AI prewarm skipped: ${err.message}`));
}

export function aiStatus() {
  return {
    configured: aiConfigured(),
    reason: process.env.ANTHROPIC_API_KEY
      ? process.env.AI_ENABLED === "false"
        ? "disabled by AI_ENABLED=false"
        : "ready"
      : "no ANTHROPIC_API_KEY set",
    model: MODEL,
    timeoutMs: TIMEOUT_MS,
    cached: cache.size,
  };
}
