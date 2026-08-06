/**
 * tests/engine/acl.test.js
 * Covers assets/js/engine/acl.js — the ACL mask/effective-permission math
 * extracted from terminal.js. This is flagged in the Phase 0 audit as the
 * most mathematically error-prone area of the app, so it gets the deepest
 * coverage of any single file in this suite.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { permsIntersect, permsUnion, recalcAclMask } from "../../assets/js/engine/acl.js";

describe("permsIntersect (effective permission = entry ∩ mask)", () => {
  test("rwx entry capped by r-- mask -> r--", () => {
    assert.equal(permsIntersect("rwx", "r--"), "r--");
  });
  test("r-- entry with a wider rwx mask is unaffected -> r--", () => {
    assert.equal(permsIntersect("r--", "rwx"), "r--");
  });
  test("identical entry and mask -> unchanged", () => {
    assert.equal(permsIntersect("rw-", "rw-"), "rw-");
  });
  test("no overlap at all -> ---", () => {
    assert.equal(permsIntersect("rwx", "---"), "---");
  });
  test("partial overlap on each bit independently", () => {
    assert.equal(permsIntersect("rw-", "r-x"), "r--");
  });
});

describe("permsUnion (mask growth when a new/changed entry is admitted)", () => {
  test("r-- union rwx -> rwx (mask expands to the widest entry)", () => {
    assert.equal(permsUnion("r--", "rwx"), "rwx");
  });
  test("union is commutative", () => {
    assert.equal(permsUnion("r--", "rwx"), permsUnion("rwx", "r--"));
  });
  test("union of two disjoint single bits combines them", () => {
    assert.equal(permsUnion("r--", "-w-"), "rw-");
  });
  test("union with --- is a no-op", () => {
    assert.equal(permsUnion("r-x", "---"), "r-x");
  });
});

describe("recalcAclMask (whole-node mask recalculation)", () => {
  test("no ACL entries: mask collapses to the owning group's permission", () => {
    const node = { octal: "640", acl: [] };
    const mask = recalcAclMask(node);
    assert.equal(mask, "r--");
    assert.equal(node.aclMask, "r--");
  });

  test("one entry no wider than the group permission leaves the mask unchanged", () => {
    // Mirrors the app.yml seeded scenario: group r--, monitoring r--
    const node = { octal: "640", acl: [{ type: "user", id: "monitoring", perms: "r--" }] };
    recalcAclMask(node);
    assert.equal(node.aclMask, "r--");
    assert.equal(permsIntersect("r--", node.aclMask), "r--", "monitoring's effective permission should be exactly r--, uncapped");
  });

  test("a wider entry (rwx) expands the mask beyond the group's own r--", () => {
    const node = { octal: "640", acl: [
      { type: "user", id: "monitoring", perms: "r--" },
      { type: "user", id: "alice", perms: "rwx" },
    ] };
    recalcAclMask(node);
    assert.equal(node.aclMask, "rwx");
    assert.equal(permsIntersect("rwx", node.aclMask), "rwx", "alice keeps full rwx since the mask grew to admit it");
    assert.equal(permsIntersect("r--", node.aclMask), "r--", "monitoring is unaffected by alice's wider grant");
  });

  test("removing the entry that widened the mask shrinks it back down", () => {
    const node = { octal: "640", acl: [
      { type: "user", id: "monitoring", perms: "r--" },
      { type: "user", id: "alice", perms: "rwx" },
    ] };
    recalcAclMask(node);
    assert.equal(node.aclMask, "rwx");

    node.acl = node.acl.filter((e) => e.id !== "alice");
    recalcAclMask(node);
    assert.equal(node.aclMask, "r--", "mask must be recalculated from scratch, not just diffed");
  });

  test("a group-type ACL entry participates in the mask exactly like a user entry", () => {
    const node = { octal: "600", acl: [{ type: "group", id: "auditors", perms: "r-x" }] };
    recalcAclMask(node);
    // group perm from 600 is ---, entry is r-x -> mask should be r-x
    assert.equal(node.aclMask, "r-x");
  });

  test("directory nodes use the same math (isDir does not change mask logic)", () => {
    const node = { octal: "750", isDir: true, acl: [{ type: "user", id: "deploy", perms: "rwx" }] };
    recalcAclMask(node);
    // group perm from 750 is r-x, union with rwx -> rwx
    assert.equal(node.aclMask, "rwx");
  });

  test("recalcAclMask mutates the node in place AND returns the mask", () => {
    const node = { octal: "644", acl: [] };
    const returned = recalcAclMask(node);
    assert.equal(returned, node.aclMask);
  });
});
