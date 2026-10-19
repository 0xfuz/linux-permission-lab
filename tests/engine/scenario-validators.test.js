/**
 * tests/engine/scenario-validators.test.js   (v2.12.1)
 * Label-vs-enforcement review of the scenario validators in engine/scenario.js.
 *
 * Background: noWorldWriteUnder() only read the mode's "others" write bit, so named ACL
 * entries that let EVERY account write (u:alice:rw-, u:monitoring:rw-, … or a group everyone
 * is in) slipped past it. NOTE on the reported `other::w` variant: it cannot occur in this model —
 * there is no other:: ACL entry (setfacl accepts only u:/g:, classify() ignores anything else),
 * the others class IS the mode bits. These tests pin both facts.
 */
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { installDomShim, createContainer } from "../helpers/dom-shim.js";
import { installLocalStorageShim } from "../helpers/storage-shim.js";

installDomShim();
installLocalStorageShim();
const R = "../../assets/js/";
const { FS_TREE, findNode } = await import(R + "filesystem.js");
const { USERS, checkAccess, classify } = await import(R + "engine/users.js");
const S = await import(R + "engine/scenario.js");
const { runCommand, resetTerminalState } = await import(R + "terminal.js");
const { SCENARIOS, CHALLENGE_SCENARIOS, INVESTIGATIONS } = await import(R + "scenarios-data.js");
const { createInvestigation } = await import(R + "engine/investigation.js");

const c = createContainer();
const run = (l) => runCommand(l, c);
const P = "/srv/lab/t-acl";
const F = `${P}/f.txt`;
const NON_ROOT = Object.keys(USERS).filter((u) => u !== "root");
const mini = (over = {}) => ({
  id: "t-acl", kind: "challenge", xp: 1, title: "t", objectives: ["a", "b"], task: "t", completion: "c", hints: ["1", "2", "3"],
  build: () => [S.file("f.txt", "600"), S.dir("d", "700", [S.file("g.txt", "600")])],
  checks: [], ...over,
});
const worldW = (root = P) => S.noWorldWriteUnder("w", root).run();
const node = (p) => findNode(FS_TREE, p);
const grantAll = (path, perms = "rw-", except = []) => NON_ROOT.filter((u) => u !== node(path).owner && !except.includes(u)).forEach((u) => run(`setfacl -m u:${u}:${perms} ${path}`));

beforeEach(() => { resetTerminalState(); S.startScenario(mini()); });
afterEach(() => { S.unloadScenario(); resetTerminalState(); });

describe("the ACL model has no other:: entry (the reported variant is not reachable)", () => {
  test("setfacl refuses o::, other::, m:: and leaves ACL and mode untouched", () => {
    run(`chmod 644 ${F}`);
    for (const spec of ["o::rwx", "other::rwx", "m::rwx", "o:x:rwx"]) run(`setfacl -m ${spec} ${F}`);
    assert.deepEqual(node(F).acl, []);
    assert.equal(node(F).octal, "644");
  });

  test("a planted other:: entry is ignored by the access engine: it can neither grant nor hide world-write", () => {
    const n = node(F);
    n.octal = "600"; n.acl = [{ type: "other", id: "", perms: "rwx" }];
    assert.equal(checkAccess(n, "alice", "w"), false, "engine ignores it");
    assert.equal(worldW().ok, true, "so the check must not false-positive");
    n.octal = "666"; n.acl = [{ type: "other", id: "", perms: "---" }];
    assert.equal(checkAccess(n, "alice", "w"), true, "mode bits still decide for 'others'");
    assert.equal(worldW().ok, false, "and the check still flags it — an ACL cannot hide the mode bit");
  });
});

describe("noWorldWriteUnder: effective ACL access", () => {
  test("mode bit still flagged (unchanged behaviour), with the original detail format", () => {
    run(`chmod 666 ${F}`);
    const r = worldW();
    assert.equal(r.ok, false);
    assert.match(r.detail, /f\.txt \(666\)/);
  });

  test("REGRESSION: named entries giving every other account write are flagged (was a silent pass)", () => {
    grantAll(F);
    assert.equal(node(F).octal, "600", "the mode alone looks private");
    assert.ok(NON_ROOT.filter((u) => u !== "user").every((u) => checkAccess(node(F), u, "w")), "yet everyone can write");
    const r = worldW();
    assert.equal(r.ok, false);
    assert.match(r.detail, /f\.txt \(writable by every account through ACL entries\)/);
  });

  test("rwx entries are flagged too, and so are directories", () => {
    grantAll(`${P}/d`, "rwx");
    assert.match(worldW().detail, /d \(writable by every account/);
  });

  test("REGRESSION: a group that every account belongs to is world-writable too", () => {
    S.startScenario(mini({ users: Object.fromEntries(NON_ROOT.filter((u) => u !== "user").map((u) => [u, { groups: [...USERS[u].groups, "everyone"] }])) }));
    run(`setfacl -m g:everyone:rw- ${F}`);
    assert.equal(worldW().ok, false);
  });

  test("it judges EFFECTIVE access: entries capped by the ACL mask do not count", () => {
    grantAll(F);
    node(F).aclMask = "r--";            // the real commands always recompute the mask, so plant it
    assert.equal(NON_ROOT.some((u) => u !== "user" && checkAccess(node(F), u, "w")), false);
    assert.equal(worldW().ok, true);
  });

  test("a file owned by someone else: the owner is not part of 'everyone else'", () => {
    node(F).owner = "alice";
    run("su alice");
    grantAll(F, "rw-");
    assert.equal(worldW().ok, false);
  });

  test("a deep offender is found and named; the check covers the whole subtree", () => {
    grantAll(`${P}/d/g.txt`);
    assert.match(worldW().detail, /d\/g\.txt/);
    assert.equal(worldW(`${P}/d`).ok, false);
    assert.equal(S.noWorldWriteUnder("w", `${P}/d`).run().ok, false);
  });

  test("removing the entries clears the finding", () => {
    grantAll(F);
    assert.equal(worldW().ok, false);
    run(`setfacl -x u:alice ${F}`);
    assert.equal(worldW().ok, true);
  });

  describe("legitimate ACL configurations still pass", () => {
    const cases = [
      ["one named user, rw-", () => run(`setfacl -m u:alice:rw- ${F}`)],
      ["two named users, rw-", () => { run(`setfacl -m u:alice:rw- ${F}`); run(`setfacl -m u:monitoring:rw- ${F}`); }],
      ["every other account, but READ-only", () => grantAll(F, "r--")],
      ["all but one account, rw- (not everyone)", () => grantAll(F, "rw-", ["www-data"])],
      ["a named group that is not everyone (adm)", () => run(`setfacl -m g:adm:rw- ${F}`)],
      ["rwx for one user on a directory", () => run(`setfacl -m u:www-data:rwx ${P}/d`)],
      ["execute-only for every account on a directory", () => grantAll(`${P}/d`, "--x")],
      ["a private file with no ACL", () => {}],
    ];
    for (const [name, setup] of cases) test(name, () => { setup(); assert.equal(worldW().ok, true); });
  });

  test("a missing root path still fails (deleting is not a fix)", () => {
    assert.equal(S.noWorldWriteUnder("w", `${P}/nope`).run().ok, false);
  });
});

describe("integration: the bypass no longer solves a real challenge", () => {
  const tc01 = CHALLENGE_SCENARIOS.find((s) => s.id === "tc01");
  const T1 = "/srv/lab/tc01";

  test("tc01: locking the key but leaving the lab world-writable through ACLs is rejected", () => {
    const s = S.createChallengeSession(tc01); s.start();
    run(`chmod 600 ${T1}/deploy_key`);
    assert.equal(s.check().ok, true, "sanity: the plain fix passes");
    grantAll(`${T1}/deploy_key.pub`);
    const r = s.check();
    assert.equal(r.ok, false);
    assert.deepEqual(r.failedRequired.map((f) => f.id), ["no-world-write"]);
    run(`setfacl -x u:alice ${T1}/deploy_key.pub`);
    assert.equal(s.check().ok, true, "and removing the ACL entry makes it pass again");
    s.end();
  });

  test("tc01: a targeted ACL on the PUBLIC key for one account is fine", () => {
    const s = S.createChallengeSession(tc01); s.start();
    run(`chmod 600 ${T1}/deploy_key`); run(`setfacl -m u:alice:rw- ${T1}/deploy_key.pub`);
    assert.equal(s.check().ok, true);
    s.end();
  });

  test("inv01: world-writable ACLs are rejected in the investigation too", () => {
    const inv = INVESTIGATIONS[0]; const I = "/srv/lab/inv01"; const FILE = `${I}/app/current/public/index.html`; const CUR = `${I}/app/current`;
    const e = createInvestigation(inv); S.unloadScenario(); e.start();
    run("su www-data"); run(`cat ${FILE}`); run("exit");
    run(`chmod 711 ${CUR}`);
    grantAll(`${I}/NOTES.txt`);
    assert.equal(S.evaluateChecks(inv.checks).ok, false);
    e.end();
  });
});

describe("accessWithin: effective access vs a plain mode (new)", () => {
  const D = `${P}/d`;
  const within = (max) => S.accessWithin("a", D, max).run();

  test("a 700 directory with no ACL is within 711", () => assert.equal(within("711").ok, true));
  test("an execute-only ACL entry stays within 711", () => { run(`setfacl -m u:www-data:--x ${D}`); assert.equal(within("711").ok, true); });
  test("an rwx ACL entry exceeds 711 and names the account and bits", () => {
    run(`setfacl -m u:www-data:rwx ${D}`);
    const r = within("711");
    assert.equal(r.ok, false);
    assert.match(r.detail, /www-data \(\+rw\)/);
  });
  test("this is exactly what modeWithin cannot see (mode 700 ⊆ 711 even with an rwx ACL)", () => {
    run(`setfacl -m u:www-data:rwx ${D}`);
    assert.equal(S.modeWithin("m", D, "711").run().ok, true, "mode bits only");
    assert.equal(within("711").ok, false, "effective access");
  });
  test("the ACL mask is respected: an rwx entry capped to --x passes", () => {
    run(`setfacl -m u:www-data:rwx ${D}`); node(D).aclMask = "--x";
    assert.equal(within("711").ok, true);
  });
  test("mode 755 exceeds 711 (others gain r)", () => { run(`chmod 755 ${D}`); assert.equal(within("711").ok, false); });
  test("chgrp www-data + 710 stays within 711 (the group gets only --x)", () => {
    run(`sudo chgrp www-data ${D}`); run(`chmod 710 ${D}`);
    assert.equal(within("711").ok, true);
  });
  test("special bits beyond the baseline fail", () => { run(`chmod 4711 ${D}`); assert.equal(within("711").ok, false); });
  test("a missing path fails", () => assert.equal(S.accessWithin("a", `${P}/nope`, "711").run().ok, false));

  test("inv01 advisory now catches an rwx ACL on current/ (it used to read 'minimal')", () => {
    const inv = INVESTIGATIONS[0]; const I = "/srv/lab/inv01"; const CUR = `${I}/app/current`;
    const e = createInvestigation(inv); S.unloadScenario(); e.start();
    run(`setfacl -m u:www-data:rwx ${CUR}`);
    const r = S.evaluateChecks(inv.checks);
    assert.equal(r.ok, true, "it works, so the required checks pass");
    assert.deepEqual(r.advisories.map((a) => a.id), ["not-broader"]);
    e.end();
  });
});

describe("tc04: the task says monitoring must not WRITE to the directory — now enforced", () => {
  const tc04 = CHALLENGE_SCENARIOS.find((s) => s.id === "tc04");
  const T = "/srv/lab/tc04/conf";
  const attempt = (...cmds) => { const s = S.createChallengeSession(tc04); s.start(); cmds.forEach(run); const r = s.check(); s.end(); return r; };

  test("--x passes with no advisories (unchanged)", () => {
    const r = attempt(`setfacl -m u:monitoring:--x ${T}`);
    assert.equal(r.ok, true); assert.deepEqual(r.advisories, []);
  });
  test("REGRESSION: -wx (can create/delete files in the directory without listing it) is rejected", () => {
    const r = attempt(`setfacl -m u:monitoring:-wx ${T}`);
    assert.equal(r.ok, false);
    assert.deepEqual(r.failedRequired.map((f) => f.id), ["no-dir-write"]);
  });
  test("rwx is rejected for the same reason", () => assert.equal(attempt(`setfacl -m u:monitoring:rwx ${T}`).ok, false));
  test("r-x still passes but is flagged (can list)", () => {
    const r = attempt(`setfacl -m u:monitoring:r-x ${T}`);
    assert.equal(r.ok, true); assert.ok(r.advisories.some((a) => a.id === "no-listing"));
  });
});

describe("labels say what the validators enforce", () => {
  test("every helper's default label is about what it actually evaluates", () => {
    assert.match(S.modeWithin("m", "/x", "750").label, /\bmode\b/, "modeWithin is mode-bits only and says so");
    assert.match(S.accessWithin("a", "/x", "750").label, /no account has more access/);
    assert.match(S.noWorldWriteUnder("w", "/x").label, /world-writable/);
    assert.match(S.othersCannot("o", "/x", "r", ["user"]).label, /no account except user/);
  });
  test("the 'keep-file' label no longer promises 'unchanged content bits' (it only checks existence)", () => {
    const labels = SCENARIOS.flatMap((s) => s.checks.map((k) => k.label));
    assert.deepEqual(labels.filter((l) => /unchanged content/i.test(l)), []);
    assert.ok(labels.includes("index.html still exists"));
  });
  test("tc01's task no longer promises 'the least permissive mode' (any mode with the same effective access passes)", () => {
    const t = CHALLENGE_SCENARIOS.find((s) => s.id === "tc01").task;
    assert.doesNotMatch(t, /least permissive mode/);
    assert.match(t, /owner \(user\) only/);
  });
  test("inv01's 'no more permissive than 711' advisory uses effective access, not mode bits", () => {
    const chk = INVESTIGATIONS[0].checks.find((k) => k.id === "not-broader");
    assert.match(chk.run.toString(), /effectivePerms/);
  });
  test("untouched classification: others class still comes from the mode bits", () => {
    const n = node(F); n.octal = "604";
    assert.equal(classify(n, "alice").cls, "others");
  });
});
