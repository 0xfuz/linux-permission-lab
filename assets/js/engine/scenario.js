/**
 * engine/scenario.js  (v2.12)
 * Pure, DOM-free scenario runtime for state-based challenges and the
 * Investigation Mode. It does NOT add a second simulation: a scenario is
 * just a small subtree grafted into the SAME FS_TREE the terminal already
 * operates on (under /srv/lab/<id>), plus optional group-membership
 * overrides on the SAME USERS table. Validation then asks the existing
 * access engine (engine/users.js) whether the resulting state grants or
 * denies access — it never looks at which commands were typed.
 *
 * Determinism: a scenario supplies build() which returns FRESH nodes every
 * call, so "reset" is simply "unload, then build again".
 */
import { FS_TREE, findNode, assignPaths } from "../filesystem.js";
import {
  USERS, DEFAULT_UMASK, checkPathAccess, checkAccess, effectivePerms, explainAccess, explainTraverse, modeTriads, classify,
} from "./users.js";
import { resetTerminalState, setCwd, setSession } from "../terminal-state.js";

export const LAB_ROOT = "/srv/lab";

/* ------------------------------ node builders ----------------------------- */

/** Same node shape as filesystem.js's f()/d() helpers. */
export function file(name, octal, opts = {}) {
  return {
    name, isDir: false, octal, owner: opts.owner || "user", group: opts.group || "user",
    sensitive: !!opts.sensitive, note: opts.note || "", acl: opts.acl ? opts.acl.map((e) => ({ ...e })) : [],
  };
}
export function dir(name, octal, children = [], opts = {}) {
  return {
    name, isDir: true, octal, owner: opts.owner || "user", group: opts.group || "user",
    sensitive: !!opts.sensitive, note: opts.note || "", children,
    ...(opts.acl ? { acl: opts.acl.map((e) => ({ ...e })) } : {}),
  };
}

/* ----------------------------- load / unload ------------------------------ */

let active = null; // { id, createdSrv, createdLab, usersBackup }

export const scenarioBase = (def) => `${LAB_ROOT}/${def.id}`;
export const activeScenarioId = () => (active ? active.id : null);

/** Remove the grafted subtree and restore any group overrides. Safe to call when nothing is loaded. */
export function unloadScenario() {
  if (!active) return;
  const srv = findNode(FS_TREE, "/srv");
  const lab = findNode(FS_TREE, LAB_ROOT);
  if (lab) lab.children = lab.children.filter((c) => c.name !== active.id);
  if (srv && lab && lab.children.length === 0) srv.children = srv.children.filter((c) => c !== lab);
  if (srv && srv.children.length === 0 && active.createdSrv) FS_TREE.children = FS_TREE.children.filter((c) => c !== srv);
  for (const [name, groups] of Object.entries(active.usersBackup)) USERS[name].groups = groups;
  active = null;
}

/** Build the scenario's initial state inside FS_TREE. Replaces any scenario already loaded. */
export function loadScenario(def) {
  unloadScenario();
  const usersBackup = {};
  for (const [name, o] of Object.entries(def.users || {})) {
    if (!USERS[name] || !Array.isArray(o.groups)) continue;
    usersBackup[name] = [...USERS[name].groups];
    USERS[name].groups = [...o.groups];
  }
  let srv = findNode(FS_TREE, "/srv");
  const createdSrv = !srv;
  if (!srv) {
    srv = dir("srv", "755", [], { owner: "root", group: "root" });
    FS_TREE.children.push(srv);
  }
  let lab = srv.children.find((c) => c.name === "lab");
  if (!lab) { lab = dir("lab", "755", [], { owner: "root", group: "root" }); srv.children.push(lab); }
  const root = dir(def.id, def.baseMode || "755", def.build(), { owner: "user", group: "user" });
  lab.children.push(root);
  assignPaths(srv, "");
  active = { id: def.id, createdSrv, usersBackup };
  return scenarioBase(def);
}

/**
 * Load the scenario AND put the shell where the scenario expects it
 * (cwd = scenario dir, logged in as def.startAs, default umask).
 */
export function startScenario(def) {
  const base = loadScenario(def);
  resetTerminalState();
  setSession({ user: def.startAs || "user", umask: DEFAULT_UMASK });
  setCwd(def.startDir || base);
  return base;
}

/* -------------------------------- checks --------------------------------- */
/* A check is { id, level: "required" | "advisory", label, run() -> {ok, detail} }.
   `required` checks decide pass/fail; `advisory` checks never block, they
   teach ("works, but more permissive than necessary"). */

const WORD = { r: "read", w: "write", x: "execute/search" };

function missing(path) { return { ok: false, detail: `${path} no longer exists — removing or moving it does not fix the problem.` }; }

function accessDetail(path, user, need, res) {
  if (res.ok) return `${user} can ${WORD[need]} ${path}.`;
  if (res.missing) return `${path} does not exist.`;
  const at = res.at ? findNode(FS_TREE, res.at) : null;
  if (!at) return `${user} cannot ${WORD[need]} ${path}.`;
  return at.path === path ? explainAccess(at, user, need) : explainTraverse(at, user);
}

export function canAccess(id, user, path, need, { level = "required", label } = {}) {
  return { id, level, label: label || `${user} can ${WORD[need]} ${path}`, run() {
    const res = checkPathAccess(path, user, need);
    return { ok: res.ok, detail: accessDetail(path, user, need, res) };
  } };
}

/** Passes only when the path EXISTS and access is really denied. */
export function cannotAccess(id, user, path, need, { level = "required", label } = {}) {
  return { id, level, label: label || `${user} cannot ${WORD[need]} ${path}`, run() {
    if (!findNode(FS_TREE, path)) return missing(path);
    const res = checkPathAccess(path, user, need);
    return { ok: !res.ok, detail: res.ok ? `${user} can still ${WORD[need]} ${path}.` : `${user} is correctly denied (${accessDetail(path, user, need, res)})` };
  } };
}

/**
 * Every account except `except` is denied `need`. Judged on EFFECTIVE access, so named ACL
 * entries (after the mask) count. root is never listed: it bypasses permission checks.
 */
export function othersCannot(id, path, need, except, { level = "required", label } = {}) {
  return { id, level, label: label || `no account except ${except.join(", ")} can ${WORD[need]} ${path}`, run() {
    if (!findNode(FS_TREE, path)) return missing(path);
    const leaks = Object.keys(USERS).filter((u) => u !== "root" && !except.includes(u) && checkPathAccess(path, u, need).ok);
    return { ok: leaks.length === 0, detail: leaks.length ? `still ${WORD[need]}-able by: ${leaks.join(", ")}.` : `no other account can ${WORD[need]} it.` };
  } };
}

/**
 * MODE BITS ONLY: every permission bit in the path's own mode (special bits included) must also
 * be present in `maxMode`. ACL entries are deliberately NOT considered here, so use this only
 * when the label says "mode"; use accessWithin() for a claim about what accounts can do.
 */
export function modeWithin(id, path, maxMode, { level = "required", label } = {}) {
  return { id, level, label: label || `the mode of ${path} is no more permissive than ${maxMode}`, run() {
    const n = findNode(FS_TREE, path);
    if (!n) return missing(path);
    const a = modeTriads(n.octal); const m = modeTriads(maxMode);
    const within = (x, y) => [0, 1, 2].every((i) => x[i] === "-" || y[i] === x[i]);
    const ok = within(a.owner, m.owner) && within(a.group, m.group) && within(a.others, m.others) && (a.special & ~m.special) === 0;
    return { ok, detail: ok ? `mode ${n.octal} is within ${maxMode}.` : `mode ${n.octal} grants more than ${maxMode} (more permissive than necessary).` };
  } };
}

/**
 * EFFECTIVE ACCESS: no account may end up with more access to `path` than it would have if the
 * node simply had mode `maxMode` and no ACL. Unlike modeWithin(), a named ACL entry that adds
 * bits beyond that (e.g. u:www-data:rwx on a 700 directory) is caught, while one that stays
 * inside it (u:www-data:--x against 711) is accepted. Special bits are compared too.
 */
export function accessWithin(id, path, maxMode, { level = "required", label } = {}) {
  return { id, level, label: label || `no account has more access to ${path} than mode ${maxMode} would give it`, run() {
    const n = findNode(FS_TREE, path);
    if (!n) return missing(path);
    const baseline = { ...n, octal: maxMode, acl: [], aclMask: undefined };
    const extra = [];
    for (const u of Object.keys(USERS)) {
      if (u === "root") continue;
      const have = effectivePerms(n, u); const allowed = effectivePerms(baseline, u);
      const over = [0, 1, 2].filter((i) => have[i] !== "-" && allowed[i] === "-").map((i) => "rwx"[i]).join("");
      if (over) extra.push(`${u} (+${over})`);
    }
    const special = (modeTriads(n.octal).special & ~modeTriads(maxMode).special) !== 0;
    const ok = extra.length === 0 && !special;
    return { ok, detail: ok ? `no account exceeds the access that mode ${maxMode} would give it.`
      : `more permissive than ${maxMode}: ${[...extra, ...(special ? ["special bits"] : [])].join(", ")}.` };
  } };
}

/**
 * Nothing in the subtree may be world-writable. "World-writable" means either of:
 *   - the mode's "others" write bit is set (in this model that bit IS the ACL's other:: entry —
 *     there is no separate other:: entry, setfacl only accepts u:/g:); or
 *   - every account other than the owner (root aside) can effectively write it, e.g. through
 *     named ACL entries or a group everyone belongs to. Effective means after the ACL mask, so an
 *     entry capped by the mask does not count, and an ACL for just some accounts is NOT flagged
 *     (that is targeted access, which othersCannot() is for).
 */
export function noWorldWriteUnder(id, rootPath, { level = "required", label } = {}) {
  return { id, level, label: label || `nothing under ${rootPath} is world-writable`, run() {
    const root = findNode(FS_TREE, rootPath);
    if (!root) return missing(rootPath);
    const bad = [];
    (function walk(n) {
      if (!n.isSymlink) {
        const everyoneElse = Object.keys(USERS).filter((u) => u !== "root" && u !== n.owner);
        if (modeTriads(n.octal).others[1] === "w") bad.push(`${n.path} (${n.octal})`);
        else if (everyoneElse.length && everyoneElse.every((u) => checkAccess(n, u, "w"))) bad.push(`${n.path} (writable by every account through ACL entries)`);
      }
      (n.children || []).forEach(walk);
    })(root);
    return { ok: bad.length === 0, detail: bad.length ? `world-writable: ${bad.join(", ")}.` : "no world-writable entries." };
  } };
}

export function ownerIs(id, path, owner, { level = "required", label } = {}) {
  return { id, level, label: label || `${path} is owned by ${owner}`, run() {
    const n = findNode(FS_TREE, path);
    if (!n) return missing(path);
    return { ok: n.owner === owner, detail: `${path} is owned by ${n.owner}.` };
  } };
}

/** Escape hatch for a one-off property: fn() -> { ok, detail }. */
export function custom(id, label, fn, { level = "required" } = {}) {
  return { id, level, label, run: fn };
}

/** Run every check against the LIVE simulated state. */
export function evaluateChecks(checks) {
  const results = checks.map((c) => {
    let r;
    try { r = c.run(); } catch (e) { r = { ok: false, detail: "check could not run" }; }
    return { id: c.id, level: c.level, label: c.label, ok: !!r.ok, detail: r.detail || "" };
  });
  const required = results.filter((r) => r.level === "required");
  return {
    ok: required.every((r) => r.ok),
    results,
    failedRequired: required.filter((r) => !r.ok),
    advisories: results.filter((r) => r.level === "advisory" && !r.ok),
  };
}

/* --------------------------------- hints ---------------------------------- */

/** Ordered hints, least → most revealing. Can only advance one at a time. */
export function createHintSession(hints) {
  let n = 0;
  return {
    total: hints.length,
    get revealed() { return n; },
    visible() { return hints.slice(0, n); },
    next() {
      if (n >= hints.length) return null;
      n += 1;
      return { index: n, text: hints[n - 1], last: n === hints.length };
    },
    reset() { n = 0; },
  };
}

/* ---------------------------- challenge session --------------------------- */

export function createChallengeSession(def) {
  const hints = createHintSession(def.hints);
  const s = { attempts: 0, solved: false, last: null };
  return {
    def, hints,
    get attempts() { return s.attempts; },
    get solved() { return s.solved; },
    get last() { return s.last; },
    /** Fresh start: state, hints and counters all back to zero. */
    start() { startScenario(def); hints.reset(); s.attempts = 0; s.solved = false; s.last = null; },
    /** Restore the ORIGINAL simulated state. Revealed hints stay revealed. */
    reset() { startScenario(def); s.solved = false; s.last = null; },
    check() {
      const r = evaluateChecks(def.checks);
      s.attempts += 1; s.last = r;
      if (r.ok) s.solved = true;
      return r;
    },
    end() { unloadScenario(); resetTerminalState(); },
  };
}

export { classify };
