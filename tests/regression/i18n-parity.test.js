/**
 * tests/regression/i18n-parity.test.js
 * The README promises a full Arabic translation. This keeps that promise
 * honest: a new English string or content item without an Arabic counterpart
 * (or an Arabic overlay whose shape no longer matches its source) fails CI
 * instead of silently falling back to English in the UI.
 *
 * Runs in the default (English) locale — it only reads data, never renders.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { installLocalStorageShim } from "../helpers/storage-shim.js";

installLocalStorageShim();
const R = "../../assets/js/";
const { DICT } = await import(R + "i18n.js");
const { CHALLENGES } = await import(R + "challenges-data.js");
const { CHALLENGES_AR } = await import(R + "challenges-data.ar.js");
const { LABS } = await import(R + "labs-data.js");
const { LABS_AR } = await import(R + "labs-data.ar.js");
const { QUIZ_QUESTIONS } = await import(R + "quiz-data.js");
const { QUIZ_QUESTIONS_AR } = await import(R + "quiz-data.ar.js");
const { LEARN_TOPICS } = await import(R + "learn.js");
const { LEARN_TOPICS_AR } = await import(R + "learn.ar.js");
const { CHEATSHEET_ROWS } = await import(R + "converter.js");
const { CHEATSHEET_ROWS_AR } = await import(R + "cheatsheet-data.ar.js");
const { TERMINAL_COMMANDS } = await import(R + "terminal-commands-data.js");
const { TERMINAL_COMMANDS_AR } = await import(R + "terminal-commands-data.ar.js");

const ids = (items) => items.map((x) => String(x.id));

describe("UI dictionary (DICT)", () => {
  test("en and ar define exactly the same keys", () => {
    const en = Object.keys(DICT.en);
    const ar = Object.keys(DICT.ar);
    assert.deepEqual(en.filter((k) => !(k in DICT.ar)), [], "keys missing from ar");
    assert.deepEqual(ar.filter((k) => !(k in DICT.en)), [], "keys only in ar");
  });
  test("no translation is empty", () => {
    for (const lang of ["en", "ar"]) {
      const empty = Object.entries(DICT[lang]).filter(([, v]) => !String(v).trim()).map(([k]) => k);
      assert.deepEqual(empty, [], `${lang} has empty strings`);
    }
  });
  test("every key referenced by t(...) or data-i18n* exists", () => {
    const dir = new URL(R, import.meta.url);
    const used = new Set();
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".js"))) {
      const src = readFileSync(new URL(f, dir), "utf8");
      for (const m of src.matchAll(/\bt\(\s*["']([A-Za-z0-9_.]+)["']\s*\)/g)) used.add(m[1]);
    }
    const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
    for (const m of html.matchAll(/data-i18n[a-z-]*="([^"]+)"/g)) used.add(m[1]);
    assert.ok(used.size > 100, "scan found suspiciously few keys — has the call pattern changed?");
    assert.deepEqual([...used].filter((k) => !(k in DICT.en)), []);
  });
});

describe("content overlays (Arabic) match their English source", () => {
  const cases = [
    ["Learn topics", LEARN_TOPICS, LEARN_TOPICS_AR],
    ["Labs", LABS, LABS_AR],
    ["Challenges", CHALLENGES, CHALLENGES_AR],
    ["Quiz questions", QUIZ_QUESTIONS, QUIZ_QUESTIONS_AR],
    ["Cheat sheet octal rows", CHEATSHEET_ROWS, CHEATSHEET_ROWS_AR],
    ["Terminal commands reference", TERMINAL_COMMANDS, TERMINAL_COMMANDS_AR],
  ];
  for (const [label, base, overlay] of cases) {
    test(`${label}: every item has an Arabic entry and there are no orphans`, () => {
      const baseIds = ids(base);
      const overlayIds = Object.keys(overlay);
      assert.deepEqual(baseIds.filter((i) => !(i in overlay)), [], "untranslated");
      assert.deepEqual(overlayIds.filter((i) => !baseIds.includes(i)), [], "orphan overlay entries");
    });
  }

  test("Quiz: an Arabic question never changes the number of options (the answer index would break)", () => {
    const bad = QUIZ_QUESTIONS.filter((q) => {
      const a = QUIZ_QUESTIONS_AR[String(q.id)];
      return a?.options && a.options.length !== q.options.length;
    }).map((q) => q.id);
    assert.deepEqual(bad, []);
  });
  test("Labs: Arabic step arrays line up one-to-one with the English steps", () => {
    const bad = LABS.filter((l) => {
      const a = LABS_AR[l.id];
      return a?.steps && a.steps.length !== l.steps.length;
    }).map((l) => l.id);
    assert.deepEqual(bad, []);
  });
  test("Challenges: Arabic hints line up with the English hints", () => {
    const bad = CHALLENGES.filter((c) => {
      const a = CHALLENGES_AR[c.id];
      return a?.hints && a.hints.length !== c.hints.length;
    }).map((c) => c.id);
    assert.deepEqual(bad, []);
  });
});
