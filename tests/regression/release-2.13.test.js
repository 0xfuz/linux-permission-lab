/**
 * tests/regression/release-2.13.test.js
 * Regression tests for defects found while validating the v2.13.0 working build:
 *   1. version metadata drift (the visible footer said v2.3 while package.json said 2.12.x)
 *   2. SC-01 policy/validator mismatch: the public template must be readable by EVERY account
 *   3. screen-reader announcements for evidence / verification progress
 *   4. report layout guard (label and terminal quote must not share a line)
 */
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { installUiHarness, find, byId, textOf, click, change, buttonByLabel } from "../helpers/ui-harness.js";
import { installLocalStorageShim, resetLocalStorageShim } from "../helpers/storage-shim.js";
import { createContainer } from "../helpers/dom-shim.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const pkg = JSON.parse(read("package.json"));
const V = pkg.version;

const { mountPoint } = installUiHarness();
installLocalStorageShim();
// setLocale() touches <html lang/dir> and static [data-i18n] nodes; a minimal stand-in is enough here.
document.documentElement = { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; } };
document.querySelectorAll = () => [];
const R = "../../assets/js/";
const { runCommand, resetTerminalState, setCommandObserver } = await import(R + "terminal.js");
const S = await import(R + "engine/scenario.js");
const { createInvestigation } = await import(R + "engine/investigation.js");
const { SCENARIOS } = await import(R + "scenarios-data.js");
const { SCENARIOS_AR } = await import(R + "scenarios-data.ar.js");
const UI = await import(R + "scenarios.js");
const { setLocale, DICT } = await import(R + "i18n.js");
const sc01 = SCENARIOS.find((s) => s.id === "sc01");
const mount = mountPoint("scenario-mount"); const live = mountPoint("scenario-live");
UI.initScenarios();

/* ---------------------------------------------------------------- 1. version */
describe("version metadata is consistent", () => {
  const footer = (src) => (src.match(/Linux Permission Lab v[\d.]+|مختبر صلاحيات لينكس v[\d.]+/g) || []);
  test("package.json holds a plain semver and is the single source the other files must match", () => {
    assert.match(V, /^\d+\.\d+\.\d+$/);
  });
  test("the footer fallback in index.html and both i18n footers show exactly the package version", () => {
    const html = footer(read("index.html")); const i18n = footer(read("assets/js/i18n.js"));
    assert.equal(html.length, 1); assert.equal(i18n.length, 2, "one English and one Arabic footer string");
    for (const f of [...html, ...i18n]) assert.ok(f.endsWith(`v${V}`), `${f} should end with v${V}`);
  });
  test("no user-visible markup or UI string mentions any other release label", () => {
    for (const file of ["index.html", "assets/js/i18n.js"]) {
      const labels = read(file).match(/(?<![\w.#-])v\d+\.\d+(\.\d+)?(?![\w.])/g) || [];
      for (const l of labels) assert.equal(l, `v${V}`, `${file} mentions ${l}`);
    }
  });
  test("README headline and 'Latest' line name the package version", () => {
    const r = read("README.md");
    assert.match(r, new RegExp(`\\*\\*v${V.replace(/\./g, "\\.")}\\*\\*`));
    assert.match(r, new RegExp(`Latest: \\*\\*v${V.replace(/\./g, "\\.")}\\*\\*`));
  });
  test("CHANGELOG's newest section is the package version, and sections are unique and strictly descending", () => {
    const heads = [...read("CHANGELOG.md").matchAll(/^## v(\d+)\.(\d+)\.(\d+)/gm)].map((m) => m.slice(1).map(Number));
    assert.equal(heads[0].join("."), V);
    const key = (h) => h[0] * 1e6 + h[1] * 1e3 + h[2];
    for (let i = 1; i < heads.length; i += 1) assert.ok(key(heads[i - 1]) > key(heads[i]), `${heads[i - 1]} before ${heads[i]}`);
  });
  test("no stale 'Unreleased' / work-in-progress marker contradicts the current version label", () => {
    assert.doesNotMatch(read("CHANGELOG.md").split(/^## v2\.12\.1/m)[0], /Unreleased/);
  });
});

/* ------------------------------------------------- 2. template policy gap */
describe("SC-01: the public template must be readable by EVERY account (policy says 'everyone')", () => {
  const D = "/srv/lab/sc01/orbit/config"; const CONF = `${D}/orbit.conf`; const EX = `${D}/orbit.conf.example`;
  const term = createContainer(); const run = (l) => runCommand(l, term);
  const goodFix = () => { run(`sudo chgrp adm ${CONF}`); run(`sudo chmod 640 ${CONF}`); };
  const begin = () => { resetTerminalState(); const i = createInvestigation(sc01); i.start(); setCommandObserver((e) => i.observe(e)); return i; };
  afterEach(() => { setCommandObserver(null); S.unloadScenario(); resetTerminalState(); });

  test("a correct fix on orbit.conf passes with the template untouched", () => {
    begin(); goodFix(); assert.equal(S.evaluateChecks(sc01.checks).ok, true);
  });
  for (const who of ["user", "alice", "monitoring", "www-data"]) {
    test(`an ACL entry denying ${who} the template is rejected even when orbit.conf itself is fixed correctly`, () => {
      begin(); goodFix(); run(`sudo setfacl -m u:${who}:--- ${EX}`);
      const r = S.evaluateChecks(sc01.checks);
      assert.equal(r.ok, false, `denying ${who} the public template must not pass`);
      const f = r.failedRequired.find((x) => x.id === "template-public");
      assert.ok(f, "the template-public check must be the one that fails");
      assert.match(f.detail, new RegExp(who));
    });
  }
  test("a named ACL entry for the template's OWNER has no effect (owner class matches first), so it is correctly not a failure", () => {
    begin(); goodFix(); run(`sudo setfacl -m u:deployer:--- ${EX}`);
    assert.equal(S.evaluateChecks(sc01.checks).ok, true);
  });
  test("making the template private (600) or deleting it is rejected", () => {
    begin(); goodFix(); run(`sudo chmod 600 ${EX}`);
    assert.ok(S.evaluateChecks(sc01.checks).failedRequired.some((x) => x.id === "template-public"));
    begin(); goodFix(); run(`sudo rm ${EX}`);
    assert.ok(S.evaluateChecks(sc01.checks).failedRequired.some((x) => x.id === "template-public"));
  });
  test("English and Arabic labels of the check both say 'everyone/every account', not one account", () => {
    const en = sc01.checks.find((c) => c.id === "template-public").label;
    assert.match(en, /every account/i); assert.doesNotMatch(en, /monitoring can read/);
    assert.match(SCENARIOS_AR.sc01.checks["template-public"], /كل الحسابات/);
  });
});

/* -------------------------------------------- 3. live-region announcements */
describe("SC-01 panel: progress is announced to screen readers", () => {
  const term = createContainer(); const run = (l) => runCommand(l, term);
  const CONF = "/srv/lab/sc01/orbit/config/orbit.conf";
  const card = () => find(mount, (n) => n.className && n.className.split(" ")[0] === "challenge-card").find((c) => textOf(c).includes("the app configuration is readable"));
  beforeEach(() => { resetLocalStorageShim(); resetTerminalState(); setLocale("en"); });
  afterEach(() => { const b = byId(mount, "sc-back"); if (b) click(b); setCommandObserver(null); S.unloadScenario(); resetTerminalState(); setLocale("en"); });
  const begin = () => { click(buttonByLabel(card(), "Open")); click(byId(mount, "sc-start")); };

  test("each evidence item announces 'n / total' until the phase changes", () => {
    begin();
    run("su monitoring"); run(`cat ${CONF}`); run("exit");
    assert.match(live.textContent, /Evidence collected: 1 \/ 4/);
    run(`stat ${CONF}`); assert.match(live.textContent, /Evidence collected: 2 \/ 4/);
    run(`getfacl ${CONF}`); assert.match(live.textContent, /Evidence collected: 3 \/ 4/);
    run("id alice"); assert.equal(live.textContent, "Diagnosis");
  });
  test("re-running a command that adds nothing new does not re-announce", () => {
    begin(); run(`cat ${CONF}`); const first = live.textContent; live.textContent = "";
    run(`cat ${CONF}`); assert.equal(live.textContent, "", `${first} was already announced`);
  });
  test("each verification probe announces 'n / total'", () => {
    begin();
    for (const c of ["su monitoring", `cat ${CONF}`, "exit", `stat ${CONF}`, `getfacl ${CONF}`, "id alice"]) run(c);
    change(find(mount, (n) => n.tag === "input" && n.attrs.value === "file-others")[0]); click(byId(mount, "sc-diagnose"));
    run(`sudo chgrp adm ${CONF}`); run(`sudo chmod 640 ${CONF}`); click(byId(mount, "sc-fixcheck"));
    run("su monitoring"); run(`cat ${CONF}`);
    assert.match(live.textContent, /Verification step done: 1 \/ 2/);
    run("exit"); run("su alice"); run(`cat ${CONF}`);
    assert.equal(live.textContent, "Investigation resolved.");
  });
  test("Arabic strings for the new announcements exist", () => {
    for (const k of ["sc.progress.evidence", "sc.progress.verify"]) { assert.ok(/[\u0600-\u06FF]/.test(DICT.ar[k]), k); assert.ok(DICT.en[k], k); }
  });
});

/* -------------------------------------------------------- 4. layout guard */
describe("scenario CSS: report layout guard (the real check is the browser run)", () => {
  const css = read("assets/css/scenarios.css");
  test("terminal quotes inside the report are blocks, and report headings have separating margin", () => {
    assert.match(css, /\.sc-report\s+\.sc-detail\s*\{[^}]*display:\s*block/);
    assert.match(css, /\.sc-report\s+\.eyebrow\s*\{[^}]*margin:/);
  });
});

/* ------------------------------------------- 5. keyboard focus after re-render */
describe("keyboard focus survives a re-render that removes the focused button", () => {
  test("resolveFocusId keeps a present target, otherwise falls back to the hint button, then Back", () => {
    assert.equal(UI.resolveFocusId("sc-diagnose", (id) => id === "sc-diagnose"), "sc-diagnose");
    assert.equal(UI.resolveFocusId("sc-diagnose", (id) => id === "sc-hint" || id === "sc-back"), "sc-hint");
    assert.equal(UI.resolveFocusId("sc-diagnose", (id) => id !== "sc-diagnose"), "sc-hint", "a present-but-disabled target is reported unusable by the caller");
    assert.equal(UI.resolveFocusId("sc-diagnose", (id) => id === "sc-back"), "sc-back");
    assert.equal(UI.resolveFocusId("sc-diagnose", () => false), null);
    assert.equal(UI.resolveFocusId(null, () => true), null, "no focus request, no focus move");
  });
  test("after a CORRECT diagnosis the Submit button is still rendered but DISABLED (the case that dropped focus to <body>) and a usable fallback exists", () => {
    const CONF = "/srv/lab/sc01/orbit/config/orbit.conf";
    resetLocalStorageShim(); resetTerminalState(); setLocale("en");
    const mount = mountPoint("scenario-mount"); UI.initScenarios();
    const card = find(mount, (n) => n.className && n.className.split(" ")[0] === "challenge-card").find((c) => textOf(c).includes("the app configuration is readable"));
    click(buttonByLabel(card, "Open")); click(byId(mount, "sc-start"));
    const t = createContainer();
    for (const c of ["su monitoring", `cat ${CONF}`, "exit", `stat ${CONF}`, `getfacl ${CONF}`, "id alice"]) runCommand(c, t);
    assert.ok(byId(mount, "sc-diagnose"));
    change(find(mount, (n) => n.tag === "input" && n.attrs.value === "file-others")[0]); click(byId(mount, "sc-diagnose"));
    const submit = byId(mount, "sc-diagnose");
    assert.ok(submit && submit.attrs.disabled !== undefined, "browsers cannot focus a disabled button");
    const hint = byId(mount, "sc-hint");
    assert.ok(hint && hint.attrs.disabled === undefined, "fallback target present and focusable");
    click(byId(mount, "sc-back")); setCommandObserver(null); S.unloadScenario(); resetTerminalState();
  });
});

/* ----------------------------- 6. Reset progress must refresh the scenario list */
describe("Reset progress is reflected in the scenario list without a reload", () => {
  const CONF = "/srv/lab/sc01/orbit/config/orbit.conf";
  const finish = (mount) => {
    const card = find(mount, (n) => n.className && n.className.split(" ")[0] === "challenge-card").find((c) => textOf(c).includes("the app configuration is readable"));
    click(buttonByLabel(card, "Open")); click(byId(mount, "sc-start"));
    const t = createContainer();
    for (const c of ["su monitoring", `cat ${CONF}`, "exit", `stat ${CONF}`, `getfacl ${CONF}`, "id alice"]) runCommand(c, t);
    change(find(mount, (n) => n.tag === "input" && n.attrs.value === "file-others")[0]); click(byId(mount, "sc-diagnose"));
    runCommand(`sudo chgrp adm ${CONF}`, t); runCommand(`sudo chmod 640 ${CONF}`, t); click(byId(mount, "sc-fixcheck"));
    for (const c of ["su monitoring", `cat ${CONF}`, "exit", "su alice", `cat ${CONF}`]) runCommand(c, t);
  };
  const cardOf = (mount) => find(mount, (n) => n.className && n.className.split(" ")[0] === "challenge-card").find((c) => textOf(c).includes("the app configuration is readable"));
  test("the completed tick disappears from the list as soon as progress is reset", async () => {
    const { resetAllProgress } = await import(R + "progress.js");
    const { getScenarioProgress } = await import(R + "scenario-progress.js");
    resetLocalStorageShim(); resetTerminalState(); setLocale("en");
    const mount = mountPoint("scenario-mount"); UI.initScenarios();
    finish(mount);
    assert.ok(getScenarioProgress().sc01);
    click(byId(mount, "sc-back"));
    assert.match(textOf(cardOf(mount)), /✓/, "completed card shows a tick");
    resetAllProgress();
    assert.deepEqual(getScenarioProgress(), {});
    assert.doesNotMatch(textOf(cardOf(mount)), /✓/, "tick must be gone without a reload");
    setCommandObserver(null); S.unloadScenario(); resetTerminalState();
  });
  test("a reset while an investigation is open re-renders without losing the open scenario", async () => {
    const { resetAllProgress } = await import(R + "progress.js");
    resetLocalStorageShim(); resetTerminalState(); setLocale("en");
    const mount = mountPoint("scenario-mount"); UI.initScenarios();
    click(buttonByLabel(cardOf(mount), "Open")); click(byId(mount, "sc-start"));
    resetAllProgress();
    assert.ok(byId(mount, "sc-hint"), "still inside the investigation");
    click(byId(mount, "sc-back")); setCommandObserver(null); S.unloadScenario(); resetTerminalState();
  });
});

/* ------------------------------- 7. light-theme contrast inside the scenario panel */
describe("scenario panel text meets WCAG AA contrast (4.5:1) in the light theme", () => {
  const css = read("assets/css/scenarios.css"); const main = read("assets/css/main.css");
  const lightBlock = main.match(/:root\[data-theme="light"\]\s*\{([^}]*)\}/)[1];
  const token = (name) => lightBlock.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))[1];
  const lum = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  const surfaces = () => [token("bg-inset"), token("bg-panel"), token("bg-base")];
  test("section headings (.eyebrow) use a dark amber that passes on every light surface", () => {
    const m = css.match(/:root\[data-theme="light"\]\s+\.scenario-panel\s+\.eyebrow\s*\{[^}]*color:\s*(#[0-9a-fA-F]{6})/);
    assert.ok(m, "light-theme override for .scenario-panel .eyebrow is missing");
    for (const bg of surfaces()) assert.ok(ratio(m[1], bg) >= 4.5, `${m[1]} on ${bg} = ${ratio(m[1], bg).toFixed(2)}`);
  });
  test("tertiary helper text inside the panel is promoted to the secondary colour, which passes", () => {
    assert.match(css, /:root\[data-theme="light"\]\s+\.scenario-panel\s+\.text-tertiary\s*\{[^}]*color:\s*var\(--text-secondary\)/);
    for (const bg of surfaces()) assert.ok(ratio(token("text-secondary"), bg) >= 4.5, bg);
  });
  test("the global amber heading colour (unchanged, app-wide) is documented as failing, so nobody assumes it passes", () => {
    for (const bg of surfaces()) assert.ok(ratio("#ffb000", bg) < 4.5);
  });
});
