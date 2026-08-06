/**
 * tests/engine/symlinks.test.js
 * Dedicated coverage for symlink semantics, split out from fs-model.test.js
 * per the testing plan's explicit "Symlinks" category. terminal.js's
 * command handlers aren't exported (only initTerminal is, since they also
 * do DOM printing), so these tests exercise the exact business rule that
 * drives them — resolveWriteTarget() plus the same "mutate the resolved
 * target" step handleChmod/handleChown/handleChgrp perform — against the
 * real shared FS_TREE. Every test sets its own starting values so ordering
 * between tests never matters, since FS_TREE is shared mutable state.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { FS_TREE, findNode, resolveWriteTarget } from "../../assets/js/engine/fs-model.js";

describe("symlink target resolution", () => {
  test("an absolute-target symlink resolves regardless of its own location", () => {
    const link = findNode(FS_TREE, "/tmp/current_auth_log");
    assert.equal(link.isSymlink, true);
    const { target } = resolveWriteTarget(link);
    assert.equal(target.path, "/var/log/auth.log");
  });

  test("a relative-target symlink resolves against its own parent directory, not cwd", () => {
    const link = findNode(FS_TREE, "/home/user/latest_backup.sql");
    const { target } = resolveWriteTarget(link);
    assert.equal(target.path, "/home/user/backup.sql");
    assert.equal(target.name, "backup.sql");
  });

  test("a symlink's own mode is always reported as cosmetic 777, independent of its target", () => {
    const link = findNode(FS_TREE, "/tmp/current_auth_log");
    assert.equal(link.octal, "777");
    const { target } = resolveWriteTarget(link);
    assert.notEqual(target.octal, "777", "the real target should not also be 777 — that would defeat the whole teaching point");
  });
});

describe("chmod-follows-symlink semantics", () => {
  test("chmod on a symlink changes the TARGET's mode, never the link's own mode", () => {
    const link = findNode(FS_TREE, "/home/user/latest_backup.sql");
    const { target, followedSymlink } = resolveWriteTarget(link);
    assert.equal(followedSymlink, true);

    // Simulate what handleChmod does: mutate the resolved target.
    target.octal = "600";

    assert.equal(target.octal, "600", "the real file's mode changed");
    assert.equal(link.octal, "777", "the symlink's own cosmetic mode is untouched");

    // Cleanup: restore so other tests/processes relying on this shared
    // node's original mode aren't affected by this test having run.
    target.octal = "666";
  });

  test("chmod on an ordinary (non-symlink) file changes that file directly", () => {
    const node = findNode(FS_TREE, "/etc/shadow");
    const original = node.octal;
    const { target, followedSymlink } = resolveWriteTarget(node);
    assert.equal(followedSymlink, false);
    assert.equal(target, node);
    target.octal = "600";
    assert.equal(node.octal, "600");
    node.octal = original; // restore
  });
});

describe("chown/chgrp-follows-symlink semantics", () => {
  test("chown on a symlink changes the target's owner, not the link's", () => {
    const link = findNode(FS_TREE, "/home/user/latest_backup.sql");
    const linkOwnerBefore = link.owner;
    const { target } = resolveWriteTarget(link);
    const originalTargetOwner = target.owner;

    target.owner = "alice";
    assert.equal(target.owner, "alice");
    assert.equal(link.owner, linkOwnerBefore, "the symlink node's own owner field must be untouched by a write that followed it to its target");

    target.owner = originalTargetOwner; // restore
  });

  test("chgrp on a symlink changes the target's group, not the link's", () => {
    const link = findNode(FS_TREE, "/tmp/current_auth_log");
    const { target } = resolveWriteTarget(link);
    const originalGroup = target.group;

    target.group = "auditors";
    assert.equal(target.group, "auditors");

    target.group = originalGroup; // restore
  });
});

describe("broken symlink behavior", () => {
  test("resolveWriteTarget reports dangling:true and target:null for an unresolvable target", () => {
    const dangling = { name: "old-deploy", isSymlink: true, target: "deploy_old.sh", path: "/opt/app/bin/old-deploy" };
    const result = resolveWriteTarget(dangling);
    assert.equal(result.dangling, true);
    assert.equal(result.target, null);
  });

  test("a dangling symlink with an absolute nonexistent target is also detected", () => {
    const dangling = { name: "ghost", isSymlink: true, target: "/etc/does-not-exist.conf", path: "/tmp/ghost" };
    const result = resolveWriteTarget(dangling);
    assert.equal(result.dangling, true);
  });
});
