# Linux Permission Lab

**v2.12** — An interactive, browser-only playground for learning the Linux file permission model AND the system-investigation skills built on top of it — the owner/group/others triad, ACLs, SUID/SGID/sticky, plus process, log, service and network enumeration — through simulation, guided labs, challenges, state-checked terminal scenarios and quizzes rather than memorization.

No backend. No database. No login. No build step. Serve the folder with any static server and it runs (see *Installation* — browsers block ES modules on `file://`).

**[Live demo →](https://0xfuz.github.io/linux-permission-lab/)**

![CI](https://github.com/0xfuz/linux-permission-lab/actions/workflows/ci.yml/badge.svg)
![Deploy](https://github.com/0xfuz/linux-permission-lab/actions/workflows/deploy.yml/badge.svg)
![MIT License](https://img.shields.io/badge/license-MIT-blue)

The fastest way to see it is to open the live demo link above; screenshots below are a secondary reference.

---

## What's new

Latest: **v2.12** (v2.12.1 tightens the scenario validators: effective-ACL world-write detection, see CHANGELOG) — Hands-on scenarios under the Terminal: four challenges graded by the simulated filesystem state (not by a typed answer) and a first guided Investigation (evidence → diagnosis → fix → verify). Previously: **v2.11** — `find` with real syntax and `--help` for every command. Full history in [CHANGELOG.md](CHANGELOG.md).

---

## Features

- **Permission Simulator** — toggle owner/group/others read, write and execute like LED switches; symbolic, octal, binary and the `chmod` command all update live.
- **Fake Filesystem** — 62 files plus 2 symlinks across a realistic tree (`/etc/shadow`, `/etc/sudoers`, SSH keys, `database.conf`, `backup.sql`, `/var/www/uploads`, `/tmp`, service-account homes) with owner/group metadata.
- **Terminal Simulator** — a simulated shell supporting 47 commands with real permission enforcement, now including process/log/service/network investigation: `help`, `pwd`, `whoami`, `id`, `groups`, `su`, `sudo`, `exit`, `umask`, `ln -s`, `ls`/`ls -l`/`ls -la`, `cd`, `cat`, `tree`, `stat`, `find`, `grep`, `touch`, `mkdir`, `rm`, `mv`, `cp`, `nano`/`vim` (simulated notice), `chmod`, `chown`, `chgrp`, `getfacl`, `setfacl`, `ps`, `who`, `w`, `last`, `lastlog`, `uname`, `df`, `du`, `ss`/`netstat`, `systemctl`, `journalctl`, `dmesg`, `getcap`, `crontab`, `history`, `clear`. No real commands are ever executed.
- **Hands-on Scenarios (new in v2.12)** — a panel under the Terminal with four challenges and one guided Investigation. Opening a scenario loads its files into the *same* simulated filesystem under `/srv/lab/<id>` and moves your shell there. You fix it with real terminal commands; the verdict comes from asking the simulator what each account can now do (read/write/traverse, including ACLs), not from which command you typed — so any legitimate fix passes and an over-broad one (`chmod 777`, exposing a secret) is rejected. Passing fixes that are broader than necessary get an explicit "more permissive than necessary" note. Each scenario has progressive hints, a reset, and Arabic/English text. The Investigation walks *incident → evidence → diagnosis → fix → verify*: the diagnosis unlocks only after you have gathered the evidence, wrong diagnoses are answered from the live state, and you must re-check as the affected account to finish.
- **Permission Calculator** — type octal or symbolic notation in either direction, with one-click presets.
- **Security Analyzer** — every permission state is graded Safe, Warning or Critical with a plain-language explanation.
- **SUID / SGID / Sticky Visualizer** — what each special bit does, a real-world example, and its security implications.
- **Learn** — 21 topics (Permissions, Read/Write/Execute, Owner/Group/Others, Numeric, Symbolic, Binary, chmod, chown, chgrp, umask, ACL, Special File Attributes/chattr, SUID, SGID, Sticky Bit, Best Practices, Common Mistakes, su vs sudo, Escalation Risks, Secure File Permissions, Real-world Examples), each with a generated diagram, example, commands, tips and warnings. Expanding a topic marks it read, tracked toward the Guided Path.
- **Interactive Labs** — 11 guided multi-step walkthroughs mixing explanations with graded checkpoints.
- **Challenges** — 88 labs across four tiers, with hints, XP, and an explanation once solved.
- **Quiz** — 113 multiple-choice questions, filterable by topic, in 10-question rounds with instant feedback.
- **Achievements** — 13 badges (First chmod, Linux Apprentice, Challenge Hunter, Permission Master, SUID Explorer, Special Bits Master, Quiz Rookie, Perfect Score, Binary Expert, Lab Graduate, Well Rounded, Path Complete, Permission Legend).
- **Progress dashboard** — a Guided Path stepper (Learn → Labs → Challenges → Quiz) with a one-click "Continue" to the next unfinished phase, plus XP, level, per-module stats, a shareable/exportable JSON snapshot, an achievement grid, and a certificate that unlocks once every challenge and lab is complete.
- **Cheat Sheet** — searchable reference table, binary/octal breakdowns, special bits, common commands, troubleshooting guide, and best practices.

### Bonus features
Copy-to-clipboard for `chmod` commands · reset button · random challenge picker · light/dark theme toggle · keyboard shortcuts (`1`–`9` to jump between modules) · tooltips · toast notifications · full keyboard navigation · persistent progress via `localStorage`.

---

## Screenshots

Not included yet — the live demo above is the current source of truth for what the app looks like. If you're forking this: drop real captures into `docs/screenshots/` (a `simulator.png`, `learn.png`, `challenges.png`, `quiz.png` are a reasonable starting set) and restore a table here referencing them. Shipping broken image links is worse than shipping none, so this section stays text-only until real screenshots exist.

---

## Installation

No dependencies, no package manager, no build step.

```bash
git clone https://github.com/0xfuz/linux-permission-lab.git
cd linux-permission-lab
```

Then either:

- **Serve locally** (recommended — the app uses ES modules, which Chrome blocks over `file://`):

  ```bash
  python3 -m http.server 8080
  # then visit http://localhost:8080
  ```

  or with Node:

  ```bash
  npx serve .
  ```

- **Open directly** — double-click `index.html` only works in browsers that allow ES modules on `file://` (Firefox does; Chrome does not). When blocked, the page shows an on-screen notice.

---

## Deploying to GitHub Pages

Two ways to serve this repo on GitHub Pages — pick one, don't run both.

### Option A — Deploy from a branch (simplest, no CI gate)

1. Push this repository to GitHub.
2. In the repository, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to `Deploy from a branch`.
4. Choose the `main` branch and the `/ (root)` folder, then save.
5. GitHub Pages will publish the site at `https://<your-username>.github.io/linux-permission-lab/`.

With this option, **the live site is whatever is currently on `main`** — if you push a change and don't see it live, it means the push didn't happen yet, or Pages hasn't finished its (usually under a minute) rebuild. There's no automatic check that the site actually works before it goes live.

### Option B — GitHub Actions (`.github/workflows/deploy.yml`), test-gated

This repo ships a `deploy.yml` workflow that runs the full test suite on every push to `main` and **only deploys if all tests pass** — the live demo can't silently go stale or ship a broken build. To use it:

1. Push this repository to GitHub (including `.github/workflows/`).
2. Go to **Settings → Pages** and set **Source** to `GitHub Actions` (not "Deploy from a branch" — switch away from Option A if you'd previously set that up).
3. Push to `main`. The **CI** workflow (`ci.yml`) and **Deploy** workflow (`deploy.yml`) both run automatically — check the **Actions** tab for progress and the live URL once it finishes.
4. You can also trigger a redeploy manually from the Actions tab (`workflow_dispatch`) without a new commit — useful if Pages ever needs a kick without a code change.

No build step either way. Option B publishes only `index.html` and `assets/` plus `LICENSE` (the workflow stages them into a `_site/` folder first), so tests, screenshots and CI files don't ship to the live site.

---

## Project structure

```
linux-permission-lab/
├── index.html
├── README.md
├── LICENSE
└── assets/
    ├── css/
    │   ├── main.css          # design tokens, resets, base typography
    │   ├── layout.css        # app shell, sidebar, hero, grid regions
    │   ├── components.css    # buttons, LED toggles, badges, tooltips, toasts, modal, quiz options, author credit
    │   ├── cards.css         # feature cards, filesystem tree, challenge cards, learn cards, achievement badges, cheat sheet
    │   ├── terminal.css      # terminal window chrome and typing UI
    │   ├── scenarios.css     # v2.12 — Hands-on scenarios panel (stepper, checks, diagnosis radios, .sr-only)
    │   ├── animations.css    # keyframes and motion utility classes
    │   ├── responsive.css    # tablet and mobile breakpoints
    │   └── rtl.css           # RTL layout overrides for Arabic
    └── js/
        ├── app.js              # routing, theme/language toggle, cheat sheet, shortcuts, bootstrapping
        ├── i18n.js             # locale state, UI-string dictionary, RTL switching, static-DOM translation
        ├── converter.js        # symbolic ⇄ octal ⇄ binary math (single source of truth)
        ├── simulator.js        # Module 1 — permission editor + live output
        ├── filesystem.js       # Module 2 — fake filesystem tree (62 files + 2 symlinks) + path resolution
        ├── terminal.js         # Module 3 — simulated shell: prompt, dispatch table, tab completion, DOM wiring (288 lines, orchestration only as of v2.10; v2.12 adds a command-observer hook)
        ├── terminal-state.js         # live session state — cwd, current user, su stack, sudo cache (pure)
        ├── terminal-helpers.js       # printLine, path resolution, shared deny/visibility logic
        ├── terminal-commands-nav.js      # ls/cd/cat/tree/stat/find/grep/touch/mkdir/rm/mv/cp/ln/editor
        ├── terminal-commands-perm.js     # chmod/chown/chgrp/getfacl/setfacl/umask
        ├── terminal-commands-identity.js # id/groups/su/exit/sudo
        ├── terminal-commands-sysinfo.js  # ps/who/w/last/lastlog/uname/df/du/ss/systemctl/journalctl/dmesg/getcap/crontab
        ├── scenarios.js / scenarios-data.js / scenarios-data.ar.js  # v2.12 — Hands-on scenarios panel (pure view builders + controller), challenge + investigation data, Arabic overlay
        ├── scenario-progress.js        # v2.12 — completion/XP persistence (own localStorage key, backward compatible)
        ├── calculator.js       # Module 4 — standalone converter UI
        ├── security.js         # Module 5 — security analyzer
        ├── visualizer.js       # Module 6 — SUID/SGID/sticky explainer
        ├── learn.js / learn.ar.js             # Module 9 — 21-topic curriculum + Arabic overlay
        ├── labs.js / labs-data.js / labs-data.ar.js       # Module 10 — interactive labs + Arabic overlay
        ├── challenges.js / challenges-data.js / challenges-data.ar.js   # Module 7 — 88 challenges + Arabic overlay
        ├── quiz.js / quiz-data.js / quiz-data.ar.js       # Module 8 — 113 quiz questions + Arabic overlay
        ├── cheatsheet-data.ar.js  # Arabic overlay for the octal-mode cheat sheet table
        ├── terminal-commands-data.js / terminal-commands-data.ar.js  # all 47 terminal commands reference + Arabic overlay
        ├── engine/
        │   ├── users.js        # users/groups, access-control rules, sticky bit, umask math (pure)
        │   ├── links.js        # ln -s placement rules (pure)
        │   ├── acl.js          # ACL mask math (pure)
        │   ├── fs-model.js     # tree lookup + symlink write-target rule (pure)
        │   ├── scenario.js     # v2.12 — grafts a scenario into the shared FS_TREE, state checks, hint + challenge sessions (pure)
        │   ├── investigation.js # v2.12 — evidence → diagnosis → fix → verify state machine (pure)
        │   ├── sysinfo.js      # processes/services/sockets/journal/sessions/disk — static data + filters (pure)
        │   ├── complete.js     # tab-completion matching rules (pure)
        │   ├── shell-parse.js  # quote-aware tokenizer + safe file-name rules (pure)
        │   └── safe-html.js    # escapeHTML + terminal output sanitizer (pure)
        ├── boot-lang.js        # pre-paint lang/dir (classic script; was inline before the CSP)
        ├── boot-fallback.js    # file:// module-blocked notice (classic script)
        ├── achievements.js     # derived achievement/badge computation
        ├── progress.js         # Module 12 — XP/level dashboard + certificate
        └── utils.js            # shared DOM, storage, clipboard, toast and progress-event helpers
```

---

## Tech stack

HTML5 · CSS3 (custom properties, Flexbox, Grid) · Vanilla JavaScript (ES6 modules). No frameworks, no bundler, no dependencies to install.

---

## Accessibility

- Semantic landmarks (`nav`, `main`, `aside`) and heading hierarchy throughout.
- Every interactive control has an accessible name (`aria-label`, `aria-pressed`, or visible text).
- Visible focus rings on every focusable element; `prefers-reduced-motion` is respected.
- Colour choices maintain sufficient contrast against the dark background; severity badges pair colour with text labels, never colour alone.

---

## Roadmap

- [x] Add an `ln -s` / symlink permission scenario to the filesystem module
- [x] Export challenge/quiz/lab progress as a shareable JSON badge
- [x] A guided "path" mode that sequences Learn → Labs → Challenges → Quiz per topic
- [x] Add ACL (`getfacl`/`setfacl`) as a fully interactive terminal command, not just a Learn topic
- [x] Multiple users in the terminal (`su`/`sudo`) with real permission enforcement, `umask`, `ln -s`
- [x] System-investigation commands (`ps`, `journalctl`, `ss`, `systemctl`, `getcap`, `find -perm`, `crontab -l`, `sudo -l`, …)
- [x] Tab completion in the terminal (v2.9)
- [x] Localize the Learn curriculum and the terminal *command reference* (Arabic overlays). Terminal *output* stays English on purpose — it quotes what a real shell prints.
- [x] Terminal-aware challenges that verify the simulated state instead of a form answer (v2.12: 4 challenges)
- [x] Investigation Mode foundation — a reusable evidence → diagnosis → fix → verify framework with one scenario (v2.12)
- [ ] More Investigation scenarios on the v2.12 framework (writable cron script, sudo NOPASSWD, a leaked SUID helper) plus matching Learn content
- [ ] Group-membership commands (`usermod -aG`, `gpasswd`, `newgrp`) so membership problems can be fixed in the terminal, not just preset
- [ ] Pipes and redirection (`ls -l | grep conf`, `echo x > file`)
- [ ] Verify the scenarios' expected behaviour against a real Linux system and publish the comparison (not done in v2.12 — see *Simulation scope*)

---

## Simulation scope and verification status

Linux Permission Lab is a **teaching simulation**, not Linux. Every command runs against an in-memory model in your browser — nothing touches your machine — and the model implements the *rules* the lessons teach: owner/group/others classes, directory search (`x`) along the path, named-ACL entries and mask, sticky/SUID/SGID, ownership-change rules, `umask`, symlink targets.

- **What is tested:** the 582 automated tests check the *simulator's* behaviour against the rules as the simulator implements them, including every scenario's accepted and rejected fixes. That makes the lab internally consistent; it does **not** prove byte-for-byte equivalence with a real kernel.
- **What was not done:** the v2.12 scenarios and their expected outcomes were **not** cross-checked on a real Linux machine in this release. The behaviours they rely on (traversal needing `x` on every parent directory, owner-only `chmod`, `chgrp` limited to groups you belong to or `sudo`, a named ACL entry needing `x` on the directory above) are standard POSIX/ACL semantics, but treat the lab as a model, not a reference implementation.
- **Known simulator differences relevant to scenarios:** the ACL model has only named user/group entries and the mask — there is no separate `other::` entry (the others class is the mode bits);  the ACL mask is always recalculated as the union of the group bits and the named entries, so the real-world "`chmod` silently masks a named ACL entry" trap cannot be reproduced; there are no group-membership commands (scenarios can only *preset* memberships); `ls -d` and `namei` are not implemented (`ls -l <dir>` lists its children); output and live evidence text are English even in the Arabic UI (labels, tasks, hints and explanations are translated); only one scenario is active at a time, and an in-progress scenario is not restored after a page reload (only completions are saved).
- **Scoring:** scenario completion adds its XP to your total and appears in the exported progress snapshot (`scenarios`, `xpBreakdown.scenarios`). Scenarios do not gate the certificate.

---

## Contributing

Issues and pull requests are welcome. This is a fully open-source project — MIT licensed, dependency-free, no build step, so anyone can fork and deploy their own copy.

- New **challenges** go in `assets/js/challenges-data.js`, following the existing `c(id, tier, xp, title, scenario, description, target, hints, explanation)` shape.
- New **quiz questions** go in `assets/js/quiz-data.js`, following the `q(id, topic, question, options, answerIndex, explanation)` shape.
- New **scenarios** (state-checked challenges and investigations) go in `assets/js/scenarios-data.js` — see *Authoring scenarios* below.
- New **labs** go in `assets/js/labs-data.js`, chaining `answerStep()` and `infoStep()` calls inside a `lab()`.
- New **Learn topics** go in `assets/js/learn.js`'s `LEARN_TOPICS` array — reuse an existing diagram builder (`triadDiagram`, `octalDiagram`, `bitPositionDiagram`, `beforeAfterDiagram`, `gaugeDiagram`) rather than inventing a new one unless genuinely necessary.

If you're touching the design tokens in `assets/css/main.css`, keep the amber/cyan/security-semantic separation described in that file's header comment — the security badge colours (`--safe-500`, `--warn-500`, `--crit-500`) are reserved for the Security Analyzer and shouldn't be reused decoratively.

---

## License

Released under the [MIT License](LICENSE) — free to use, modify and deploy for learning or teaching.

---

## Credits

**Created by [0x0MAr](https://github.com/0xfuz)**

- GitHub: [github.com/0xfuz](https://github.com/0xfuz)
- X / Twitter: [x.com/_7pwn](https://x.com/_7pwn)
- Instagram: [instagram.com/0xfuz](https://instagram.com/0xfuz) · [instagram.com/_7pwn](https://instagram.com/_7pwn)

---

## Disclaimer

This project teaches defensive understanding of the Linux permission model. It does not include, link to, or endorse any offensive or exploitation tooling — the SUID/SGID/sticky explanations, and every Advanced/Expert-tier challenge involving them, are deliberately limited to *what the bits do and how to reason about their risk*, not how to weaponize them.

---

## Authoring scenarios

A scenario is plain data in `assets/js/scenarios-data.js`, graded by the simulated state. Build it from the helpers in `assets/js/engine/scenario.js`:

```js
{
  id: "tc05", kind: "challenge", xp: 100,          // unique id (not an existing challenge id)
  title: "…", objectives: ["…", "…"],              // what the learner should be able to do afterwards
  task: "…",                                       // states the goal AND the constraints (who may / may not get access)
  build: () => [                                   // FRESH nodes every call → deterministic reset
    dir("conf", "750", [ file("app.yml", "640", { acl: [{ type: "user", id: "monitoring", perms: "r--" }] }) ]),
  ],                                               // lives under /srv/lab/tc05; optional: users, startAs, startDir
  checks: [                                        // judged on the live state, never on typed text
    canAccess("reads", "monitoring", "/srv/lab/tc05/conf/app.yml", "r"),          // includes traversal
    cannotAccess("no-write", "monitoring", "/srv/lab/tc05/conf/app.yml", "w"),    // fails if the file was deleted
    othersCannot("others", "/srv/lab/tc05/conf/app.yml", "r", ["user", "monitoring"]),
    noWorldWriteUnder("no-777", "/srv/lab/tc05"),
    modeWithin("tight", "/srv/lab/tc05/conf", "750", { level: "advisory" }),      // advisory = "works, but broader than necessary"
  ],
  hints: ["least revealing…", "…", "most revealing"],   // at least three, in order
  completion: "Why the fix works, and why the broader alternatives are worse.",
}
```

Guidelines: describe the *end state and constraints*, not a command; make each label say exactly what its check enforces (`modeWithin` compares mode bits only — use `accessWithin` for claims about what accounts can do, and `noWorldWriteUnder`/`othersCannot` already count ACL entries); include at least one `required` check that rules out the lazy fix (`chmod 777`, deleting the file, exposing a secret); use `advisory` checks to teach least privilege; never recommend `chmod 777` in a hint. For an investigation also provide `incident`, `evidence[]` (`matches(ev)` + `finding()` that quotes the real state), `diagnoses[]` (exactly one `correct`; every `explain()` should read the live state), per-phase `hints`, `verify(ev)` and `summarize()`.

Then: (1) add the Arabic entry to `scenarios-data.ar.js` (same array lengths, same check/evidence/diagnosis ids — `tests/regression/scenarios-i18n.test.js` enforces this); (2) add at least one accepted fix to `SOLUTIONS` and the tempting-but-wrong ones to `SHORTCUTS` in `tests/regression/scenarios.test.js`; (3) run `npm test`.
