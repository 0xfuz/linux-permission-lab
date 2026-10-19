/**
 * tests/regression/terminal-help-flag.test.js
 * `<command> --help` / `-h` — a single generic check in dispatch() (not
 * per-handler code) that shows a command's own usage, pulled from the exact
 * same TERMINAL_COMMANDS data the Cheat Sheet's reference table renders
 * from, so the two can never say different things about what a flag does.
 */
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { installDomShim, createContainer, outputText } from "../helpers/dom-shim.js";
import { TERMINAL_COMMANDS } from "../../assets/js/terminal-commands-data.js";

installDomShim();
const { runCommand, resetTerminalState } = await import("../../assets/js/terminal.js");

function run(...cmds) {
  const c = createContainer();
  const outs = cmds.map((cmd) => {
    const before = c.children.length;
    runCommand(cmd, c);
    return outputText({ children: c.children.slice(before + 1) });
  });
  return outs.length === 1 ? outs[0] : outs;
}

beforeEach(() => resetTerminalState());

describe("--help / -h", () => {
  test("shows the command's own cheat-sheet row, not the full help list", () => {
    const out = run("ls --help");
    assert.match(out, /ls \/ ls -a \/ ls -l \/ ls -la/);
    assert.match(out, /List directory contents/);
    assert.doesNotMatch(out, /Available commands/, "must not fall through to the generic help list");
  });
  test("-h is equivalent to --help", () => {
    assert.equal(run("whoami -h"), run("whoami --help"));
  });
  test("a command with more than one documented form shows all of them", () => {
    const out = run("find --help");
    assert.match(out, /find <name>/);
    assert.match(out, /find \[path\] -perm/);
  });
  test("sudo --help shows both the main form and sudo -l", () => {
    const out = run("sudo --help");
    assert.match(out, /sudo \[-u user\] <cmd>/);
    assert.match(out, /sudo -l/);
  });
  test("aliases resolve to the row that documents them: netstat -> ss, logout -> exit, vim -> nano", () => {
    assert.equal(run("netstat --help"), run("ss --help"));
    assert.match(run("logout --help"), /Leave the current su\/sudo shell/);
    assert.equal(run("vim --help"), run("nano --help"));
  });
  test("shows the requires line when the command has one, omits it when it doesn't", () => {
    assert.match(run("dmesg --help"), /requires: root/);
    assert.doesNotMatch(run("pwd --help"), /requires:/);
  });
  test("bypasses the command's own permission gate — you can read help without the access it needs", () => {
    const out = run("dmesg --help");
    assert.doesNotMatch(out, /Operation not permitted/);
    assert.match(out, /kernel ring buffer/);
  });
  test("an unrecognized command still says command-not-found, not a help lookup", () => {
    assert.match(run("frobnicate --help"), /command not found: frobnicate/);
  });
  test("every dispatchable command name resolves to at least one row (no silent gaps)", () => {
    const names = [...new Set(TERMINAL_COMMANDS.flatMap((r) => r.cmd.split(" / ").map((v) => v.trim().split(/\s+/)[0])))];
    for (const name of names) {
      const out = run(`${name} --help`);
      assert.doesNotMatch(out, /No detailed help for/, `row text starting with '${name}' didn't resolve back to itself`);
    }
  });
});
