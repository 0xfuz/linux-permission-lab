/**
 * scenarios.js  (v2.12)
 * UI for the terminal challenges and Investigation Mode, rendered as a panel
 * under the Terminal. It adds NO simulation of its own: opening a scenario
 * grafts its files into the shared filesystem (engine/scenario.js), the
 * learner works in the real terminal, and every verdict comes from
 * evaluating the live simulated state.
 *
 * Everything on screen is built with el() and text nodes — scenario text is
 * never parsed as HTML. The build* functions are pure (model in → nodes
 * out) so they can be tested without a browser.
 */
import { qs, el, toast } from "./utils.js";
import { t, getLocale, onLocaleChanged } from "./i18n.js";
import { SCENARIOS, CHALLENGE_SCENARIOS } from "./scenarios-data.js";
import { SCENARIOS_AR } from "./scenarios-data.ar.js";
import { createChallengeSession, scenarioBase, activeScenarioId } from "./engine/scenario.js";
import { createInvestigation, PHASES } from "./engine/investigation.js";
import { getScenarioProgress, markScenarioComplete } from "./scenario-progress.js";
import { setCommandObserver, refreshTerminalPrompt, terminalNotice } from "./terminal.js";
import { renderFilesystem } from "./filesystem.js";

/* ------------------------------ localization ------------------------------ */

/** The def's translatable fields for the active locale (English fallback per field). */
export function scenarioText(def, locale = getLocale()) {
  const ar = locale === "ar" ? SCENARIOS_AR[def.id] : null;
  return {
    title: ar?.title ?? def.title,
    objectives: ar?.objectives ?? def.objectives,
    task: ar?.task ?? def.task,
    incident: ar?.incident ?? def.incident,
    completion: ar?.completion ?? def.completion,
    hints: ar?.hints ?? def.hints,
    rootCause: ar?.rootCause ?? def.rootCause,
    quality: (q) => ar?.qualityText?.[q] ?? def.qualityText?.[q] ?? "",
    check: (c) => ar?.checks?.[c.id] ?? c.label,
    evidence: (e) => ar?.evidence?.[e.id] ?? e.label,
    diagnosis: (d) => ({ label: ar?.diagnoses?.[d.id]?.label ?? d.label, why: ar?.diagnoses?.[d.id]?.why ?? d.why }),
  };
}

/* ------------------------------ pure builders ------------------------------ */

function badge(text, cls = "badge-neutral") { return el("span", { class: `badge ${cls}` }, text); }

function objectivesBlock(text) {
  return el("div", { class: "sc-block" }, [
    el("h4", { class: "eyebrow" }, t("sc.objectives")),
    el("ul", { class: "sc-list" }, text.objectives.map((o) => el("li", {}, o))),
  ]);
}

function hintsBlock(visible, total) {
  return el("div", { class: "sc-block" }, [
    el("h4", { class: "eyebrow" }, `${t("sc.hints")} (${visible.length}/${total} ${t("sc.hintCount")})`),
    el("ol", { class: "sc-hints" }, visible.map((h) => el("li", { class: "readout readout-hint" }, [el("div", { class: "readout-hint-text" }, h)]))),
  ]);
}

function checkRow(label, level, status, detail) {
  const icon = status === "pass" ? "✓" : status === "fail" ? "✗" : "○";
  const sr = status === "pass" ? t("sc.pass") : status === "fail" ? t("sc.fail") : "";
  return el("li", { class: `sc-check sc-${status}` }, [
    el("span", { class: "sc-check-icon", "aria-hidden": "true" }, icon),
    el("span", { class: "sc-check-body" }, [
      el("span", {}, label),
      level === "advisory" ? badge(t("sc.advisory"), "badge-info") : null,
      sr ? el("span", { class: "sr-only" }, ` — ${sr}`) : null,
      status === "fail" && detail ? el("span", { class: "sc-detail" }, detail) : null,
    ]),
  ]);
}

/** m: { def, text, done, hintsVisible, last, attempts, solved, actions:{onCheck,onHint,onReset,onBack} } */
export function buildChallengeView(m) {
  const byId = new Map((m.last ? m.last.results : []).map((r) => [r.id, r]));
  const rows = m.def.checks.map((c) => {
    const r = byId.get(c.id);
    return checkRow(m.text.check(c), c.level, r ? (r.ok ? "pass" : "fail") : "pending", r && !r.ok ? r.detail : "");
  });
  const kids = [
    el("div", { class: "sc-head" }, [
      el("button", { class: "btn btn-ghost btn-sm", type: "button", id: "sc-back", onClick: m.actions.onBack }, t("sc.back")),
      badge(t("sc.kind.challenge"), "badge-info"), el("span", { class: "xp-tag" }, `+${m.def.xp} ${t("sc.xp")}`),
    ]),
    el("h3", { class: "sc-title" }, m.text.title),
    objectivesBlock(m.text),
    el("div", { class: "sc-block" }, [el("h4", { class: "eyebrow" }, t("sc.task")), el("p", {}, m.text.task)]),
    el("div", { class: "sc-block" }, [el("h4", { class: "eyebrow" }, t("sc.criteria")), el("ul", { class: "sc-checks" }, rows)]),
    el("div", { class: "row wrap sc-actions" }, [
      el("button", { class: "btn btn-primary btn-sm", type: "button", id: "sc-check", onClick: m.actions.onCheck }, t("sc.check")),
      el("button", { class: "btn btn-ghost btn-sm", type: "button", id: "sc-hint", onClick: m.actions.onHint }, t("sc.hint")),
      el("button", { class: "btn btn-ghost btn-sm", type: "button", id: "sc-reset", onClick: m.actions.onReset }, t("sc.reset")),
      el("span", { class: "text-tertiary" }, `${t("sc.attempts")}: ${m.attempts}`),
    ]),
  ];
  if (m.last) {
    kids.push(el("p", { class: `sc-verdict ${m.solved ? "feedback-safe" : "feedback-warn"}` }, m.solved ? t("sc.passed") : t("sc.notYet")));
    if (m.last.advisories.length) {
      kids.push(el("div", { class: "sc-block" }, [
        el("p", { class: "feedback-warn" }, t("sc.advisoryNote")),
        el("ul", { class: "sc-list" }, m.last.advisories.map((a) => el("li", {}, `${m.text.check(m.def.checks.find((c) => c.id === a.id) || a)} — ${a.detail}`))),
      ]));
    }
  }
  if (m.hintsVisible.length) kids.push(hintsBlock(m.hintsVisible, m.def.hints.length));
  if (m.solved || m.done) {
    kids.push(el("div", { class: "readout" }, [el("div", { class: "readout-label" }, t("sc.whyWorks")), el("div", { class: "sc-explain" }, m.text.completion)]));
  }
  return el("div", { class: "sc-view" }, kids);
}

function stepper(phase) {
  const labels = { briefing: t("sc.phase.briefing"), evidence: t("sc.phase.evidence"), diagnosis: t("sc.phase.diagnosis"), remediation: t("sc.phase.remediation"), verification: t("sc.phase.verification"), complete: t("sc.phase.complete") };
  const at = PHASES.indexOf(phase);
  return el("ol", { class: "sc-steps", "aria-label": t("sc.phases") }, PHASES.map((p, i) => el("li", {
    class: `sc-step ${i < at ? "sc-step-done" : i === at ? "sc-step-current" : ""}`,
    ...(i === at ? { "aria-current": "step" } : {}),
  }, [el("span", { class: "sc-step-n", "aria-hidden": "true" }, i < at ? "✓" : String(i + 1)), el("span", {}, labels[p]), i === at ? el("span", { class: "sr-only" }, ` (${t("sc.phase.current")})`) : null])));
}

/**
 * m: { def, text, snap, hintsVisible, hintTotal, diagLog, selected, summary, lastFix, reopened,
 *      actions:{onStart,onHint,onReset,onBack,onSelect,onDiagnose,onFixCheck} }
 */
export function buildInvestigationView(m) {
  const { snap, def, text } = m;
  const kids = [
    el("div", { class: "sc-head" }, [
      el("button", { class: "btn btn-ghost btn-sm", type: "button", id: "sc-back", onClick: m.actions.onBack }, t("sc.back")),
      badge(t("sc.kind.investigation"), "badge-warn"), el("span", { class: "xp-tag" }, `+${def.xp} ${t("sc.xp")}`),
    ]),
    el("h3", { class: "sc-title" }, text.title),
    stepper(snap.phase),
    el("div", { class: "sc-block" }, [el("h4", { class: "eyebrow" }, t("sc.incident")), el("p", {}, text.incident)]),
    objectivesBlock(text),
  ];

  if (snap.phase === "briefing") {
    kids.push(el("div", { class: "row wrap sc-actions" }, [el("button", { class: "btn btn-primary btn-sm", type: "button", id: "sc-start", onClick: m.actions.onStart }, t("sc.start"))]));
    return el("div", { class: "sc-view" }, kids);
  }

  // Evidence
  kids.push(el("div", { class: "sc-block" }, [
    el("h4", { class: "eyebrow" }, t("sc.evidence")),
    el("p", { class: "text-tertiary" }, t("sc.evidence.hint")),
    el("ul", { class: "sc-checks" }, def.evidence.map((e) => {
      const got = snap.evidence[e.id];
      return el("li", { class: `sc-check ${got ? "sc-pass" : "sc-pending"}` }, [
        el("span", { class: "sc-check-icon", "aria-hidden": "true" }, got ? "✓" : "○"),
        el("span", { class: "sc-check-body" }, [
          el("span", {}, text.evidence(e)),
          got ? el("span", { class: "sr-only" }, ` — ${t("sc.pass")}`) : el("span", { class: "text-tertiary" }, ` — ${t("sc.evidence.pending")}`),
          got ? el("span", { class: "sc-detail sc-mono" }, `$ ${got.command}\n${got.finding}`) : null,
        ]),
      ]);
    })),
  ]));

  // Diagnosis
  const diagOpen = snap.phase === "diagnosis";
  const diagPast = PHASES.indexOf(snap.phase) > PHASES.indexOf("diagnosis");
  const locked = snap.phase === "evidence";
  const diagKids = [el("legend", { class: "eyebrow" }, t("sc.diagnosis")), el("p", {}, t("sc.diagnosis.pick"))];
  def.diagnoses.forEach((d) => {
    const dt = text.diagnosis(d);
    diagKids.push(el("label", { class: "sc-radio" }, [
      el("input", { type: "radio", name: "sc-diagnosis", value: d.id, ...(m.selected === d.id ? { checked: "checked" } : {}), ...(!diagOpen ? { disabled: "disabled" } : {}), onChange: () => m.actions.onSelect(d.id) }),
      el("span", {}, dt.label),
    ]));
  });
  if (locked) {
    const missing = snap.missingEvidence.map((id) => text.evidence(def.evidence.find((e) => e.id === id))).join(" · ");
    diagKids.push(el("p", { class: "feedback-warn" }, `${t("sc.diagnosis.locked")} ${missing}`));
  }
  diagKids.push(el("button", { class: "btn btn-primary btn-sm", type: "button", id: "sc-diagnose", onClick: m.actions.onDiagnose, ...(!diagOpen ? { disabled: "disabled" } : {}) }, t("sc.diagnosis.submit")));
  const diagBlock = [el("fieldset", { class: "sc-fieldset" }, diagKids)];
  m.diagLog.forEach((d) => {
    diagBlock.push(el("div", { class: "sc-diag-entry" }, [
      el("p", { class: d.correct ? "feedback-safe" : "feedback-warn" }, `${d.correct ? t("sc.diagnosis.correct") : t("sc.diagnosis.wrong")} ${d.label}`),
      el("p", {}, d.why),
      el("p", { class: "sc-detail sc-mono" }, `${t("sc.diagnosis.live")} ${d.live}`),
    ]));
  });
  kids.push(el("div", { class: "sc-block" }, diagBlock));
  void diagPast;

  // Fix + verify
  if (["remediation", "verification", "complete"].includes(snap.phase)) {
    const fixKids = [el("h4", { class: "eyebrow" }, t("sc.fix")), el("p", { class: "text-tertiary" }, t("sc.fix.desc"))];
    if (snap.phase !== "complete") {
      fixKids.push(el("button", { class: "btn btn-primary btn-sm", type: "button", id: "sc-fixcheck", onClick: m.actions.onFixCheck }, t("sc.fix.check")));
    }
    if (m.reopened) fixKids.push(el("p", { class: "feedback-warn" }, t("sc.verify.reopened")));
    if (m.lastFix) {
      fixKids.push(el("ul", { class: "sc-checks" }, m.lastFix.results.map((r) => {
        const c = def.checks.find((x) => x.id === r.id);
        return checkRow(text.check(c || r), r.level, r.ok ? "pass" : "fail", r.ok ? "" : r.detail);
      })));
      fixKids.push(el("p", { class: m.lastFix.ok ? "feedback-safe" : "feedback-warn" }, m.lastFix.ok ? t("sc.fix.ok") : t("sc.fix.notyet")));
    }
    kids.push(el("div", { class: "sc-block" }, fixKids));
  }
  if (snap.phase === "verification") {
    kids.push(el("div", { class: "sc-block" }, [el("h4", { class: "eyebrow" }, t("sc.verify")), el("p", {}, t("sc.verify.desc"))]));
  }

  // Completion
  if (snap.phase === "complete" && m.summary) {
    kids.push(el("div", { class: "readout" }, [
      el("div", { class: "readout-label" }, `${t("sc.resolved")} ${t("sc.summary")}`),
      el("p", { class: "sc-explain" }, text.rootCause),
      el("p", { class: "sc-explain" }, `${t("sc.summary.final")}: ${m.summary.finalState}`),
      el("p", { class: "sc-explain" }, text.quality(m.summary.quality)),
      el("p", { class: "sc-explain text-tertiary" }, `${t("sc.summary.wrong")}: ${m.summary.wrongDiagnoses} · ${t("sc.summary.hints")}: ${m.summary.hintsUsed}`),
    ]));
  }

  // Hints + reset
  kids.push(el("div", { class: "row wrap sc-actions" }, [
    snap.phase !== "complete" ? el("button", { class: "btn btn-ghost btn-sm", type: "button", id: "sc-hint", onClick: m.actions.onHint }, t("sc.hint")) : null,
    el("button", { class: "btn btn-ghost btn-sm", type: "button", id: "sc-reset", onClick: m.actions.onReset }, t("sc.reset")),
  ]));
  if (m.hintsVisible.length) kids.push(hintsBlock(m.hintsVisible, m.hintTotal));
  return el("div", { class: "sc-view" }, kids);
}

export function buildScenarioList(items, progress, onOpen) {
  return el("div", { class: "challenge-grid sc-grid" }, items.map((def) => {
    const text = scenarioText(def);
    const done = !!progress[def.id];
    return el("div", { class: `challenge-card ${done ? "completed" : ""}` }, [
      el("div", { class: "challenge-card-head" }, [
        el("div", {}, [badge(def.kind === "investigation" ? t("sc.kind.investigation") : t("sc.kind.challenge"), def.kind === "investigation" ? "badge-warn" : "badge-info"), el("h4", {}, text.title)]),
        el("span", { class: "xp-tag" }, done ? "✓" : `+${def.xp} ${t("sc.xp")}`),
      ]),
      el("p", {}, def.kind === "investigation" ? text.incident : text.task),
      el("div", { class: "challenge-foot" }, [
        done ? badge(t("sc.done"), "badge-neutral") : el("span", {}),
        el("button", { class: "btn btn-primary btn-sm", type: "button", onClick: () => onOpen(def) }, done ? t("sc.review") : t("sc.open")),
      ]),
    ]);
  }));
}

/* -------------------------------- controller -------------------------------- */

let mount = null;
let current = null; // { def, kind, session } — session is a challenge session or an investigation
let ui = { selected: null, diagLog: [], reopened: false, lastFix: null, focusId: null };

function announce(text) {
  const live = qs("#scenario-live");
  if (live) live.textContent = text;
}
function syncShell() {
  try { refreshTerminalPrompt(); } catch { /* terminal not initialised */ }
  try { renderFilesystem(); } catch { /* filesystem view not mounted */ }
}

function leave() {
  if (current) { current.session.end(); current = null; syncShell(); }
  ui = { selected: null, diagLog: [], reopened: false, lastFix: null, focusId: null };
  setCommandObserver(null);
}

function open(def) {
  leave();
  const text = scenarioText(def);
  if (def.kind === "investigation") {
    current = { def, kind: "investigation", session: createInvestigation(def) };
    // The environment is built at "Start investigation"; briefing needs none.
  } else {
    const session = createChallengeSession(def);
    session.start();
    current = { def, kind: "challenge", session };
    terminalNotice(`${t("sc.loaded")} ${scenarioBase(def)} — ${text.title}`);
    syncShell();
  }
  setCommandObserver(onCommand);
  render("sc-back");
}

function onCommand(ev) {
  if (!current || current.kind !== "investigation") return;
  const before = current.session.phase;
  current.session.observe(ev);
  const after = current.session.phase;
  if (before === "verification" && after === "remediation") ui.reopened = true;
  if (after === "complete" && before !== "complete") finishInvestigation();
  if (before !== after || before === "evidence" || before === "diagnosis" || before === "verification") render(null);
  // "complete" already announced its own, more useful message in finishInvestigation().
  if (before !== after && after !== "complete") announce(t("sc.phase." + after));
}

function finishInvestigation() {
  const snap = current.session.state;
  markScenarioComplete(current.def.id, { attempts: snap.fixAttempts + snap.diagnosisAttempts.length, hintsUsed: snap.hintsUsed });
  toast(`+${current.def.xp} ${t("sc.xp")}`, "success");
  announce(t("sc.resolved"));
}

const actions = {
  onBack: () => { leave(); render(null); },
  onStart: () => {
    current.session.start();
    terminalNotice(`${t("sc.loaded")} ${scenarioBase(current.def)}`);
    syncShell(); render("sc-hint");
  },
  onReset: () => {
    current.session.reset();
    ui = { selected: null, diagLog: [], reopened: false, lastFix: null, focusId: null };
    if (current.kind === "challenge") { terminalNotice(`${t("sc.reset.done")} (${scenarioBase(current.def)})`); }
    else { terminalNotice(`${t("sc.reset.done")} (${scenarioBase(current.def)})`); }
    syncShell(); announce(t("sc.reset.done")); render("sc-reset");
  },
  onHint: () => {
    const h = current.session.hints ? current.session.hints.next() : current.session.nextHint();
    if (!h) { toast(t("sc.noMoreHints"), "default"); announce(t("sc.noMoreHints")); return; }
    render("sc-hint");
  },
  onCheck: () => {
    const r = current.session.check();
    if (r.ok) {
      markScenarioComplete(current.def.id, { attempts: current.session.attempts, hintsUsed: current.session.hints.revealed });
      toast(`+${current.def.xp} ${t("sc.xp")}`, "success");
    }
    announce(r.ok ? t("sc.passed") : t("sc.notYet"));
    render("sc-check");
  },
  onSelect: (id) => { ui.selected = id; },
  onDiagnose: () => {
    if (!ui.selected) { announce(t("sc.diagnosis.none")); toast(t("sc.diagnosis.none"), "default"); return; }
    const inv = current.session;
    const res = inv.diagnose(ui.selected);
    if (res.ok) {
      const d = current.def.diagnoses.find((x) => x.id === ui.selected);
      const dt = scenarioText(current.def).diagnosis(d);
      ui.diagLog.push({ label: dt.label, correct: res.correct, why: dt.why, live: res.feedback });
      ui.selected = res.correct ? ui.selected : null;
      announce(res.correct ? t("sc.diagnosis.correct") : t("sc.diagnosis.wrong"));
    }
    render("sc-diagnose");
  },
  onFixCheck: () => {
    const res = current.session.checkFix();
    if (res.ok) { ui.lastFix = res.result; ui.reopened = false; announce(res.fixed ? t("sc.fix.ok") : t("sc.fix.notyet")); }
    render("sc-fixcheck");
  },
};

function render(focusId) {
  if (!mount) return;
  const heading = el("div", { class: "sc-intro" }, [
    el("h3", { class: "sc-panel-title", id: "scenario-heading" }, t("sc.title")),
    el("p", { class: "text-secondary" }, t("sc.desc")),
  ]);
  let body;
  if (!current) {
    body = buildScenarioList(SCENARIOS, getScenarioProgress(), open);
  } else if (current.kind === "challenge") {
    const s = current.session; const text = scenarioText(current.def);
    body = buildChallengeView({
      def: current.def, text, done: !!getScenarioProgress()[current.def.id], last: s.last, attempts: s.attempts, solved: s.solved,
      hintsVisible: text.hints.slice(0, s.hints.revealed), actions,
    });
  } else {
    const inv = current.session; const text = scenarioText(current.def);
    const snap = inv.state;
    body = buildInvestigationView({
      def: current.def, text, snap, hintsVisible: (text.hints[snap.phase] || []).slice(0, inv.hintsFor(snap.phase).length),
      hintTotal: inv.hintTotal(snap.phase), diagLog: ui.diagLog, selected: ui.selected,
      summary: inv.summary(), lastFix: ui.lastFix, reopened: ui.reopened, actions,
    });
  }
  mount.replaceChildren(heading, body);
  if (focusId) qs(`#${focusId}`, mount)?.focus();
}

export function initScenarios() {
  mount = qs("#scenario-mount");
  if (!mount) return;
  render(null);
  onLocaleChanged(() => render(null));
}

export { CHALLENGE_SCENARIOS, activeScenarioId };
