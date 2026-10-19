/**
 * tests/regression/static-site.test.js
 * Static checks on what actually ships: the CSP is present and the page obeys
 * it, every local file index.html references exists, and the version number is
 * the same everywhere. None of this needs a browser.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const root = new URL("../../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const html = read("index.html");

describe("Content-Security-Policy", () => {
  const meta = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/);
  const policy = meta ? meta[1] : "";
  const directive = (name) => (policy.split(";").map((d) => d.trim()).find((d) => d.startsWith(name + " ")) || "");

  test("a CSP meta tag exists and is the first thing after <meta charset>", () => {
    assert.ok(meta, "no CSP <meta> found");
    const head = html.slice(html.indexOf("<head>"));
    assert.ok(head.indexOf("Content-Security-Policy") < head.indexOf("<script"), "CSP must precede every script");
  });
  test("scripts: same-origin only, no unsafe-inline / unsafe-eval", () => {
    const s = directive("script-src");
    assert.equal(s, "script-src 'self'");
  });
  test("plugins, <base> and form posts are locked down; no network requests", () => {
    assert.ok(directive("object-src").includes("'none'"));
    assert.ok(directive("base-uri").includes("'none'"));
    assert.ok(directive("form-action").includes("'none'"));
    assert.ok(directive("connect-src").includes("'none'"));
  });
  test("no inline <script> bodies and no inline event handlers in index.html", () => {
    const inline = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].filter(([, attrs, body]) => !/\bsrc=/.test(attrs) || body.trim());
    assert.deepEqual(inline.map((m) => m[0].slice(0, 60)), []);
    assert.equal(/\son[a-z]+\s*=/i.test(html.replace(/<style[\s\S]*?<\/style>/g, "")), false, "inline on*= handler found");
    assert.equal(/javascript:/i.test(html), false);
  });
  test("every external origin the page loads from is allowed by the policy", () => {
    const origins = new Set();
    for (const m of html.matchAll(/<(?:link|script|img)\b[^>]*\b(?:href|src)="(https?:\/\/[^"/]+)/g)) origins.add(m[1]);
    // preconnect hints don't load content, but fonts.googleapis.com / fonts.gstatic.com must be allowed for the stylesheet + fonts
    for (const o of origins) assert.ok(policy.includes(o), `${o} is loaded but not in the CSP`);
    assert.ok(policy.includes("https://fonts.googleapis.com") && policy.includes("https://fonts.gstatic.com"));
  });
  test("app code has no eval / new Function / inline-handler templates", () => {
    for (const f of ["terminal.js", "app.js", "challenges.js", "labs.js", "quiz.js", "learn.js", "progress.js", "filesystem.js"]) {
      const src = read(`assets/js/${f}`);
      assert.equal(/\beval\s*\(|new Function\s*\(|\son(click|error|load)\s*=\s*\\?["']/.test(src), false, f);
    }
  });
});

describe("referenced local files exist", () => {
  test("every local href/src in index.html resolves to a real file", () => {
    const refs = [...html.matchAll(/\b(?:href|src)="((?!https?:|data:|#|mailto:)[^"]+)"/g)].map((m) => m[1].split("#")[0].split("?")[0]).filter(Boolean);
    assert.ok(refs.length >= 10);
    assert.deepEqual(refs.filter((r) => !existsSync(new URL(r, root))), []);
  });
});

describe("version", () => {
  test("package.json and README agree on the version", () => {
    const v = JSON.parse(read("package.json")).version;
    assert.match(v, /^\d+\.\d+\.\d+$/);
    const [maj, min] = v.split(".");
    assert.match(read("README.md"), new RegExp(`\\*\\*v${maj}\\.${min}(\\.\\d+)?\\*\\*`), "README headline version");
    assert.ok(read("CHANGELOG.md").includes(`## v${v}`), `CHANGELOG.md is missing a "## v${v}" section`);
  });
});
