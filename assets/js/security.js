/**
 * security.js
 * Module 5 — Security Analyzer.
 * Pure, stateless analysis: given a permission state, return a severity
 * level plus plain-language reasons. Used inline by the Simulator and by
 * the Filesystem module.
 */

import { stateToOctal } from "./converter.js";
import { t } from "./i18n.js";

export const SEVERITY = { SAFE: "safe", WARNING: "warning", CRITICAL: "critical" };

/**
 * @param {object} state - permission state from converter.js
 * @param {object} [context] - optional hints: { path, isSensitive }
 * @returns {{ level: string, headline: string, reasons: string[] }}
 */
export function analyzePermissions(state, context = {}) {
  const reasons = [];
  let level = SEVERITY.SAFE;

  const worldWritable = state.others.write;
  const worldExecutableSensitive = state.others.execute && context.isSensitive;
  const groupWritableSensitive = state.group.write && context.isSensitive;

  if (worldWritable) {
    level = SEVERITY.CRITICAL;
    reasons.push("World-writable: any user on the system can modify this file, not just its owner or group.");
  }

  if (state.suid) {
    level = level === SEVERITY.CRITICAL ? level : SEVERITY.WARNING;
    reasons.push("SUID is set: the file runs with the owner's privileges rather than the caller's. If the owner is root, a flaw in the program can lead to privilege escalation.");
    if (worldWritable) {
      level = SEVERITY.CRITICAL;
      reasons.push("SUID combined with world-writable is critical: anyone could replace the file's contents and have it executed with elevated privilege.");
    }
  }

  if (state.sgid && state.isDir) {
    reasons.push("SGID on a directory: new files created inside inherit this directory's group, useful for shared team folders but worth confirming intentionally.");
  } else if (state.sgid) {
    level = level === SEVERITY.CRITICAL ? level : SEVERITY.WARNING;
    reasons.push("SGID on a file: it executes with the file's group privileges rather than the caller's group.");
  }

  if (state.sticky && !state.isDir) {
    reasons.push("Sticky bit on a regular file has no effect on modern Linux — it's only meaningful on directories.");
  }
  if (state.sticky && state.isDir && worldWritable) {
    reasons.push("Sticky bit on a world-writable directory (like /tmp) is good practice: it stops users from deleting each other's files.");
  }

  if (context.isSensitive) {
    if (state.others.read) {
      level = level === SEVERITY.CRITICAL ? level : SEVERITY.WARNING;
      reasons.push("This file holds sensitive data but is world-readable — any local user can read it.");
    }
    if (groupWritableSensitive) {
      level = SEVERITY.CRITICAL;
      reasons.push("This sensitive file is group-writable, letting any group member alter it.");
    }
    if (worldExecutableSensitive) {
      reasons.push("World-execute is set on a sensitive file — verify this is actually meant to be a runnable script.");
    }
  }

  if (state.isDir && worldWritable && !state.sticky) {
    level = level === SEVERITY.CRITICAL ? level : SEVERITY.WARNING;
    reasons.push("World-writable directory without the sticky bit: any user can delete or rename any file inside, even ones they don't own.");
  }

  if (reasons.length === 0) {
    reasons.push("Access is scoped sensibly: only the owner (and where relevant, the group) can write, and no special bits introduce extra risk.");
  }

  const octal = stateToOctal(state, true);
  const headline = {
    [SEVERITY.SAFE]: `${octal} looks safe for typical use.`,
    [SEVERITY.WARNING]: `${octal} carries some risk worth understanding.`,
    [SEVERITY.CRITICAL]: `${octal} is a critical exposure.`,
  }[level];

  return { level, headline, reasons };
}

export function severityBadgeClass(level) {
  return { safe: "badge-safe", warning: "badge-warn", critical: "badge-crit" }[level] || "badge-neutral";
}

export function severityLabel(level) {
  return { safe: t("sec.safe"), warning: t("sec.warning"), critical: t("sec.critical") }[level] || level;
}
