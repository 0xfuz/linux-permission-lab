# Linux Permission Lab

**v2.1** — An interactive, browser-only playground for learning the Linux file permission model — the owner/group/others triad, octal and symbolic notation, ownership, ACLs, and the SUID/SGID/sticky special bits — through simulation, guided labs, challenges and quizzes rather than memorization.

No backend. No database. No login. No build step. Open `index.html` and it runs.

**[Live demo →](#)** *(replace with your GitHub Pages URL after deploying)*

![Linux Permission Lab hero screenshot placeholder](docs/screenshots/hero.png)

---

## What's new in v2.2

- **Full Arabic (العربية) translation** with a one-click language toggle in the sidebar — persists across visits.
- **RTL layout** — the sidebar, navigation, cards and forms all mirror correctly under `dir="rtl"`, while code/commands/terminal output stay left-to-right since shell syntax is universal.
- Every UI string, all 19 Learn topics, all 10 Labs, all 80 Challenges, all 100 Quiz questions, all 12 Achievements, and the Cheat Sheet reference table are translated.
- Arabic uses the Cairo typeface; English keeps the existing Space Grotesk/Inter/JetBrains Mono stack.
- Scope note: the Cheat Sheet's supplementary troubleshooting prose/best-practice list and the terminal's `help` text remain English-only in this release — see the Roadmap.

## What's new in v2.1

- **19 Learn topics** — a full reference curriculum with diagrams, examples, command references, tips and warnings
- **10 Interactive Labs** — guided, multi-step walkthroughs from a first SSH key fix to a capstone permission audit
- **80 Challenges** — expanded from 6 to 20 each across Beginner / Intermediate / Advanced / Expert
- **100-question Quiz** — multiple-choice rounds across every topic, with instant explanations
- **Achievements** — 12 unlockable badges derived from your actual progress
- **Progress dashboard** — XP, levels, stats, and a printable certificate once you clear the curriculum
- **Expanded fake filesystem** — 59 files across `/etc`, `/var`, `/opt`, `/usr`, `/tmp`, `/home`, `/root`, now with owner/group metadata
- **Expanded terminal** — `find`, `grep`, `touch`, `mkdir`, `rm`, `mv`, `cp`, `tree`, `stat`, `id`, `groups`, `chown`, `chgrp`, `ls -la`, simulated `nano`/`vim`
- **Author credit** — footer, hero badge and a full About-the-author section, none of it intrusive

Every original v1 feature (Simulator, Filesystem, Calculator, Terminal, Challenges, Cheat Sheet, About, Security Analyzer, SUID/SGID/Sticky visualizer) is unchanged in behavior and still fully functional.

---

## Features

- **Permission Simulator** — toggle owner/group/others read, write and execute like LED switches; symbolic, octal, binary and the `chmod` command all update live.
- **Fake Filesystem** — 59 files across a realistic tree (`/etc/shadow`, `/etc/sudoers`, SSH keys, `database.conf`, `backup.sql`, `/var/www/uploads`, `/tmp`, service-account homes) with owner/group metadata.
- **Terminal Simulator** — a simulated shell supporting 25 commands: `help`, `pwd`, `whoami`, `id`, `groups`, `ls`/`ls -l`/`ls -la`, `cd`, `cat`, `tree`, `stat`, `find`, `grep`, `touch`, `mkdir`, `rm`, `mv`, `cp`, `nano`/`vim` (simulated notice), `chmod`, `chown`, `chgrp`, `history`, `clear`. No real commands are ever executed.
- **Permission Calculator** — type octal or symbolic notation in either direction, with one-click presets.
- **Security Analyzer** — every permission state is graded Safe, Warning or Critical with a plain-language explanation.
- **SUID / SGID / Sticky Visualizer** — what each special bit does, a real-world example, and its security implications.
- **Learn** — 19 topics (Permissions, Read/Write/Execute, Owner/Group/Others, Numeric, Symbolic, Binary, chmod, chown, chgrp, umask, ACL, SUID, SGID, Sticky Bit, Best Practices, Common Mistakes, Escalation Risks, Secure File Permissions, Real-world Examples), each with a generated diagram, example, commands, tips and warnings.
- **Interactive Labs** — 10 guided multi-step walkthroughs mixing explanations with graded checkpoints.
- **Challenges** — 80 labs across four tiers, with hints, XP, and an explanation once solved.
- **Quiz** — 100 multiple-choice questions, filterable by topic, in 10-question rounds with instant feedback.
- **Achievements** — 12 badges (First chmod, Linux Apprentice, Challenge Hunter, Permission Master, SUID Explorer, Special Bits Master, Quiz Rookie, Perfect Score, Binary Expert, Lab Graduate, Well Rounded, Permission Legend).
- **Progress dashboard** — XP, level, per-module stats, achievement grid, and a certificate that unlocks once every challenge and lab is complete.
- **Cheat Sheet** — searchable reference table, binary/octal breakdowns, special bits, common commands, troubleshooting guide, and best practices.

### Bonus features
Copy-to-clipboard for `chmod` commands · reset button · random challenge picker · light/dark theme toggle · keyboard shortcuts (`1`–`9` to jump between modules) · tooltips · toast notifications · full keyboard navigation · persistent progress via `localStorage`.

---

## Screenshots

| Simulator | Learn | Challenges | Quiz |
|---|---|---|---|
| ![Simulator](docs/screenshots/simulator.png) | ![Learn](docs/screenshots/learn.png) | ![Challenges](docs/screenshots/challenges.png) | ![Quiz](docs/screenshots/quiz.png) |

*(Screenshots are placeholders — replace the files in `docs/screenshots/` with your own captures.)*

---

## Installation

No dependencies, no package manager, no build step.

```bash
git clone https://github.com/0x0Mr/linux-permission-lab.git
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

1. Push this repository to GitHub.
2. In the repository, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to `Deploy from a branch`.
4. Choose the `main` branch and the `/ (root)` folder, then save.
5. GitHub Pages will publish the site at `https://<your-username>.github.io/linux-permission-lab/`.

No build step is required — the repository root is the deployable site.

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
        ├── filesystem.js       # Module 2 — fake filesystem tree (59 files) + path resolution
        ├── terminal.js         # Module 3 — simulated shell (25 commands)
        ├── calculator.js       # Module 4 — standalone converter UI
        ├── security.js         # Module 5 — security analyzer
        ├── visualizer.js       # Module 6 — SUID/SGID/sticky explainer
        ├── learn.js / learn.ar.js             # Module 9 — 19-topic curriculum + Arabic overlay
        ├── labs.js / labs-data.js / labs-data.ar.js       # Module 10 — interactive labs + Arabic overlay
        ├── challenges.js / challenges-data.js / challenges-data.ar.js   # Module 7 — 80 challenges + Arabic overlay
        ├── quiz.js / quiz-data.js / quiz-data.ar.js       # Module 8 — 100 quiz questions + Arabic overlay
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

- [ ] Add an `ln -s` / symlink permission scenario to the filesystem module
- [ ] Export challenge/quiz/lab progress as a shareable JSON badge
- [ ] A guided "path" mode that sequences Learn → Labs → Challenges → Quiz per topic
- [ ] Add ACL (`getfacl`/`setfacl`) as a fully interactive terminal command, not just a Learn topic
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

**Created by [0x0MAr](https://github.com/0x0Mr)**

- GitHub: [github.com/0x0Mr](https://github.com/0x0Mr)
- X / Twitter: [x.com/_7pwn](https://x.com/_7pwn)
- Instagram: [instagram.com/0xfuz](https://instagram.com/0xfuz) · [instagram.com/_7pwn](https://instagram.com/_7pwn)

---

## Disclaimer

This project teaches defensive understanding of the Linux permission model. It does not include, link to, or endorse any offensive or exploitation tooling — the SUID/SGID/sticky explanations, and every Advanced/Expert-tier challenge involving them, are deliberately limited to *what the bits do and how to reason about their risk*, not how to weaponize them.
