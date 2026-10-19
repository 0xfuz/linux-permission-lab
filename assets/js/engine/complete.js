/**
 * engine/complete.js  (v2.9.0)
 * Pure Tab-completion logic for the terminal — no DOM, no shared state.
 *
 * completeLine(line, { commands, listDir }) returns
 *   { line, candidates }
 * where `line` is the (possibly extended) input and `candidates` is the list
 * of options when more than one remains (empty when the match is unique or
 * nothing matched).
 *
 *  - First word  -> completes against `commands`.
 *  - Later words -> completes a path; `listDir(dirPart)` returns
 *    [{ name, isDir }] for that directory, or [] when it can't be listed
 *    (missing, not a directory, or no read permission).
 *
 * Deliberately conservative: a line containing quotes or backslashes is left
 * untouched, and entries whose names contain whitespace/quotes are never
 * offered, so a completion can never produce something the tokenizer would
 * read differently from what the learner sees.
 */

const UNSAFE_NAME = /[\s'"\\]/;

function commonPrefix(words) {
  let prefix = words[0];
  for (const w of words.slice(1)) {
    while (!w.startsWith(prefix)) prefix = prefix.slice(0, -1);
  }
  return prefix;
}

export function completeLine(line, { commands, listDir }) {
  const unchanged = { line, candidates: [] };
  if (/['"\\]/.test(line)) return unchanged;

  const lastSpace = line.lastIndexOf(" ");
  const head = line.slice(0, lastSpace + 1);
  const word = line.slice(lastSpace + 1);

  // ---- command position ----
  if (lastSpace === -1) {
    if (!word) return unchanged;
    const matches = commands.filter((c) => c.startsWith(word)).sort();
    return finish(head, word, matches.map((name) => ({ name, suffix: " " })));
  }

  // ---- path position ----
  const slash = word.lastIndexOf("/");
  const dirPart = slash === -1 ? "" : word.slice(0, slash + 1);
  const base = slash === -1 ? word : word.slice(slash + 1);
  const entries = listDir(dirPart) || [];
  const matches = entries
    .filter((e) => !UNSAFE_NAME.test(e.name))
    .filter((e) => e.name.startsWith(base))
    .filter((e) => base.startsWith(".") || !e.name.startsWith("."))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => ({ name: dirPart + e.name, suffix: e.isDir ? "/" : " ", shown: e.isDir ? e.name + "/" : e.name }));
  return finish(head, word, matches);
}

function finish(head, word, matches) {
  if (!matches.length) return { line: head + word, candidates: [] };
  if (matches.length === 1) return { line: head + matches[0].name + matches[0].suffix, candidates: [] };
  const prefix = commonPrefix(matches.map((m) => m.name));
  return {
    line: head + (prefix.length > word.length ? prefix : word),
    candidates: matches.map((m) => m.shown || m.name),
  };
}
