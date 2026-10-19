/**
 * tests/regression/terminal-commands-data.test.js
 * The Cheat Sheet's "All terminal commands" table is built from
 * TERMINAL_COMMANDS. This checks the data itself — shape, uniqueness,
 * valid categories — and, separately, that it hasn't drifted from the
 * terminal's own dispatch table (every command the terminal actually
 * understands appears here too).
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TERMINAL_COMMANDS, TERMINAL_COMMAND_CATEGORIES } from "../../assets/js/terminal-commands-data.js";

describe("shape", () => {
  test("every row has a non-empty id, category, cmd and desc", () => {
    for (const r of TERMINAL_COMMANDS) {
      assert.ok(r.id && r.id.length, "missing id");
      assert.ok(r.category && r.category.length, `${r.id}: missing category`);
      assert.ok(r.cmd && r.cmd.length, `${r.id}: missing cmd`);
      assert.ok(r.desc && r.desc.length, `${r.id}: missing desc`);
    }
  });
  test("ids are unique", () => {
    const ids = TERMINAL_COMMANDS.map((r) => r.id);
    assert.equal(new Set(ids).size, ids.length);
  });
  test("every row's category exists in TERMINAL_COMMAND_CATEGORIES", () => {
    const known = new Set(TERMINAL_COMMAND_CATEGORIES.map((c) => c.id));
    const bad = TERMINAL_COMMANDS.filter((r) => !known.has(r.category)).map((r) => r.id);
    assert.deepEqual(bad, []);
  });
  test("no category is empty", () => {
    const used = new Set(TERMINAL_COMMANDS.map((r) => r.category));
    const empty = TERMINAL_COMMAND_CATEGORIES.filter((c) => !used.has(c.id)).map((c) => c.id);
    assert.deepEqual(empty, []);
  });
});

describe("stays in sync with the terminal's actual dispatch table", () => {
  test("every dispatch command name appears somewhere in a row's cmd text", () => {
    const src = readFileSync(new URL("../../assets/js/terminal.js", import.meta.url), "utf8");
    const dispatchNames = [...src.matchAll(/^\s{4}([a-z]+):\s*\(\)\s*=>/gm)].map((m) => m[1]);
    assert.ok(dispatchNames.length > 30, "sanity check: dispatch scan found suspiciously few commands");
    const haystack = TERMINAL_COMMANDS.map((r) => r.cmd).join(" ");
    // Pure aliases documented inside another row's cmd text rather than getting their own row.
    const aliasesCoveredElsewhere = new Set(["logout"]);
    const missing = dispatchNames.filter((name) => !aliasesCoveredElsewhere.has(name) && !new RegExp(`\\b${name}\\b`).test(haystack));
    assert.deepEqual(missing, []);
  });
});
