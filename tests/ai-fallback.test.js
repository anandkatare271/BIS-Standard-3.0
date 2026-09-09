/**
 * The fallback contract for the AI path.
 *
 * These tests deliberately make no network calls. What they guard is the one
 * property the live demo depends on: analyzeWithAI must return null rather
 * than throw whenever it cannot do its job, so /api/analyze falls through to
 * the deterministic engine and the user still gets an answer.
 *
 * The live path itself is verified by hand against a real key — it cannot be
 * asserted here without spending money and requiring network on every run.
 */

import test, { describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { analyzeWithAI, aiConfigured, aiStatus, prewarm } from "../server/ai.js";
import { runAnalysis } from "../shared/matching.js";
import CATALOG from "../shared/standards.json" with { type: "json" };

const SAMPLE = "supply of 500 bags of 43 grade cement";
let savedKey;
let savedFlag;

beforeEach(() => {
  savedKey = process.env.ANTHROPIC_API_KEY;
  savedFlag = process.env.AI_ENABLED;
});

afterEach(() => {
  if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = savedKey;
  if (savedFlag === undefined) delete process.env.AI_ENABLED;
  else process.env.AI_ENABLED = savedFlag;
});

describe("AI path is opt-in", () => {
  test("not configured without a key", () => {
    delete process.env.ANTHROPIC_API_KEY;
    assert.equal(aiConfigured(), false);
    assert.match(aiStatus().reason, /no ANTHROPIC_API_KEY/);
  });

  test("AI_ENABLED=false is a kill switch even with a key present", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-api03-not-a-real-key";
    process.env.AI_ENABLED = "false";
    assert.equal(aiConfigured(), false);
    assert.match(aiStatus().reason, /disabled by AI_ENABLED/);
  });

  test("configured when a key is present and not disabled", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-api03-not-a-real-key";
    process.env.AI_ENABLED = "true";
    assert.equal(aiConfigured(), true);
    assert.equal(aiStatus().reason, "ready");
  });
});

describe("AI path degrades instead of failing", () => {
  test("returns null with no key, without touching the network", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    assert.equal(await analyzeWithAI(SAMPLE, CATALOG, runAnalysis), null);
  });

  test("returns null when killed by the flag", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-api03-not-a-real-key";
    process.env.AI_ENABLED = "false";
    assert.equal(await analyzeWithAI(SAMPLE, CATALOG, runAnalysis), null);
  });

  test("prewarm is a no-op when unconfigured and never throws", () => {
    delete process.env.ANTHROPIC_API_KEY;
    assert.doesNotThrow(() => prewarm(CATALOG));
  });

  test("the rule-based result the caller falls back to is still complete", () => {
    // What /api/analyze substitutes when analyzeWithAI returns null.
    const fallback = { ...runAnalysis(SAMPLE, CATALOG), mode: "rule-based" };

    assert.equal(fallback.mode, "rule-based");
    assert.ok(fallback.recommendations.length > 0);
    assert.equal(fallback.aiSummary, undefined);
    assert.ok(fallback.compliance.overall > 0);
    for (const key of ["query", "language", "product", "extracted", "missing", "certification"]) {
      assert.ok(key in fallback, `fallback result is missing ${key}`);
    }
  });
});
