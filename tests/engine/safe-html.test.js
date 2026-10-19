/**
 * tests/engine/safe-html.test.js — engine/safe-html.js (pure, no DOM)
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { escapeHTML, sanitizeTerminalHTML } from "../../assets/js/engine/safe-html.js";

describe("escapeHTML", () => {
  test("escapes the five HTML-significant characters", () => {
    assert.equal(escapeHTML(`<a href="x">&'</a>`), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;");
  });
  test("coerces non-strings instead of throwing", () => {
    assert.equal(escapeHTML(42), "42");
    assert.equal(escapeHTML(undefined), "undefined");
  });
});

describe("sanitizeTerminalHTML", () => {
  test("keeps the terminal's own colour spans untouched", () => {
    const html = '<span class="t-err">denied</span> <span class="t-path">/tmp</span>';
    assert.equal(sanitizeTerminalHTML(html), html);
  });
  test("keeps a bare <span> pair", () => {
    assert.equal(sanitizeTerminalHTML("<span>x</span>"), "<span>x</span>");
  });
  test("escapes script / img / event-handler payloads", () => {
    for (const payload of [
      "<script>alert(1)</script>",
      "<img src=x onerror=alert(1)>",
      '<svg/onload=alert(1)>',
      '<span onclick="alert(1)">x</span>',
      '<span class="evil">x</span>',
      '<span class="t-err" onmouseover="x()">x</span>',
    ]) {
      const out = sanitizeTerminalHTML(payload);
      assert.ok(!/<(script|img|svg)/i.test(out), out);
      assert.ok(!/<span[^>]*(onclick|onmouseover|class="evil")/i.test(out), out);
    }
  });
  test("escapes an unterminated tag and stray angle brackets", () => {
    assert.equal(sanitizeTerminalHTML("a < b"), "a &lt; b");
    assert.equal(sanitizeTerminalHTML("<img src=x"), "&lt;img src=x");
    assert.equal(sanitizeTerminalHTML("a > b"), "a &gt; b");
  });
  test("leaves already-escaped text alone", () => {
    assert.equal(sanitizeTerminalHTML("&lt;file&gt; -&gt; x"), "&lt;file&gt; -&gt; x");
  });
});
