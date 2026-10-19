/**
 * terminal-commands-perm.js
 * Permission and ownership commands (split out of terminal.js in v2.9):
 * chmod, chown, chgrp, getfacl, setfacl, umask.
 */
import { octalToState, stateToSymbolic, triadToSymbol } from "./converter.js";
import { permsIntersect, recalcAclMask } from "./engine/acl.js";
import { resolveWriteTarget } from "./engine/fs-model.js";
import {
  USERS, GROUP_IDS, getUser, groupExists, canChmod, canChown, canChgrp,
  parseUmask, newFileMode, newDirMode, umaskSymbolic,
} from "./engine/users.js";
import { escapeHTML } from "./engine/safe-html.js";
import { session, me } from "./terminal-state.js";
import { printLine, deny, withTargetNode } from "./terminal-helpers.js";

export function handleChmod(args, container) {
  if (args.length < 2 || !/^[0-7]{3,4}$/.test(args[0])) {
    printLine('<span class="t-err">usage: chmod &lt;mode&gt; &lt;file&gt;   e.g. chmod 755 script.sh</span>', container);
    return;
  }
  const [mode, filename] = args;
  withTargetNode([filename], container, "chmod", (node) => {
    const { target, followedSymlink, dangling } = resolveWriteTarget(node);
    if (dangling) { printLine(`<span class="t-err">chmod: cannot operate on dangling symlink '${escapeHTML(filename)}'</span>`, container); return; }
    if (!canChmod(target, me())) { deny(`chmod: changing permissions of '${filename}': Operation not permitted`, `only the file's owner (${target.owner}) or root may change its mode — '${me()}' is neither. Group or write access doesn't help here.`, container); return; }
    target.octal = mode;
    if (target.acl && target.acl.length) recalcAclMask(target);
    const state = octalToState(mode, target.isDir);
    if (followedSymlink) {
      printLine(`<span class="t-dim">'${escapeHTML(filename)}' is a symlink — chmod follows it and changes its target instead.</span>\n<span class="t-ok">mode of '${escapeHTML(target.path)}' changed to ${mode} (${stateToSymbolic(state)})</span>`, container);
      return;
    }
    printLine(`<span class="t-ok">mode of '${escapeHTML(filename)}' changed to ${mode} (${stateToSymbolic(state)}${target.acl && target.acl.length ? "+" : ""})</span>${target.acl && target.acl.length ? `\n<span class="t-dim">This file has ACL entries, so its mask was recalculated to ${target.aclMask} — check getfacl, the group digit alone no longer tells the whole story.</span>` : ""}`, container);
  });
}

export function handleChown(args, container) {
  if (args.length < 2) { printLine('<span class="t-err">usage: chown &lt;user&gt; &lt;file&gt;</span>', container); return; }
  const [owner, filename] = args;
  withTargetNode([filename], container, "chown", (node) => {
    const { target, followedSymlink, dangling } = resolveWriteTarget(node);
    if (dangling) { printLine(`<span class="t-err">chown: cannot operate on dangling symlink '${escapeHTML(filename)}'</span>`, container); return; }
    if (!getUser(owner)) { printLine(`<span class="t-err">chown: invalid user: '${escapeHTML(owner)}'</span>\n<span class="t-dim">known users: ${Object.keys(USERS).join(", ")}</span>`, container); return; }
    if (!canChown(me())) { deny(`chown: changing ownership of '${filename}': Operation not permitted`, `only root may change a file's owner — even the current owner can't give a file away. Try: sudo chown ${owner} ${filename}`, container); return; }
    target.owner = owner;
    if (followedSymlink) {
      printLine(`<span class="t-dim">'${escapeHTML(filename)}' is a symlink — chown follows it by default (use lchown to target the link itself, not supported here).</span>\n<span class="t-ok">owner of '${escapeHTML(target.path)}' changed to ${escapeHTML(owner)}</span>`, container);
      return;
    }
    printLine(`<span class="t-ok">owner of '${escapeHTML(filename)}' changed to ${escapeHTML(owner)}</span>`, container);
  });
}

export function handleChgrp(args, container) {
  if (args.length < 2) { printLine('<span class="t-err">usage: chgrp &lt;group&gt; &lt;file&gt;</span>', container); return; }
  const [group, filename] = args;
  withTargetNode([filename], container, "chgrp", (node) => {
    const { target, followedSymlink, dangling } = resolveWriteTarget(node);
    if (dangling) { printLine(`<span class="t-err">chgrp: cannot operate on dangling symlink '${escapeHTML(filename)}'</span>`, container); return; }
    if (!groupExists(group)) { printLine(`<span class="t-err">chgrp: invalid group: '${escapeHTML(group)}'</span>\n<span class="t-dim">known groups: ${Object.keys(GROUP_IDS).join(", ")}</span>`, container); return; }
    if (!canChgrp(target, me(), group)) { deny(`chgrp: changing group of '${filename}': Operation not permitted`, `non-root users may only change the group of files they OWN, and only to a group they belong to. '${me()}' is in: ${(getUser(me())?.groups || []).join(", ")}; the file's owner is ${target.owner}.`, container); return; }
    target.group = group;
    if (followedSymlink) {
      printLine(`<span class="t-dim">'${escapeHTML(filename)}' is a symlink — chgrp follows it by default, same as chown.</span>\n<span class="t-ok">group of '${escapeHTML(target.path)}' changed to ${escapeHTML(group)}</span>`, container);
      return;
    }
    printLine(`<span class="t-ok">group of '${escapeHTML(filename)}' changed to ${escapeHTML(group)}</span>`, container);
  });
}

export function handleGetfacl(args, container) {
  withTargetNode(args, container, "getfacl", (node, path) => {
    const state = octalToState(node.octal, node.isDir);
    const acl = node.acl || [];
    const hasExt = acl.length > 0;
    const mask = hasExt ? (node.aclMask || triadToSymbol(state.group)) : null;
    const withEffective = (perms) => (mask && permsIntersect(perms, mask) !== perms ? `${perms}\t#effective:${permsIntersect(perms, mask)}` : perms);

    const lines = [
      `# file: ${path.replace(/^\//, "")}`,
      `# owner: ${node.owner}`,
      `# group: ${node.group}`,
      `user::${triadToSymbol(state.owner)}`,
    ];
    acl.filter((e) => e.type === "user").forEach((e) => lines.push(`user:${e.id}:${withEffective(e.perms)}`));
    lines.push(`group::${withEffective(triadToSymbol(state.group))}`);
    acl.filter((e) => e.type === "group").forEach((e) => lines.push(`group:${e.id}:${withEffective(e.perms)}`));
    if (hasExt) lines.push(`mask::${mask}`);
    lines.push(`other::${triadToSymbol(state.others)}`);
    printLine(`<span class="t-dim">${lines.join("\n")}</span>${node.isSymlink ? '\n<span class="t-dim">(a symlink has no ACL of its own — this reflects the link\'s cosmetic 777, not its target)</span>' : ""}`, container);
  });
}

export function handleSetfacl(args, container) {
  const [flag, spec, filename] = args;
  if ((flag !== "-m" && flag !== "-x") || !spec || !filename) {
    printLine('<span class="t-err">usage: setfacl -m u:name:rwx &lt;file&gt;   (add/update)\nsetfacl -x u:name &lt;file&gt;       (remove)\nqualifier can be u/user or g/group</span>', container);
    return;
  }
  withTargetNode([filename], container, "setfacl", (node) => {
    if (!canChmod(node, me())) { deny(`setfacl: ${filename}: Operation not permitted`, `only the owner (${node.owner}) or root may change a file's ACL.`, container); return; }
    if (node.isSymlink) { printLine(`<span class="t-err">setfacl: '${escapeHTML(filename)}' is a symlink — setfacl always operates on the real file, apply it to the target</span>`, container); return; }
    const parts = spec.split(":");
    const kindRaw = parts[0];
    const type = kindRaw === "u" || kindRaw === "user" ? "user" : kindRaw === "g" || kindRaw === "group" ? "group" : null;
    const id = parts[1];
    if (!type || !id) { printLine(`<span class="t-err">setfacl: bad qualifier '${escapeHTML(spec)}' — use u:name:perms or g:name:perms</span>`, container); return; }
    node.acl = node.acl || [];

    if (flag === "-m") {
      const perms = (parts[2] || "").toLowerCase();
      if (!/^[r-][w-][x-]$/.test(perms)) { printLine(`<span class="t-err">setfacl: invalid permission string '${escapeHTML(parts[2] || "")}' — expected 3 chars like rwx, rw-, r--</span>`, container); return; }
      const existing = node.acl.find((e) => e.type === type && e.id === id);
      if (existing) existing.perms = perms; else node.acl.push({ type, id, perms });
      recalcAclMask(node);
      printLine(`<span class="t-ok">${type}:${escapeHTML(id)}:${perms} applied to '${escapeHTML(filename)}'</span>\n<span class="t-dim">mask recalculated to ${node.aclMask} — every named entry's real access is capped by this mask, not by the number you just set. Run getfacl to see the effective bits.</span>`, container);
    } else {
      const before = node.acl.length;
      node.acl = node.acl.filter((e) => !(e.type === type && e.id === id));
      if (node.acl.length === before) { printLine(`<span class="t-dim">setfacl: no matching entry ${type}:${escapeHTML(id)} on '${escapeHTML(filename)}'</span>`, container); return; }
      recalcAclMask(node);
      printLine(`<span class="t-ok">removed ${type}:${escapeHTML(id)} from '${escapeHTML(filename)}'</span>`, container);
    }
  });
}

export function handleUmask(args, container) {
  if (!args.length) { printLine(`0${session.umask}`, container); return; }
  if (args[0] === "-S") { printLine(umaskSymbolic(session.umask), container); return; }
  const parsed = parseUmask(args[0]);
  if (!parsed) { printLine(`<span class="t-err">umask: ${escapeHTML(args[0])}: invalid octal number</span>`, container); return; }
  session.umask = parsed;
  printLine(`<span class="t-ok">umask set to 0${parsed}</span>\n<span class="t-dim">new files will get ${newFileMode(parsed)} (666 &amp; ~${parsed}), new directories ${newDirMode(parsed)} (777 &amp; ~${parsed}). Files never get x by default — that's why the base for files is 666, not 777. Existing files are untouched.</span>`, container);
}
