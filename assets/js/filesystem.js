/**
 * filesystem.js
 * Module 2 — File System Simulator (expanded in v2.1).
 * A fake filesystem tree the learner can click through. Selecting a node
 * hands its permission state to the Simulator's permission editor. Also
 * powers the Terminal simulator (ls, cd, cat, find, grep, stat, chmod,
 * chown, chgrp, touch, mkdir, rm, mv, cp).
 *
 * Node shape: { name, isDir, octal, owner, group, sensitive?, note?, children? }
 * `path` is assigned automatically by assignPaths() — never type full paths
 * by hand, so restructuring the tree can't leave stale paths behind.
 */

import { el, qs } from "./utils.js";
import { octalToState } from "./converter.js";
import { analyzePermissions } from "./security.js";

/** Shorthand builders keep the tree declaration free of repeated boilerplate. */
function f(name, octal, opts = {}) {
  return { name, isDir: false, octal, owner: opts.owner || "root", group: opts.group || "root",
    sensitive: !!opts.sensitive, note: opts.note || "" };
}
function d(name, octal, children, opts = {}) {
  return { name, isDir: true, octal, owner: opts.owner || "root", group: opts.group || "root",
    sensitive: !!opts.sensitive, note: opts.note || "", children };
}

export const FS_TREE = d("", "755", [
  d("etc", "755", [
    f("passwd", "644", { note: "World-readable by design — it holds account metadata, not password hashes." }),
    f("shadow", "640", { group: "shadow", sensitive: true, note: "Holds password hashes. Should never be world-readable." }),
    f("gshadow", "640", { group: "shadow", sensitive: true, note: "Group password hashes — same sensitivity as shadow." }),
    f("group", "644", { note: "Maps group names to GIDs and members — safe to be world-readable." }),
    f("sudoers", "440", { sensitive: true, note: "Defines who can run commands as root. Must never be group- or world-writable." }),
    d("sudoers.d", "750", [
      f("90-custom", "440", { sensitive: true, note: "Drop-in sudo rule file — same strict permissions as the main sudoers file." }),
    ]),
    f("crontab", "600", { note: "System-wide cron table — owner-only, since it can run arbitrary scheduled commands." }),
    f("fstab", "644", { note: "Filesystem mount table — world-readable is normal and expected." }),
    f("hosts", "644", { note: "Static hostname resolution — world-readable." }),
    f("hostname", "644", { note: "This machine's hostname." }),
    f("resolv.conf", "644", { note: "DNS resolver configuration." }),
    f("machine-id", "444", { note: "Unique machine identifier — read-only for everyone, written once at install." }),
    f("os-release", "644", { note: "Distro identification info, safe to be world-readable." }),
    f("nginx.conf", "644", { note: "Server configuration — typically owner-writable, world-readable." }),
    d("ssh", "755", [
      f("sshd_config", "600", { sensitive: true, note: "SSH daemon configuration. Misconfigured permissions can weaken the whole server." }),
      f("ssh_host_rsa_key", "600", { sensitive: true, note: "The server's private host key — must be readable only by root." }),
      f("ssh_host_rsa_key.pub", "644", { note: "The matching public key — safe to be world-readable." }),
    ]),
    d("skel", "755", [
      f(".bashrc", "644", { note: "Template shell config copied into new users' home directories." }),
    ]),
  ]),

  d("var", "755", [
    d("log", "755", [
      f("auth.log", "640", { group: "adm", sensitive: true, note: "Authentication events, including failed logins — restrict to admins." }),
      f("syslog", "640", { group: "adm", sensitive: true, note: "General system log, can contain sensitive operational detail." }),
      f("wtmp", "664", { group: "utmp", note: "Login history database, read by `last` — group-writable by design for the utmp group." }),
      f("btmp", "600", { sensitive: true, note: "Failed login attempts — owner-only, often used to detect brute-force attempts." }),
      f("lastlog", "644", { note: "Per-user last-login timestamps." }),
      d("nginx", "755", [
        f("access.log", "644", { note: "Web server access log — generally fine to be world-readable." }),
        f("error.log", "640", { sensitive: true, note: "Can leak internal paths and stack traces — restrict to owner and group." }),
      ]),
    ], { group: "adm" }),
    d("www", "755", [
      d("html", "755", [
        f("index.html", "644", { owner: "www-data", group: "www-data", note: "Public homepage." }),
        f("config.php", "644", { owner: "www-data", group: "www-data", sensitive: true,
          note: "Holds database credentials but sits in a web-servable directory at 644 — a classic misconfiguration; should be 640 at most." }),
        d("uploads", "777", [
          f("avatar_12.png", "666", { owner: "www-data", group: "www-data", note: "User-uploaded file inheriting the directory's over-permissive mode." }),
        ], { owner: "www-data", group: "www-data", sensitive: true, note: "World-writable upload directory — a common and dangerous misconfiguration." }),
      ], { owner: "www-data", group: "www-data" }),
    ]),
    d("mail", "1777", [
      f("user", "660", { owner: "user", group: "mail", note: "A user's personal mailbox file." }),
    ], { group: "mail", note: "Mail spool directory — world-writable with the sticky bit, same pattern as /tmp." }),
    d("spool", "755", [
      d("cron", "755", [
        d("crontabs", "1730", [
          f("user", "600", { owner: "user", group: "crontab", note: "A user's personal cron schedule." }),
        ], { group: "crontab", note: "Per-user crontab storage — sticky, group-writable by the crontab group only." }),
      ]),
    ]),
  ]),

  d("opt", "755", [
    d("app", "755", [
      f("app.jar", "644", { note: "Application artifact — doesn't need to be executable directly." }),
      d("config", "750", [
        f("app.yml", "640", { sensitive: true, note: "Application configuration including API keys — owner/group only." }),
      ]),
      d("bin", "755", [
        f("start.sh", "750", { note: "Startup script — owner and group can run it, others can't." }),
      ]),
    ]),
  ]),

  d("usr", "755", [
    d("bin", "755", [
      f("passwd", "4755", { sensitive: true, note: "The real-world SUID example: runs as root so ordinary users can update their own password hash in /etc/shadow." }),
      f("sudo", "4755", { sensitive: true, note: "SUID root — controls privilege escalation for the whole system; a favorite audit target." }),
      f("su", "4755", { sensitive: true, note: "SUID root — switches users; same audit priority as sudo." }),
      f("ping", "4755", { sensitive: true, note: "Classically SUID so unprivileged users can open raw sockets to send ICMP packets." }),
    ]),
    d("local", "755", [
      d("bin", "755", [
        f("deploy.sh", "750", { owner: "deployer", group: "deployer", note: "Internal deployment script — restricted to the deploy service account and its group." }),
      ]),
    ]),
    d("sbin", "755", [
      f("useradd", "4750", { sensitive: true, note: "Privileged user-management tool — SUID, restricted to root's admin group." }),
    ]),
    d("share", "755", [
      d("doc", "755", [
        f("readme", "644", { note: "Generic documentation file — no special sensitivity." }),
      ]),
    ]),
  ]),

  d("tmp", "1777", [
    f("session_abc123", "600", { owner: "user", note: "A user's private session file — correctly locked down even inside a shared directory." }),
    f("upload_tmp", "666", { owner: "user", sensitive: true, note: "A temp upload left world-writable — anyone could tamper with it before it's processed." }),
    f(".hidden_script.sh", "777", { owner: "user", sensitive: true, note: "A hidden script that is both world-writable and world-executable — a critical, easily-missed exposure." }),
  ], { note: "World-writable with the sticky bit set — the standard, safe configuration for a shared scratch directory." }),

  d("home", "755", [
    d("user", "750", [
      d(".ssh", "700", [
        f("authorized_keys", "600", { owner: "user", group: "user", sensitive: true, note: "Grants SSH login. Must be readable only by its owner." }),
        f("id_rsa", "600", { owner: "user", group: "user", sensitive: true, note: "Private SSH key — 600 is the only acceptable mode." }),
        f("id_rsa.pub", "644", { owner: "user", group: "user", note: "The matching public key, safe to share." }),
      ], { owner: "user", group: "user" }),
      d(".aws", "700", [
        f("credentials", "600", { owner: "user", group: "user", sensitive: true, note: "Cloud API keys — treat exactly like an SSH private key." }),
      ], { owner: "user", group: "user" }),
      d("public_html", "755", [
        f("index.html", "644", { owner: "user", group: "user", note: "Public personal page." }),
        f("database.conf", "644", { owner: "user", group: "user", sensitive: true,
          note: "Contains database credentials but sits in a web-servable directory at 644 — a common misconfiguration." }),
      ], { owner: "user", group: "user" }),
      f("backup.sql", "666", { owner: "user", group: "user", sensitive: true, note: "A full database dump, world-writable. Anyone on the box can corrupt it." }),
      f("script.sh", "755", { owner: "user", group: "user", note: "An executable shell script — 755 is standard so the owner can edit and everyone can run it." }),
      f("notes.txt", "644", { owner: "user", group: "user", note: "Ordinary personal notes." }),
      f(".bash_history", "600", { owner: "user", group: "user", note: "Command history — can contain pasted secrets, so owner-only is correct." }),
    ], { owner: "user", group: "user" }),
    d("alice", "750", [
      d(".ssh", "700", [
        f("id_ed25519", "644", { owner: "alice", group: "alice", sensitive: true,
          note: "A private key mistakenly left world-readable — ssh-keygen defaults to 600 for a reason." }),
      ], { owner: "alice", group: "alice" }),
      d("project", "755", [
        f("README.md", "644", { owner: "alice", group: "alice", note: "Project documentation." }),
        f("deploy_key", "640", { owner: "alice", group: "alice", sensitive: true, note: "A deploy key shared with the group — should not be world-readable, and isn't." }),
      ], { owner: "alice", group: "alice" }),
    ], { owner: "alice", group: "alice" }),
  ]),

  d("root", "700", [
    d(".ssh", "700", [
      f("authorized_keys", "600", { owner: "root", group: "root", sensitive: true, note: "Root SSH login — the highest-value key on the machine." }),
    ], { owner: "root", group: "root" }),
    f(".bash_history", "600", { owner: "root", group: "root", note: "Root's command history — owner-only." }),
    f("root_notes.txt", "600", { owner: "root", group: "root", note: "Private admin notes." }),
  ], { owner: "root", group: "root" }),
]);

/* Assign every node's path from its position in the tree, so the data above
   never needs to repeat a full path by hand. */
function assignPaths(node, parentPath) {
  node.path = parentPath === "" ? "/" + node.name : parentPath + "/" + node.name;
  if (node.name === "") node.path = "/";
  if (node.children) node.children.forEach((c) => assignPaths(c, node.path === "/" ? "" : node.path));
}
assignPaths(FS_TREE, "");

let onSelectCallback = null;
let selectedPath = "/etc/passwd";

export function onFilesystemSelect(cb) {
  onSelectCallback = cb;
}

function nodeIcon(node) {
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.classList.add("fs-icon");
  svg.innerHTML = node.isDir
    ? '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" stroke="currentColor" stroke-width="1.6"/>'
    : '<path d="M6 3h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.6"/><path d="M14 3v4h4" stroke="currentColor" stroke-width="1.6"/>';
  return svg;
}

function renderNode(node, container) {
  const state = octalToState(node.octal, node.isDir);
  const analysis = analyzePermissions(state, { isSensitive: !!node.sensitive });

  const btn = el("button", {
    class: `fs-node-btn ${node.path === selectedPath ? "selected" : ""} ${analysis.level === "critical" ? "is-risky" : ""}`,
    type: "button",
    "data-path": node.path,
    "aria-pressed": node.path === selectedPath ? "true" : "false",
    "data-tooltip": `${node.owner}:${node.group}`,
    onClick: () => selectNode(node),
  }, [
    nodeIcon(node),
    el("span", { class: "fs-name" }, node.isDir ? node.name + "/" : node.name),
    el("span", { class: "fs-perm-chip" }, node.octal),
  ]);
  container.append(btn);

  if (node.children && node.children.length) {
    const group = el("div", { class: "fs-group" });
    node.children.forEach((child) => renderNode(child, group));
    container.append(group);
  }
}

function selectNode(node) {
  selectedPath = node.path;
  renderFilesystem();
  if (onSelectCallback) onSelectCallback(node);
}

export function getSelectedNode() {
  return findNode(FS_TREE, selectedPath);
}

export function findNode(node, path) {
  if (node.path === path) return node;
  if (!node.children) return null;
  for (const child of node.children) {
    const found = findNode(child, path);
    if (found) return found;
  }
  return null;
}

/** Resolve a user-typed path (absolute or relative to cwd) the way the shell would. */
export function resolvePath(cwd, target) {
  if (!target || target === "~") return "/home/user";
  if (target.startsWith("/")) return normalizeSegments(target);
  if (target === ".") return cwd;
  if (target === "..") return parentPath(cwd);
  const base = cwd === "/" ? "" : cwd;
  return normalizeSegments(base + "/" + target);
}

function normalizeSegments(path) {
  const parts = path.split("/").filter(Boolean);
  const stack = [];
  for (const part of parts) {
    if (part === ".") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  return "/" + stack.join("/");
}

export function parentPath(path) {
  if (path === "/") return "/";
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  return parts.length ? "/" + parts.join("/") : "/";
}

/** Flatten the whole tree — used by `find` and `grep` in the terminal. */
export function flattenTree(node = FS_TREE, acc = []) {
  if (node !== FS_TREE) acc.push(node);
  if (node.children) node.children.forEach((c) => flattenTree(c, acc));
  return acc;
}

export function renderFilesystem(mountSelector = "#fs-tree-mount") {
  const mount = qs(mountSelector);
  if (!mount) return;
  mount.innerHTML = "";
  const tree = el("div", { class: "fs-tree" });
  FS_TREE.children.forEach((child) => renderNode(child, tree));
  mount.append(tree);
}

export function initFilesystem() {
  renderFilesystem();
  const initial = getSelectedNode();
  if (initial && onSelectCallback) onSelectCallback(initial);
}
