/**
 * tests/engine/permissions.test.js
 * Covers assets/js/converter.js — the single source of truth for
 * octal/symbolic/triad permission math that every other module imports.
 * Pure functions, no DOM, no extraction needed to test directly.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  triad, triadToBinary, triadToOctalDigit, triadToSymbol,
  defaultPermissionState, stateToSymbolic, stateToOctal,
  octalToState, symbolicToState,
  validateOctalInput, validateSymbolicInput,
} from "../../assets/js/converter.js";

describe("triad helpers", () => {
  test("triadToBinary", () => {
    assert.equal(triadToBinary(triad(true, false, true)), "101");
    assert.equal(triadToBinary(triad(false, false, false)), "000");
    assert.equal(triadToBinary(triad(true, true, true)), "111");
  });

  test("triadToOctalDigit", () => {
    assert.equal(triadToOctalDigit(triad(true, true, true)), 7);
    assert.equal(triadToOctalDigit(triad(true, false, false)), 4);
    assert.equal(triadToOctalDigit(triad(false, true, false)), 2);
    assert.equal(triadToOctalDigit(triad(false, false, true)), 1);
    assert.equal(triadToOctalDigit(triad(false, false, false)), 0);
  });

  test("triadToSymbol", () => {
    assert.equal(triadToSymbol(triad(true, true, true)), "rwx");
    assert.equal(triadToSymbol(triad(true, false, true)), "r-x");
    assert.equal(triadToSymbol(triad(false, false, false)), "---");
  });
});

describe("stateToSymbolic", () => {
  test("plain file, no special bits", () => {
    const state = octalToState("755", false);
    assert.equal(stateToSymbolic(state), "-rwxr-xr-x");
  });

  test("directory prefix", () => {
    const state = octalToState("755", true);
    assert.equal(stateToSymbolic(state)[0], "d");
  });

  test("SUID with owner execute -> lowercase s", () => {
    const state = octalToState("4755", false);
    assert.equal(stateToSymbolic(state), "-rwsr-xr-x");
  });

  test("SUID without owner execute -> uppercase S", () => {
    const state = octalToState("4644", false);
    assert.equal(stateToSymbolic(state), "-rwSr--r--");
  });

  test("SGID with group execute -> lowercase s", () => {
    const state = octalToState("2755", false);
    assert.equal(stateToSymbolic(state), "-rwxr-sr-x");
  });

  test("sticky bit with others execute -> lowercase t", () => {
    const state = octalToState("1777", true);
    assert.equal(stateToSymbolic(state), "drwxrwxrwt");
  });

  test("sticky bit without others execute -> uppercase T", () => {
    const state = octalToState("1776", true);
    assert.equal(stateToSymbolic(state), "drwxrwxrwT");
  });
});

describe("stateToOctal", () => {
  test("3-digit when no special bits and forceFourDigit is false", () => {
    assert.equal(stateToOctal(octalToState("755")), "755");
  });

  test("4-digit automatically when a special bit is set", () => {
    assert.equal(stateToOctal(octalToState("4755")), "4755");
  });

  test("forceFourDigit pads a plain mode with a leading 0", () => {
    assert.equal(stateToOctal(octalToState("644"), true), "0644");
  });
});

describe("octalToState / symbolicToState round-trips", () => {
  const cases = ["777", "755", "700", "644", "600", "440", "111", "000", "750", "4755", "2755", "1777", "6750"];

  for (const octal of cases) {
    test(`octal ${octal} round-trips through stateToOctal`, () => {
      const state = octalToState(octal);
      const forceFour = octal.length === 4;
      assert.equal(stateToOctal(state, forceFour), octal);
    });

    test(`octal ${octal} -> symbolic -> back to the same state`, () => {
      const state = octalToState(octal, false);
      const symbolic = stateToSymbolic(state);
      const reparsed = symbolicToState(symbolic);
      assert.deepEqual(reparsed, state);
    });
  }

  test("octalToState preserves isDir as given, independent of the string", () => {
    assert.equal(octalToState("755", true).isDir, true);
    assert.equal(octalToState("755", false).isDir, false);
  });

  test("symbolicToState infers isDir from a leading 'd'", () => {
    assert.equal(symbolicToState("drwxr-xr-x").isDir, true);
    assert.equal(symbolicToState("-rwxr-xr-x").isDir, false);
  });

  test("symbolicToState treats a leading 'l' (symlink) as not a directory", () => {
    assert.equal(symbolicToState("lrwxrwxrwx").isDir, false);
  });
});

describe("validateOctalInput", () => {
  for (const good of ["755", "0755", "4755", "000", "7777"]) {
    test(`accepts "${good}"`, () => assert.equal(validateOctalInput(good).valid, true));
  }
  for (const bad of ["", "75", "75555", "abc", "888", "-1", "7 5 5"]) {
    test(`rejects "${bad}"`, () => assert.equal(validateOctalInput(bad).valid, false));
  }
  test("trims surrounding whitespace before validating", () => {
    assert.equal(validateOctalInput("  755  ").valid, true);
  });
});

describe("validateSymbolicInput", () => {
  for (const good of ["rwxr-xr-x", "rwxrwxrwx", "---------", "rwsr-xr-x", "rwxr-xr-t"]) {
    test(`accepts "${good}"`, () => assert.equal(validateSymbolicInput(good).valid, true));
  }
  for (const bad of ["", "rwx", "rwxr-xr-xx", "zzzzzzzzz"]) {
    test(`rejects "${bad}"`, () => assert.equal(validateSymbolicInput(bad).valid, false));
  }
});

describe("defaultPermissionState", () => {
  test("default file state is 644-shaped (owner rw, group/others read-only)", () => {
    const state = defaultPermissionState(false);
    assert.equal(stateToOctal(state), "644");
  });

  test("default directory state is 755-shaped", () => {
    const state = defaultPermissionState(true);
    assert.equal(stateToOctal(state), "755");
  });
});
