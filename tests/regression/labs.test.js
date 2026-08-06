/**
 * tests/regression/labs.test.js
 * Locks in the current behavior of all 11 Labs: their answer-step targets,
 * in order, plus schema invariants. Same purpose as challenges.test.js —
 * a safety net for the Phase 2 content-driven migration.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { LABS } from "../../assets/js/labs-data.js";
import { validateOctalInput } from "../../assets/js/converter.js";

const EXPECTED_ANSWER_TARGETS = {
  lab1: ["600"],
  lab2: ["755", "640"],
  lab3: ["755", "644", "600"],
  lab4: ["644", "640", "640"],
  lab5: ["644", "755"],
  lab6: ["755", "1777"],
  lab7: ["600", "700"],
  lab8: ["4755", "4755"],
  lab9: ["777", "1777"],
  lab10: ["755", "640", "1777"],
  lab11: ["640", "750"],
};

describe("labs regression snapshot", () => {
  test("exactly 11 labs exist — update EXPECTED_ANSWER_TARGETS deliberately if this changes", () => {
    assert.equal(LABS.length, 11);
  });

  test("every lab's answer-step targets match the locked-in snapshot, in order", () => {
    for (const lab of LABS) {
      const actual = lab.steps.filter((s) => s.type === "answer").map((s) => s.target);
      const expected = EXPECTED_ANSWER_TARGETS[lab.id];
      assert.deepEqual(actual, expected, `${lab.id}: answer targets changed`);
    }
  });

  test("no lab id exists outside the snapshot, and vice versa", () => {
    const dataIds = new Set(LABS.map((l) => l.id));
    const snapshotIds = new Set(Object.keys(EXPECTED_ANSWER_TARGETS));
    assert.deepEqual([...dataIds].sort(), [...snapshotIds].sort());
  });
});

describe("labs schema invariants", () => {
  test("every id is unique", () => {
    const ids = LABS.map((l) => l.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  test("every step is either type 'info' or type 'answer'", () => {
    for (const lab of LABS) {
      for (const step of lab.steps) {
        assert.ok(step.type === "info" || step.type === "answer", `${lab.id} has a step with unknown type "${step.type}"`);
      }
    }
  });

  test("every 'answer' step has a valid octal target and a hint", () => {
    for (const lab of LABS) {
      for (const step of lab.steps.filter((s) => s.type === "answer")) {
        assert.equal(validateOctalInput(step.target).valid, true, `${lab.id} has an invalid answer target "${step.target}"`);
        assert.ok(typeof step.hint === "string" && step.hint.length > 0, `${lab.id} has an answer step with no hint`);
      }
    }
  });

  test("every 'info' step has a non-empty note", () => {
    for (const lab of LABS) {
      for (const step of lab.steps.filter((s) => s.type === "info")) {
        assert.ok(typeof step.note === "string" && step.note.length > 0, `${lab.id} has an info step with no note`);
      }
    }
  });

  test("every lab has at least one step, and every step has a non-empty prompt", () => {
    for (const lab of LABS) {
      assert.ok(lab.steps.length > 0, `${lab.id} has no steps`);
      for (const step of lab.steps) {
        assert.ok(typeof step.prompt === "string" && step.prompt.length > 0, `${lab.id} has a step with no prompt`);
      }
    }
  });

  test("difficulty is one of the four known tiers, and xp matches it", () => {
    const expectedXpByDifficulty = { Beginner: 75, Intermediate: 100, Advanced: 150, Expert: 200 };
    for (const lab of LABS) {
      assert.ok(lab.difficulty in expectedXpByDifficulty, `${lab.id} has an unknown difficulty "${lab.difficulty}"`);
      assert.equal(lab.xp, expectedXpByDifficulty[lab.difficulty], `${lab.id} (${lab.difficulty}) has xp=${lab.xp}`);
    }
  });
});
