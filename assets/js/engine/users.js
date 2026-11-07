/**
 * engine/users.js  (v2.4)
 * Pure, DOM-free identity + access-control rules for the simulated shell.
 * Before v2.4 the terminal never enforced anything — every command ran as an
 * all-powerful "user". This module is what makes su / sudo / umask meaningful:
 * it answers "may THIS user do THAT to this node?" with the same rules the
 * Linux kernel applies, so the terminal can print a real "Permission denied"
 * and — more importantly — explain *which* permission class decided it.
 *
 * Rule order implemented (matches POSIX.1e / real Linux):
 *   1. root bypasses read/write checks (execute still needs at least one x bit
 *      on a regular file; directories are always searchable by root)
 *   2. owner  -> owner bits ONLY (even if group/others would allow more)
 *   3. a named-user ACL entry -> that entry ∩ mask
 *   4. group class (owning group and/or named-group entries the user belongs
 *      to) -> union of those entries ∩ mask. If a group entry matches but
 *      grants nothing, access is DENIED — it never falls through to "others"
 *   5. others bits
 * Directory traversal: every ancestor directory must grant x (search).
 * Deleting/renaming needs w+x on the PARENT, plus the sticky-bit rule.
 */

import { FS_TREE, findNode, parentPath } from "../filesystem.js";
import { permsIntersect, permsUnion, recalcAclMask, groupObjPerms } from "./acl.js";

/* ------------------------------ identities ------------------------------ */

export const GROUP_IDS = {
  root: 0, adm: 4, sudo: 27, "www-data": 33,
  user: 1000, alice: 1001, deployer: 1002, monitoring: 1003,
};

/** First entry of `groups` is the user's primary group. */
export const USERS = {
  root:       { uid: 0,    groups: ["root"],              home: "/root" },
  user:       { uid: 1000, groups: ["user", "sudo"],      home: "/home/user" },
  alice:      { uid: 1001, groups: ["alice", "adm"],      home: "/home/alice" },
  deployer:   { uid: 1002, groups: ["deployer"],          home: "/opt/app" },
  monitoring: { uid: 1003, groups: ["monitoring"],        home: "/" },
  "www-data": { uid: 33,   groups: ["www-data"],          home: "/var/www" },
};

export const getUser = (name) => (Object.prototype.hasOwnProperty.call(USERS, name) ? USERS[name] : null);
export const groupExists = (name) => Object.prototype.hasOwnProperty.call(GROUP_IDS, name);
export const primaryGroup = (name) => getUser(name)?.groups[0] ?? name;
export const isInGroup = (name, group) => !!getUser(name)?.groups.includes(group);
export const canSudo = (name) => name === "root" || isInGroup(name, "sudo");

/** `id` output, e.g. uid=1000(user) gid=1000(user) groups=1000(user),27(sudo) */
export function formatId(name) {
  const u = getUser(name);
  if (!u) return null;
  const g = (n) => `${GROUP_IDS[n]}(${n})`;
  return `uid=${u.uid}(${name}) gid=${GROUP_IDS[u.groups[0]]}(${u.groups[0]}) groups=${u.groups.map(g).join(",")}`;
}

/* ------------------------------ mode parsing ----------------------------- */

const digitTriad = (d) => (d & 4 ? "r" : "-") + (d & 2 ? "w" : "-") + (d & 1 ? "x" : "-");

/** "1777" / "640" -> { special: 1, owner: "rwx", group: "rwx", others: "rwx" } */
export function modeTriads(octal) {
  const s = String(octal).padStart(4, "0").slice(-4);
  return { special: Number(s[0]), owner: digitTriad(+s[1]), group: digitTriad(+s[2]), others: digitTriad(+s[3]) };
}

export const isSticky = (node) => !!node && node.isDir && (modeTriads(node.octal).special & 1) === 1;

/* --------------------------- single-node access --------------------------- */

/** Which permission class decides for this user, and what it grants. */
export function classify(node, name) {
  if (name === "root") return { cls: "root", perms: "rwx" };
  const { owner, group, others } = modeTriads(node.octal);
  if (name === node.owner) return { cls: "owner", perms: owner };

  const acl = node.acl || [];
  const mask = acl.length ? (node.aclMask || recalcAclMask(node)) : null;
  const cap = (p) => (mask ? permsIntersect(p, mask) : p);
  // With an ACL the mode's group digit is the MASK; the owning group's own entry (group::) is kept separately.
  const groupBits = acl.length ? groupObjPerms(node) : group;

  const named = acl.find((e) => e.type === "user" && e.id === name);
  if (named) return { cls: "acl-user", perms: cap(named.perms) };

  const matched = [];
  if (isInGroup(name, node.group)) matched.push(cap(groupBits));
  acl.filter((e) => e.type === "group" && isInGroup(name, e.id)).forEach((e) => matched.push(cap(e.perms)));
  if (matched.length) return { cls: "group", perms: matched.reduce(permsUnion) };

  return { cls: "others", perms: others };
}

export function effectivePerms(node, name) {
  return classify(node, name).perms;
}

/** need: "r" | "w" | "x" */
export function checkAccess(node, name, need) {
  if (name === "root") {
    if (need !== "x") return true;
    if (node.isDir) return true;
    const t = modeTriads(node.octal);
    return [t.owner, t.group, t.others].some((p) => p[2] === "x");
  }
  return effectivePerms(node, name)[{ r: 0, w: 1, x: 2 }[need]] !== "-";
}

/* ------------------------------ path access ------------------------------ */

/** "/a/b/c" -> ["/", "/a", "/a/b"]  (every directory you must pass through) */
export function ancestorDirs(path) {
  const parts = path.split("/").filter(Boolean);
  const out = ["/"];
  let cur = "";
  for (let i = 0; i < parts.length - 1; i += 1) { cur += "/" + parts[i]; out.push(cur); }
  return path === "/" ? [] : out;
}

/** Every ancestor needs x. Returns { ok: true } or { ok: false, at: <dir path> }. */
export function checkTraverse(path, name) {
  for (const p of ancestorDirs(path)) {
    const n = findNode(FS_TREE, p);
    if (n && !checkAccess(n, name, "x")) return { ok: false, at: p };
  }
  return { ok: true };
}

/** Traversal + the node's own r/w/x. */
export function checkPathAccess(path, name, need) {
  const t = checkTraverse(path, name);
  if (!t.ok) return t;
  const node = findNode(FS_TREE, path);
  if (!node) return { ok: false, missing: true };
  return checkAccess(node, name, need) ? { ok: true, node } : { ok: false, at: path, node };
}

/** Can `name` see this path appear in a recursive listing (find/grep/tree)? */
export function isVisibleTo(path, name) {
  return ancestorDirs(path).every((p) => {
    const n = findNode(FS_TREE, p);
    return !n || (checkAccess(n, name, "r") && checkAccess(n, name, "x"));
  });
}

/** Creating an entry at newPath: traverse to it, then w on the parent (x came from traverse). */
export function checkCreate(newPath, name) {
  const t = checkTraverse(newPath, name);
  if (!t.ok) return { ok: false, at: t.at, reason: "denied" };
  const parent = findNode(FS_TREE, parentPath(newPath));
  if (!parent || !parent.isDir) return { ok: false, reason: "no-parent" };
  if (!checkAccess(parent, name, "w")) return { ok: false, at: parent.path, node: parent, reason: "denied" };
  return { ok: true, parent };
}

/** Removing/renaming away an entry: w+x on the parent, plus the sticky-bit rule. */
export function checkDelete(path, node, name) {
  const t = checkTraverse(path, name);
  if (!t.ok) return { ok: false, at: t.at, reason: "denied" };
  const parent = findNode(FS_TREE, parentPath(path));
  if (!parent) return { ok: false, reason: "no-parent" };
  if (!checkAccess(parent, name, "w")) return { ok: false, at: parent.path, node: parent, reason: "denied" };
  if (isSticky(parent) && name !== "root" && name !== node.owner && name !== parent.owner) {
    return { ok: false, at: parent.path, node: parent, reason: "sticky" };
  }
  return { ok: true, parent };
}

/* ----------------------- ownership-changing rules ----------------------- */

export const canChmod = (node, name) => name === "root" || name === node.owner;
/** Only root may give a file away — otherwise users could dodge disk quotas. */
export const canChown = (name) => name === "root";
/** The owner may move a file to a group they themselves belong to. */
export const canChgrp = (node, name, group) => name === "root" || (name === node.owner && (group === node.group || isInGroup(name, group)));

/* ------------------------- special bits (audited against Linux 6.x + GNU chmod) ------------------------- */

/** A setgid directory hands its group to everything created inside it, and its setgid bit to new directories. */
export const isSetgidDir = (parent) => !!(parent && parent.isDir && (Number(String(parent.octal).padStart(4, "0").slice(-4)[0]) & 2));
/** The group a newly created file/dir/symlink gets: the parent's if it is setgid, else the creator's primary group. */
export const newEntryGroup = (parent, userName) => (isSetgidDir(parent) ? parent.group : primaryGroup(userName));

const splitMode = (octal) => { const s = String(octal).padStart(4, "0").slice(-4); return { special: Number(s[0]), rest: s.slice(1) }; };
const joinMode = (special, rest) => (special ? `${special}${rest}` : rest);

/**
 * chown/chgrp on a NON-directory clears setuid, and setgid when the group has execute — even for root and even
 * when the owner/group does not actually change. Directories keep all special bits.
 * @returns {{octal:string, cleared:string[]}}
 */
export function modeAfterChown(octal, isDir) {
  if (isDir) return { octal, cleared: [] };
  const { special, rest } = splitMode(octal);
  let s = special; const cleared = [];
  if (s & 4) { s &= ~4; cleared.push("setuid"); }
  if ((s & 2) && (Number(rest[1]) & 1)) { s &= ~2; cleared.push("setgid"); }
  return cleared.length ? { octal: joinMode(s, rest), cleared } : { octal, cleared };
}

/**
 * The mode chmod really stores. GNU chmod keeps a DIRECTORY's setuid/setgid bits when given a numeric mode
 * (they can be set but not cleared that way; sticky is taken from the argument), and the kernel silently drops
 * setgid when a non-root caller is not in the file's group.
 * @returns {{octal:string, keptDirBits:string[], droppedSetgid:boolean}}
 */
export function modeAfterChmod(requested, node, caller) {
  const { special: want, rest } = splitMode(requested);
  let s = want; const keptDirBits = []; let droppedSetgid = false;
  if (node.isDir) {
    const keep = splitMode(node.octal).special & 6 & ~want;
    if (keep & 4) keptDirBits.push("setuid");
    if (keep & 2) keptDirBits.push("setgid");
    s |= keep;
  }
  if ((s & 2) && caller !== "root" && !isInGroup(caller, node.group)) { s &= ~2; droppedSetgid = true; }
  return { octal: s === want ? requested : joinMode(s, rest), keptDirBits, droppedSetgid };
}

/* ------------------------------ explanations ----------------------------- */

const NEED_WORD = { r: "read", w: "write", x: "execute/search" };

/** One plain-language line saying WHY access was refused. */
export function explainAccess(node, name, need) {
  const { cls, perms } = classify(node, name);
  const who = {
    root: "root bypasses checks",
    owner: `'${name}' owns it, so only the owner bits apply`,
    "acl-user": `a named ACL entry for '${name}' applies (capped by the mask)`,
    group: `'${name}' is in group '${node.group}' (or a named ACL group), so the group bits apply`,
    others: `'${name}' is not the owner and not in group '${node.group}', so the others bits apply`,
  }[cls];
  return `${node.path}: mode ${node.octal}, ${node.owner}:${node.group} — ${who} → ${perms}, which lacks ${NEED_WORD[need]} (${need}).`;
}

export function explainTraverse(dirNode, name) {
  return `'${name}' has no x (search) bit on directory ${dirNode.path} (mode ${dirNode.octal}, ${dirNode.owner}:${dirNode.group}) — nothing beneath a directory is reachable without it.`;
}

/* --------------------------------- umask --------------------------------- */

export const DEFAULT_UMASK = "022";

/** "077" / "0077" -> "077"; anything invalid -> null. */
export function parseUmask(str) {
  return /^[0-7]{3,4}$/.test(String(str)) ? String(str).slice(-3) : null;
}

/** base & ~umask, digit by digit. */
export function modeAfterUmask(base, umask) {
  return [0, 1, 2].map((i) => (Number(base[i]) & ~Number(umask[i])) & 7).join("");
}
export const newFileMode = (umask) => modeAfterUmask("666", umask);
export const newDirMode = (umask) => modeAfterUmask("777", umask);

/** cp (without -p): source permission bits masked by umask, special bits dropped. */
export function copiedMode(srcOctal, umask) {
  return modeAfterUmask(String(srcOctal).padStart(3, "0").slice(-3), umask);
}

/** umask -S : the permissions that remain, e.g. u=rwx,g=rx,o=rx */
export function umaskSymbolic(umask) {
  const t = (d) => digitTriad(7 & ~d).replace(/-/g, "");
  return `u=${t(+umask[0])},g=${t(+umask[1])},o=${t(+umask[2])}`;
}
