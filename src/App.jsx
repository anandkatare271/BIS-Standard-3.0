import React, { useState, useMemo, useEffect } from "react";
import {
  analyzeText, extractUpload, fetchAnalyses, fetchAnalysis, fetchSession,
  fetchStandards, saveDecision, updateStandard,
} from "./api";
import seedStandards from "../shared/standards.json";
import { detectLanguage, runAnalysis as runAnalysisEngine } from "../shared/matching.js";
import {
  LayoutDashboard, Search, FileUp, ListChecks, GitBranch, Share2, History,
  ShieldCheck, Gauge, FileOutput, UserCheck, Database, Globe, ChevronRight,
  CheckCircle2, XCircle, AlertTriangle, ArrowLeft, Sparkles, FileText,
  Info, Download, Copy, Filter, Building2, Layers, Activity
} from "lucide-react";
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  ResponsiveContainer, Tooltip
} from "recharts";

/* =========================================================================
   DATA — Sample Indian Standards dataset (MOCK / DEMO ONLY)
   ========================================================================= */

/** Catalog ships with the app as an offline fallback; the API replaces it at startup. */
let STANDARDS = seedStandards;

function applyStandards(list) {
  if (Array.isArray(list) && list.length) STANDARDS = list;
}

const findStandard = (id) => STANDARDS.find((s) => s.id === id);

/**
 * A saved analysis can outlive the catalog row it referenced (renamed id, edited
 * database). Returning a placeholder keeps the page rendering instead of throwing
 * on `byId(id).status` deep inside a list.
 */
const PLACEHOLDER = (id) => ({
  id,
  number: id,
  title: "Standard no longer in the catalog",
  category: "Unknown",
  domain: "Unknown",
  year: null,
  status: "Withdrawn",
  latestVersion: "Not on record",
  amendments: [],
  scope: "This standard was referenced by a saved analysis but is not present in the current catalog.",
  keywords: [],
  relations: {},
  certification: { status: "Not Identified", scheme: "—", reason: "Standard not found in the catalog.", action: "Re-run the analysis." },
});

const byId = (id) => findStandard(id) || PLACEHOLDER(id);

/** Offline fallback: same engine the API runs, against whatever catalog is loaded. */
const runAnalysis = (text) => runAnalysisEngine(text, STANDARDS);


/* =========================================================================
   I18N
   ========================================================================= */

const STR = {
  en: {
    tagline: "Describe What You Procure. AI Finds What Standards Apply.",
    nav: { dashboard: "Dashboard", analyzer: "Specification Analyzer", tender: "Tender Upload & Analyzer", search: "Search Standards", recommendations: "Recommended Standards", allied: "Allied & Normative", graph: "Knowledge Graph", version: "Version & Amendment", certification: "Certification Checker", compliance: "Compliance & Risk Score", specification: "Generate Specification", expert: "Expert Review", adminDb: "Standards Database" },
    analyze: "Analyze", loadExample: "Try an example", viewRecs: "View recommended standards",
    back: "Back",
  },
  hi: {
    tagline: "आप जो खरीदना चाहते हैं उसका वर्णन करें। AI बताएगा कौन-से मानक लागू होते हैं।",
    nav: { dashboard: "डैशबोर्ड", analyzer: "विनिर्देश विश्लेषक", tender: "निविदा अपलोड व विश्लेषण", search: "मानक खोजें", recommendations: "अनुशंसित मानक", allied: "संबद्ध व मानक-संदर्भ", graph: "ज्ञान ग्राफ", version: "संस्करण व संशोधन", certification: "प्रमाणन जाँच", compliance: "अनुपालन व जोखिम स्कोर", specification: "विनिर्देश तैयार करें", expert: "विशेषज्ञ समीक्षा", adminDb: "मानक डेटाबेस" },
    analyze: "विश्लेषण करें", loadExample: "उदाहरण आज़माएँ", viewRecs: "अनुशंसित मानक देखें",
    back: "वापस",
  },
};

/* =========================================================================
   SMALL UI PRIMITIVES
   ========================================================================= */

const STATUS_STYLE = {
  Current: "bg-emerald-50 text-emerald-700 border-emerald-300",
  Superseded: "bg-amber-50 text-amber-700 border-amber-300",
  "Under Revision": "bg-sky-50 text-sky-700 border-sky-300",
  Withdrawn: "bg-rose-50 text-rose-700 border-rose-300",
};

const RISK_STYLE = {
  Low: { text: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-300", bar: "bg-emerald-500" },
  Medium: { text: "text-amber-700", bg: "bg-amber-50", border: "border-amber-300", bar: "bg-amber-500" },
  High: { text: "text-orange-700", bg: "bg-orange-50", border: "border-orange-300", bar: "bg-orange-500" },
  Critical: { text: "text-rose-700", bg: "bg-rose-50", border: "border-rose-300", bar: "bg-rose-500" },
};

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${STATUS_STYLE[status] || "bg-slate-50 text-slate-600 border-slate-300"}`}>
      {status}
    </span>
  );
}

function TierBadge({ tier }) {
  const map = {
    Primary: "bg-slate-900 text-white",
    Allied: "bg-amber-600 text-white",
    Normative: "bg-sky-700 text-white",
    Test: "bg-teal-700 text-white",
    Installation: "bg-indigo-700 text-white",
    Optional: "bg-slate-400 text-white",
  };
  return <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold tracking-wide ${map[tier] || "bg-slate-400 text-white"}`}>{tier.toUpperCase()}</span>;
}

/**
 * Which engine produced the current analysis. Worth showing plainly: when the
 * AI path is unavailable the app keeps working, and saying so is more honest
 * than letting a rule-based answer look like an AI one.
 */
const MODE_STYLE = {
  ai: { label: "AI-assisted", cls: "bg-emerald-50 text-emerald-800 border-emerald-300", title: "Claude extracted the requirement facets and wrote the reasoning. Standards were selected by the matching engine." },
  "rule-based": { label: "Rule-based", cls: "bg-sky-50 text-sky-800 border-sky-300", title: "The AI path was unavailable or disabled. The deterministic matching engine produced this result." },
  offline: { label: "Offline", cls: "bg-amber-50 text-amber-800 border-amber-300", title: "The API could not be reached. Analysis ran locally in the browser against the bundled catalog." },
};

function ModeBadge({ mode, cached }) {
  const style = MODE_STYLE[mode];
  if (!style) return null;
  return (
    <span title={style.title} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-medium ${style.cls}`}>
      <Sparkles size={11} /> {style.label}{cached ? " (cached)" : ""}
    </span>
  );
}

/** Non-blocking notice for the failures that used to be invisible. */
function Toast({ toast, onDismiss }) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(onDismiss, 6000);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return null;
  const warn = toast.kind === "warn";
  return (
    <div role="status" aria-live="polite" className="fixed bottom-5 right-5 z-50 max-w-sm">
      <div className={`flex items-start gap-2 px-4 py-3 rounded shadow-lg border text-sm ${warn ? "bg-amber-50 border-amber-300 text-amber-900" : "bg-rose-50 border-rose-300 text-rose-900"}`}>
        <AlertTriangle size={16} className="shrink-0 mt-0.5" />
        <span className="flex-1">{toast.message}</span>
        <button onClick={onDismiss} aria-label="Dismiss" className="text-slate-400 hover:text-slate-700 leading-none">&times;</button>
      </div>
    </div>
  );
}

/** Staged progress. A ten-second await with no feedback reads as a hung app. */
function BusyOverlay({ stage }) {
  if (!stage) return null;
  return (
    <div className="fixed inset-0 z-40 bg-slate-900/20 backdrop-blur-[1px] flex items-start justify-center pt-32">
      <div className="bg-white border border-slate-300 rounded shadow-xl px-6 py-5 max-w-sm w-full">
        <div className="flex items-center gap-3 mb-3">
          <span className="inline-block w-4 h-4 border-2 border-slate-300 border-t-slate-900 rounded-full animate-spin" />
          <span className="font-serif font-semibold text-sm">Analyzing</span>
        </div>
        <p className="text-sm text-slate-600">{stage}</p>
      </div>
    </div>
  );
}

function RelevanceBar({ value }) {
  const color = value >= 90 ? "bg-emerald-600" : value >= 75 ? "bg-sky-600" : value >= 50 ? "bg-amber-500" : "bg-rose-500";
  const label = value >= 90 ? "Highly Applicable" : value >= 75 ? "Strongly Applicable" : value >= 50 ? "Potentially Applicable" : "Requires Expert Review";
  return (
    <div className="w-full">
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="font-mono font-semibold text-slate-700">{value}%</span>
        <span className="text-slate-500">{label}</span>
      </div>
      <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function ScoreRing({ value, size = 140 }) {
  const r = (size - 16) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (value / 100) * c;
  const color = value >= 80 ? "#059669" : value >= 60 ? "#d97706" : "#e11d48";
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="#e2e8f0" strokeWidth="12" fill="none" />
      <circle
        cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth="12" fill="none"
        strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="47%" textAnchor="middle" className="fill-slate-900" style={{ fontSize: size * 0.24, fontWeight: 700 }}>{value}</text>
      <text x="50%" y="64%" textAnchor="middle" className="fill-slate-500" style={{ fontSize: size * 0.09 }}>/ 100</text>
    </svg>
  );
}

function Panel({ title, icon: Icon, right, children, className = "" }) {
  return (
    <div className={`bg-white border border-slate-200 rounded-md ${className}`}>
      {title && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <div className="flex items-center gap-2 text-slate-800 font-serif text-[15px] font-semibold">
            {Icon && <Icon size={16} className="text-amber-600" />}
            {title}
          </div>
          {right}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

function EmptyState({ text, cta, onCta }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 border border-dashed border-slate-300 rounded-md bg-slate-50">
      <Sparkles className="text-amber-500 mb-3" size={28} />
      <p className="text-slate-600 max-w-md mb-4">{text}</p>
      {cta && <button onClick={onCta} className="px-4 py-2 bg-slate-900 text-white rounded text-sm font-medium hover:bg-slate-800">{cta}</button>}
    </div>
  );
}

/* =========================================================================
   MAIN APP
   ========================================================================= */

const EXAMPLES = [
  "We need to procure 200 solar-powered LED street lights for rural roads, weather resistant with electrical safety.",
  "Procure 500 stainless steel water storage tanks of 5000 litre capacity suitable for potable water for a government hospital.",
  "Mujhe school ke liye fire resistant doors purchase karne hain.",
  "Supply of 20 industrial centrifugal water pumps for municipal water supply station.",
];

/**
 * `initialPage` / `initialSession` let a caller open the app on a specific page or
 * pre-load a saved session (used for deep links and by the smoke-render check).
 */
export default function App({ initialPage = { name: "dashboard" }, initialSession = null, initialRole = "officer" }) {
  const [lang, setLang] = useState("en");
  const [role, setRole] = useState(initialRole);
  const [page, setPage] = useState(initialPage);
  const [queryText, setQueryText] = useState("");
  const [analysis, setAnalysis] = useState(initialSession?.analysis ?? null);
  const [analysisId, setAnalysisId] = useState(initialSession?.analysisId ?? null);
  const [decisions, setDecisions] = useState(initialSession?.decisions ?? {});
  const [auditLog, setAuditLog] = useState(initialSession?.auditLog ?? []);
  const [tenderText, setTenderText] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [graphFocusId, setGraphFocusId] = useState(() => {
    const recs = initialSession?.analysis?.recommendations || [];
    return recs.find((r) => r.tier === "Primary")?.id || recs[0]?.id || null;
  });
  const [busy, setBusy] = useState(null);
  const [toast, setToast] = useState(null);
  const [dbReady, setDbReady] = useState(false);
  const [catalogTick, setCatalogTick] = useState(0);
  const [history, setHistory] = useState([]);

  const t = STR[lang];
  const go = (name, params = {}) => setPage({ name, ...params });

  /** Surfaces the failures that used to be swallowed by empty catch blocks. */
  const notify = (message, kind = "error") => setToast({ message, kind, id: Date.now() });

  const refreshHistory = () => {
    fetchAnalyses().then(setHistory).catch(() => {});
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchStandards();
        if (!cancelled && rows?.length) {
          applyStandards(rows);
          setDbReady(true);
          setCatalogTick((n) => n + 1);
        }
      } catch {
        if (!cancelled) setDbReady(false);
      }
      try {
        const session = await fetchSession();
        if (!cancelled && session?.analysis) loadSession(session);
      } catch { /* first run has no session */ }
      try {
        const rows = await fetchAnalyses();
        if (!cancelled) setHistory(rows);
      } catch { /* history is optional */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const loadSession = (session) => {
    setAnalysis(session.analysis);
    setAnalysisId(session.analysisId);
    setDecisions(session.decisions || {});
    setAuditLog(session.auditLog || []);
    const recs = session.analysis.recommendations || [];
    setGraphFocusId(recs.find((r) => r.tier === "Primary")?.id || recs[0]?.id || null);
  };

  const openAnalysis = async (id) => {
    try {
      loadSession(await fetchAnalysis(id));
      go("recommendations");
    } catch {
      notify(`Could not reopen analysis #${id} — it may have been removed from the database.`);
    }
  };

  const logAction = (action, standardId, time) => {
    setAuditLog((prev) => [{ time: time || new Date().toLocaleTimeString("en-IN"), action, standardId }, ...prev].slice(0, 30));
  };

  const setDecision = (id, decision) => {
    setDecisions((prev) => ({ ...prev, [id]: decision }));
    logAction(decision, id);
    if (analysisId) {
      // A silent failure here is the worst kind: the officer sees the decision
      // recorded on screen while nothing is being persisted for the audit trail.
      saveDecision(analysisId, id, decision).catch(() =>
        notify(`Decision on ${id} was not saved to the audit trail — the API rejected it.`),
      );
    } else {
      notify("This analysis is not saved on the server, so decisions will not persist.", "warn");
    }
  };

  /**
   * The AI-assisted path takes about ten seconds on a fresh query, so the
   * button cannot simply await in silence — that reads as a frozen app. The
   * stage labels track what the server is actually doing.
   */
  const ANALYSIS_STAGES = [
    { at: 0, label: "Reading the requirement…" },
    { at: 1200, label: "Extracting product, material and quantity…" },
    { at: 4000, label: `Matching against ${STANDARDS.length} standards…` },
    { at: 6000, label: "Writing the reasoning for each standard…" },
    { at: 11000, label: "Still working — finishing up…" },
  ];

  const handleAnalyze = async (text) => {
    if (!text || !text.trim() || busy) return;

    setBusy(ANALYSIS_STAGES[0].label);
    const timers = ANALYSIS_STAGES.slice(1).map((s) =>
      setTimeout(() => setBusy(s.label), s.at),
    );

    try {
      applyResult(await analyzeText(text));
    } catch (err) {
      // The engine is bundled with the UI, so an unreachable API is a
      // degraded mode rather than a failure — but the user should know.
      notify("Could not reach the API. Analyzed locally with the rule-based engine.", "warn");
      applyResult({ ...runAnalysis(text), mode: "offline" });
    } finally {
      timers.forEach(clearTimeout);
      setBusy(null);
    }
  };

  const applyResult = (result) => {
    // Drop anything the loaded catalog can no longer resolve so pages never render a gap.
    const recommendations = (result.recommendations || []).filter((r) => findStandard(r.id));
    setAnalysis({ ...result, recommendations });
    setAnalysisId(result.analysisId || null);
    setDecisions({});
    setGraphFocusId(recommendations.find((r) => r.tier === "Primary")?.id || recommendations[0]?.id || null);
    refreshHistory();
    logAction("Analysis run", null);
  };

  const decisionCounts = useMemo(() => {
    const vals = Object.values(decisions);
    return {
      accepted: vals.filter((v) => v === "accepted").length,
      rejected: vals.filter((v) => v === "rejected").length,
      review: vals.filter((v) => v === "expert_review").length,
      notApplicable: vals.filter((v) => v === "not_applicable").length,
    };
  }, [decisions]);

  const outdatedCount = analysis ? analysis.recommendations.filter((r) => {
    const s = byId(r.id);
    return s && (s.status === "Superseded" || s.status === "Withdrawn");
  }).length : 0;

  const NAV = [
    { key: "dashboard", label: t.nav.dashboard, icon: LayoutDashboard },
    { key: "analyzer", label: t.nav.analyzer, icon: Search },
    { key: "tender", label: t.nav.tender, icon: FileUp },
    { key: "search", label: t.nav.search, icon: Filter },
    { key: "recommendations", label: t.nav.recommendations, icon: ListChecks },
    { key: "allied", label: t.nav.allied, icon: GitBranch },
    { key: "graph", label: t.nav.graph, icon: Share2 },
    { key: "version", label: t.nav.version, icon: History },
    { key: "certification", label: t.nav.certification, icon: ShieldCheck },
    { key: "compliance", label: t.nav.compliance, icon: Gauge },
    { key: "specification", label: t.nav.specification, icon: FileOutput },
  ];
  if (role === "expert" || role === "admin") NAV.push({ key: "expert", label: t.nav.expert, icon: UserCheck });
  if (role === "admin") NAV.push({ key: "adminDb", label: t.nav.adminDb, icon: Database });

  return (
    <div className="min-h-screen flex bg-slate-100 text-slate-900 font-sans text-[14px]">
      {/* SIDEBAR */}
      <aside className="w-64 shrink-0 bg-slate-900 text-slate-200 flex flex-col">
        <div className="px-5 py-5 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-amber-500 flex items-center justify-center font-serif font-bold text-slate-900">IS</div>
            <div>
              <div className="font-serif font-semibold text-white leading-tight">IS-Match AI</div>
              <div className="text-[10px] text-slate-400 tracking-wide">Standards Recommendation Engine</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-3">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = page.name === item.key;
            return (
              <button
                key={item.key}
                onClick={() => go(item.key)}
                className={`w-full flex items-center gap-3 px-5 py-2.5 text-left text-[13px] border-l-4 transition-colors ${
                  active ? "border-amber-500 bg-slate-800 text-white font-medium" : "border-transparent text-slate-300 hover:bg-slate-800/60"
                }`}
              >
                <Icon size={16} className={active ? "text-amber-400" : "text-slate-400"} />
                <span className="leading-tight">{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="px-5 py-4 border-t border-slate-800 text-[11px] text-slate-400">
          <div className="mb-2">Viewing as</div>
          <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full bg-slate-800 text-slate-100 rounded px-2 py-1.5 text-xs border border-slate-700">
            <option value="officer">Procurement Officer</option>
            <option value="expert">Technical Expert</option>
            <option value="admin">Administrator</option>
          </select>
          <div className="mt-3 text-slate-500">Prototype build · SIH 2026</div>
        </div>
      </aside>

      {/* MAIN */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* TOP BAR */}
        <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <button onClick={() => go("dashboard")} className="hover:text-slate-800">Home</button>
            <ChevronRight size={12} />
            <span className="text-slate-800 font-medium">{NAV.find((n) => n.key === page.name)?.label || "Standard Detail"}</span>
          </div>
          <div className="flex items-center gap-4">
            {analysis?.mode && <ModeBadge mode={analysis.mode} cached={analysis.cached} />}
            <div className="hidden lg:flex items-center gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded">
              <Info size={12} />
              {dbReady ? "Live SQLite catalog" : "Local demo catalog"} — illustrative sample data, not verified against live BIS records
            </div>
            <button
              onClick={() => setLang(lang === "en" ? "hi" : "en")}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-700 border border-slate-300 rounded px-2.5 py-1.5 hover:bg-slate-50"
            >
              <Globe size={14} /> {lang === "en" ? "हिंदी" : "English"}
            </button>
          </div>
        </header>

        {/* CONTENT */}
        <main className="flex-1 overflow-y-auto p-6">
          {page.name === "dashboard" && (
            <DashboardPage t={t} lang={lang} analysis={analysis} go={go} outdatedCount={outdatedCount} auditLog={auditLog} history={history} onOpenAnalysis={openAnalysis} dbReady={dbReady} />
          )}
          {page.name === "analyzer" && (
            <AnalyzerPage t={t} queryText={queryText} setQueryText={setQueryText} onAnalyze={handleAnalyze} analysis={analysis} go={go} busy={busy} />
          )}
          {page.name === "tender" && (
            <TenderPage tenderText={tenderText} setTenderText={setTenderText} onAnalyze={handleAnalyze} analysis={analysis} go={go} busy={busy} onError={notify} />
          )}
          {page.name === "search" && (
            <SearchPage searchTerm={searchTerm} setSearchTerm={setSearchTerm} go={go} catalogTick={catalogTick} />
          )}
          {page.name === "recommendations" && (
            <RecommendationsPage analysis={analysis} decisions={decisions} setDecision={setDecision} go={go} />
          )}
          {page.name === "standardDetail" && (
            <StandardDetailPage id={page.id} go={go} decisions={decisions} setDecision={setDecision} />
          )}
          {page.name === "allied" && <AlliedPage analysis={analysis} go={go} />}
          {page.name === "graph" && (
            <GraphPage analysis={analysis} go={go} focusId={graphFocusId} setFocusId={setGraphFocusId} />
          )}
          {page.name === "version" && <VersionPage analysis={analysis} />}
          {page.name === "certification" && <CertificationPage analysis={analysis} />}
          {page.name === "compliance" && <CompliancePage analysis={analysis} go={go} />}
          {page.name === "specification" && <SpecificationPage analysis={analysis} decisions={decisions} go={go} />}
          {page.name === "expert" && (
            <ExpertPage analysis={analysis} decisions={decisions} setDecision={setDecision} auditLog={auditLog} go={go} />
          )}
          {page.name === "adminDb" && (
            <AdminDbPage onCatalogChange={() => { setDbReady(true); setCatalogTick((n) => n + 1); }} onError={notify} />
          )}
        </main>
      </div>

      <BusyOverlay stage={busy} />
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

/* =========================================================================
   DASHBOARD
   ========================================================================= */

function DashboardPage({ t, lang, analysis, go, outdatedCount, auditLog, history = [], onOpenAnalysis, dbReady }) {
  const cards = [
    { label: "New Analysis", value: "Start", icon: Search, action: () => go("analyzer"), accent: "bg-amber-600" },
    { label: "Upload Tender", value: "Audit", icon: FileUp, action: () => go("tender"), accent: "bg-slate-800" },
    { label: "Search Standards", value: `${STANDARDS.length} in dataset`, icon: Filter, action: () => go("search"), accent: "bg-sky-700" },
    { label: "Saved Analyses", value: history.length ? `${history.length} in database` : (analysis ? "1 unsaved" : "None yet"), icon: Activity, action: () => go("recommendations"), accent: "bg-teal-700" },
    { label: "Compliance Score", value: analysis ? `${analysis.compliance.overall}/100` : "—", icon: Gauge, action: () => go("compliance"), accent: "bg-indigo-700" },
    { label: "Outdated References", value: analysis ? `${outdatedCount} found` : "—", icon: History, action: () => go("version"), accent: "bg-rose-700" },
    { label: "Missing Standards", value: analysis ? `${analysis.missing.length} flagged` : "—", icon: AlertTriangle, action: () => go("allied"), accent: "bg-orange-700" },
  ];

  return (
    <div className="max-w-6xl">
      <div className="mb-6 bg-slate-900 rounded-md p-8 text-white flex items-center justify-between gap-6 overflow-hidden relative">
        <div className="relative z-10 max-w-xl">
          <div className="text-amber-400 text-xs font-semibold tracking-wide mb-2">AI-POWERED PROCUREMENT DECISION SUPPORT</div>
          <h1 className="font-serif text-2xl md:text-3xl font-semibold leading-snug mb-3">{t.tagline}</h1>
          <p className="text-slate-300 text-sm mb-4">Explainable, standards-aware recommendations for government departments, PSUs and public institutions preparing tender specifications.</p>
          <button onClick={() => go("analyzer")} className="px-4 py-2 bg-amber-500 text-slate-900 font-semibold rounded text-sm hover:bg-amber-400">
            {t.viewRecs === "View recommended standards" ? "Start a new analysis →" : "नया विश्लेषण शुरू करें →"}
          </button>
        </div>
        <Layers size={140} className="text-slate-800 opacity-60 absolute -right-4 -bottom-6" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <button key={c.label} onClick={c.action} className="text-left bg-white border border-slate-200 rounded-md p-4 hover:border-amber-400 hover:shadow-sm transition-all">
              <div className={`w-8 h-8 rounded ${c.accent} flex items-center justify-center mb-3`}>
                <Icon size={16} className="text-white" />
              </div>
              <div className="text-xs text-slate-500 mb-0.5">{c.label}</div>
              <div className="font-serif font-semibold text-slate-900 text-[15px]">{c.value}</div>
            </button>
          );
        })}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Panel title="Current session" icon={Sparkles}>
          {analysis ? (
            <div className="space-y-2 text-sm">
              <div><span className="text-slate-500">Query:</span> <span className="italic">"{analysis.query}"</span></div>
              <div><span className="text-slate-500">Detected language:</span> {analysis.language}</div>
              <div><span className="text-slate-500">Detected product:</span> {analysis.product}</div>
              <div><span className="text-slate-500">Recommendations:</span> {analysis.recommendations.length} standards identified</div>
              <button onClick={() => go("recommendations")} className="mt-2 text-amber-700 text-sm font-medium hover:underline">View full recommendation set →</button>
            </div>
          ) : (
            <EmptyState text="No analysis has been run yet. Start by describing a product or specification to procure." cta="Open analyzer" onCta={() => go("analyzer")} />
          )}
        </Panel>
        <Panel title="Recent activity" icon={Activity}>
          {auditLog.length === 0 ? (
            <p className="text-slate-500 text-sm">No actions logged yet in this session.</p>
          ) : (
            <ul className="space-y-1.5 text-sm max-h-52 overflow-y-auto">
              {auditLog.slice(0, 8).map((a, i) => (
                <li key={i} className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                  <span className="text-slate-700">{a.action.replace("_", " ")} {a.standardId ? `— ${byId(a.standardId)?.number}` : ""}</span>
                  <span className="text-slate-400 text-xs font-mono">{a.time}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel
          title="Saved analyses"
          icon={Database}
          className="md:col-span-2"
          right={<span className="text-[11px] text-slate-400">{dbReady ? "from SQLite" : "API offline"}</span>}
        >
          {history.length === 0 ? (
            <p className="text-slate-500 text-sm">
              {dbReady
                ? "No analyses saved yet. Every analysis you run is persisted here."
                : "Start the API server (npm run dev) to persist and reload analyses."}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400 border-b border-slate-200">
                  <th className="pb-2">Product</th><th className="pb-2">Query</th><th className="pb-2">Language</th><th className="pb-2">Decisions</th><th className="pb-2">Saved</th><th className="pb-2 sr-only">Action</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.analysisId} className="border-b border-slate-100">
                    <td className="py-2 font-medium">{h.product}</td>
                    <td className="py-2 text-slate-500 max-w-xs truncate" title={h.query}>{h.query}</td>
                    <td className="py-2">{h.language}</td>
                    <td className="py-2 font-mono">{h.decisionCount}</td>
                    <td className="py-2 text-xs text-slate-400">{new Date(h.createdAt).toLocaleString("en-IN")}</td>
                    <td className="py-2 text-right">
                      <button onClick={() => onOpenAnalysis?.(h.analysisId)} className="text-xs text-amber-700 hover:underline">Reopen</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    </div>
  );
}

/* =========================================================================
   ANALYZER
   ========================================================================= */

function AnalyzerPage({ t, queryText, setQueryText, onAnalyze, analysis, go, busy }) {
  return (
    <div className="max-w-4xl">
      <h1 className="font-serif text-xl font-semibold mb-1">Specification Analyzer</h1>
      <p className="text-slate-500 text-sm mb-5">Describe what you need to procure in plain language — English, Hindi, or Hinglish.</p>

      <Panel>
        <textarea
          value={queryText}
          onChange={(e) => setQueryText(e.target.value)}
          rows={4}
          placeholder="e.g. We need to procure 200 solar-powered LED street lights for rural roads, weather resistant with electrical safety."
          className="w-full border border-slate-300 rounded p-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
        <div className="flex flex-wrap gap-2 mt-3">
          {EXAMPLES.map((ex, i) => (
            <button key={i} onClick={() => setQueryText(ex)} className="text-xs px-2.5 py-1 border border-slate-300 rounded-full text-slate-600 hover:border-amber-400 hover:text-amber-700">
              {t.loadExample} {i + 1}
            </button>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={() => onAnalyze(queryText)}
            disabled={Boolean(busy) || !queryText.trim()}
            className="px-5 py-2 bg-slate-900 text-white rounded text-sm font-medium hover:bg-slate-800 disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {busy
              ? <span className="inline-block w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              : <Sparkles size={15} />}
            {busy ? "Analyzing…" : t.analyze}
          </button>
          {queryText.trim() && <span className="text-xs text-slate-500">Detected language: {detectLanguage(queryText)}</span>}
        </div>
      </Panel>

      {analysis && (
        <div className="mt-6 space-y-4">
          <Panel title="Extracted requirements" icon={ListChecks}>
            <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
              {Object.entries(analysis.extracted).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">{k}</dt>
                  <dd className="text-sm text-slate-800 font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          </Panel>
          <div className="flex justify-end">
            <button onClick={() => go("recommendations")} className="px-4 py-2 bg-amber-600 text-white rounded text-sm font-medium hover:bg-amber-500 flex items-center gap-1.5">
              {t.viewRecs} <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   TENDER UPLOAD & ANALYZER
   ========================================================================= */

function TenderPage({ tenderText, setTenderText, onAnalyze, analysis, go, busy, onError }) {
  const [extracting, setExtracting] = useState(null);
  const sample = "Draft tender clause: Supply and installation of solar powered LED street lights across rural road network. Fixtures shall be weather resistant and energy efficient. Reference: IS 16106:2013.";
  return (
    <div className="max-w-4xl">
      <h1 className="font-serif text-xl font-semibold mb-1">Tender Upload & Analyzer</h1>
      <p className="text-slate-500 text-sm mb-5">Paste tender specification text below to audit it for missing, outdated or conflicting standards references.</p>

      <Panel>
        <textarea
          value={tenderText}
          onChange={(e) => setTenderText(e.target.value)}
          rows={5}
          placeholder="Paste tender / specification text here (PDF & DOCX upload simulated in this prototype via pasted text)…"
          className="w-full border border-slate-300 rounded p-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
        <div className="flex items-center gap-3 mt-3">
          <button onClick={() => setTenderText(sample)} className="text-xs px-2.5 py-1 border border-slate-300 rounded-full text-slate-600 hover:border-amber-400 hover:text-amber-700">
            Load sample tender clause
          </button>
          <label className="text-xs px-2.5 py-1 border border-dashed border-slate-300 rounded-full text-slate-600 cursor-pointer hover:border-amber-400">
            Upload PDF/DOCX/TXT
            <input
              type="file"
              accept=".pdf,.docx,.txt,application/pdf"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                setExtracting(file.name);
                try {
                  const { text } = await extractUpload(file);
                  if (!text?.trim()) {
                    onError?.(`No text could be extracted from ${file.name}. A scanned PDF needs OCR, which this prototype does not do.`, "warn");
                  }
                  setTenderText(text || "");
                } catch (err) {
                  // Previously this wrote the error into the textarea, which then
                  // got analyzed as if it were tender text.
                  onError?.(`Could not read ${file.name}: ${err.message}`);
                } finally {
                  setExtracting(null);
                }
              }}
            />
          </label>
          {extracting && <span className="text-xs text-slate-500">Extracting text from {extracting}…</span>}
        </div>
        <button
          onClick={() => onAnalyze(tenderText)}
          disabled={Boolean(busy) || !tenderText.trim()}
          className="mt-4 px-5 py-2 bg-slate-900 text-white rounded text-sm font-medium hover:bg-slate-800 disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {busy
            ? <span className="inline-block w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            : <FileUp size={15} />}
          {busy ? "Analyzing…" : "Analyze tender"}
        </button>
      </Panel>

      {analysis && (
        <div className="mt-6 grid md:grid-cols-2 gap-4">
          <Panel title="Missing standards" icon={AlertTriangle}>
            <ul className="space-y-2 text-sm">
              {analysis.missing.map((m, i) => (
                <li key={i} className="flex gap-2"><AlertTriangle size={14} className="text-orange-500 mt-0.5 shrink-0" />{m}</li>
              ))}
            </ul>
          </Panel>
          <Panel title="Outdated references" icon={History}>
            {analysis.recommendations.filter((r) => byId(r.id).status === "Superseded").length === 0 ? (
              <p className="text-sm text-emerald-700 flex items-center gap-2"><CheckCircle2 size={15} /> No outdated references detected among matched standards.</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {analysis.recommendations.filter((r) => byId(r.id).status === "Superseded").map((r) => {
                  const s = byId(r.id);
                  return (
                    <li key={s.id} className="border border-amber-200 bg-amber-50 rounded p-2.5">
                      <div className="font-mono text-xs text-amber-800">{s.number} — flagged as {s.status}</div>
                      <div className="text-slate-700">Latest available version: <span className="font-medium">{s.latestVersion}</span></div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
          <Panel title="Conflicts detected" icon={AlertTriangle} className="md:col-span-2">
            <p className="text-sm text-slate-600">No direct scope conflicts detected between matched standards in this demo pass. Standards with overlapping scope (e.g. luminaire safety vs. LED-specific performance) are shown together in <button onClick={() => go("allied")} className="text-amber-700 underline">Allied &amp; Normative Standards</button> for expert review.</p>
          </Panel>
          <div className="md:col-span-2 flex justify-end">
            <button onClick={() => go("compliance")} className="px-4 py-2 bg-amber-600 text-white rounded text-sm font-medium hover:bg-amber-500">View full compliance score →</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   SEARCH STANDARDS
   ========================================================================= */

function SearchPage({ searchTerm, setSearchTerm, go, catalogTick }) {
  const results = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return STANDARDS;
    return STANDARDS.filter((s) =>
      s.number.toLowerCase().includes(q) || s.title.toLowerCase().includes(q) || s.category.toLowerCase().includes(q) || s.keywords.some((k) => k.includes(q))
    );
  }, [searchTerm, catalogTick]);

  return (
    <div className="max-w-5xl">
      <h1 className="font-serif text-xl font-semibold mb-1">Search Standards</h1>
      <p className="text-slate-500 text-sm mb-4">Browse the full sample dataset by standard number, title, category or keyword.</p>
      <div className="relative mb-5">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search e.g. 'LED', 'fire door', 'water tank', 'IS 1520'…"
          className="w-full border border-slate-300 rounded pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        {results.map((s) => (
          <button key={s.id} onClick={() => go("standardDetail", { id: s.id })} className="text-left bg-white border border-slate-200 rounded-md p-4 hover:border-amber-400 hover:shadow-sm transition-all">
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <span className="font-mono text-sm font-semibold text-slate-800">{s.number}</span>
              <StatusBadge status={s.status} />
            </div>
            <div className="text-sm text-slate-700 mb-2">{s.title}</div>
            <div className="text-xs text-slate-400">{s.category} · {s.domain}</div>
          </button>
        ))}
        {results.length === 0 && <p className="text-slate-500 text-sm col-span-2">No standards matched your search.</p>}
      </div>
    </div>
  );
}

/* =========================================================================
   RECOMMENDATIONS
   ========================================================================= */

function RecommendationsPage({ analysis, decisions, setDecision, go }) {
  if (!analysis) return <EmptyState text="Run the Specification Analyzer first to generate AI-recommended standards." cta="Open analyzer" onCta={() => go("analyzer")} />;

  return (
    <div className="max-w-5xl">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h1 className="font-serif text-xl font-semibold">Recommendation Results</h1>
        <ModeBadge mode={analysis.mode} cached={analysis.cached} />
      </div>
      <p className="text-slate-500 text-sm mb-1">Product: <span className="font-medium text-slate-800">{analysis.product}</span></p>
      <p className="text-slate-400 text-xs mb-4">
        Analyzed {analysis.timestamp} · Query language: {analysis.language}
        {analysis.elapsedMs ? ` · ${(analysis.elapsedMs / 1000).toFixed(1)}s` : ""}
        {analysis.costUsd ? ` · $${analysis.costUsd.toFixed(4)}` : ""}
      </p>

      {analysis.aiSummary && (
        <div className="mb-5 bg-emerald-50/60 border border-emerald-200 rounded-md p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800 mb-1.5">
            <Sparkles size={13} /> AI summary
          </div>
          <p className="text-sm text-slate-700 leading-relaxed">{analysis.aiSummary}</p>
          <p className="text-[11px] text-emerald-800/70 mt-2">
            Standards below were selected by the matching engine, not by the model. The model explained the selection.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {analysis.recommendations.map((r) => {
          const s = byId(r.id);
          const decision = decisions[r.id];
          return (
            <div key={r.id} className="bg-white border border-slate-200 rounded-md p-4">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <TierBadge tier={r.tier} />
                    <StatusBadge status={s.status} />
                  </div>
                  <div className="font-mono font-semibold text-slate-900">{s.number}</div>
                  <div className="text-sm text-slate-700">{s.title}</div>
                </div>
                <div className="w-40"><RelevanceBar value={r.relevance} /></div>
              </div>

              <div className="bg-slate-50 rounded p-3 mb-3">
                <div className="text-xs font-semibold text-slate-500 mb-1.5">Why recommended?</div>
                <ul className="space-y-1">
                  {r.reasons.map((reason, i) => (
                    <li key={i} className="flex gap-2 text-sm text-slate-700"><CheckCircle2 size={14} className="text-emerald-600 mt-0.5 shrink-0" />{reason}</li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => go("standardDetail", { id: s.id })} className="text-xs px-3 py-1.5 border border-slate-300 rounded text-slate-700 hover:bg-slate-50">View details</button>
                <button onClick={() => setDecision(r.id, "accepted")} className={`text-xs px-3 py-1.5 rounded border flex items-center gap-1 ${decision === "accepted" ? "bg-emerald-600 text-white border-emerald-600" : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"}`}>
                  <CheckCircle2 size={13} /> Accept
                </button>
                <button onClick={() => setDecision(r.id, "rejected")} className={`text-xs px-3 py-1.5 rounded border flex items-center gap-1 ${decision === "rejected" ? "bg-rose-600 text-white border-rose-600" : "border-rose-300 text-rose-700 hover:bg-rose-50"}`}>
                  <XCircle size={13} /> Reject
                </button>
                <button onClick={() => setDecision(r.id, "not_applicable")} className={`text-xs px-3 py-1.5 rounded border ${decision === "not_applicable" ? "bg-slate-600 text-white border-slate-600" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}>
                  Mark not applicable
                </button>
                <button onClick={() => setDecision(r.id, "expert_review")} className={`text-xs px-3 py-1.5 rounded border ${decision === "expert_review" ? "bg-amber-600 text-white border-amber-600" : "border-amber-300 text-amber-700 hover:bg-amber-50"}`}>
                  Send to expert review
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button onClick={() => go("allied")} className="px-4 py-2 border border-slate-300 rounded text-sm hover:bg-white">View allied &amp; normative view →</button>
        <button onClick={() => go("graph")} className="px-4 py-2 border border-slate-300 rounded text-sm hover:bg-white">Open knowledge graph →</button>
        <button onClick={() => go("compliance")} className="px-4 py-2 bg-amber-600 text-white rounded text-sm hover:bg-amber-500">View compliance &amp; risk score →</button>
      </div>
    </div>
  );
}

/* =========================================================================
   STANDARD DETAIL
   ========================================================================= */

function StandardDetailPage({ id, go, decisions, setDecision }) {
  const s = findStandard(id);
  if (!s) return <EmptyState text="No standard selected." cta="Search standards" onCta={() => go("search")} />;
  const decision = decisions[s.id];

  const relGroup = (arr, label, color) =>
    arr && arr.length > 0 && (
      <div>
        <div className={`text-xs font-semibold mb-1.5 ${color}`}>{label}</div>
        <div className="flex flex-wrap gap-2">
          {arr.map((rid) => {
            const rs = findStandard(rid);
            return rs ? (
              <button key={rid} onClick={() => go("standardDetail", { id: rid })} className="text-xs px-2.5 py-1 border border-slate-300 rounded font-mono hover:border-amber-400">
                {rs.number}
              </button>
            ) : null;
          })}
        </div>
      </div>
    );

  return (
    <div className="max-w-3xl">
      <button onClick={() => go("search")} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4"><ArrowLeft size={14} /> Back</button>

      <div className="bg-white border border-slate-200 rounded-md p-6">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <StatusBadge status={s.status} />
          <span className="text-xs text-slate-400">{s.category} · {s.domain}</span>
        </div>
        <h1 className="font-mono text-xl font-bold text-slate-900 mb-1">{s.number}</h1>
        <h2 className="font-serif text-lg text-slate-800 mb-4">{s.title}</h2>

        <div className="grid sm:grid-cols-2 gap-4 mb-5 text-sm">
          <div><span className="text-slate-400 text-xs">Year of edition</span><div className="font-medium">{s.year}</div></div>
          <div><span className="text-slate-400 text-xs">Latest available version</span><div className="font-medium">{s.latestVersion}</div></div>
          <div><span className="text-slate-400 text-xs">Amendments</span><div className="font-medium">{s.amendments.length ? s.amendments.join(", ") : "None on record"}</div></div>
          <div><span className="text-slate-400 text-xs">Certification status</span><div className="font-medium">{s.certification.status}</div></div>
        </div>

        {s.supersededNote && (
          <div className="mb-5 bg-amber-50 border border-amber-300 rounded p-3 text-sm text-amber-800 flex gap-2">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" /> {s.supersededNote}
          </div>
        )}

        <div className="mb-5">
          <div className="text-xs font-semibold text-slate-500 mb-1">Scope</div>
          <p className="text-sm text-slate-700">{s.scope}</p>
        </div>

        <div className="space-y-3 mb-5">
          {relGroup(s.relations?.normative, "Normative references", "text-sky-700")}
          {relGroup(s.relations?.test, "Test methods", "text-teal-700")}
          {relGroup(s.relations?.safety, "Safety standards", "text-rose-700")}
          {relGroup(s.relations?.installation, "Installation-related", "text-indigo-700")}
          {relGroup(s.relations?.material, "Material standards", "text-orange-700")}
        </div>

        {s.certification.status !== "Not Applicable" && (
          <div className="bg-slate-50 rounded p-3 mb-5 text-sm">
            <div className="font-semibold text-slate-700 mb-1">Certification intelligence</div>
            <div><span className="text-slate-400 text-xs">Scheme:</span> {s.certification.scheme}</div>
            <div><span className="text-slate-400 text-xs">Reason:</span> {s.certification.reason}</div>
            <div><span className="text-slate-400 text-xs">Recommended action:</span> {s.certification.action}</div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button onClick={() => go("graph")} className="text-xs px-3 py-1.5 border border-slate-300 rounded hover:bg-slate-50 flex items-center gap-1"><Share2 size={13} /> View in knowledge graph</button>
          <button onClick={() => setDecision(s.id, "accepted")} className={`text-xs px-3 py-1.5 rounded border flex items-center gap-1 ${decision === "accepted" ? "bg-emerald-600 text-white border-emerald-600" : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"}`}>
            <CheckCircle2 size={13} /> Add to tender
          </button>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   ALLIED & NORMATIVE
   ========================================================================= */

function AlliedPage({ analysis, go }) {
  if (!analysis) return <EmptyState text="Run an analysis to view allied and normative standards." cta="Open analyzer" onCta={() => go("analyzer")} />;
  const tiers = [
    { key: "Primary", label: "Primary standards", note: "Highly Recommended", color: "border-slate-900" },
    { key: "Allied", label: "Allied standards", note: "Recommended", color: "border-amber-500" },
    { key: "Normative", label: "Normative references", note: "Should Be Considered", color: "border-sky-600" },
    { key: "Test", label: "Test methods", note: "Should Be Considered", color: "border-teal-600" },
    { key: "Installation", label: "Installation-related", note: "May Be Applicable", color: "border-indigo-600" },
  ];
  return (
    <div className="max-w-5xl">
      <h1 className="font-serif text-xl font-semibold mb-1">Allied &amp; Normative Standards</h1>
      <p className="text-slate-500 text-sm mb-5">Standards tiered by relationship strength to the primary recommendation for: <span className="font-medium text-slate-800">{analysis.product}</span></p>

      <div className="space-y-5">
        {tiers.map((tier) => {
          const items = analysis.recommendations.filter((r) => r.tier === tier.key);
          if (items.length === 0) return null;
          return (
            <div key={tier.key} className={`border-l-4 ${tier.color} pl-4`}>
              <div className="flex items-baseline gap-2 mb-2">
                <h3 className="font-serif font-semibold text-slate-800">{tier.label}</h3>
                <span className="text-xs text-slate-400">{tier.note}</span>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                {items.map((r) => {
                  const s = byId(r.id);
                  return (
                    <button key={r.id} onClick={() => go("standardDetail", { id: s.id })} className="text-left bg-white border border-slate-200 rounded p-3 hover:border-amber-400">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-mono text-sm font-semibold">{s.number}</span>
                        <span className="text-xs font-mono text-slate-500">{r.relevance}%</span>
                      </div>
                      <div className="text-sm text-slate-700">{s.title}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <Panel title="Potential / contextual standards" icon={AlertTriangle} className="mt-6">
        <p className="text-sm text-slate-500 mb-2">May Be Applicable — flagged as potentially missing from the current query and worth expert review:</p>
        <ul className="space-y-1.5">
          {analysis.missing.map((m, i) => <li key={i} className="text-sm text-slate-700 flex gap-2"><AlertTriangle size={14} className="text-orange-500 mt-0.5 shrink-0" />{m}</li>)}
        </ul>
      </Panel>
    </div>
  );
}

/* =========================================================================
   KNOWLEDGE GRAPH
   ========================================================================= */

function GraphPage({ analysis, go, focusId, setFocusId }) {
  if (!analysis) return <EmptyState text="Run an analysis to explore the standards relationship graph." cta="Open analyzer" onCta={() => go("analyzer")} />;

  const focus = findStandard(focusId) || byId(analysis.recommendations[0]?.id);
  const relTypes = [
    { key: "normative", label: "Normative reference", color: "#0369a1" },
    { key: "test", label: "Test method", color: "#0f766e" },
    { key: "safety", label: "Safety standard", color: "#be123c" },
    { key: "installation", label: "Installation", color: "#4338ca" },
    { key: "material", label: "Material", color: "#c2410c" },
  ];
  const satellites = [];
  relTypes.forEach((rt) => {
    (focus.relations?.[rt.key] || []).forEach((rid) => {
      const rs = findStandard(rid);
      if (rs) satellites.push({ ...rs, relType: rt.key, color: rt.color });
    });
  });

  const size = 480, cx = size / 2, cy = size / 2, radius = 170;
  const positions = satellites.map((s, i) => {
    const angle = (i / Math.max(satellites.length, 1)) * 2 * Math.PI - Math.PI / 2;
    return { ...s, x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  });

  return (
    <div className="max-w-5xl">
      <h1 className="font-serif text-xl font-semibold mb-1">Standards Relationship Graph</h1>
      <p className="text-slate-500 text-sm mb-4">Click any satellite node to inspect that standard, or change the focus below.</p>

      <div className="flex flex-wrap gap-2 mb-4">
        {analysis.recommendations.filter((r) => r.tier === "Primary" || r.tier === "Allied").map((r) => (
          <button key={r.id} onClick={() => setFocusId(r.id)} className={`text-xs px-3 py-1.5 rounded-full border font-mono ${focusId === r.id ? "bg-slate-900 text-white border-slate-900" : "border-slate-300 text-slate-600 hover:border-amber-400"}`}>
            {byId(r.id).number}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-md p-4 flex justify-center">
          <svg width={size} height={size} className="max-w-full h-auto">
            {positions.map((p, i) => (
              <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke={p.color} strokeWidth="1.5" strokeDasharray="4 3" />
            ))}
            <circle cx={cx} cy={cy} r={42} fill="#0f172a" />
            <text x={cx} y={cy - 4} textAnchor="middle" fill="white" fontSize="11" fontFamily="monospace" fontWeight="bold">{focus.number}</text>
            <text x={cx} y={cy + 12} textAnchor="middle" fill="#cbd5e1" fontSize="8">{focus.category}</text>
            {positions.map((p, i) => (
              <g key={i} className="cursor-pointer" onClick={() => go("standardDetail", { id: p.id })}>
                <circle cx={p.x} cy={p.y} r={30} fill="white" stroke={p.color} strokeWidth="2" />
                <text x={p.x} y={p.y - 3} textAnchor="middle" fontSize="9" fontFamily="monospace" fontWeight="bold" fill="#1e293b">{p.number}</text>
                <text x={p.x} y={p.y + 10} textAnchor="middle" fontSize="7.5" fill="#64748b">{p.relType}</text>
              </g>
            ))}
          </svg>
        </div>
        <div className="space-y-3">
          <Panel title="Legend">
            <ul className="space-y-1.5 text-sm">
              {relTypes.map((rt) => (
                <li key={rt.key} className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: rt.color }} />{rt.label}</li>
              ))}
            </ul>
          </Panel>
          <Panel title="Focused standard">
            <div className="font-mono text-sm font-semibold">{focus.number}</div>
            <div className="text-sm text-slate-700 mb-2">{focus.title}</div>
            <button onClick={() => go("standardDetail", { id: focus.id })} className="text-xs text-amber-700 hover:underline">Open full detail →</button>
          </Panel>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   VERSION & AMENDMENT CHECKER
   ========================================================================= */

function VersionPage({ analysis }) {
  const [manualId, setManualId] = useState(STANDARDS[0]?.id ?? null);
  const manual = byId(manualId ?? STANDARDS[0]?.id);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="font-serif text-xl font-semibold mb-1">Version &amp; Amendment Checker</h1>
        <p className="text-slate-500 text-sm mb-4">Verify whether a standard is current, revised, superseded, withdrawn or under revision.</p>
      </div>

      {analysis && (
        <Panel title="Standards in current analysis" icon={History}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 border-b border-slate-200">
                <th className="pb-2">Standard</th><th className="pb-2">Status</th><th className="pb-2">Latest version</th><th className="pb-2">Amendments</th>
              </tr>
            </thead>
            <tbody>
              {analysis.recommendations.map((r) => {
                const s = byId(r.id);
                return (
                  <tr key={s.id} className="border-b border-slate-100">
                    <td className="py-2 font-mono">{s.number}</td>
                    <td className="py-2"><StatusBadge status={s.status} /></td>
                    <td className="py-2">{s.latestVersion}</td>
                    <td className="py-2">{s.amendments.length ? s.amendments.join(", ") : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {analysis.recommendations.some((r) => byId(r.id).status === "Superseded") && (
            <div className="mt-4 space-y-2">
              {analysis.recommendations.filter((r) => byId(r.id).status === "Superseded").map((r) => {
                const s = byId(r.id);
                return (
                  <div key={s.id} className="bg-amber-50 border border-amber-300 rounded p-3 text-sm flex gap-2">
                    <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                    <div><span className="font-semibold">Outdated reference detected —</span> {s.number}. Latest available version: <span className="font-medium">{s.latestVersion}</span>. Recommendation: replace the older reference before tender publication.</div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      )}

      <Panel title="Manual lookup" icon={Search}>
        <select value={manualId} onChange={(e) => setManualId(e.target.value)} className="border border-slate-300 rounded px-3 py-2 text-sm mb-4 w-full sm:w-96">
          {STANDARDS.map((s) => <option key={s.id} value={s.id}>{s.number} — {s.title}</option>)}
        </select>
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <div><span className="text-slate-400 text-xs">Status</span><div><StatusBadge status={manual.status} /></div></div>
          <div><span className="text-slate-400 text-xs">Edition</span><div className="font-medium">{manual.year}</div></div>
          <div><span className="text-slate-400 text-xs">Latest version</span><div className="font-medium">{manual.latestVersion}</div></div>
          <div><span className="text-slate-400 text-xs">Amendments</span><div className="font-medium">{manual.amendments.length ? manual.amendments.join(", ") : "None on record"}</div></div>
        </div>
        {manual.supersededNote && <p className="mt-3 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2.5">{manual.supersededNote}</p>}
      </Panel>
    </div>
  );
}

/* =========================================================================
   CERTIFICATION CHECKER
   ========================================================================= */

const getCategoryList = () => [...new Set(STANDARDS.map((s) => s.category))];

function CertificationPage({ analysis }) {
  const categoryList = getCategoryList();
  const [manualCategory, setManualCategory] = useState(categoryList[0]);
  const manualStandards = STANDARDS.filter((s) => s.category === manualCategory && s.certification.status !== "Not Applicable");

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="font-serif text-xl font-semibold mb-1">Certification Checker</h1>
        <p className="text-slate-500 text-sm">Distinguishes Indian Standard applicability from legally mandatory certification. AI suggestions must be verified against current regulatory notifications.</p>
      </div>

      {analysis && (
        <Panel title={`Analysis result — ${analysis.certification.category}`} icon={ShieldCheck}>
          <div className="flex items-center gap-2 mb-3">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded border ${analysis.certification.status === "Possibly Applicable" ? "bg-amber-50 text-amber-700 border-amber-300" : "bg-slate-50 text-slate-500 border-slate-300"}`}>
              {analysis.certification.status}
            </span>
            <span className="text-sm text-slate-700 font-medium">{analysis.certification.scheme}</span>
          </div>
          <div className="text-sm text-slate-600 mb-1"><span className="text-slate-400 text-xs">Reason: </span>{analysis.certification.reason}</div>
          <div className="text-sm text-slate-600"><span className="text-slate-400 text-xs">Recommended action: </span>{analysis.certification.action}</div>
        </Panel>
      )}

      <Panel title="Manual category lookup" icon={Filter}>
        <select value={manualCategory} onChange={(e) => setManualCategory(e.target.value)} className="border border-slate-300 rounded px-3 py-2 text-sm mb-4 w-full sm:w-72">
          {categoryList.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {manualStandards.length === 0 ? (
          <p className="text-sm text-slate-500">No certification-relevant standards identified for this category in the demo dataset.</p>
        ) : (
          <div className="space-y-3">
            {manualStandards.map((s) => (
              <div key={s.id} className="border border-slate-200 rounded p-3 text-sm">
                <div className="font-mono font-semibold mb-1">{s.number}</div>
                <div className="mb-1"><span className="text-xs text-slate-400">Scheme: </span>{s.certification.scheme}</div>
                <div className="mb-1"><span className="text-xs text-slate-400">Reason: </span>{s.certification.reason}</div>
                <div><span className="text-xs text-slate-400">Action: </span>{s.certification.action}</div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

/* =========================================================================
   COMPLIANCE / RISK SCORE
   ========================================================================= */

function CompliancePage({ analysis, go }) {
  if (!analysis) return <EmptyState text="Run an analysis to generate a tender compliance and procurement risk score." cta="Open analyzer" onCta={() => go("analyzer")} />;
  const c = analysis.compliance;
  const risk = RISK_STYLE[c.risk];
  const radarData = [
    { metric: "Coverage", value: c.coverage },
    { metric: "Version validity", value: c.versionValidity },
    { metric: "Normative refs", value: c.normativeRefs },
    { metric: "Safety coverage", value: c.safetyCoverage },
    { metric: "Certification", value: c.certCoverage },
    { metric: "Completeness", value: c.technicalCompleteness },
  ];

  return (
    <div className="max-w-5xl">
      <h1 className="font-serif text-xl font-semibold mb-1">Tender Standards Compliance Score</h1>
      <p className="text-slate-500 text-sm mb-5">For: <span className="font-medium text-slate-800">{analysis.product}</span></p>

      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <Panel className="flex flex-col items-center justify-center py-6">
          <ScoreRing value={c.overall} />
          <div className="text-xs text-slate-500 mt-2">Overall Compliance Score</div>
        </Panel>
        <Panel className={`flex flex-col items-center justify-center py-6 ${risk.bg} ${risk.border}`}>
          <div className={`text-3xl font-serif font-bold ${risk.text}`}>{c.risk}</div>
          <div className="text-xs text-slate-500 mt-2">Overall Procurement Risk</div>
        </Panel>
        <Panel title="Compliance DNA" icon={Activity} className="row-span-1">
          <ResponsiveContainer width="100%" height={140}>
            <RadarChart data={radarData} outerRadius={55}>
              <PolarGrid stroke="#e2e8f0" />
              <PolarAngleAxis dataKey="metric" tick={{ fontSize: 9, fill: "#64748b" }} />
              <PolarRadiusAxis tick={false} axisLine={false} domain={[0, 100]} />
              <Radar dataKey="value" stroke="#d97706" fill="#f59e0b" fillOpacity={0.4} />
              <Tooltip />
            </RadarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <Panel title="Sub-metric breakdown" icon={Gauge} className="mb-6">
        <div className="space-y-3">
          {[
            ["Standards coverage", c.coverage],
            ["Version validity", c.versionValidity],
            ["Normative references", c.normativeRefs],
            ["Safety coverage", c.safetyCoverage],
            ["Certification coverage", c.certCoverage],
            ["Technical completeness", c.technicalCompleteness],
          ].map(([label, val]) => (
            <div key={label}>
              <div className="flex justify-between text-xs text-slate-600 mb-1"><span>{label}</span><span className="font-mono">{val}%</span></div>
              <div className="w-full h-2 bg-slate-200 rounded-full"><div className="h-full bg-slate-700 rounded-full" style={{ width: `${val}%` }} /></div>
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid md:grid-cols-2 gap-4">
        <Panel title="Potential missing requirements" icon={AlertTriangle}>
          <ul className="space-y-1.5 text-sm">
            {analysis.missing.map((m, i) => <li key={i} className="flex gap-2"><AlertTriangle size={14} className="text-orange-500 mt-0.5 shrink-0" />{m}</li>)}
          </ul>
        </Panel>
        <Panel title="How this score is calculated" icon={Info}>
          <p className="text-sm text-slate-600 mb-2">Weighted from semantic similarity (40%), product/domain match (20%), scope match (15%), requirement match (10%), reference relationships (10%) and certification relevance (5%), aggregated across standards coverage, version validity, normative references, safety coverage, certification coverage and technical completeness.</p>
          <p className="text-xs text-slate-400">This score is AI-generated decision support and does not represent a final compliance determination.</p>
        </Panel>
      </div>
    </div>
  );
}

/* =========================================================================
   SPECIFICATION GENERATOR
   ========================================================================= */

function SpecificationPage({ analysis, decisions, go }) {
  const [copied, setCopied] = useState(false);
  if (!analysis) return <EmptyState text="Run an analysis to generate a standards-aware draft specification." cta="Open analyzer" onCta={() => go("analyzer")} />;

  const included = analysis.recommendations.filter((r) => decisions[r.id] !== "rejected" && decisions[r.id] !== "not_applicable");

  const text = `DRAFT PROCUREMENT SPECIFICATION (AI-GENERATED)
================================================
Product: ${analysis.product}
Generated: ${analysis.timestamp}

1. PRODUCT DESCRIPTION
${Object.entries(analysis.extracted).map(([k, v]) => `   ${k}: ${v}`).join("\n")}

2. APPLICABLE INDIAN STANDARDS
${included.map((r) => {
    const s = byId(r.id);
    return `   [${r.tier}] ${s.number} — ${s.title} (Status: ${s.status}, Latest: ${s.latestVersion})`;
  }).join("\n")}

3. TESTING REQUIREMENTS
   Supplier shall furnish type-test / acceptance-test reports as per the test-method standards listed above prior to dispatch.

4. SAFETY REQUIREMENTS
   Product shall comply with applicable electrical/construction safety standards listed above.

5. CERTIFICATION REQUIREMENTS
   Certification status: ${analysis.certification.status}
   Scheme: ${analysis.certification.scheme}
   Action required: ${analysis.certification.action}

6. INSPECTION & ACCEPTANCE CRITERIA
   Goods shall be inspected against the referenced standards prior to acceptance. Non-conforming lots shall be rejected as per the applicable acceptance-test standard.

7. OPEN ITEMS FLAGGED BY AI
${analysis.missing.map((m) => `   - ${m}`).join("\n")}

------------------------------------------------
THIS IS AN AI-GENERATED DRAFT. IT REQUIRES REVIEW
AND VALIDATION BY A QUALIFIED PROCUREMENT / TECHNICAL
EXPERT BEFORE USE IN AN ACTUAL TENDER DOCUMENT.
------------------------------------------------`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable in this environment */ }
  };

  const handleDownload = () => {
    try {
      const blob = new Blob([text], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "IS-Match-AI-draft-specification.txt";
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* download unavailable in this environment */ }
  };

  return (
    <div className="max-w-4xl">
      <h1 className="font-serif text-xl font-semibold mb-1">Generate Standards-Aware Tender Specification</h1>
      <div className="mb-4 bg-amber-50 border border-amber-300 text-amber-800 text-sm rounded p-3 flex gap-2">
        <AlertTriangle size={16} className="shrink-0 mt-0.5" /> AI-generated draft. Requires validation by a procurement or technical expert before use.
      </div>
      <div className="flex gap-2 mb-3">
        <button onClick={handleCopy} className="text-xs px-3 py-1.5 border border-slate-300 rounded hover:bg-white flex items-center gap-1.5"><Copy size={13} /> {copied ? "Copied" : "Copy to clipboard"}</button>
        <button onClick={handleDownload} className="text-xs px-3 py-1.5 border border-slate-300 rounded hover:bg-white flex items-center gap-1.5"><Download size={13} /> Download .txt</button>
      </div>
      <pre className="bg-white border border-slate-200 rounded-md p-5 text-xs font-mono whitespace-pre-wrap leading-relaxed text-slate-800 overflow-x-auto">{text}</pre>
    </div>
  );
}

/* =========================================================================
   EXPERT REVIEW
   ========================================================================= */

function ExpertPage({ analysis, decisions, setDecision, auditLog, go }) {
  if (!analysis) return <EmptyState text="Run an analysis to begin expert review." cta="Open analyzer" onCta={() => go("analyzer")} />;

  return (
    <div className="max-w-5xl">
      <h1 className="font-serif text-xl font-semibold mb-1">Technical Expert Console</h1>
      <p className="text-slate-500 text-sm mb-5">AI is a decision-support tool, not the final authority. Review, accept, reject or escalate each recommendation.</p>

      <Panel title="Recommendation queue" icon={UserCheck} className="mb-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-400 border-b border-slate-200">
              <th className="pb-2">Standard</th><th className="pb-2">Tier</th><th className="pb-2">Relevance</th><th className="pb-2">Decision</th><th className="pb-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {analysis.recommendations.map((r) => {
              const s = byId(r.id);
              const d = decisions[r.id];
              return (
                <tr key={r.id} className="border-b border-slate-100">
                  <td className="py-2"><button onClick={() => go("standardDetail", { id: s.id })} className="font-mono hover:underline">{s.number}</button></td>
                  <td className="py-2"><TierBadge tier={r.tier} /></td>
                  <td className="py-2 font-mono">{r.relevance}%</td>
                  <td className="py-2 capitalize">{d ? d.replace("_", " ") : <span className="text-slate-400">Pending</span>}</td>
                  <td className="py-2">
                    <div className="flex gap-1.5">
                      <button onClick={() => setDecision(r.id, "accepted")} className="text-emerald-600 hover:text-emerald-800"><CheckCircle2 size={16} /></button>
                      <button onClick={() => setDecision(r.id, "rejected")} className="text-rose-600 hover:text-rose-800"><XCircle size={16} /></button>
                      <button onClick={() => setDecision(r.id, "expert_review")} className="text-amber-600 hover:text-amber-800"><AlertTriangle size={16} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>

      <Panel title="Audit trail" icon={FileText}>
        {auditLog.length === 0 ? <p className="text-sm text-slate-500">No actions recorded yet.</p> : (
          <ul className="space-y-1.5 text-sm max-h-64 overflow-y-auto">
            {auditLog.map((a, i) => (
              <li key={i} className="flex justify-between border-b border-slate-100 pb-1.5">
                <span>{a.action.replace("_", " ")} {a.standardId ? `— ${byId(a.standardId)?.number}` : ""}</span>
                <span className="text-slate-400 font-mono text-xs">{a.time}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

/* =========================================================================
   ADMIN — STANDARDS DATABASE
   ========================================================================= */

function AdminDbPage({ onCatalogChange, onError }) {
  const [, bump] = useState(0);
  const refresh = (list) => {
    applyStandards(list);
    bump((n) => n + 1);
    onCatalogChange?.();
  };
  const changeStatus = async (s, status) => {
    try {
      await updateStandard(s.id, { status });
      refresh(STANDARDS.map((row) => (row.id === s.id ? { ...row, status } : row)));
    } catch (err) {
      // Silently keeping the old row made a rejected write look like a success.
      onError?.(`Could not update ${s.number}: ${err.message}`);
    }
  };
  return (
    <div className="max-w-5xl">
      <h1 className="font-serif text-xl font-semibold mb-1">Standards Database — Administrator View</h1>
      <p className="text-slate-500 text-sm mb-5">{STANDARDS.length} standards loaded from SQLite across {getCategoryList().length} categories. Status edits are saved to the database.</p>
      <Panel>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-400 border-b border-slate-200">
              <th className="pb-2">Number</th><th className="pb-2">Title</th><th className="pb-2">Category</th><th className="pb-2">Status</th><th className="pb-2">Year</th>
            </tr>
          </thead>
          <tbody>
            {STANDARDS.map((s) => (
              <tr key={s.id} className="border-b border-slate-100">
                <td className="py-1.5 font-mono">{s.number}</td>
                <td className="py-1.5">{s.title}</td>
                <td className="py-1.5">{s.category}</td>
                <td className="py-1.5">
                  <select value={s.status} onChange={(e) => changeStatus(s, e.target.value)} className="border border-slate-200 rounded px-1.5 py-0.5 text-xs">
                    {["Current", "Superseded", "Under Revision", "Withdrawn"].map((st) => <option key={st} value={st}>{st}</option>)}
                  </select>
                </td>
                <td className="py-1.5">{s.year}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
