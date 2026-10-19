/**
 * terminal-helpers.js
 * Shared plumbing used by every command-handler file (split out of
 * terminal.js in v2.9): printing a line, resolving a path argument,
 * denying with an explanation, and the couple of multi-command patterns
 * (withTargetNode, visibleNodes) that chmod/chown/rm/mv/find/etc. all lean
 * on. Nothing here is specific to one command.
 */
import { el } from "./utils.js";
import { FS_TREE, findNode, resolvePath, flattenTree } from "./filesystem.js";
import { checkAccess, checkTraverse, isVisibleTo, explainAccess, explainTraverse } from "./engine/users.js";
import { escapeHTML, sanitizeTerminalHTML } from "./engine/safe-html.js";
import { nameProblem } from "./engine/shell-parse.js";
import { cwd, me, homeDir } from "./terminal-state.js";
import { TERMINAL_COMMANDS } from "./terminal-commands-data.js";

export function printLine(body, container) {
  container.append(el("div", { class: "terminal-line", html: sanitizeTerminalHTML(body) }));
}

export function nameOk(cmdName, path, container) {
  const problem = nameProblem(path.split("/").pop());
  if (!problem) return true;
  printLine(`<span class="t-err">${cmdName}: invalid name: ${escapeHTML(problem)}</span>`, container);
  return false;
}

export function resolveArg(arg) {
  if (!arg || arg === "~") return homeDir();
  if (arg.startsWith("~/")) return resolvePath(cwd, homeDir() + arg.slice(1));
  return resolvePath(cwd, arg);
}

export function deny(message, why, container) {
  printLine(`<span class="t-err">${escapeHTML(message)}</span>${why ? `\n<span class="t-hint">${escapeHTML(why)}</span>` : ""}`, container);
}

export function whyFailed(res, path, need) {
  const at = res.at ? findNode(FS_TREE, res.at) : null;
  if (!at) return "";
  return at.path === path ? explainAccess(at, me(), need) : explainTraverse(at, me());
}

export function visibleNodes() {
  const all = flattenTree();
  const user = me();
  const nodes = all.filter((n) => isVisibleTo(n.path, user));
  const blocked = all.filter((n) => n.isDir && isVisibleTo(n.path, user) && !(checkAccess(n, user, "r") && checkAccess(n, user, "x")));
  return { nodes, blocked };
}

export const blockedLines = (cmd, blocked) => blocked.map((n) => `<span class="t-err">${cmd}: '${escapeHTML(n.path)}': Permission denied</span>`).join("\n");

export function withTargetNode(args, container, cmdName, fn) {
  if (!args[0]) { printLine(`<span class="t-err">${cmdName}: missing operand</span>`, container); return; }
  const path = resolveArg(args[0]);
  const node = findNode(FS_TREE, path);
  if (!node) { printLine(`<span class="t-err">${cmdName}: cannot access '${escapeHTML(args[0])}': no such file (simulated)</span>`, container); return; }
  const trav = checkTraverse(path, me());
  if (!trav.ok) { deny(`${cmdName}: cannot access '${args[0]}': Permission denied`, whyFailed(trav, path, "x"), container); return; }
  fn(node, path);
}

export function denyDelete(cmd, what, res, container) {
  const at = res.at ? findNode(FS_TREE, res.at) : null;
  if (res.reason === "sticky") {
    deny(`${cmd}: ${what}: Operation not permitted`, `${at.path} has the sticky bit (mode ${at.octal}) — even with w on the directory, only the file's owner, the directory's owner, or root may delete/rename entries in it. '${me()}' is none of those.`, container);
  } else {
    deny(`${cmd}: ${what}: Permission denied`, at ? (res.node ? `deleting/renaming changes the PARENT directory, so it needs w there — the file's own mode doesn't matter. ${explainAccess(at, me(), "w")}` : explainTraverse(at, me())) : "", container);
  }
}

export function explainCreateDenied(res) {
  const at = res.at ? findNode(FS_TREE, res.at) : null;
  if (!at) return "";
  return res.node ? `creating an entry needs w on the PARENT directory. ${explainAccess(at, me(), "w")}` : explainTraverse(at, me());
}

/* ------------------------- per-command --help / -h ------------------------- */

/** A handful of dispatch names that don't literally start any TERMINAL_COMMANDS
 *  row's text — pure aliases, pointed at the row that documents them. */
const HELP_NAME_ALIASES = { logout: "exit", netstat: "ss", vim: "nano" };

/** Every reference-table row whose `cmd` text actually starts with this
 *  dispatch command — a command can have more than one (`find` has both its
 *  -name and -perm rows; `sudo` has its own row and the separate `sudo -l`
 *  one), so `<cmd> --help` shows all of them together. */
function helpRowsFor(dispatchName) {
  const name = HELP_NAME_ALIASES[dispatchName] || dispatchName;
  return TERMINAL_COMMANDS.filter((row) =>
    row.cmd.split(" / ").some((variant) => variant.trim().split(/\s+/)[0] === name)
  );
}

/** `<command> --help` / `-h` — reuses the exact same data the Cheat Sheet's
 *  command table is built from, so the two can never say different things
 *  about what a flag does. */
export function printCommandHelp(dispatchName, container) {
  const rows = helpRowsFor(dispatchName);
  if (!rows.length) {
    printLine(`<span class="t-dim">No detailed help for '${escapeHTML(dispatchName)}' — see 'help' for the full command list.</span>`, container);
    return;
  }
  const body = rows.map((row) => {
    const reqLine = row.requires ? `\n<span class="t-dim">  requires: ${escapeHTML(row.requires)}</span>` : "";
    return `<span class="t-arch">${escapeHTML(row.cmd)}</span>\n  ${escapeHTML(row.desc)}${reqLine}`;
  }).join("\n\n");
  printLine(body, container);
}
