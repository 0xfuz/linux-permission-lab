/**
 * converter.js
 * Single source of truth for permission math. Every other module (simulator,
 * calculator, security, filesystem, challenges) imports from here so the
 * rules are defined exactly once.
 */

const RWX = ["r", "w", "x"];

/** Build a { read, write, execute } triad object. */
export function triad(read = false, write = false, execute = false) {
  return { read, write, execute };
}

/** Convert one triad to its 3-bit binary string, e.g. {r:1,w:0,x:1} -> "101" */
export function triadToBinary(t) {
  return `${t.read ? 1 : 0}${t.write ? 1 : 0}${t.execute ? 1 : 0}`;
}

/** Convert one triad to its single octal digit (0-7). */
export function triadToOctalDigit(t) {
  return parseInt(triadToBinary(t), 2);
}

/** Convert one triad to symbolic form, e.g. "rwx", "r-x", "---" */
export function triadToSymbol(t) {
  return (t.read ? "r" : "-") + (t.write ? "w" : "-") + (t.execute ? "x" : "-");
}

/**
 * Full permission state shape:
 * { owner: triad, group: triad, others: triad, suid: bool, sgid: bool, sticky: bool, isDir: bool }
 */
export function defaultPermissionState(isDir = false) {
  return {
    owner: triad(true, true, !isDir ? false : true),
    group: triad(true, false, !isDir ? false : true),
    others: triad(true, false, !isDir ? false : true),
    suid: false,
    sgid: false,
    sticky: false,
    isDir,
  };
}

/** Symbolic string like "rwxr-xr-x" with leading d/- and optional special bit glyphs applied. */
export function stateToSymbolic(state) {
  const type = state.isDir ? "d" : "-";
  let ownerSym = triadToSymbol(state.owner);
  let groupSym = triadToSymbol(state.group);
  let othersSym = triadToSymbol(state.others);

  if (state.suid) ownerSym = ownerSym.slice(0, 2) + (state.owner.execute ? "s" : "S");
  if (state.sgid) groupSym = groupSym.slice(0, 2) + (state.group.execute ? "s" : "S");
  if (state.sticky) othersSym = othersSym.slice(0, 2) + (state.others.execute ? "t" : "T");

  return type + ownerSym + groupSym + othersSym;
}

/** Numeric octal string, e.g. "755" or "4755" when special bits are set (4 digits). */
export function stateToOctal(state, forceFourDigit = false) {
  const special = (state.suid ? 4 : 0) + (state.sgid ? 2 : 0) + (state.sticky ? 1 : 0);
  const base = `${triadToOctalDigit(state.owner)}${triadToOctalDigit(state.group)}${triadToOctalDigit(state.others)}`;
  if (special > 0 || forceFourDigit) return `${special}${base}`;
  return base;
}

/** Binary string grouped per triad, e.g. "111 101 101" */
export function stateToBinaryGrouped(state) {
  return [state.owner, state.group, state.others].map(triadToBinary).join(" ");
}

/** chmod command string, e.g. "chmod 755 file.txt" */
export function stateToChmodCommand(state, filename = "file.txt") {
  return `chmod ${stateToOctal(state)} ${filename}`;
}

/** Parse a 3 or 4 digit octal string into a permission state. isDir preserved from caller. */
export function octalToState(octalStr, isDir = false) {
  const digits = octalStr.trim().padStart(octalStr.length <= 3 ? 3 : 4, "0").split("").map(Number);
  let special = 0, o, g, u;
  if (digits.length === 4) {
    [special, o, g, u] = digits;
  } else {
    [o, g, u] = digits;
  }
  const digitToTriad = (d) => triad(!!(d & 4), !!(d & 2), !!(d & 1));
  return {
    owner: digitToTriad(o),
    group: digitToTriad(g),
    others: digitToTriad(u),
    suid: !!(special & 4),
    sgid: !!(special & 2),
    sticky: !!(special & 1),
    isDir,
  };
}

/** Parse a symbolic string like "rwxr-xr-x" or "drwxr-xr-x" into a permission state. */
export function symbolicToState(symbolic) {
  let s = symbolic.trim();
  let isDir = false;
  if (s[0] === "d" || s[0] === "-" || s[0] === "l") {
    isDir = s[0] === "d";
    s = s.slice(1);
  }
  s = s.padEnd(9, "-");
  const parse = (chunk, specialChar) => {
    const read = chunk[0] === "r";
    const write = chunk[1] === "w";
    let execChar = chunk[2];
    let special = false;
    let execute = execChar === "x";
    if (execChar === specialChar.toLowerCase()) { special = true; execute = true; }
    if (execChar === specialChar.toUpperCase()) { special = true; execute = false; }
    return { t: triad(read, write, execute), special };
  };
  const ownerRes = parse(s.slice(0, 3), "s");
  const groupRes = parse(s.slice(3, 6), "s");
  const othersRes = parse(s.slice(6, 9), "t");
  return {
    owner: ownerRes.t,
    group: groupRes.t,
    others: othersRes.t,
    suid: ownerRes.special,
    sgid: groupRes.special,
    sticky: othersRes.special,
    isDir,
  };
}

/** Validate a raw octal string the user typed. Returns { valid, message }. */
export function validateOctalInput(raw) {
  const trimmed = raw.trim();
  if (!/^[0-7]{3,4}$/.test(trimmed)) {
    return { valid: false, message: "Enter 3 or 4 octal digits (0–7), e.g. 755 or 4755" };
  }
  return { valid: true, message: "" };
}

/** Validate a raw symbolic string the user typed. */
export function validateSymbolicInput(raw) {
  const trimmed = raw.trim();
  if (!/^[d\-]?([r\-][w\-][xsSt\-]){2}([r\-][w\-][xtT\-])$/.test(trimmed)) {
    return { valid: false, message: "Enter 9 permission characters, e.g. rwxr-xr-x" };
  }
  return { valid: true, message: "" };
}

export const CHEATSHEET_ROWS = [
  { id: "o777", octal: "777", symbolic: "rwxrwxrwx", desc: "Everyone can read, write and execute. Almost never appropriate." },
  { id: "o755", octal: "755", symbolic: "rwxr-xr-x", desc: "Owner has full control; everyone else can read and execute. Typical for scripts and directories." },
  { id: "o700", octal: "700", symbolic: "rwx------", desc: "Owner-only, full control. Good for private keys and personal scripts." },
  { id: "o644", octal: "644", symbolic: "rw-r--r--", desc: "Owner can read/write; everyone else read-only. The default for most regular files." },
  { id: "o600", octal: "600", symbolic: "rw-------", desc: "Owner-only read/write. Correct mode for SSH private keys and secrets." },
  { id: "o664", octal: "664", symbolic: "rw-rw-r--", desc: "Owner and group can read/write; others read-only. Common for shared team files." },
  { id: "o750", octal: "750", symbolic: "rwxr-x---", desc: "Owner full control, group can read/execute, others no access." },
  { id: "o440", octal: "440", symbolic: "r--r-----", desc: "Read-only for owner and group. Used for configuration that shouldn't change at runtime." },
  { id: "o111", octal: "111", symbolic: "--x--x--x", desc: "Execute-only for everyone, no read. Occasionally used for wrapper binaries." },
  { id: "o000", octal: "000", symbolic: "---------", desc: "No access for anyone, including the owner. Used to temporarily lock a file." },
];
