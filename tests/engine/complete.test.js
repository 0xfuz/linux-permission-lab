/**
 * tests/engine/complete.test.js
 * engine/complete.js — the pure Tab-completion logic.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { completeLine } from "../../assets/js/engine/complete.js";

const commands = ["cat", "cd", "chmod", "chown", "chgrp", "ls", "su", "sudo"];
const dirs = {
  "": [{ name: "docs", isDir: true }, { name: "deploy.sh", isDir: false }, { name: "notes.txt", isDir: false }, { name: ".bashrc", isDir: false }],
  "docs/": [{ name: "readme.md", isDir: false }, { name: "report.pdf", isDir: false }],
  "/etc/": [{ name: "passwd", isDir: false }, { name: "shadow", isDir: false }],
};
const listDir = (d) => dirs[d] || [];
const run = (line) => completeLine(line, { commands, listDir });

describe("commands", () => {
  test("a unique prefix completes and gains a trailing space", () => {
    assert.deepEqual(run("ls"), { line: "ls ", candidates: [] });
    assert.deepEqual(run("ch"), { line: "ch", candidates: ["chgrp", "chmod", "chown"] });
  });
  test("ambiguous prefix extends to the longest common prefix", () => {
    assert.equal(run("chm").line, "chmod ");
    assert.equal(run("s").line, "su");
    assert.deepEqual(run("su").candidates, ["su", "sudo"]);
  });
  test("empty input and unknown prefixes do nothing", () => {
    assert.deepEqual(run(""), { line: "", candidates: [] });
    assert.deepEqual(run("zzz"), { line: "zzz", candidates: [] });
  });
});

describe("paths", () => {
  test("unique file completes with a space, unique directory with a slash", () => {
    assert.equal(run("cat no").line, "cat notes.txt ");
    assert.equal(run("cd do").line, "cd docs/");
  });
  test("completes inside a directory part", () => {
    assert.equal(run("cat docs/rea").line, "cat docs/readme.md ");
    assert.equal(run("cat /etc/sh").line, "cat /etc/shadow ");
  });
  test("ambiguous: common prefix kept, candidates listed (dirs marked with /)", () => {
    const r = run("cat docs/re");
    assert.equal(r.line, "cat docs/re");
    assert.deepEqual(r.candidates, ["readme.md", "report.pdf"]);
    assert.deepEqual(run("cat d").candidates, ["deploy.sh", "docs/"]);
  });
  test("dotfiles are offered only when the prefix starts with a dot", () => {
    assert.equal(run("cat ").candidates.includes(".bashrc"), false);
    assert.equal(run("cat .b").line, "cat .bashrc ");
  });
  test("an unlistable directory yields no completion", () => {
    assert.deepEqual(run("cat nope/x"), { line: "cat nope/x", candidates: [] });
  });
});

describe("safety", () => {
  test("lines with quotes or backslashes are never touched", () => {
    for (const l of ['cat "no', "cat 'no", "cat no\\"]) assert.deepEqual(run(l), { line: l, candidates: [] });
  });
  test("names containing whitespace or quotes are never offered", () => {
    const odd = { "": [{ name: "my file", isDir: false }, { name: "it's", isDir: false }, { name: "mine", isDir: false }] };
    const r = completeLine("cat m", { commands, listDir: (d) => odd[d] || [] });
    assert.equal(r.line, "cat mine ");
  });
});
