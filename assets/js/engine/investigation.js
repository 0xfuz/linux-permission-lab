/**
 * engine/investigation.js  (v2.12)
 * A small, reusable state machine for guided troubleshooting scenarios.
 *
 *   briefing → evidence → diagnosis → remediation → verification → complete
 *
 * The phases keep four different activities apart:
 *   - EVIDENCE     is observed from the commands the learner actually ran in
 *                  the real terminal (the terminal reports each one through
 *                  an observer hook — see terminal.js setCommandObserver).
 *   - DIAGNOSIS    is a choice the learner makes; it is only unlocked once the
 *                  required evidence exists, and wrong choices are answered
 *                  from the live simulated state, not from canned text alone.
 *   - REMEDIATION  is judged purely by evaluating the simulated state
 *                  (engine/scenario.js checks) — never by which command ran.
 *   - VERIFICATION requires re-running a relevant check as the affected
 *                  account AND the state still passing.
 *
 * Pure and DOM-free; the UI (scenarios.js) only renders this object.
 */
import { evaluateChecks, createHintSession, startScenario, unloadScenario } from "./scenario.js";
import { resetTerminalState } from "../terminal-state.js";

export const PHASES = ["briefing", "evidence", "diagnosis", "remediation", "verification", "complete"];
const HINT_PHASES = ["evidence", "diagnosis", "remediation", "verification"];

/** `sudo [-u user] cmd args…` → the command that really runs, and as whom. */
export function normalizeCommand(ev) {
  const out = { cmd: ev.cmd, args: [...(ev.args || [])], user: ev.user, cwd: ev.cwd, paths: ev.paths || [] };
  if (out.cmd === "sudo") {
    let a = out.args; let as = "root";
    if (a[0] === "-u" && a[1]) { as = a[1]; a = a.slice(2); }
    if (a.length && !a[0].startsWith("-")) { out.cmd = a[0]; out.args = a.slice(1); out.user = as; }
  }
  return out;
}

export function createInvestigation(def) {
  const st = {
    phase: "briefing",
    evidence: {},            // id -> { finding, command }
    diagnosisAttempts: [],   // [{ id, correct }]
    fixAttempts: 0,
    lastFix: null,
    hintCounts: Object.fromEntries(HINT_PHASES.map((p) => [p, 0])),
    log: [],
  };
  let hintSessions = makeHintSessions();

  function makeHintSessions() {
    return Object.fromEntries(HINT_PHASES.map((p) => [p, createHintSession((def.hints && def.hints[p]) || [])]));
  }
  const requiredEvidence = () => def.evidence.filter((e) => e.required);
  const missingEvidence = () => requiredEvidence().filter((e) => !st.evidence[e.id]);

  function snapshot() {
    return {
      id: def.id, phase: st.phase,
      evidence: { ...st.evidence },
      missingEvidence: missingEvidence().map((e) => e.id),
      diagnosisAttempts: st.diagnosisAttempts.map((a) => ({ ...a })),
      fixAttempts: st.fixAttempts, lastFix: st.lastFix,
      hintCounts: { ...st.hintCounts },
      hintsUsed: Object.values(st.hintCounts).reduce((a, b) => a + b, 0),
    };
  }

  return {
    def,
    get phase() { return st.phase; },
    get state() { return snapshot(); },

    /** Build the environment and move from briefing to evidence collection. */
    start() {
      startScenario(def);
      st.phase = "evidence"; st.evidence = {}; st.diagnosisAttempts = []; st.fixAttempts = 0;
      st.lastFix = null; st.log = []; hintSessions = makeHintSessions();
      Object.keys(st.hintCounts).forEach((k) => { st.hintCounts[k] = 0; });
      return snapshot();
    },

    /** Same as start(): restores the ORIGINAL simulated state and begins again. */
    reset() { return this.start(); },

    /** Leave the scenario and take its files out of the shared filesystem. */
    end() { unloadScenario(); resetTerminalState(); st.phase = "briefing"; },

    /** Called with every command the learner runs in the terminal. */
    observe(rawEvent) {
      if (st.phase === "briefing" || st.phase === "complete") return snapshot();
      const ev = normalizeCommand(rawEvent);
      st.log.push(`${ev.user}: ${ev.cmd} ${ev.args.join(" ")}`.trim());
      if (st.log.length > 200) st.log.shift();

      for (const item of def.evidence) {
        if (!st.evidence[item.id] && item.matches(ev)) {
          st.evidence[item.id] = { finding: item.finding(), command: `${ev.cmd} ${ev.args.join(" ")}`.trim() };
        }
      }
      if (st.phase === "evidence" && missingEvidence().length === 0) st.phase = "diagnosis";

      if (st.phase === "verification" && def.verify(ev)) {
        const r = evaluateChecks(def.checks);
        st.lastFix = r;
        st.phase = r.ok ? "complete" : "remediation";
      }
      return snapshot();
    },

    /** Choose a diagnosis. Returns { ok, correct?, reason?, feedback? }. */
    diagnose(choiceId) {
      if (st.phase === "briefing") return { ok: false, reason: "not-started" };
      if (st.phase === "evidence") return { ok: false, reason: "locked", missing: missingEvidence().map((e) => e.id) };
      if (st.phase !== "diagnosis") return { ok: false, reason: "already-diagnosed" };
      const choice = def.diagnoses.find((d) => d.id === choiceId);
      if (!choice) return { ok: false, reason: "unknown-choice" };
      st.diagnosisAttempts.push({ id: choice.id, correct: !!choice.correct });
      const feedback = choice.explain();
      if (!choice.correct) return { ok: true, correct: false, feedback };
      st.phase = "remediation";
      // Learner may have fixed it before diagnosing; don't make them redo it.
      const r = evaluateChecks(def.checks);
      if (r.ok) { st.lastFix = r; st.phase = "verification"; }
      return { ok: true, correct: true, feedback, phase: st.phase };
    },

    /** Evaluate the live simulated state against the scenario's checks. */
    checkFix() {
      if (st.phase !== "remediation" && st.phase !== "verification") return { ok: false, reason: "wrong-phase", phase: st.phase };
      const r = evaluateChecks(def.checks);
      st.lastFix = r;
      if (r.ok) { st.phase = "verification"; } else { st.fixAttempts += 1; st.phase = "remediation"; }
      return { ok: true, fixed: r.ok, result: r, phase: st.phase };
    },

    /** Reveal the next hint for the CURRENT phase only. */
    nextHint() {
      const s = hintSessions[st.phase];
      if (!s) return null;
      const h = s.next();
      if (h) st.hintCounts[st.phase] = s.revealed;
      return h ? { ...h, phase: st.phase } : null;
    },
    hintsFor(phase = st.phase) { return hintSessions[phase] ? hintSessions[phase].visible() : []; },
    hintTotal(phase = st.phase) { return hintSessions[phase] ? hintSessions[phase].total : 0; },

    /** Evidence-based closing explanation, built from the final state. */
    summary() {
      if (st.phase !== "complete") return null;
      return def.summarize({ result: st.lastFix, attempts: st.diagnosisAttempts, hintsUsed: snapshot().hintsUsed });
    },
  };
}
