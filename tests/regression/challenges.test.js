/**
 * tests/regression/challenges.test.js
 * Locks in the current behavior of all 88 Challenges so a future refactor
 * (in particular the Phase 2 content-driven schema migration) can't
 * silently change an answer key, drop an entry, or introduce an invalid
 * target. The id->target snapshot below was generated directly from
 * challenges-data.js at the time this test was written — if you
 * deliberately change a challenge's answer, update the snapshot in the
 * same commit as a conscious decision, not as an accidental side effect.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { CHALLENGES } from "../../assets/js/challenges-data.js";
import { validateOctalInput } from "../../assets/js/converter.js";

const EXPECTED_TARGETS = {
  b01: "600", b02: "755", b03: "644", b04: "644", b05: "600", b06: "640", b07: "644", b08: "700",
  b09: "600", b10: "444", b11: "644", b12: "700", b13: "664", b14: "755", b15: "640", b16: "750",
  b17: "644", b18: "600", b19: "750", b20: "755", b21: "644", b22: "750",
  i01: "640", i02: "770", i03: "440", i04: "770", i05: "755", i06: "640", i07: "660", i08: "770",
  i09: "770", i10: "750", i11: "664", i12: "700", i13: "750", i14: "444", i15: "750", i16: "755",
  i17: "640", i18: "770", i19: "644", i20: "644", i21: "640", i22: "640",
  a01: "4755", a02: "2770", a03: "2755", a04: "4755", a05: "2770", a06: "4750", a07: "700", a08: "2775",
  a09: "755", a10: "2775", a11: "660", a12: "660", a13: "2775", a14: "4750", a15: "640", a16: "644",
  a17: "2775", a18: "4750", a19: "2775", a20: "755", a21: "644", a22: "750",
  e01: "1777", e02: "1770", e03: "4755", e04: "1777", e05: "3770", e06: "4755", e07: "1770", e08: "1777",
  e09: "2750", e10: "1777", e11: "1777", e12: "6755", e13: "755", e14: "664", e15: "640", e16: "640",
  e17: "600", e18: "1770", e19: "660", e20: "755", e21: "440", e22: "440",
};

describe("challenges regression snapshot", () => {
  test("exactly 88 challenges exist — update EXPECTED_TARGETS deliberately if this changes", () => {
    assert.equal(CHALLENGES.length, 88);
  });

  test("every challenge's target matches the locked-in snapshot", () => {
    const mismatches = [];
    for (const c of CHALLENGES) {
      const expected = EXPECTED_TARGETS[c.id];
      if (expected === undefined) { mismatches.push(`${c.id}: not in snapshot (new challenge?)`); continue; }
      if (c.target !== expected) mismatches.push(`${c.id}: expected ${expected}, got ${c.target}`);
    }
    assert.deepEqual(mismatches, []);
  });

  test("no challenge id exists that isn't covered by the snapshot, and vice versa", () => {
    const dataIds = new Set(CHALLENGES.map((c) => c.id));
    const snapshotIds = new Set(Object.keys(EXPECTED_TARGETS));
    assert.deepEqual([...dataIds].sort(), [...snapshotIds].sort());
  });
});

describe("challenges schema invariants", () => {
  test("every id is unique", () => {
    const ids = CHALLENGES.map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  test("every target is a valid octal string", () => {
    for (const c of CHALLENGES) {
      assert.equal(validateOctalInput(c.target).valid, true, `${c.id} has an invalid target "${c.target}"`);
    }
  });

  test("every tier is one of the four known values", () => {
    const validTiers = new Set(["Beginner", "Intermediate", "Advanced", "Expert"]);
    for (const c of CHALLENGES) {
      assert.ok(validTiers.has(c.tier), `${c.id} has an unknown tier "${c.tier}"`);
    }
  });

  test("every challenge has at least one hint and a non-empty explanation", () => {
    for (const c of CHALLENGES) {
      assert.ok(Array.isArray(c.hints) && c.hints.length > 0, `${c.id} has no hints`);
      assert.ok(typeof c.explanation === "string" && c.explanation.length > 0, `${c.id} has no explanation`);
    }
  });

  test("xp is a positive number consistent with its tier", () => {
    const expectedXpByTier = { Beginner: 50, Intermediate: 100, Advanced: 150, Expert: 200 };
    for (const c of CHALLENGES) {
      assert.equal(c.xp, expectedXpByTier[c.tier], `${c.id} (${c.tier}) has xp=${c.xp}, expected ${expectedXpByTier[c.tier]}`);
    }
  });

  test("each tier has exactly 22 challenges", () => {
    const counts = {};
    for (const c of CHALLENGES) counts[c.tier] = (counts[c.tier] || 0) + 1;
    for (const tier of ["Beginner", "Intermediate", "Advanced", "Expert"]) {
      assert.equal(counts[tier], 22, `${tier} has ${counts[tier]} challenges, expected 22`);
    }
  });
});
