/**
 * engine/fs-model.js
 * filesystem.js already exports pure, DOM-free tree operations
 * (findNode, resolvePath, parentPath, resolveSymlink, flattenTree) — those
 * are re-exported here unchanged so tests have one place to import "the
 * filesystem model" from, without pulling in filesystem.js's rendering code.
 *
 * resolveWriteTarget() is new: it's the "which node does a write actually
 * land on" decision that handleChmod/handleChown/handleChgrp in terminal.js
 * each re-implemented slightly differently (three near-identical
 * `node.isSymlink ? resolveSymlink(node) : node` blocks). Extracting it
 * removes that duplication and makes the symlink-follow rule independently
 * testable. No behavior change — terminal.js's printed messages are
 * unchanged, only where the decision is made.
 */

import { resolveSymlink } from "../filesystem.js";

export { findNode, resolvePath, parentPath, resolveSymlink, flattenTree, FS_TREE } from "../filesystem.js";

/**
 * Given a node a write command (chmod/chown/chgrp) was pointed at, decide
 * which node the write actually applies to.
 *
 * Returns:
 *   { target: <node>, followedSymlink: false, dangling: false }   — ordinary file/dir
 *   { target: <targetNode>, followedSymlink: true, dangling: false } — symlink, resolved
 *   { target: null, followedSymlink: true, dangling: true }         — dangling symlink
 */
export function resolveWriteTarget(node) {
  if (!node.isSymlink) return { target: node, followedSymlink: false, dangling: false };
  const target = resolveSymlink(node);
  if (!target) return { target: null, followedSymlink: true, dangling: true };
  return { target, followedSymlink: true, dangling: false };
}
