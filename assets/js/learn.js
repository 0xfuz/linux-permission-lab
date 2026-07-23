/**
 * learn.js
 * New in v2.1 — a full reference curriculum of 19 learning cards covering
 * the Linux permission model end to end. Each topic gets a small generated
 * SVG diagram (from a shared set of diagram builders, so 19 topics don't
 * require 19 bespoke illustrations) plus a description, example, command
 * reference, tips and warnings.
 */

import { el, qs, qsa } from "./utils.js";
import { t, localize, onLocaleChanged } from "./i18n.js";
import { LEARN_TOPICS_AR } from "./learn.ar.js";

/* ---------------------------- Diagram builders ---------------------------- */
/* Small, reusable SVG generators. Every color uses CSS variables so they
   theme correctly in both dark and light mode. */

function triadDiagram(labels = ["Owner", "Group", "Others"], bits = [true, true, true]) {
  const boxes = labels.map((label, i) => {
    const x = 10 + i * 140;
    return `
      <g>
        <rect x="${x}" y="10" width="120" height="90" rx="10" fill="none" style="stroke:var(--border-strong)" stroke-width="1.5"/>
        <text x="${x + 60}" y="30" text-anchor="middle" style="fill:var(--text-secondary);font:600 11px var(--font-mono)">${label}</text>
        ${["R", "W", "X"].map((b, j) => `<rect x="${x + 10 + j * 35}" y="42" width="28" height="28" rx="6" style="fill:${bits[i] !== false ? "var(--amber-500)" : "var(--bg-inset)"};stroke:var(--border-strong)"/>
        <text x="${x + 24 + j * 35}" y="61" text-anchor="middle" style="fill:${bits[i] !== false ? "var(--text-on-amber)" : "var(--text-tertiary)"};font:700 13px var(--font-mono)">${b}</text>`).join("")}
      </g>`;
  }).join("");
  return `<svg viewBox="0 0 410 110" xmlns="http://www.w3.org/2000/svg">${boxes}</svg>`;
}

function octalDiagram() {
  const cols = [["4", "read (r)"], ["2", "write (w)"], ["1", "execute (x)"]];
  const items = cols.map((c, i) => `
    <g transform="translate(${10 + i * 130},0)">
      <rect width="110" height="70" rx="10" style="fill:var(--bg-inset);stroke:var(--border-strong)"/>
      <text x="55" y="34" text-anchor="middle" style="fill:var(--amber-300);font:700 22px var(--font-mono)">${c[0]}</text>
      <text x="55" y="54" text-anchor="middle" style="fill:var(--text-tertiary);font:500 11px var(--font-body)">${c[1]}</text>
    </g>`).join("");
  return `<svg viewBox="0 0 400 80" xmlns="http://www.w3.org/2000/svg">${items}
    <text x="200" y="-8" />
  </svg>`;
}

function bitPositionDiagram(bitLabel, position) {
  // position: 0 = owner slot, 1 = group slot, 2 = others slot
  const slots = ["r", "w", "x"];
  const groups = ["Owner", "Group", "Others"].map((label, i) => {
    const highlight = i === position;
    const x = 10 + i * 130;
    return `
      <g>
        <text x="${x + 50}" y="14" text-anchor="middle" style="fill:var(--text-tertiary);font:600 10px var(--font-mono)">${label}</text>
        ${slots.map((s, j) => {
          const isSpecialSlot = highlight && j === 2;
          return `<rect x="${x + j * 34}" y="22" width="28" height="28" rx="6" style="fill:${isSpecialSlot ? "var(--cyan-500)" : "var(--bg-inset)"};stroke:var(--border-strong)"/>
          <text x="${x + 14 + j * 34}" y="41" text-anchor="middle" style="fill:${isSpecialSlot ? "#06181a" : "var(--text-secondary)"};font:700 13px var(--font-mono)">${isSpecialSlot ? bitLabel : s}</text>`;
        }).join("")}
      </g>`;
  }).join("");
  return `<svg viewBox="0 0 400 60" xmlns="http://www.w3.org/2000/svg">${groups}</svg>`;
}

function beforeAfterDiagram(beforeLabel, afterLabel, cmdLabel) {
  return `<svg viewBox="0 0 400 70" xmlns="http://www.w3.org/2000/svg">
    <rect x="5" y="15" width="130" height="40" rx="8" style="fill:var(--bg-inset);stroke:var(--border-strong)"/>
    <text x="70" y="40" text-anchor="middle" style="fill:var(--text-secondary);font:600 13px var(--font-mono)">${beforeLabel}</text>
    <text x="200" y="30" text-anchor="middle" style="fill:var(--amber-300);font:600 11px var(--font-mono)">${cmdLabel}</text>
    <path d="M145 35 H255" style="stroke:var(--amber-500)" stroke-width="2" marker-end="url(#arrow)"/>
    <defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" style="fill:var(--amber-500)"/></marker></defs>
    <rect x="265" y="15" width="130" height="40" rx="8" style="fill:var(--bg-inset);stroke:var(--safe-500)"/>
    <text x="330" y="40" text-anchor="middle" style="fill:var(--safe-500);font:600 13px var(--font-mono)">${afterLabel}</text>
  </svg>`;
}

function gaugeDiagram(activeLevel) {
  const levels = [["Safe", "var(--safe-500)"], ["Warning", "var(--warn-500)"], ["Critical", "var(--crit-500)"]];
  const items = levels.map((l, i) => `
    <g transform="translate(${10 + i * 130},0)">
      <rect width="110" height="46" rx="8" style="fill:${activeLevel === i ? l[1] : "var(--bg-inset)"};stroke:var(--border-strong)"/>
      <text x="55" y="28" text-anchor="middle" style="fill:${activeLevel === i ? "#0a0c0d" : "var(--text-tertiary)"};font:700 12px var(--font-mono)">${l[0]}</text>
    </g>`).join("");
  return `<svg viewBox="0 0 400 56" xmlns="http://www.w3.org/2000/svg">${items}</svg>`;
}

/* ---------------------------- Topic content ---------------------------- */

export const LEARN_TOPICS = [
  {
    id: "overview", title: "Linux Permissions",
    description: "Every file and directory on Linux carries a permission set describing who can read it, write to it, and execute it. That permission set is split three ways — owner, group and others — so a single file can behave differently depending on who's asking.",
    diagram: () => triadDiagram(),
    example: "-rw-r--r-- 1 alice devs 220 Jul 1 09:14 notes.txt — alice (owner) can read/write; the devs group and everyone else can only read.",
    commands: ["ls -l file.txt", "stat file.txt"],
    tips: ["Run `ls -l` on a file whenever you're unsure what it currently allows.", "Permissions apply per-file, not per-user account — the same user might have different access to two different files."],
    warnings: ["Permissions are not the same as ownership — you can own a file and still have no permission to read it if you set it that way."],
  },
  {
    id: "rwx", title: "Read / Write / Execute",
    description: "The three permission bits mean different things depending on whether they apply to a file or a directory. On a file: read lets you view contents, write lets you modify them, execute lets you run it as a program. On a directory: read lets you list its contents, write lets you create/delete entries inside it, and execute lets you enter it at all.",
    diagram: () => triadDiagram(["File", "Directory", "Script"]),
    example: "A directory with r-x but no w lets you `cd` into it and `ls` it, but not create new files inside.",
    commands: ["chmod +x script.sh", "chmod u+r,go-rwx secret.txt"],
    tips: ["Execute on a directory is easy to forget — without it, `cd` fails even if read is set.", "A script needs both read and execute to run with `./script.sh`."],
    warnings: ["Write without execute on a directory is a common source of confusing 'permission denied' errors when trying to enter it."],
  },
  {
    id: "roles", title: "Owner / Group / Others",
    description: "Every file has exactly one owning user and one owning group. 'Owner' permissions apply only to that user; 'Group' permissions apply to every member of that group; 'Others' covers everyone else on the system. Root bypasses all of this by default.",
    diagram: () => triadDiagram(["Owner", "Group", "Others"]),
    example: "chown alice:devs report.pdf sets alice as owner and devs as the owning group in one command.",
    commands: ["chown alice file.txt", "chgrp devs file.txt", "chown alice:devs file.txt"],
    tips: ["Use groups to share access among a team without touching 'others' at all.", "`id` shows your own user and every group you belong to."],
    warnings: ["Adding a user to a powerful group (like sudo or docker) is often equivalent to granting root access — treat group membership as a security boundary."],
  },
  {
    id: "numeric", title: "Numeric Permissions",
    description: "Octal notation represents each triad as a single digit 0–7, formed by adding read (4), write (2) and execute (1). Three digits describe owner, group and others in one compact number — chmod 755 sets owner to 7 (rwx), group and others to 5 (r-x) each.",
    diagram: () => octalDiagram(),
    example: "6 = 4 (read) + 2 (write) = read/write, no execute — common for a data file a script updates but never runs.",
    commands: ["chmod 644 file.txt", "chmod 755 script.sh", "chmod 600 id_rsa"],
    tips: ["You can always derive the digit yourself: add up whichever of 4/2/1 apply.", "A leading fourth digit (like 4755) sets special bits — covered in SUID/SGID/Sticky."],
    warnings: ["Octal notation replaces the whole triad at once — `chmod 644` overwrites execute bits too, even if you didn't mean to touch them."],
  },
  {
    id: "symbolic", title: "Symbolic Permissions",
    description: "Symbolic notation spells permissions out as characters: r, w, x for each of owner/group/others, shown as a 9 (or 10, with the leading file-type character) character string like rwxr-xr-x. chmod also accepts symbolic operators (u/g/o/a with +/-/=) to adjust specific bits without rewriting the whole mode.",
    diagram: () => triadDiagram(["u (owner)", "g (group)", "o (others)"]),
    example: "chmod g+w file.txt adds write for the group only, leaving owner and others untouched.",
    commands: ["chmod u+x script.sh", "chmod go-w file.txt", "chmod a+r file.txt"],
    tips: ["Symbolic mode is safer than octal when you want to change just one thing without affecting the rest.", "`u`, `g`, `o`, `a` stand for user(owner), group, others, all."],
    warnings: ["Mixing up `=` (set exactly) with `+`/`-` (add/remove) is a common mistake — `chmod g=r` removes write and execute from the group even if they were already set."],
  },
  {
    id: "binary", title: "Binary Permissions",
    description: "Underneath octal notation, each triad is really 3 bits: read, write, execute — 1 for granted, 0 for denied. 755 in binary is 111 101 101. Understanding the binary layer makes it obvious why only digits 0–7 are valid: three bits can only represent eight combinations.",
    diagram: () => octalDiagram(),
    example: "101 in binary = 4 + 0 + 1 = 5 = r-x — read and execute, no write.",
    commands: ["stat -c '%a %A' file.txt"],
    tips: ["Use the Calculator module to flip between binary, octal and symbolic instantly while this sinks in.", "Each bit position is independent — you can reason about read, write and execute completely separately."],
    warnings: ["Don't confuse the 3-bit-per-triad binary here with a file's actual byte content — this binary only describes permissions, nothing about what's inside the file."],
  },
  {
    id: "chmod", title: "chmod",
    description: "`chmod` (change mode) is the command that sets a file or directory's permission bits, using either octal (chmod 755 file) or symbolic (chmod u+x file) notation. It's the single most-used permissions command on any Linux system.",
    diagram: () => beforeAfterDiagram("644", "755", "chmod 755"),
    example: "chmod -R 755 public_html/ recursively applies 755 to a directory and everything inside it.",
    commands: ["chmod 644 file.txt", "chmod +x deploy.sh", "chmod -R 755 public_html/"],
    tips: ["Use `-R` carefully — it's easy to accidentally apply an executable mode to files that shouldn't have it.", "`chmod --reference=other_file target_file` copies another file's exact mode."],
    warnings: ["`chmod 777` is almost never the right answer — it grants full access to every user on the system, including ones you don't trust."],
  },
  {
    id: "chown", title: "chown",
    description: "`chown` (change owner) reassigns which user account owns a file, and optionally its group in the same command. Only root (or the current owner, in limited cases) can give a file away to another user.",
    diagram: () => beforeAfterDiagram("root:root", "alice:devs", "chown alice:devs"),
    example: "sudo chown -R www-data:www-data /var/www/app hands an entire web app directory to the web server's service account.",
    commands: ["chown alice file.txt", "chown alice:devs file.txt", "chown -R www-data:www-data /var/www/app"],
    tips: ["You usually need root privileges (sudo) to change ownership to another user.", "Combine user and group in one call with `user:group` instead of running chown and chgrp separately."],
    warnings: ["Recursively chowning system directories can break services that expect specific ownership — double check the path before adding `-R`."],
  },
  {
    id: "chgrp", title: "chgrp",
    description: "`chgrp` (change group) reassigns a file's owning group without touching the owning user. It's most useful when sharing a file with a team via group membership rather than changing who personally owns it.",
    diagram: () => beforeAfterDiagram("group: root", "group: devs", "chgrp devs"),
    example: "chgrp -R devs shared-project/ makes an entire project directory belong to the devs group so every member can collaborate.",
    commands: ["chgrp devs file.txt", "chgrp -R devs shared-project/"],
    tips: ["You must be a member of the target group (or root) to assign a file to it.", "Combine with `chmod g+rwx` to actually grant the group access, since chgrp alone only changes ownership, not permissions."],
    warnings: ["Changing a file's group without adjusting its group permission bits can leave it just as inaccessible to the new group as before."],
  },
  {
    id: "umask", title: "umask",
    description: "`umask` sets the default permissions removed from every newly created file or directory. A umask of 022 subtracts write access for group and others from the usual 666/777 starting point, which is why new files typically land at 644 and new directories at 755.",
    diagram: () => beforeAfterDiagram("666 default", "644 result", "umask 022"),
    example: "With umask 077, new files are created at 600 and new directories at 700 — nothing is shared by default.",
    commands: ["umask", "umask 022", "umask 077"],
    tips: ["Run `umask` with no arguments to see your current value before assuming what new files will look like.", "Setting a stricter umask (like 077) in your shell profile is a simple, systemic way to default toward privacy."],
    warnings: ["umask only affects newly created files — changing it does nothing to files that already exist."],
  },
  {
    id: "acl", title: "Access Control Lists (ACL)",
    description: "The owner/group/others model only allows one user and one group per file. ACLs extend this by letting you grant specific permissions to additional individual users or groups on the same file, using `setfacl` and `getfacl`.",
    diagram: () => triadDiagram(["Owner", "Group", "+ACL entries"], [true, true, true]),
    example: "setfacl -m u:bob:rx report.pdf lets bob read and execute the file even though he's neither the owner nor in the owning group.",
    commands: ["getfacl file.txt", "setfacl -m u:bob:rx file.txt", "setfacl -x u:bob file.txt"],
    tips: ["`ls -l` shows a `+` after the permission string when a file has ACL entries — that's your cue to run `getfacl`.", "ACLs are ideal for the 'one extra person needs access' case without restructuring groups."],
    warnings: ["ACL entries are easy to forget about since they don't show up in a plain `ls -l` — always check with `getfacl` when auditing a sensitive file."],
  },
  {
    id: "suid", title: "SUID",
    description: "The Set User ID bit makes an executable run with the privileges of its owner rather than the user who launched it. It's how programs like `passwd` let ordinary users perform an action that technically requires root, without giving them root access generally.",
    diagram: () => bitPositionDiagram("s", 0),
    example: "chmod 4755 tool sets SUID alongside a standard 755 base — symbolically this shows as rwsr-xr-x.",
    commands: ["chmod 4755 tool", "chmod u+s tool", "find / -perm -4000"],
    tips: ["`find / -perm -4000` lists every SUID binary on a system — a standard first step in a permissions audit.", "SUID only has an effect on executables; setting it on a plain data file does nothing."],
    warnings: ["A SUID binary owned by root that has any code-execution bug can potentially be used for full privilege escalation — audit these regularly."],
  },
  {
    id: "sgid", title: "SGID",
    description: "The Set Group ID bit has two different effects depending on what it's set on: on an executable, it runs with the file's group privileges; on a directory, every new file or subdirectory created inside automatically inherits that directory's group.",
    diagram: () => bitPositionDiagram("s", 1),
    example: "chmod 2775 shared/ makes every file teammates create inside automatically belong to the shared/ directory's group.",
    commands: ["chmod 2775 shared-dir/", "chmod g+s shared-dir/", "find / -perm -2000"],
    tips: ["SGID on a directory is the standard fix for 'files keep ending up owned by the wrong group' in shared team folders.", "Unlike SUID, SGID on a directory is common and generally low-risk."],
    warnings: ["SGID on an executable, like SUID, should be audited — it still grants privilege beyond what the calling user would normally have."],
  },
  {
    id: "sticky", title: "Sticky Bit",
    description: "The sticky bit, applied to a directory, restricts deletion: only a file's owner, the directory's owner, or root can remove or rename it — even if the directory itself is world-writable. It has no effect on regular files on modern Linux.",
    diagram: () => bitPositionDiagram("t", 2),
    example: "/tmp is the textbook case: mode 1777 lets anyone create files, but the sticky bit stops anyone but the file's own owner from deleting them.",
    commands: ["chmod 1777 shared-scratch/", "chmod +t shared-scratch/", "find / -perm -1000"],
    tips: ["Any time you make a directory world-writable, ask whether it also needs the sticky bit.", "The symbolic form shows sticky as a `t` (or `T` if others lacks execute) in the last character."],
    warnings: ["A world-writable directory without the sticky bit lets any user delete or rename any other user's files inside it — a frequently overlooked risk."],
  },
  {
    id: "best-practices", title: "Linux Security Best Practices",
    description: "Good permission hygiene comes down to a few repeatable habits: grant the minimum access actually needed (least privilege), prefer group-based sharing over world-access, and audit special bits and world-writable paths periodically rather than assuming they stay correct forever.",
    diagram: () => gaugeDiagram(0),
    example: "Instead of chmod 777 to 'just make it work', diagnose which specific role (owner/group/others) actually needs which specific bit.",
    commands: ["find / -perm -o+w -type f", "find / -perm -4000", "find / -nogroup -o -nouser"],
    tips: ["When in doubt, start restrictive (600/700) and loosen only what's proven necessary.", "Automate periodic audits — permission drift happens gradually, not all at once."],
    warnings: ["'It works now' is not the same as 'it's correctly scoped' — a too-permissive fix that happens to work is still a liability."],
  },
  {
    id: "mistakes", title: "Common Permission Mistakes",
    description: "The same handful of mistakes show up again and again: reaching for 777 instead of diagnosing the real problem, leaving credentials world-readable, forgetting execute on directories, and copying files in ways that don't preserve intended permissions.",
    diagram: () => gaugeDiagram(1),
    example: "Copying a 600 private key with a tool that doesn't preserve permissions can silently leave the copy at a more permissive default mode.",
    commands: ["cp -p id_rsa id_rsa.bak", "ls -l id_rsa.bak", "chmod 600 id_rsa.bak"],
    tips: ["After copying sensitive files, always re-check their mode rather than assuming it carried over.", "`cp -p` preserves mode, ownership and timestamps — plain `cp` may not."],
    warnings: ["'It was 600 originally' doesn't guarantee it still is after being copied, moved, extracted from an archive, or synced by some tools."],
  },
  {
    id: "escalation", title: "Permission Escalation Risks",
    description: "Privilege escalation often exploits permission mistakes rather than complex vulnerabilities: a world-writable SUID root binary, an overly permissive sudoers entry, or a script run by root that reads from a directory regular users can write into.",
    diagram: () => gaugeDiagram(2),
    example: "A cron job run as root that executes a script from a world-writable directory can be hijacked by replacing that script.",
    commands: ["find / -perm -4000 -perm -o+w", "find / -writable -user root -type f 2>/dev/null"],
    tips: ["Anything root executes automatically (cron, systemd timers, startup scripts) deserves extra scrutiny on its permissions.", "The combination to always hunt for: SUID/SGID plus world-writable, on the same file."],
    warnings: ["Escalation paths are rarely a single dramatic flaw — they're usually a chain of small, individually-plausible misconfigurations."],
  },
  {
    id: "secure-files", title: "Secure File Permissions",
    description: "A quick reference for getting sensitive files right the first time: private keys and credentials at 600, sensitive configs at 640, shared team directories at 750 or 770, and world-writable directories always paired with the sticky bit.",
    diagram: () => triadDiagram(["Keys: 600", "Config: 640", "Shared: 750"]),
    example: "A freshly generated SSH key from ssh-keygen is already created at 600 — that default is deliberate and worth preserving.",
    commands: ["chmod 600 ~/.ssh/id_ed25519", "chmod 640 config/secrets.yml", "chmod 750 /srv/team-dir"],
    tips: ["When creating a new secrets file, set its mode before writing sensitive content into it, not after.", "Use the Cheat Sheet module as a quick lookup whenever you're unsure of a target mode."],
    warnings: ["A brief window where a secrets file is world-readable — even before you 'get around to' locking it down — is still a real exposure window."],
  },
  {
    id: "real-world", title: "Real-world Examples",
    description: "The fake filesystem in the Simulator module mirrors real permission patterns you'll encounter constantly: /etc/shadow's 640, SSH's insistence on 600 private keys, /tmp's 1777, and the quiet danger of a web-servable config file sitting at 644 with database credentials inside.",
    diagram: () => triadDiagram(["/etc/shadow", "~/.ssh/id_rsa", "/tmp"]),
    example: "Explore the Simulator's fake filesystem and open the Security Analyzer on each file to see these patterns explained live.",
    commands: ["ls -l /etc/shadow", "ls -ld /tmp", "stat ~/.ssh/id_rsa"],
    tips: ["Recognizing these canonical examples on sight is most of what 'understanding Linux permissions' actually means in practice.", "Try the Challenges module's Expert tier — it directly rebuilds several of these real-world files from scratch."],
    warnings: ["Real systems drift from these textbook examples over time — always verify with `ls -l`/`stat` rather than assuming a file matches its textbook mode."],
  },
];

/* ---------------------------- Rendering ---------------------------- */

function localizedTopics() {
  return localize(LEARN_TOPICS, LEARN_TOPICS_AR);
}

function renderTopicCard(topic) {
  const details = el("details", { class: "learn-card", id: `learn-${topic.id}` });
  const summary = el("summary", {}, [
    el("span", { class: "learn-card-title" }, topic.title),
    el("span", { class: "chev" }, "›"),
  ]);

  const diagramWrap = el("div", { class: "learn-diagram", html: topic.diagram() });

  const body = el("div", { class: "learn-body" }, [
    el("p", {}, topic.description),
    diagramWrap,
    el("div", { class: "learn-block" }, [
      el("span", { class: "learn-block-label" }, t("learn.example")),
      el("p", { class: "learn-example" }, topic.example),
    ]),
    el("div", { class: "learn-block" }, [
      el("span", { class: "learn-block-label" }, t("learn.commands")),
      el("div", { class: "learn-commands" }, topic.commands.map((cmd) => el("code", {}, cmd))),
    ]),
    el("div", { class: "learn-tips-warnings" }, [
      el("div", { class: "learn-tips" }, [
        el("span", { class: "learn-block-label" }, t("learn.tips")),
        el("ul", {}, topic.tips.map((tip) => el("li", {}, tip))),
      ]),
      el("div", { class: "learn-warnings" }, [
        el("span", { class: "learn-block-label" }, t("learn.warnings")),
        el("ul", {}, topic.warnings.map((warn) => el("li", {}, warn))),
      ]),
    ]),
  ]);

  details.append(summary, body);
  return details;
}

let learnSearchTerm = "";

function renderLearnList() {
  const mount = qs("#learn-list-mount");
  if (!mount) return;
  mount.innerHTML = "";
  const term = learnSearchTerm.trim().toLowerCase();
  const all = localizedTopics();
  const filtered = all.filter((topic) => !term || topic.title.toLowerCase().includes(term) || topic.description.toLowerCase().includes(term));
  if (!filtered.length) {
    mount.append(el("p", { class: "text-tertiary" }, `No topics match "${learnSearchTerm}".`));
    return;
  }
  filtered.forEach((topic) => mount.append(renderTopicCard(topic)));
}

export function initLearn() {
  renderLearnList();
  const search = qs("#learn-search-input");
  if (search) {
    search.addEventListener("input", () => {
      learnSearchTerm = search.value;
      renderLearnList();
    });
  }
  qs("#learn-expand-all")?.addEventListener("click", () => qsa("#learn-list-mount details").forEach((d) => { d.open = true; }));
  qs("#learn-collapse-all")?.addEventListener("click", () => qsa("#learn-list-mount details").forEach((d) => { d.open = false; }));
  onLocaleChanged(renderLearnList);
}
