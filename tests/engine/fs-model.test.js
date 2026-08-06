/**
 * tests/engine/fs-model.test.js
 * Covers engine/fs-model.js: the re-exported tree operations from
 * filesystem.js (findNode, resolvePath, parentPath, flattenTree) plus the
 * new resolveWriteTarget() helper. Runs against the real, shared FS_TREE —
 * these are integration tests against the app's actual seeded data, not a
 * synthetic fixture, so they double as a regression guard on the fake
 * filesystem's content itself.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { FS_TREE, findNode, resolvePath, parentPath, flattenTree, resolveWriteTarget } from "../../assets/js/engine/fs-model.js";

describe("findNode", () => {
  test("finds a known real file by absolute path", () => {
    const node = findNode(FS_TREE, "/etc/shadow");
    assert.ok(node);
    assert.equal(node.name, "shadow");
  });

  test("returns null for a nonexistent path", () => {
    assert.equal(findNode(FS_TREE, "/nope/nope/nope"), null);
  });

  test("finds a directory as well as a file", () => {
    const node = findNode(FS_TREE, "/etc");
    assert.ok(node);
    assert.equal(node.isDir, true);
  });
});

describe("resolvePath", () => {
  test("a bare filename resolves relative to cwd", () => {
    assert.equal(resolvePath("/home/user", "latest_backup.sql"), "/home/user/latest_backup.sql");
  });

  test("an absolute target ignores cwd entirely", () => {
    assert.equal(resolvePath("/tmp", "/etc/shadow"), "/etc/shadow");
  });

  test("'..' walks up one directory level", () => {
    assert.equal(resolvePath("/home/user", "../root"), "/home/root");
  });
});

describe("parentPath", () => {
  test("a file's parent is its containing directory", () => {
    assert.equal(parentPath("/home/user/backup.sql"), "/home/user");
  });

  test("a top-level directory's parent is root", () => {
    assert.equal(parentPath("/etc"), "/");
  });
});

describe("flattenTree", () => {
  test("returns a flat array including nested files", () => {
    const all = flattenTree();
    assert.ok(Array.isArray(all));
    assert.ok(all.length > 50, "the seeded fake filesystem should have well over 50 nodes");
  });

  test("every symlink in the real tree is flagged isSymlink", () => {
    const all = flattenTree();
    const symlinks = all.filter((n) => n.isSymlink);
    assert.equal(symlinks.length, 2, "the app currently ships exactly 2 symlink scenarios — update this test deliberately if that changes");
  });
});

describe("resolveWriteTarget", () => {
  test("an ordinary file resolves to itself, not flagged as followed", () => {
    const node = findNode(FS_TREE, "/etc/shadow");
    const result = resolveWriteTarget(node);
    assert.equal(result.target, node);
    assert.equal(result.followedSymlink, false);
    assert.equal(result.dangling, false);
  });

  test("a valid symlink resolves to its real target node", () => {
    const link = findNode(FS_TREE, "/tmp/current_auth_log");
    const result = resolveWriteTarget(link);
    assert.equal(result.followedSymlink, true);
    assert.equal(result.dangling, false);
    assert.equal(result.target.path, "/var/log/auth.log");
  });

  test("a relative-target symlink resolves relative to its own directory", () => {
    const link = findNode(FS_TREE, "/home/user/latest_backup.sql");
    const result = resolveWriteTarget(link);
    assert.equal(result.target.path, "/home/user/backup.sql");
  });

  test("a dangling symlink (synthetic) reports dangling with a null target", () => {
    const dangling = { name: "broken", isSymlink: true, target: "/does/not/exist", path: "/tmp/broken" };
    const result = resolveWriteTarget(dangling);
    assert.equal(result.dangling, true);
    assert.equal(result.target, null);
    assert.equal(result.followedSymlink, true);
  });
});
