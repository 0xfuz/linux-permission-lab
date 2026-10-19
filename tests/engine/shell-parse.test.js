/**
 * tests/engine/shell-parse.test.js — engine/shell-parse.js (pure, no DOM)
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { tokenize, nameProblem } from "../../assets/js/engine/shell-parse.js";

const ok = (line) => {
  const r = tokenize(line);
  assert.equal(r.ok, true, `expected "${line}" to tokenize, got: ${r.error}`);
  return r.tokens;
};

describe("tokenize: plain words", () => {
  test("splits on any whitespace and ignores leading/trailing space", () => {
    assert.deepEqual(ok("  chmod   755\tfile  "), ["chmod", "755", "file"]);
  });
  test("empty and whitespace-only lines give no tokens", () => {
    assert.deepEqual(ok(""), []);
    assert.deepEqual(ok("   "), []);
  });
});

describe("tokenize: quoting", () => {
  test("double quotes keep spaces inside one argument", () => {
    assert.deepEqual(ok('touch "my file"'), ["touch", "my file"]);
  });
  test("single quotes are fully literal (no escapes)", () => {
    assert.deepEqual(ok("touch 'a\\b \"c\"'"), ["touch", 'a\\b "c"']);
  });
  test("backslash-escaped quote and backslash inside double quotes", () => {
    assert.deepEqual(ok('echo "say \\"hi\\" \\\\ ok"'), ["echo", 'say "hi" \\ ok']);
  });
  test("a backslash outside quotes escapes the next character (incl. a space)", () => {
    assert.deepEqual(ok("touch my\\ file"), ["touch", "my file"]);
  });
  test("adjacent quoted and unquoted pieces join into one word", () => {
    assert.deepEqual(ok('a"b c"d'), ["ab cd"]);
  });
  test("an empty quoted string is a real empty argument", () => {
    assert.deepEqual(ok('touch ""'), ["touch", ""]);
    assert.deepEqual(ok("touch ''"), ["touch", ""]);
  });
  test("the other quote character is literal inside a quote", () => {
    assert.deepEqual(ok(`touch "it's"`), ["touch", "it's"]);
    assert.deepEqual(ok(`touch 'say "x"'`), ["touch", 'say "x"']);
  });
});

describe("tokenize: errors", () => {
  test("unterminated quotes are reported, not silently accepted", () => {
    assert.equal(tokenize('touch "abc').ok, false);
    assert.equal(tokenize("touch 'abc").ok, false);
    assert.match(tokenize('touch "abc').error, /unmatched/);
  });
  test("a trailing backslash is an error", () => {
    assert.equal(tokenize("touch abc\\").ok, false);
  });
});

describe("nameProblem", () => {
  test("accepts ordinary names, including spaces, dots and quotes", () => {
    for (const n of ["notes.txt", ".hidden", "my file", "it's", "日本語", "ملف.txt"]) {
      assert.equal(nameProblem(n), null, n);
    }
  });
  test("rejects empty, dot entries and over-long names", () => {
    assert.ok(nameProblem(""));
    assert.ok(nameProblem("."));
    assert.ok(nameProblem(".."));
    assert.ok(nameProblem("a".repeat(256)));
    assert.equal(nameProblem("a".repeat(255)), null);
  });
  test("rejects HTML-significant and control characters", () => {
    for (const n of ["<b>", "a>b", "a&b", 'a"b', "a\u0000b", "a\nb", "a\u007fb"]) {
      assert.ok(nameProblem(n), JSON.stringify(n));
    }
  });
});
