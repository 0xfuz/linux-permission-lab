/**
 * tests/regression/audit-2.13.test.js
 * Regression tests for defects found by the v2.13.0 permission-engine audit. Expected values are NOT
 * derived from this code: they were measured on a real Linux 6.x kernel (ext4 + POSIX ACLs) by forking,
 * dropping to each uid/gid and attempting the operation, then pinned here as fixtures.
 *   A. chmod/setfacl mask semantics   B. SC-01 validator vs kernel policy (17 audited sequences)
 *   C. cp drops ACLs                  D. mv/cp onto an existing name must not duplicate nodes
 *   E. mv of a directory into itself  F. ls -l needs x on the directory
 *   G. chown/chgrp/chmod special bits H. owner no-op chown/chgrp   I. rm on directories
 *   J. setgid directories: new entries inherit the group (and new directories the bit)
 *   K. the new messages escape hostile file names
 */
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { installDomShim, createContainer, outputText } from "../helpers/dom-shim.js";
import { installLocalStorageShim } from "../helpers/storage-shim.js";

installDomShim(); installLocalStorageShim();
const R = "../../assets/js/";
const { runCommand, resetTerminalState } = await import(R + "terminal.js");
const S = await import(R + "engine/scenario.js");
const { FS_TREE, findNode } = await import(R + "filesystem.js");
const U = await import(R + "engine/users.js");
const { SCENARIOS } = await import(R + "scenarios-data.js");
const sc01 = SCENARIOS.find((s) => s.id === "sc01");
const B = "/srv/lab/aud";
const out = (c, cmd) => { const n = c.children.length; runCommand(cmd, c); return outputText({ children: c.children.slice(n + 1) }); };
const node = (p) => findNode(FS_TREE, p);
const same = (dirPath, name) => node(dirPath).children.filter((n) => n.name === name).length;
function load(children) {
  resetTerminalState();
  S.loadScenario({ id: "aud", kind: "challenge", title: "a", xp: 1, objectives: [], build: () => children });
  return createContainer();
}
afterEach(() => { S.unloadScenario(); resetTerminalState(); });
const ACC = ["user", "alice", "deployer", "monitoring", "www-data"];
const verdict = (p, u) => ["r", "w", "x"].map((f) => (U.checkPathAccess(p, u, f).ok ? f : "-")).join("");

/* -------------------------------------------------------------- A */
describe("A. chmod / setfacl follow the kernel's mask rules (measured on Linux 6.x)", () => {
  // [id, initial mode, group, commands, kernel mode shown by ls/stat, kernel verdict per user]
  const V = (user, alice, deployer) => ({ user, alice, deployer, monitoring: "---", "www-data": "---" });
  const TABLE = [
    ["setfacl alice r--, then chmod 600 → mask becomes --- and alice loses access", "644", "deployer", ["setfacl -m u:alice:r-- F", "chmod 600 F"], "600", V("---", "---", "rw-")],
    ["setfacl alice r--, then chmod 640 → mask r--, alice keeps read", "644", "deployer", ["setfacl -m u:alice:r-- F", "chmod 640 F"], "640", V("---", "r--", "rw-")],
    ["600 file, setfacl alice r--, chmod 600 again → alice locked out", "600", "deployer", ["setfacl -m u:alice:r-- F", "chmod 600 F"], "600", V("---", "---", "rw-")],
    ["chmod 600 FIRST, then setfacl alice r-- → mask recalculated, mode now SHOWS 640", "644", "deployer", ["chmod 600 F", "setfacl -m u:alice:r-- F"], "640", V("---", "r--", "rw-")],
    ["setfacl alice rw-, then chmod 640 → mask r-- caps alice to read only", "640", "deployer", ["setfacl -m u:alice:rw- F", "chmod 640 F"], "640", V("---", "r--", "rw-")],
    ["widening the group digit after setfacl does NOT widen the owning-group entry (stays r--)", "640", "sudo", ["setfacl -m u:alice:r-- F", "chmod 670 F"], "670", V("r--", "r--", "rw-")],
    ["narrowing the group digit after setfacl removes group-class access", "660", "sudo", ["setfacl -m u:alice:r-- F", "chmod 600 F"], "600", V("---", "---", "rw-")],
    ["removing the last ACL entry restores the group digit from the owning-group entry", "600", "deployer", ["setfacl -m u:alice:r-- F", "setfacl -x u:alice F"], "600", V("---", "---", "rw-")],
    ["chgrp keeps the ACL, named entry still applies", "640", "sudo", ["setfacl -m u:alice:r-- F", "chgrp adm F"], "640", V("---", "r--", "rw-")],
    ["named-group entry then chmod 600 → denied (mask ---)", "600", "deployer", ["setfacl -m g:adm:r-- F", "chmod 600 F"], "600", V("---", "---", "rw-")],
  ];
  for (const [name, mode, group, cmds, kMode, kv] of TABLE) {
    test(name, () => {
      const c = load([S.file("f", mode, { owner: "deployer", group })]); const F = `${B}/f`;
      for (const cmd of cmds) out(c, "sudo " + cmd.replace(/\bF\b/, F));
      for (const u of ACC) assert.equal(verdict(F, u), kv[u], `${u}`);
      assert.equal(node(F).octal, kMode, "ls/stat must show the mode the kernel shows (group digit = mask)");
    });
  }
  test("getfacl shows the owning-group entry and the mask separately after chmod 600 + setfacl", () => {
    const c = load([S.file("f", "644", { owner: "deployer", group: "deployer" })]); const F = `${B}/f`;
    out(c, `sudo chmod 600 ${F}`); out(c, `sudo setfacl -m u:alice:r-- ${F}`);
    const t = out(c, `getfacl ${F}`);
    assert.match(t, /group::---/); assert.match(t, /mask::r--/); assert.match(t, /user:alice:r--/);
  });
  test("getfacl after chmod widened the mask shows #effective on the owning-group entry", () => {
    const c = load([S.file("f", "640", { owner: "deployer", group: "sudo" })]); const F = `${B}/f`;
    out(c, `sudo setfacl -m u:alice:r-- ${F}`); out(c, `sudo chmod 670 ${F}`);
    assert.match(out(c, `getfacl ${F}`), /group::r--/); assert.match(out(c, `getfacl ${F}`), /mask::rwx/);
  });
  test("root may execute a file whose only x comes through the ACL mask (kernel looks at the mode's group digit)", () => {
    const c = load([S.file("f", "600", { owner: "deployer", group: "deployer" })]); const F = `${B}/f`;
    out(c, `sudo setfacl -m u:alice:r-x ${F}`);
    assert.equal(U.checkPathAccess(F, "root", "x").ok, true);
    out(c, `sudo setfacl -x u:alice ${F}`);
    assert.equal(U.checkPathAccess(F, "root", "x").ok, false);
  });
  test("a file BUILT with ACL entries (legacy form, no stored owning-group entry) still evaluates as before", () => {
    load([S.file("f", "640", { owner: "deployer", group: "deployer", acl: [{ type: "user", id: "monitoring", perms: "r--" }] })]);
    assert.equal(verdict(`${B}/f`, "monitoring"), "r--"); assert.equal(verdict(`${B}/f`, "alice"), "---");
  });
});

/* -------------------------------------------------------------- B */
const SC_FIX = [{"id": 126, "kernelPolicyOk": false, "ops": [["chgrp", "conf", "adm"], ["facl_m", "conf", "user", "alice", "r-x"], ["chmod", "conf", "700"]]}, {"id": 424, "kernelPolicyOk": false, "ops": [["facl_x", "conf", "user", "monitoring"], ["facl_m", "conf", "user", "alice", "r-x"], ["chmod", "conf", "600"], ["chgrp", "conf", "adm"]]}, {"id": 425, "kernelPolicyOk": false, "ops": [["chmod", "conf", "600"], ["facl_m", "conf", "group", "adm", "r--"], ["chmod", "conf", "600"]]}, {"id": 435, "kernelPolicyOk": false, "ops": [["chmod", "conf", "444"], ["facl_m", "conf", "user", "alice", "r--"], ["chmod", "dir", "755"], ["chmod", "conf", "600"]]}, {"id": 501, "kernelPolicyOk": false, "ops": [["facl_m", "conf", "user", "alice", "r--"], ["chmod", "conf", "600"]]}, {"id": 669, "kernelPolicyOk": false, "ops": [["facl_m", "conf", "user", "alice", "r-x"], ["facl_m", "conf", "user", "alice", "r--"], ["chmod", "conf", "664"], ["chmod", "conf", "700"]]}, {"id": 990, "kernelPolicyOk": false, "ops": [["chmod", "conf", "600"], ["facl_m", "conf", "user", "alice", "r--"], ["chmod", "conf", "600"]]}, {"id": 1046, "kernelPolicyOk": false, "ops": [["chmod", "conf", "600"], ["facl_m", "conf", "user", "alice", "r--"], ["chmod", "conf", "700"]]}, {"id": 1585, "kernelPolicyOk": false, "ops": [["chmod", "conf", "640"], ["facl_m", "conf", "user", "alice", "r--"], ["chmod", "conf", "700"]]}, {"id": 1819, "kernelPolicyOk": false, "ops": [["facl_m", "conf", "user", "alice", "r--"], ["chmod", "conf", "700"]]}, {"id": 3357, "kernelPolicyOk": false, "ops": [["chmod", "conf", "600"], ["facl_m", "conf", "user", "alice", "r--"], ["chmod", "conf", "700"]]}, {"id": 3648, "kernelPolicyOk": false, "ops": [["chmod", "conf", "600"], ["facl_m", "conf", "user", "alice", "r--"], ["chmod", "conf", "600"]]}, {"id": 3869, "kernelPolicyOk": false, "ops": [["chgrp", "conf", "deployer"], ["facl_m", "conf", "user", "alice", "r--"], ["chmod", "conf", "700"]]}, {"id": 72, "kernelPolicyOk": true, "ops": [["facl_m", "conf", "user", "alice", "rw-"], ["chmod", "conf", "640"]]}, {"id": 1671, "kernelPolicyOk": true, "ops": [["chmod", "conf", "755"], ["facl_m", "conf", "user", "alice", "rw-"], ["chmod", "conf", "750"]]}, {"id": 1987, "kernelPolicyOk": true, "ops": [["facl_m", "conf", "user", "alice", "rw-"], ["chmod", "conf", "2640"]]}, {"id": 3190, "kernelPolicyOk": true, "ops": [["facl_m", "conf", "user", "alice", "rw-"], ["chmod", "conf", "2640"], ["chmod", "dir", "700"], ["chmod", "dir", "755"]]}];
describe("B. SC-01 validator agrees with the kernel on the 17 sequences the audit found it got wrong", () => {
  const D = "/srv/lab/sc01/orbit/config"; const P = { conf: `${D}/orbit.conf`, example: `${D}/orbit.conf.example`, dir: D };
  for (const row of SC_FIX) {
    const label = row.ops.map((o) => o.join(" ")).join(" ; ");
    test(`${row.kernelPolicyOk ? "valid on Linux → accepted" : "violates policy on Linux → rejected"}: ${label}`, () => {
      const c = createContainer(); resetTerminalState(); S.startScenario(sc01);
      for (const op of row.ops) {
        const p = P[op[1]]; let cmd;
        if (op[0] === "chmod") cmd = `chmod ${op[2]} ${p}`; else if (op[0] === "chgrp") cmd = `chgrp ${op[2]} ${p}`; else if (op[0] === "chown") cmd = `chown ${op[2]} ${p}`;
        else if (op[0] === "facl_m") cmd = `setfacl -m ${op[2][0]}:${op[3]}:${op[4]} ${p}`; else if (op[0] === "facl_x") cmd = `setfacl -x ${op[2][0]}:${op[3]} ${p}`; else cmd = `rm ${p}`;
        out(c, "sudo " + cmd);
      }
      assert.equal(S.evaluateChecks(sc01.checks).ok, row.kernelPolicyOk);
    });
  }
});

/* -------------------------------------------------------------- C */
describe("C. cp does not copy ACL entries (only cp -p / -a would; measured: alice cannot read a plain copy)", () => {
  test("the copy has no ACL and alice cannot read it; the original is untouched", () => {
    const c = load([S.dir("d", "755", [S.file("src", "640", { owner: "user", group: "user", acl: [{ type: "user", id: "alice", perms: "r--" }] })], { owner: "user", group: "user" })]);
    out(c, `cp ${B}/d/src ${B}/d/copy`);
    assert.deepEqual(node(`${B}/d/copy`).acl, []); assert.equal(node(`${B}/d/copy`).aclMask, undefined);
    assert.equal(U.checkPathAccess(`${B}/d/copy`, "alice", "r").ok, false);
    assert.equal(U.checkPathAccess(`${B}/d/src`, "alice", "r").ok, true);
    assert.equal(node(`${B}/d/copy`).octal, "640");
  });
  test("a copy of an ACL file made after setfacl takes the mask as its group digit (kernel: 640 → 640)", () => {
    const c = load([S.dir("d", "755", [S.file("src", "600", { owner: "user", group: "user" })], { owner: "user", group: "user" })]);
    out(c, `setfacl -m u:alice:r-- ${B}/d/src`); out(c, `cp ${B}/d/src ${B}/d/copy`);
    assert.equal(node(`${B}/d/copy`).octal, "640"); assert.deepEqual(node(`${B}/d/copy`).acl, []);
  });
  test("mv keeps the ACL (same inode)", () => {
    const c = load([S.dir("d", "755", [S.file("src", "640", { owner: "user", group: "user", acl: [{ type: "user", id: "alice", perms: "r--" }] })], { owner: "user", group: "user" })]);
    out(c, `mv ${B}/d/src ${B}/d/moved`); assert.equal(U.checkPathAccess(`${B}/d/moved`, "alice", "r").ok, true);
  });
});

/* -------------------------------------------------------------- D */
describe("D. mv / cp onto an existing name keeps exactly one node (kernel: mv replaces, cp rewrites contents)", () => {
  const mk = (extra = {}) => load([S.dir("d", extra.dirMode || "755", [
    S.file("a", "644", { owner: "alice", group: "alice", note: "AAA" }),
    S.file("b", "600", { owner: "deployer", group: "deployer", note: "BBB", acl: [{ type: "user", id: "monitoring", perms: "r--" }] }),
  ], { owner: "user", group: "user" })]);
  test("mv a b: one node named b, carrying a's owner, mode and contents; a is gone", () => {
    const c = mk(); out(c, `mv ${B}/d/a ${B}/d/b`);
    assert.equal(same(`${B}/d`, "b"), 1); assert.equal(same(`${B}/d`, "a"), 0);
    const n = node(`${B}/d/b`); assert.equal(n.owner, "alice"); assert.equal(n.octal, "644"); assert.equal(n.note, "AAA"); assert.deepEqual(n.acl, []);
  });
  test("cp a b: one node named b that KEEPS b's owner, mode and ACL but gets a's contents", () => {
    const c = mk(); out(c, `sudo cp ${B}/d/a ${B}/d/b`);
    assert.equal(same(`${B}/d`, "b"), 1);
    const n = node(`${B}/d/b`); assert.equal(n.owner, "deployer"); assert.equal(n.octal, "600"); assert.equal(n.acl.length, 1); assert.equal(n.note, "AAA");
  });
  test("cp onto an existing file needs write permission on THAT FILE, not on the directory", () => {
    const c = load([S.dir("d", "555", [S.file("a", "644", { owner: "user", group: "user" }), S.file("b", "666", { owner: "deployer", group: "deployer" }), S.file("ro", "444", { owner: "deployer", group: "deployer" })], { owner: "deployer", group: "deployer" })]);
    assert.match(out(c, `cp ${B}/d/a ${B}/d/b`), /copied|ok/i);
    assert.match(out(c, `cp ${B}/d/a ${B}/d/ro`), /Permission denied/);
    assert.equal(same(`${B}/d`, "b"), 1); assert.equal(same(`${B}/d`, "ro"), 1);
  });
  test("mv over a file in a sticky directory is refused for a non-owner, and nothing changes", () => {
    const c = load([S.dir("d", "1777", [S.file("a", "644", { owner: "user", group: "user" }), S.file("b", "666", { owner: "deployer", group: "deployer" })], { owner: "root", group: "root" })]);
    assert.match(out(c, `mv ${B}/d/a ${B}/d/b`), /cannot move .* Operation not permitted/);   // kernel: EPERM, not EACCES
    assert.equal(same(`${B}/d`, "a"), 1); assert.equal(same(`${B}/d`, "b"), 1); assert.equal(node(`${B}/d/b`).owner, "deployer");
  });
  test("mv f f is refused: 'are the same file'", () => {
    const c = mk(); assert.match(out(c, `mv ${B}/d/a ${B}/d/a`), /same file/); assert.equal(same(`${B}/d`, "a"), 1);
  });
  test("mv a directory over an existing FILE is refused (cannot overwrite non-directory with directory)", () => {
    const c = load([S.dir("d", "755", [S.dir("sub", "755", [], { owner: "user", group: "user" }), S.file("b", "644", { owner: "user", group: "user" })], { owner: "user", group: "user" })]);
    assert.match(out(c, `mv ${B}/d/sub ${B}/d/b`), /cannot overwrite non-directory/); assert.equal(node(`${B}/d/sub`).isDir, true);
  });
  test("mv a file onto an existing DIRECTORY still moves it inside (unchanged behaviour)", () => {
    const c = load([S.dir("d", "755", [S.dir("sub", "755", [], { owner: "user", group: "user" }), S.file("a", "644", { owner: "user", group: "user" })], { owner: "user", group: "user" })]);
    out(c, `mv ${B}/d/a ${B}/d/sub`); assert.ok(node(`${B}/d/sub/a`)); assert.equal(same(`${B}/d`, "a"), 0);
  });
  test("SC-01: replacing orbit.conf by moving a safe copy over it is judged on the NEW file, not a stale node", () => {
    const c = createContainer(); resetTerminalState(); S.startScenario(sc01);
    const D = "/srv/lab/sc01/orbit/config";
    out(c, `sudo cp ${D}/orbit.conf ${D}/new.conf`);            // new file: owned by root, no ACL
    out(c, `sudo chgrp adm ${D}/new.conf`); out(c, `sudo chmod 640 ${D}/new.conf`); out(c, `sudo chown deployer ${D}/new.conf`);
    out(c, `sudo mv ${D}/new.conf ${D}/orbit.conf`);
    assert.equal(same(D, "orbit.conf"), 1); assert.equal(node(`${D}/orbit.conf`).octal, "640");
    assert.equal(S.evaluateChecks(sc01.checks).ok, true);
  });
});

/* -------------------------------------------------------------- E */
describe("E. mv of a directory into itself is refused instead of crashing and losing the tree", () => {
  const mk = () => load([S.dir("a", "755", [S.dir("sub", "755", [S.file("f", "644", { owner: "user", group: "user" })], { owner: "user", group: "user" })], { owner: "user", group: "user" })]);
  for (const dest of ["a/sub", "a"]) test(`mv a → ${dest}`, () => {
    const c = mk(); let t;
    assert.doesNotThrow(() => { t = out(c, `mv ${B}/a ${B}/${dest}`); });
    assert.match(t, /cannot move .* to a subdirectory of itself/);
    assert.ok(node(`${B}/a/sub/f`), "tree untouched"); assert.equal(node(`${B}/a`).path, `${B}/a`);
  });
  test("moving a directory to a sibling still works and re-paths its children", () => {
    const c = load([S.dir("a", "755", [S.file("f", "644", { owner: "user", group: "user" })], { owner: "user", group: "user" }), S.dir("z", "755", [], { owner: "user", group: "user" })]);
    out(c, `mv ${B}/a ${B}/z`); assert.ok(node(`${B}/z/a/f`)); assert.equal(node(`${B}/z/a/f`).path, `${B}/z/a/f`);
  });
  test("a directory whose name merely starts with the same text is NOT its subdirectory", () => {
    const c = load([S.dir("a", "755", [], { owner: "user", group: "user" }), S.dir("ab", "755", [], { owner: "user", group: "user" })]);
    out(c, `mv ${B}/a ${B}/ab`); assert.ok(node(`${B}/ab/a`));
  });
});

/* -------------------------------------------------------------- F */
describe("F. ls -l needs x on the directory (r alone lists names but cannot stat them) — measured with GNU ls", () => {
  const mk = (mode) => load([S.dir("d", mode, [S.file("secret.txt", "644", { owner: "deployer", group: "deployer" })], { owner: "deployer", group: "deployer" })]);
  test("r-only directory: plain ls lists names", () => {
    const c = mk("744"); out(c, "su monitoring"); assert.match(out(c, `ls ${B}/d`), /secret\.txt/);
  });
  test("r-only directory: ls -l prints '?' metadata and a Permission denied error, and leaks no owner/mode", () => {
    const c = mk("744"); out(c, "su monitoring"); const t = out(c, `ls -l ${B}/d`);
    assert.match(t, /cannot access .*secret\.txt.*Permission denied/); assert.match(t, /\?{9}/); assert.match(t, /secret\.txt/);
    const rows = t.split("\n").filter((l) => /^-\?+/.test(l));
    assert.equal(rows.length, 1); assert.doesNotMatch(rows[0], /deployer|rw-r--r--/, "the row itself must carry no owner/group/mode");
    assert.doesNotMatch(t, /rw-r--r--/);
  });
  test("x-only directory: both ls and ls -l are denied (cannot open directory)", () => {
    const c = mk("711"); out(c, "su monitoring");
    assert.match(out(c, `ls ${B}/d`), /Permission denied/); assert.match(out(c, `ls -l ${B}/d`), /Permission denied/);
  });
  test("r+x directory and the owner and root get the full listing", () => {
    for (const who of ["monitoring", "deployer", "root"]) {
      const c = mk("755"); if (who !== "root") out(c, `su ${who}`);
      const t = out(c, who === "root" ? `sudo ls -l ${B}/d` : `ls -l ${B}/d`); assert.match(t, /-rw-r--r--/, who); assert.doesNotMatch(t, /\?{9}/, who);
    }
  });
  test("root can ls -l a directory that has no permissions at all", () => {
    const c = mk("000"); assert.match(out(c, `sudo ls -l ${B}/d`), /-rw-r--r--/);
  });
});

/* -------------------------------------------------------------- G */
describe("G. special bits: chown/chgrp clear setuid/setgid on files; non-members cannot set setgid (kernel-measured)", () => {
  const f = (mode, owner = "alice", group = "alice", isDir = false) => load([isDir ? S.dir("x", mode, [], { owner, group }) : S.file("x", mode, { owner, group })]);
  const X = `${B}/x`;
  test("root chown of a setuid file clears setuid (4755 → 755), and says so", () => {
    const c = f("4755"); const t = out(c, `sudo chown deployer ${X}`); assert.equal(node(X).octal, "755"); assert.match(t, /setuid/i);
  });
  test("chown to the SAME owner still clears setuid (kernel clears it on every chown of a non-directory)", () => {
    const c = f("4755"); out(c, `sudo chown alice ${X}`); assert.equal(node(X).octal, "755");
  });
  test("chgrp clears setgid only when the group has execute: 2755 → 755 but 2745 stays", () => {
    let c = f("2755"); out(c, `sudo chgrp adm ${X}`); assert.equal(node(X).octal, "755");
    c = f("2745"); out(c, `sudo chgrp adm ${X}`); assert.equal(node(X).octal, "2745");
  });
  test("chgrp also clears setuid (6755 → 755 when group has x)", () => {
    const c = f("6755"); out(c, `sudo chgrp adm ${X}`); assert.equal(node(X).octal, "755");
  });
  test("directories keep setuid/setgid/sticky across chown and chgrp", () => {
    for (const m of ["4755", "2755", "1777"]) { const c = f(m, "alice", "alice", true); out(c, `sudo chown deployer ${X}`); out(c, `sudo chgrp adm ${X}`); assert.equal(node(X).octal, m, m); }
  });
  test("an owner who is NOT in the file's group cannot set setgid: chmod 2755 → 755 (file and directory)", () => {
    for (const isDir of [false, true]) { const c = f("644", "deployer", "alice", isDir); out(c, "su deployer"); const t = out(c, `chmod 2755 ${X}`); assert.equal(node(X).octal, "755", String(isDir)); assert.match(t, /setgid/i); }
  });
  test("…but 6755 keeps the setuid part: → 4755", () => {
    const c = f("644", "deployer", "alice"); out(c, "su deployer"); out(c, `chmod 6755 ${X}`); assert.equal(node(X).octal, "4755");
  });
  test("an owner who IS in the group, and root, keep setgid", () => {
    let c = f("644", "deployer", "deployer"); out(c, "su deployer"); out(c, `chmod 2755 ${X}`); assert.equal(node(X).octal, "2755");
    c = f("644", "deployer", "alice"); out(c, `sudo chmod 2755 ${X}`); assert.equal(node(X).octal, "2755");
  });
  test("setuid on your own file is allowed for a non-root owner (kernel: ok, 4755)", () => {
    const c = f("644", "deployer", "deployer"); out(c, "su deployer"); out(c, `chmod 4755 ${X}`); assert.equal(node(X).octal, "4755");
  });
});

/* -------------------------------------------------------------- H */
describe("H. an owner may 'change' ownership to the value it already has (kernel allows the no-op)", () => {
  const X = `${B}/x`; const mk = () => load([S.file("x", "644", { owner: "deployer", group: "alice" })]);
  test("owner: chown to self and chgrp to the file's current group succeed even if not a member", () => {
    const c = mk(); out(c, "su deployer");
    assert.doesNotMatch(out(c, `chown deployer ${X}`), /not permitted|Permission denied/i);
    assert.doesNotMatch(out(c, `chgrp alice ${X}`), /not permitted|Permission denied/i);
  });
  test("owner still cannot give the file away, or move it to a group they are not in", () => {
    const c = mk(); out(c, "su deployer");
    assert.match(out(c, `chown monitoring ${X}`), /not permitted|Permission denied/i); assert.equal(node(X).owner, "deployer");
    assert.match(out(c, `chgrp adm ${X}`), /not permitted|Permission denied/i); assert.equal(node(X).group, "alice");
  });
  test("a non-owner cannot do even the no-op", () => {
    const c = mk(); out(c, "su monitoring");
    assert.match(out(c, `chown deployer ${X}`), /not permitted|Permission denied/i); assert.match(out(c, `chgrp alice ${X}`), /not permitted|Permission denied/i);
  });
});

/* -------------------------------------------------------------- I */
describe("I. rm refuses directories (as the real rm does without -r) — including /", () => {
  test("rm <directory> says 'Is a directory' and removes nothing, even for root", () => {
    const c = load([S.dir("d", "755", [S.file("f", "644", { owner: "user", group: "user" })], { owner: "user", group: "user" })]);
    assert.match(out(c, `rm ${B}/d`), /Is a directory/); assert.match(out(c, `sudo rm ${B}/d`), /Is a directory/); assert.ok(node(`${B}/d/f`));
  });
  test("rm / does not claim success and leaves the root", () => {
    const c = load([]); const n = node("/").children.length;
    const t = out(c, "sudo rm /"); assert.doesNotMatch(t, /removed/); assert.match(t, /Is a directory/); assert.equal(node("/").children.length, n);
  });
  test("rm of a regular file still works", () => {
    const c = load([S.file("f", "644", { owner: "user", group: "user" })]); assert.match(out(c, `rm ${B}/f`), /removed/); assert.equal(node(`${B}/f`), null);
  });
});

/* -------------------------------------------------------------- J */
describe("J. setgid directory: new files, directories and symlinks inherit its group (kernel-measured; Learn teaches this)", () => {
  const mk = (mode) => load([S.dir("shared", mode, [S.file("seed", "644", { owner: "alice", group: "alice" })], { owner: "deployer", group: "adm" })]);
  const D = `${B}/shared`;
  test("touch: the file gets the directory's group, not the creator's primary group", () => {
    const c = mk("2777"); out(c, "su alice"); out(c, `touch ${D}/newfile`);
    assert.equal(node(`${D}/newfile`).owner, "alice"); assert.equal(node(`${D}/newfile`).group, "adm"); assert.equal(node(`${D}/newfile`).octal, "644");
  });
  test("mkdir: the directory gets the group AND the setgid bit (2755), so inheritance continues down", () => {
    const c = mk("2777"); out(c, "su alice"); out(c, `mkdir ${D}/newdir`);
    assert.equal(node(`${D}/newdir`).group, "adm"); assert.equal(node(`${D}/newdir`).octal, "2755");
    out(c, `touch ${D}/newdir/deep`); assert.equal(node(`${D}/newdir/deep`).group, "adm");
  });
  test("ln -s: the link gets the directory's group", () => {
    const c = mk("2777"); out(c, "su alice"); out(c, `ln -s ${D}/seed ${D}/lnk`); assert.equal(node(`${D}/lnk`).group, "adm");
  });
  test("cp: the copy gets the directory's group; the owner is still the copier", () => {
    const c = mk("2777"); out(c, "su alice"); out(c, `cp ${D}/seed ${D}/dup`);
    assert.equal(node(`${D}/dup`).owner, "alice"); assert.equal(node(`${D}/dup`).group, "adm"); assert.equal(node(`${D}/dup`).octal, "644");
  });
  test("root creating inside it inherits too (inheritance does not depend on who creates)", () => {
    const c = mk("2777"); out(c, `sudo touch ${D}/r`); assert.equal(node(`${D}/r`).group, "adm");
  });
  test("without the setgid bit nothing changes: creator's primary group, plain 755 directory", () => {
    const c = mk("777"); out(c, "su alice"); out(c, `touch ${D}/f`); out(c, `mkdir ${D}/d`);
    assert.equal(node(`${D}/f`).group, "alice"); assert.equal(node(`${D}/d`).group, "alice"); assert.equal(node(`${D}/d`).octal, "755");
  });
  test("sticky alone (1777, like /tmp) does not trigger inheritance", () => {
    const c = mk("1777"); out(c, "su alice"); out(c, `touch ${D}/f`); assert.equal(node(`${D}/f`).group, "alice");
  });
  test("mv keeps the moved file's group (only creation inherits)", () => {
    const c = load([S.dir("shared", "2777", [], { owner: "deployer", group: "adm" }), S.dir("home", "755", [S.file("mine", "644", { owner: "alice", group: "alice" })], { owner: "alice", group: "alice" })]);
    out(c, "su alice"); out(c, `mv ${B}/home/mine ${B}/shared`); assert.equal(node(`${B}/shared/mine`).group, "alice");
  });
});

/* -------------------------------------------------------------- K */
describe("K. every message added by the audit escapes hostile file names", () => {
  const EVIL = "<img/src=x/onerror=alert(1)>";
  const html = (c, from) => c.children.slice(from).map((n) => String(n.innerHTML ?? "")).join("\n");
  test("ls -l (r-only dir), mv, cp, chmod, getfacl and mv-into-itself never emit a raw tag", () => {
    const c = load([S.dir("d", "744", [S.file(EVIL, "644", { owner: "deployer", group: "deployer" }), S.file("ok", "644", { owner: "user", group: "user" }), S.dir("sub", "755", [], { owner: "user", group: "user" })], { owner: "deployer", group: "deployer" })]);
    const P = `${B}/d`; let reachedEscaped = 0;
    const cmds = ["su monitoring", `ls -l ${P}`, "exit", `sudo mv ${P}/ok ${P}/${EVIL}`, `sudo mv ${P}/sub ${P}/${EVIL}`, `mv ${P} ${P}/sub`, `sudo cp ${P}/${EVIL} ${P}/new1`,
      `sudo chmod 2755 ${P}/${EVIL}`, `sudo chown alice ${P}/${EVIL}`, `sudo setfacl -m u:alice:r-- ${P}/${EVIL}`, `getfacl ${P}/${EVIL}`, `sudo rm ${P}/${EVIL}`, `sudo mkdir ${P}/${EVIL}3`];
    for (const cmd of cmds) {
      const from = c.children.length; assert.doesNotThrow(() => runCommand(cmd, c), cmd);
      const h = html(c, from + 1);
      assert.doesNotMatch(h.replace(/&lt;img/g, ""), /<img[\s/]/i, `raw markup in the output of: ${cmd}`);
      if (/&lt;img/.test(h)) reachedEscaped += 1;
    }
    assert.ok(reachedEscaped >= 3, "the hostile name must actually have reached the output (otherwise this test proves nothing)");
  });
});
