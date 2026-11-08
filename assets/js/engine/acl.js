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
 *   - recalcAclMask: recomputes node.aclMask from group:: + node.acl
 *   - commitAcl / applyChmod / groupObjPerms: the kernel's mode<->ACL coupling (see the block below)
 */

import { triadToSymbol } from "../converter.js";

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

/* ---- the kernel's model of "mode bits + ACL" (audited against Linux 6.x, v2.13.0) -------------------------
 * Once a file has named ACL entries, its mode's GROUP digit is no longer the owning group's permission: it IS
 * the mask. The owning group's own entry ("group::") is stored separately. So, exactly like the kernel:
 *   - setfacl -m / -x : mask = group:: ∪ every named entry, and the mode's group digit mirrors that mask
 *   - chmod           : the new group digit becomes the MASK; group:: and the named entries are untouched
 *   - removing the last named entry: the mode's group digit goes back to group::
 * node.aclGroup holds group:: (a "rwx" triad) and exists only while the node has named entries. Nodes BUILT with
 * ACL entries and no aclGroup (scenario/fixture data) keep working: their group digit is read as group::.      */

const digitToTriad = (d) => `${d & 4 ? "r" : "-"}${d & 2 ? "w" : "-"}${d & 1 ? "x" : "-"}`;
const triadToDigit = (t) => (t[0] === "r" ? 4 : 0) + (t[1] === "w" ? 2 : 0) + (t[2] === "x" ? 1 : 0);

/** The group digit of an octal mode string ("640", "2755") as an "rwx" triad. */
export function modeGroupTriad(octal) {
  const s = String(octal).padStart(3, "0");
  return digitToTriad(Number(s[s.length - 2]));
}

/** The same mode string with its group digit replaced by `triad`. */
export function withModeGroupTriad(octal, triad) {
  const s = String(octal).padStart(3, "0");
  return s.slice(0, -2) + triadToDigit(triad) + s.slice(-1);
}

/** The owning group's entry (group::): stored once an ACL exists, otherwise simply the mode's group digit. */
export function groupObjPerms(node) {
  return node.aclGroup !== undefined ? node.aclGroup : modeGroupTriad(node.octal);
}

/**
 * Mutates node.aclMask in place to the union of the owning group's entry and every named entry. Safe on a node
 * with no ACL entries — the mask just collapses to the group permission. Does NOT touch node.octal.
 */
export function recalcAclMask(node) {
  let mask = groupObjPerms(node);
  (node.acl || []).forEach((e) => { mask = permsUnion(mask, e.perms); });
  node.aclMask = mask;
  return mask;
}

/**
 * Call after adding/removing named entries (setfacl -m / -x). Captures group:: before the mode's group digit is
 * overwritten, recalculates the mask, and mirrors it into the mode. With no named entries left the ACL is
 * "minimal" again: the group digit returns to group::.
 */
export function commitAcl(node) {
  if (!(node.acl && node.acl.length)) {
    if (node.aclGroup !== undefined) { node.octal = withModeGroupTriad(node.octal, node.aclGroup); delete node.aclGroup; }
    node.aclMask = modeGroupTriad(node.octal);
    return node.aclMask;
  }
  if (node.aclGroup === undefined) node.aclGroup = modeGroupTriad(node.octal);
  const mask = recalcAclMask(node);
  node.octal = withModeGroupTriad(node.octal, mask);
  return mask;
}

/**
 * chmod on a node: sets the mode and, if the node has named ACL entries, makes the new group digit the mask
 * (the kernel's posix_acl_chmod) while keeping group:: as it was. Returns true when an ACL was involved.
 */
export function applyChmod(node, octal) {
  const hasAcl = !!(node.acl && node.acl.length);
  if (hasAcl && node.aclGroup === undefined) node.aclGroup = modeGroupTriad(node.octal);
  node.octal = octal;
  if (hasAcl) node.aclMask = modeGroupTriad(octal);
  return hasAcl;
}
