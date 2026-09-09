/**
 * Behavioural contract for the scenario matching engine.
 *
 * Two kinds of assertion live here, and the difference matters:
 *
 *   1. CONTRACTS — behaviour that must hold no matter how the engine is
 *      rewritten. The four demo scenarios are in this group: they are what
 *      gets shown in a live demo, so their output is frozen.
 *
 *   2. PINNED CURRENT BEHAVIOUR — marked `TODO(phase-2)`. These record what
 *      the engine does *today*, including two known bugs, so that any change
 *      shows up as a deliberate diff in this file rather than as a silent
 *      regression somewhere else.
 *
 * Run with `npm test`.
 */

import test, { describe } from "node:test";
import assert from "node:assert/strict";

import {
  detectLanguage,
  detectScenario,
  extractQuantity,
  matchesTerm,
  runAnalysis,
  SCENARIOS,
} from "../shared/matching.js";
import CATALOG from "../shared/standards.json" with { type: "json" };

const CATALOG_IDS = new Set(CATALOG.map((s) => s.id));
const byCategory = (id) => CATALOG.find((s) => s.id === id)?.category;
const VALID_TIERS = new Set(["Primary", "Allied", "Normative", "Test", "Installation", "Optional"]);
const COMPLIANCE_KEYS = [
  "overall", "coverage", "versionValidity", "normativeRefs",
  "safetyCoverage", "certCoverage", "technicalCompleteness", "risk",
];

/** The demo queries, and the exact recommendation list each must keep producing. */
const DEMO_QUERIES = {
  led: {
    query: "Procure 500 nos solar LED street lights for rural roads",
    product: "Solar-Powered LED Street Light",
    quantity: "500",
    // SL10 (IS/IEC 60529, the IP Code) was added deliberately during the catalog
    // expansion: it sat in the catalog unrecommended while the scenario's own
    // "missing" list told the user to go and consider it.
    recommendations: [
      ["SL06", "Primary", 96], ["SL02", "Primary", 94], ["SL04", "Primary", 91],
      ["SL01", "Allied", 88], ["SL07", "Allied", 85], ["SL05", "Normative", 80],
      ["SL03", "Test", 75], ["SL09", "Installation", 70], ["SL10", "Normative", 68],
      ["SL08", "Normative", 62],
    ],
  },
  tank: {
    query: "Supply of stainless steel water tank for hospital",
    product: "Stainless Steel Water Storage Tank",
    quantity: null,
    recommendations: [
      ["WT01", "Primary", 94], ["WT02", "Normative", 88],
      ["WT03", "Allied", 82], ["WT04", "Test", 70],
    ],
  },
  firedoor: {
    query: "fire door for school building",
    product: "Fire-Resistant Door",
    quantity: null,
    recommendations: [
      ["FD01", "Primary", 95], ["FD02", "Allied", 84],
      ["FD03", "Test", 88], ["FD04", "Normative", 66],
    ],
  },
  pump: {
    query: "need 12 units centrifugal pump for water supply",
    product: "Industrial Water Pump",
    quantity: "12",
    recommendations: [
      ["PM01", "Primary", 93], ["PM03", "Allied", 80],
      ["PM02", "Test", 85], ["PM04", "Normative", 68],
    ],
  },
};

describe("demo scenarios (frozen — these are what gets demonstrated)", () => {
  for (const [key, expected] of Object.entries(DEMO_QUERIES)) {
    test(`${key}: full output is unchanged`, () => {
      const result = runAnalysis(expected.query, CATALOG);

      assert.equal(result.scenarioKey, key);
      assert.equal(result.product, expected.product);
      assert.deepEqual(
        result.recommendations.map((r) => [r.id, r.tier, r.relevance]),
        expected.recommendations,
      );
      assert.deepEqual(result.compliance, SCENARIOS[key].compliance);
      assert.deepEqual(result.missing, SCENARIOS[key].missing);
      assert.deepEqual(result.certification, SCENARIOS[key].certification);
    });

    test(`${key}: quantity extraction`, () => {
      const result = runAnalysis(expected.query, CATALOG);
      assert.equal(result.extracted["Quantity (detected)"] ?? null, expected.quantity);
    });

    test(`${key}: every recommendation has a reason`, () => {
      const result = runAnalysis(expected.query, CATALOG);
      for (const rec of result.recommendations) {
        assert.ok(Array.isArray(rec.reasons) && rec.reasons.length > 0, `${rec.id} has no reasons`);
      }
    });
  }
});

describe("structural invariants (must hold for any query)", () => {
  const queries = [
    ...Object.values(DEMO_QUERIES).map((d) => d.query),
    "procure 40 nos office chairs",
    "",
    "!!!",
    "a".repeat(5000),
    "पानी की टंकी चाहिए",
  ];

  for (const query of queries) {
    const label = query.length > 40 ? `${query.slice(0, 37)}...` : query || "(empty string)";

    test(`"${label}" produces a well-formed result`, () => {
      const result = runAnalysis(query, CATALOG);

      assert.equal(typeof result.product, "string");
      assert.ok(["English", "Hindi", "Hinglish"].includes(result.language));
      assert.ok(Array.isArray(result.recommendations));
      assert.ok(Array.isArray(result.missing));
      assert.equal(typeof result.timestamp, "string");

      for (const key of COMPLIANCE_KEYS) {
        assert.ok(key in result.compliance, `compliance.${key} is missing`);
      }
      assert.ok(["Low", "Medium", "High", "Critical"].includes(result.compliance.risk));

      for (const rec of result.recommendations) {
        // A recommendation pointing at a standard that is not in the catalog
        // would render as the "no longer in the catalog" placeholder in the UI.
        assert.ok(CATALOG_IDS.has(rec.id), `${rec.id} is not in the catalog`);
        assert.ok(VALID_TIERS.has(rec.tier), `${rec.tier} is not a known tier`);
        assert.ok(rec.relevance >= 0 && rec.relevance <= 100, `relevance ${rec.relevance} out of range`);
      }
    });
  }

  test("recommendations are unique per analysis", () => {
    for (const { query } of Object.values(DEMO_QUERIES)) {
      const ids = runAnalysis(query, CATALOG).recommendations.map((r) => r.id);
      assert.equal(new Set(ids).size, ids.length, `duplicate recommendation in "${query}"`);
    }
  });

  test("an empty catalog does not throw", () => {
    const result = runAnalysis("solar led street light", []);
    assert.deepEqual(result.recommendations, []);
  });
});

describe("whole-word matching (guards the 'sealed cover' false positive)", () => {
  // Substring matching made ordinary tender boilerplate match the LED scenario,
  // because "sealed", "detailed" and "scheduled" all contain "led".
  const mustNotMatchLed = [
    "bids in sealed cover with detailed scope as scheduled",
    "the form must be filled in and controlled",
    "supply chain management services",
  ];

  for (const text of mustNotMatchLed) {
    test(`"${text.slice(0, 34)}..." is not an LED query`, () => {
      assert.equal(detectScenario(text), "generic");
    });
  }

  test("matchesTerm respects word boundaries", () => {
    assert.equal(matchesTerm("controlled access", "led"), false);
    assert.equal(matchesTerm("led lighting", "led"), true);
  });

  test("a trailing plural still matches", () => {
    assert.equal(detectScenario("LEDs required"), "led");
    assert.equal(detectScenario("pumps needed"), "pump");
  });

  test("Devanagari falls back to substring matching", () => {
    // JavaScript's \b never produces a boundary around Devanagari characters.
    assert.equal(detectScenario("पानी की टंकी"), "tank");
    assert.equal(detectScenario("सोलर स्ट्रीट लाइट"), "led");
  });
});

describe("quantity extraction (guards the 'within 45 days' false positive)", () => {
  test("a duration is not a quantity", () => {
    assert.equal(extractQuantity("work shall be completed within 45 days"), null);
  });

  test("a capacity spec is not an order count", () => {
    // "500 tanks of 5000 litre capacity" describes the spec, not the count,
    // so litre/kg are deliberately excluded from the unit pattern.
    assert.equal(extractQuantity("500 tanks of 5000 litre capacity"), null);
  });

  test("an explicit quantity label wins", () => {
    assert.equal(extractQuantity("Quantity: 1,250 units"), "1250");
    assert.equal(extractQuantity("Qty - 88"), "88");
  });

  test("a unit-qualified number is picked up", () => {
    assert.equal(extractQuantity("40 nos office chairs"), "40");
    assert.equal(extractQuantity("supply of 12 sets"), "12");
  });

  test("commas are stripped", () => {
    assert.equal(extractQuantity("quantity 12,500"), "12500");
  });

  test("no number means null", () => {
    assert.equal(extractQuantity("supply of office chairs"), null);
  });
});

describe("language detection", () => {
  test("Devanagari is Hindi", () => {
    assert.equal(detectLanguage("सोलर स्ट्रीट लाइट चाहिए"), "Hindi");
  });

  test("plain English is English", () => {
    assert.equal(detectLanguage("procure water tanks"), "English");
  });

  test("romanised Hindi keywords are Hinglish", () => {
    assert.equal(detectLanguage("mujhe pump chahiye"), "Hinglish");
    assert.equal(detectLanguage("tank karna hai"), "Hinglish");
    assert.equal(detectLanguage("street light karne ke liye"), "Hinglish");
  });

  // Fixed in phase 2: verb roots are matched as prefixes, particles as whole
  // words. Previously both of these were reported as English, because
  // "khareed" as a whole word never matches "khareedna".
  test("inflected Hinglish verbs are detected", () => {
    assert.equal(detectLanguage("mujhe 50 pump khareedna hai"), "Hinglish");
    assert.equal(detectLanguage("tank khareedni hai"), "Hinglish");
    assert.equal(detectLanguage("cement kharidna hai"), "Hinglish");
  });

  test("prefix matching does not create false Hinglish", () => {
    // Guards the same class of bug the whole-word rule was introduced for.
    assert.equal(detectLanguage("chain link fencing supply"), "English");
    assert.equal(detectLanguage("procure 40 nos office chairs"), "English");
  });
});

describe("generic path: scoring", () => {
  test("a direct match cites the keywords it matched on", () => {
    const result = runAnalysis("outdoor luminaire for a lighting fixture", CATALOG);
    assert.equal(result.scenarioKey, "generic");
    assert.ok(result.recommendations.length > 0);

    const direct = result.recommendations.filter((r) => r.tier === "Primary" || r.tier === "Allied");
    assert.ok(direct.length > 0, "expected at least one direct match");
    assert.ok(
      direct.some((r) => r.reasons.some((x) => x.startsWith("Matched on"))),
      "expected a direct match to cite its matched keywords",
    );
  });

  // Was the worst demo failure mode: with no keyword hit the engine returned
  // the first three catalog rows and labelled the first "Primary", so an
  // office-furniture query recommended LED luminaire standards at 42%.
  test("a furniture query returns furniture standards", () => {
    const result = runAnalysis("procure 40 nos office chairs", CATALOG);

    assert.equal(result.scenarioKey, "generic");
    const ids = result.recommendations.map((r) => r.id);
    assert.ok(ids.length > 0, "expected recommendations");
    assert.ok(
      ids.every((id) => id.startsWith("FN")),
      `expected only Furniture & Wood Products standards, got ${ids.join(", ")}`,
    );
    assert.ok(result.recommendations.some((r) => r.tier === "Primary"));
  });

  test("rarity weighting keeps a catalog-wide word from winning", () => {
    // "safety" appears across PPE, switchgear, lighting and IT rows, so it must
    // not outrank the specific terms "safety helmet" and "helmet".
    const result = runAnalysis("safety helmets and gloves for workers", CATALOG);
    const primary = result.recommendations.filter((r) => r.tier === "Primary");

    assert.deepEqual(primary.map((r) => r.id), ["PE01"]);
    assert.ok(
      result.recommendations.every((r) => byCategory(r.id) === "Personal Protective Equipment"),
      `expected only PPE standards, got ${result.recommendations.map((r) => r.id).join(", ")}`,
    );
  });

  test("a homonym across categories does not produce a false Primary", () => {
    // "panel" and "board" mean different things in switchgear and joinery.
    const result = runAnalysis("supply of lt distribution panel board", CATALOG);
    const primary = result.recommendations.filter((r) => r.tier === "Primary");

    assert.deepEqual(primary.map((r) => r.id), ["SW04"]);
    assert.ok(
      !result.recommendations.some((r) => r.id.startsWith("FN")),
      "a wood-panel standard leaked into an electrical panel query",
    );
  });

  test("an unmatched query recommends nothing rather than guessing", () => {
    const result = runAnalysis("xyzzy nonsense qwerty", CATALOG);

    assert.deepEqual(result.recommendations, []);
    assert.equal(result.product, "Not classified");
    assert.equal(result.compliance.risk, "Critical");
  });
});

describe("generic path: relation-graph tiering", () => {
  test("tier comes from the relation edge, not from list position", () => {
    const result = runAnalysis("laying of hdpe water pipeline", CATALOG);
    const tierOf = (id) => result.recommendations.find((r) => r.id === id)?.tier;

    // PP10 is the pipe-laying code of practice. Nothing in the query names it;
    // it is reached through PP03's `installation` edge, so it must be
    // Installation tier — under the old positional scheme it was unreachable.
    assert.equal(tierOf("PP03"), "Primary");
    assert.equal(tierOf("PP10"), "Installation");
  });

  test("a test method is pulled in for a product query", () => {
    // CE09 is the cement test method. The query says nothing about testing.
    const result = runAnalysis("200 bags of 53 grade cement", CATALOG);
    const rec = result.recommendations.find((r) => r.id === "CE09");

    assert.ok(rec, "expected the cement test standard to be pulled in");
    assert.equal(rec.tier, "Test");
    assert.ok(rec.reasons.some((x) => x.includes("Referenced by")));
  });

  test("graph-derived recommendations say they came from the graph", () => {
    const result = runAnalysis("rooftop solar panels with inverter", CATALOG);
    const derived = result.recommendations.filter(
      (r) => !r.reasons.some((x) => x.startsWith("Matched on")),
    );

    assert.ok(derived.length > 0, "expected at least one graph-derived recommendation");
    for (const rec of derived) {
      assert.ok(
        rec.reasons.some((x) => x.includes("from the standards graph")),
        `${rec.id} does not disclose that it came from the graph`,
      );
    }
  });
});

describe("generic path: computed compliance", () => {
  test("scores are derived, not constant", () => {
    const a = runAnalysis("200 bags of 53 grade cement", CATALOG).compliance;
    const b = runAnalysis("rooftop solar panels with inverter", CATALOG).compliance;
    assert.notDeepEqual(a, b, "two different queries produced identical compliance scores");
  });

  test("versionValidity reflects the status of the matched standards", () => {
    const result = runAnalysis("mild steel plain bar for reinforcement", CATALOG);
    const matched = result.recommendations.map((r) => CATALOG.find((s) => s.id === r.id));
    const currentShare = matched.filter((s) => s.status === "Current").length / matched.length;

    assert.equal(result.compliance.versionValidity, Math.round(currentShare * 100));
  });

  test("a stale standard in the result set is reported as a gap", () => {
    // ST03 (IS 432 Pt 1) is marked Under Revision in the catalog.
    const result = runAnalysis("mild steel plain bar for reinforcement", CATALOG);
    if (result.recommendations.some((r) => r.id === "ST03")) {
      assert.ok(
        result.missing.some((m) => m.includes("Version check required")),
        "expected a version-currency gap to be reported",
      );
    }
  });

  test("gaps are specific to what the result set lacks", () => {
    const result = runAnalysis("100 laptops for school computer lab", CATALOG);
    assert.ok(Array.isArray(result.missing) && result.missing.length > 0);
    assert.ok(
      result.missing.every((m) => typeof m === "string" && m.length > 20),
      "expected descriptive gap text",
    );
  });
});

describe("catalog integrity", () => {
  test("ids are unique", () => {
    const ids = CATALOG.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  test("every standard has the fields the UI reads", () => {
    for (const s of CATALOG) {
      for (const field of ["id", "number", "title", "category", "domain", "status", "scope"]) {
        assert.ok(s[field], `${s.id} is missing ${field}`);
      }
      assert.ok(Array.isArray(s.keywords) && s.keywords.length > 0, `${s.id} has no keywords`);
      assert.equal(typeof s.certification, "object", `${s.id} has no certification block`);
    }
  });

  test("status is one of the four the API accepts", () => {
    // Mirrors VALID_STATUSES in server/index.js — a catalog row outside this
    // set cannot be saved back through PUT /api/standards/:id.
    const allowed = new Set(["Current", "Superseded", "Under Revision", "Withdrawn"]);
    for (const s of CATALOG) {
      assert.ok(allowed.has(s.status), `${s.id} has status "${s.status}"`);
    }
  });

  test("every relation points at a standard that exists", () => {
    for (const s of CATALOG) {
      for (const [kind, ids] of Object.entries(s.relations || {})) {
        for (const id of ids) {
          assert.ok(CATALOG_IDS.has(id), `${s.id}.relations.${kind} -> unknown id ${id}`);
        }
      }
    }
  });

  test("no standard relates to itself", () => {
    for (const s of CATALOG) {
      for (const [kind, ids] of Object.entries(s.relations || {})) {
        assert.ok(!ids.includes(s.id), `${s.id}.relations.${kind} points at itself`);
      }
    }
  });

  test("every scenario recommendation exists in the catalog", () => {
    for (const [key, scenario] of Object.entries(SCENARIOS)) {
      for (const rec of scenario.recommendations) {
        assert.ok(CATALOG_IDS.has(rec.id), `SCENARIOS.${key} -> unknown id ${rec.id}`);
      }
    }
  });
});
