/**
 * terminal-commands-identity.js
 * Identity and privilege commands (split out of terminal.js in v2.9): id,
 * groups, su, exit, sudo (including sudo -l / -i / -u / -s).
 */
import { DEFAULT_UMASK, getUser, canSudo, formatId } from "./engine/users.js";
import { escapeHTML } from "./engine/safe-html.js";
import { HOST, cwd, session, sessionStack, sudoCached, me, homeDir, setCwd, setSession } from "./terminal-state.js";
import { printLine } from "./terminal-helpers.js";
// Circular on purpose, like engine/users.js <-> filesystem.js: terminal.js
// imports handleSudo from here, and handleSudo calls dispatch() to actually
// run the sudo'd command. Safe because dispatch is only referenced inside a
// function body (called later), never at this module's top-level.
import { dispatch } from "./terminal.js";

export function handleId(args, container) {
  const name = args[0] || me();
  const out = formatId(name);
  if (!out) { printLine(`<span class="t-err">id: '${escapeHTML(name)}': no such user</span>`, container); return; }
  printLine(out, container);
}

export function handleGroups(args, container) {
  const name = args[0] || me();
  const u = getUser(name);
  if (!u) { printLine(`<span class="t-err">groups: '${escapeHTML(name)}': no such user</span>`, container); return; }
  printLine(args[0] ? `${name} : ${u.groups.join(" ")}` : u.groups.join(" "), container);
}

export function handleSu(args, container) {
  let login = false;
  const rest = [];
  args.forEach((a) => { if (a === "-" || a === "-l" || a === "--login") login = true; else rest.push(a); });
  const target = rest[0] || "root";
  if (!getUser(target)) { printLine(`<span class="t-err">su: user ${escapeHTML(target)} does not exist</span>`, container); return; }
  const note = me() === "root"
    ? '<span class="t-dim">(root can su to anyone without a password)</span>'
    : `<span class="t-dim">Password: (skipped in this simulation — real su asks for ${escapeHTML(target)}'s password, unlike sudo which asks for yours)</span>`;
  printLine(note, container);
  sessionStack.push({ session, cwd });
  setSession({ user: target, umask: DEFAULT_UMASK });
  if (login) setCwd(homeDir());
  printLine(`<span class="t-ok">now ${escapeHTML(target)}</span> <span class="t-dim">— ${escapeHTML(formatId(target))}. Type exit to go back.</span>`, container);
}

export function handleExit(container) {
  if (!sessionStack.length) {
    printLine('<span class="t-dim">exit: this is the top-level shell — nothing to return to (the simulation keeps the terminal open). Use su to switch user first.</span>', container);
    return;
  }
  const prev = sessionStack.pop();
  setSession(prev.session);
  setCwd(prev.cwd);
  printLine(`<span class="t-ok">back to ${escapeHTML(me())}</span>`, container);
}

export function handleSudo(args, container) {
  if (args[0] === "-l") { handleSudoList(container); return; }
  const rest = [...args];
  let target = "root";
  let shellOnly = false;
  while (rest[0] && rest[0].startsWith("-")) {
    const flag = rest.shift();
    if (flag === "-u") {
      target = rest.shift();
      if (!target) { printLine('<span class="t-err">sudo: option requires an argument -- u</span>', container); return; }
    } else if (flag === "-i" || flag === "-s") shellOnly = true;
    else { printLine(`<span class="t-err">sudo: unknown option ${escapeHTML(flag)}</span>`, container); return; }
  }
  if (!rest.length && !shellOnly) { printLine('<span class="t-err">usage: sudo [-u user] &lt;command&gt;   or   sudo -i</span>', container); return; }
  if (!getUser(target)) { printLine(`<span class="t-err">sudo: unknown user ${escapeHTML(target)}</span>`, container); return; }
  if (!canSudo(me())) {
    printLine(`<span class="t-err">${escapeHTML(me())} is not in the sudoers file.  This incident will be reported.</span>\n<span class="t-hint">sudo access is granted by rules in /etc/sudoers — on Debian/Ubuntu that means membership of the 'sudo' group. '${escapeHTML(me())}' is in: ${(getUser(me())?.groups || []).join(", ")}. Run id to compare, or exit back to a user that has it.</span>`, container);
    return;
  }
  if (me() !== "root" && !sudoCached.has(me())) {
    sudoCached.add(me());
    printLine(`<span class="t-dim">[sudo] password for ${escapeHTML(me())}: (skipped in this simulation — real sudo asks for YOUR password, then remembers it for a few minutes)</span>`, container);
  }
  if (!rest.length) {
    sessionStack.push({ session, cwd });
    setSession({ user: target, umask: DEFAULT_UMASK });
    setCwd(homeDir());
    printLine(`<span class="t-ok">root shell via sudo -i</span> <span class="t-dim">— type exit to leave it.</span>`, container);
    return;
  }
  // Run exactly one command with the target identity, then restore. Capture the
  // session object itself: a nested "sudo su" replaces `session`, and the
  // restore below must not touch the replacement.
  const s = session;
  const previousUser = s.user;
  s.user = target;
  try { dispatch(rest[0], rest.slice(1), container); } finally { s.user = previousUser; }
}

export function handleSudoList(container) {
  if (!canSudo(me())) {
    printLine(`<span class="t-err">Sorry, user ${escapeHTML(me())} may not run sudo on ${HOST}.</span>`, container);
    return;
  }
  const groups = (getUser(me())?.groups || []).join(", ");
  const why = me() === "root" ? "'root' always may." : `'${me()}' is in: ${groups} — membership in 'sudo' is what grants this (see %sudo in /etc/sudoers).`;
  printLine(
    `<span class="t-dim">Matching Defaults entries for ${escapeHTML(me())} on ${HOST}:\n` +
    `    env_reset, secure_path=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin\n\n` +
    `User ${escapeHTML(me())} may run the following commands on ${HOST}:</span>\n` +
    `    (ALL : ALL) ALL\n` +
    `<span class="t-dim">${escapeHTML(why)}</span>`,
    container,
  );
}
