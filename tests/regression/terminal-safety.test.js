/**
 * tests/regression/terminal-safety.test.js
 * End-to-end through the real runCommand(): quoting works, and nothing a
 * learner types can inject markup into the terminal output (v2.4.1 leaked
 * file names unescaped in ls / tree / find).
 */
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { installDomShim, createContainer, outputText } from "../helpers/dom-shim.js";
import { FS_TREE, findNode } from "../../assets/js/engine/fs-model.js";

installDomShim();
const { runCommand, resetTerminalState } = await import("../../assets/js/terminal.js");

/** Raw HTML the terminal produced for the given commands (prompt/echo lines removed). */
function rawRun(...cmds) {
  const c = createContainer();
  const html = [];
  for (const cmd of cmds) {
    const before = c.children.length;
    runCommand(cmd, c);
    html.push(...c.children.slice(before + 1).map((n) => n.innerHTML));
  }
  return html.join("\n");
}
const text = (...cmds) => {
  const c = createContainer();
  let last = "";
  for (const cmd of cmds) {
    const before = c.children.length;
    runCommand(cmd, c);
    last = outputText({ children: c.children.slice(before + 1) });
  }
  return last;
};

beforeEach(() => resetTerminalState());

describe("quoting in real commands", () => {
  test('touch "name with spaces" creates ONE file with that exact name', () => {
    text("cd /tmp");
    const out = text('touch "qa test file"');
    assert.match(out, /created \/tmp\/qa test file/);
    assert.ok(findNode(FS_TREE, "/tmp/qa test file"));
    text('rm "qa test file"');
    assert.equal(findNode(FS_TREE, "/tmp/qa test file"), null);
  });

  test("backslash-escaped spaces work the same way", () => {
    text("cd /tmp");
    text("touch qa\\ escaped\\ file");
    assert.ok(findNode(FS_TREE, "/tmp/qa escaped file"));
    text("rm qa\\ escaped\\ file");
  });

  test("an unterminated quote prints an error and runs nothing", () => {
    const before = JSON.stringify(findNode(FS_TREE, "/tmp").children.map((c) => c.name));
    const out = text('touch "oops');
    assert.match(out, /unmatched/);
    assert.equal(JSON.stringify(findNode(FS_TREE, "/tmp").children.map((c) => c.name)), before);
  });

  test("a line of only quotes/whitespace doesn't crash", () => {
    assert.doesNotThrow(() => runCommand('""', createContainer()));
  });
});

describe("names that could inject markup are refused", () => {
  const payloads = ["<b>x", "<img src=x onerror=alert(1)>", "a&b", 'a"b'];

  for (const name of payloads) {
    test(`touch / mkdir refuse ${JSON.stringify(name)}`, () => {
      text("cd /tmp");
      assert.match(text(`touch '${name}'`), /invalid name/);
      assert.match(text(`mkdir '${name}'`), /invalid name/);
      assert.equal(findNode(FS_TREE, `/tmp/${name}`), null);
    });
  }

  test("mv and cp refuse an unsafe destination name and leave the source alone", () => {
    text("cd /tmp");
    text("touch qa-src");
    assert.match(text("mv qa-src '<i>x'"), /invalid name/);
    assert.match(text("cp qa-src '<i>x'"), /invalid name/);
    assert.ok(findNode(FS_TREE, "/tmp/qa-src"));
    assert.equal(findNode(FS_TREE, "/tmp/<i>x"), null);
    text("rm qa-src");
  });

  test("ln -s refuses an unsafe link name", () => {
    text("cd /tmp");
    assert.match(text("ln -s /etc/hostname '<u>x'"), /invalid name/);
  });
});

describe("defence in depth: output never contains foreign tags", () => {
  const TAG = /<\/?(?!span\b)[a-z][^>]*>/i;

  test("a symlink TARGET (stored verbatim, may hold anything) is escaped in ls -l, stat and tree", () => {
    text("cd /tmp");
    text("ln -s '<img src=x onerror=alert(1)>' qa-link");
    for (const cmd of ["ls -l", "stat qa-link", "tree /tmp"]) {
      const html = rawRun(cmd);
      assert.ok(!TAG.test(html), `${cmd} leaked a tag: ${html}`);
    }
    text("rm qa-link");
  });

  test("a node planted straight into the tree (bypassing validation) is still neutralised by printLine", () => {
    const tmp = findNode(FS_TREE, "/tmp");
    const evil = { name: "<img src=x onerror=alert(1)>", path: "/tmp/<img src=x onerror=alert(1)>", isDir: false, octal: "644", owner: "user", group: "user", note: "", acl: [] };
    tmp.children.push(evil);
    try {
      for (const cmd of ["ls /tmp", "ls -l /tmp", "ls -la /tmp", "tree /tmp", "find img", "stat '/tmp/<img src=x onerror=alert(1)>'"]) {
        const html = rawRun(cmd);
        assert.ok(!TAG.test(html), `${cmd} leaked a tag: ${html}`);
      }
    } finally {
      tmp.children = tmp.children.filter((c) => c !== evil);
    }
  });

  test("echoed command text and 'command not found' are escaped", () => {
    const html = rawRun("<script>alert(1)</script>");
    assert.ok(!/<script/i.test(html));
  });
});
