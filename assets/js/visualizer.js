/**
 * visualizer.js
 * Module 6 — SUID / SGID / Sticky bit visualizer.
 * Purely educational: explains what each special bit does, when it's used,
 * and its security implications. Includes a "Try it in the simulator" hook
 * so learners can see the bit reflected immediately in the live output.
 */

import { el, qs } from "./utils.js";

const BITS = [
  {
    id: "suid",
    title: "SUID — Set User ID",
    symbol: "s (owner slot)",
    what: "When set on an executable, the program runs with the privileges of the file's owner, not the user who launched it.",
    when: "Classic use: /usr/bin/passwd is owned by root and has SUID set, so an ordinary user can update /etc/shadow — a file they can't write directly — through a controlled program.",
    risk: "If the owner is root and the program has a bug, an attacker can potentially use it to gain root privileges. SUID should only be set on carefully audited binaries.",
    apply: { suid: true },
  },
  {
    id: "sgid",
    title: "SGID — Set Group ID",
    symbol: "s (group slot)",
    what: "On a file, it runs with the privileges of the file's group. On a directory, every new file created inside automatically inherits that directory's group.",
    when: "Common use: a shared project directory where every file should belong to the team's group automatically, regardless of which member creates it.",
    risk: "Lower risk than SUID, but still worth reviewing — it can quietly grant group-level access that outlives the original intent.",
    apply: { sgid: true },
  },
  {
    id: "sticky",
    title: "Sticky Bit",
    symbol: "t (others slot)",
    what: "On a directory, it restricts deletion: only the file's owner, the directory's owner, or root can delete or rename files inside — even if the directory itself is world-writable.",
    when: "The textbook example is /tmp — world-writable so any process can create scratch files, sticky so users can't delete each other's files.",
    risk: "Has no effect on regular files on modern Linux, and is easy to forget on custom shared directories, leaving them open to file-deletion abuse.",
    apply: { sticky: true },
  },
];

let onTryCallback = null;
export function onVisualizerTry(cb) { onTryCallback = cb; }

export function renderVisualizer(mountSelector = "#bits-visualizer-mount") {
  const mount = qs(mountSelector);
  if (!mount) return;
  mount.innerHTML = "";

  BITS.forEach((bit, i) => {
    const details = el("details", { class: "bit-card", ...(i === 0 ? { open: "" } : {}) });
    const summary = el("summary", {}, [
      el("span", {}, [bit.title, " ", el("span", { class: "badge badge-info", style: "margin-left:8px" }, bit.symbol)]),
      el("span", { class: "chev" }, "›"),
    ]);
    const body = el("div", { class: "bit-body" }, [
      el("dl", {}, [
        el("dt", {}, "What it does"), el("dd", {}, bit.what),
        el("dt", {}, "When it's used"), el("dd", {}, bit.when),
        el("dt", {}, "Security risk"), el("dd", {}, bit.risk),
      ]),
      el("button", {
        class: "btn btn-ghost btn-sm",
        style: "margin-top:12px",
        type: "button",
        onClick: () => onTryCallback && onTryCallback(bit.apply),
      }, "Try it in the simulator →"),
    ]);
    details.append(summary, body);
    mount.append(details);
  });
}
