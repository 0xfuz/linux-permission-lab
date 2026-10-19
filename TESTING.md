# Testing

## Running the tests

```bash
npm test
```

That's the whole setup — `npm install` has nothing to install (zero dependencies, `package.json` exists purely to define the `test` script). If you don't even want npm involved:

```bash
node --test
```

Node's test runner auto-discovers files by default — anything matching `*.test.js` (recursively, including `tests/**`) counts as a test file. No path argument needed, and none should be added: an earlier version of this script explicitly passed `"tests/**/*.test.js"` as a glob string, which worked locally (Node 22) but failed on GitHub Actions' runner (Node 20) with `Could not find '.../tests/**/*.test.js'` — Node's glob-string handling for that argument isn't consistent across versions. Bare `node --test` relies on documented, version-stable default discovery instead.

`npm run test:watch` re-runs on file changes.

**Requires Node 18+** (uses the built-in `node:test` / `node:assert/strict` modules — no test framework is installed as a dependency, matching the app's own zero-runtime-dependency philosophy. Nothing here ever ships to the browser).

## What's covered

| File | Covers | Tests |
|---|---|---|
| `tests/engine/permissions.test.js` | `converter.js` — octal/symbolic/triad conversions, special bits, input validation | 66 |
| `tests/engine/acl.test.js` | `engine/acl.js` — ACL mask/effective-permission math | 16 |
| `tests/engine/fs-model.test.js` | `engine/fs-model.js` — tree lookup/resolution against the real `FS_TREE` | 14 |
| `tests/engine/symlinks.test.js` | chmod/chown/chgrp-follows-target semantics, dangling links | 9 |
| `tests/engine/users.test.js` | `engine/users.js` — access classes, ACL mask, traversal, sticky bit, chown/chgrp rules, umask math | 25 |
| `tests/engine/sysinfo.test.js` | `engine/sysinfo.js` — process/service/socket/disk data integrity, journal filters, lastlog | 17 |
| `tests/engine/shell-parse.test.js` | `engine/shell-parse.js` — quote-aware tokenizer, unterminated-quote errors, file-name rules | 14 |
| `tests/engine/complete.test.js` | `engine/complete.js` — Tab completion: commands, paths, ambiguity, dotfiles, quote/whitespace safety | 10 |
| `tests/engine/safe-html.test.js` | `engine/safe-html.js` — `escapeHTML`, `sanitizeTerminalHTML` against script/img/handler payloads | 7 |
| `tests/regression/terminal-safety.test.js` | Quoting in real commands; unsafe names refused; output never contains foreign tags (incl. a node planted straight into the tree) | 13 |
| `tests/regression/terminal-completion.test.js` | Tab completion against the live terminal state (cwd, user permissions) + `COMMAND_NAMES` in sync with the dispatch table | 5 |
| `tests/regression/dom-safety.test.js` | No interpolated template literal reaches `innerHTML` / `el({ html })` outside the sanitized terminal printer | 1 |
| `tests/regression/i18n-parity.test.js` | EN/AR dictionary keys identical, every `t()`/`data-i18n` key defined, Arabic content overlays complete and shape-compatible | 10 |
| `tests/regression/static-site.test.js` | CSP present and obeyed (no inline scripts/handlers), external origins allowed, local files exist, version consistent | 8 |
| `tests/regression/terminal.test.js` | The real `runCommand()` end-to-end via `helpers/dom-shim.js`: su/sudo/exit, enforcement, umask, `ln -s` | 46 |
| `tests/regression/sysinvestigation.test.js` | `ps`, `who`/`w`, `last`/`lastlog`, `uname`, `df`/`du`, `ss`/`netstat`, `systemctl`, `journalctl`, `dmesg`, `getcap`, `crontab -l`, `sudo -l`, `find -perm`, `find -name`, end-to-end | 43 |
| `tests/regression/terminal-help-flag.test.js` | `<command> --help`/`-h` for all 47 commands, sourced from the same data the Cheat Sheet uses | 9 |
| `tests/regression/terminal-commands-data.test.js` | The Cheat Sheet's command-reference data: shape, unique ids, valid categories, and sync with `terminal.js`'s real dispatch table | 5 |
| `tests/regression/challenges.test.js` | All 88 Challenges: locked-in answer snapshot + schema invariants | 9 |
| `tests/regression/labs.test.js` | All 11 Labs: locked-in answer-step snapshot + schema invariants | 9 |
| `tests/regression/progress.test.js` | XP/level math, all 13 achievements, Guided Path phases, export snapshot shape, resetAllProgress | 25 |
| `tests/engine/scenario.test.js` | `engine/scenario.js` — grafting/unloading under `/srv/lab`, group overrides, deterministic reset, every check helper, hint progression, challenge sessions | 31 |
| `tests/engine/investigation.test.js` | `engine/investigation.js` against the real terminal and `inv01`: evidence gating, diagnosis (locked/wrong/correct), state-judged fixes, verification, per-phase hints, reset | 43 |
| `tests/engine/scenario-validators.test.js` | v2.12.1 validator review: world-writable detection through named ACL entries/groups (effective, mask-aware), the absence of an `other::` entry, `accessWithin`, tc04 directory-write enforcement, label-vs-enforcement checks | 41 |
| `tests/regression/scenarios.test.js` | The 5 shipped scenarios: data invariants, accepted fixes vs rejected shortcuts, terminal observer hook, unchanged terminal behaviour, progress persistence + v2.11 backward compatibility | 61 |
| `tests/regression/scenarios-ui.test.js` | Scenarios panel: hostile text rendered inertly, ARIA/keyboard structure, and the real controller driven end to end (challenge + investigation) via `helpers/ui-harness.js` | 25 |
| `tests/regression/scenarios-i18n.test.js` | Arabic overlay for scenarios lines up with the English source (ids, array lengths); `sc.*` UI strings in both languages | 8 |
| `tests/regression/i18n-localize.test.js` | `i18n.js`'s `localize()`, including the nested-array mode Labs now uses, against both synthetic fixtures and the real `LABS`/`LABS_AR` data | 10 |

582 tests total. Run `npm test` for the current count — this table will drift out of date before that command will.

## Why Node's built-in test runner, not Jest/Vitest

The app is deliberately zero-dependency, no-build-step, vanilla ES modules. Adding Jest or Vitest would mean adding a devDependency and (for Vitest) a bundler-adjacent toolchain for something Node already does natively. `node:test` + `node:assert/strict` needs nothing installed and nothing configured.

## Why some files needed a small change to become testable

Most of the codebase already imports cleanly under Node with zero changes — `converter.js`, `security.js`, `filesystem.js`, `terminal.js`, `challenges.js`, `labs.js`, and `quiz.js` all have zero module-scope DOM/`window` access (any DOM code is safely tucked inside functions that only run when actually called from the browser).

Two things did need a minimal, behavior-preserving fix:

1. **`learn.js` had a module-scope `window.addEventListener(...)` call.** That's fine in a browser (the listener needs to exist from page load, before the Learn view is ever visited, so the Guided Path's "jump to my next unread topic" works on a first visit). Under Node, `window` doesn't exist at all, so importing `learn.js` — and therefore `achievements.js`/`progress.js`, which import it — threw immediately. Fixed by guarding the registration behind `typeof window !== "undefined"`. Zero change to browser behavior; the module is just importable in a non-browser environment now too.
2. **Some pure logic was private (not exported) inside a DOM-heavy file.** The ACL mask/effective-permission math lived as unexported functions inside `terminal.js`, which also does a lot of `document`/DOM work for printing to the simulated terminal. It's been moved to `engine/acl.js` — a straight extraction, no logic changed, `terminal.js` now imports it. Same story for a small new `resolveWriteTarget()` helper in `engine/fs-model.js`, which replaces three near-identical "does this write follow a symlink to its target" blocks that used to be duplicated across `handleChmod`/`handleChown`/`handleChgrp`.

Two more small fixes landed alongside the test suite, both flagged in the Phase 0 audit and both protected by the tests above so they can't silently regress:

3. **`challenges.js` used to detect the current locale by comparing a translated string's value** (`t("ch.checkAnswer") === "Check answer" ? … : …`) instead of checking the locale directly — fragile, since editing that one English string would have silently broken it. Replaced with a proper `ch.notQuite` i18n key, same pattern as every other string in the app.
4. **`labs.js` had its own hand-rolled Arabic-overlay merge** instead of reusing the shared `localize()` helper every other content type (Learn, Challenges, Quiz) already used, because a Lab's nested `steps[]` array needed element-by-element merging that the original flat `localize()` couldn't do. `localize()` now accepts an optional `nestedArrayKey` option to handle exactly that case, so Labs uses the same shared function as everything else — one merge implementation instead of two. `tests/regression/i18n-localize.test.js` covers this against both a synthetic fixture and the real `LABS`/`LABS_AR` data.

## What the UI tests do and do not prove

`helpers/ui-harness.js` extends the DOM shim just enough to fire the same `click`/`change` events a native `<button>`/`<input>` fires on Enter/Space and to look nodes up by id. It proves the wiring (what a click does to the state and to the rendered text), the semantic structure (buttons are buttons, radios are in a labelled fieldset, one `aria-current` step) and that scenario text never becomes HTML. It does **not** prove layout, colours, focus-ring appearance, contrast or responsive behaviour — those need a real browser.

## Regression snapshots: how to update them on purpose

`tests/regression/challenges.test.js` and `tests/regression/labs.test.js` hardcode the current correct answers for every Challenge and Lab. This is intentional — it means a future refactor (in particular, migrating Labs to the JSON-based content schema proposed for Phase 2) can't silently change what counts as a correct answer without a test failing loudly.

If you deliberately change a challenge's or lab's target permission as part of authoring/editing content (not refactoring), regenerate the snapshot in the same commit:

```js
// paste into `node --input-type=module -e "..."` against challenges-data.js / labs-data.js
import { CHALLENGES } from "./assets/js/challenges-data.js";
const map = {};
CHALLENGES.forEach(c => { map[c.id] = c.target; });
console.log(JSON.stringify(map));
```

and update `EXPECTED_TARGETS` (or `EXPECTED_ANSWER_TARGETS` for labs) to match. Don't update it to make a failing test pass without first confirming the underlying content change was intentional.

## What isn't tested yet

- **Rendering/DOM behavior** (does clicking a button show the right panel, etc.). Every test here targets pure logic — nothing renders anything. A DOM-level pass would need a shim like `jsdom` as a devDependency (still never shipped to the browser) — proposed as a later, optional phase, not done here since logic coverage was the priority.
- **`app.js`** (routing/orchestration) has genuine module-scope `document` access by design — it's the integration layer, not a logic module, and isn't a good unit-test target.
- **Terminal command parsing/output** beyond the ACL math and symlink-follow rule already covered — `terminal.js`'s individual command handlers (`handleLs`, `handleStat`, `handleFind`, `handleGrep`, ...) aren't exported and mix DOM printing with logic. They're lower-risk than the ACL math (no error-prone arithmetic) but would need the same extraction treatment to unit-test in isolation.
- **Security Analyzer** (`security.js: analyzePermissions`) is already fully pure and importable today with zero changes needed — just not covered by this initial pass. Good candidate for the next increment.
