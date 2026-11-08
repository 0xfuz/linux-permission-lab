/**
 * tests/regression/sc01-ui.test.js  (v2.13)
 * SC-01 through the real Scenarios panel controller (DOM harness, not a browser): the full
 * learner flow, the incident report, Arabic rendering (lang/dir, LTR terminal text), and the
 * guarantee that scenario text is never parsed as HTML. Proves wiring and structure, not pixels.
 */
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { installUiHarness, find, byId, byTag, textOf, click, change, buttonByLabel } from "../helpers/ui-harness.js";
import { installLocalStorageShim, resetLocalStorageShim } from "../helpers/storage-shim.js";
import { createContainer } from "../helpers/dom-shim.js";

const { mountPoint } = installUiHarness();
installLocalStorageShim();
// setLocale() touches <html lang/dir> and the static [data-i18n] nodes; a minimal stand-in is enough here.
document.documentElement = { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; } };
document.querySelectorAll = () => [];
const R = "../../assets/js/";
const { FS_TREE, findNode } = await import(R + "filesystem.js");
const { runCommand, resetTerminalState, setCommandObserver } = await import(R + "terminal.js");
const S = await import(R + "engine/scenario.js");
const { SCENARIOS } = await import(R + "scenarios-data.js");
const UI = await import(R + "scenarios.js");
const { getScenarioProgress } = await import(R + "scenario-progress.js");
const { setLocale, DICT } = await import(R + "i18n.js");

const sc01 = SCENARIOS.find((s) => s.id === "sc01");
const CONF = "/srv/lab/sc01/orbit/config/orbit.conf";
const baseTree = JSON.stringify(FS_TREE);
const term = createContainer();
const run = (l) => runCommand(l, term);
const mount = mountPoint("scenario-mount");
const live = mountPoint("scenario-live");
UI.initScenarios();
const panel = () => mount;
const all = () => textOf(panel());
const TITLE = "the app configuration is readable";
const card = () => find(panel(), (n) => n.className && n.className.split(" ")[0] === "challenge-card").find((c) => textOf(c).includes(TITLE));
const open = () => click(buttonByLabel(card(), "Open") || buttonByLabel(card(), "Review"));
const back = () => { const b = byId(panel(), "sc-back"); if (b) click(b); };
const radio = (id) => find(panel(), (n) => n.tag === "input" && n.attrs.value === id)[0];
const XSS = `<img src=x onerror="alert(1)"><script>alert(2)</script>`;

beforeEach(() => { resetLocalStorageShim(); resetTerminalState(); setLocale("en"); });
afterEach(() => { back(); setCommandObserver(null); S.unloadScenario(); resetTerminalState(); setLocale("en"); });

function toDiagnosis() {
  open(); click(byId(panel(), "sc-start"));
  run("su monitoring"); run(`cat ${CONF}`); run("exit");
  run(`ls -l /srv/lab/sc01/orbit/config`); run(`getfacl ${CONF}`); run("groups alice");
}

describe("SC-01 panel: briefing", () => {
  test("appears in the list as an Investigation worth 250 XP and loads nothing until started", () => {
    assert.ok(card());
    assert.match(textOf(card()), /Investigation/); assert.match(textOf(card()), /\+250 XP/);
    open();
    assert.equal(findNode(FS_TREE, "/srv"), null);
    assert.match(all(), /Briefing/);
  });
  test("the briefing shows the incident, the scope/policy list and objectives, and a Start button", () => {
    open();
    assert.match(all(), /Scope and access policy/);
    for (const line of sc01.policy) assert.ok(all().includes(line), line);
    assert.ok(byId(panel(), "sc-start"));
    assert.equal(byTag(panel(), "ul").filter((u) => textOf(u).includes(sc01.policy[0])).length, 1);
  });
});

describe("SC-01 panel: full flow", () => {
  test("briefing → evidence → wrong then right diagnosis → rejected fixes → accepted fix → verify → report", () => {
    toDiagnosis();
    assert.equal(radio("file-others").attrs.disabled, undefined, "diagnosis unlocked by the four evidence items");
    assert.match(all(), /monitoring can read/);

    click(byId(panel(), "sc-diagnose"));
    assert.match(live.textContent, /Select a diagnosis first/);
    change(radio("example-file")); click(byId(panel(), "sc-diagnose"));
    assert.match(all(), /Not the root cause/); assert.match(all(), /public template/);
    change(radio("file-others")); click(byId(panel(), "sc-diagnose"));
    assert.match(all(), /Correct diagnosis/);

    run(`sudo chmod 600 ${CONF}`); click(byId(panel(), "sc-fixcheck"));
    assert.match(all(), /still broken/); assert.match(all(), /alice can read orbit\.conf/);
    run(`sudo chmod 777 ${CONF}`); click(byId(panel(), "sc-fixcheck"));
    assert.match(all(), /still broken/);

    run(`sudo chmod 640 ${CONF}`); run(`sudo setfacl -m u:alice:r-- ${CONF}`); click(byId(panel(), "sc-fixcheck"));
    assert.match(all(), /One step left: verify/);
    assert.match(all(), /Prove the fix from both sides/);
    assert.deepEqual(getScenarioProgress(), {}, "not complete until verified from both sides");

    run("su www-data"); run(`cat ${CONF}`); run("exit");
    assert.match(all(), /Not done yet/, "the 'allowed' probe is still pending");
    assert.deepEqual(getScenarioProgress(), {});
    run("su alice"); run(`cat ${CONF}`);
    assert.match(all(), /Investigation resolved/);
    assert.equal(getScenarioProgress().sc01.xp, 250);
    assert.match(live.textContent, /Investigation resolved/);

    const t = all();
    assert.match(t, /Incident report/); assert.match(t, /Root cause/); assert.match(t, /Supporting evidence/);
    assert.match(t, /Remediation \(final state\)/); assert.match(t, /Verification result/);
    assert.match(t, /others bits r--/, "evidence finding is in the report");
    assert.match(t, /\$ su?|\$ cat/, "commands the learner ran are in the report");
    assert.match(t, /mode 640, deployer:deployer, ACL u:alice:r--/);
    assert.match(t, /Your fix is minimal/);
    assert.match(t, /✓ alice \(on-call\) can read orbit\.conf/);
    assert.doesNotMatch(t, /✗/);
  });

  test("a locked-out alice (chmod 600 only) never reaches verification", () => {
    toDiagnosis(); change(radio("file-others")); click(byId(panel(), "sc-diagnose"));
    run(`sudo chmod 600 ${CONF}`); click(byId(panel(), "sc-fixcheck"));
    assert.equal(byId(panel(), "sc-fixcheck") !== null, true);
    assert.doesNotMatch(all(), /One step left/);
    assert.deepEqual(getScenarioProgress(), {});
  });

  test("hints are progressive and phase-specific in the panel", () => {
    open(); click(byId(panel(), "sc-start"));
    click(byId(panel(), "sc-hint"));
    assert.ok(all().includes(sc01.hints.evidence[0])); assert.ok(!all().includes(sc01.hints.evidence[1]));
    click(byId(panel(), "sc-hint")); assert.ok(all().includes(sc01.hints.evidence[1]));
  });

  test("reset mid-investigation restores the exposed state and empties the evidence and probe state", () => {
    toDiagnosis(); run(`sudo chmod 600 ${CONF}`);
    click(byId(panel(), "sc-reset"));
    assert.equal(findNode(FS_TREE, CONF).octal, "644");
    assert.match(all(), /Not collected yet/);
    assert.ok(radio("file-others").attrs.disabled !== undefined);
  });

  test("leaving mid-investigation cleans up the shared filesystem completely", () => {
    open(); click(byId(panel(), "sc-start")); run(`sudo chmod 000 ${CONF}`);
    back();
    assert.equal(JSON.stringify(FS_TREE), baseTree);
  });
});

describe("SC-01 panel: Arabic / RTL", () => {
  test("switching to Arabic re-renders every SC-01 text block in Arabic and sets lang/dir", () => {
    toDiagnosis();
    setLocale("ar");
    assert.equal(document.documentElement.getAttribute("dir"), "rtl");
    assert.equal(document.documentElement.getAttribute("lang"), "ar");
    const t = all();
    assert.ok(t.includes("النطاق وسياسة الوصول"));
    for (const line of UI.scenarioText(sc01, "ar").policy) assert.ok(t.includes(line), line);
    assert.ok(t.includes(UI.scenarioText(sc01, "ar").evidence(sc01.evidence[0])));
    assert.ok(!t.includes(sc01.evidence[0].label), "no English label left behind");
    assert.ok(!t.includes(sc01.diagnoses[0].label));
  });
  test("terminal quotations stay LTR inside the Arabic panel (evidence, live diagnosis feedback, report)", () => {
    toDiagnosis(); setLocale("ar");
    const mono = find(panel(), (n) => n.className && n.className.includes("sc-mono"));
    assert.ok(mono.length >= 4);
    assert.ok(mono.every((n) => n.attrs.dir === "ltr"));
  });
  test("the finished Arabic report is fully Arabic around the verbatim terminal quotes", () => {
    toDiagnosis(); change(radio("file-others")); click(byId(panel(), "sc-diagnose"));
    run(`sudo chgrp adm ${CONF}`); run(`sudo chmod 640 ${CONF}`); click(byId(panel(), "sc-fixcheck"));
    run("su monitoring"); run(`cat ${CONF}`); run("exit"); run("su deployer"); run(`cat ${CONF}`);
    setLocale("ar");
    const t = all();
    for (const k of ["sc.report.title", "sc.report.cause", "sc.report.evidence", "sc.report.remediation", "sc.report.verification"]) {
      assert.ok(t.includes(DICT.ar[k]), k);
    }
    assert.ok(t.includes(UI.scenarioText(sc01, "ar").rootCause));
    assert.ok(t.includes(UI.scenarioText(sc01, "ar").quality("minimal")));
    assert.match(t, /✓ يستطيع deployer|✓ ما زال deployer/);
  });
});

describe("SC-01 panel: hostile text is inert", () => {
  const dangerous = (root) => find(root, (n) => ["img", "script", "iframe", "svg", "style", "a"].includes(n.tag));
  test("policy, verification, report and evidence text containing markup render as text only", () => {
    const evil = {
      ...sc01, title: XSS, incident: XSS, policy: [XSS],
      verification: [{ id: "denied", label: XSS, matches: () => true }],
    };
    const text = {
      title: XSS, objectives: [XSS, XSS], incident: XSS, policy: [XSS], rootCause: XSS, quality: () => XSS,
      check: () => XSS, evidence: () => XSS, verification: () => XSS, diagnosis: () => ({ label: XSS, why: XSS }),
    };
    const snap = {
      phase: "complete", evidence: { reproduce: { command: XSS, finding: XSS } }, missingEvidence: [], diagnosisAttempts: [],
      verified: { denied: { command: XSS } }, missingVerification: [], fixAttempts: 0, hintCounts: {}, hintsUsed: 0,
    };
    const summary = {
      finalState: XSS, quality: "minimal", wrongDiagnoses: 0, hintsUsed: 0,
      report: { evidence: [{ id: "reproduce", command: XSS, finding: XSS }], remediation: XSS,
        verification: { probes: [{ id: "denied", command: XSS }], checks: [{ id: "alice-reads", level: "required", ok: true }] } },
    };
    const view = UI.buildInvestigationView({
      def: evil, text, snap, hintsVisible: [], hintTotal: 0, diagLog: [], selected: null, summary, lastFix: null, reopened: false,
      actions: { onStart() {}, onHint() {}, onReset() {}, onBack() {}, onSelect() {}, onDiagnose() {}, onFixCheck() {} },
    });
    assert.deepEqual(dangerous(view), []);
    assert.equal(find(view, (n) => n.innerHTML && n.innerHTML.length > 0).length, 0);
    assert.ok(textOf(view).includes(XSS), "the markup is visible as literal text");
  });
});
