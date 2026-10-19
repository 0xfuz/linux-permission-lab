/**
 * tests/regression/scenarios.test.js
 * The shipped v2.12 scenarios (4 state-checked challenges + 1 investigation):
 * data invariants, known solutions and known shortcuts against the real
 * terminal, the terminal observer hook, progress persistence and
 * backward compatibility.
 */
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { installDomShim, createContainer, outputText } from "../helpers/dom-shim.js";
import { installLocalStorageShim, resetLocalStorageShim } from "../helpers/storage-shim.js";

installDomShim();
installLocalStorageShim();
const R = "../../assets/js/";
const { FS_TREE, findNode } = await import(R + "filesystem.js");
const { runCommand, resetTerminalState, getTerminalState, setCommandObserver } = await import(R + "terminal.js");
const S = await import(R + "engine/scenario.js");
const { SCENARIOS, CHALLENGE_SCENARIOS, INVESTIGATIONS } = await import(R + "scenarios-data.js");
const { CHALLENGES } = await import(R + "challenges-data.js");
const P = await import(R + "scenario-progress.js");
const { computeTotals, buildProgressSnapshot, resetAllProgress } = await import(R + "progress.js");
const { loadState, saveState } = await import(R + "utils.js");

const c = createContainer();
const run = (l) => runCommand(l, c);
const base = JSON.stringify(FS_TREE);
const def = (id) => SCENARIOS.find((s) => s.id === id);

beforeEach(() => { resetTerminalState(); resetLocalStorageShim(); });
afterEach(() => { setCommandObserver(null); S.unloadScenario(); resetTerminalState(); });

describe("scenario data invariants", () => {
  test("5 scenarios: 4 challenges + 1 investigation", () => {
    assert.equal(CHALLENGE_SCENARIOS.length, 4);
    assert.equal(INVESTIGATIONS.length, 1);
    assert.equal(SCENARIOS.length, 5);
  });
  test("ids are unique and do not collide with the 88 octal challenges", () => {
    const ids = SCENARIOS.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length);
    const old = new Set(CHALLENGES.map((x) => x.id));
    assert.deepEqual(ids.filter((i) => old.has(i)), []);
  });
  test("every scenario has the authoring fields", () => {
    for (const s of SCENARIOS) {
      assert.ok(s.title && s.task !== undefined || s.incident, s.id);
      assert.ok(s.xp > 0, s.id);
      assert.ok(s.objectives.length >= 2 && s.objectives.every((o) => o.trim()), s.id);
      assert.equal(typeof s.build, "function", s.id);
      assert.ok(s.checks.length >= 3, s.id);
      assert.equal(new Set(s.checks.map((k) => k.id)).size, s.checks.length, `${s.id}: check ids unique`);
      assert.ok(s.checks.some((k) => k.level === "required"), s.id);
      assert.ok(s.checks.every((k) => typeof k.run === "function" && k.label), s.id);
    }
  });
  test("challenges: completion message and >= 3 ordered hints", () => {
    for (const s of CHALLENGE_SCENARIOS) {
      assert.ok(s.completion.length > 60, s.id);
      assert.ok(s.hints.length >= 3 && s.hints.every((h) => h.trim()), s.id);
    }
  });
  test("investigation has evidence, one correct diagnosis among several, and per-phase hints", () => {
    const inv = INVESTIGATIONS[0];
    assert.ok(inv.evidence.length >= 3 && inv.evidence.every((e) => e.id && e.label && typeof e.matches === "function" && typeof e.finding === "function"));
    assert.ok(inv.diagnoses.length >= 3);
    assert.equal(inv.diagnoses.filter((d) => d.correct).length, 1);
    for (const p of ["evidence", "diagnosis", "remediation", "verification"]) assert.ok(inv.hints[p].length >= 1, p);
  });
  test("no hint or completion text recommends chmod 777", () => {
    const texts = SCENARIOS.flatMap((s) => [s.completion || "", ...(Array.isArray(s.hints) ? s.hints : Object.values(s.hints).flat())]);
    assert.deepEqual(texts.filter((x) => /\bchmod\s+(-R\s+)?0?777\b(?![^.]*\b(avoid|never|would|also)\b)/i.test(x) && !/avoid|never|would also|also.*work/i.test(x)), []);
  });
  test("every scenario's initial state FAILS its own checks (nothing is pre-solved)", () => {
    for (const s of CHALLENGE_SCENARIOS) {
      const sess = S.createChallengeSession(s); sess.start();
      assert.equal(sess.check().ok, false, s.id);
      sess.end();
    }
  });
  test("builders are deterministic: two builds are structurally identical", () => {
    for (const s of SCENARIOS) assert.deepEqual(JSON.stringify(s.build()), JSON.stringify(s.build()), s.id);
  });
  test("loading every scenario in turn leaves the base tree untouched afterwards", () => {
    for (const s of SCENARIOS) { S.startScenario(s); S.unloadScenario(); }
    assert.equal(JSON.stringify(FS_TREE), base);
  });
});

/** [scenario id, label, commands] — each must reach a state the checks accept. */
const SOLUTIONS = [
  ["tc01", "chmod 600", ["chmod 600 /srv/lab/tc01/deploy_key"]],
  ["tc01", "chmod 400", ["chmod 400 /srv/lab/tc01/deploy_key"]],
  ["tc01", "relative path from the scenario dir", ["chmod 600 deploy_key"]],
  // Group 'user' has no member besides the owner in this lab, so 640 exposes the key to nobody:
  // the validator judges the real effective access, not the digit pattern.
  ["tc01", "chmod 640 (group 'user' has no other members)", ["chmod 640 /srv/lab/tc01/deploy_key"]],
  ["tc02", "chmod 745", ["chmod 745 /srv/lab/tc02/reports"]],
  ["tc02", "chmod 755", ["chmod 755 /srv/lab/tc02/reports"]],
  ["tc02", "chmod 711", ["chmod 711 /srv/lab/tc02/reports"]],
  ["tc03", "chgrp to a group alice is in", ["sudo chgrp adm /srv/lab/tc03/report.txt"]],
  ["tc03", "named ACL entry for alice", ["setfacl -m u:alice:r-- /srv/lab/tc03/report.txt"]],
  ["tc04", "ACL --x on the directory", ["setfacl -m u:monitoring:--x /srv/lab/tc04/conf"]],
  ["tc04", "ACL r-x on the directory (also works, just broader)", ["setfacl -m u:monitoring:r-x /srv/lab/tc04/conf"]],
  ["tc04", "chmod o+x via 751 (works; advisory only)", ["chmod 751 /srv/lab/tc04/conf"]],
];
/** Plausible-looking shortcuts that must NOT pass. */
const SHORTCUTS = [
  ["tc01", "chmod 777", ["chmod 777 /srv/lab/tc01/deploy_key"]],
  ["tc01", "chmod 644 (still readable)", ["chmod 644 /srv/lab/tc01/deploy_key"]],
  ["tc01", "chmod 604 (others can read)", ["chmod 604 /srv/lab/tc01/deploy_key"]],
  ["tc01", "chmod 602 (others can write)", ["chmod 602 /srv/lab/tc01/deploy_key"]],
  ["tc01", "deleting the key", ["rm /srv/lab/tc01/deploy_key"]],
  ["tc01", "right mode on the wrong file", ["chmod 600 /srv/lab/tc01/deploy_key.pub"]],
  ["tc02", "chmod 777", ["chmod 777 /srv/lab/tc02/reports"]],
  ["tc02", "chmod 757 (world-writable)", ["chmod 757 /srv/lab/tc02/reports"]],
  ["tc02", "chmod on the file instead of the directory", ["chmod 755 /srv/lab/tc02/reports/q3.txt"]],
  ["tc03", "chmod 644 (opens it to everyone)", ["chmod 644 /srv/lab/tc03/report.txt"]],
  ["tc03", "chmod 666", ["chmod 666 /srv/lab/tc03/report.txt"]],
  ["tc03", "chown alice (alice can now write)", ["sudo chown alice /srv/lab/tc03/report.txt"]],
  ["tc03", "rw ACL for alice (write not needed)", ["setfacl -m u:alice:rw- /srv/lab/tc03/report.txt"]],
  ["tc03", "ACL for the wrong account", ["setfacl -m u:monitoring:r-- /srv/lab/tc03/report.txt"]],
  ["tc04", "chmod 777 on the directory", ["chmod 777 /srv/lab/tc04/conf"]],
  ["tc04", "ACL for the wrong account", ["setfacl -m u:www-data:--x /srv/lab/tc04/conf"]],
  ["tc04", "making the secrets readable", ["setfacl -m u:monitoring:--x /srv/lab/tc04/conf", "chmod 644 /srv/lab/tc04/conf/secrets.yml"]],
  ["tc04", "giving monitoring write on the file", ["setfacl -m u:monitoring:--x /srv/lab/tc04/conf", "setfacl -m u:monitoring:rw- /srv/lab/tc04/conf/app.yml"]],
];

describe("known solutions are accepted (state-based, any legitimate route)", () => {
  for (const [id, label, cmds] of SOLUTIONS) {
    test(`${id}: ${label}`, () => {
      const s = S.createChallengeSession(def(id)); s.start();
      cmds.forEach(run);
      const r = s.check();
      assert.equal(r.ok, true, JSON.stringify(r.failedRequired));
      s.end();
    });
  }
});

describe("shortcuts are rejected", () => {
  for (const [id, label, cmds] of SHORTCUTS) {
    test(`${id}: ${label}`, () => {
      const s = S.createChallengeSession(def(id)); s.start();
      cmds.forEach(run);
      assert.equal(s.check().ok, false);
      s.end();
    });
  }
});

describe("least-privilege feedback", () => {
  test("tc04: a broader-than-needed fix passes but is flagged as more permissive", () => {
    const s = S.createChallengeSession(def("tc04")); s.start();
    run("chmod 751 /srv/lab/tc04/conf");
    const r = s.check();
    assert.equal(r.ok, true);
    assert.ok(r.advisories.length >= 1);
    assert.ok(r.advisories.every((a) => a.level === "advisory"));
  });
  test("tc04: the minimal ACL fix has no advisories", () => {
    const s = S.createChallengeSession(def("tc04")); s.start();
    run("setfacl -m u:monitoring:--x /srv/lab/tc04/conf");
    assert.deepEqual(s.check().advisories, []);
  });
  test("failure details explain the cause using the same wording as the terminal", () => {
    const s = S.createChallengeSession(def("tc04")); s.start();
    const r = s.check();
    const f = r.failedRequired.find((x) => x.id === "monitoring-reads");
    assert.match(f.detail, /\/srv\/lab\/tc04\/conf/);
    assert.match(f.detail, /no x \(search\)/);
  });
});

describe("the tc04 scenario is faithful to the ACL simulator", () => {
  test("before the fix monitoring is stopped at the directory, not at the file", () => {
    S.startScenario(def("tc04"));
    run("su monitoring"); run("cat /srv/lab/tc04/conf/app.yml");
    const out = outputText(c);
    assert.match(out.slice(out.lastIndexOf("cat /srv/lab/tc04/conf/app.yml")), /Permission denied[\s\S]*\/srv\/lab\/tc04\/conf/);
  });
  test("after the fix the same cat succeeds", () => {
    S.startScenario(def("tc04"));
    run("setfacl -m u:monitoring:--x /srv/lab/tc04/conf");
    run("su monitoring"); run("cat /srv/lab/tc04/conf/app.yml");
    const out = outputText(c);
    assert.doesNotMatch(out.slice(out.lastIndexOf("cat /srv/lab/tc04/conf/app.yml")), /Permission denied/);
  });
});

describe("terminal observer hook", () => {
  test("receives cmd, args, user, cwd and resolved paths of what was typed", () => {
    const seen = [];
    setCommandObserver((e) => seen.push(e));
    run("cd /tmp"); run("ls -l session_abc123");
    assert.equal(seen.length, 2);
    assert.deepEqual([seen[1].cmd, seen[1].args, seen[1].user, seen[1].cwd], ["ls", ["-l", "session_abc123"], "user", "/tmp"]);
    assert.deepEqual(seen[1].paths, ["/tmp/session_abc123"]);
  });
  test("user/cwd describe the shell BEFORE the line ran", () => {
    const seen = [];
    setCommandObserver((e) => seen.push(e));
    run("su alice");
    assert.equal(seen[0].user, "user");
    run("whoami");
    assert.equal(seen[1].user, "alice");
  });
  test("an observer that throws cannot break the terminal", () => {
    setCommandObserver(() => { throw new Error("boom"); });
    assert.doesNotThrow(() => run("pwd"));
    assert.match(outputText(c), /\/home\/user/);
  });
  test("setCommandObserver(null) detaches it; non-functions are ignored", () => {
    let n = 0;
    setCommandObserver(() => { n += 1; });
    run("pwd"); setCommandObserver(null); run("pwd");
    assert.equal(n, 1);
    setCommandObserver("nope"); assert.doesNotThrow(() => run("pwd"));
  });
  test("blank lines and tokenizer errors do not reach the observer", () => {
    let n = 0;
    setCommandObserver(() => { n += 1; });
    run(""); run("echo 'unterminated");
    assert.equal(n, 0);
  });
  test("terminal output is identical with and without an observer", () => {
    const a = createContainer(); const b = createContainer();
    runCommand("ls -l /etc/ssh", a);
    setCommandObserver(() => {});
    runCommand("ls -l /etc/ssh", b);
    assert.equal(outputText(a).split("\n").slice(1).join("\n"), outputText(b).split("\n").slice(1).join("\n"));
  });
});

describe("existing terminal behaviour is unchanged by scenarios", () => {
  test("a normal session never sees /srv; with a scenario loaded it does; after unload it does not", () => {
    run("ls /srv");
    assert.match(outputText(c).split("\n").slice(-1)[0], /not a directory|no such/i);
    S.startScenario(def("tc01")); run("ls /srv/lab/tc01");
    assert.match(outputText(c).split("\n").slice(-1)[0], /deploy_key/);
    S.unloadScenario();
    assert.equal(findNode(FS_TREE, "/srv"), null);
  });
  test("find across the whole tree only finds scenario files while one is loaded", () => {
    const count = (n) => { const x = createContainer(); runCommand(`find ${n}`, x); return outputText(x); };
    assert.doesNotMatch(count("deploy_key"), /tc01/);
    S.startScenario(def("tc01"));
    assert.match(count("deploy_key"), /tc01/);
  });
  test("permission enforcement inside a scenario matches the rest of the lab (non-owner chmod refused)", () => {
    S.startScenario(def("tc01"));
    run("su alice"); run("chmod 600 /srv/lab/tc01/deploy_key");
    assert.match(outputText(c).split("\n").slice(-2).join("\n"), /Operation not permitted/);
  });
});

describe("progress persistence and backward compatibility", () => {
  test("completion is stored under its own key with xp, and survives a reload of state", () => {
    P.markScenarioComplete("tc01", { attempts: 2, hintsUsed: 1 });
    const stored = loadState().scenarioProgress.tc01;
    assert.equal(stored.xp, def("tc01").xp);
    assert.deepEqual([stored.attempts, stored.hintsUsed], [2, 1]);
    assert.equal(typeof stored.completedAt, "number");
    assert.equal(P.getScenarioProgress().tc01.xp, 75);
  });
  test("completing twice never awards XP twice", () => {
    P.markScenarioComplete("tc02"); P.markScenarioComplete("tc02");
    assert.equal(P.scenarioTotalXP(), def("tc02").xp);
  });
  test("unknown ids are ignored, never persisted", () => {
    P.markScenarioComplete("hax"); P.markScenarioComplete("__proto__");
    assert.deepEqual(P.getScenarioProgress(), {});
  });
  test("state saved by v2.11 (no scenarioProgress key) loads as 'nothing completed'", () => {
    saveState({ challengeProgress: { b01: { completedAt: 1, xp: 50 } }, locale: "ar", theme: "light" });
    assert.deepEqual(P.getScenarioProgress(), {});
    assert.equal(P.scenarioTotalXP(), 0);
    assert.equal(computeTotals().challengeXP, 50);
    assert.equal(computeTotals().totalXP, 50);
  });
  test("malformed stored values degrade to empty instead of throwing", () => {
    for (const bad of ["oops", 42, [], null, { tc01: null }, { tc01: { xp: "NaN" } }]) {
      saveState({ scenarioProgress: bad });
      assert.doesNotThrow(() => P.getScenarioProgress());
      assert.doesNotThrow(() => P.scenarioTotalXP());
      assert.equal(P.scenarioTotalXP(), 0);
    }
  });
  test("marking a scenario complete leaves the other saved progress intact", () => {
    saveState({ challengeProgress: { b01: { completedAt: 1, xp: 50 } }, locale: "ar" });
    P.markScenarioComplete("tc01");
    const s = loadState();
    assert.equal(s.challengeProgress.b01.xp, 50);
    assert.equal(s.locale, "ar");
  });
  test("scenario XP is added to the total and level; breakdown and snapshot expose it", () => {
    P.markScenarioComplete("tc03"); P.markScenarioComplete("inv01");
    const t = computeTotals();
    assert.equal(t.scenarioXP, 100 + 200);
    assert.equal(t.totalXP, 300);
    assert.equal(t.level, 2);
    const snap = buildProgressSnapshot();
    assert.equal(snap.schema, "lpl-progress-v1");
    assert.deepEqual(snap.scenarios, { completed: 2, total: 5 });
    assert.equal(snap.xpBreakdown.scenarios, 300);
    for (const k of ["challenges", "labs", "quiz"]) assert.ok(k in snap.xpBreakdown);
  });
  test("resetAllProgress clears scenario progress but keeps language and theme", () => {
    saveState({ locale: "ar", theme: "light" });
    P.markScenarioComplete("tc01");
    resetAllProgress();
    assert.deepEqual(P.getScenarioProgress(), {});
    assert.equal(loadState().locale, "ar");
    assert.equal(loadState().theme, "light");
  });
});
