/**
 * tests/regression/scenarios-i18n.test.js
 * Keeps the Arabic overlay for the v2.12 scenarios honest, the same way
 * i18n-parity.test.js does for the older content: every scenario has an
 * entry, nothing is orphaned, and every array/keyed list lines up with
 * the English source (a hint index or check id must never drift).
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { installLocalStorageShim } from "../helpers/storage-shim.js";

installLocalStorageShim();
const R = "../../assets/js/";
const { SCENARIOS, INVESTIGATIONS } = await import(R + "scenarios-data.js");
const { SCENARIOS_AR } = await import(R + "scenarios-data.ar.js");
const { DICT } = await import(R + "i18n.js");

const AR = /[\u0600-\u06FF]/;
const keys = (o) => Object.keys(o || {}).sort();

describe("scenario Arabic overlay", () => {
  test("every scenario has an Arabic entry and there are no orphans", () => {
    assert.deepEqual(keys(SCENARIOS_AR), SCENARIOS.map((s) => s.id).sort());
  });
  test("title, task/incident and objectives line up and are Arabic", () => {
    for (const s of SCENARIOS) {
      const a = SCENARIOS_AR[s.id];
      assert.ok(AR.test(a.title), `${s.id} title`);
      assert.equal(a.objectives.length, s.objectives.length, `${s.id} objectives`);
      assert.ok(a.objectives.every((o) => AR.test(o)), `${s.id} objectives are Arabic`);
      assert.ok(AR.test(s.kind === "investigation" ? a.incident : a.task), `${s.id} task/incident`);
    }
  });
  test("every check id is translated, with no extras", () => {
    for (const s of SCENARIOS) assert.deepEqual(keys(SCENARIOS_AR[s.id].checks), s.checks.map((c) => c.id).sort(), s.id);
  });
  test("challenges: hints and completion line up", () => {
    for (const s of SCENARIOS.filter((x) => x.kind === "challenge")) {
      assert.equal(SCENARIOS_AR[s.id].hints.length, s.hints.length, s.id);
      assert.ok(SCENARIOS_AR[s.id].hints.every((h) => AR.test(h)), s.id);
      assert.ok(AR.test(SCENARIOS_AR[s.id].completion), s.id);
    }
  });
  test("investigations: evidence, diagnoses, per-phase hints and summary text line up", () => {
    for (const s of INVESTIGATIONS) {
      const a = SCENARIOS_AR[s.id];
      assert.deepEqual(keys(a.evidence), s.evidence.map((e) => e.id).sort());
      assert.deepEqual(keys(a.diagnoses), s.diagnoses.map((d) => d.id).sort());
      for (const d of s.diagnoses) assert.ok(AR.test(a.diagnoses[d.id].label) && AR.test(a.diagnoses[d.id].why), d.id);
      assert.deepEqual(keys(a.hints), keys(s.hints));
      for (const p of Object.keys(s.hints)) assert.equal(a.hints[p].length, s.hints[p].length, p);
      assert.ok(AR.test(a.rootCause));
      assert.deepEqual(keys(a.qualityText), keys(s.qualityText));
    }
  });
  test("Arabic text keeps command names, paths and modes verbatim (so they can still be typed)", () => {
    const must = { tc01: ["chmod 600 deploy_key"], tc03: ["setfacl -m u:alice:r-- report.txt"], tc04: ["setfacl -m u:monitoring:--x /srv/lab/tc04/conf"] };
    for (const [id, snippets] of Object.entries(must)) {
      const joined = SCENARIOS_AR[id].hints.join(" ");
      for (const sn of snippets) assert.ok(joined.includes(sn), `${id}: ${sn}`);
    }
  });
});

describe("scenario UI strings", () => {
  test("all sc.* keys exist in both languages and none is empty", () => {
    const en = Object.keys(DICT.en).filter((k) => k.startsWith("sc."));
    assert.ok(en.length > 40);
    assert.deepEqual(en.filter((k) => !(k in DICT.ar)), []);
    assert.deepEqual(en.filter((k) => !String(DICT.ar[k]).trim()), []);
    assert.deepEqual(Object.keys(DICT.ar).filter((k) => k.startsWith("sc.") && !(k in DICT.en)), []);
  });
  test("every investigation phase has a label in both languages", () => {
    for (const p of ["briefing", "evidence", "diagnosis", "remediation", "verification", "complete"]) {
      assert.ok(DICT.en[`sc.phase.${p}`] && DICT.ar[`sc.phase.${p}`], p);
    }
  });
});
