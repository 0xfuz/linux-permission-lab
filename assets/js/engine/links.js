/**
 * engine/links.js  (v2.4)
 * The pure half of `ln -s`: where the link lands, whether it may replace
 * something, and the node it creates. terminal.js only does the permission
 * check and the printing.
 *
 * Matches real ln -s semantics:
 *   - the target string is stored VERBATIM (relative or absolute) and is never
 *     validated — dangling links are legal
 *   - a relative target resolves against the LINK's directory, not the cwd
 *   - if the destination is an existing directory, the link goes inside it,
 *     named after the target's basename
 *   - an existing destination is an error unless -f, and -f never replaces a
 *     directory
 */

import { FS_TREE, findNode, parentPath, resolveSymlink } from "../filesystem.js";
import { primaryGroup } from "./users.js";

export function baseName(path) {
  const parts = String(path).split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
}

/** Final path for the new link, given the resolved destination path and the raw target string. */
export function linkLocation(destPath, targetArg) {
  const dest = findNode(FS_TREE, destPath);
  if (dest && dest.isDir) {
    const name = baseName(targetArg);
    if (!name) return null;
    return (destPath === "/" ? "" : destPath) + "/" + name;
  }
  return destPath;
}

export function buildSymlinkNode(linkPath, target, userName) {
  return {
    name: baseName(linkPath), path: linkPath, isDir: false, isSymlink: true, target,
    octal: "777", owner: userName, group: primaryGroup(userName), sensitive: false,
    note: "A symlink created in this simulation. Its own mode is always 777 — access is decided by whatever it points at.",
  };
}

/**
 * Insert the link. Returns { ok, node, replaced, dangling } or { ok:false, error }
 * where error is "no-parent" | "exists" | "is-dir".
 */
export function placeSymlink(linkPath, target, userName, { force = false } = {}) {
  const parent = findNode(FS_TREE, parentPath(linkPath));
  if (!parent || !parent.isDir) return { ok: false, error: "no-parent" };
  const existing = findNode(FS_TREE, linkPath);
  if (existing && existing.isDir) return { ok: false, error: "is-dir" };
  if (existing && !force) return { ok: false, error: "exists" };
  if (existing) parent.children = parent.children.filter((c) => c !== existing);
  const node = buildSymlinkNode(linkPath, target, userName);
  parent.children = parent.children || [];
  parent.children.push(node);
  return { ok: true, node, replaced: !!existing, dangling: !resolveSymlink(node) };
}
