/**
 * tests/regression/dom-safety.test.js
 * Guard rail: no module may assign an interpolated template string to
 * .innerHTML or pass one as `html:` — that is how a stray `${name}` becomes
 * an XSS hole. Plain-text output goes through textContent / el() children /
 * utils.setFeedback.
 *
 * Allowed on purpose (each is escaped or sanitized):
 *   terminal.js  — printLine() runs every string through sanitizeTerminalHTML,
 *                  and prompt segments are built from escaped parts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const jsRoot = new URL("../../assets/js/", import.meta.url).pathname;
const walk = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));

const ALLOWED_FILES = new Set(["terminal.js"]);
const risky = /(?:\.innerHTML\s*=|\bhtml\s*:)\s*`[^`]*\$\{/;

test("no interpolated template literal reaches innerHTML / el({ html })", () => {
  const offenders = [];
  for (const file of walk(jsRoot).filter((f) => f.endsWith(".js"))) {
    const name = file.split("/").pop();
    if (ALLOWED_FILES.has(name)) continue;
    readFileSync(file, "utf8").split("\n").forEach((line, i) => {
      if (risky.test(line)) offenders.push(`${name}:${i + 1}: ${line.trim().slice(0, 80)}`);
    });
  }
  assert.deepEqual(offenders, []);
});
