/**
 * Tender audit — checking the standards a tender document actually cites.
 *
 * This is what the Tender page needed and did not have. It previously showed
 * the analyzer's generic gap list, an "outdated references" panel that filtered
 * recommendations for Superseded status (only 2 of 113 catalog rows are
 * Superseded, so it almost always reported none), and a "conflicts detected"
 * panel whose text was hardcoded and computed nothing.
 *
 * A real audit answers three questions about a tender:
 *
 *   1. The standards it cites — do they exist, and are they still current?
 *   2. The standards it should cite and does not.
 *   3. Where two applicable standards genuinely overlap, so an officer has to
 *      choose rather than list both.
 *
 * Citation parsing here is deterministic and runs with no network, so the audit
 * works in offline mode too. When the AI path is available its extracted
 * citations are merged in, which catches the ones written in prose that a
 * regex misses ("the relevant Indian Standard for pozzolana cement").
 */

/**
 * Pulls standard citations out of free text.
 *
 * Handles the forms that appear in real tenders:
 *   IS 456          IS 456:2000        IS 1786-2008
 *   IS 10322 (Part 5)                  IS 10322 (Pt 5/Sec 1)
 *   IS/IEC 60529    IS/IEC 60598-2-3   IS/ISO 9001
 *
 * The year is captured separately because a tender citing a superseded edition
 * of a current standard is a finding in its own right.
 */
export function extractCitations(text) {
  // The hyphen is ambiguous: it separates sub-numbers (IS/IEC 60598-2-3) and
  // also years (IS 2713-1980). A trailing 4-digit group in 19xx/20xx is treated
  // as a year, which is why the year alternative is tried before the sub-number
  // one. Getting this wrong made "IS 2713-1980" resolve to nothing, because the
  // number was read as "2713-1980".
  const pattern = /\b(IS)\s*(?:\/\s*(IEC|ISO))?\s*(\d{2,5}(?:-\d{1,3}(?!\d))*)\s*((?:\(\s*(?:Pt|Part)[^)]{0,24}\))?)\s*(?:[:\-]\s*((?:19|20)\d{2}))?/gi;
  const found = new Map();

  for (const m of String(text || "").matchAll(pattern)) {
    const [, is, family, digits, part, year] = m;
    const prefix = family ? `${is.toUpperCase()}/${family.toUpperCase()}` : is.toUpperCase();
    const raw = `${prefix} ${digits}${part ? ` ${part.trim()}` : ""}${year ? `:${year}` : ""}`;
    // Same standard cited twice is one finding, but keep the first form seen.
    const key = normalise(`${prefix} ${digits}${part}`);
    if (!found.has(key)) found.set(key, { raw, prefix, digits, part: part.trim(), year: year || null, key });
  }

  return [...found.values()];
}

/** Comparable form: drops punctuation, spacing and case so "IS 10322 (Pt 5/Sec 1)" == "IS 10322 Pt 5 Sec 1". */
function normalise(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/PART/g, "PT")
    .replace(/SECTION/g, "SEC")
    .replace(/[^A-Z0-9]/g, "");
}

/** Index the catalog by normalised number, and by bare digits as a fallback. */
function citationIndex(STANDARDS) {
  const byNumber = new Map();
  const byDigits = new Map();

  for (const s of STANDARDS) {
    byNumber.set(normalise(s.number), s);
    const digits = (String(s.number).match(/\d{2,5}(?:-\d+)*/) || [])[0];
    if (digits && !byDigits.has(digits)) byDigits.set(digits, s);
  }
  return { byNumber, byDigits };
}

/** Resolve one citation to a catalog row, exact match preferred over digits-only. */
function resolve(citation, index) {
  const exact = index.byNumber.get(normalise(`${citation.prefix} ${citation.digits} ${citation.part}`));
  if (exact) return { standard: exact, exact: true };
  const loose = index.byDigits.get(citation.digits);
  return loose ? { standard: loose, exact: false } : { standard: null, exact: false };
}

const STALE_STATUS = new Set(["Superseded", "Withdrawn", "Under Revision"]);

/**
 * Audits a tender.
 *
 * @param {string} text            the tender text
 * @param {object[]} recommendations  what the matcher returned
 * @param {object[]} STANDARDS     the catalog
 * @param {string[]} aiCitations   extra citation strings found by the AI path
 */
export function auditTender(text, recommendations = [], STANDARDS = [], aiCitations = []) {
  const index = citationIndex(STANDARDS);
  const byId = new Map(STANDARDS.map((s) => [s.id, s]));
  const recommendedIds = new Set(recommendations.map((r) => r.id));

  // Deterministic citations, plus anything the model spotted in prose.
  const citations = extractCitations([text, ...aiCitations].join("\n"));

  const cited = citations.map((citation) => {
    const { standard, exact } = resolve(citation, index);

    if (!standard) {
      return {
        raw: citation.raw,
        standardId: null,
        verdict: "unrecognised",
        severity: "warn",
        note: "Not present in this catalog. Verify the number against the BIS catalogue before publishing.",
      };
    }

    if (STALE_STATUS.has(standard.status)) {
      return {
        raw: citation.raw,
        standardId: standard.id,
        number: standard.number,
        title: standard.title,
        verdict: standard.status === "Under Revision" ? "under_revision" : "stale",
        severity: standard.status === "Withdrawn" ? "error" : "warn",
        note: `Catalog records this as ${standard.status}. Latest on record: ${standard.latestVersion}.`,
      };
    }

    // Cited an older edition of a standard that is otherwise current.
    const currentYear = (String(standard.latestVersion).match(/(\d{4})/) || [])[1];
    if (citation.year && currentYear && citation.year !== currentYear) {
      return {
        raw: citation.raw,
        standardId: standard.id,
        number: standard.number,
        title: standard.title,
        verdict: "old_edition",
        severity: "warn",
        note: `Tender cites the ${citation.year} edition; latest on record is ${standard.latestVersion}.`,
      };
    }

    if (!recommendedIds.has(standard.id)) {
      return {
        raw: citation.raw,
        standardId: standard.id,
        number: standard.number,
        title: standard.title,
        verdict: "unrelated",
        severity: "info",
        note: "Current, but outside the standards matched for the product described. Confirm it belongs in this tender.",
      };
    }

    return {
      raw: citation.raw,
      standardId: standard.id,
      number: standard.number,
      title: standard.title,
      verdict: exact ? "ok" : "ok_loose",
      severity: "ok",
      note: exact
        ? "Cited, current, and applicable to the product described."
        : "Matched on standard number without the part/section. Confirm the correct part is cited.",
    };
  });

  // Standards the matcher found that the tender never mentions. This is the
  // finding an officer most needs: what is missing from their draft.
  const citedIds = new Set(cited.map((c) => c.standardId).filter(Boolean));
  const omitted = recommendations
    .filter((r) => !citedIds.has(r.id) && byId.has(r.id))
    .map((r) => {
      const s = byId.get(r.id);
      return {
        standardId: r.id,
        number: s.number,
        title: s.title,
        tier: r.tier,
        severity: r.tier === "Primary" ? "error" : r.tier === "Test" || r.tier === "Installation" ? "warn" : "info",
        note:
          r.tier === "Primary"
            ? "Governing standard for this product and not cited anywhere in the tender."
            : r.tier === "Test"
              ? "Acceptance test method not cited — the tender cannot state how conformance is verified."
              : r.tier === "Installation"
                ? "Installation and workmanship standard not cited."
                : "Referenced by the governing standard but not cited.",
      };
    });

  return {
    citedCount: cited.length,
    recognised: cited.filter((c) => c.standardId).length,
    cited,
    omitted,
    conflicts: findConflicts(recommendations, cited, byId),
    verdict: summarise(cited, omitted),
  };
}

/**
 * Genuine overlaps, not the hardcoded "no conflicts detected" the page used to
 * print. Two cases are real:
 *
 *   - Alternative variants: two directly-matched standards in the same category
 *     with no relation edge between them. IS 3614 Pt 1 (timber fire door) and
 *     Pt 2 (metal) both match a query that never says which material, and an
 *     officer must pick one rather than list both.
 *   - A cited standard that is stale while a current one in the same category
 *     was matched — the tender is pointing at the wrong edition.
 */
function findConflicts(recommendations, cited, byId) {
  const conflicts = [];
  const direct = recommendations.filter((r) => r.tier === "Primary" || r.tier === "Allied");

  for (let i = 0; i < direct.length; i += 1) {
    for (let j = i + 1; j < direct.length; j += 1) {
      const a = byId.get(direct[i].id);
      const b = byId.get(direct[j].id);
      if (!a || !b || a.category !== b.category) continue;

      const linked = Object.values(a.relations || {}).flat().includes(b.id)
        || Object.values(b.relations || {}).flat().includes(a.id);
      if (linked) continue;

      // Same category is not a conflict on its own. A solar-lighting system
      // standard, an LED luminaire performance standard and a street-lighting
      // particular-requirements standard all apply together, and flagging every
      // pair produced six "conflicts" for one tender. Only genuine alternatives
      // conflict, and there are two reliable signals for that.
      const alternativeParts = baseNumber(a.number) === baseNumber(b.number);
      const overlap = titleOverlap(a.title, b.title);
      if (!alternativeParts && overlap < 0.55) continue;

      conflicts.push({
        kind: alternativeParts ? "alternative_parts" : "alternative_variant",
        severity: "warn",
        a: { standardId: a.id, number: a.number, title: a.title },
        b: { standardId: b.id, number: b.number, title: b.title },
        note: alternativeParts
          ? `Different parts of the same standard both apply. The tender should state which part governs rather than citing the standard generally.`
          : `These describe alternative variants of the same ${a.category.toLowerCase()} item. The tender should state which one is required rather than citing both.`,
      });
    }
  }

  for (const c of cited) {
    if (c.verdict !== "stale") continue;
    const stale = byId.get(c.standardId);
    if (!stale) continue;

    // Only claim a replacement when the two are actually the same standard
    // family. Picking the first current row in the same category named IS 16620
    // (a solar lighting system) as the replacement for IS 2713 (a pole), purely
    // because both are Lighting — that is a wrong answer stated confidently.
    const replacement = recommendations
      .map((r) => byId.get(r.id))
      .find((s) =>
        s && s.id !== stale.id && s.status === "Current"
        && (baseNumber(s.number) === baseNumber(stale.number) || titleOverlap(s.title, stale.title) >= 0.55));

    conflicts.push({
      kind: "stale_citation",
      severity: "error",
      a: { standardId: stale.id, number: stale.number, title: stale.title },
      b: replacement ? { standardId: replacement.id, number: replacement.number, title: replacement.title } : null,
      note: replacement
        ? `The tender cites ${stale.number}, which is ${stale.status}. ${replacement.number} covers the same subject and is current.`
        : `The tender cites ${stale.number}, which is ${stale.status}. No current replacement was found in this catalog — check the BIS catalogue for the superseding standard.`,
    });
  }

  return conflicts.slice(0, 6);
}

/** "IS 3614 (Pt 2)" -> "IS3614", so different parts of one standard collapse together. */
function baseNumber(number) {
  return String(number || "").toUpperCase().replace(/\(.*$/, "").replace(/[^A-Z0-9]/g, "");
}

/** Jaccard overlap of the meaningful title words, ignoring boilerplate. */
const TITLE_NOISE = new Set([
  "for", "and", "of", "the", "with", "general", "requirements", "specification",
  "methods", "method", "test", "tests", "part", "code", "practice", "similar",
  "uses", "use", "type", "types", "other",
]);

function titleOverlap(a, b) {
  const words = (title) =>
    new Set(
      String(title || "").toLowerCase().split(/[^a-z0-9]+/)
        .filter((w) => w.length > 2 && !TITLE_NOISE.has(w)),
    );
  const setA = words(a);
  const setB = words(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  const shared = [...setA].filter((w) => setB.has(w)).length;
  return shared / Math.min(setA.size, setB.size);
}

function summarise(cited, omitted) {
  const blocking = omitted.filter((o) => o.severity === "error").length;
  const problems = cited.filter((c) => c.severity === "error" || c.severity === "warn").length;

  if (cited.length === 0 && omitted.length === 0) {
    return { level: "info", headline: "No standards were cited and none were matched — add product detail to the tender text." };
  }
  if (cited.length === 0) {
    return {
      level: "error",
      headline: `This tender cites no Indian Standard at all. ${omitted.length} applicable ${omitted.length === 1 ? "standard was" : "standards were"} identified.`,
    };
  }
  if (blocking > 0) {
    return {
      level: "error",
      headline: `${blocking} governing ${blocking === 1 ? "standard is" : "standards are"} missing from the tender, and ${cited.length} ${cited.length === 1 ? "citation was" : "citations were"} checked.`,
    };
  }
  if (problems > 0) {
    return { level: "warn", headline: `${problems} of ${cited.length} cited ${cited.length === 1 ? "standard needs" : "standards need"} attention.` };
  }
  return { level: "ok", headline: `All ${cited.length} cited ${cited.length === 1 ? "standard checks" : "standards check"} out. ${omitted.length} further ${omitted.length === 1 ? "standard is" : "standards are"} worth adding.` };
}
