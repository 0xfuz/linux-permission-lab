/**
 * tests/engine/users.test.js
 * Access-control rules from engine/users.js, checked against the real
 * FS_TREE. Each test names the exact rule it pins down.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { FS_TREE, findNode } from "../../assets/js/engine/fs-model.js";
import {
  getUser, canSudo, formatId, primaryGroup, isInGroup, modeTriads, isSticky,
  classify, checkAccess, checkTraverse, checkPathAccess, isVisibleTo, checkCreate, checkDelete,
  canChmod, canChown, canChgrp, parseUmask, modeAfterUmask, newFileMode, newDirMode, copiedMode, umaskSymbolic,
} from "../../assets/js/engine/users.js";

const node = (p) => { const n = findNode(FS_TREE, p); assert.ok(n, `fixture missing: ${p}`); return n; };

describe("identities", () => {
  test("id output matches the Linux format", () => {
    assert.equal(formatId("user"), "uid=1000(user) gid=1000(user) groups=1000(user),27(sudo)");
    assert.equal(formatId("root"), "uid=0(root) gid=0(root) groups=0(root)");
    assert.equal(formatId("nobody-here"), null);
  });
  test("only root and members of the sudo group may sudo", () => {
    assert.equal(canSudo("root"), true);
    assert.equal(canSudo("user"), true);
    assert.equal(canSudo("alice"), false);
    assert.equal(canSudo("ghost"), false);
  });
  test("primary group is the first listed; membership is exact", () => {
    assert.equal(primaryGroup("alice"), "alice");
    assert.equal(isInGroup("alice", "adm"), true);
    assert.equal(isInGroup("alice", "sudo"), false);
  });
  test("lookups can't be fooled by prototype keys", () => {
    assert.equal(getUser("constructor"), null);
    assert.equal(getUser("__proto__"), null);
  });
});

describe("mode parsing", () => {
  test("4-digit and 3-digit modes parse to the same triads", () => {
    assert.deepEqual(modeTriads("640"), { special: 0, owner: "rw-", group: "r--", others: "---" });
    assert.deepEqual(modeTriads("1777"), { special: 1, owner: "rwx", group: "rwx", others: "rwx" });
  });
  test("sticky detection is directory-only", () => {
    assert.equal(isSticky(node("/tmp")), true);
    assert.equal(isSticky(node("/etc")), false);
  });
});

describe("single-node access classes", () => {
  test("owner bits apply even when group/others would allow MORE", () => {
    const f = { path: "/x", octal: "044", owner: "alice", group: "alice", isDir: false };
    assert.equal(classify(f, "alice").cls, "owner");
    assert.equal(checkAccess(f, "alice", "r"), false, "owner is locked out by 0 owner bits");
    assert.equal(checkAccess(f, "user", "r"), true, "others still get r");
  });
  test("group membership grants the group bits (/var/log/auth.log is 640 root:adm)", () => {
    const log = node("/var/log/auth.log");
    assert.equal(checkAccess(log, "alice", "r"), true, "alice is in adm");
    assert.equal(checkAccess(log, "user", "r"), false, "user is not");
    assert.equal(classify(log, "user").cls, "others");
  });
  test("root bypasses r/w but a file with no x bit at all is not executable even for root", () => {
    const shadow = node("/etc/shadow");
    assert.equal(checkAccess(shadow, "root", "r"), true);
    assert.equal(checkAccess(shadow, "root", "w"), true);
    assert.equal(checkAccess(shadow, "root", "x"), false, "640 has no x anywhere");
    assert.equal(checkAccess(node("/home/user/script.sh"), "root", "x"), true);
    assert.equal(checkAccess(node("/root"), "root", "x"), true, "directories are always searchable by root");
  });
  test("named ACL user entry is capped by the mask", () => {
    const f = { path: "/y", octal: "640", owner: "root", group: "root", isDir: false,
      acl: [{ type: "user", id: "monitoring", perms: "rwx" }], aclMask: "r--" };
    assert.equal(classify(f, "monitoring").perms, "r--", "rwx ∩ mask r-- = r--");
    assert.equal(checkAccess(f, "monitoring", "w"), false);
  });
  test("a matching group class that grants nothing does NOT fall through to others", () => {
    const f = { path: "/z", octal: "007", owner: "root", group: "adm", isDir: false };
    assert.equal(checkAccess(f, "alice", "r"), false, "alice is in adm (---) so others' r-- must not rescue her");
    assert.equal(checkAccess(f, "user", "r"), true);
  });
  test("seeded ACL: monitoring may read app.yml, a plain user may not", () => {
    const yml = node("/opt/app/config/app.yml");
    assert.equal(checkAccess(yml, "monitoring", "r"), true);
    assert.equal(checkAccess(yml, "monitoring", "w"), false);
    assert.equal(checkAccess(yml, "alice", "r"), false);
  });
});

describe("path traversal", () => {
  test("a file ACL is useless without x on the directory above it", () => {
    assert.equal(checkPathAccess("/opt/app/config/app.yml", "monitoring", "r").ok, true, "dir ACL grants --x");
    const r = checkPathAccess("/opt/app/config/app.yml", "alice", "r");
    assert.equal(r.ok, false);
    assert.equal(r.at, "/opt/app/config");
  });
  test("750 home directory blocks other users from reaching files inside it", () => {
    assert.equal(checkTraverse("/home/alice/project/README.md", "user").ok, false);
    assert.equal(checkTraverse("/home/alice/project/README.md", "alice").ok, true);
  });
  test("recursive listings hide anything under an unreadable directory", () => {
    assert.equal(isVisibleTo("/root/root_notes.txt", "user"), false);
    assert.equal(isVisibleTo("/root/root_notes.txt", "root"), true);
    assert.equal(isVisibleTo("/etc/passwd", "user"), true);
  });
});

describe("create / delete / sticky bit", () => {
  test("creating needs w on the parent directory", () => {
    assert.equal(checkCreate("/etc/newfile", "user").ok, false);
    assert.equal(checkCreate("/etc/newfile", "root").ok, true);
    assert.equal(checkCreate("/home/user/newfile", "user").ok, true);
  });
  test("deleting needs w on the parent — the file's own mode is irrelevant", () => {
    const open = node("/etc/hosts"); // 644, but /etc is 755 root
    assert.equal(checkDelete("/etc/hosts", open, "user").ok, false);
    const mine = node("/home/user/notes.txt");
    assert.equal(checkDelete("/home/user/notes.txt", mine, "user").ok, true);
  });
  test("sticky /tmp: you can delete your own files, not other people's, even though /tmp is 1777", () => {
    const mine = node("/tmp/session_abc123"); // owner user
    assert.equal(checkDelete("/tmp/session_abc123", mine, "user").ok, true);
    const res = checkDelete("/tmp/session_abc123", mine, "alice");
    assert.equal(res.ok, false);
    assert.equal(res.reason, "sticky");
    assert.equal(checkDelete("/tmp/session_abc123", mine, "root").ok, true, "root ignores the sticky rule");
  });
});

describe("ownership changes", () => {
  const f = { owner: "alice", group: "alice" };
  test("chmod: owner or root only", () => {
    assert.equal(canChmod(f, "alice"), true);
    assert.equal(canChmod(f, "root"), true);
    assert.equal(canChmod(f, "user"), false);
  });
  test("chown: root only — not even the owner", () => {
    assert.equal(canChown("alice"), false);
    assert.equal(canChown("root"), true);
  });
  test("chgrp: owner may switch only to a group they belong to", () => {
    assert.equal(canChgrp(f, "alice", "adm"), true);
    assert.equal(canChgrp(f, "alice", "sudo"), false);
    assert.equal(canChgrp(f, "user", "user"), false, "not the owner");
    assert.equal(canChgrp(f, "root", "sudo"), true);
  });
});

describe("umask", () => {
  test("parseUmask accepts 3 or 4 octal digits and rejects the rest", () => {
    assert.equal(parseUmask("022"), "022");
    assert.equal(parseUmask("0077"), "077");
    for (const bad of ["", "89", "0888", "12", "12345", "rwx", "-1"]) assert.equal(parseUmask(bad), null, bad);
  });
  test("classic defaults: 022 -> files 644 / dirs 755; 077 -> 600 / 700; 002 -> 664 / 775", () => {
    assert.deepEqual([newFileMode("022"), newDirMode("022")], ["644", "755"]);
    assert.deepEqual([newFileMode("077"), newDirMode("077")], ["600", "700"]);
    assert.deepEqual([newFileMode("002"), newDirMode("002")], ["664", "775"]);
    assert.deepEqual([newFileMode("000"), newDirMode("000")], ["666", "777"]);
    assert.deepEqual([newFileMode("777"), newDirMode("777")], ["000", "000"]);
  });
  test("umask only ever REMOVES bits (it can't add x to a plain file)", () => {
    assert.equal(modeAfterUmask("666", "000"), "666");
    assert.equal(copiedMode("755", "077"), "700");
    assert.equal(copiedMode("4755", "022"), "755", "setuid bit is dropped by cp");
  });
  test("umask -S shows what remains", () => {
    assert.equal(umaskSymbolic("022"), "u=rwx,g=rx,o=rx");
    assert.equal(umaskSymbolic("077"), "u=rwx,g=,o=");
  });
});
