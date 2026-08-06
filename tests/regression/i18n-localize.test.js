/**
 * tests/regression/i18n-localize.test.js
 * Covers i18n.js's localize() — specifically the nested-array mode added
 * to fix Phase 0 debt item #2 (labs.js used to hand-roll its own overlay
 * merge instead of reusing this shared helper). labs.js's actual wrapper
 * isn't exported (it's a 3-line pass-through with no logic of its own,
 * and initLabs() needs a DOM), so this tests the real mechanism directly
 * with a fixture shaped exactly like a Lab.
 *
 * locale is a module-private variable in i18n.js, read once from
 * localStorage at import time — so the shim is seeded with locale:"ar"
 * BEFORE the first import in this process, and this file is intentionally
 * the only place in the suite that runs in Arabic mode.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { installLocalStorageShim } from "../helpers/storage-shim.js";

const store = installLocalStorageShim();
store.set("lpl_state_v1", JSON.stringify({ locale: "ar" }));

const { localize, getLocale } = await import("../../assets/js/i18n.js");

describe("localize() — flat merge (Learn/Challenges/Quiz shape)", () => {
  test("sanity: locale really is 'ar' for this file", () => {
    assert.equal(getLocale(), "ar");
  });

  test("an item with a matching overlay id gets its fields overridden", () => {
    const items = [{ id: "x", title: "English title", note: "unchanged field" }];
    const overlay = { x: { title: "عنوان عربي" } };
    const result = localize(items, overlay);
    assert.equal(result[0].title, "عنوان عربي");
    assert.equal(result[0].note, "unchanged field", "fields absent from the overlay must survive untouched");
  });

  test("an item with no matching overlay entry passes through unchanged", () => {
    const items = [{ id: "y", title: "no overlay for this one" }];
    const result = localize(items, { x: { title: "…" } });
    assert.deepEqual(result[0], items[0]);
  });
});

describe("localize() — nestedArrayKey mode (Labs shape)", () => {
  const lab = {
    id: "lab1",
    title: "Secure an SSH Private Key",
    difficulty: "Beginner",
    steps: [
      { type: "answer", target: "600", prompt: "English step 1 prompt", hint: "English hint" },
      { type: "info", prompt: "English step 2 prompt", note: "English note" },
    ],
  };
  const overlay = {
    lab1: {
      title: "أمّن مفتاح SSH خاص",
      difficulty: "مبتدئ",
      steps: [
        { prompt: "نص الخطوة الأولى بالعربية", hint: "تلميح بالعربية" },
        { prompt: "نص الخطوة الثانية بالعربية", note: "ملاحظة بالعربية" },
      ],
    },
  };

  test("top-level fields are translated", () => {
    const [result] = localize([lab], overlay, { nestedArrayKey: "steps" });
    assert.equal(result.title, "أمّن مفتاح SSH خاص");
    assert.equal(result.difficulty, "مبتدئ");
  });

  test("each step is merged element-by-element by index, not replaced wholesale", () => {
    const [result] = localize([lab], overlay, { nestedArrayKey: "steps" });
    assert.equal(result.steps[0].prompt, "نص الخطوة الأولى بالعربية");
    assert.equal(result.steps[0].hint, "تلميح بالعربية");
    assert.equal(result.steps[1].prompt, "نص الخطوة الثانية بالعربية");
    assert.equal(result.steps[1].note, "ملاحظة بالعربية");
  });

  test("fields the overlay doesn't repeat (type, target) survive from the base step", () => {
    const [result] = localize([lab], overlay, { nestedArrayKey: "steps" });
    assert.equal(result.steps[0].type, "answer", "step shape fields must not be dropped by the overlay merge");
    assert.equal(result.steps[0].target, "600", "the graded answer must be untouched by localization — this is the exact bug class this test guards against");
    assert.equal(result.steps[1].type, "info");
  });

  test("a lab with no Arabic overlay entry at all passes through completely unchanged", () => {
    const untranslatedLab = { id: "lab99", title: "No overlay for this lab", steps: [{ type: "info", prompt: "x", note: "y" }] };
    const [result] = localize([untranslatedLab], overlay, { nestedArrayKey: "steps" });
    assert.deepEqual(result, untranslatedLab);
  });

  test("an overlay shorter than the base steps array only translates the steps it covers", () => {
    const threeStepLab = {
      id: "lab-partial",
      title: "t", steps: [
        { type: "info", prompt: "s1", note: "n1" },
        { type: "info", prompt: "s2", note: "n2" },
        { type: "info", prompt: "s3", note: "n3" },
      ],
    };
    const partialOverlay = { "lab-partial": { steps: [{ prompt: "مترجم" }] } };
    const [result] = localize([threeStepLab], partialOverlay, { nestedArrayKey: "steps" });
    assert.equal(result.steps[0].prompt, "مترجم");
    assert.equal(result.steps[1].prompt, "s2", "steps beyond the overlay's length must fall back to the English original");
    assert.equal(result.steps[2].prompt, "s3");
  });
});

describe("localize() against the real LABS/LABS_AR data (integration check)", () => {
  test("all 11 real labs merge without dropping any step's type/target, in every locale-bearing lab", async () => {
    const { LABS } = await import("../../assets/js/labs-data.js");
    const { LABS_AR } = await import("../../assets/js/labs-data.ar.js");
    const localized = localize(LABS, LABS_AR, { nestedArrayKey: "steps" });

    assert.equal(localized.length, LABS.length);
    for (let i = 0; i < LABS.length; i++) {
      const original = LABS[i];
      const translated = localized[i];
      assert.equal(translated.steps.length, original.steps.length, `${original.id}: step count must not change`);
      for (let s = 0; s < original.steps.length; s++) {
        assert.equal(translated.steps[s].type, original.steps[s].type, `${original.id} step ${s}: type dropped by localization`);
        if (original.steps[s].type === "answer") {
          assert.equal(translated.steps[s].target, original.steps[s].target, `${original.id} step ${s}: target changed by localization — this must never happen`);
        }
      }
    }
  });

  test("lab1's real Arabic title and first step's real Arabic prompt come through correctly", async () => {
    const { LABS } = await import("../../assets/js/labs-data.js");
    const { LABS_AR } = await import("../../assets/js/labs-data.ar.js");
    const lab1 = localize(LABS, LABS_AR, { nestedArrayKey: "steps" }).find((l) => l.id === "lab1");
    assert.equal(lab1.title, LABS_AR.lab1.title);
    assert.equal(lab1.steps[0].prompt, LABS_AR.lab1.steps[0].prompt);
  });
});
