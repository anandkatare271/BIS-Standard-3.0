import { auditTender } from "./audit.js";

/**
 * Original IS-Match AI scenario engine — preserved from IS-Match-AI_1.jsx.
 * Catalog is injected so the same matching logic can run against the database.
 */

/**
 * Whole-word term matching.
 *
 * Substring matching cannot be used here: ordinary tender boilerplate ("sealed cover",
 * "detailed scope", "as scheduled", "filled in") all contain "led", which made every
 * real document match the LED scenario. Likewise "chain" contains "hain".
 *
 * Devanagari terms fall back to substring matching, because JavaScript's \b and the
 * ASCII-only guards below never produce a boundary around Devanagari characters.
 */
const termCache = new Map();

function termPattern(term) {
  if (!termCache.has(term)) {
    let re = null; // null => non-ASCII term, caller uses includes()
    if (!/[^\x00-\x7F]/.test(term)) {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // Trailing "s?" so "led" also matches "LEDs" and "pump" matches "pumps".
      re = new RegExp(`(?<![a-z0-9])${escaped}s?(?![a-z0-9])`, "i");
    }
    termCache.set(term, re);
  }
  return termCache.get(term);
}

/** True when `term` appears in `text` as a whole word (substring, for Devanagari). */
export function matchesTerm(text, term) {
  const re = termPattern(term);
  return re ? re.test(text) : text.includes(term);
}

/**
 * Romanised Hindi splits in two, because one matching rule cannot serve both.
 *
 * Whole-word matching is correct for particles ("ke liye", "hain") but wrong
 * for verb roots: "khareed" as a whole word never matches "khareedna" or
 * "khareedni", which is what people actually type. Roots are therefore matched
 * as prefixes. Before this split, "mujhe 50 pump khareedna hai" was reported
 * as English.
 */
const HINGLISH_WORDS = ["chahiye", "chaahiye", "hain", "ke liye", "karna", "karni", "karne", "purchase karna"];
const HINGLISH_ROOTS = ["khareed", "kharid", "mangwa", "lagwa"];

const stemCache = new Map();

function stemPattern(root) {
  if (!stemCache.has(root)) {
    const escaped = root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    stemCache.set(root, new RegExp(`(?<![a-z0-9])${escaped}[a-z]*`, "i"));
  }
  return stemCache.get(root);
}

export function detectLanguage(text) {
  if (/[\u0900-\u097F]/.test(text)) return "Hindi";
  if (HINGLISH_WORDS.some((w) => matchesTerm(text, w))) return "Hinglish";
  if (HINGLISH_ROOTS.some((r) => stemPattern(r).test(text))) return "Hinglish";
  return "English";
}

export function detectScenario(text) {
  const has = (arr) => arr.some((w) => matchesTerm(text, w));
  if (has(["led", "street light", "streetlight", "solar light", "सोलर", "बत्ती", "स्ट्रीट लाइट"])) return "led";
  if (has(["water tank", "storage tank", "stainless steel tank", "टैंक", "टंकी"])) return "tank";
  if (has(["fire door", "fire resistant door", "fire-resistant door", "fire check door"])) return "firedoor";
  if (has(["pump", "centrifugal pump", "पंप"])) return "pump";
  return "generic";
}

/**
 * Pulls an order quantity from free text, preferring explicitly qualified numbers.
 * The previous version returned the first number anywhere in the text, so a real
 * tender reported "45" from "shall be completed within 45 days" as the quantity.
 */
export function extractQuantity(text) {
  const patterns = [
    // Most explicit first. Note that litre/kg are deliberately absent: "500 tanks of
    // 5000 litre capacity" describes a spec, not the order count.
    /(?:quantity|qty)\s*[:\-]?\s*(\d[\d,]*)/i,
    /(\d[\d,]*)\s*(?:nos?\.?|units?|pieces?|pcs?|sets?)(?![a-z])/i,
    /(?:procure|purchase|supply of|supplying|need|require|install)\s+(?:about\s+|approx\.?\s*)?(\d[\d,]*)/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[1].replace(/,/g, "");
  }
  return null;
}

export const SCENARIOS = {
  led: {
    product: "Solar-Powered LED Street Light",
    extracted: {
      "Product": "LED street lighting fixture",
      "Power source": "Solar photovoltaic",
      "Application": "Rural / municipal road lighting",
      "Environment": "Outdoor, weather-exposed",
      "Performance requirement": "Energy efficiency, adequate illumination level",
      "Safety requirement": "Electrical safety for outdoor installation",
      "Domain": "Electrical & Lighting / Renewable Energy",
    },
    recommendations: [
      { id: "SL06", tier: "Primary", relevance: 96, reasons: ["Product category matches: solar street lighting system", "Application matches: rural road lighting", "Power-source requirement (solar) matches exactly", "Covers system-level integration, not just the fixture"] },
      { id: "SL02", tier: "Primary", relevance: 94, reasons: ["Product category matches: LED luminaire", "Performance requirement (efficacy, illumination) matches", "Energy-efficiency requirement addressed"] },
      { id: "SL04", tier: "Primary", relevance: 91, reasons: ["Particular requirements for street-lighting luminaires", "Application scope matches road/street lighting"] },
      { id: "SL01", tier: "Allied", relevance: 88, reasons: ["General safety requirement referenced by all luminaire standards above", "Foundational construction-safety scope"] },
      { id: "SL07", tier: "Allied", relevance: 85, reasons: ["Battery is a mandatory component of a solar lighting system", "Directly referenced by IS 16620 as a system component standard"] },
      { id: "SL05", tier: "Normative", relevance: 80, reasons: ["Electrical construction safety is a normative reference of the primary standards", "Required for outdoor installation safety"] },
      { id: "SL03", tier: "Test", relevance: 75, reasons: ["Test method for photometric/thermal performance verification", "Referenced as the acceptance-test standard for LED luminaires"] },
      { id: "SL09", tier: "Installation", relevance: 70, reasons: ["Mounting-pole requirement for street-lighting installation", "Relevant to outdoor deployment of the fixture"] },
      { id: "SL10", tier: "Normative", relevance: 68, reasons: ["Ingress-protection rating is required for any weather-exposed fixture", "Referenced as the IP Code standard by the luminaire standards above"] },
      { id: "SL08", tier: "Normative", relevance: 62, reasons: ["Common terminology reference across lighting standards"] },
    ],
    missing: [
      "Required IP rating not stated in the query — IS/IEC 60529 is included above, but the tender must name the target IP class",
      "Battery backup duration / performance criteria not specified",
      "Photometric test-report requirement not specified in the draft query",
      "Electrical safety type-test certificate requirement not specified",
    ],
    compliance: { overall: 78, coverage: 82, versionValidity: 90, normativeRefs: 65, safetyCoverage: 75, certCoverage: 80, technicalCompleteness: 76, risk: "Medium" },
    certification: { category: "Lighting", status: "Possibly Applicable", scheme: "BIS Compulsory Registration (CRS) + MNRE empanelment", reason: "LED luminaire and solar-lighting-system categories are commonly notified under CRS; solar components may additionally require MNRE-listed vendors.", action: "Verify the current CRS notification list and MNRE empanelment status before publishing the tender." },
  },
  tank: {
    product: "Stainless Steel Water Storage Tank",
    extracted: {
      "Product": "Water storage tank",
      "Material": "Stainless steel",
      "Application": "Potable water storage",
      "Environment": "Institutional (hospital / school) installation",
      "Domain": "Water Infrastructure",
    },
    recommendations: [
      { id: "WT01", tier: "Primary", relevance: 94, reasons: ["Product category matches: stainless-steel water storage tank", "Material requirement matches exactly", "Covers fabrication and dimensional requirements"] },
      { id: "WT02", tier: "Normative", relevance: 88, reasons: ["Potable-water application requires compliance with drinking-water quality limits", "Relevant to end-use, not just the container material"] },
      { id: "WT03", tier: "Allied", relevance: 82, reasons: ["Corrosion-protection coating standard for associated steel components"] },
      { id: "WT04", tier: "Test", relevance: 70, reasons: ["Test methods to verify water-quality parameters after storage"] },
    ],
    missing: [
      "Welding / joint quality test certificate not specified",
      "Capacity tolerance and dimensional acceptance criteria not specified",
      "Corrosion-resistance / grade-of-steel verification not specified",
    ],
    compliance: { overall: 74, coverage: 80, versionValidity: 55, normativeRefs: 70, safetyCoverage: 60, certCoverage: 65, technicalCompleteness: 72, risk: "Medium" },
    certification: { category: "Water Storage", status: "Possibly Applicable", scheme: "BIS Product Certification (ISI Mark)", reason: "Certain tank capacities and materials may fall under mandatory ISI marking depending on end-use classification.", action: "Confirm the applicable Quality Control Order / ISI-mark notification for this tank category." },
  },
  firedoor: {
    product: "Fire-Resistant Door",
    extracted: {
      "Product": "Fire check / fire-resistant door",
      "Application": "Educational institution building",
      "Domain": "Fire & Life Safety",
    },
    recommendations: [
      { id: "FD01", tier: "Primary", relevance: 95, reasons: ["Product category matches: metal fire check door", "Application matches: institutional building use"] },
      { id: "FD02", tier: "Allied", relevance: 84, reasons: ["Alternate material variant (timber) of the same product family", "Should be reviewed if door material is unspecified"] },
      { id: "FD03", tier: "Test", relevance: 88, reasons: ["Fire-resistance test method required to assign a fire rating", "Directly referenced by the primary standard"] },
      { id: "FD04", tier: "Normative", relevance: 66, reasons: ["Door-closer hardware is typically required for self-closing fire-door assemblies"] },
    ],
    missing: [
      "Required fire-rating duration (in minutes) not specified",
      "Fire-rated hardware / door-closer compliance not specified",
      "Frame material and installation detail not specified",
    ],
    compliance: { overall: 71, coverage: 76, versionValidity: 85, normativeRefs: 60, safetyCoverage: 82, certCoverage: 55, technicalCompleteness: 68, risk: "Medium" },
    certification: { category: "Fire Safety", status: "Possibly Applicable", scheme: "State Fire (Life Safety) NOC + BIS Certification", reason: "Fire doors in public/educational buildings are typically governed by state fire regulations in addition to IS product standards.", action: "Verify applicable state Fire NOC requirements alongside IS compliance." },
  },
  pump: {
    product: "Industrial Water Pump",
    extracted: {
      "Product": "Centrifugal water pump",
      "Application": "Industrial / municipal water supply",
      "Domain": "Mechanical & Fluid Handling",
    },
    recommendations: [
      { id: "PM01", tier: "Primary", relevance: 93, reasons: ["Product category matches: horizontal centrifugal pump", "Application matches: water-supply use case"] },
      { id: "PM03", tier: "Allied", relevance: 80, reasons: ["Motor efficiency and performance standard for the driving motor"] },
      { id: "PM02", tier: "Test", relevance: 85, reasons: ["Acceptance-test procedure referenced by the primary pump standard"] },
      { id: "PM04", tier: "Normative", relevance: 68, reasons: ["General rating standard for the rotating electrical machine used in the pump set"] },
    ],
    missing: [
      "Required motor efficiency class not specified",
      "Suction/discharge performance test report not specified",
      "Permissible noise-level requirement not specified",
    ],
    compliance: { overall: 80, coverage: 85, versionValidity: 92, normativeRefs: 72, safetyCoverage: 78, certCoverage: 60, technicalCompleteness: 79, risk: "Low" },
    certification: { category: "Pumps & Machinery", status: "Not Identified", scheme: "—", reason: "No mandatory BIS certification scheme currently identified for this general pump category in the demo dataset.", action: "Re-verify against the current QCO list for the specific pump type." },
  },
};

/* =========================================================================
   GENERIC PATH — rarity-weighted scoring + relation-graph expansion

   The four scenarios above are hand-written and stay exactly as they were.
   Everything else used to go through a much weaker path that counted raw
   keyword hits, took the top four, and assigned tiers by array position, so
   the second-best match was always "Allied" whatever it actually was. With
   no keyword match at all it returned the first three catalog rows, which is
   how an office-furniture query came to recommend LED luminaire standards.

   Two changes replace it:

   1. Keywords are weighted by how rare they are in the catalog. "safety"
      appears in PPE, switchgear, lighting and IT rows alike, so it should
      count for far less than "tmt bar" or "flushing cistern".
   2. Tiers come from the relations graph instead of list position. Direct
      matches become Primary/Allied; their normative, test, safety,
      installation and material edges are then walked to pull in the
      standards a procurement officer would otherwise have to know to ask
      for — the pipe-laying code alongside the pipe, the cement test method
      alongside the cement.
   ========================================================================= */

/** Which tier a relation edge produces. `safety` folds into Normative
 *  because those are the six tiers the UI has styling for. */
const EDGE_TIER = {
  normative: "Normative",
  test: "Test",
  safety: "Normative",
  installation: "Installation",
  material: "Allied",
};

const TIER_RANK = { Primary: 0, Allied: 1, Normative: 2, Test: 3, Installation: 4, Optional: 5 };

/** Relevance floor for a standard reached through the graph rather than matched directly. */
const EDGE_RELEVANCE = { Normative: 66, Test: 71, Installation: 61, Allied: 58 };

const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));

/**
 * Inverse-document-frequency weights for every keyword in the catalog.
 * Cached per catalog array; a fresh array from the database recomputes, which
 * is a few hundred map operations and not worth optimising further.
 */
const indexCache = new WeakMap();

function catalogIndex(STANDARDS) {
  const cached = indexCache.get(STANDARDS);
  if (cached) return cached;

  const df = new Map();
  for (const s of STANDARDS) {
    for (const k of new Set((s.keywords || []).map((x) => x.toLowerCase()))) {
      df.set(k, (df.get(k) || 0) + 1);
    }
  }
  const total = STANDARDS.length || 1;
  const weight = new Map();
  for (const [term, n] of df) weight.set(term, Math.log(1 + total / n));

  const index = { weight, total };
  indexCache.set(STANDARDS, index);
  return index;
}

function scoreStandard(text, s, weight) {
  const matched = [];
  let score = 0;

  for (const k of s.keywords || []) {
    if (!matchesTerm(text, k)) continue;
    matched.push(k);
    score += weight.get(k.toLowerCase()) ?? 1;
    // A multi-word phrase matching is stronger evidence than a bare token.
    if (k.includes(" ")) score += 0.5;
  }

  // Category and domain only *strengthen* an existing keyword match. Letting them
  // create a match on their own dragged every Fire Safety row into a query about
  // safety helmets, purely because both live under a category containing "safety".
  if (matched.length > 0) {
    for (const field of [s.category, s.domain]) {
      const words = String(field || "").toLowerCase().split(/[^a-z0-9]+/);
      if (words.some((w) => w.length > 3 && matchesTerm(text, w))) score += 0.4;
    }
  }

  return { s, score, matched };
}

/** Nothing in the catalog matched. Say so, rather than inventing candidates. */
function noMatchAnalysis() {
  return {
    product: "Not classified",
    extracted: {
      "Product": "Could not be classified from the query",
      "Domain": "Unknown",
      "Note": "No standard in the catalog matched this description. Add detail — the product, its material, and where it will be used.",
    },
    recommendations: [],
    missing: [
      "The query did not match any standard in the catalog — it may be too short, or the category may not be covered yet",
      "Describe the item, its material and its application, then re-run the analysis",
      "Route to expert review if the category is genuinely absent from the catalog",
    ],
    compliance: {
      overall: 0, coverage: 0, versionValidity: 0, normativeRefs: 0,
      safetyCoverage: 0, certCoverage: 0, technicalCompleteness: 0, risk: "Critical",
    },
    certification: {
      category: "Unknown", status: "Not Identified", scheme: "—",
      reason: "No product category could be determined, so no certification scheme can be suggested.",
      action: "Refine the query or route to expert review.",
    },
  };
}

/** Everything the compliance panel shows, derived from the actual result set. */
function computeCompliance(recommendations, byId) {
  const standards = recommendations.map((r) => byId.get(r.id)).filter(Boolean);
  const n = standards.length;
  if (n === 0) return noMatchAnalysis().compliance;

  const share = (count) => (count / n) * 100;

  // How many recommended standards are still the current version.
  const versionValidity = clamp(share(standards.filter((s) => s.status === "Current").length));

  // How many of the recommended standards' own references were also pulled in.
  const inSet = new Set(recommendations.map((r) => r.id));
  let refs = 0;
  let resolved = 0;
  for (const s of standards) {
    for (const ids of Object.values(s.relations || {})) {
      for (const id of ids) {
        refs += 1;
        if (inSet.has(id)) resolved += 1;
      }
    }
  }
  const normativeRefs = refs === 0 ? 35 : clamp((resolved / refs) * 100);

  // How many distinct kinds of standard the set covers.
  const tiers = new Set(recommendations.map((r) => r.tier));
  const breadth = ["Primary", "Allied", "Normative", "Test", "Installation"].filter((t) => tiers.has(t)).length;
  const coverage = clamp(38 + breadth * 13);

  const safetyLinked = standards.filter(
    (s) => (s.relations?.safety || []).length > 0 || /safety|protection|fire/i.test(s.title),
  ).length;
  const safetyCoverage = clamp(30 + share(safetyLinked) * 0.7);

  const certIdentified = standards.filter(
    (s) => s.certification?.status && s.certification.status !== "Not Identified",
  ).length;
  const certCoverage = clamp(share(certIdentified));

  const avgRelevance = recommendations.reduce((a, r) => a + r.relevance, 0) / n;
  const technicalCompleteness = clamp(avgRelevance * 0.6 + coverage * 0.4);

  const overall = clamp(
    coverage * 0.22 + versionValidity * 0.14 + normativeRefs * 0.16 +
    safetyCoverage * 0.14 + certCoverage * 0.12 + technicalCompleteness * 0.22,
  );

  const risk = overall >= 78 ? "Low" : overall >= 62 ? "Medium" : overall >= 42 ? "High" : "Critical";
  return { overall, coverage, versionValidity, normativeRefs, safetyCoverage, certCoverage, technicalCompleteness, risk };
}

/** Gaps inferred from what the result set does *not* contain. */
function deriveMissing(text, recommendations, byId) {
  const tiers = new Set(recommendations.map((r) => r.tier));
  const standards = recommendations.map((r) => byId.get(r.id)).filter(Boolean);
  const gaps = [];

  if (!tiers.has("Test")) {
    gaps.push("No acceptance-test standard was matched — name the test method and require a test report in the tender");
  }
  if (!tiers.has("Installation")) {
    gaps.push("No installation or workmanship standard was matched — site practice and acceptance criteria are unspecified");
  }
  if (!standards.some((s) => s.certification?.status && s.certification.status !== "Not Identified")) {
    gaps.push("No certification scheme was identified for the matched categories — verify BIS and QCO applicability before publishing");
  }
  if (!extractQuantity(text)) {
    gaps.push("Order quantity was not stated in the query");
  }
  if (!/\b(ip\s*\d{2}|is\s*\d|iso\s*\d|iec\s*\d)\b/i.test(text)) {
    gaps.push("The query cites no standard number or rating class of its own — confirm the recommendations against the technical sanction");
  }
  if (standards.some((s) => s.status !== "Current")) {
    const stale = standards.filter((s) => s.status !== "Current").map((s) => s.number);
    gaps.push(`Version check required — ${stale.join(", ")} ${stale.length === 1 ? "is" : "are"} not marked Current`);
  }

  return gaps.length ? gaps : ["No structural gaps detected in this pass — an expert should still confirm scope and version currency"];
}

export function genericAnalysis(text, STANDARDS) {
  const { weight } = catalogIndex(STANDARDS);
  const byId = new Map(STANDARDS.map((s) => [s.id, s]));

  const direct = STANDARDS
    .map((s) => scoreStandard(text, s, weight))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.s.id.localeCompare(b.s.id));

  if (direct.length === 0) return noMatchAnalysis();

  const best = direct[0].score;

  // A single hit on a catalog-wide word like "safety" scores far below the best
  // match but is not zero, so without a floor it still surfaced as an Allied
  // recommendation — a query about safety helmets listed luminaire electrical
  // safety. A match must be worth at least 30% of the best one to appear.
  const FLOOR = 0.3;
  const MAX_PRIMARY = 4;
  const MAX_ALLIED = 3;
  const MAX_TOTAL = 12;

  const picked = new Map();

  /** First tier assigned wins; a later, weaker edge cannot demote a match. */
  const place = (id, tier, relevance, reasons) => {
    const existing = picked.get(id);
    if (existing && TIER_RANK[existing.tier] <= TIER_RANK[tier]) return;
    picked.set(id, { id, tier, relevance, reasons });
  };

  // Direct matches. A score close to the best becomes Primary, the rest Allied.
  let primaries = 0;
  let allied = 0;
  for (const hit of direct) {
    const ratio = hit.score / best;
    if (ratio < FLOOR) break; // sorted, so everything after this is weaker still

    const isPrimary = ratio >= 0.6 && primaries < MAX_PRIMARY;
    if (isPrimary) primaries += 1;
    else if (allied < MAX_ALLIED) allied += 1;
    else continue;

    place(
      hit.s.id,
      isPrimary ? "Primary" : "Allied",
      isPrimary ? clamp(80 + 15 * ratio, 0, 96) : clamp(52 + 30 * ratio),
      [
        `Matched on ${hit.matched.length === 1 ? "keyword" : "keywords"}: ${hit.matched.slice(0, 5).join(", ")}`,
        `Category inferred from the query: ${hit.s.category}`,
        isPrimary
          ? "Scored among the strongest matches for this description"
          : "Related match — scope overlaps but is not the closest fit",
      ],
    );
  }

  // Walk the relations graph out from the Primary matches only. Expanding from
  // Allied ones too pulled in their entire reference tree, which buried the
  // actual answer under standards two hops from anything the query said.
  const seeds = [...picked.values()].filter((r) => r.tier === "Primary");
  for (const seed of seeds) {
    const standard = byId.get(seed.id);
    if (!standard) continue;

    for (const [edge, tier] of Object.entries(EDGE_TIER)) {
      for (const targetId of standard.relations?.[edge] || []) {
        if (picked.has(targetId) || !byId.has(targetId)) continue;
        if (picked.size >= MAX_TOTAL) break;

        // An edge off an Allied match is weaker evidence than one off a Primary.
        const penalty = seed.tier === "Primary" ? 0 : 6;
        const kind = edge === "material" ? "component or material" : edge;
        place(targetId, tier, clamp(EDGE_RELEVANCE[tier] - penalty), [
          `Referenced by ${standard.number} as ${/^[aeiou]/.test(kind) ? "an" : "a"} ${kind} standard`,
          `Pulled in from the standards graph, not from the query text`,
          tier === "Test"
            ? "Required to verify conformance of the primary standard"
            : tier === "Installation"
              ? "Governs site work and acceptance for the matched product"
              : "Normatively referenced — compliance is not complete without it",
        ]);
      }
    }
  }

  const recommendations = [...picked.values()].sort(
    (a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier] || b.relevance - a.relevance,
  );

  const top = byId.get(recommendations[0].id) ?? direct[0].s;
  const matchedTerms = [...new Set(direct.flatMap((d) => d.matched))].slice(0, 6);

  return {
    product: `${top.category} — auto-classified from the query`,
    extracted: {
      "Product": top.category,
      "Domain": top.domain,
      "Matched on": matchedTerms.join(", ") || "category and domain only",
      "Standards matched": `${recommendations.length} (${primaries} primary, ${recommendations.length - primaries} allied or referenced)`,
    },
    recommendations,
    missing: deriveMissing(text, recommendations, byId),
    compliance: computeCompliance(recommendations, byId),
    certification: {
      category: top.category,
      ...(top.certification?.status
        ? top.certification
        : {
            status: "Not Identified", scheme: "—",
            reason: "No certification scheme is recorded for this category in the sample dataset.",
            action: "Re-verify against the current QCO list.",
          }),
    },
  };
}

export function runAnalysis(rawText, STANDARDS) {
  const language = detectLanguage(rawText);
  const scenarioKey = detectScenario(rawText);
  const qty = extractQuantity(rawText);
  const base = scenarioKey === "generic" ? genericAnalysis(rawText, STANDARDS) : SCENARIOS[scenarioKey];
  const extracted = { ...base.extracted };
  if (qty) extracted["Quantity (detected)"] = qty;
  const knownIds = new Set(STANDARDS.map((s) => s.id));
  const recommendations = (base.recommendations || []).filter((r) => knownIds.has(r.id));
  return {
    query: rawText,
    language,
    scenarioKey,
    product: base.product,
    extracted,
    recommendations,
    missing: base.missing,
    compliance: base.compliance,
    certification: base.certification,
    // Additive: checks the standards the text itself cites. The Tender page
    // renders this; every other page ignores it. The AI path recomputes it with
    // the citations the model found in prose that the regex cannot catch.
    audit: auditTender(rawText, recommendations, STANDARDS),
    timestamp: new Date().toLocaleString("en-IN"),
  };
}
