/**
 * terminal-commands-sysinfo.js
 * System-investigation commands (split out of terminal.js in v2.9): ps,
 * who, w, last, lastlog, uname, df, du, ss/netstat, systemctl, journalctl,
 * dmesg, getcap, crontab -l.
 */
import { FS_TREE, findNode, flattenTree } from "./filesystem.js";
import { USERS, getUser, isInGroup, checkPathAccess } from "./engine/users.js";
import { escapeHTML } from "./engine/safe-html.js";
import {
  SYSTEM_INFO, PROCESSES, myProcesses, SERVICES, SOCKETS, CAPABILITIES, DISK_USAGE,
  LOGIN_SESSIONS, LOGIN_HISTORY, buildLastlog, filterJournal, dmesgLines,
} from "./engine/sysinfo.js";
import { HOST, cwd, me } from "./terminal-state.js";
import { printLine, resolveArg, deny, whyFailed } from "./terminal-helpers.js";

export function handlePs(args, container) {
  const all = ["aux", "-ef", "-e", "-A", "-aux"].some((f) => args.includes(f));
  if (!all) {
    const rows = myProcesses(me(), "ps" + (args.length ? " " + args.join(" ") : ""));
    const lines = rows.map((p) => `${String(p.pid).padStart(5)} ${p.tty.padEnd(10)} ${p.time.padStart(8)} ${escapeHTML(p.cmd)}`);
    printLine(["  PID TTY            TIME CMD", ...lines].join("\n"), container);
    return;
  }
  const lines = PROCESSES.map((p) =>
    `${p.user.padEnd(10)} ${String(p.pid).padStart(5)} ${p.cpu.padStart(4)} ${p.mem.padStart(4)} ${String(p.vsz).padStart(7)} ${String(p.rss).padStart(6)} ${p.tty.padEnd(8)} ${p.stat.padEnd(4)} ${p.start.padEnd(7)} ${p.time.padStart(7)} ${escapeHTML(p.cmd)}`
  );
  printLine(
    ["USER         PID %CPU %MEM    VSZ    RSS TTY      STAT START      TIME COMMAND", ...lines].join("\n") +
    '\n<span class="t-dim">Command-line arguments are visible here to every local user — see pid 2140 and 1402. Secrets belong in a 600 file or an environment variable the process reads itself, never a CLI flag.</span>',
    container,
  );
}

export function handleWho(container) {
  const rows = LOGIN_SESSIONS.map((s) => `${s.user.padEnd(10)} ${s.tty.padEnd(10)} (${s.from})`);
  printLine(rows.join("\n"), container);
}

export function handleW(container) {
  const header = `now up — ${SYSTEM_INFO.uptime},  ${LOGIN_SESSIONS.length} users,  load average: ${SYSTEM_INFO.loadAvg}`;
  const cols = "USER     TTY      FROM             LOGIN@   IDLE   WHAT";
  const rows = LOGIN_SESSIONS.map((s) => `${s.user.padEnd(8)} ${s.tty.padEnd(8)} ${s.from.padEnd(16)} ${s.loginAt.padEnd(8)} ${s.idle.padEnd(6)} ${s.what}`);
  const notes = LOGIN_SESSIONS.filter((s) => s.note).map((s) => `<span class="t-dim">${escapeHTML(s.note)}</span>`);
  printLine([header, cols, ...rows, ...notes].join("\n"), container);
}

export function handleLast(args, container) {
  const nIdx = args.indexOf("-n");
  const limit = nIdx !== -1 && args[nIdx + 1] ? Math.max(1, Number(args[nIdx + 1]) || LOGIN_HISTORY.length) : LOGIN_HISTORY.length;
  const rows = LOGIN_HISTORY.slice(0, limit).map((h) => {
    const status = h.still ? "still logged in" : `- ${h.duration || "?"}`;
    return `${h.user.padEnd(8)} ${h.tty.padEnd(13)} ${h.from.padEnd(18)} ${h.start}   ${status}`;
  });
  printLine(rows.join("\n"), container);
}

export function handleLastlog(container) {
  const rows = buildLastlog(Object.keys(USERS));
  const lines = rows.map((r) =>
    r.never ? `${r.user.padEnd(16)} **Never logged in**` : `${r.user.padEnd(16)} ${r.tty.padEnd(10)} ${r.from.padEnd(16)} ${r.when}`
  );
  printLine(["Username         Port       From             Latest", ...lines].join("\n"), container);
}

export function handleUname(args, container) {
  if (args.includes("-a")) {
    printLine(`${SYSTEM_INFO.kernel} ${SYSTEM_INFO.hostname} ${SYSTEM_INFO.release} ${SYSTEM_INFO.version} ${SYSTEM_INFO.machine} ${SYSTEM_INFO.os}`, container);
  } else if (args.includes("-r")) printLine(SYSTEM_INFO.release, container);
  else if (args.includes("-m")) printLine(SYSTEM_INFO.machine, container);
  else printLine(SYSTEM_INFO.kernel, container);
}

export function handleDf(container) {
  const header = "Filesystem      Size  Used Avail Use% Mounted on";
  const rows = DISK_USAGE.map((d) => `${d.fs.padEnd(15)} ${d.size.padStart(5)} ${d.used.padStart(5)} ${d.avail.padStart(6)} ${d.usePct.padStart(4)} ${d.on}`);
  const notes = DISK_USAGE.filter((d) => d.note).map((d) => `<span class="t-dim">${escapeHTML(d.on)}: ${escapeHTML(d.note)}</span>`);
  printLine([header, ...rows, ...notes].join("\n"), container);
}

export function handleDu(args, container) {
  const target = args.find((a) => !a.startsWith("-"));
  const path = target ? resolveArg(target) : cwd;
  const node = findNode(FS_TREE, path);
  if (!node) { printLine(`<span class="t-err">du: cannot access '${escapeHTML(target || ".")}': No such file or directory</span>`, container); return; }
  const duAccess = checkPathAccess(path, me(), "r");
  if (!duAccess.ok) { deny(`du: cannot read directory '${target || "."}': Permission denied`, whyFailed(duAccess, path, "r"), container); return; }
  const count = flattenTree(node).length;
  const kb = Math.max(4, count * 37);
  const human = kb > 1024 ? `${(kb / 1024).toFixed(1)}M` : `${kb}K`;
  printLine(`${human}\t${path}`, container);
}

export function handleSockets(container) {
  const header = "Netid  State    Local Address:Port      Process";
  const privileged = me() === "root";
  const rows = SOCKETS.map((s) => {
    const field = privileged || s.owner === me() ? `users:(("${s.program}",pid=${s.pid}))` : "-";
    return `${s.proto.padEnd(6)} ${s.state.padEnd(8)} ${s.local.padEnd(24)} ${field}`;
  });
  const notes = SOCKETS.filter((s) => s.note).map((s) => `<span class="t-dim">${escapeHTML(s.local)}: ${escapeHTML(s.note)}</span>`);
  const hint = privileged ? "" : '\n<span class="t-dim">Process/PID is only shown for sockets you own, or as root — exactly like real ss/netstat behave without sudo.</span>';
  printLine([header, ...rows, ...notes].join("\n") + hint, container);
}

export function handleSystemctl(args, container) {
  if (args[0] === "status") {
    const name = args[1];
    if (!name) { printLine('<span class="t-err">usage: systemctl status &lt;service&gt;</span>', container); return; }
    const full = name.endsWith(".service") ? name : `${name}.service`;
    const svc = SERVICES.find((s) => s.name === full);
    if (!svc) { printLine(`<span class="t-err">Unit ${escapeHTML(full)} could not be found.</span>`, container); return; }
    const cls = svc.active === "active" ? "t-amber" : svc.active === "failed" ? "t-err" : "t-dim";
    printLine(
      `<span class="${cls}">●</span> ${escapeHTML(svc.name)} - ${escapeHTML(svc.desc)}\n` +
      `     Loaded: ${svc.load} (/lib/systemd/system/${escapeHTML(svc.name)})\n` +
      `     Active: <span class="${cls}">${svc.active} (${svc.sub})</span>`,
      container,
    );
    return;
  }
  if (args[0] === "list-units" || args[0] === "--type=service") {
    const header = "UNIT                          LOAD   ACTIVE   SUB     DESCRIPTION";
    const rows = SERVICES.map((s) => `${s.name.padEnd(29)} ${s.load.padEnd(6)} ${s.active.padEnd(8)} ${s.sub.padEnd(7)} ${escapeHTML(s.desc)}`);
    printLine([header, ...rows].join("\n"), container);
    return;
  }
  printLine('<span class="t-err">usage: systemctl status &lt;service&gt;   or   systemctl list-units</span>', container);
}

export function handleJournalctl(args, container) {
  if (me() !== "root" && !isInGroup(me(), "adm")) {
    deny(
      "Failed to acquire journal access",
      "the journal is readable only by root and the 'adm' group — the same rule that gates /var/log/auth.log and /var/log/syslog. Try: su alice (she's in adm), or sudo journalctl.",
      container,
    );
    return;
  }
  const uIdx = args.indexOf("-u");
  const unit = uIdx !== -1 ? args[uIdx + 1] : null;
  const nIdx = args.indexOf("-n");
  const lines = nIdx !== -1 ? args[nIdx + 1] : null;
  const rows = filterJournal({ unit, lines });
  if (!rows.length) { printLine('<span class="t-dim">-- No entries --</span>', container); return; }
  const body = rows.map((e) => `${e.ts} ${HOST} ${escapeHTML(e.unit)}: ${escapeHTML(e.msg)}`).join("\n");
  const notes = rows.filter((e) => e.note).map((e) => `<span class="t-dim">${escapeHTML(e.note)}</span>`);
  const ignoredFlags = args.filter((a) => a === "-f" || a === "--since" || a === "--until");
  const liveNote = ignoredFlags.length ? '\n<span class="t-dim">(-f / --since / --until aren\'t simulated — showing the full matching history instead.)</span>' : "";
  printLine(body + (notes.length ? "\n" + notes.join("\n") : "") + liveNote, container);
}

export function handleDmesg(container) {
  if (me() !== "root") {
    deny(
      "dmesg: read kernel buffer failed: Operation not permitted",
      "Ubuntu restricts the kernel ring buffer to root by default (sysctl kernel.dmesg_restrict=1) — even 'adm' members need sudo for this one.",
      container,
    );
    return;
  }
  const rows = dmesgLines();
  printLine(rows.length ? rows.map((e) => escapeHTML(e.msg)).join("\n") : "(empty)", container);
}

export function handleGetcap(args, container) {
  const rows = CAPABILITIES.map((c) => `${c.path} ${c.caps}`);
  const notes = CAPABILITIES.filter((c) => c.note).map((c) => `<span class="t-dim">${escapeHTML(c.path)}: ${escapeHTML(c.note)}</span>`);
  printLine([...rows, ...notes].join("\n"), container);
}

export function handleCrontab(args, container) {
  if (!args.includes("-l")) { printLine('<span class="t-err">usage: crontab -l [-u user]   (this simulation only supports listing)</span>', container); return; }
  let target = me();
  const uIdx = args.indexOf("-u");
  if (uIdx !== -1) {
    const named = args[uIdx + 1];
    if (!named) { printLine('<span class="t-err">usage: crontab -u &lt;user&gt; -l</span>', container); return; }
    if (!getUser(named)) { printLine(`<span class="t-err">crontab: user '${escapeHTML(named)}' unknown</span>`, container); return; }
    if (named !== me() && me() !== "root") { deny("crontab: must be root to specify a user with -l", `-u is root-only in real cron too; '${me()}' may only list their own crontab (plain 'crontab -l', no -u needed).`, container); return; }
    target = named;
  }
  const node = findNode(FS_TREE, `/var/spool/cron/crontabs/${target}`);
  if (!node) { printLine(`<span class="t-dim">no crontab for ${escapeHTML(target)}</span>`, container); return; }
  const scheduleLine = (node.note || "").split("\n\n")[0];
  printLine(`<span class="t-dim"># crontab for ${escapeHTML(target)} — edit with: crontab -e (not simulated)</span>\n${escapeHTML(scheduleLine)}`, container);
}
