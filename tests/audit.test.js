/**
 * Tender audit contract.
 *
 * The audit is the part of the app that reads a real tender document and says
 * what is wrong with it, so the failure modes that matter are: missing a
 * citation that is present, claiming a citation is unrecognised when the
 * catalog has it, and inventing conflicts between standards that legitimately
 * apply together. Each of those is covered below.
 */

import test, { describe } from "node:test";
import assert from "node:assert/strict";

import { extractCitations, auditTender } from "../shared/audit.js";
import { runAnalysis } from "../shared/matching.js";
import CATALOG from "../shared/standards.json" with { type: "json" };

const numbers = (citations) => citations.map((c) => c.raw);

describe("citation parsing", () => {
  test("plain and year-qualified forms", () => {
    assert.deepEqual(numbers(extractCitations("as per IS 456 and IS 1786:2008")), ["IS 456", "IS 1786:2008"]);
  });

  test("part and section forms", () => {
    const found = extractCitations("conform to IS 10322 (Part 5/Section 1) and IS 3614 (Pt 2)");
    assert.equal(found.length, 2);
    assert.ok(found[0].raw.includes("10322"));
    assert.ok(found[1].raw.includes("3614"));
  });

  test("IEC and ISO families", () => {
    assert.deepEqual(
      numbers(extractCitations("per IS/IEC 60529 and IS/IEC 60598-2-3")),
      ["IS/IEC 60529", "IS/IEC 60598-2-3"],
    );
  });

  test("a hyphenated year is a year, not part of the number", () => {
    // "IS 2713-1980" previously parsed as number "2713-1980", which resolved
    // to nothing and reported a standard the catalog has as unrecognised.
    const [citation] = extractCitations("poles as per IS 2713-1980");
    assert.equal(citation.digits, "2713");
    assert.equal(citation.year, "1980");
  });

  test("a hyphenated sub-number is kept", () => {
    const [citation] = extractCitations("IS/IEC 60598-2-3 applies");
    assert.equal(citation.digits, "60598-2-3");
    assert.equal(citation.year, null);
  });

  test("the same standard cited twice is one finding", () => {
    assert.equal(extractCitations("IS 456 ... later, IS 456 again").length, 1);
  });

  test("no citations in ordinary prose", () => {
    assert.deepEqual(extractCitations("Supply of 40 office chairs within 45 days."), []);
    assert.deepEqual(extractCitations(""), []);
  });
});

describe("auditing a tender", () => {
  const tender =
    "Supply of 250 nos solar powered LED street lights on galvanised poles. " +
    "Fixtures shall conform to IS 16106:2013 and IS 10322 (Part 5/Section 1). " +
    "Poles as per IS 2713-1980. Batteries per IS 9999:2011.";
  const audit = runAnalysis(tender, CATALOG).audit;

  test("the audit is attached to every analysis", () => {
    assert.ok(audit, "runAnalysis did not attach an audit");
    for (const key of ["cited", "omitted", "conflicts", "verdict", "citedCount", "recognised"]) {
      assert.ok(key in audit, `audit is missing ${key}`);
    }
  });

  test("all four citations are found", () => {
    assert.equal(audit.citedCount, 4);
  });

  test("a citation the catalog has is resolved, not reported unrecognised", () => {
    const pole = audit.cited.find((c) => c.raw.includes("2713"));
    assert.ok(pole, "the pole citation was not parsed");
    assert.notEqual(pole.verdict, "unrecognised");
    assert.equal(pole.standardId, "SL09");
  });

  test("a citation the catalog does not have is reported unrecognised", () => {
    const bogus = audit.cited.find((c) => c.raw.includes("9999"));
    assert.equal(bogus.verdict, "unrecognised");
    assert.equal(bogus.standardId, null);
  });

  test("a superseded citation is flagged", () => {
    const stale = audit.cited.find((c) => c.standardId === "SL03");
    assert.ok(stale, "expected the superseded standard among the citations");
    assert.equal(stale.verdict, "stale");
  });

  test("an older edition of a current standard is flagged", () => {
    const old = audit.cited.find((c) => c.verdict === "old_edition");
    assert.ok(old, "expected an old-edition finding for the 1980 pole citation");
    assert.match(old.note, /1980/);
  });

  test("a correctly cited current standard passes", () => {
    const good = audit.cited.find((c) => c.verdict === "ok");
    assert.ok(good, "expected at least one clean citation");
    assert.equal(good.severity, "ok");
  });

  test("governing standards the tender omits are reported as errors", () => {
    const governing = audit.omitted.filter((o) => o.severity === "error");
    assert.ok(governing.length > 0, "expected omitted governing standards");
    for (const o of governing) {
      assert.equal(o.tier, "Primary");
      assert.ok(!audit.cited.some((c) => c.standardId === o.standardId), `${o.standardId} is both cited and omitted`);
    }
  });

  test("a cited standard never appears in the omitted list", () => {
    const citedIds = new Set(audit.cited.map((c) => c.standardId).filter(Boolean));
    for (const o of audit.omitted) assert.ok(!citedIds.has(o.standardId));
  });
});

describe("conflict detection is specific", () => {
  test("different parts of one standard are a real conflict", () => {
    // IS 3614 Pt 1 is the timber fire door, Pt 2 the metal one. A tender that
    // does not say which material applies has to choose.
    const audit = runAnalysis("60 nos fire check doors of two hour rating with door closers", CATALOG).audit;
    const parts = audit.conflicts.find((c) => c.kind === "alternative_parts");

    assert.ok(parts, "expected the Pt 1 / Pt 2 fire door conflict");
    assert.deepEqual([parts.a.standardId, parts.b.standardId].sort(), ["FD01", "FD02"]);
  });

  test("alternative grades of one product are a real conflict", () => {
    const audit = runAnalysis("supply of 500 bags of 53 grade ordinary portland cement", CATALOG).audit;
    const variant = audit.conflicts.find((c) => c.kind === "alternative_variant");
    assert.ok(variant, "expected a cement grade conflict");
  });

  test("standards that legitimately apply together are not a conflict", () => {
    // The system standard, the luminaire performance standard and the
    // street-lighting particular requirements all apply to one solar light.
    // Flagging every same-category pair produced six conflicts for one tender.
    const audit = runAnalysis("250 solar powered LED street lights for rural roads", CATALOG).audit;
    const bogus = audit.conflicts.filter(
      (c) => [c.a.standardId, c.b?.standardId].every((id) => ["SL06", "SL02", "SL04"].includes(id)),
    );
    assert.deepEqual(bogus, [], "the primary lighting standards were reported as conflicting with each other");
  });

  test("a claimed replacement is in the same standard family", () => {
    // Naming IS 16620 (a solar lighting system) as the replacement for IS 2713
    // (a pole) merely because both are Lighting is a confident wrong answer.
    for (const query of ["250 solar LED street lights per IS 16106:2013", "water tank per IS 13049"]) {
      for (const conflict of runAnalysis(query, CATALOG).audit.conflicts) {
        if (conflict.kind !== "stale_citation" || !conflict.b) continue;
        const a = CATALOG.find((s) => s.id === conflict.a.standardId);
        const b = CATALOG.find((s) => s.id === conflict.b.standardId);
        const sameFamily = a.number.replace(/\(.*/, "").trim() === b.number.replace(/\(.*/, "").trim();
        const titleWords = (x) => new Set(x.title.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3));
        const shared = [...titleWords(a)].filter((w) => titleWords(b).has(w)).length;
        assert.ok(
          sameFamily || shared >= 2,
          `${a.number} and ${b.number} are unrelated but were paired as a replacement`,
        );
      }
    }
  });
});

describe("audit verdicts", () => {
  test("a tender citing nothing is an error", () => {
    const audit = runAnalysis("supply of 500 bags of 53 grade cement", CATALOG).audit;
    assert.equal(audit.citedCount, 0);
    assert.equal(audit.verdict.level, "error");
    assert.match(audit.verdict.headline, /cites no Indian Standard/);
  });

  test("an unmatchable tender does not claim findings", () => {
    const audit = runAnalysis("xyzzy nonsense qwerty", CATALOG).audit;
    assert.deepEqual(audit.cited, []);
    assert.deepEqual(audit.omitted, []);
    assert.deepEqual(audit.conflicts, []);
    assert.equal(audit.verdict.level, "info");
  });

  test("the audit survives an empty catalog", () => {
    assert.doesNotThrow(() => auditTender("IS 456 applies", [], []));
  });

  test("AI-supplied citations are merged with the parsed ones", () => {
    const text = "Cement shall be 53 grade.";
    const withoutAi = auditTender(text, [], CATALOG);
    const withAi = auditTender(text, [], CATALOG, ["IS 12269:2013"]);

    assert.equal(withoutAi.citedCount, 0);
    assert.equal(withAi.citedCount, 1);
    assert.equal(withAi.cited[0].standardId, "CE03");
  });
});
