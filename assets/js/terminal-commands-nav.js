/**
 * terminal-commands-nav.js
 * Navigation and file commands (split out of terminal.js in v2.9): ls, cd,
 * cat, tree, stat, find (by name and by permission bits), grep, touch,
 * mkdir, rm, mv, cp, ln -s, the simulated editor notice.
 */
import { FS_TREE, findNode, parentPath, resolveSymlink } from "./filesystem.js";
import { octalToState, stateToSymbolic } from "./converter.js";
import {
  primaryGroup, checkAccess, checkTraverse, checkPathAccess, checkCreate, checkDelete,
  explainAccess, newFileMode, newDirMode, copiedMode,
} from "./engine/users.js";
import { linkLocation, placeSymlink, baseName } from "./engine/links.js";
import { escapeHTML } from "./engine/safe-html.js";
import { cwd, session, me, setCwd } from "./terminal-state.js";
import {
  printLine, nameOk, resolveArg, deny, whyFailed, visibleNodes, blockedLines, withTargetNode, denyDelete, explainCreateDenied,
} from "./terminal-helpers.js";

export function handleLs(args, container) {
  const flags = args.filter((a) => a.startsWith("-")).join("");
  const target = args.find((a) => !a.startsWith("-"));
  const path = target ? resolveArg(target) : cwd;
  const node = findNode(FS_TREE, path);
  if (!node || !node.isDir) { printLine(`<span class="t-err">ls: cannot access '${escapeHTML(target || ".")}': not a directory</span>`, container); return; }
  const lsAccess = checkPathAccess(path, me(), "r");
  if (!lsAccess.ok) { deny(`ls: cannot open directory '${target || "."}': Permission denied`, whyFailed(lsAccess, path, "r"), container); return; }
  const children = node.children || [];
  if (!children.length) { printLine('<span class="t-dim">(empty)</span>', container); return; }

  const showAll = flags.includes("a");
  const visible = showAll ? children : children.filter((c) => !c.name.startsWith("."));

  if (flags.includes("l")) {
    const rows = visible.map((c) => {
      const state = octalToState(c.octal, c.isDir);
      const sym = (c.isSymlink ? "lrwxrwxrwx" : stateToSymbolic(state)) + (c.acl && c.acl.length ? "+" : "");
      const name = c.isDir
        ? `<span class="t-path">${escapeHTML(c.name)}/</span>`
        : c.isSymlink
        ? `<span class="t-path">${escapeHTML(c.name)}</span> -&gt; ${escapeHTML(c.target)}`
        : escapeHTML(c.name);
      return `${sym}  ${String(c.owner).padEnd(9)} ${String(c.group).padEnd(9)} ${name}`;
    });
    printLine(rows.join("\n"), container);
  } else {
    printLine(visible.map((c) => (c.isDir ? `<span class="t-path">${escapeHTML(c.name)}/</span>` : c.isSymlink ? `<span class="t-path">${escapeHTML(c.name)}</span>` : escapeHTML(c.name))).join("   "), container);
  }
}

export function handleCd(args, container) {
  const target = args[0];
  const newPath = resolveArg(target);
  const node = findNode(FS_TREE, newPath);
  if (!node || !node.isDir) {
    printLine(`<span class="t-err">cd: no such directory: ${escapeHTML(target || "~")}</span>`, container);
    return;
  }
  const cdAccess = checkPathAccess(newPath, me(), "x");
  if (!cdAccess.ok) { deny(`cd: ${target || "~"}: Permission denied`, whyFailed(cdAccess, newPath, "x"), container); return; }
  setCwd(newPath);
}

export function handleCat(args, container) {
  if (!args[0]) { printLine('<span class="t-err">cat: missing filename</span>', container); return; }
  const node = findNode(FS_TREE, resolveArg(args[0]));
  if (!node || node.isDir) { printLine(`<span class="t-err">cat: ${escapeHTML(args[0])}: no such file</span>`, container); return; }
  const linkPath = resolveArg(args[0]);
  const viaTraverse = checkTraverse(linkPath, me());
  if (!viaTraverse.ok) { deny(`cat: ${args[0]}: Permission denied`, whyFailed(viaTraverse, linkPath, "x"), container); return; }
  if (node.isSymlink) {
    const target = resolveSymlink(node);
    if (!target) { printLine(`<span class="t-err">cat: ${escapeHTML(args[0])}: broken symbolic link to '${escapeHTML(node.target)}'</span>`, container); return; }
    const viaLink = checkPathAccess(target.path, me(), "r");
    if (!viaLink.ok) { deny(`cat: ${args[0]}: Permission denied`, `a symlink never grants access of its own — the kernel checks the TARGET. ${whyFailed(viaLink, target.path, "r")}`, container); return; }
    printLine(`<span class="t-dim">[follows ${escapeHTML(node.path)} -&gt; ${escapeHTML(target.path)}]</span>\n${target.note || `<span class="t-dim">(no description available for this simulated file)</span>`}`, container);
    return;
  }
  const catAccess = checkPathAccess(node.path, me(), "r");
  if (!catAccess.ok) { deny(`cat: ${args[0]}: Permission denied`, whyFailed(catAccess, node.path, "r"), container); return; }
  printLine(node.note || `<span class="t-dim">(no description available for this simulated file)</span>`, container);
}

export function handleTree(args, container) {
  const start = args[0] ? findNode(FS_TREE, resolveArg(args[0])) : findNode(FS_TREE, cwd);
  if (!start || !start.isDir) { printLine('<span class="t-err">tree: not a directory</span>', container); return; }
  const canOpen = (n) => checkAccess(n, me(), "r") && checkAccess(n, me(), "x");
  const startCheck = checkTraverse(start.path, me());
  const lines = [escapeHTML(start.path)];
  if (!startCheck.ok || !canOpen(start)) { lines.push('<span class="t-err">[error opening dir]</span>'); printLine(lines.join("\n"), container); return; }
  const walk = (node, prefix) => {
    const kids = node.children || [];
    kids.forEach((kid, i) => {
      const last = i === kids.length - 1;
      const label = kid.isDir
        ? `<span class="t-path">${escapeHTML(kid.name)}/</span>`
        : kid.isSymlink
        ? `<span class="t-path">${escapeHTML(kid.name)}</span> -&gt; ${escapeHTML(kid.target)}`
        : escapeHTML(kid.name);
      const blockedDir = kid.isDir && !canOpen(kid);
      lines.push(`${prefix}${last ? "└── " : "├── "}${label}${blockedDir ? ' <span class="t-err">[error opening dir]</span>' : ""}`);
      if (kid.isDir && !blockedDir) walk(kid, prefix + (last ? "    " : "│   "));
    });
  };
  walk(start, "");
  printLine(lines.join("\n"), container);
}

export function handleStat(args, container) {
  if (!args[0]) { printLine('<span class="t-err">stat: missing filename</span>', container); return; }
  const path = resolveArg(args[0]);
  const node = findNode(FS_TREE, path);
  if (!node) { printLine(`<span class="t-err">stat: cannot stat '${escapeHTML(args[0])}': no such file or directory</span>`, container); return; }
  const statTraverse = checkTraverse(path, me());
  if (!statTraverse.ok) { deny(`stat: cannot statx '${args[0]}': Permission denied`, whyFailed(statTraverse, path, "x"), container); return; }
  const state = octalToState(node.octal, node.isDir);
  const sym = (node.isSymlink ? "lrwxrwxrwx" : stateToSymbolic(state)) + (node.acl && node.acl.length ? "+" : "");
  printLine([
    `  File: ${escapeHTML(node.path)}${node.isDir ? "/" : ""}${node.isSymlink ? ` -&gt; ${escapeHTML(node.target)}` : ""}`,
    `  Type: ${node.isSymlink ? "symbolic link" : node.isDir ? "directory" : "regular file"}`,
    `Access: (${node.isSymlink ? "0777" : node.octal.padStart(4, "0")}/${sym})  Uid: (${node.owner})   Gid: (${node.group})`,
    node.isSymlink ? '<span class="t-dim">A symlink\'s own mode is always 0777 and is never checked by the kernel — access is enforced entirely by the permissions on the target above.</span>' : "",
    node.acl && node.acl.length ? '<span class="t-dim">The trailing + means this file has extended ACL entries beyond owner/group/others — run getfacl to see them.</span>' : "",
    node.sensitive ? '<span class="t-amber">Flagged sensitive — check the Security Analyzer in the Simulator for details.</span>' : "",
  ].filter(Boolean).join("\n"), container);
}

export function handleFind(args, container) {
  const permIdx = args.indexOf("-perm");
  if (permIdx !== -1) { handleFindPerm(args, permIdx, container); return; }
  const nameIdx = args.indexOf("-name");
  if (nameIdx !== -1) { handleFindName(args, nameIdx, container); return; }
  // Bare `find <name>` — a shorthand kept for backward compatibility; real
  // find has no such form (a bare word is a PATH, not a pattern), so
  // `-name` above is the one that matches actual find syntax.
  const term = args[0];
  if (!term) { printLine('<span class="t-err">usage: find [path] -name &lt;pattern&gt;   or   find &lt;name&gt;</span>', container); return; }
  const { nodes, blocked } = visibleNodes();
  const matches = nodes.filter((n) => n.name.toLowerCase().includes(term.toLowerCase()));
  const errs = blockedLines("find", blocked);
  if (!matches.length) { printLine(`<span class="t-dim">find: no files matching '${escapeHTML(term)}'</span>${errs ? "\n" + errs : ""}`, container); return; }
  printLine(matches.map((n) => escapeHTML(n.path + (n.isDir ? "/" : ""))).join("\n") + (errs ? "\n" + errs : ""), container);
}

/** `find [path] -name <pattern> [-type f|d]` — the real find syntax, with the same path-scoping and -type narrowing -perm already supports. */
function handleFindName(args, nameIdx, container) {
  const pathArg = nameIdx === 0 ? null : args[0];
  const pattern = args[nameIdx + 1];
  if (!pattern) { printLine('<span class="t-err">usage: find [path] -name &lt;pattern&gt;</span>', container); return; }
  const typeIdx = args.indexOf("-type");
  const onlyType = typeIdx !== -1 ? args[typeIdx + 1] : null;
  const startPath = pathArg ? resolveArg(pathArg) : "/";
  if (!findNode(FS_TREE, startPath)) { printLine(`<span class="t-err">find: '${escapeHTML(pathArg)}': No such file or directory</span>`, container); return; }
  const prefix = startPath === "/" ? "/" : startPath + "/";
  const inScope = (p) => p === startPath || p.startsWith(prefix);
  const { nodes, blocked } = visibleNodes();
  const needle = pattern.toLowerCase();
  const matches = nodes.filter((n) => {
    if (!inScope(n.path)) return false;
    if (onlyType === "f" && n.isDir) return false;
    if (onlyType === "d" && !n.isDir) return false;
    return n.name.toLowerCase().includes(needle);
  });
  const errs = blockedLines("find", blocked.filter((b) => inScope(b.path)));
  if (!matches.length) { printLine(`<span class="t-dim">find: no matches under ${escapeHTML(startPath)}</span>${errs ? "\n" + errs : ""}`, container); return; }
  printLine(matches.map((n) => escapeHTML(n.path + (n.isDir ? "/" : ""))).join("\n") + (errs ? "\n" + errs : ""), container);
}

export function parsePermArg(raw) {
  if (!raw) return null;
  let type = "exact", rest = raw;
  if (raw[0] === "-") { type = "all"; rest = raw.slice(1); }
  else if (raw[0] === "/") { type = "any"; rest = raw.slice(1); }
  if (!/^[0-7]{1,4}$/.test(rest)) return null;
  return { type, value: parseInt(rest, 8) };
}

export function handleFindPerm(args, permIdx, container) {
  const pathArg = permIdx === 0 ? null : args[0];
  const parsed = parsePermArg(args[permIdx + 1]);
  if (!parsed) { printLine('<span class="t-err">usage: find [path] -perm -4000   (also /6000 for \'any of\', or an exact 4-digit mode)</span>', container); return; }
  const typeIdx = args.indexOf("-type");
  const onlyType = typeIdx !== -1 ? args[typeIdx + 1] : null;
  const startPath = pathArg ? resolveArg(pathArg) : "/";
  if (!findNode(FS_TREE, startPath)) { printLine(`<span class="t-err">find: '${escapeHTML(pathArg)}': No such file or directory</span>`, container); return; }
  const prefix = startPath === "/" ? "/" : startPath + "/";
  const inScope = (p) => p === startPath || p.startsWith(prefix);
  const { nodes, blocked } = visibleNodes();
  const modeOf = (n) => parseInt(String(n.octal).padStart(4, "0").slice(-4), 8);
  const matches = nodes.filter((n) => {
    if (!inScope(n.path)) return false;
    if (onlyType === "f" && n.isDir) return false;
    if (onlyType === "d" && !n.isDir) return false;
    const m = modeOf(n);
    if (parsed.type === "all") return (m & parsed.value) === parsed.value;
    if (parsed.type === "any") return (m & parsed.value) !== 0;
    return m === parsed.value;
  });
  const errs = blockedLines("find", blocked.filter((b) => inScope(b.path)));
  if (!matches.length) { printLine(`<span class="t-dim">find: no matches under ${escapeHTML(startPath)}</span>${errs ? "\n" + errs : ""}`, container); return; }
  const rows = matches.map((n) => `${String(n.octal).padStart(4, "0").slice(-4)}  ${escapeHTML(n.path)}${n.isDir ? "/" : ""}`);
  printLine(rows.join("\n") + (errs ? "\n" + errs : ""), container);
}

export function handleGrep(args, container) {
  const term = args[0];
  if (!term) { printLine('<span class="t-err">usage: grep &lt;keyword&gt;</span>', container); return; }
  const { nodes, blocked } = visibleNodes();
  const matches = nodes.filter((n) => (n.note || "").toLowerCase().includes(term.toLowerCase()));
  const errs = blockedLines("grep", blocked);
  if (!matches.length) { printLine(`<span class="t-dim">grep: no descriptions mention '${escapeHTML(term)}'</span>${errs ? "\n" + errs : ""}`, container); return; }
  printLine(matches.map((n) => `<span class="t-path">${escapeHTML(n.path)}</span>: ${n.note}`).join("\n") + (errs ? "\n" + errs : ""), container);
}

export function handleTouch(args, container) {
  if (!args[0]) { printLine('<span class="t-err">touch: missing filename</span>', container); return; }
  const path = resolveArg(args[0]);
  const existing = findNode(FS_TREE, path);
  if (existing) {
    const touchTrav = checkTraverse(path, me());
    if (!touchTrav.ok) { deny(`touch: cannot touch '${args[0]}': Permission denied`, whyFailed(touchTrav, path, "x"), container); return; }
    if (me() !== existing.owner && !checkAccess(existing, me(), "w")) { deny(`touch: cannot touch '${args[0]}': Permission denied`, explainAccess(existing, me(), "w"), container); return; }
    printLine(`<span class="t-dim">touch: '${escapeHTML(args[0])}' already exists (timestamp simulated as updated)</span>`, container);
    return;
  }
  const parent = findNode(FS_TREE, parentPath(path));
  if (!parent || !parent.isDir) { printLine(`<span class="t-err">touch: cannot create '${escapeHTML(args[0])}': no such directory</span>`, container); return; }
  if (!nameOk("touch", path, container)) return;
  const mayCreate = checkCreate(path, me());
  if (!mayCreate.ok) { deny(`touch: cannot touch '${args[0]}': Permission denied`, explainCreateDenied(mayCreate), container); return; }
  const name = path.split("/").pop();
  const mode = newFileMode(session.umask);
  parent.children = parent.children || [];
  parent.children.push({ name, path, isDir: false, octal: mode, owner: me(), group: primaryGroup(me()), sensitive: false, note: "A new empty file created in this simulation.", acl: [] });
  printLine(`<span class="t-ok">created ${escapeHTML(path)}</span>\n<span class="t-dim">mode ${mode} = 666 &amp; ~${session.umask} (umask), owner ${me()}:${primaryGroup(me())} — change the umask and create another file to see the difference.</span>`, container);
}

export function handleMkdir(args, container) {
  if (!args[0]) { printLine('<span class="t-err">mkdir: missing directory name</span>', container); return; }
  const path = resolveArg(args[0]);
  if (findNode(FS_TREE, path)) { printLine(`<span class="t-err">mkdir: cannot create directory '${escapeHTML(args[0])}': already exists</span>`, container); return; }
  const parent = findNode(FS_TREE, parentPath(path));
  if (!parent || !parent.isDir) { printLine(`<span class="t-err">mkdir: cannot create directory '${escapeHTML(args[0])}': no such parent directory</span>`, container); return; }
  if (!nameOk("mkdir", path, container)) return;
  const mayMake = checkCreate(path, me());
  if (!mayMake.ok) { deny(`mkdir: cannot create directory '${args[0]}': Permission denied`, explainCreateDenied(mayMake), container); return; }
  const name = path.split("/").pop();
  const mode = newDirMode(session.umask);
  parent.children = parent.children || [];
  parent.children.push({ name, path, isDir: true, octal: mode, owner: me(), group: primaryGroup(me()), sensitive: false, note: "", children: [] });
  printLine(`<span class="t-ok">directory created: ${escapeHTML(path)}</span>\n<span class="t-dim">mode ${mode} = 777 &amp; ~${session.umask} (umask), owner ${me()}:${primaryGroup(me())}</span>`, container);
}

export function handleRm(args, container) {
  withTargetNode(args, container, "rm", (node, path) => {
    const del = checkDelete(path, node, me());
    if (!del.ok) { denyDelete("rm", `cannot remove '${args[0]}'`, del, container); return; }
    const parent = del.parent;
    parent.children = parent.children.filter((c) => c !== node);
    printLine(`<span class="t-ok">removed ${escapeHTML(path)}</span>`, container);
  });
}

export function handleMove(args, container) {
  if (args.length < 2) { printLine('<span class="t-err">usage: mv &lt;source&gt; &lt;destination&gt;</span>', container); return; }
  withTargetNode([args[0]], container, "mv", (node, srcPath) => {
    const destPath = resolveArg(args[1]);
    const oldParent = findNode(FS_TREE, parentPath(srcPath));
    const destParent = findNode(FS_TREE, destPath)?.isDir ? findNode(FS_TREE, destPath) : findNode(FS_TREE, parentPath(destPath));
    if (!destParent || !destParent.isDir) { printLine('<span class="t-err">mv: destination directory does not exist</span>', container); return; }
    const mvOut = checkDelete(srcPath, node, me());
    if (!mvOut.ok) { denyDelete("mv", `cannot move '${args[0]}'`, mvOut, container); return; }
    const mvFinal = findNode(FS_TREE, destPath)?.isDir ? (destPath === "/" ? "" : destPath) + "/" + node.name : destPath;
    if (!nameOk("mv", mvFinal, container)) return;
    const mvIn = checkCreate(mvFinal, me());
    if (!mvIn.ok) { deny(`mv: cannot move '${args[0]}' to '${args[1]}': Permission denied`, explainCreateDenied(mvIn), container); return; }
    oldParent.children = oldParent.children.filter((c) => c !== node);
    const newName = findNode(FS_TREE, destPath)?.isDir ? node.name : destPath.split("/").pop();
    node.name = newName;
    destParent.children = destParent.children || [];
    destParent.children.push(node);
    reassignSubtreePaths(node, destParent.path);
    printLine(`<span class="t-ok">moved to ${escapeHTML(node.path)}</span>`, container);
  });
}

export function handleCopy(args, container) {
  if (args.length < 2) { printLine('<span class="t-err">usage: cp &lt;source&gt; &lt;destination&gt;</span>', container); return; }
  withTargetNode([args[0]], container, "cp", (node) => {
    const destPath = resolveArg(args[1]);
    const destParent = findNode(FS_TREE, destPath)?.isDir ? findNode(FS_TREE, destPath) : findNode(FS_TREE, parentPath(destPath));
    if (!destParent || !destParent.isDir) { printLine('<span class="t-err">cp: destination directory does not exist</span>', container); return; }
    const cpSrc = checkPathAccess(node.isSymlink ? (resolveSymlink(node) || node).path : node.path, me(), "r");
    if (!cpSrc.ok) { deny(`cp: cannot open '${args[0]}' for reading: Permission denied`, whyFailed(cpSrc, node.path, "r"), container); return; }
    const newName = findNode(FS_TREE, destPath)?.isDir ? node.name : destPath.split("/").pop();
    const cpFinal = (destParent.path === "/" ? "" : destParent.path) + "/" + newName;
    if (!nameOk("cp", cpFinal, container)) return;
    const cpIn = checkCreate(cpFinal, me());
    if (!cpIn.ok) { deny(`cp: cannot create '${args[1]}': Permission denied`, explainCreateDenied(cpIn), container); return; }
    const clone = JSON.parse(JSON.stringify(node));
    clone.name = newName;
    clone.owner = me();
    clone.group = primaryGroup(me());
    clone.octal = copiedMode(node.octal, session.umask);
    destParent.children = destParent.children || [];
    destParent.children.push(clone);
    reassignSubtreePaths(clone, destParent.path);
    printLine(`<span class="t-ok">copied to ${escapeHTML(clone.path)}</span>\n<span class="t-dim">the copy belongs to ${me()}:${primaryGroup(me())} (not the original owner) and its mode is ${clone.octal} = source ${node.octal} &amp; ~${session.umask}.</span>`, container);
  });
}

export function reassignSubtreePaths(node, parentPathValue) {
  node.path = parentPathValue === "/" ? "/" + node.name : parentPathValue + "/" + node.name;
  if (node.children) node.children.forEach((c) => reassignSubtreePaths(c, node.path));
}

export function handleEditor(name, args, container) {
  if (!args[0]) { printLine(`<span class="t-err">${name}: missing filename</span>`, container); return; }
  const node = findNode(FS_TREE, resolveArg(args[0]));
  if (!node) { printLine(`<span class="t-err">${name}: '${escapeHTML(args[0])}' does not exist</span>`, container); return; }
  printLine(`<span class="t-dim">[simulated] ${name} would open '${escapeHTML(node.path)}' here — this lab doesn't include a real text editor, since editing file contents isn't the point. Use chmod/chown/chgrp on it instead.</span>`, container);
}

export function handleLn(args, container) {
  const flags = args.filter((a) => a.startsWith("-") && a.length > 1).join("").replace(/-/g, "");
  const pos = args.filter((a) => !(a.startsWith("-") && a.length > 1));
  if (/[^sf]/.test(flags)) { printLine(`<span class="t-err">ln: unsupported option — this simulation supports -s and -f</span>`, container); return; }
  if (!flags.includes("s")) { printLine('<span class="t-err">ln: hard links aren\'t simulated here — use ln -s &lt;target&gt; [link]</span>\n<span class="t-dim">(a hard link is a second name for the same inode, so it shares ONE set of permissions; a symlink is its own tiny file that merely points at a path)</span>', container); return; }
  if (!pos.length || pos.length > 2) { printLine('<span class="t-err">usage: ln -s &lt;target&gt; [link_name]</span>', container); return; }
  const target = pos[0];
  const destArg = pos[1] || baseName(target) || ".";
  const linkPath = linkLocation(resolveArg(destArg), target);
  if (!linkPath) { printLine(`<span class="t-err">ln: cannot derive a link name from '${escapeHTML(target)}'</span>`, container); return; }
  const may = checkCreate(linkPath, me());
  if (!may.ok) {
    if (may.reason === "no-parent") { printLine(`<span class="t-err">ln: failed to create symbolic link '${escapeHTML(destArg)}': No such file or directory</span>`, container); return; }
    deny(`ln: failed to create symbolic link '${destArg}': Permission denied`, explainCreateDenied(may), container);
    return;
  }
  if (!nameOk("ln", linkPath, container)) return;
  const res = placeSymlink(linkPath, target, me(), { force: flags.includes("f") });
  if (!res.ok) {
    const msg = res.error === "exists" ? "File exists (use -f to replace it)" : res.error === "is-dir" ? "cannot overwrite directory" : "No such file or directory";
    printLine(`<span class="t-err">ln: failed to create symbolic link '${escapeHTML(destArg)}': ${msg}</span>`, container);
    return;
  }
  const notes = ["a symlink's own mode is always 777 — what you can actually do through it is decided by the target's permissions."];
  if (res.dangling) notes.push("the target doesn't exist (yet) — that's legal, the link is just dangling until something appears at that path.");
  if (!target.startsWith("/")) notes.push(`'${target}' is a relative target: it resolves from the LINK's directory (${parentPath(linkPath)}), not from where you ran ln.`);
  printLine(`<span class="t-ok">created ${escapeHTML(linkPath)} -&gt; ${escapeHTML(target)}</span>${res.replaced ? ' <span class="t-dim">(replaced existing)</span>' : ""}\n<span class="t-dim">${notes.map((n) => escapeHTML(n)).join("\n")}</span>`, container);
}
