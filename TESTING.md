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
| `tests/regression/challenges.test.js` | All 88 Challenges: locked-in answer snapshot + schema invariants | 9 |
| `tests/regression/labs.test.js` | All 11 Labs: locked-in answer-step snapshot + schema invariants | 9 |
| `tests/regression/progress.test.js` | XP/level math, all 13 achievements, Guided Path phases, export snapshot shape | 21 |
| `tests/regression/i18n-localize.test.js` | `i18n.js`'s `localize()`, including the nested-array mode Labs now uses, against both synthetic fixtures and the real `LABS`/`LABS_AR` data | 10 |

154 tests total. Run `npm test` for the current count — this table will drift out of date before that command will.

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
