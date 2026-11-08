/**
 * tests/regression/sc01.test.js  (v2.13)
 * SC-01 "Sensitive configuration file exposure": initialization, authorized vs unauthorized
 * access, evidence-gated diagnosis, accepted and rejected remediations (judged by simulated
 * state), preservation of legitimate access, invalid transitions, hints, completion + report,
 * Arabic/English parity, progress persistence, and the investigation-engine extension's
 * backward compatibility with inv01. Every fix runs through the REAL terminal commands.
 */
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { installDomShim, createContainer } from "../helpers/dom-shim.js";
import { installLocalStorageShim, resetLocalStorageShim } from "../helpers/storage-shim.js";

installDomShim();
installLocalStorageShim();
const R = "../../assets/js/";
const { FS_TREE, findNode } = await import(R + "filesystem.js");
const { runCommand, resetTerminalState, getTerminalState, setCommandObserver } = await import(R + "terminal.js");
const S = await import(R + "engine/scenario.js");
const { createInvestigation } = await import(R + "engine/investigation.js");
const { checkPathAccess } = await import(R + "engine/users.js");
const { SCENARIOS, INVESTIGATIONS } = await import(R + "scenarios-data.js");
const { SCENARIOS_AR } = await import(R + "scenarios-data.ar.js");
const P = await import(R + "scenario-progress.js");
const { computeTotals } = await import(R + "progress.js");
const { loadState, saveState } = await import(R + "utils.js");
const { DICT } = await import(R + "i18n.js");

const sc01 = SCENARIOS.find((s) => s.id === "sc01");
const inv01 = SCENARIOS.find((s) => s.id === "inv01");
const BASE = "/srv/lab/sc01";
const DIR = `${BASE}/orbit/config`;
const CONF = `${DIR}/orbit.conf`;
const EXAMPLE = `${DIR}/orbit.conf.example`;
const baseTree = JSON.stringify(FS_TREE);
const term = createContainer();
const run = (l) => runCommand(l, term);
const AR = /[\u0600-\u06FF]/;

beforeEach(() => { resetLocalStorageShim(); resetTerminalState(); });
afterEach(() => { setCommandObserver(null); S.unloadScenario(); resetTerminalState(); });

/** A started investigation wired to the real terminal's observer hook. */
function begin() {
  const inv = createInvestigation(sc01);
  inv.start();
  setCommandObserver((ev) => inv.observe(ev));
  return inv;
}
const gatherEvidence = () => {
  run("su monitoring"); run(`cat ${CONF}`); run("exit");
  run(`stat ${CONF}`); run(`getfacl ${CONF}`); run("id alice");
};
const evaluate = () => S.evaluateChecks(sc01.checks);
const failedIds = () => evaluate().failedRequired.map((r) => r.id).sort();

/* ------------------------------------------------------------- initialization */
describe("SC-01: initialization", () => {
  test("is a registered investigation with unique id, XP and the authoring fields", () => {
    assert.ok(INVESTIGATIONS.includes(sc01));
    assert.equal(sc01.kind, "investigation");
    assert.equal(sc01.xp, 250);
    assert.equal(SCENARIOS.filter((s) => s.id === "sc01").length, 1);
    assert.ok(sc01.policy.length >= 4);
    assert.equal(sc01.diagnoses.filter((d) => d.correct).length, 1);
    assert.ok(sc01.diagnoses.length >= 4);
  });
  test("start() grafts the files, logs in as user with sudo and moves the shell into the scenario", () => {
    const inv = begin();
    assert.equal(inv.phase, "evidence");
    const conf = findNode(FS_TREE, CONF);
    assert.equal(conf.octal, "644");
    assert.equal(conf.owner, "deployer");
    assert.equal(conf.group, "deployer");
    assert.deepEqual(conf.acl, []);
    assert.equal(findNode(FS_TREE, EXAMPLE).octal, "644");
    assert.equal(findNode(FS_TREE, DIR).octal, "755");
    const st = getTerminalState();
    assert.equal(st.user, "user");
    assert.equal(st.cwd, `${BASE}/orbit`);
  });
  test("data is synthetic: placeholder markers, reserved .invalid host, no key material", () => {
    const note = findNode((S.loadScenario(sc01), FS_TREE), CONF).note;
    assert.match(note, /SYNTHETIC LAB DATA/);
    assert.match(note, /LAB-ONLY-PLACEHOLDER/);
    assert.match(note, /\.invalid/);
    assert.doesNotMatch(note, /BEGIN [A-Z ]*PRIVATE KEY|AKIA[0-9A-Z]{8}|ghp_|xox[bp]-|sk-[A-Za-z0-9]{10}/);
  });
  test("build() is deterministic, and reset() restores the original broken state", () => {
    assert.equal(JSON.stringify(sc01.build()), JSON.stringify(sc01.build()));
    const inv = begin();
    run(`sudo chmod 600 ${CONF}`);
    assert.equal(findNode(FS_TREE, CONF).octal, "600");
    inv.reset();
    assert.equal(findNode(FS_TREE, CONF).octal, "644");
    assert.equal(inv.phase, "evidence");
    assert.deepEqual(inv.state.evidence, {});
  });
  test("end() removes every trace from the shared filesystem", () => {
    const inv = begin(); run(`sudo chmod 000 ${CONF}`);
    inv.end();
    assert.equal(JSON.stringify(FS_TREE), baseTree);
  });
});

/* ------------------------------------------------- authorized vs unauthorized */
describe("SC-01: initial access matrix (the vulnerability is real in the simulation)", () => {
  test("unauthorized accounts CAN read the file before the fix", () => {
    begin();
    for (const u of ["user", "monitoring", "www-data"]) assert.equal(checkPathAccess(CONF, u, "r").ok, true, u);
  });
  test("authorized accounts have the access the policy describes", () => {
    begin();
    assert.equal(checkPathAccess(CONF, "deployer", "r").ok, true);
    assert.equal(checkPathAccess(CONF, "deployer", "w").ok, true);
    assert.equal(checkPathAccess(CONF, "alice", "r").ok, true);
    assert.equal(checkPathAccess(CONF, "alice", "w").ok, false);
  });
  test("the untouched scenario fails exactly the exposure checks, not the legitimate-access checks", () => {
    begin();
    assert.deepEqual(failedIds(), ["monitoring-denied", "no-other-readers", "not-world-readable", "www-denied"]);
  });
  test("the terminal really prints the file to monitoring before the fix, and refuses it after", () => {
    begin();
    run("su monitoring"); run(`cat ${CONF}`);
    assert.match(term.textContent || term.innerText || JSON.stringify(term), /LAB-ONLY-PLACEHOLDER/);
    run("exit");
    run(`sudo chmod 600 ${CONF}`); run(`sudo setfacl -m u:alice:r-- ${CONF}`);
    assert.equal(checkPathAccess(CONF, "monitoring", "r").ok, false);
  });
});

/* ------------------------------------------------------- remediation, by state */
const ACCEPTED = [
  ["chgrp adm + 640", [`sudo chgrp adm ${CONF}`, `sudo chmod 640 ${CONF}`]],
  ["640 + ACL for alice (group stays deployer)", [`sudo chmod 640 ${CONF}`, `sudo setfacl -m u:alice:r-- ${CONF}`]],
  ["600 + ACL for alice (chmod first)", [`sudo chmod 600 ${CONF}`, `sudo setfacl -m u:alice:r-- ${CONF}`]],
  ["600 + named-group ACL g:adm", [`sudo chmod 600 ${CONF}`, `sudo setfacl -m g:adm:r-- ${CONF}`]],
  ["run as the owner via sudo -u deployer", [`sudo -u deployer chmod 640 ${CONF}`, `sudo -u deployer setfacl -m u:alice:r-- ${CONF}`]],
];
const REJECTED = [
  ["no change at all", [], ["monitoring-denied", "no-other-readers", "not-world-readable", "www-denied"]],
  ["chmod 600 (blocks everyone, alice locked out)", [`sudo chmod 600 ${CONF}`], ["alice-reads"]],
  ["chmod 640 only (alice is not in group deployer)", [`sudo chmod 640 ${CONF}`], ["alice-reads"]],
  ["chmod 000 (blocks everyone including deployer)", [`sudo chmod 000 ${CONF}`], ["alice-reads", "deployer-reads", "deployer-writes"]],
  ["chmod 400 (deployer loses write)", [`sudo chgrp adm ${CONF}`, `sudo chmod 440 ${CONF}`], ["deployer-writes"]],
  ["chmod 777", [`sudo chmod 777 ${CONF}`], ["monitoring-denied", "no-other-readers", "not-world-readable", "only-deployer-writes", "www-denied", "no-world-write"]],
  ["chmod 666", [`sudo chmod 666 ${CONF}`], ["monitoring-denied", "no-other-readers", "not-world-readable", "only-deployer-writes", "www-denied", "no-world-write"]],
  ["chgrp adm alone (others bits unchanged)", [`sudo chgrp adm ${CONF}`], ["monitoring-denied", "no-other-readers", "not-world-readable", "www-denied"]],
  ["chgrp adm + 660 (alice can write)", [`sudo chgrp adm ${CONF}`, `sudo chmod 660 ${CONF}`], ["only-deployer-writes"]],
  ["chown to alice (deployer locked out)", [`sudo chown alice ${CONF}`, `sudo chmod 600 ${CONF}`], ["deployer-reads", "deployer-writes", "only-deployer-writes"]],
  ["delete the file", [`sudo rm ${CONF}`], null],
  ["deny-list ACLs on a still world-readable file", [
    `sudo setfacl -m u:alice:r-- ${CONF}`, `sudo setfacl -m u:monitoring:--- ${CONF}`,
    `sudo setfacl -m u:www-data:--- ${CONF}`, `sudo setfacl -m u:user:--- ${CONF}`,
  ], ["not-world-readable"]],
  ["lock the directory instead of the file", [`sudo chgrp adm ${DIR}`, `sudo chmod 750 ${DIR}`], ["not-world-readable", "template-public"]],
  ["lock the directory to 700", [`sudo chmod 700 ${DIR}`], ["alice-reads", "not-world-readable", "template-public"]],
  ["ACL first, then chmod 600 (mask collapses to ---, alice is locked out — measured on Linux 6.x)", [`sudo setfacl -m u:alice:r-- ${CONF}`, `sudo chmod 600 ${CONF}`], ["alice-reads"]],
  ["named-group ACL first, then chmod 600 (same trap)", [`sudo setfacl -m g:adm:r-- ${CONF}`, `sudo chmod 600 ${CONF}`], ["alice-reads"]],
  ["grant alice write through the ACL", [`sudo chmod 600 ${CONF}`, `sudo setfacl -m u:alice:rw- ${CONF}`], ["only-deployer-writes"]],
  ["open the template's secret neighbour: ACL for www-data", [`sudo chmod 600 ${CONF}`, `sudo setfacl -m u:alice:r-- ${CONF}`, `sudo setfacl -m u:www-data:r-- ${CONF}`], ["no-other-readers", "www-denied"]],
];

describe("SC-01: accepted remediations (judged by state, not by command string)", () => {
  for (const [name, cmds] of ACCEPTED) {
    test(name, () => {
      begin(); cmds.forEach(run);
      const r = evaluate();
      assert.deepEqual(r.failedRequired.map((x) => x.id), [], r.failedRequired.map((x) => x.detail).join(" | "));
      assert.equal(r.ok, true);
      assert.equal(checkPathAccess(CONF, "monitoring", "r").ok, false);
      assert.equal(checkPathAccess(CONF, "www-data", "r").ok, false);
      assert.equal(checkPathAccess(CONF, "user", "r").ok, false);
      assert.equal(checkPathAccess(CONF, "alice", "r").ok, true);
      assert.equal(checkPathAccess(CONF, "alice", "w").ok, false);
      assert.equal(checkPathAccess(CONF, "deployer", "r").ok, true);
      assert.equal(checkPathAccess(CONF, "deployer", "w").ok, true);
      assert.equal(checkPathAccess(EXAMPLE, "monitoring", "r").ok, true, "the public template stays readable");
    });
  }
});

describe("SC-01: rejected remediations (negative tests — each insecure or lock-out state must fail)", () => {
  for (const [name, cmds, expected] of REJECTED) {
    test(name, () => {
      begin(); cmds.forEach(run);
      const r = evaluate();
      assert.equal(r.ok, false, `${name} must NOT be accepted`);
      if (expected) for (const id of expected) assert.ok(r.failedRequired.some((x) => x.id === id), `${name}: expected '${id}' to fail, got ${failedIds().join(",")}`);
      else assert.ok(r.failedRequired.some((x) => /no longer exists/.test(x.detail)));
    });
  }
  test("the deny-list state fails ONLY the world-readable check (it is the check doing the work)", () => {
    begin();
    for (const c of REJECTED.find((x) => x[0].startsWith("deny-list"))[1]) run(c);
    assert.deepEqual(failedIds(), ["not-world-readable"]);
  });
  test("an unprivileged fix attempt changes nothing and so is not accepted", () => {
    begin(); run(`chmod 600 ${CONF}`);
    assert.equal(findNode(FS_TREE, CONF).octal, "644");
    assert.equal(evaluate().ok, false);
  });
});

describe("SC-01: advisory quality", () => {
  test("an execute bit on the config file passes but is flagged as more permissive than necessary", () => {
    begin(); run(`sudo chgrp adm ${CONF}`); run(`sudo chmod 750 ${CONF}`);
    const r = evaluate();
    assert.equal(r.ok, true);
    assert.deepEqual(r.advisories.map((a) => a.id), ["no-exec-bits"]);
  });
  test("640 produces no advisory", () => {
    begin(); run(`sudo chgrp adm ${CONF}`); run(`sudo chmod 640 ${CONF}`);
    assert.deepEqual(evaluate().advisories, []);
  });
});

/* ------------------------------------------------------------------- evidence */
describe("SC-01: evidence gating", () => {
  test("diagnosis is locked until all four required evidence items exist", () => {
    const inv = begin();
    assert.deepEqual(inv.diagnose("file-others"), { ok: false, reason: "locked", missing: ["reproduce", "metadata", "acl", "identities"] });
    run("su monitoring"); run(`cat ${CONF}`); run("exit");
    run(`stat ${CONF}`);
    assert.equal(inv.phase, "evidence");
    run(`getfacl ${CONF}`);
    assert.equal(inv.phase, "evidence");
    run("id alice");
    assert.equal(inv.phase, "diagnosis");
  });
  test("evidence is recognised by what was inspected, as whom — not by any command", () => {
    const inv = begin();
    run(`cat ${CONF}`);                    // as user: counts as an unauthorized read
    assert.ok(inv.state.evidence.reproduce);
    inv.reset(); setCommandObserver((ev) => inv.observe(ev));
    run(`sudo cat ${CONF}`);               // as root: root is not an "unauthorized account"
    run("su alice"); run(`cat ${CONF}`); run("exit");   // alice is authorized
    run(`cat ${EXAMPLE}`);                 // the template
    assert.equal(inv.state.evidence.reproduce, undefined);
    run("ls"); run(`ls ${DIR}`);           // names only, no metadata
    run(`stat ${EXAMPLE}`);
    assert.equal(inv.state.evidence.metadata, undefined);
    run(`getfacl ${DIR}`); run(`getfacl ${EXAMPLE}`);
    assert.equal(inv.state.evidence.acl, undefined);
    run("id"); run("whoami"); run("id nobody-here");
    assert.equal(inv.state.evidence.identities, undefined);
  });
  test("metadata evidence also accepts ls -l on the directory (by argument or from inside it)", () => {
    let inv = begin(); run(`ls -l ${DIR}`);
    assert.ok(inv.state.evidence.metadata);
    inv = begin(); run(`cd ${DIR}`); run("ls -la");
    assert.ok(inv.state.evidence.metadata);
  });
  test("each finding is computed from the live state and cites the real values", () => {
    const inv = begin(); gatherEvidence();
    const e = inv.state.evidence;
    assert.match(e.reproduce.finding, /monitoring can read .*orbit\.conf.*others class/);
    assert.match(e.metadata.finding, /mode 644, deployer:deployer/);
    assert.match(e.metadata.finding, /others bits r--/);
    assert.match(e.acl.finding, /no named ACL entries/);
    assert.match(e.identities.finding, /uid=1001\(alice\).*adm/);
  });
  test("an ACL finding lists real entries when some exist", () => {
    const inv = begin(); run(`sudo setfacl -m u:alice:r-- ${CONF}`); run(`getfacl ${CONF}`);
    assert.match(inv.state.evidence.acl.finding, /u:alice:r--/);
  });
  test("a reproduction after an early fix honestly reports 'denied' instead of claiming exposure", () => {
    const inv = begin(); run(`sudo chmod 600 ${CONF}`); run("su monitoring"); run(`cat ${CONF}`);
    assert.match(inv.state.evidence.reproduce.finding, /currently denied/);
  });
});

/* ------------------------------------------------------------------ diagnosis */
describe("SC-01: diagnosis", () => {
  test("every wrong diagnosis is refused with an explanation from the live state; learner may retry", () => {
    const inv = begin(); gatherEvidence();
    for (const d of sc01.diagnoses.filter((x) => !x.correct)) {
      const r = inv.diagnose(d.id);
      assert.equal(r.ok, true); assert.equal(r.correct, false);
      assert.ok(r.feedback.length > 40, d.id);
      assert.equal(inv.phase, "diagnosis", d.id);
    }
    assert.equal(inv.state.diagnosisAttempts.length, 4);
  });
  test("wrong-diagnosis feedback quotes real state (file modes / ACL / owner)", () => {
    const inv = begin(); gatherEvidence();
    assert.match(inv.diagnose("example-file").feedback, /orbit\.conf\.example is mode 644/);
    assert.match(inv.diagnose("directory").feedback, /config is mode 755/);
    assert.match(inv.diagnose("named-acl").feedback, /no named ACL entries/);
    assert.match(inv.diagnose("wrong-owner").feedback, /deployer is the right owner/);
  });
  test("the ACL diagnosis would NOT be dismissed if an ACL entry really existed", () => {
    const inv = begin(); run(`sudo setfacl -m u:monitoring:r-- ${CONF}`); gatherEvidence();
    assert.match(inv.diagnose("named-acl").feedback, /u:monitoring:r--/);
    assert.doesNotMatch(inv.diagnose("named-acl").feedback, /Not the cause/);
  });
  test("the correct diagnosis moves to remediation and explains with live modes", () => {
    const inv = begin(); gatherEvidence();
    const r = inv.diagnose("file-others");
    assert.equal(r.correct, true); assert.equal(r.phase, "remediation");
    assert.match(r.feedback, /mode 644/); assert.match(r.feedback, /monitoring: others → r--/);
  });
  test("diagnosing after an early fix skips straight to verification and says the exposure is closed", () => {
    const inv = begin(); gatherEvidence();
    run(`sudo chgrp adm ${CONF}`); run(`sudo chmod 640 ${CONF}`);
    const r = inv.diagnose("file-others");
    assert.equal(r.phase, "verification");
    assert.match(r.feedback, /already ---/);
  });
  test("unknown diagnosis ids are rejected without side effects", () => {
    const inv = begin(); gatherEvidence();
    assert.deepEqual(inv.diagnose("<img src=x onerror=alert(1)>"), { ok: false, reason: "unknown-choice" });
    assert.equal(inv.state.diagnosisAttempts.length, 0);
  });
});

/* -------------------------------------------------- invalid state transitions */
describe("SC-01: invalid state transitions", () => {
  test("before start: no diagnosis, no fix check, observed commands are ignored", () => {
    const inv = createInvestigation(sc01);
    assert.equal(inv.phase, "briefing");
    assert.deepEqual(inv.diagnose("file-others"), { ok: false, reason: "not-started" });
    assert.equal(inv.checkFix().reason, "wrong-phase");
    inv.observe({ cmd: "cat", args: [CONF], user: "monitoring", cwd: "/", paths: [CONF] });
    assert.deepEqual(inv.state.evidence, {});
    assert.equal(inv.summary(), null);
  });
  test("checkFix is refused during evidence and diagnosis", () => {
    const inv = begin();
    assert.equal(inv.checkFix().reason, "wrong-phase");
    gatherEvidence();
    assert.equal(inv.phase, "diagnosis");
    assert.equal(inv.checkFix().reason, "wrong-phase");
  });
  test("a correct diagnosis cannot be submitted twice, and the summary stays null until complete", () => {
    const inv = begin(); gatherEvidence(); inv.diagnose("file-others");
    assert.equal(inv.diagnose("file-others").reason, "already-diagnosed");
    assert.equal(inv.summary(), null);
  });
  test("verification probes run before the fix passes are ignored", () => {
    const inv = begin(); gatherEvidence(); inv.diagnose("file-others");
    assert.equal(inv.phase, "remediation");
    run("su monitoring"); run(`cat ${CONF}`); run("exit"); run("su alice"); run(`cat ${CONF}`); run("exit");
    assert.deepEqual(inv.state.verified, {});
    assert.equal(inv.phase, "remediation");
  });
  test("a failing fix check keeps the learner in remediation and counts the attempt", () => {
    const inv = begin(); gatherEvidence(); inv.diagnose("file-others");
    run(`sudo chmod 600 ${CONF}`);
    const r = inv.checkFix();
    assert.equal(r.fixed, false); assert.equal(inv.phase, "remediation");
    assert.equal(inv.state.fixAttempts, 1);
    assert.ok(r.result.failedRequired.some((x) => x.id === "alice-reads"));
  });
  test("after completion, further commands change nothing", () => {
    const inv = solve(); const snap = JSON.stringify(inv.state);
    run("su monitoring"); run(`cat ${CONF}`);
    assert.equal(inv.phase, "complete"); assert.equal(JSON.stringify(inv.state), snap);
  });
});

/* ---------------------------------------------- verification & completion */
function toVerification(fixCmds = [`sudo chgrp adm ${CONF}`, `sudo chmod 640 ${CONF}`]) {
  const inv = begin(); gatherEvidence(); inv.diagnose("file-others");
  fixCmds.forEach(run);
  const r = inv.checkFix();
  assert.equal(r.fixed, true, "fix should pass"); assert.equal(inv.phase, "verification");
  return inv;
}
function solve(fixCmds) {
  const inv = toVerification(fixCmds);
  run("su monitoring"); run(`cat ${CONF}`); run("exit");
  run("su alice"); run(`cat ${CONF}`); run("exit");
  assert.equal(inv.phase, "complete");
  return inv;
}

describe("SC-01: verification and completion", () => {
  test("a passing fix alone does NOT complete the case: both verification probes are required", () => {
    const inv = toVerification();
    assert.deepEqual(inv.state.missingVerification, ["denied", "allowed"]);
    assert.deepEqual(P.getScenarioProgress(), {});
  });
  test("only the 'denied' probe → still verifying; only the 'allowed' probe → still verifying", () => {
    let inv = toVerification();
    run("su www-data"); run(`cat ${CONF}`);
    assert.equal(inv.phase, "verification"); assert.deepEqual(inv.state.missingVerification, ["allowed"]);
    inv = toVerification();
    run("su deployer"); run(`cat ${CONF}`);
    assert.equal(inv.phase, "verification"); assert.deepEqual(inv.state.missingVerification, ["denied"]);
  });
  test("probes must come from the right accounts (root/user reads do not count)", () => {
    const inv = toVerification();
    run(`cat ${CONF}`); run(`sudo cat ${CONF}`); run("su alice"); run(`cat ${EXAMPLE}`);
    assert.equal(inv.phase, "verification");
    assert.ok(inv.state.verified.allowed === undefined || inv.state.verified.allowed);
    assert.equal(inv.state.verified.denied, undefined);
  });
  test("every accepted remediation completes the case end to end", () => {
    for (const [name, cmds] of ACCEPTED) {
      const inv = solve(cmds);
      assert.equal(inv.phase, "complete", name);
      assert.equal(inv.summary().quality, "minimal", name);
      inv.end(); resetTerminalState();
    }
  });
  test("undoing the fix between probes reopens remediation and clears the probes", () => {
    const inv = toVerification();
    run("su monitoring"); run(`cat ${CONF}`); run("exit");
    run(`sudo chmod 644 ${CONF}`);
    run("su alice"); run(`cat ${CONF}`);
    assert.equal(inv.phase, "remediation");
    assert.deepEqual(inv.state.verified, {});
    assert.equal(inv.state.missingVerification.length, 2);
  });
  test("the incident report is built from the learner's own evidence, final state and verification", () => {
    const inv = solve();
    const s = inv.summary();
    assert.deepEqual(s.report.evidence.map((e) => e.id), ["reproduce", "metadata", "acl", "identities"]);
    assert.ok(s.report.evidence.every((e) => e.command && e.finding));
    assert.match(s.report.remediation, /orbit\.conf: mode 640, deployer:adm, no ACL entries/);
    assert.equal(s.finalState, s.report.remediation);
    assert.deepEqual(s.report.verification.probes.map((p) => p.id), ["denied", "allowed"]);
    assert.match(s.report.verification.probes[0].command, /^monitoring: cat /);
    assert.match(s.report.verification.probes[1].command, /^alice: cat /);
    assert.ok(s.report.verification.checks.filter((c) => c.level === "required").every((c) => c.ok));
    assert.equal(s.quality, "minimal"); assert.equal(s.wrongDiagnoses, 0);
  });
  test("the report records an ACL-based remediation as such", () => {
    const s = solve([`sudo chmod 600 ${CONF}`, `sudo setfacl -m u:alice:r-- ${CONF}`]).summary();
    assert.match(s.report.remediation, /mode 640, deployer:deployer, ACL u:alice:r-- \(mask r--\)/);
  });
  test("wrong diagnoses and hints are counted in the summary; a broad fix is reported as broad", () => {
    const inv = begin(); gatherEvidence();
    inv.diagnose("directory"); inv.diagnose("wrong-owner"); inv.nextHint();
    inv.diagnose("file-others");
    run(`sudo chgrp adm ${CONF}`); run(`sudo chmod 750 ${CONF}`); inv.checkFix();
    run("su monitoring"); run(`cat ${CONF}`); run("exit"); run("su deployer"); run(`cat ${CONF}`);
    const s = inv.summary();
    assert.equal(s.wrongDiagnoses, 2); assert.equal(s.quality, "broad"); assert.ok(s.hintsUsed >= 1);
  });
});

/* ---------------------------------------------------------------------- hints */
describe("SC-01: hints", () => {
  const PHASES = ["evidence", "diagnosis", "remediation", "verification"];
  test("each phase has hints, revealed one at a time and never past the end", () => {
    for (const p of PHASES) assert.ok(sc01.hints[p].length >= 1, p);
    const inv = begin();
    const seen = [];
    for (let i = 0; i < sc01.hints.evidence.length; i += 1) { const h = inv.nextHint(); seen.push(h.text); assert.equal(h.index, i + 1); }
    assert.deepEqual(seen, sc01.hints.evidence);
    assert.equal(inv.nextHint(), null);
    assert.equal(inv.hintsFor("evidence").length, sc01.hints.evidence.length);
    assert.equal(inv.hintsFor("diagnosis").length, 0, "no leakage between phases");
  });
  test("the first hint of every phase does not reveal the fix", () => {
    const solution = /chmod\s+\d|chgrp|setfacl|640|600|\badm\b/;
    for (const p of PHASES) assert.doesNotMatch(sc01.hints[p][0], solution, p);
    for (const h of [...sc01.hints.evidence, ...sc01.hints.diagnosis]) assert.doesNotMatch(h, solution);
    assert.doesNotMatch(sc01.hints.remediation[0] + sc01.hints.remediation[1], solution);
  });
  test("only the final remediation hint names the commands, and it gives routes, not a single command line", () => {
    const last = sc01.hints.remediation.at(-1);
    assert.match(last, /chmod/); assert.match(last, /setfacl/);
    assert.match(last, /chmod before setfacl|chmod.*before.*setfacl/);
    assert.doesNotMatch(last, /chmod 777/);
  });
  test("hint use is recorded per phase and reset by start()", () => {
    const inv = begin(); inv.nextHint(); inv.nextHint();
    assert.equal(inv.state.hintCounts.evidence, 2); assert.equal(inv.state.hintsUsed, 2);
    inv.start();
    assert.equal(inv.state.hintsUsed, 0); assert.equal(inv.hintsFor("evidence").length, 0);
  });
  test("verification hint is available once verifying", () => {
    const inv = toVerification();
    assert.equal(inv.nextHint().text, sc01.hints.verification[0]);
  });
});

/* ------------------------------------------------------------- localization */
describe("SC-01: Arabic and English parity", () => {
  const a = SCENARIOS_AR.sc01;
  const keys = (o) => Object.keys(o).sort();
  test("every translatable field exists in Arabic, with the same shape", () => {
    assert.ok(AR.test(a.title) && AR.test(a.incident) && AR.test(a.rootCause));
    assert.equal(a.objectives.length, sc01.objectives.length);
    assert.equal(a.policy.length, sc01.policy.length);
    assert.deepEqual(keys(a.evidence), sc01.evidence.map((e) => e.id).sort());
    assert.deepEqual(keys(a.diagnoses), sc01.diagnoses.map((d) => d.id).sort());
    assert.deepEqual(keys(a.checks), sc01.checks.map((c) => c.id).sort());
    assert.deepEqual(keys(a.verification), sc01.verification.map((p) => p.id).sort());
    assert.deepEqual(keys(a.hints), keys(sc01.hints));
    for (const p of Object.keys(sc01.hints)) assert.equal(a.hints[p].length, sc01.hints[p].length, p);
    assert.deepEqual(keys(a.qualityText), keys(sc01.qualityText));
  });
  test("every Arabic string is non-empty and actually Arabic", () => {
    const all = [a.title, a.incident, a.rootCause, ...a.objectives, ...a.policy, ...Object.values(a.evidence), ...Object.values(a.checks),
      ...Object.values(a.verification), ...Object.values(a.qualityText), ...Object.values(a.hints).flat(),
      ...Object.values(a.diagnoses).flatMap((d) => [d.label, d.why])];
    for (const s of all) assert.ok(s.trim() && AR.test(s), s);
  });
  test("Arabic keeps paths, account names and commands verbatim so they can still be typed", () => {
    assert.ok(a.incident.includes("/srv/lab/sc01/orbit/config/orbit.conf"));
    const policy = a.policy.join(" ");
    for (const w of ["alice", "deployer", "monitoring", "www-data", "orbit.conf.example"]) assert.ok(policy.includes(w), w);
    const rem = a.hints.remediation.join(" ");
    for (const w of ["chmod", "setfacl", "sudo", "640"]) assert.ok(rem.includes(w), w);
    assert.ok(a.hints.evidence.join(" ").includes("su monitoring"));
  });
  test("policy facts agree across languages (same accounts, same modes)", () => {
    const pick = (s) => (s.match(/alice|deployer|monitoring|www-data|user/g) || []).filter((v, i, arr) => arr.indexOf(v) === i).sort().join();
    sc01.policy.forEach((line, i) => assert.equal(pick(a.policy[i]), pick(line), `policy[${i}]`));
    for (const id of Object.keys(sc01.hints)) sc01.hints[id].forEach((h, i) => {
      const nums = (x) => (x.match(/\b(640|600|644|755|777)\b/g) || []).sort().join();
      assert.equal(nums(a.hints[id][i]), nums(h), `${id}[${i}]`);
    });
  });
  test("new sc.* UI strings exist, are non-empty and differ between EN and AR", () => {
    for (const k of ["sc.policy", "sc.verify.pending", "sc.verify.desc2", "sc.report.title", "sc.report.cause", "sc.report.evidence", "sc.report.remediation", "sc.report.verification"]) {
      assert.ok(DICT.en[k] && DICT.en[k].trim(), k); assert.ok(AR.test(DICT.ar[k]), k); assert.notEqual(DICT.ar[k], DICT.en[k], k);
    }
  });
});

/* ------------------------------------------------------------------ progress */
describe("SC-01: progress persistence and regression compatibility", () => {
  test("completion is stored once under scenarioProgress and never awards XP twice", () => {
    P.markScenarioComplete("sc01", { attempts: 3, hintsUsed: 1 }); P.markScenarioComplete("sc01");
    const p = P.getScenarioProgress();
    assert.equal(Object.keys(p).length, 1); assert.equal(p.sc01.xp, 250); assert.equal(p.sc01.attempts, 3);
    assert.equal(computeTotals().scenarioXP, 250);
  });
  test("state saved by v2.12.1 (without sc01) loads unchanged and keeps its own XP", () => {
    saveState({ scenarioProgress: { inv01: { completedAt: 1, xp: 200, attempts: 1, hintsUsed: 0 }, tc02: { completedAt: 2, xp: 75 } }, locale: "ar" });
    assert.equal(P.scenarioTotalXP(), 275);
    P.markScenarioComplete("sc01");
    assert.equal(P.scenarioTotalXP(), 525);
    assert.equal(loadState().scenarioProgress.inv01.xp, 200); assert.equal(loadState().locale, "ar");
  });
  test("malformed stored progress reads as empty and an unknown id is ignored", () => {
    saveState({ scenarioProgress: [1, 2] }); assert.deepEqual(P.getScenarioProgress(), {});
    P.markScenarioComplete("sc99"); assert.deepEqual(P.getScenarioProgress(), {});
  });
  test("no progress is recorded until the verification probes pass (progress is written by the UI on completion only)", () => {
    toVerification(); assert.deepEqual(P.getScenarioProgress(), {});
  });
});

/* -------------------------------------------------- existing scenarios intact */
describe("existing scenarios remain functional after the engine extension", () => {
  const I = "/srv/lab/inv01"; const FILE = `${I}/app/current/public/index.html`; const CUR = `${I}/app/current`;
  test("inv01 still has no verification probes and completes through its single verify() predicate", () => {
    assert.equal(inv01.verification, undefined);
    const inv = createInvestigation(inv01); inv.start(); setCommandObserver((ev) => inv.observe(ev));
    run("su www-data"); run(`cat ${FILE}`); run("exit"); run(`stat ${FILE}`); run(`ls -l ${I}/app`);
    assert.equal(inv.phase, "diagnosis");
    assert.equal(inv.diagnose("dir-search").correct, true);
    run(`chmod 711 ${CUR}`); assert.equal(inv.checkFix().fixed, true);
    assert.deepEqual(inv.state.missingVerification, []);
    run("su www-data"); run(`cat ${FILE}`);
    assert.equal(inv.phase, "complete");
    assert.equal(inv.summary().quality, "minimal");
    assert.equal(inv.summary().report, undefined, "inv01 keeps its original summary shape");
  });
  test("loading and unloading every scenario in sequence leaves the filesystem untouched", () => {
    for (const s of SCENARIOS) { S.startScenario(s); S.unloadScenario(); }
    resetTerminalState();
    assert.equal(JSON.stringify(FS_TREE), baseTree);
  });
  test("loading SC-01 and then inv01 replaces it cleanly (one active scenario at a time)", () => {
    S.startScenario(sc01); S.startScenario(inv01);
    assert.equal(findNode(FS_TREE, BASE), null); assert.ok(findNode(FS_TREE, "/srv/lab/inv01"));
  });
});
