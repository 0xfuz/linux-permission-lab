/**
 * terminal.js
 * Module 3 — Terminal Simulator (expanded in v2.1).
 * A fully fake terminal: a fixed set of recognized commands operate against
 * the same in-memory filesystem tree used by the Filesystem module. Nothing
 * here executes real shell commands or touches a real disk.
 */

import { el, qs } from "./utils.js";
import { FS_TREE, findNode, resolvePath, parentPath, flattenTree } from "./filesystem.js";
import { octalToState, stateToSymbolic } from "./converter.js";

const HOSTNAME = "learner@permission-lab";
let cwd = "/home/user";
let history = [];
let historyIndex = -1;

function printLine(body, container) {
  container.append(el("div", { class: "terminal-line", html: body }));
}

function promptHTML() {
  return `<span class="t-prompt">${HOSTNAME}</span>:<span class="t-path">${cwd}</span>$`;
}

const HELP_TEXT = `Available commands:
  help                     show this message
  clear                    clear the terminal
  pwd                      print working directory
  whoami / id / groups     print current user identity
  ls, ls -l, ls -la        list directory contents
  cd &lt;dir&gt;                 change directory
  cat &lt;file&gt;               show a file's description
  tree                     show the directory tree from here down
  stat &lt;file&gt;              show detailed permission info for a file
  find &lt;name&gt;              search the whole filesystem by name
  grep &lt;term&gt;              search file descriptions for a keyword
  touch &lt;file&gt;             create an empty file (simulated)
  mkdir &lt;dir&gt;              create a directory (simulated)
  rm &lt;file&gt;                remove a file (simulated)
  mv &lt;src&gt; &lt;dest&gt;          rename/move a file (simulated)
  cp &lt;src&gt; &lt;dest&gt;          copy a file (simulated)
  nano / vim &lt;file&gt;        open the simulated editor notice
  chmod &lt;mode&gt; &lt;file&gt;      change a file's permissions
  chown &lt;user&gt; &lt;file&gt;      change a file's owner
  chgrp &lt;group&gt; &lt;file&gt;     change a file's group
  history                 show command history
This is a simulation — no real shell commands are executed and nothing here touches a real filesystem.`;

function runCommand(raw, container) {
  const trimmed = raw.trim();
  if (trimmed) { history.push(trimmed); historyIndex = history.length; }
  printLine(`${promptHTML()} ${escapeHTML(trimmed)}`, container);
  if (!trimmed) return;

  const [cmd, ...args] = trimmed.split(/\s+/);

  const handlers = {
    help: () => printLine(`<span class="t-dim">${HELP_TEXT}</span>`, container),
    clear: () => { container.innerHTML = ""; },
    pwd: () => printLine(cwd, container),
    whoami: () => printLine("user", container),
    id: () => printLine("uid=1000(user) gid=1000(user) groups=1000(user),27(sudo)", container),
    groups: () => printLine("user sudo", container),
    history: () => printLine(history.map((h, i) => `${i + 1}  ${escapeHTML(h)}`).join("\n") || "(empty)", container),
    ls: () => handleLs(args, container),
    cd: () => handleCd(args, container),
    cat: () => handleCat(args, container),
    tree: () => handleTree(args, container),
    stat: () => handleStat(args, container),
    find: () => handleFind(args, container),
    grep: () => handleGrep(args, container),
    touch: () => handleTouch(args, container),
    mkdir: () => handleMkdir(args, container),
    rm: () => handleRm(args, container),
    mv: () => handleMove(args, container),
    cp: () => handleCopy(args, container),
    nano: () => handleEditor("nano", args, container),
    vim: () => handleEditor("vim", args, container),
    chmod: () => handleChmod(args, container),
    chown: () => handleChown(args, container),
    chgrp: () => handleChgrp(args, container),
  };

  const handler = handlers[cmd];
  if (handler) handler();
  else printLine(`<span class="t-err">command not found: ${escapeHTML(cmd)}</span> — type <span class="t-amber">help</span> for available commands`, container);
}

function escapeHTML(str) {
  return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function resolveArg(arg) {
  return resolvePath(cwd, arg);
}

function handleLs(args, container) {
  const flags = args.filter((a) => a.startsWith("-")).join("");
  const target = args.find((a) => !a.startsWith("-"));
  const path = target ? resolveArg(target) : cwd;
  const node = findNode(FS_TREE, path);
  if (!node || !node.isDir) { printLine(`<span class="t-err">ls: cannot access '${escapeHTML(target || ".")}': not a directory</span>`, container); return; }
  const children = node.children || [];
  if (!children.length) { printLine('<span class="t-dim">(empty)</span>', container); return; }

  const showAll = flags.includes("a");
  const visible = showAll ? children : children.filter((c) => !c.name.startsWith("."));

  if (flags.includes("l")) {
    const rows = visible.map((c) => {
      const state = octalToState(c.octal, c.isDir);
      const sym = stateToSymbolic(state);
      const name = c.isDir ? `<span class="t-path">${c.name}/</span>` : c.name;
      return `${sym}  ${String(c.owner).padEnd(9)} ${String(c.group).padEnd(9)} ${name}`;
    });
    printLine(rows.join("\n"), container);
  } else {
    printLine(visible.map((c) => (c.isDir ? `<span class="t-path">${c.name}/</span>` : c.name)).join("   "), container);
  }
}

function handleCd(args, container) {
  const target = args[0];
  const newPath = resolveArg(target);
  const node = findNode(FS_TREE, newPath);
  if (!node || !node.isDir) {
    printLine(`<span class="t-err">cd: no such directory: ${escapeHTML(target || "~")}</span>`, container);
    return;
  }
  cwd = newPath;
}

function handleCat(args, container) {
  if (!args[0]) { printLine('<span class="t-err">cat: missing filename</span>', container); return; }
  const node = findNode(FS_TREE, resolveArg(args[0]));
  if (!node || node.isDir) { printLine(`<span class="t-err">cat: ${escapeHTML(args[0])}: no such file</span>`, container); return; }
  printLine(node.note || `<span class="t-dim">(no description available for this simulated file)</span>`, container);
}

function handleTree(args, container) {
  const start = args[0] ? findNode(FS_TREE, resolveArg(args[0])) : findNode(FS_TREE, cwd);
  if (!start || !start.isDir) { printLine('<span class="t-err">tree: not a directory</span>', container); return; }
  const lines = [start.path];
  const walk = (node, prefix) => {
    const kids = node.children || [];
    kids.forEach((kid, i) => {
      const last = i === kids.length - 1;
      lines.push(`${prefix}${last ? "└── " : "├── "}${kid.isDir ? `<span class="t-path">${kid.name}/</span>` : kid.name}`);
      if (kid.isDir) walk(kid, prefix + (last ? "    " : "│   "));
    });
  };
  walk(start, "");
  printLine(lines.join("\n"), container);
}

function handleStat(args, container) {
  if (!args[0]) { printLine('<span class="t-err">stat: missing filename</span>', container); return; }
  const path = resolveArg(args[0]);
  const node = findNode(FS_TREE, path);
  if (!node) { printLine(`<span class="t-err">stat: cannot stat '${escapeHTML(args[0])}': no such file or directory</span>`, container); return; }
  const state = octalToState(node.octal, node.isDir);
  const sym = stateToSymbolic(state);
  printLine([
    `  File: ${node.path}${node.isDir ? "/" : ""}`,
    `  Type: ${node.isDir ? "directory" : "regular file"}`,
    `Access: (${node.octal.padStart(4, "0")}/${sym})  Uid: (${node.owner})   Gid: (${node.group})`,
    node.sensitive ? '<span class="t-amber">Flagged sensitive — check the Security Analyzer in the Simulator for details.</span>' : "",
  ].filter(Boolean).join("\n"), container);
}

function handleFind(args, container) {
  const term = args[0];
  if (!term) { printLine('<span class="t-err">usage: find &lt;name&gt;</span>', container); return; }
  const matches = flattenTree().filter((n) => n.name.toLowerCase().includes(term.toLowerCase()));
  if (!matches.length) { printLine(`<span class="t-dim">find: no files matching '${escapeHTML(term)}'</span>`, container); return; }
  printLine(matches.map((n) => n.path + (n.isDir ? "/" : "")).join("\n"), container);
}

function handleGrep(args, container) {
  const term = args[0];
  if (!term) { printLine('<span class="t-err">usage: grep &lt;keyword&gt;</span>', container); return; }
  const matches = flattenTree().filter((n) => (n.note || "").toLowerCase().includes(term.toLowerCase()));
  if (!matches.length) { printLine(`<span class="t-dim">grep: no descriptions mention '${escapeHTML(term)}'</span>`, container); return; }
  printLine(matches.map((n) => `<span class="t-path">${n.path}</span>: ${n.note}`).join("\n"), container);
}

function withTargetNode(args, container, cmdName, fn) {
  if (!args[0]) { printLine(`<span class="t-err">${cmdName}: missing operand</span>`, container); return; }
  const path = resolveArg(args[0]);
  const node = findNode(FS_TREE, path);
  if (!node) { printLine(`<span class="t-err">${cmdName}: cannot access '${escapeHTML(args[0])}': no such file (simulated)</span>`, container); return; }
  fn(node, path);
}

function handleTouch(args, container) {
  if (!args[0]) { printLine('<span class="t-err">touch: missing filename</span>', container); return; }
  const path = resolveArg(args[0]);
  if (findNode(FS_TREE, path)) { printLine(`<span class="t-dim">touch: '${escapeHTML(args[0])}' already exists (timestamp simulated as updated)</span>`, container); return; }
  const parent = findNode(FS_TREE, parentPath(path));
  if (!parent || !parent.isDir) { printLine(`<span class="t-err">touch: cannot create '${escapeHTML(args[0])}': no such directory</span>`, container); return; }
  const name = path.split("/").pop();
  parent.children = parent.children || [];
  parent.children.push({ name, path, isDir: false, octal: "644", owner: "user", group: "user", sensitive: false, note: "A new empty file created in this simulation." });
  printLine(`<span class="t-amber">created ${path}</span>`, container);
}

function handleMkdir(args, container) {
  if (!args[0]) { printLine('<span class="t-err">mkdir: missing directory name</span>', container); return; }
  const path = resolveArg(args[0]);
  if (findNode(FS_TREE, path)) { printLine(`<span class="t-err">mkdir: cannot create directory '${escapeHTML(args[0])}': already exists</span>`, container); return; }
  const parent = findNode(FS_TREE, parentPath(path));
  if (!parent || !parent.isDir) { printLine(`<span class="t-err">mkdir: cannot create directory '${escapeHTML(args[0])}': no such parent directory</span>`, container); return; }
  const name = path.split("/").pop();
  parent.children = parent.children || [];
  parent.children.push({ name, path, isDir: true, octal: "755", owner: "user", group: "user", sensitive: false, note: "", children: [] });
  printLine(`<span class="t-amber">directory created: ${path}</span>`, container);
}

function handleRm(args, container) {
  withTargetNode(args, container, "rm", (node, path) => {
    const parent = findNode(FS_TREE, parentPath(path));
    parent.children = parent.children.filter((c) => c !== node);
    printLine(`<span class="t-amber">removed ${path}</span>`, container);
  });
}

function handleMove(args, container) {
  if (args.length < 2) { printLine('<span class="t-err">usage: mv &lt;source&gt; &lt;destination&gt;</span>', container); return; }
  withTargetNode([args[0]], container, "mv", (node, srcPath) => {
    const destPath = resolveArg(args[1]);
    const oldParent = findNode(FS_TREE, parentPath(srcPath));
    const destParent = findNode(FS_TREE, destPath)?.isDir ? findNode(FS_TREE, destPath) : findNode(FS_TREE, parentPath(destPath));
    if (!destParent || !destParent.isDir) { printLine('<span class="t-err">mv: destination directory does not exist</span>', container); return; }
    oldParent.children = oldParent.children.filter((c) => c !== node);
    const newName = findNode(FS_TREE, destPath)?.isDir ? node.name : destPath.split("/").pop();
    node.name = newName;
    destParent.children = destParent.children || [];
    destParent.children.push(node);
    reassignSubtreePaths(node, destParent.path);
    printLine(`<span class="t-amber">moved to ${node.path}</span>`, container);
  });
}

function handleCopy(args, container) {
  if (args.length < 2) { printLine('<span class="t-err">usage: cp &lt;source&gt; &lt;destination&gt;</span>', container); return; }
  withTargetNode([args[0]], container, "cp", (node) => {
    const destPath = resolveArg(args[1]);
    const destParent = findNode(FS_TREE, destPath)?.isDir ? findNode(FS_TREE, destPath) : findNode(FS_TREE, parentPath(destPath));
    if (!destParent || !destParent.isDir) { printLine('<span class="t-err">cp: destination directory does not exist</span>', container); return; }
    const newName = findNode(FS_TREE, destPath)?.isDir ? node.name : destPath.split("/").pop();
    const clone = JSON.parse(JSON.stringify(node));
    clone.name = newName;
    destParent.children = destParent.children || [];
    destParent.children.push(clone);
    reassignSubtreePaths(clone, destParent.path);
    printLine(`<span class="t-amber">copied to ${clone.path}</span>`, container);
  });
}

function reassignSubtreePaths(node, parentPathValue) {
  node.path = parentPathValue === "/" ? "/" + node.name : parentPathValue + "/" + node.name;
  if (node.children) node.children.forEach((c) => reassignSubtreePaths(c, node.path));
}

function handleEditor(name, args, container) {
  if (!args[0]) { printLine(`<span class="t-err">${name}: missing filename</span>`, container); return; }
  const node = findNode(FS_TREE, resolveArg(args[0]));
  if (!node) { printLine(`<span class="t-err">${name}: '${escapeHTML(args[0])}' does not exist</span>`, container); return; }
  printLine(`<span class="t-dim">[simulated] ${name} would open '${node.path}' here — this lab doesn't include a real text editor, since editing file contents isn't the point. Use chmod/chown/chgrp on it instead.</span>`, container);
}

function handleChmod(args, container) {
  if (args.length < 2 || !/^[0-7]{3,4}$/.test(args[0])) {
    printLine('<span class="t-err">usage: chmod &lt;mode&gt; &lt;file&gt;   e.g. chmod 755 script.sh</span>', container);
    return;
  }
  const [mode, filename] = args;
  withTargetNode([filename], container, "chmod", (node) => {
    node.octal = mode;
    const state = octalToState(mode, node.isDir);
    printLine(`<span class="t-amber">mode of '${escapeHTML(filename)}' changed to ${mode} (${stateToSymbolic(state)})</span>`, container);
  });
}

function handleChown(args, container) {
  if (args.length < 2) { printLine('<span class="t-err">usage: chown &lt;user&gt; &lt;file&gt;</span>', container); return; }
  const [owner, filename] = args;
  withTargetNode([filename], container, "chown", (node) => {
    node.owner = owner;
    printLine(`<span class="t-amber">owner of '${escapeHTML(filename)}' changed to ${escapeHTML(owner)}</span>`, container);
  });
}

function handleChgrp(args, container) {
  if (args.length < 2) { printLine('<span class="t-err">usage: chgrp &lt;group&gt; &lt;file&gt;</span>', container); return; }
  const [group, filename] = args;
  withTargetNode([filename], container, "chgrp", (node) => {
    node.group = group;
    printLine(`<span class="t-amber">group of '${escapeHTML(filename)}' changed to ${escapeHTML(group)}</span>`, container);
  });
}

export function initTerminal() {
  const body = qs("#terminal-body");
  const input = qs("#terminal-input");
  const promptPrefix = qs("#terminal-prompt-prefix");
  if (!body || !input) return;

  body.innerHTML = "";
  printLine('<span class="t-dim">Linux Permission Lab — simulated terminal. Type "help" to see available commands.</span>', body);

  const updatePromptPrefix = () => {
    if (promptPrefix) promptPrefix.innerHTML = `${promptHTML()}`;
  };
  updatePromptPrefix();

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      runCommand(input.value, body);
      input.value = "";
      updatePromptPrefix();
      body.scrollTop = body.scrollHeight;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (historyIndex > 0) { historyIndex -= 1; input.value = history[historyIndex] || ""; }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex < history.length - 1) { historyIndex += 1; input.value = history[historyIndex] || ""; }
      else { historyIndex = history.length; input.value = ""; }
    }
  });

  qs(".terminal-window")?.addEventListener("click", () => input.focus());

  qs(".terminal-hint-row")?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-cmd]");
    if (!btn) return;
    input.value = btn.dataset.cmd;
    input.focus();
  });
}
