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

export function detectLanguage(text) {
  if (/[\u0900-\u097F]/.test(text)) return "Hindi";
  const hinglish = ["chahiye", "khareed", "hain", "ke liye", "karna", "karni", "karne", "purchase karna"];
  if (hinglish.some((w) => matchesTerm(text, w))) return "Hinglish";
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

export function genericAnalysis(text, STANDARDS) {
  const hits = (s) => (s.keywords || []).filter((k) => matchesTerm(text, k));
  const scored = STANDARDS.map((s) => ({ s, matched: hits(s) }))
    .map((x) => ({ ...x, overlap: x.matched.length }))
    .sort((a, b) => b.overlap - a.overlap);
  const matched = scored.filter((x) => x.overlap > 0);
  const chosen = (matched.length ? matched : scored.slice(0, 3)).slice(0, 4);
  const tiers = ["Primary", "Allied", "Normative", "Test"];
  const recommendations = chosen.map((x, i) => ({
    id: x.s.id,
    tier: tiers[i] || "Optional",
    relevance: x.overlap > 0 ? Math.min(89, 48 + x.overlap * 14) : 42,
    reasons: x.overlap > 0
      ? [`Keyword overlap detected: ${x.matched.join(", ")}`, "Category inferred from free-text query", "Generic matching mode — limited semantic context available"]
      : ["No strong keyword match found in the demo dataset", "Shown as a broad candidate — recommend manual expert review"],
  }));
  const avg = Math.round(recommendations.reduce((a, r) => a + r.relevance, 0) / Math.max(recommendations.length, 1));
  return {
    product: "Auto-detected procurement item",
    extracted: { "Product": "Not confidently classified", "Domain": "General", "Note": "Limited structured extraction — refine the query for stronger matching" },
    recommendations,
    missing: ["Testing requirement not clearly specified", "Certification requirement not specified", "Safety-compliance requirement not specified"],
    compliance: { overall: Math.max(30, avg - 15), coverage: avg, versionValidity: 70, normativeRefs: 45, safetyCoverage: 50, certCoverage: 40, technicalCompleteness: 55, risk: avg > 70 ? "Medium" : "High" },
    certification: { category: "General", status: "Not Identified", scheme: "—", reason: "Insufficient structured information to determine a certification scheme in this demo mode.", action: "Refine the query or route to expert review." },
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
    timestamp: new Date().toLocaleString("en-IN"),
  };
}
