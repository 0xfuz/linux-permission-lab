/**
 * tests/engine/scenario.test.js
 * engine/scenario.js — grafting a scenario into the shared FS_TREE, reset,
 * the state-based check helpers, hint progression and challenge sessions.
 * Every assertion is about simulated STATE; commands are only used to reach it.
 */
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { installDomShim, createContainer } from "../helpers/dom-shim.js";
import { installLocalStorageShim } from "../helpers/storage-shim.js";

installDomShim();
installLocalStorageShim();
const R = "../../assets/js/";
const { FS_TREE, findNode } = await import(R + "filesystem.js");
const { USERS } = await import(R + "engine/users.js");
const S = await import(R + "engine/scenario.js");
const { runCommand, resetTerminalState, getTerminalState } = await import(R + "terminal.js");

const clone = (x) => JSON.parse(JSON.stringify(x));
const treeJSON = () => JSON.stringify(FS_TREE);
const c = createContainer();
const run = (line) => runCommand(line, c);

const miniDef = (over = {}) => ({
  id: "t-mini", kind: "challenge", xp: 10, title: "mini", objectives: ["o"], task: "t", completion: "c",
  hints: ["h1", "h2", "h3"],
  build: () => [S.file("secret.txt", "666"), S.dir("sub", "700", [S.file("a.txt", "644")])],
  checks: [S.othersCannot("closed", "/srv/lab/t-mini/secret.txt", "r", ["user"])],
  ...over,
});

beforeEach(() => { resetTerminalState(); });
afterEach(() => { S.unloadScenario(); resetTerminalState(); });

describe("loadScenario / unloadScenario", () => {
  test("grafts the files under /srv/lab/<id> with paths assigned", () => {
    S.loadScenario(miniDef());
    assert.equal(findNode(FS_TREE, "/srv/lab/t-mini/secret.txt").octal, "666");
    assert.equal(findNode(FS_TREE, "/srv/lab/t-mini/sub/a.txt").path, "/srv/lab/t-mini/sub/a.txt");
    assert.equal(S.activeScenarioId(), "t-mini");
  });

  test("unload restores the base tree exactly (no /srv left behind)", () => {
    const before = treeJSON();
    S.loadScenario(miniDef());
    assert.notEqual(treeJSON(), before);
    S.unloadScenario();
    assert.equal(treeJSON(), before);
    assert.equal(findNode(FS_TREE, "/srv"), null);
    assert.equal(S.activeScenarioId(), null);
  });

  test("unload with nothing loaded is a no-op", () => {
    const before = treeJSON();
    S.unloadScenario(); S.unloadScenario();
    assert.equal(treeJSON(), before);
  });

  test("loading a second scenario replaces the first", () => {
    S.loadScenario(miniDef());
    S.loadScenario(miniDef({ id: "t-two" }));
    assert.equal(findNode(FS_TREE, "/srv/lab/t-mini"), null);
    assert.ok(findNode(FS_TREE, "/srv/lab/t-two"));
  });

  test("the scenario is a real part of the shared filesystem: the terminal sees and changes it", () => {
    S.loadScenario(miniDef());
    run("chmod 600 /srv/lab/t-mini/secret.txt");
    assert.equal(findNode(FS_TREE, "/srv/lab/t-mini/secret.txt").octal, "600");
  });

  test("group-membership overrides apply and are restored on unload", () => {
    const original = [...USERS.alice.groups];
    S.loadScenario(miniDef({ users: { alice: { groups: ["alice"] }, nobody: { groups: ["x"] } } }));
    assert.deepEqual(USERS.alice.groups, ["alice"]);
    assert.equal(USERS.nobody, undefined, "unknown users are ignored, never invented");
    S.unloadScenario();
    assert.deepEqual(USERS.alice.groups, original);
  });

  test("builders return fresh nodes each time (deterministic, no shared mutable state)", () => {
    const def = miniDef();
    S.loadScenario(def); run("chmod 000 /srv/lab/t-mini/secret.txt");
    S.loadScenario(def);
    assert.equal(findNode(FS_TREE, "/srv/lab/t-mini/secret.txt").octal, "666");
  });

  test("ACL entries passed to a builder are copied, not shared", () => {
    const acl = [{ type: "user", id: "alice", perms: "r--" }];
    const f = S.file("x", "640", { acl });
    f.acl[0].perms = "rwx";
    assert.equal(acl[0].perms, "r--");
  });
});

describe("startScenario puts the shell where the scenario expects", () => {
  test("cwd = scenario dir, user = user by default, default umask", () => {
    run("umask 077");
    S.startScenario(miniDef());
    const st = getTerminalState();
    assert.equal(st.cwd, "/srv/lab/t-mini");
    assert.equal(st.user, "user");
    assert.equal(st.umask, "022");
  });
  test("startAs / startDir are honoured", () => {
    S.startScenario(miniDef({ startAs: "alice", startDir: "/srv/lab/t-mini/sub" }));
    assert.equal(getTerminalState().user, "alice");
    assert.equal(getTerminalState().cwd, "/srv/lab/t-mini/sub");
  });
});

describe("check helpers evaluate state", () => {
  const P = "/srv/lab/t-mini";
  beforeEach(() => S.loadScenario(miniDef()));

  test("canAccess includes directory traversal", () => {
    assert.equal(S.canAccess("a", "alice", `${P}/sub/a.txt`, "r").run().ok, false); // sub is 700 user
    run(`chmod 711 ${P}/sub`);
    assert.equal(S.canAccess("a", "alice", `${P}/sub/a.txt`, "r").run().ok, true);
  });

  test("cannotAccess FAILS for a missing path (deleting a file is not a fix)", () => {
    const chk = S.cannotAccess("a", "alice", `${P}/secret.txt`, "r");
    assert.equal(chk.run().ok, false);
    run(`rm ${P}/secret.txt`);
    const r = chk.run();
    assert.equal(r.ok, false);
    assert.match(r.detail, /no longer exists/);
  });

  test("canAccess fails for a missing path too", () => {
    run(`rm ${P}/secret.txt`);
    assert.equal(S.canAccess("a", "user", `${P}/secret.txt`, "r").run().ok, false);
  });

  test("othersCannot lists the accounts that still have access", () => {
    const r = S.othersCannot("o", `${P}/secret.txt`, "w", ["user"]).run();
    assert.equal(r.ok, false);
    assert.match(r.detail, /alice/);
    run(`chmod 600 ${P}/secret.txt`);
    assert.equal(S.othersCannot("o", `${P}/secret.txt`, "w", ["user"]).run().ok, true);
  });

  test("othersCannot honours named ACL entries (not just mode bits)", () => {
    run(`chmod 600 ${P}/secret.txt`);
    run(`setfacl -m u:alice:r-- ${P}/secret.txt`);
    assert.equal(S.othersCannot("o", `${P}/secret.txt`, "r", ["user"]).run().ok, false);
    assert.equal(S.othersCannot("o", `${P}/secret.txt`, "r", ["user", "alice"]).run().ok, true);
  });

  test("modeWithin compares bit by bit, including special bits", () => {
    const within = (mode, max) => { findNode(FS_TREE, `${P}/secret.txt`).octal = mode; return S.modeWithin("m", `${P}/secret.txt`, max).run().ok; };
    assert.equal(within("640", "750"), true);
    assert.equal(within("644", "750"), false);
    assert.equal(within("710", "750"), true);
    assert.equal(within("4750", "750"), false, "setuid bit exceeds the allowed special bits");
    assert.equal(within("2750", "2750"), true);
  });

  test("noWorldWriteUnder walks the subtree and names offenders", () => {
    const chk = S.noWorldWriteUnder("w", P);
    const r = chk.run();
    assert.equal(r.ok, false);
    assert.match(r.detail, /secret\.txt \(666\)/);
    run(`chmod 664 ${P}/secret.txt`);
    assert.equal(chk.run().ok, true);
  });

  test("a check that throws becomes a failed result, not an exception", () => {
    const res = S.evaluateChecks([S.custom("boom", "boom", () => { throw new Error("x"); })]);
    assert.equal(res.ok, false);
    assert.equal(res.results[0].ok, false);
  });

  test("evaluateChecks: only REQUIRED checks decide ok; advisories are reported separately", () => {
    const res = S.evaluateChecks([
      S.custom("req", "r", () => ({ ok: true })),
      S.custom("adv", "a", () => ({ ok: false, detail: "broad" }), { level: "advisory" }),
    ]);
    assert.equal(res.ok, true);
    assert.deepEqual(res.advisories.map((a) => a.id), ["adv"]);
    assert.deepEqual(res.failedRequired, []);
  });
});

describe("hint progression", () => {
  test("reveals one hint at a time, in order, then returns null", () => {
    const h = S.createHintSession(["a", "b", "c"]);
    assert.equal(h.revealed, 0);
    assert.deepEqual(h.visible(), []);
    assert.deepEqual(h.next(), { index: 1, text: "a", last: false });
    assert.deepEqual(h.visible(), ["a"]);
    assert.equal(h.next().text, "b");
    assert.deepEqual(h.next(), { index: 3, text: "c", last: true });
    assert.equal(h.next(), null);
    assert.equal(h.revealed, 3);
  });
  test("an empty hint list never throws", () => {
    const h = S.createHintSession([]);
    assert.equal(h.next(), null);
    assert.equal(h.total, 0);
  });
  test("reset hides every hint again", () => {
    const h = S.createHintSession(["a", "b"]); h.next(); h.next(); h.reset();
    assert.equal(h.revealed, 0);
    assert.equal(h.next().text, "a");
  });
});

describe("challenge session", () => {
  const P = "/srv/lab/t-mini";

  test("start loads the state; an untouched state does not pass", () => {
    const s = S.createChallengeSession(miniDef()); s.start();
    const r = s.check();
    assert.equal(r.ok, false);
    assert.equal(s.solved, false);
    assert.equal(s.attempts, 1);
  });

  test("passes when the STATE is right, whichever commands got there", () => {
    for (const fix of ["chmod 600 secret.txt", "chmod 640 secret.txt", "chmod 660 secret.txt", "chmod 000 secret.txt"]) {
      const s = S.createChallengeSession(miniDef()); s.start();
      run(`${fix.replace("secret.txt", P + "/secret.txt")}`);
      assert.equal(s.check().ok, true, fix);
    }
  });

  test("a hardcoded 'correct-looking' command on the wrong target does not pass", () => {
    const s = S.createChallengeSession(miniDef()); s.start();
    run(`chmod 600 ${P}/sub/a.txt`); // right command, wrong file
    assert.equal(s.check().ok, false);
  });

  test("typing the right mode is not needed — and not enough if it was refused", () => {
    const s = S.createChallengeSession(miniDef()); s.start();
    run("su alice"); run(`chmod 600 ${P}/secret.txt`); // refused: alice is not the owner
    assert.equal(findNode(FS_TREE, `${P}/secret.txt`).octal, "666");
    assert.equal(s.check().ok, false);
  });

  test("reset restores the original state and clears the verdict, hints stay revealed", () => {
    const s = S.createChallengeSession(miniDef()); s.start();
    s.hints.next();
    run(`chmod 600 ${P}/secret.txt`);
    assert.equal(s.check().ok, true);
    s.reset();
    assert.equal(findNode(FS_TREE, `${P}/secret.txt`).octal, "666");
    assert.equal(s.solved, false);
    assert.equal(s.last, null);
    assert.equal(s.hints.revealed, 1);
    assert.equal(s.check().ok, false, "back to the broken state");
  });

  test("reset also puts the shell back (user, cwd)", () => {
    const s = S.createChallengeSession(miniDef({ startDir: P })); s.start();
    run("su alice"); run("cd /tmp");
    s.reset();
    assert.deepEqual([getTerminalState().user, getTerminalState().cwd], ["user", P]);
  });

  test("start() is a full restart: attempts and hints cleared", () => {
    const s = S.createChallengeSession(miniDef()); s.start();
    s.hints.next(); s.check(); s.check();
    s.start();
    assert.deepEqual([s.attempts, s.hints.revealed, s.solved], [0, 0, false]);
  });

  test("end() removes the scenario and returns the shell home", () => {
    const before = treeJSON();
    const s = S.createChallengeSession(miniDef({ startDir: P })); s.start();
    s.end();
    assert.equal(treeJSON(), before);
    assert.equal(getTerminalState().cwd, "/home/user");
  });

  test("the base filesystem is untouched by a scenario's changes after end()", () => {
    const before = treeJSON();
    const s = S.createChallengeSession(miniDef()); s.start();
    run(`chmod 000 ${P}/secret.txt`); run(`rm ${P}/sub/a.txt`);
    s.end();
    assert.equal(treeJSON(), before);
  });
});
void clone;
