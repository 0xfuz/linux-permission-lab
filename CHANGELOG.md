# Changelog

All notable changes, newest first.

## v2.12.1

A focused review of the scenario validators (`engine/scenario.js`) for places where a check's label promised more than it enforced. No new features; no existing test changed.

- **`noWorldWriteUnder()` now judges effective access, not just the mode.** It read only the "others" write bit, so named ACL entries that let *every* account write (`u:alice:rw-`, `u:monitoring:rw-`, … or a group everyone belongs to) passed it — e.g. tc01 could be "solved" with the lab effectively world-writable. It now also flags a node that every account other than its owner can write (after the ACL mask). An ACL for only *some* accounts is still fine: that is targeted access, which `othersCannot()` covers.
- **The reported `other::w` variant is not reachable in this model, and is now pinned by tests:** there is no `other::` ACL entry (`setfacl` accepts only `u:`/`g:` and rejects `o::`, `other::`, `m::`; the access engine ignores any other entry type), so the "others" class *is* the mode bits the check already read. A planted `other` entry can neither grant access nor hide a world-writable mode.
- **New `accessWithin()` helper; inv01's "no more permissive than 711" advisory uses it.** `modeWithin()` compares mode bits only, so `u:www-data:rwx` on a 700 `current/` read as "minimal". `accessWithin()` compares what each account can actually do against a plain mode. `modeWithin()` is unchanged apart from a default label that now says "mode", and tc04's "own mode was not widened" advisory keeps it (its label is mode-specific).
- **tc04 now enforces what its task says.** The task says `monitoring` must not write to or list the directory, but only listing was checked, so `setfacl -m u:monitoring:-wx conf` solved it. New required check `no-dir-write` (translated).
- **Two labels that overclaimed were corrected:** inv01 `keep-file` ("…with unchanged content bits" — it only checks the file exists) and tc01's task ("the least permissive mode" — any mode with the same effective access is accepted, which is the intended state-based behaviour); both languages.
- **Tests: 541 → 582** (+41, `tests/engine/scenario-validators.test.js`). Run against the v2.12.0 sources, the regression tests fail (as intended); the "legitimate ACL still passes" and "no `other::` entry" tests pass on both.
- Reviewed and left unchanged (label and enforcement agree): `canAccess`, `cannotAccess`, `othersCannot` (effective, includes ACLs; root is excluded because it bypasses checks), `modeWithin` (bits only, now labelled as such), `ownerIs`, and the tc02/tc03 checks.

## v2.12.0

**Interactive Security Challenges foundation.** The lab can now judge what you *did* to the simulated system, not what you typed.

- **State-based scenarios (new `engine/scenario.js`).** A scenario's files are grafted into the *same* `FS_TREE` the terminal already uses, under `/srv/lab/<id>` (no second simulator). Validation is a list of checks that ask the existing access engine what each account can do — traversal, ownership, group, named ACLs, world-writability — so any legitimate fix passes and shortcuts (`chmod 777`, deleting the file, exposing a secret file) do not. `required` checks decide pass/fail; `advisory` checks add a "works, but more permissive than necessary" note.
- **Four challenges:** lock down a leaked deploy key (mode/ownership), directory `r` vs `x`, a wrong group on a shared report (fix with `chgrp` *or* one ACL entry), and an ACL on a file that is still unreachable because the directory lacks `--x` for that account.
- **Investigation Mode foundation (new `engine/investigation.js`).** A reusable state machine — briefing → evidence → diagnosis → fix → verify → resolved. Evidence is recognised from what the learner actually ran in the terminal (via a new `setCommandObserver` hook; `sudo`/`su` are attributed correctly), the diagnosis unlocks only when the required evidence exists, wrong diagnoses are answered from the live state, the fix is judged by state, and the case closes only after re-checking as the affected account. First scenario: *"the site returns 403 after a deploy"* (the file's own mode is fine — a deploy left a 700 directory on the path — and a secrets file beside it must stay private).
- **Hands-on scenarios panel under the Terminal.** Objectives, task, live success criteria (✓/✗ with the reason a check failed), progressive hints (per phase for investigations), reset, completion explanation, EN/AR. Built entirely from text nodes; announces results through a polite live region; native buttons and a real `fieldset`/`legend` radio group for the diagnosis.
- **Progress:** completions are stored under a new `scenarioProgress` key (older saved state without it loads unchanged), XP counts toward the total, the exported snapshot gains `scenarios` and `xpBreakdown.scenarios`, and *Reset all progress* clears it.
- **Small changes to existing code:** `filesystem.js` exports `assignPaths`; `terminal.js` gains the observer hook, `refreshTerminalPrompt()` and `terminalNotice()`; `progress.js` includes scenario XP. No command's behaviour and no existing test changed.
- **Docs corrected:** the filesystem has **62** files + 2 symlinks, not 59 (README, home card, EN/AR strings); tab completion (v2.9) is no longer listed as open on the roadmap; added a *Simulation scope and verification status* section and *Authoring scenarios* instructions.
- **Tests: 373 → 541** (+168): `engine/scenario`, `engine/investigation`, `regression/scenarios` (data invariants, 12 accepted fixes, 18 rejected shortcuts, observer hook, progress + backward compatibility), `regression/scenarios-ui` (unsafe-content rendering, keyboard/ARIA structure, full controller flows driven through a new `helpers/ui-harness.js`), `regression/scenarios-i18n`.
- **Not done / limits:** not cross-checked against a real Linux system; no real-browser visual or responsive review was possible in the build environment (see README *Simulation scope*).

## v2.11.0

- **`find [path] -name <pattern> [-type f|d]`** — the real find syntax, scoped to a path exactly like `-perm` already was. The old bare `find <name>` keeps working as a shorthand (real find has no such form — a bare word is a path, not a pattern — but enough tutorials use it that dropping it would have broken muscle memory for no real gain).
- **`<command> --help` / `-h` now works for all 47 commands** — one generic check in `dispatch()`, not 47 individual ones. It reuses the exact TERMINAL_COMMANDS data the Cheat Sheet's reference table is built from, so the terminal's own `--help` and the Cheat Sheet can never drift apart on what a flag does. A command with more than one documented form (`find`, `sudo`) shows all of them; aliases (`netstat`, `logout`, `vim`) resolve to the row that actually documents them; `--help` bypasses the command's own permission gate, same as real `--help` flags do.
- 15 new tests covering both.

## v2.10.0

A maintenance release addressing feedback from a fresh review of the whole project (user/engineer/PM perspectives): a missing way to start over, a documentation self-contradiction, and a file that had outgrown itself.

- **"Reset all progress" on the Progress page.** There was no way to clear Challenges/Labs/Quiz/read-topic progress short of clearing `localStorage` by hand in devtools — no in-app path existed at all. The new danger-zone panel clears exactly that (XP, level and achievements included, since they're derived from the same data) while leaving your language and theme preference untouched, behind a confirm dialog since it can't be undone.
- **`terminal.js` split from 1057 lines into 7 focused files.** It had grown command-group by command-group across several releases (users, umask, system investigation, the Arch redesign, tab completion) without ever being reorganized. Now: `terminal-state.js` (session state — cwd, current user, su stack, sudo cache), `terminal-helpers.js` (printLine, path resolution, the shared deny/visibility logic), `terminal-commands-{nav,perm,identity,sysinfo}.js` (one file per command family), and `terminal.js` itself down to 267 lines of pure orchestration — the prompt, the dispatch table, tab completion, and DOM wiring. No behavior changed; same 358 tests, now passing against the split files instead of the monolith.
- **Removed `docs/screenshots/`.** The folder still held six images from before the terminal's Arch redesign, while the README already (correctly) said "not included yet" — a real self-contradiction between what the repo claimed and what it actually shipped. Deleted rather than updated, consistent with the README's own stated reasoning: shipping stale screenshots is worse than shipping none.

## v2.9.0

Hardening and terminal ergonomics. No new lessons; the 47 commands are unchanged.

- **Tab completion in the terminal.** Press Tab to complete a command name or a path. A unique match completes (directories get a trailing `/`); several matches extend to their common prefix, and a second Tab on an unchanged line lists the options. Completion only offers what the current user could actually `ls` — an unreadable directory completes nothing — hides dotfiles unless you type a leading `.`, and refuses lines containing quotes. Logic lives in the pure `engine/complete.js`.
- **No more interpolated `innerHTML`.** Challenge/Lab feedback, challenge hints and the simulator's command line are now built as DOM nodes (new `utils.setFeedback`) instead of template strings, and the inline `style="color:…"` they used moved to `.feedback-*` classes. A new `dom-safety` test fails the build if an interpolated template literal is assigned to `innerHTML` or passed as `html:` anywhere except the sanitized terminal printer.
- **GitHub Pages now publishes only the site** (`index.html`, `LICENSE` + `assets/`), not the tests, screenshots and workflow files. CI runs on Node 18, 20 and 22 to match `engines`.
- **Changelog moved out of the README** into this file; the README keeps a short pointer. The version test now checks `CHANGELOG.md`.
- **README is honest about `file://`**: the app is ES modules, so Chrome blocks it when opened by double-click. The recommended path is a local static server.

## v2.8.0

The Cheat Sheet's old "Common Linux commands" table was a hand-picked 12-row sample. Replaced it with a full, searchable reference of all 47 terminal commands and every flag they actually support.

- **New `terminal-commands-data.js`** — the authoritative reference, grouped into the same four categories the terminal's own `help` text uses (navigation & files, permissions & ownership, identity & privilege, system investigation), each row carrying the command's flags, what it does, and — where the access rule actually matters — what it *requires* (e.g. `dmesg` → "root (kernel.dmesg_restrict)", `chown` → "root — even the current owner can't give a file away"). Fully bilingual via a new `terminal-commands-data.ar.js` overlay, same pattern as the existing octal-mode table.
- **One search box now filters both tables on the page.** Typing in the existing search field filters the octal-mode table and the new command table at once; a category header hides itself automatically once every row under it is filtered out, instead of leaving a stack of empty section labels.
- **A new regression test keeps the table from drifting**: it scans `terminal.js`'s actual dispatch table and fails if any real command is missing from the reference — so the cheat sheet can't silently fall out of sync with the terminal the way the old hand-picked table eventually would have.
- Closed a pre-existing gap while in the area: the octal-mode table's Arabic translations weren't checked by the i18n-parity test either; both it and the new command table are now enforced.

## v2.7.1

Follow-up tweaks to v2.7's Arch pass, based on direct feedback on the two things that still felt dated: the neofetch fields and the single-line prompt.

- **Neofetch fields swapped for more authentic ones.** `Host`/`Theme` are gone; `Kernel: 6.8.0-45` (matching what `uname -a` already reports) and `Packages: 47` (a nod to neofetch's iconic package-count line, repurposed for the command count) replace them.
- **The prompt is now two lines, starship/powerlevel10k-style**: a context line (`user@permission-lab /path`) sits above the input, and the input row itself is reduced to a single colored `❯` glyph — no more literal `$`/`#`. The glyph carries the privilege tell on its own (green at rest, red the instant the session IS root), the same language the titlebar dot already used, so the signal is now doubled rather than competing with two different conventions.
- Scrollback stayed single-line on purpose — a full two-line prompt repeated for every historical command would make the output hard to scan. Each echoed command now reads `user@host /path ❯ command`, compact but using the same new glyph.

## v2.7.0

A second, more opinionated pass on the terminal's chrome — the person who commissioned v2.6 wanted something with more character: an Arch Linux terminal, specifically.

- **No more macOS traffic-light buttons.** They never did anything when clicked, so the fake affordance is gone, not just restyled — replaced by a small Arch mark. Tiling-WM terminals (the ones Arch users actually screenshot) don't have them either.
- **Arch Blue (`#1793d1`), the project's real brand color, is now the dominant interactive accent inside the terminal** — cursor, focus ring, chip hover, the success ✓, and the path segment of the prompt. That path color is also just the stock, unmodified `PS1` color pairing on most Linux distros (green `user@host` + blue path), so it reads as authentic, not arbitrary. Red stays reserved for errors/root and green for the prompt user / safe-session dot — only the brand accent moved, not the security-semantic colors. This is scoped to `terminal.css` only; the rest of the site stays amber-branded.
- **A neofetch-style boot banner** — a small ASCII Arch logo beside `user@permission-lab`, `OS: Arch Linux`, `Shell: bash`, etc. — replaces the old one-line welcome message. The classic ricer "open a terminal, see neofetch" moment.
- **Flat, not glossy** — solid surfaces, no gradients, modest 8px corners instead of v2.6's glass/gloss treatment, matching real Linux terminal emulators (Alacritty/kitty/foot) rather than macOS Terminal.app.
- Caught and fixed on mobile during this pass: the neofetch banner's two-column layout (ASCII art beside info text) broke on narrow phones because the info lines were too long and wrapped, destroying the alignment. Shortened every info line and moved the "type help" hint to its own freely-wrapping line below the grid instead of inside it.

## v2.6.0

A visual pass on the Terminal Simulator's chrome — no new commands, the same 47. The goal: look like a current terminal app, using only the lab's existing amber/cyan/security-semantic tokens, never a new palette.

- **Session-aware titlebar.** The titlebar now shows who you actually are (`user@permission-lab`) with a live status dot — green at rest, red the instant the session IS root — the exact boundary the whole lab teaches, now visible at a glance instead of only in the prompt text. A small `bash` tag on the right completes the "real terminal tab" read.
- **Denial explanations are now a callout, not a dim aside.** Every "why was this denied" explanation — the actual lesson, repeated across 30+ commands — renders as a distinct cyan-bordered box instead of plain muted text. Success confirmations (`created`, `chmod`, `su`, …) get a quiet ✓ instead of blending into every other line.
- **Quick-command strip is now a horizontal scroller** with faded edges, rather than a pill grid that wrapped into a wall of buttons once the system-investigation commands were added. Chips got a `❯` prompt glyph and a small lift-and-glow on hover.
- **Glass titlebar, glossy traffic lights**, a focus-visible glow around the whole window when the input is active, a themed scrollbar, and `font-variant-ligatures: none` so `!=`/`->`/`--` in real commands always read as their literal characters, never a stylistic ligature glyph.
- Fixed a color-token bug caught while reviewing this pass with screenshots: part of the terminal body was accidentally using the site's theme-reactive surface tokens, so it washed out light-gray under the site's light mode. Terminals should stay dark regardless of site theme — same choice the original CSS made — so every surface/border/text color in `terminal.css` is now a literal dark value, matching that original intent, not a token that flips.

## v2.5.0

A content release: the terminal grows from "a filesystem with permission checks" into a small, coherent **system-investigation** toolkit — the commands a Linux admin or blue-team analyst actually reaches for, all read-only, all simulated.

- **12 new commands, no pipes/execution needed.** `ps` / `ps aux` (plain `ps` only shows your own session, real behavior), `who` / `w`, `last [-n N]` / `lastlog`, `uname -a`, `df` / `du -sh <dir>`, `ss -tulpn` / `netstat -tulpn`, `systemctl status <svc>` / `list-units`, `journalctl [-u unit] [-n N]`, `dmesg`, `getcap -r /`, `crontab -l [-u user]`, and `sudo -l`.
- **New data module, `engine/sysinfo.js`** — a static process table, systemd unit list, socket table, a unified log timeline (the single source for `journalctl`, `dmesg`, and the existing `/var/log/auth.log`/`/var/log/syslog`), login sessions/history and disk usage. Pure data + a couple of pure filters, same pattern as every other `engine/*` module — no DOM, independently testable.
- **Permissions apply to these too, not just files.** `journalctl` and `dmesg` are gated exactly like real Debian/Ubuntu: `journalctl` needs root or the `adm` group (same rule as `/var/log/auth.log`); `dmesg` is root-only (`kernel.dmesg_restrict`), full stop — even `adm` members need `sudo`. `ss -tulpn`/`netstat -tulpn` redact the owning process/PID for sockets you don't own, unless you're root — exactly like the real tools without `sudo`. `du -sh` respects read access, same as `ls`.
- **`find` learns `-perm`** — `find [path] -perm -4000` (SUID), `-2000` (SGID), `-1000` (sticky), `/6000` (either SUID or SGID), plus `-type f`/`-type d`, with real find semantics (`-N` = at least these bits, `/N` = any of these bits, bare `N` = exact match). A new SGID example (`/opt/app/shared`, mode `2775`) was added since nothing in the tree had the SGID bit before.
- **Two realistic findings, discoverable two different ways each.** A backup job (`/etc/cron.d/backup-job`, world-readable) and a monitoring agent (`ps aux`) both pass a secret on the command line — `--password` and `--token`. The SAME backup password shows up whether you read the cron file or run `ps aux` while it's running, which is the point: secrets on a CLI are visible to **every local user**, via more than one route. A planted `getcap` finding (`/usr/bin/python3.11` with `cap_setuid+eip`) demonstrates that a SUID-only audit (`find -perm -4000`) misses capability-based privilege, a very real blind spot. None of these is wired up as an actual, executable escalation in this release — enumeration/investigation only, by design; `/etc/sudoers` and its `sudoers.d` drop-in stay inert.
- **Realistic file content, not just descriptions.** `/etc/sudoers`, `/etc/sudoers.d/90-custom`, `/etc/crontab` and the new `/etc/cron.d/backup-job` now contain real-looking file text (not just a one-line note) when you `cat` them. Fixed `/etc/crontab`'s mode from 600 to the real-world default 644 (world-readable; only root can write it — the note explains why that's correct, unlike a 600 per-user crontab). Added a second per-user crontab (`alice`'s) so `ls -la /var/spool/cron/crontabs/` has more than one entry to look at.
- **54 new tests** — `tests/engine/sysinfo.test.js` (data integrity + the two pure filters) and `tests/regression/sysinvestigation.test.js` (every new command, end-to-end, through the real `runCommand()`), following the exact same patterns as the rest of the suite.
- Roadmap item checked off: terminal-based system/log investigation commands.

## v2.4.2

A hardening and correctness release — no new learning content, but the terminal is now safe to put in front of a class.

- **Fixed: HTML injection through file names.** In v2.4.1, `ls`, `ls -l`, `tree`, `find` and `stat` printed learner-created names without escaping, so `touch "<b>x"` followed by `ls` rendered markup (self-XSS). Fixed in three layers: names are escaped at every output site; `touch`/`mkdir`/`mv`/`cp`/`ln -s` refuse names containing `< > & "` or control characters (`engine/shell-parse.js`); and `printLine` now runs every line through `sanitizeTerminalHTML()` (`engine/safe-html.js`), which escapes any tag other than the terminal's own `<span class="t-…">`.
- **Quoting now works in the terminal.** `touch "my file"`, `touch my\ file` and `chmod 600 'a b'` behave like a real shell (single quotes literal, double quotes with `\"`/`\\` escapes, adjacent pieces joined, `""` is an empty argument). An unterminated quote prints an error and runs nothing. Pipes, redirection and globbing are still not supported.
- **Content-Security-Policy.** `index.html` ships a CSP (`script-src 'self'`, no `unsafe-eval`, `object-src/base-uri/form-action/connect-src 'none'`). The two inline scripts moved to `assets/js/boot-lang.js` and `assets/js/boot-fallback.js`. `style-src` still allows `'unsafe-inline'` because the UI sets inline `style` attributes; removing that is a follow-up.
- **Versions unified** — `package.json`, the README and the tests now agree (a test enforces it).
- **New tests (+52):** tokenizer and name rules, the sanitizer, end-to-end terminal safety (including a node planted straight into the tree to prove the safety net), EN/AR dictionary and content-overlay parity, and static checks on `index.html` (CSP present, no inline scripts/handlers, every external origin allowed, every local file exists).

## v2.4

- **Real users in the terminal** — `su [-] [user]`, `sudo [-u user] <cmd>` / `sudo -i`, `exit`, plus `id`/`groups <user>`. Six accounts (`root`, `user`, `alice`, `deployer`, `monitoring`, `www-data`) with real group membership; the prompt changes (`$` → `#` for root); `sudo` is refused for anyone outside the `sudo` group, with the classic "not in the sudoers file" message.
- **Permissions are now actually enforced** — before, every terminal command ran as an all-powerful user. Now `cat`, `ls`, `cd`, `stat`, `find`, `grep`, `tree`, `touch`, `mkdir`, `rm`, `mv`, `cp`, `chmod`, `chown`, `chgrp` and `setfacl` follow the same rules as the kernel: owner → named ACL (capped by the mask) → group → others, `x` needed on every directory in the path, `w` on the *parent* to create/delete, the sticky bit on `/tmp`, `chmod` for owner/root only, `chown` for root only. Every "Permission denied" comes with a one-line **why** naming the permission class that decided it.
- **`umask`** — `umask`, `umask -S`, `umask 077`. `touch`, `mkdir` and `cp` honour it and print the arithmetic (`666 & ~022 = 644`). Each `su` shell starts at `022`; `exit` restores yours.
- **`ln -s`** — create symlinks (`-f` to replace). Targets are stored verbatim, dangling links are allowed and flagged, relative targets resolve from the link's directory, and a link to a file you can't read still can't be read — which is the whole point.
- **Fixed a real-world ACL gotcha in the seeded scenario** — `monitoring` had a file ACL on `app.yml` but no way to reach it (`/opt/app/config` is `750 root:root`). The directory now carries a matching `--x` ACL, and the file's description explains why a file ACL alone is not enough. Try `su monitoring`, then `cat /opt/app/config/app.yml`; compare with `su alice`.
- **71 new tests** — pure engine rules (`engine/users.js`) plus end-to-end terminal tests that drive the real `runCommand()` through a small DOM shim.
- Behavior changes to be aware of: the default user can no longer read `/etc/shadow`, `cd /root`, or `chown` without `sudo`; `chown`/`chgrp` now reject unknown users/groups; `cp` produces a copy owned by the copier (mode = source & ~umask); `chmod` through a symlink now also recalculates an ACL mask (it skipped that before).

## v2.3

- **Content expansion** — 2 new Learn topics (Special File Attributes/chattr, su vs sudo), 13 new Quiz questions (ACL mask math, Symlinks, chattr, su vs sudo), 1 new Advanced-tier Lab ("Grant Access Without Groups"), and 8 new Challenges (2 per tier) — all tying back into the ACL and symlink features above, fully bilingual. Totals are now 21 Learn topics, 113 Quiz questions, 11 Labs, and 88 Challenges.
- **Guided Path** — a new stepper on the Progress dashboard sequencing Learn → Labs → Challenges → Quiz, with a "Continue" button that jumps straight to your next unfinished phase (and, for Learn, your next unread topic). Expanding a Learn topic now marks it read; a new 13th achievement, Path Complete, unlocks once every phase is done.
- **Interactive ACL** — `getfacl`/`setfacl` are now real terminal commands, not just a Learn topic: add or remove named user/group entries, watch the mask auto-recalculate exactly like real POSIX ACLs, and see the classic `+` suffix appear in `ls -l`/`stat` (the app's config file ships with one seeded example to explore).
- **Symlink permission scenario** — 2 annotated symlinks in the fake filesystem (a benign relative link, and a link inside world-writable `/tmp` pointing at a restricted log) teaching that a symlink's own mode is always cosmetic `777`; `ls -l`/`stat` display it correctly, and `cat`/`chmod`/`chown`/`chgrp` all follow the link to its real target, exactly like the real commands do without `-h`.
- **Shareable/exportable progress** — a new panel on the Progress dashboard to copy a one-line shareable summary or download a full JSON snapshot (level, XP, per-module completion, achievements) of your local progress.
- **Redesigned home page** — a real-numbers stats bar in the hero, a "How it works" (Learn → Practice → Prove it) section, elevated feature-card hover states, and a proper multi-column footer.
- Both new features are fully bilingual (English/Arabic) UI chrome; the new terminal help text follows the existing scope note and stays English-only.

## v2.2

- **Full Arabic (العربية) translation** with a one-click language toggle in the sidebar — persists across visits.
- **RTL layout** — the sidebar, navigation, cards and forms all mirror correctly under `dir="rtl"`, while code/commands/terminal output stay left-to-right since shell syntax is universal.
- Every UI string, all 19 Learn topics, all 10 Labs, all 80 Challenges, all 100 Quiz questions, all 12 Achievements, and the Cheat Sheet reference table are translated.
- Arabic uses the Cairo typeface; English keeps the existing Space Grotesk/Inter/JetBrains Mono stack.
- Scope note: the Cheat Sheet's supplementary troubleshooting prose/best-practice list and the terminal's `help` text remain English-only in this release — see the Roadmap.

## v2.1

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
