/**
 * engine/shell-parse.js  (v2.4.2)
 * Pure command-line parsing for the simulated shell.
 *
 * Before v2.4.2 the terminal did `line.split(/\s+/)`, so quoting did nothing:
 *   touch "my file"   ->  two arguments: `"my` and `file"`
 * This tokenizer follows the POSIX shell rules that matter for a permissions
 * lab (no variables, globbing, pipes or substitution — those are future work):
 *   - whitespace separates words
 *   - 'single quotes'  : everything literal until the closing quote
 *   - "double quotes"  : literal, except \" and \\ (backslash escapes)
 *   - backslash outside quotes escapes the next character (\ + space = a space)
 *   - adjacent quoted/unquoted pieces join into one word:  a"b c"d -> `ab cd`
 *   - an empty quoted string ("" or '') is a real, empty argument
 *   - an unterminated quote is an error, like a real shell's prompt for more input
 */

/** @returns {{ ok: true, tokens: string[] } | { ok: false, error: string }} */
export function tokenize(line) {
  const tokens = [];
  let cur = "";
  let inWord = false;
  let quote = null; // "'" | '"' | null
  const s = String(line);

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];

    if (quote === "'") {
      if (ch === "'") quote = null;
      else cur += ch;
      continue;
    }
    if (quote === '"') {
      if (ch === '"') quote = null;
      else if (ch === "\\" && (s[i + 1] === '"' || s[i + 1] === "\\")) { cur += s[i + 1]; i++; }
      else cur += ch;
      continue;
    }

    if (ch === "'" || ch === '"') { quote = ch; inWord = true; continue; }
    if (ch === "\\") {
      if (i + 1 < s.length) { cur += s[i + 1]; i++; inWord = true; }
      else return { ok: false, error: "unexpected end of input after a backslash" };
      continue;
    }
    if (/\s/.test(ch)) {
      if (inWord) { tokens.push(cur); cur = ""; inWord = false; }
      continue;
    }
    cur += ch;
    inWord = true;
  }

  if (quote) return { ok: false, error: `unmatched ${quote} — close the quote and try again` };
  if (inWord) tokens.push(cur);
  return { ok: true, tokens };
}

const UNSAFE_NAME_CHARS = /[<>&"\u0000-\u001f\u007f]/;

/**
 * Names the simulator will create. Real Linux allows nearly anything except "/"
 * and NUL; this lab additionally rejects HTML-significant and control characters
 * because names are rendered in the page (defence in depth — output is escaped too).
 * @returns {null | string} null if fine, otherwise a human-readable reason
 */
export function nameProblem(name) {
  if (!name) return "empty name";
  if (name === "." || name === "..") return `'${name}' is reserved`;
  if (name.length > 255) return "name too long (max 255 characters, same as ext4)";
  if (UNSAFE_NAME_CHARS.test(name)) return "names in this simulator can't contain < > & \" or control characters";
  return null;
}
