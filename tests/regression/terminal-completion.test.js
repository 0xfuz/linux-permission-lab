/**
 * tests/regression/terminal-completion.test.js
 * Tab completion against the real terminal state: it follows the current
 * directory and user, and never reveals what `ls` itself would refuse to show.
 * Also keeps COMMAND_NAMES in sync with the real dispatch table.
 */
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { installDomShim, createContainer } from "../helpers/dom-shim.js";

installDomShim();
const { runCommand, resetTerminalState, completeInput, COMMAND_NAMES } = await import("../../assets/js/terminal.js");
const exec = (cmd) => runCommand(cmd, createContainer());

beforeEach(() => resetTerminalState());

describe("COMMAND_NAMES", () => {
  test("matches the dispatch table exactly", () => {
    const src = readFileSync(new URL("../../assets/js/terminal.js", import.meta.url), "utf8");
    const dispatchNames = [...src.matchAll(/^\s{4}([a-z]+):\s*\(\)\s*=>/gm)].map((m) => m[1]);
    assert.deepEqual([...COMMAND_NAMES].sort(), [...dispatchNames].sort());
  });
  test("completing a command name works end-to-end", () => {
    assert.equal(completeInput("systemc").line, "systemctl ");
  });
});

describe("path completion in the live filesystem", () => {
  test("follows the current directory", () => {
    exec("cd /etc");
    assert.equal(completeInput("cat pass").line, "cat passwd ");
  });
  test("absolute paths work from anywhere", () => {
    assert.equal(completeInput("cat /etc/pass").line, "cat /etc/passwd ");
  });
  test("a directory the user cannot read lists nothing", () => {
    exec("su alice");
    const r = completeInput("ls /root/");
    assert.equal(r.line, "ls /root/");
    assert.deepEqual(r.candidates, []);
  });
});
