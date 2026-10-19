/**
 * tests/engine/investigation.test.js
 * engine/investigation.js — phase transitions, evidence gating, diagnosis
 * handling, state-based remediation, verification and per-phase hints,
 * driven through the REAL terminal (runCommand) and the real inv01 scenario.
 */
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { installDomShim, createContainer, outputText } from "../helpers/dom-shim.js";
import { installLocalStorageShim } from "../helpers/storage-shim.js";

installDomShim();
installLocalStorageShim();
const R = "../../assets/js/";
const { FS_TREE, findNode } = await import(R + "filesystem.js");
const { runCommand, resetTerminalState, setCommandObserver } = await import(R + "terminal.js");
const { createInvestigation, normalizeCommand } = await import(R + "engine/investigation.js");
const { INVESTIGATIONS } = await import(R + "scenarios-data.js");

const def = INVESTIGATIONS[0];
const I = "/srv/lab/inv01";
const FILE = `${I}/app/current/public/index.html`;
const CUR = `${I}/app/current`;
const c = createContainer();
let inv;
const run = (line) => runCommand(line, c);
const treeJSON = () => JSON.stringify(FS_TREE);
const base = treeJSON();

/** Gather all three required pieces of evidence like a real learner would. */
function gatherEvidence() {
  run("su www-data"); run(`cat ${FILE}`); run("exit");
  run(`stat ${FILE}`);
  run(`ls -l ${I}/app`);
}

beforeEach(() => {
  resetTerminalState();
  inv = createInvestigation(def);
  setCommandObserver((ev) => inv.observe(ev));
});
afterEach(() => { setCommandObserver(null); inv.end(); resetTerminalState(); });

describe("normalizeCommand", () => {
  test("sudo <cmd> runs as root; sudo -u x <cmd> runs as x", () => {
    assert.deepEqual(normalizeCommand({ cmd: "sudo", args: ["cat", "f"], user: "user", cwd: "/", paths: [] }).user, "root");
    const n = normalizeCommand({ cmd: "sudo", args: ["-u", "www-data", "cat", "f"], user: "user", cwd: "/", paths: [] });
    assert.deepEqual([n.cmd, n.user, n.args], ["cat", "www-data", ["f"]]);
  });
  test("plain commands pass through; bare sudo flags do not crash", () => {
    assert.equal(normalizeCommand({ cmd: "ls", args: ["-l"], user: "user" }).cmd, "ls");
    assert.equal(normalizeCommand({ cmd: "sudo", args: ["-l"], user: "user" }).cmd, "sudo");
    assert.equal(normalizeCommand({ cmd: "sudo", args: [], user: "user" }).cmd, "sudo");
  });
});

describe("initial conditions are internally consistent", () => {
  test("before start there is no scenario in the filesystem", () => {
    assert.equal(inv.phase, "briefing");
    assert.equal(treeJSON(), base);
  });
  test("start builds the broken environment: file is fine, directory blocks www-data", () => {
    inv.start();
    assert.equal(inv.phase, "evidence");
    assert.equal(findNode(FS_TREE, FILE).octal, "644");
    assert.equal(findNode(FS_TREE, CUR).octal, "700");
    run("su www-data"); run(`cat ${FILE}`);
    assert.match(outputText(c).split("\n").slice(-3).join("\n"), /Permission denied/);
    run("exit");
    assert.equal(inv.state.hintsUsed, 0);
  });
  test("the untouched state fails the fix checks", () => {
    inv.start();
    assert.equal(inv.checkFix().reason, "wrong-phase");
  });
});

describe("evidence collection", () => {
  test("commands before start are ignored", () => {
    run(`ls -l ${I}`);
    assert.deepEqual(inv.state.evidence, {});
  });

  test("each required item is only ticked by the matching inspection", () => {
    inv.start();
    run("ls /tmp"); run("whoami");
    assert.deepEqual(Object.keys(inv.state.evidence), []);
    run(`stat ${FILE}`);                                   // as 'user' → file-mode only
    assert.deepEqual(Object.keys(inv.state.evidence), ["file-mode"]);
    run(`ls -l ${I}/app`);                                 // directory chain
    assert.deepEqual(Object.keys(inv.state.evidence).sort(), ["dir-chain", "file-mode"]);
    assert.equal(inv.phase, "evidence", "still missing the reproduction");
  });

  test("reproducing as the OWNER does not count — it must be the affected account", () => {
    inv.start();
    run(`cat ${FILE}`);
    assert.equal(inv.state.evidence.reproduce, undefined);
  });

  test("evidence findings quote the real simulated state", () => {
    inv.start(); gatherEvidence();
    const e = inv.state.evidence;
    assert.match(e.reproduce.finding, /www-data/);
    assert.match(e.reproduce.finding, /700/);
    assert.match(e["file-mode"].finding, /644/);
    assert.match(e["dir-chain"].finding, /current/);
  });

  test("a failed (denied) command still counts as evidence of the failure", () => {
    inv.start();
    run("su www-data"); run(`ls ${CUR}/public`);
    assert.ok(inv.state.evidence.reproduce);
  });

  test("sudo-wrapped inspection is attributed to the right account", () => {
    inv.start();
    run(`sudo -u www-data cat ${FILE}`);
    assert.ok(inv.state.evidence.reproduce);
  });

  test("all required evidence moves the phase to diagnosis", () => {
    inv.start(); gatherEvidence();
    assert.equal(inv.phase, "diagnosis");
    assert.deepEqual(inv.state.missingEvidence, []);
  });
});

describe("diagnosis", () => {
  test("is locked until the evidence is in, and says what is missing", () => {
    inv.start();
    const r = inv.diagnose("dir-search");
    assert.equal(r.ok, false);
    assert.equal(r.reason, "locked");
    assert.deepEqual(r.missing.sort(), ["dir-chain", "file-mode", "reproduce"]);
    assert.equal(inv.phase, "evidence");
  });
  test("before start → not-started", () => assert.equal(inv.diagnose("dir-search").reason, "not-started"));

  test("a wrong diagnosis keeps the phase, is counted, and is answered from live state", () => {
    inv.start(); gatherEvidence();
    const r = inv.diagnose("file-mode");
    assert.deepEqual([r.ok, r.correct], [true, false]);
    assert.match(r.feedback, /644/);
    assert.match(r.feedback, /not the cause|Not the cause/i);
    assert.equal(inv.phase, "diagnosis");
    assert.deepEqual(inv.state.diagnosisAttempts, [{ id: "file-mode", correct: false }]);
  });

  test("every wrong choice can be tried and yields feedback; none advances", () => {
    inv.start(); gatherEvidence();
    for (const id of ["file-mode", "group", "owner"]) {
      const r = inv.diagnose(id);
      assert.equal(r.correct, false, id);
      assert.ok(r.feedback.length > 20);
    }
    assert.equal(inv.phase, "diagnosis");
  });

  test("an unknown choice is rejected without side effects", () => {
    inv.start(); gatherEvidence();
    assert.equal(inv.diagnose("nonsense").reason, "unknown-choice");
    assert.deepEqual(inv.state.diagnosisAttempts, []);
  });

  test("the correct diagnosis names the directory that really blocks www-data", () => {
    inv.start(); gatherEvidence();
    const r = inv.diagnose("dir-search");
    assert.equal(r.correct, true);
    assert.match(r.feedback, /app\/current/);
    assert.match(r.feedback, /700/);
    assert.equal(inv.phase, "remediation");
  });

  test("diagnosing again after the phase has moved on is refused", () => {
    inv.start(); gatherEvidence(); inv.diagnose("dir-search");
    assert.equal(inv.diagnose("group").reason, "already-diagnosed");
  });

  test("if the learner already fixed it, a correct diagnosis jumps straight to verification", () => {
    inv.start(); gatherEvidence();
    run(`chmod 711 ${CUR}`);
    assert.equal(inv.diagnose("dir-search").phase, "verification");
  });
});

describe("remediation is judged by state", () => {
  const toRemediation = () => { inv.start(); gatherEvidence(); inv.diagnose("dir-search"); };

  test("checkFix is refused outside remediation/verification", () => {
    inv.start();
    assert.equal(inv.checkFix().ok, false);
  });

  test("no change → not fixed, attempt counted, phase unchanged", () => {
    toRemediation();
    const r = inv.checkFix();
    assert.deepEqual([r.ok, r.fixed, inv.phase], [true, false, "remediation"]);
    assert.ok(r.result.failedRequired.some((f) => f.id === "web-reads"));
    assert.equal(inv.state.fixAttempts, 1);
  });

  test("the wrong fix (changing the FILE) does not pass", () => {
    toRemediation();
    run(`chmod 755 ${FILE}`);
    assert.equal(inv.checkFix().fixed, false);
  });

  test("chmod 777 is rejected: it unblocks www-data but breaks a required constraint", () => {
    toRemediation();
    run(`chmod 777 ${CUR}`);
    const r = inv.checkFix();
    assert.equal(r.fixed, false);
    assert.ok(r.result.failedRequired.some((f) => f.id === "no-world-write"));
  });

  test("exposing the secrets file is rejected even though the site would load", () => {
    toRemediation();
    run(`chmod 711 ${CUR}`); run(`chmod 644 ${CUR}/config.env`);
    const r = inv.checkFix();
    assert.equal(r.fixed, false);
    assert.ok(r.result.failedRequired.some((f) => f.id === "secrets-private"));
  });

  test("deleting the page is not a fix", () => {
    toRemediation();
    run(`rm ${FILE}`);
    assert.equal(inv.checkFix().fixed, false);
  });

  for (const [name, cmds] of [
    ["chmod 711", [`chmod 711 ${CUR}`]],
    ["chgrp www-data + chmod 710", [`sudo chgrp www-data ${CUR}`, `chmod 710 ${CUR}`]],
    ["a named ACL entry (--x)", [`setfacl -m u:www-data:--x ${CUR}`]],
  ]) {
    test(`minimal fix passes with no advisory: ${name}`, () => {
      toRemediation();
      cmds.forEach(run);
      const r = inv.checkFix();
      assert.equal(r.fixed, true);
      assert.deepEqual(r.result.advisories, []);
      assert.equal(inv.phase, "verification");
    });
  }

  test("chmod 755 works but raises the 'more permissive than necessary' advisory", () => {
    toRemediation();
    run(`chmod 755 ${CUR}`);
    const r = inv.checkFix();
    assert.equal(r.fixed, true);
    assert.deepEqual(r.result.advisories.map((a) => a.id), ["not-broader"]);
  });
});

describe("verification and completion", () => {
  const toVerification = (fix = `chmod 711 ${CUR}`) => { inv.start(); gatherEvidence(); inv.diagnose("dir-search"); run(fix); inv.checkFix(); };

  test("fixing is not enough: the phase completes only after re-checking as www-data", () => {
    toVerification();
    run(`cat ${FILE}`);                  // as 'user' — wrong account
    assert.equal(inv.phase, "verification");
    run("su www-data"); run(`cat ${FILE}`);
    assert.equal(inv.phase, "complete");
  });

  test("completion carries an evidence-based summary (minimal fix)", () => {
    toVerification();
    run("su www-data"); run(`cat ${FILE}`);
    const s = inv.summary();
    assert.match(s.finalState, /app\/current: mode 711/);
    assert.equal(s.quality, "minimal");
    assert.equal(s.wrongDiagnoses, 0);
  });

  test("summary reflects a broad fix, wrong diagnoses and hints used", () => {
    inv.start(); gatherEvidence();
    inv.diagnose("owner"); inv.diagnose("group"); inv.diagnose("dir-search");
    inv.nextHint();
    run(`chmod 755 ${CUR}`); inv.checkFix();
    run("su www-data"); run(`ls ${I}/app/current/public`);
    const s = inv.summary();
    assert.equal(s.quality, "broad");
    assert.equal(s.wrongDiagnoses, 2);
    assert.equal(s.hintsUsed, 1);
  });

  test("summary is null until complete", () => {
    toVerification();
    assert.equal(inv.summary(), null);
  });

  test("if the fix is undone before verification, the phase falls back to remediation", () => {
    toVerification();
    run(`chmod 700 ${CUR}`);
    run("su www-data"); run(`cat ${FILE}`);
    assert.equal(inv.phase, "remediation");
  });

  test("commands after completion do not change the outcome", () => {
    toVerification();
    run("su www-data"); run(`cat ${FILE}`);
    run("exit"); run(`chmod 000 ${CUR}`);
    assert.equal(inv.phase, "complete");
  });
});

describe("hints are per phase and progressive", () => {
  test("no hints before start", () => assert.equal(inv.nextHint(), null));

  test("evidence hints go from least to most revealing, one at a time", () => {
    inv.start();
    const h1 = inv.nextHint(); const h2 = inv.nextHint(); const h3 = inv.nextHint();
    assert.deepEqual([h1.index, h2.index, h3.index, h3.last], [1, 2, 3, true]);
    assert.doesNotMatch(h1.text, /chmod|711|755|x \(search\)/i, "first hint reveals no solution");
    assert.equal(inv.nextHint(), null);
    assert.equal(inv.hintsFor("evidence").length, 3);
  });

  test("a new phase offers its own hints; earlier counts are kept", () => {
    inv.start(); inv.nextHint();
    gatherEvidence();
    assert.equal(inv.phase, "diagnosis");
    assert.equal(inv.hintsFor().length, 0);
    assert.equal(inv.nextHint().phase, "diagnosis");
    assert.equal(inv.state.hintCounts.evidence, 1);
    assert.equal(inv.state.hintsUsed, 2);
  });

  test("the full solution only appears in the last remediation hint", () => {
    inv.start(); gatherEvidence(); inv.diagnose("dir-search");
    const hs = [inv.nextHint(), inv.nextHint(), inv.nextHint()];
    assert.doesNotMatch(hs[0].text, /chmod|711/);
    assert.doesNotMatch(hs[1].text, /chmod 711/);
    assert.match(hs[2].text, /711/);
    assert.doesNotMatch(hs[2].text, /777\b(?!\.)/, "never recommends 777 as a fix (it only warns against it)");
  });
});

describe("reset", () => {
  test("restores the ORIGINAL simulated state and starts the investigation over", () => {
    inv.start(); gatherEvidence(); inv.diagnose("dir-search");
    run(`chmod 711 ${CUR}`); inv.checkFix(); inv.nextHint();
    inv.reset();
    assert.equal(findNode(FS_TREE, CUR).octal, "700");
    assert.equal(inv.phase, "evidence");
    assert.deepEqual(inv.state.evidence, {});
    assert.deepEqual(inv.state.diagnosisAttempts, []);
    assert.equal(inv.state.hintsUsed, 0);
    assert.equal(inv.state.fixAttempts, 0);
  });

  test("a full second run works after a reset", () => {
    inv.start(); gatherEvidence(); inv.diagnose("dir-search"); run(`chmod 711 ${CUR}`); inv.checkFix();
    inv.reset(); gatherEvidence(); inv.diagnose("dir-search"); run(`setfacl -m u:www-data:--x ${CUR}`);
    assert.equal(inv.checkFix().fixed, true);
  });

  test("end() leaves no trace in the shared filesystem and returns the shell home", () => {
    inv.start(); gatherEvidence(); run(`chmod 000 ${CUR}`);
    inv.end();
    assert.equal(treeJSON(), base);
    assert.equal(inv.phase, "briefing");
  });
});
