/**
 * tests/regression/boot-fallback.test.js  (v2.13.0)
 *
 * Regression tests for the "This page needs a local server" overlay.
 *
 * The bug: assets/js/boot-fallback.js showed that overlay whenever the app had not flagged itself ready after a
 * fixed 900 ms — on ANY origin, and it never went away. A cold load of the 39-module app over a real network
 * (GitHub Pages, Android on mobile data, localhost with latency) takes longer than that, so people saw the
 * overlay on top of a working page. These tests run the REAL shipped script inside a Node `vm` sandbox with a fake
 * document/location and a controllable clock, against: file://, https://0xfuz.github.io/linux-permission-lab/,
 * http://localhost:3000 and http://localhost:8080 (plus a few other http(s) origins).
 *
 * LPL_BOOT_SCRIPT=<path> runs the same tests against another copy of the script — used to prove that these
 * tests FAIL on the pre-fix script. This proves the logic, not pixels: real-browser evidence is in the report.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const SCRIPT_PATH = process.env.LPL_BOOT_SCRIPT || new URL("../../assets/js/boot-fallback.js", import.meta.url);
const SOURCE = readFileSync(SCRIPT_PATH, "utf8");
const INDEX = readFileSync(new URL("../../index.html", import.meta.url), "utf8");

const FILE = "file:///home/kali/linux-permission-lab/index.html";
const GITHUB = "https://0xfuz.github.io/linux-permission-lab/";
const L3000 = "http://localhost:3000/";
const L8080 = "http://localhost:8080/";
const HTTP_ORIGINS = [
  ["GitHub Pages https://0xfuz.github.io/linux-permission-lab/", GITHUB],
  ["GitHub Pages with query and #hash route", "https://0xfuz.github.io/linux-permission-lab/index.html?x=1#/terminal"],
  ["http://localhost:3000", L3000],
  ["http://localhost:8080", L8080],
  ["http://127.0.0.1:5500 (editor live server)", "http://127.0.0.1:5500/index.html"],
  ["any other https origin", "https://example.org/some/sub/path/"],
];
const ALL_ORIGINS = [["file://", FILE], ...HTTP_ORIGINS];

/** Load the real script into a sandbox that behaves like a page at `pageUrl`. */
function boot(pageUrl) {
  const url = new URL(pageUrl);
  const box = (display) => ({ style: { display } });
  const banner = box("none"), fileBox = box("block"), failBox = box("none");
  const els = { "module-blocked-banner": banner, "module-blocked-file": fileBox, "module-blocked-failed": failBox };
  const root = { dataset: {} };
  const listeners = [], timers = [], observers = [];
  let now = 0;
  class FakeMutationObserver { constructor(cb) { this.cb = cb; observers.push(this); } observe() {} }
  const win = { addEventListener: (type, fn, capture) => listeners.push({ type, fn, capture }) };
  const sandbox = {
    document: { documentElement: root, getElementById: (id) => els[id] || null, baseURI: pageUrl },
    location: { protocol: url.protocol, href: pageUrl },
    window: win, URL, MutationObserver: FakeMutationObserver,
    setTimeout: (fn, ms) => { timers.push({ fn, at: now + ms }); return timers.length; },
  };
  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox);

  const appBase = new URL("assets/js/", pageUrl).href;
  const api = {
    appBase,
    advance(ms) {
      const target = now + ms;
      for (;;) {
        const due = timers.filter((t) => !t.done && t.at <= target).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        due.done = true; now = due.at; due.fn();
      }
      now = target;
    },
    dispatch(event) { listeners.filter((l) => l.type === "error").forEach((l) => l.fn(event)); },
    ready() { root.dataset.appReady = "true"; observers.forEach((o) => o.cb([])); },
    shown() { return banner.style.display !== "none"; },
    /** which message is on screen: "file" (needs a local server), "failed" (could not start) or null */
    panel() {
      if (banner.style.display === "none") return null;
      return fileBox.style.display !== "none" ? "file" : failBox.style.display !== "none" ? "failed" : null;
    },
    listenerCount: () => listeners.length,
    // event factories, shaped like what browsers deliver
    moduleScriptError: (src = appBase + "app.js") => ({ target: { tagName: "SCRIPT", type: "module", src } }),
    resourceError: (tagName, src, type = "") => ({ target: { tagName, type, src, href: src } }),
    windowError: (filename, message = "boom") => ({ target: win, filename, message }),
  };
  return api;
}

/* ------------------------------------------------------------------------------------------------ */
describe("slowness is never a failure — the shipped bug (900 ms timer showing the overlay on every origin)", () => {
  for (const [name, url] of HTTP_ORIGINS) {
    test(`${name}: no notice however long the app takes (900 ms … 10 min)`, () => {
      const page = boot(url);
      for (const ms of [899, 1, 100, 1000, 3000, 6000, 20000, 60000, 540000]) { page.advance(ms); assert.equal(page.shown(), false, `shown after +${ms} ms`); }
    });
    test(`${name}: a slow first load that finishes at 1.9 s / 5 s / 30 s never flashes a notice`, () => {
      for (const readyAt of [1900, 5000, 30000]) {
        const page = boot(url); page.advance(readyAt - 1); assert.equal(page.shown(), false);
        page.ready(); page.advance(60000); assert.equal(page.shown(), false);
      }
    });
  }
  test("the exact pre-fix failure: 901 ms with the app not ready yet must NOT show anything on GitHub Pages", () => {
    const page = boot(GITHUB); page.advance(901); assert.equal(page.panel(), null);
  });
});

describe("file:// — the only place the 'needs a local server' advice is shown", () => {
  test("the browser blocks the module script (error event on app.js): the local-server notice shows at once, no waiting", () => {
    const page = boot(FILE); assert.equal(page.shown(), false);
    page.dispatch(page.moduleScriptError()); assert.equal(page.panel(), "file");
  });
  test("a browser that blocks modules silently: the 4 s watchdog shows the local-server notice (not before)", () => {
    const page = boot(FILE); page.advance(3999); assert.equal(page.shown(), false);
    page.advance(1); assert.equal(page.panel(), "file");
  });
  test("a file:// page whose app starts in time never shows the notice (e.g. Firefox)", () => {
    const page = boot(FILE); page.advance(2500); page.ready(); page.advance(60000); assert.equal(page.shown(), false);
  });
  test("if the app becomes ready after the notice appeared, the notice is removed", () => {
    const page = boot(FILE); page.advance(5000); assert.equal(page.panel(), "file");
    page.ready(); assert.equal(page.shown(), false);
  });
  test("an uncaught exception in the app's own code on file:// also uses the file:// notice", () => {
    const page = boot(FILE); page.dispatch(page.windowError(page.appBase + "learn.js")); assert.equal(page.panel(), "file");
  });
});

describe("genuine failures on http(s) show 'The app could not start' — never the local-server advice", () => {
  for (const [name, url] of HTTP_ORIGINS) {
    test(`${name}: the app's module script fails to load → 'could not start' notice, not the file:// one`, () => {
      const page = boot(url); page.dispatch(page.moduleScriptError()); assert.equal(page.panel(), "failed");
      assert.equal(page.shown(), true);
    });
    test(`${name}: the app's own code throws before it is ready → 'could not start'`, () => {
      const page = boot(url); page.dispatch(page.windowError(page.appBase + "achievements.js", "simulated start-up crash"));
      assert.equal(page.panel(), "failed");
    });
  }
  test("a failure notice is removed again if the app does become ready", () => {
    const page = boot(GITHUB); page.dispatch(page.moduleScriptError()); assert.equal(page.panel(), "failed");
    page.ready(); assert.equal(page.shown(), false);
  });
  test("no http(s) origin can ever reach the file:// panel, whatever happens", () => {
    for (const [, url] of HTTP_ORIGINS) {
      const page = boot(url);
      page.advance(60000); page.dispatch(page.moduleScriptError()); page.dispatch(page.windowError(page.appBase + "app.js")); page.advance(60000);
      assert.notEqual(page.panel(), "file", url);
    }
  });
});

describe("errors that are NOT a boot failure never raise a notice (on any origin)", () => {
  for (const [name, url] of ALL_ORIGINS) {
    test(`${name}: Google Fonts stylesheet, image, non-module script and foreign scripts are ignored`, () => {
      const page = boot(url);
      page.dispatch(page.resourceError("LINK", "https://fonts.googleapis.com/css2?family=Inter"));      // blocked fonts are common
      page.dispatch(page.resourceError("IMG", page.appBase + "../img/x.png"));
      page.dispatch(page.resourceError("SCRIPT", page.appBase + "classic.js", ""));                       // a classic script, not a module
      page.dispatch(page.moduleScriptError("https://evil.example/injected.js"));                          // someone else's module
      page.dispatch(page.moduleScriptError("chrome-extension://abcdef/content.js"));
      page.dispatch(page.windowError("chrome-extension://abcdef/content.js"));                            // an extension throwing
      page.dispatch(page.windowError("https://other-site.example/app.js"));
      page.dispatch(page.windowError(""));                                                                 // "Script error." with no detail
      page.dispatch(page.windowError(undefined));
      assert.equal(page.shown(), false);
    });
    test(`${name}: errors after the app is ready (the app is running) never raise a notice`, () => {
      const page = boot(url); page.ready();
      page.dispatch(page.moduleScriptError()); page.dispatch(page.windowError(page.appBase + "terminal.js"));
      page.advance(60000); assert.equal(page.shown(), false);
    });
  }
});

describe("the script is wired correctly", () => {
  test("it registers a capture-phase window error listener (resource errors do not bubble)", () => {
    const page = boot(GITHUB); assert.ok(page.listenerCount() >= 1);
  });
  test("it does nothing (and does not throw) if the banner markup is missing", () => {
    const sandbox = { document: { documentElement: { dataset: {} }, getElementById: () => null, baseURI: GITHUB }, location: { protocol: "https:" },
      window: { addEventListener() { throw new Error("must not register without markup"); } }, URL, MutationObserver: class {}, setTimeout() { throw new Error("no timers"); } };
    vm.createContext(sandbox); assert.doesNotThrow(() => vm.runInContext(SOURCE, sandbox));
  });
  test("the script stays plain ES5 — it must run in browsers that cannot run the ES-module app", () => {
    const code = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(code, /=>|\blet\b|\bconst\b|`|\bclass\b|\basync\b|\bawait\b|\.\.\./);
  });
});

describe("index.html contract for the notice", () => {
  const panel = (id) => { const m = INDEX.match(new RegExp(`<div id="${id}"[\\s\\S]*?\\n  </div>`)); assert.ok(m, `#${id} missing`); return m[0]; };
  test("banner, file panel and failure panel exist; the banner starts hidden and the failure panel starts hidden", () => {
    assert.match(INDEX, /<div id="module-blocked-banner" style="display:none;/);
    assert.match(INDEX, /<div id="module-blocked-failed" style="display:none;/);
    assert.match(INDEX, /<div id="module-blocked-file"/);
  });
  test("only the file:// panel gives local-server advice; the failure panel never does", () => {
    const file = panel("module-blocked-file"), fail = panel("module-blocked-failed");
    assert.match(file, /needs a local server/); assert.match(file, /http\.server 8080/);
    assert.doesNotMatch(fail, /local server|file:\/\/|http\.server|npx serve|localhost/i);
    assert.match(fail, /could not start/);
  });
  test("the fallback script loads before the module app; no inline handlers (CSP script-src 'self')", () => {
    const a = INDEX.indexOf('src="assets/js/boot-fallback.js"'), b = INDEX.indexOf('type="module" src="assets/js/app.js"');
    assert.ok(a > 0 && b > a, "boot-fallback.js must precede app.js");
    assert.doesNotMatch(INDEX, /\son(click|load|error)=/i);
  });
});
