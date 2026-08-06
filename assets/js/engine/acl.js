/**
 * engine/acl.js
 * Pure ACL mask / effective-permission math, extracted from terminal.js
 * (v2.3 introduced getfacl/setfacl; this file makes that math independently
 * testable and reusable without pulling in the rest of the terminal's DOM
 * code). No behavior changed from the original terminal.js implementation —
 * this is a straight move, not a rewrite.
 *
 * A real POSIX ACL mask caps what every *named* user/group entry can
 * actually do; it is recalculated on every setfacl -m/-x as the union of
 * the owning group's permission and every named entry's permission. These
 * three functions are the entire rule set:
 *   - permsIntersect: a named entry's effective permission (entry ∩ mask)
 *   - permsUnion: how the mask grows to admit a new/changed entry
 *   - recalcAclMask: recomputes node.aclMask from node.octal + node.acl
 */

import { triadToSymbol, octalToState } from "../converter.js";

/** "rwx" style triads in, "rwx" style triad out — bitwise-AND per position. */
export function permsIntersect(a, b) {
  return triadToSymbol({
    read: a[0] === "r" && b[0] === "r",
    write: a[1] === "w" && b[1] === "w",
    execute: a[2] === "x" && b[2] === "x",
  });
}

/** "rwx" style triads in, "rwx" style triad out — bitwise-OR per position. */
export function permsUnion(a, b) {
  return triadToSymbol({
    read: a[0] === "r" || b[0] === "r",
    write: a[1] === "w" || b[1] === "w",
    execute: a[2] === "x" || b[2] === "x",
  });
}

/**
 * Mutates node.aclMask in place (matching the original terminal.js
 * behavior exactly) to the union of the owning group's permission and
 * every entry in node.acl. Safe to call on a node with no ACL entries —
 * the mask just collapses to the group permission.
 */
export function recalcAclMask(node) {
  const state = octalToState(node.octal, node.isDir);
  let mask = triadToSymbol(state.group);
  (node.acl || []).forEach((e) => { mask = permsUnion(mask, e.perms); });
  node.aclMask = mask;
  return mask;
}
