/**
 * Translation completeness.
 *
 * The UI resolves strings as `t.someKey`, which yields `undefined` and renders
 * nothing at all when a key is missing from one language. That is worse than
 * showing English, and invisible unless someone switches language and looks at
 * the right page. These tests make it a build failure instead.
 */

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { STR } from "../src/strings.js";

const LANGS = Object.keys(STR);

/** Flattens { a: 1, nav: { b: 2 } } to ["a", "nav.b"]. */
function paths(obj, prefix = "") {
  return Object.entries(obj).flatMap(([key, value]) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? paths(value, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

describe("translation completeness", () => {
  test("both languages are present", () => {
    assert.deepEqual(LANGS.sort(), ["en", "hi"]);
  });

  test("every key exists in every language", () => {
    const reference = paths(STR.en).sort();
    for (const lang of LANGS) {
      assert.deepEqual(paths(STR[lang]).sort(), reference, `${lang} key set differs from en`);
    }
  });

  test("no value is empty or whitespace", () => {
    for (const lang of LANGS) {
      for (const key of paths(STR[lang])) {
        const value = key.split(".").reduce((o, k) => o[k], STR[lang]);
        assert.equal(typeof value, "string", `${lang}.${key} is not a string`);
        assert.ok(value.trim().length > 0, `${lang}.${key} is empty`);
      }
    }
  });

  test("Hindi values are actually in Hindi", () => {
    // Catches a copy-paste that left English in the hi block. Keys listed here
    // are legitimately identical across languages (product names, acronyms).
    const allowedIdentical = new Set(["appName"]);
    const suspect = [];

    for (const key of paths(STR.hi)) {
      if (allowedIdentical.has(key)) continue;
      const hi = key.split(".").reduce((o, k) => o[k], STR.hi);
      const en = key.split(".").reduce((o, k) => o[k], STR.en);
      // A translated string should either differ from English or contain
      // Devanagari. Pure-ASCII strings identical to English are untranslated.
      if (hi === en && !/[ऀ-ॿ]/.test(hi)) suspect.push(key);
    }

    assert.deepEqual(suspect, [], `these Hindi values are still English: ${suspect.join(", ")}`);
  });
});

describe("the UI references only keys that exist", () => {
  const source = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");

  test("every t.<key> in App.jsx resolves", () => {
    const referenced = [...source.matchAll(/\bt\.([a-zA-Z][\w.]*)/g)].map((m) => m[1]);
    assert.ok(referenced.length > 50, `expected many keyed strings, found ${referenced.length}`);

    const missing = [...new Set(referenced)].filter((key) => {
      const value = key.split(".").reduce((o, k) => (o == null ? undefined : o[k]), STR.en);
      return value === undefined;
    });

    assert.deepEqual(missing, [], `App.jsx references keys absent from STR.en: ${missing.join(", ")}`);
  });

  test("no stale claims survive in the UI", () => {
    // Both described behaviour that the Phase 2 rewrite and the real upload
    // endpoint replaced. They read as confident and were wrong.
    assert.ok(!source.includes("semantic similarity"), "the fictional score formula is back");
    assert.ok(!source.includes("upload simulated"), "PDF upload is real; the 'simulated' note is back");
  });
});
