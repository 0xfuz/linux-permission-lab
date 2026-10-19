/**
 * tests/regression/scenarios-ui.test.js
 * The Scenarios panel: (1) unsafe content is rendered as text, never HTML;
 * (2) structure/keyboard semantics; (3) the real controller driven end to
 * end — open → work in the real terminal → check → reset — for a challenge
 * and for the investigation. A DOM harness stands in for the browser, so
 * this proves wiring and structure, not pixels or CSS.
 */
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { installUiHarness, find, byId, byTag, textOf, click, change, buttonByLabel } from "../helpers/ui-harness.js";
import { installLocalStorageShim, resetLocalStorageShim } from "../helpers/storage-shim.js";
import { createContainer } from "../helpers/dom-shim.js";

const { mountPoint } = installUiHarness();
installLocalStorageShim();
const R = "../../assets/js/";
const { FS_TREE, findNode } = await import(R + "filesystem.js");
const { runCommand, resetTerminalState, getTerminalState, setCommandObserver } = await import(R + "terminal.js");
const S = await import(R + "engine/scenario.js");
const { createInvestigation } = await import(R + "engine/investigation.js");
const { SCENARIOS, CHALLENGE_SCENARIOS, INVESTIGATIONS } = await import(R + "scenarios-data.js");
const UI = await import(R + "scenarios.js");
const { getScenarioProgress } = await import(R + "scenario-progress.js");

const baseTree = JSON.stringify(FS_TREE);
const term = createContainer();
const run = (l) => runCommand(l, term);
const XSS = `<img src=x onerror="alert(1)"><script>alert(2)</script>`;

beforeEach(() => { resetLocalStorageShim(); resetTerminalState(); });
afterEach(() => { setCommandObserver(null); S.unloadScenario(); resetTerminalState(); });

const allText = (n) => textOf(n);
const hasInnerHTML = (root) => find(root, (n) => n.innerHTML && n.innerHTML.length > 0);
const dangerousTags = (root) => find(root, (n) => ["img", "script", "iframe", "svg", "style", "a"].includes(n.tag));

describe("unsafe content in scenario text is rendered as inert text", () => {
  const evilChallenge = () => {
    const d = { ...CHALLENGE_SCENARIOS[0] };
    const s = S.createChallengeSession(d); s.start();
    s.check();
    const text = { title: XSS, objectives: [XSS, XSS], task: XSS, completion: XSS, check: () => XSS };
    return UI.buildChallengeView({
      def: { ...d, xp: 5 }, text, done: true, last: s.last, attempts: 1, solved: true,
      hintsVisible: [XSS], actions: { onBack() {}, onCheck() {}, onHint() {}, onReset() {} },
    });
  };

  test("challenge view: no innerHTML, no dangerous elements, payload present only as text", () => {
    const view = evilChallenge();
    assert.deepEqual(hasInnerHTML(view), []);
    assert.deepEqual(dangerousTags(view), []);
    assert.ok(allText(view).includes(XSS), "payload shown literally");
  });

  test("investigation view: evidence findings, diagnosis text and summary are text too", () => {
    const def = INVESTIGATIONS[0];
    const text = {
      title: XSS, incident: XSS, objectives: [XSS], rootCause: XSS, quality: () => XSS,
      evidence: () => XSS, check: () => XSS, diagnosis: () => ({ label: XSS, why: XSS }),
    };
    const snap = {
      phase: "complete", evidence: Object.fromEntries(def.evidence.map((e) => [e.id, { command: XSS, finding: XSS }])),
      missingEvidence: [],
    };
    const view = UI.buildInvestigationView({
      def, text, snap, hintsVisible: [XSS], hintTotal: 3, diagLog: [{ label: XSS, correct: false, why: XSS, live: XSS }],
      selected: null, summary: { finalState: XSS, quality: "broad", wrongDiagnoses: 1, hintsUsed: 1 },
      lastFix: { ok: false, results: def.checks.map((c) => ({ id: c.id, level: c.level, label: XSS, ok: false, detail: XSS })), advisories: [] },
      reopened: true, actions: {},
    });
    assert.deepEqual(hasInnerHTML(view), []);
    assert.deepEqual(dangerousTags(view), []);
    assert.ok(allText(view).includes(XSS));
  });

  test("the scenario list renders titles and tasks as text", () => {
    const evil = [{ ...CHALLENGE_SCENARIOS[0], id: "x", title: XSS, task: XSS }];
    const view = UI.buildScenarioList(evil, {}, () => {});
    assert.deepEqual(hasInnerHTML(view), []);
    assert.deepEqual(dangerousTags(view), []);
    assert.ok(allText(view).includes(XSS));
  });

  test("hostile file names created by the learner appear as text in check details", () => {
    S.startScenario(CHALLENGE_SCENARIOS[0]);
    run("touch '<img onerror=x>'"); // refused by the name rules — must not smuggle markup either
    const s = S.createChallengeSession(CHALLENGE_SCENARIOS[0]); s.start();
    s.check();
    const view = UI.buildChallengeView({
      def: CHALLENGE_SCENARIOS[0], text: UI.scenarioText(CHALLENGE_SCENARIOS[0]), done: false, last: s.last,
      attempts: 1, solved: false, hintsVisible: [], actions: {},
    });
    assert.deepEqual(hasInnerHTML(view), []);
  });

  test("source scan: scenarios.js never assigns HTML (innerHTML / html:)", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL(R + "scenarios.js", import.meta.url), "utf8");
    assert.doesNotMatch(src, /innerHTML|\bhtml\s*:/);
    assert.doesNotMatch(src, /\beval\s*\(|new Function/);
  });
});

describe("structure and keyboard semantics", () => {
  test("every control is a native <button type=button> or <input>; no clickable divs", () => {
    const s = S.createChallengeSession(CHALLENGE_SCENARIOS[1]); s.start();
    const view = UI.buildChallengeView({
      def: CHALLENGE_SCENARIOS[1], text: UI.scenarioText(CHALLENGE_SCENARIOS[1]), done: false, last: null,
      attempts: 0, solved: false, hintsVisible: [], actions: { onBack() {}, onCheck() {}, onHint() {}, onReset() {} },
    });
    const buttons = byTag(view, "button");
    assert.ok(buttons.length >= 4);
    assert.ok(buttons.every((b) => b.attrs.type === "button"));
    assert.deepEqual(find(view, (n) => n.tag !== "button" && n.tag !== "input" && n.listeners && n.listeners.click), []);
    for (const id of ["sc-check", "sc-hint", "sc-reset", "sc-back"]) assert.ok(byId(view, id), id);
  });

  test("results are conveyed by text, not colour alone (✓/✗ + screen-reader wording)", () => {
    const s = S.createChallengeSession(CHALLENGE_SCENARIOS[0]); s.start(); s.check();
    const view = UI.buildChallengeView({
      def: CHALLENGE_SCENARIOS[0], text: UI.scenarioText(CHALLENGE_SCENARIOS[0]), done: false, last: s.last,
      attempts: 1, solved: false, hintsVisible: [], actions: {},
    });
    const txt = allText(view);
    assert.match(txt, /✗/);
    assert.match(txt, /Not yet/);
    assert.ok(find(view, (n) => n.className === "sr-only").length > 0);
  });

  test("the diagnosis is a labelled radio group: fieldset + legend, each radio inside a <label>", () => {
    const def = INVESTIGATIONS[0];
    const view = UI.buildInvestigationView({
      def, text: UI.scenarioText(def), snap: { phase: "diagnosis", evidence: {}, missingEvidence: [] }, hintsVisible: [], hintTotal: 0,
      diagLog: [], selected: null, summary: null, lastFix: null, reopened: false, actions: { onSelect() {}, onDiagnose() {} },
    });
    const fs = byTag(view, "fieldset");
    assert.equal(fs.length, 1);
    assert.equal(byTag(fs[0], "legend").length, 1);
    const radios = find(view, (n) => n.tag === "input" && n.attrs.type === "radio");
    assert.equal(radios.length, def.diagnoses.length);
    assert.ok(new Set(radios.map((r) => r.attrs.name)).size === 1, "one group → arrow keys move between options");
    assert.ok(radios.every((r) => r.attrs.disabled === undefined));
    const labels = byTag(view, "label");
    assert.equal(labels.length, def.diagnoses.length);
    assert.ok(labels.every((l) => find(l, (n) => n.tag === "input").length === 1 && textOf(l).trim().length > 5));
  });

  test("diagnosis controls are disabled while the evidence is incomplete, and say what is missing", () => {
    const def = INVESTIGATIONS[0];
    const view = UI.buildInvestigationView({
      def, text: UI.scenarioText(def), snap: { phase: "evidence", evidence: {}, missingEvidence: ["reproduce"] }, hintsVisible: [], hintTotal: 3,
      diagLog: [], selected: null, summary: null, lastFix: null, reopened: false, actions: {},
    });
    assert.ok(find(view, (n) => n.tag === "input").every((r) => r.attrs.disabled !== undefined));
    assert.ok(byId(view, "sc-diagnose").attrs.disabled !== undefined);
    assert.match(allText(view), /Reproduce the failure as www-data/);
    assert.equal(click(byId(view, "sc-diagnose")), false, "a disabled button never fires");
  });

  test("the stepper marks exactly one current step with aria-current", () => {
    const def = INVESTIGATIONS[0];
    for (const phase of ["evidence", "diagnosis", "remediation", "verification", "complete"]) {
      const view = UI.buildInvestigationView({
        def, text: UI.scenarioText(def), snap: { phase, evidence: {}, missingEvidence: [] }, hintsVisible: [], hintTotal: 0,
        diagLog: [], selected: null, summary: phase === "complete" ? { finalState: "x", quality: "minimal", wrongDiagnoses: 0, hintsUsed: 0 } : null,
        lastFix: null, reopened: false, actions: {},
      });
      const cur = find(view, (n) => n.attrs && n.attrs["aria-current"] === "step");
      assert.equal(cur.length, 1, phase);
      assert.match(textOf(cur[0]), new RegExp(`${{ evidence: "Evidence", diagnosis: "Diagnosis", remediation: "Fix", verification: "Verify", complete: "Done" }[phase]}`));
    }
  });

  test("the briefing shows the incident and a single Start button — nothing else to do yet", () => {
    const def = INVESTIGATIONS[0];
    const view = UI.buildInvestigationView({
      def, text: UI.scenarioText(def), snap: { phase: "briefing", evidence: {}, missingEvidence: [] }, hintsVisible: [], hintTotal: 0,
      diagLog: [], selected: null, summary: null, lastFix: null, reopened: false, actions: { onStart() {}, onBack() {} },
    });
    assert.ok(byId(view, "sc-start"));
    assert.equal(byTag(view, "fieldset").length, 0);
    assert.match(allText(view), /403 Forbidden/);
  });
});

describe("Arabic text lookup", () => {
  test("scenarioText(ar) returns Arabic for every translatable field, English for none", () => {
    for (const d of SCENARIOS) {
      const en = UI.scenarioText(d, "en"); const ar = UI.scenarioText(d, "ar");
      assert.notEqual(ar.title, en.title, d.id);
      assert.ok(/[\u0600-\u06FF]/.test(ar.title), d.id);
      assert.ok(ar.objectives.every((o) => /[\u0600-\u06FF]/.test(o)), d.id);
      for (const ck of d.checks) assert.ok(/[\u0600-\u06FF]/.test(ar.check(ck)), `${d.id}/${ck.id}`);
    }
  });
  test("an item with no Arabic entry falls back to English field by field", () => {
    const d = { ...CHALLENGE_SCENARIOS[0], id: "no-ar" };
    assert.equal(UI.scenarioText(d, "ar").title, d.title);
    assert.equal(UI.scenarioText(d, "ar").check(d.checks[0]), d.checks[0].label);
  });
});

/* ---------------------------- full controller flows --------------------------- */

const mount = mountPoint("scenario-mount");
const live = mountPoint("scenario-live");
UI.initScenarios();
const panel = () => mount;
const card = (title) => find(panel(), (n) => n.className && n.className.split(" ")[0] === "challenge-card").find((c) => textOf(c).includes(title));
const openCard = (title) => click(buttonByLabel(card(title), "Open") || buttonByLabel(card(title), "Review"));
const backToList = () => { const b = byId(panel(), "sc-back"); if (b) click(b); };
afterEach(() => backToList());

describe("controller: list", () => {
  test("lists all 5 scenarios with kind badge, XP and an Open button", () => {
    const cards = find(panel(), (n) => n.className && n.className.split(" ")[0] === "challenge-card");
    assert.equal(cards.length, 5);
    const t = allText(panel());
    assert.match(t, /Investigation/); assert.match(t, /Challenge/); assert.match(t, /\+75 XP/); assert.match(t, /\+200 XP/);
    assert.equal(find(panel(), (n) => n.tag === "button" && textOf(n).trim() === "Open").length, 5);
  });
});

describe("controller: challenge end to end", () => {
  test("open → wrong fix fails → right fix solves and persists → reset restores the broken state", () => {
    openCard("Lock down a leaked deploy key");
    assert.equal(getTerminalState().cwd, "/srv/lab/tc01", "shell moved into the scenario");
    assert.equal(getTerminalState().user, "user");

    click(byId(panel(), "sc-check"));
    assert.match(allText(panel()), /Not solved yet/);
    assert.match(live.textContent, /Not solved yet/);
    assert.deepEqual(getScenarioProgress(), {});

    run("chmod 777 deploy_key");
    click(byId(panel(), "sc-check"));
    assert.match(allText(panel()), /Not solved yet/);
    assert.deepEqual(getScenarioProgress(), {}, "777 is not a solution");

    run("chmod 600 deploy_key");
    click(byId(panel(), "sc-check"));
    assert.match(allText(panel()), /Solved!/);
    assert.match(allText(panel()), /Why this works/);
    assert.match(live.textContent, /Solved!/);
    assert.equal(getScenarioProgress().tc01.xp, 75);
    assert.equal(getScenarioProgress().tc01.attempts, 3);

    click(byId(panel(), "sc-reset"));
    assert.equal(findNode(FS_TREE, "/srv/lab/tc01/deploy_key").octal, "644");
    assert.doesNotMatch(allText(panel()), /Solved!/);
    assert.match(live.textContent, /reset to its original state/);
    assert.equal(document.activeElement, byId(panel(), "sc-reset"), "focus stays on the control you used");

    run("chmod 600 deploy_key");
    click(byId(panel(), "sc-check"));
    assert.match(allText(panel()), /Solved!/);
    assert.equal(Object.keys(getScenarioProgress()).length, 1, "no duplicate completion record");
  });

  test("hints appear one per click, in order, and stop after the last", () => {
    openCard("Lock down a leaked deploy key");
    const def = CHALLENGE_SCENARIOS[0];
    for (let i = 1; i <= def.hints.length; i += 1) {
      click(byId(panel(), "sc-hint"));
      assert.equal(find(panel(), (n) => n.className === "readout readout-hint").length, i);
      assert.ok(allText(panel()).includes(def.hints[i - 1]));
      if (i < def.hints.length) assert.ok(!allText(panel()).includes(def.hints[i]), "next hint still hidden");
    }
    click(byId(panel(), "sc-hint"));
    assert.equal(find(panel(), (n) => n.className === "readout readout-hint").length, def.hints.length);
    assert.match(live.textContent, /No more hints/);
  });

  test("Back removes the scenario files and returns the shell home", () => {
    openCard("Listing works, reading doesn't");
    assert.ok(findNode(FS_TREE, "/srv/lab/tc02"));
    backToList();
    assert.equal(JSON.stringify(FS_TREE), baseTree);
    assert.equal(getTerminalState().cwd, "/home/user");
    assert.equal(find(panel(), (n) => n.className && n.className.split(" ")[0] === "challenge-card").length, 5);
  });

  test("switching scenarios replaces the previous one's files", () => {
    openCard("Lock down a leaked deploy key"); backToList();
    openCard("The wrong group on a shared report");
    assert.equal(findNode(FS_TREE, "/srv/lab/tc01"), null);
    assert.ok(findNode(FS_TREE, "/srv/lab/tc03/report.txt"));
  });

  test("a completed scenario shows Review and the explanation immediately", () => {
    openCard("Lock down a leaked deploy key");
    run("chmod 600 deploy_key"); click(byId(panel(), "sc-check")); backToList();
    assert.ok(buttonByLabel(card("Lock down a leaked deploy key"), "Review"));
    openCard("Lock down a leaked deploy key");
    assert.match(allText(panel()), /Why this works/);
  });
});

describe("controller: investigation end to end", () => {
  const I = "/srv/lab/inv01";
  const FILE = `${I}/app/current/public/index.html`;
  const CUR = `${I}/app/current`;
  const radio = (id) => find(panel(), (n) => n.tag === "input" && n.attrs.value === id)[0];

  test("briefing → evidence → diagnosis (wrong, then right) → fix → verify → resolved", () => {
    openCard("the site returns 403");
    assert.equal(findNode(FS_TREE, "/srv"), null, "nothing is loaded during the briefing");
    assert.match(allText(panel()), /Briefing/);

    click(byId(panel(), "sc-start"));
    assert.ok(findNode(FS_TREE, CUR));
    assert.equal(getTerminalState().cwd, I);
    assert.ok(radio("dir-search").attrs.disabled !== undefined, "diagnosis locked");
    assert.match(allText(panel()), /Collect all the evidence first/);

    run("su www-data"); run(`cat ${FILE}`); run("exit");
    assert.match(allText(panel()), /Permission denied|no x \(search\)/);
    run(`stat ${FILE}`);
    assert.ok(radio("dir-search").attrs.disabled !== undefined, "still locked: directory chain not inspected");
    run(`ls -l ${I}/app`);
    assert.equal(radio("dir-search").attrs.disabled, undefined, "unlocked once all evidence is in");
    assert.match(live.textContent, /Diagnosis/);

    click(byId(panel(), "sc-diagnose"));
    assert.match(live.textContent, /Select a diagnosis first/, "nothing chosen yet");

    change(radio("file-mode")); click(byId(panel(), "sc-diagnose"));
    assert.match(allText(panel()), /Not the root cause/);
    assert.match(allText(panel()), /From the simulation/);
    assert.match(allText(panel()), /Diagnosis/);
    assert.ok(radio("dir-search").attrs.disabled === undefined, "can try again");

    change(radio("dir-search")); click(byId(panel(), "sc-diagnose"));
    assert.match(allText(panel()), /Correct diagnosis/);
    assert.ok(byId(panel(), "sc-fixcheck"), "fix step is now available");

    click(byId(panel(), "sc-fixcheck"));
    assert.match(allText(panel()), /still broken/);
    assert.match(allText(panel()), /www-data can read index\.html|www-data/);

    run(`chmod 777 ${CUR}`); click(byId(panel(), "sc-fixcheck"));
    assert.match(allText(panel()), /still broken/, "777 is rejected");

    run(`chmod 711 ${CUR}`); click(byId(panel(), "sc-fixcheck"));
    assert.match(allText(panel()), /One step left: verify/);
    assert.deepEqual(getScenarioProgress(), {}, "not complete until verified");

    run("su www-data"); run(`cat ${FILE}`);
    assert.match(allText(panel()), /Investigation resolved/);
    assert.match(allText(panel()), /Your fix is minimal/);
    assert.equal(getScenarioProgress().inv01.xp, 200);
    assert.match(live.textContent, /Investigation resolved/);
  });

  test("hints are phase-specific and progressive in the UI", () => {
    openCard("the site returns 403"); click(byId(panel(), "sc-start"));
    const def = INVESTIGATIONS[0];
    click(byId(panel(), "sc-hint"));
    assert.ok(allText(panel()).includes(def.hints.evidence[0]));
    assert.ok(!allText(panel()).includes(def.hints.evidence[1]));
    run("su www-data"); run(`cat ${FILE}`); run("exit"); run(`stat ${FILE}`); run(`ls -l ${I}/app`);
    assert.ok(!allText(panel()).includes(def.hints.evidence[0]), "new phase, new hint list");
    click(byId(panel(), "sc-hint"));
    assert.ok(allText(panel()).includes(def.hints.diagnosis[0]));
  });

  test("reset mid-investigation restores the broken state and the evidence log", () => {
    openCard("the site returns 403"); click(byId(panel(), "sc-start"));
    run("su www-data"); run(`cat ${FILE}`); run("exit"); run(`stat ${FILE}`); run(`ls -l ${I}/app`);
    run(`chmod 711 ${CUR}`);
    click(byId(panel(), "sc-reset"));
    assert.equal(findNode(FS_TREE, CUR).octal, "700");
    assert.match(allText(panel()), /Not collected yet/);
    assert.ok(radio("dir-search").attrs.disabled !== undefined);
    assert.equal(getTerminalState().user, "user");
  });

  test("undoing the fix before verifying reopens the Fix step with a message", () => {
    openCard("the site returns 403"); click(byId(panel(), "sc-start"));
    run("su www-data"); run(`cat ${FILE}`); run("exit"); run(`stat ${FILE}`); run(`ls -l ${I}/app`);
    change(radio("dir-search")); click(byId(panel(), "sc-diagnose"));
    run(`chmod 711 ${CUR}`); click(byId(panel(), "sc-fixcheck"));
    run(`chmod 700 ${CUR}`);
    run("su www-data"); run(`cat ${FILE}`);
    assert.match(allText(panel()), /no longer passes/);
    assert.deepEqual(getScenarioProgress(), {});
  });

  test("a broad (755) fix completes with the 'more permissive than necessary' explanation", () => {
    openCard("the site returns 403"); click(byId(panel(), "sc-start"));
    run("su www-data"); run(`cat ${FILE}`); run("exit"); run(`stat ${FILE}`); run(`ls -l ${I}/app`);
    change(radio("dir-search")); click(byId(panel(), "sc-diagnose"));
    run(`chmod 755 ${CUR}`); click(byId(panel(), "sc-fixcheck"));
    run("su www-data"); run(`cat ${FILE}`);
    assert.match(allText(panel()), /more permissive than necessary/);
  });

  test("leaving mid-investigation cleans up completely", () => {
    openCard("the site returns 403"); click(byId(panel(), "sc-start"));
    run(`chmod 000 ${CUR}`);
    backToList();
    assert.equal(JSON.stringify(FS_TREE), baseTree);
  });
});

void createInvestigation;
