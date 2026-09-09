/**
 * Renders every page of the app in Node via Vite's SSR pipeline, with and without
 * an analysis loaded. Catches runtime errors (bad references, null dereferences,
 * missing guards) that a production build cannot.
 * Run with: npm run smoke
 */
import { createServer } from "vite";
import { renderToString } from "react-dom/server";
import React from "react";

const PAGES = [
  "dashboard", "analyzer", "tender", "search", "recommendations",
  "allied", "graph", "version", "certification", "compliance", "specification",
  "expert", "adminDb",
];

const vite = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error",
});

let pass = 0;
let fail = 0;
const ok = (msg) => { pass += 1; console.log(`PASS  ${msg}`); };
const bad = (msg) => { fail += 1; console.log(`FAIL  ${msg}`); };

const render = (label, props) => {
  try {
    const html = renderToString(React.createElement(App, props));
    if (!html || html.length < 100) throw new Error(`suspiciously small output (${html.length} bytes)`);
    ok(`${label} (${html.length} bytes)`);
    return html;
  } catch (err) {
    bad(`${label}: ${err.message}`);
    return "";
  }
};

let App;
let matching;
let catalog;

try {
  ({ default: App } = await vite.ssrLoadModule("/src/App.jsx"));
  matching = await vite.ssrLoadModule("/shared/matching.js");
  ({ default: catalog } = await vite.ssrLoadModule("/shared/standards.json"));

  console.log(`Catalog: ${catalog.length} standards\n`);

  // --- 1. Matching engine against the real catalog -------------------------
  const queries = {
    led: "200 solar-powered LED street lights for rural roads, weather resistant",
    tank: "500 stainless steel water storage tanks for potable water",
    firedoor: "Mujhe school ke liye fire resistant doors purchase karne hain",
    pump: "20 industrial centrifugal water pumps for municipal supply",
    generic: "50 office chairs and desks",
  };
  const results = {};
  for (const [expected, q] of Object.entries(queries)) {
    const r = matching.runAnalysis(q, catalog);
    results[expected] = r;
    const unresolved = r.recommendations.filter((rec) => !catalog.some((s) => s.id === rec.id));
    if (r.scenarioKey !== expected) bad(`scenario ${expected}: detected "${r.scenarioKey}"`);
    else if (r.recommendations.length === 0) bad(`scenario ${expected}: no recommendations`);
    else if (unresolved.length) bad(`scenario ${expected}: ${unresolved.length} unresolvable ids`);
    else if (typeof r.compliance?.overall !== "number") bad(`scenario ${expected}: no compliance score`);
    else ok(`scenario ${expected}: ${r.recommendations.length} recs, score ${r.compliance.overall}, risk ${r.compliance.risk}`);
  }

  // --- 1b. False positives from real tender boilerplate --------------------
  // "sealed", "detailed", "scheduled", "filled" all contain the substring "led";
  // "chain" contains "hain". These must NOT be classified as product scenarios.
  const traps = [
    ["sealed cover", "Bids must be submitted in a sealed cover as scheduled."],
    ["detailed drawings", "Refer to the detailed drawings enclosed herewith."],
    ["chain link fencing", "Supply of chain link fencing for the compound wall."],
    ["MS lockers tender", "Name of Work: Supply and installation of M S Lockers in a school. Sealed tenders are invited. The detailed scope is as scheduled. Work shall be completed within 45 days."],
  ];
  for (const [label, text] of traps) {
    const key = matching.detectScenario(text);
    if (key === "generic") ok(`no false positive: ${label}`);
    else bad(`false positive: ${label} classified as "${key}"`);
  }
  if (matching.detectLanguage("chain link fencing supply") === "English") ok("no false Hinglish from \"chain\"");
  else bad("\"chain\" wrongly detected as Hinglish");
  if (matching.extractQuantity("Work shall be completed within 45 days.") === null) ok("\"45 days\" is not read as a quantity");
  else bad("\"45 days\" wrongly read as a quantity");
  if (matching.extractQuantity("Procure 500 stainless steel water storage tanks of 5000 litre capacity") === "500") ok("order count preferred over capacity spec");
  else bad(`quantity picked capacity instead of count: ${matching.extractQuantity("Procure 500 stainless steel water storage tanks of 5000 litre capacity")}`);

  // Hindi / Hinglish detection must survive the shared-module move.
  const hindi = matching.runAnalysis("हमें सोलर स्ट्रीट लाइट खरीदनी है", catalog);
  if (hindi.language === "Hindi" && hindi.scenarioKey === "led") ok("Devanagari query detected as Hindi/led");
  else bad(`Devanagari query: language=${hindi.language} scenario=${hindi.scenarioKey}`);
  if (results.firedoor.language === "Hinglish") ok("Hinglish query detected");
  else bad(`Hinglish query: language=${results.firedoor.language}`);

  console.log("");

  // --- 2. Every page with no analysis (empty states) -----------------------
  for (const name of PAGES) {
    render(`empty  ${name}`, { initialPage: { name }, initialRole: "admin" });
  }

  console.log("");

  // --- 3. Every page with a real analysis loaded ---------------------------
  const session = {
    analysisId: 1,
    analysis: results.led,
    decisions: { SL06: "accepted", SL02: "rejected", SL04: "expert_review", SL01: "not_applicable" },
    auditLog: [{ time: "10:00:00", action: "Analysis run", standardId: null },
      { time: "10:00:05", action: "accepted", standardId: "SL06" }],
  };
  for (const name of PAGES) {
    render(`loaded ${name}`, { initialPage: { name }, initialSession: session, initialRole: "admin" });
  }

  // --- 3b. Every page in Hindi ---------------------------------------------
  // A missing translation key renders as nothing rather than as English, so it
  // is invisible unless something actually looks at the Hindi output.
  let hindiFails = 0;
  for (const name of PAGES) {
    try {
      const html = renderToString(React.createElement(App, {
        initialPage: { name }, initialSession: session, initialRole: "admin", initialLang: "hi",
      }));
      if (!/[ऀ-ॿ]/.test(html)) throw new Error("no Devanagari in the output");
      if (html.includes("undefined")) throw new Error("an unresolved translation key rendered as 'undefined'");
    } catch (err) {
      hindiFails += 1;
      bad(`hindi ${name}: ${err.message}`);
    }
  }
  if (hindiFails === 0) ok(`all ${PAGES.length} pages render in Hindi with no unresolved keys`);

  // --- 4. Standard detail for every standard ------------------------------
  let detailFails = 0;
  for (const s of catalog) {
    try {
      const html = renderToString(React.createElement(App, {
        initialPage: { name: "standardDetail", id: s.id },
        initialSession: session,
      }));
      if (!html.includes(s.number)) throw new Error("number missing from output");
    } catch (err) {
      detailFails += 1;
      bad(`standardDetail ${s.id}: ${err.message}`);
    }
  }
  if (detailFails === 0) ok(`standardDetail renders for all ${catalog.length} standards`);

  // --- 5. Resilience: analysis referencing a standard that no longer exists -
  const stale = { ...results.led, recommendations: [...results.led.recommendations, { id: "GONE99", tier: "Primary", relevance: 50, reasons: ["stale row"] }] };
  render("stale reference does not crash recommendations", {
    initialPage: { name: "recommendations" },
    initialSession: { ...session, analysis: stale },
  });
  render("stale reference does not crash version page", {
    initialPage: { name: "version" },
    initialSession: { ...session, analysis: stale },
  });
  render("unknown standardDetail id shows empty state", {
    initialPage: { name: "standardDetail", id: "NOPE" },
  });
} catch (err) {
  fail += 1;
  console.error("FATAL", err);
} finally {
  await vite.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
