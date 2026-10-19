/**
 * terminal-state.js
 * The terminal's live session state — cwd, the current login shell, the su
 * stack, and the sudo password cache — split out of terminal.js (v2.9) so
 * the command handlers can live in several files without all of them
 * needing to sit next to a bare `let cwd`.
 *
 * Reads work through ordinary ES module imports: `import { cwd } from
 * "./terminal-state.js"` always sees the CURRENT value (a live binding),
 * so every handler file just imports what it reads. Only the few places
 * that actually CHANGE cwd or swap the session wholesale (cd, su, sudo,
 * exit, reset) need the setters below — an imported `let` can be read from
 * another module but never assigned to directly. session/sessionStack/
 * sudoCached are reference types (object/array/Set), so handlers mutate
 * them in place (session.umask = x, sessionStack.push(...),
 * sudoCached.add(...)) with no setter needed at all.
 */
import { DEFAULT_UMASK, getUser } from "./engine/users.js";
import { FS_TREE, findNode } from "./filesystem.js";

export const HOST = "permission-lab";
export const START_USER = "user";

export let cwd = "/home/user";
/** The current login shell. su pushes a new one, exit pops back. */
export let session = { user: START_USER, umask: DEFAULT_UMASK };
export const sessionStack = [];
/** Users who already "typed their sudo password" this run (real sudo caches ~5 min). */
export const sudoCached = new Set();

export const me = () => session.user;

export function setCwd(path) { cwd = path; }
export function setSession(next) { session = next; }

export function homeDir() {
  const home = getUser(me())?.home || "/";
  return findNode(FS_TREE, home) ? home : "/";
}

/** Test hook + Reset support: back to the initial shell state (filesystem is NOT reset). */
export function resetTerminalState() {
  cwd = "/home/user";
  session = { user: START_USER, umask: DEFAULT_UMASK };
  sessionStack.length = 0;
  sudoCached.clear();
}
export function getTerminalState() {
  return { user: session.user, cwd, umask: session.umask, depth: sessionStack.length };
}
