# Linux Permission Lab

**v2.3** — An interactive, browser-only playground for learning the Linux file permission model — the owner/group/others triad, octal and symbolic notation, ownership, ACLs, and the SUID/SGID/sticky special bits — through simulation, guided labs, challenges and quizzes rather than memorization.

No backend. No database. No login. No build step. Open `index.html` and it runs.

**[Live demo →](https://0xfuz.github.io/linux-permission-lab/)**

![CI](https://github.com/0xfuz/linux-permission-lab/actions/workflows/ci.yml/badge.svg)
![Deploy](https://github.com/0xfuz/linux-permission-lab/actions/workflows/deploy.yml/badge.svg)
![MIT License](https://img.shields.io/badge/license-MIT-blue)

The fastest way to see it is to open the live demo link above; screenshots below are a secondary reference.

---

## What's new in v2.3

- **Content expansion** — 2 new Learn topics (Special File Attributes/chattr, su vs sudo), 13 new Quiz questions (ACL mask math, Symlinks, chattr, su vs sudo), 1 new Advanced-tier Lab ("Grant Access Without Groups"), and 8 new Challenges (2 per tier) — all tying back into the ACL and symlink features above, fully bilingual. Totals are now 21 Learn topics, 113 Quiz questions, 11 Labs, and 88 Challenges.
- **Guided Path** — a new stepper on the Progress dashboard sequencing Learn → Labs → Challenges → Quiz, with a "Continue" button that jumps straight to your next unfinished phase (and, for Learn, your next unread topic). Expanding a Learn topic now marks it read; a new 13th achievement, Path Complete, unlocks once every phase is done.
- **Interactive ACL** — `getfacl`/`setfacl` are now real terminal commands, not just a Learn topic: add or remove named user/group entries, watch the mask auto-recalculate exactly like real POSIX ACLs, and see the classic `+` suffix appear in `ls -l`/`stat` (the app's config file ships with one seeded example to explore).
- **Symlink permission scenario** — 2 annotated symlinks in the fake filesystem (a benign relative link, and a link inside world-writable `/tmp` pointing at a restricted log) teaching that a symlink's own mode is always cosmetic `777`; `ls -l`/`stat` display it correctly, and `cat`/`chmod`/`chown`/`chgrp` all follow the link to its real target, exactly like the real commands do without `-h`.
- **Shareable/exportable progress** — a new panel on the Progress dashboard to copy a one-line shareable summary or download a full JSON snapshot (level, XP, per-module completion, achievements) of your local progress.
- **Redesigned home page** — a real-numbers stats bar in the hero, a "How it works" (Learn → Practice → Prove it) section, elevated feature-card hover states, and a proper multi-column footer.
- Both new features are fully bilingual (English/Arabic) UI chrome; the new terminal help text follows the existing scope note and stays English-only.

## What's new in v2.2

- **Full Arabic (العربية) translation** with a one-click language toggle in the sidebar — persists across visits.
- **RTL layout** — the sidebar, navigation, cards and forms all mirror correctly under `dir="rtl"`, while code/commands/terminal output stay left-to-right since shell syntax is universal.
- Every UI string, all 19 Learn topics, all 10 Labs, all 80 Challenges, all 100 Quiz questions, all 12 Achievements, and the Cheat Sheet reference table are translated.
- Arabic uses the Cairo typeface; English keeps the existing Space Grotesk/Inter/JetBrains Mono stack.
- Scope note: the Cheat Sheet's supplementary troubleshooting prose/best-practice list and the terminal's `help` text remain English-only in this release — see the Roadmap.

## What's new in v2.1

- **21 Learn topics** — a full reference curriculum with diagrams, examples, command references, tips and warnings
- **11 Interactive Labs** — guided, multi-step walkthroughs from a first SSH key fix to a capstone permission audit and an ACL-based access grant
- **88 Challenges** — 22 each across Beginner / Intermediate / Advanced / Expert
- **113-question Quiz** — multiple-choice rounds across every topic, with instant explanations
- **Achievements** — 13 unlockable badges derived from your actual progress
- **Progress dashboard** — XP, levels, stats, and a printable certificate once you clear the curriculum
- **Expanded fake filesystem** — 59 files across `/etc`, `/var`, `/opt`, `/usr`, `/tmp`, `/home`, `/root`, now with owner/group metadata
- **Expanded terminal** — `find`, `grep`, `touch`, `mkdir`, `rm`, `mv`, `cp`, `tree`, `stat`, `id`, `groups`, `chown`, `chgrp`, `ls -la`, simulated `nano`/`vim`
- **Author credit** — footer, hero badge and a full About-the-author section, none of it intrusive

Every original v1 feature (Simulator, Filesystem, Calculator, Terminal, Challenges, Cheat Sheet, About, Security Analyzer, SUID/SGID/Sticky visualizer) is unchanged in behavior and still fully functional.

---

## Features

- **Permission Simulator** — toggle owner/group/others read, write and execute like LED switches; symbolic, octal, binary and the `chmod` command all update live.
- **Fake Filesystem** — 59 files plus 2 symlinks across a realistic tree (`/etc/shadow`, `/etc/sudoers`, SSH keys, `database.conf`, `backup.sql`, `/var/www/uploads`, `/tmp`, service-account homes) with owner/group metadata.
- **Terminal Simulator** — a simulated shell supporting 27 commands: `help`, `pwd`, `whoami`, `id`, `groups`, `ls`/`ls -l`/`ls -la`, `cd`, `cat`, `tree`, `stat`, `find`, `grep`, `touch`, `mkdir`, `rm`, `mv`, `cp`, `nano`/`vim` (simulated notice), `chmod`, `chown`, `chgrp`, `getfacl`, `setfacl`, `history`, `clear`. No real commands are ever executed.
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

- **Open directly** — double-click `index.html`. If your browser blocks ES module scripts over `file://` (Chrome does), the page shows an on-screen notice with the fix.
- **Serve locally** (recommended):

  ```bash
  python3 -m http.server 8080
  # then visit http://localhost:8080
  ```

  or with Node:

  ```bash
  npx serve .
  ```

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

No build step either way — the repository root is the deployable site as-is.

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
    │   ├── animations.css    # keyframes and motion utility classes
    │   ├── responsive.css    # tablet and mobile breakpoints
    │   └── rtl.css           # RTL layout overrides for Arabic
    └── js/
        ├── app.js              # routing, theme/language toggle, cheat sheet, shortcuts, bootstrapping
        ├── i18n.js             # locale state, UI-string dictionary, RTL switching, static-DOM translation
        ├── converter.js        # symbolic ⇄ octal ⇄ binary math (single source of truth)
        ├── simulator.js        # Module 1 — permission editor + live output
        ├── filesystem.js       # Module 2 — fake filesystem tree (59 files + 2 symlinks) + path resolution
        ├── terminal.js         # Module 3 — simulated shell (27 commands)
        ├── calculator.js       # Module 4 — standalone converter UI
        ├── security.js         # Module 5 — security analyzer
        ├── visualizer.js       # Module 6 — SUID/SGID/sticky explainer
        ├── learn.js / learn.ar.js             # Module 9 — 21-topic curriculum + Arabic overlay
        ├── labs.js / labs-data.js / labs-data.ar.js       # Module 10 — interactive labs + Arabic overlay
        ├── challenges.js / challenges-data.js / challenges-data.ar.js   # Module 7 — 88 challenges + Arabic overlay
        ├── quiz.js / quiz-data.js / quiz-data.ar.js       # Module 8 — 113 quiz questions + Arabic overlay
        ├── cheatsheet-data.ar.js  # Arabic overlay for the cheat sheet reference table
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
- [ ] Localize the terminal simulator's command list and Learn content

---

## Contributing

Issues and pull requests are welcome. This is a fully open-source project — MIT licensed, dependency-free, no build step, so anyone can fork and deploy their own copy.

- New **challenges** go in `assets/js/challenges-data.js`, following the existing `c(id, tier, xp, title, scenario, description, target, hints, explanation)` shape.
- New **quiz questions** go in `assets/js/quiz-data.js`, following the `q(id, topic, question, options, answerIndex, explanation)` shape.
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
