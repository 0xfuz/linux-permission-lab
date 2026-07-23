/**
 * challenges.js
 * Module 7 — Challenges (rendering + grading logic).
 * Data lives in challenges-data.js (80 labs across 4 tiers) so this file
 * stays focused on UI and progress tracking. Progress persists to
 * localStorage via utils.js, and every completion notifies the shared
 * progress event bus so Achievements/Progress views can react. v2.2 adds
 * Arabic localization via challenges-data.ar.js merged in per-id.
 */

import { qs, qsa, el, toast, loadState, saveState, onProgressChanged, emitProgressChanged } from "./utils.js";
import { validateOctalInput, stateToSymbolic, octalToState } from "./converter.js";
import { CHALLENGES } from "./challenges-data.js";
import { CHALLENGES_AR } from "./challenges-data.ar.js";
import { t, localize, onLocaleChanged } from "./i18n.js";

export { CHALLENGES };

const TIERS = ["All", "Beginner", "Intermediate", "Advanced", "Expert"];

function localizedChallenges() {
  return localize(CHALLENGES, CHALLENGES_AR);
}

export function getChallengeProgress() {
  const s = loadState();
  return s.challengeProgress || {};
}

function setCompleted(id, xp) {
  const progress = getChallengeProgress();
  if (progress[id]) return progress; // already completed, no double XP
  progress[id] = { completedAt: Date.now(), xp };
  saveState({ challengeProgress: progress });
  emitProgressChanged();
  return progress;
}

export function challengeTotalXP(progress = getChallengeProgress()) {
  return Object.values(progress).reduce((sum, p) => sum + (p.xp || 0), 0);
}

export function challengeMaxXP() {
  return CHALLENGES.reduce((s, c) => s + c.xp, 0);
}

function updateXPWidget() {
  const progress = getChallengeProgress();
  const xp = challengeTotalXP(progress);
  const maxXp = challengeMaxXP();
  const label = qs("#xp-widget-label");
  const fill = qs("#xp-widget-fill");
  if (label) label.textContent = `${xp} / ${maxXp} XP`;
  if (fill) fill.style.width = `${maxXp ? Math.round((xp / maxXp) * 100) : 0}%`;
}

let activeTier = "All";

function renderChallengeGrid() {
  const grid = qs("#challenge-grid");
  if (!grid) return;
  const progress = getChallengeProgress();
  grid.innerHTML = "";
  const all = localizedChallenges();
  const filtered = activeTier === "All" ? all : all.filter((c) => c.tier === activeTier);

  filtered.forEach((c) => {
    const completed = !!progress[c.id];
    const card = el("div", { class: `challenge-card ${completed ? "completed" : ""}` }, [
      el("div", { class: "challenge-card-head" }, [
        el("div", {}, [
          el("span", { class: "badge badge-info", style: "margin-bottom:6px;display:inline-block" }, t("ch.tier." + c.tier)),
          el("h3", {}, c.title),
        ]),
        el("span", { class: "xp-tag" }, completed ? "✓" : `+${c.xp} XP`),
      ]),
      el("p", {}, c.description),
      el("div", { class: "challenge-foot" }, [
        el("span", { class: "badge badge-neutral" }, `${t("ch.target")}: ${c.target}`),
        el("button", { class: "btn btn-primary btn-sm", type: "button", onClick: () => openChallengeModal(c) }, completed ? t("ch.review") : t("ch.attempt")),
      ]),
    ]);
    grid.append(card);
  });

  const empty = qs("#challenge-empty-state");
  if (empty) { empty.hidden = filtered.length > 0; empty.textContent = t("ch.empty"); }
}

function renderTabs() {
  const tabs = qs("#challenge-tabs");
  if (!tabs) return;
  tabs.innerHTML = "";
  TIERS.forEach((tier) => {
    const count = tier === "All" ? CHALLENGES.length : CHALLENGES.filter((c) => c.tier === tier).length;
    const btn = el("button", {
      class: `btn btn-sm ${activeTier === tier ? "btn-primary" : "btn-ghost"}`,
      type: "button",
      onClick: () => { activeTier = tier; renderTabs(); renderChallengeGrid(); },
    }, `${t("ch.tier." + tier)} (${count})`);
    tabs.append(btn);
  });
}

let currentChallenge = null;
let hintsRevealed = 0;

function openChallengeModal(challenge) {
  currentChallenge = challenge;
  hintsRevealed = 0;
  const overlay = qs("#challenge-modal-overlay");
  const modal = qs("#challenge-modal");
  if (!overlay || !modal) return;

  const targetState = octalToState(challenge.target);
  const progress = getChallengeProgress();
  const alreadyDone = !!progress[challenge.id];

  modal.innerHTML = "";
  modal.append(
    el("button", { class: "btn btn-ghost btn-icon modal-close", type: "button", "aria-label": "Close", onClick: closeModal }, "✕"),
    el("span", { class: "badge badge-info" }, t("ch.tier." + challenge.tier)),
    el("h2", { style: "margin-top:10px" }, challenge.title),
    el("p", { class: "text-tertiary", style: "font-family:var(--font-mono);font-size:0.8rem;margin-bottom:2px" }, `${t("ch.scenario")}: ${challenge.scenario}`),
    el("p", {}, challenge.description),
    el("div", { class: "readout", style: "margin-bottom:16px" }, [
      el("div", { class: "readout-label" }, "Symbolic"),
      el("div", { class: "readout-value" }, stateToSymbolic(targetState).slice(1)),
    ]),
    el("label", { class: "eyebrow", for: "challenge-answer-input", style: "display:block;margin-bottom:8px" }, t("ch.yourAnswer")),
    el("input", { id: "challenge-answer-input", class: "terminal-input", style: "background:var(--bg-inset);border:1px solid var(--border-hairline);border-radius:8px;padding:10px 12px;width:100%;font-family:var(--font-mono);margin-bottom:8px", placeholder: "e.g. 755", autocomplete: "off" }),
    el("div", { id: "challenge-answer-feedback", style: "min-height:20px;font-size:0.85rem;margin-bottom:12px" }),
    el("div", { class: "row wrap", style: "margin-bottom:8px" }, [
      el("button", { class: "btn btn-ghost btn-sm", type: "button", onClick: revealHint }, t("ch.showHint")),
      el("button", { class: "btn btn-primary btn-sm", type: "button", onClick: checkAnswer }, t("ch.checkAnswer")),
    ]),
    el("div", { id: "challenge-hints" }, []),
    el("div", { id: "challenge-explanation", style: "margin-top:12px" }, alreadyDone ? explanationNode(challenge) : "")
  );

  overlay.classList.add("active");
  setTimeout(() => qs("#challenge-answer-input")?.focus(), 50);
}

function explanationNode(challenge) {
  return el("div", { class: "readout" }, [
    el("div", { class: "readout-label" }, t("ch.whyWorks")),
    el("div", { style: "color:var(--text-secondary);font-size:0.85rem" }, challenge.explanation),
  ]);
}

function closeModal() {
  qs("#challenge-modal-overlay")?.classList.remove("active");
  currentChallenge = null;
}

function revealHint() {
  if (!currentChallenge) return;
  const hintsMount = qs("#challenge-hints");
  if (hintsRevealed >= currentChallenge.hints.length) {
    toast(t("toast.noMoreHints"), "default");
    return;
  }
  const hint = currentChallenge.hints[hintsRevealed];
  hintsRevealed += 1;
  hintsMount.append(el("div", { class: "readout", style: "margin-top:8px", html: `<span class="readout-label">${hintsRevealed}</span><div style="color:var(--text-secondary);font-size:0.85rem">${hint}</div>` }));
}

function checkAnswer() {
  if (!currentChallenge) return;
  const input = qs("#challenge-answer-input");
  const feedback = qs("#challenge-answer-feedback");
  const { valid, message } = validateOctalInput(input.value);
  if (!valid) { feedback.innerHTML = `<span style="color:var(--crit-500)">${message}</span>`; return; }

  const normalized = input.value.trim().replace(/^0+(?=\d)/, "");
  const target = currentChallenge.target.replace(/^0+(?=\d)/, "");
  const isCorrect = normalized === target || normalized.padStart(target.length, "0") === target;

  if (isCorrect) {
    feedback.innerHTML = `<span style="color:var(--safe-500)">${t("quiz.correct")}! ${currentChallenge.target}</span>`;
    setCompleted(currentChallenge.id, currentChallenge.xp);
    updateXPWidget();
    renderChallengeGrid();
    qs("#challenge-explanation")?.replaceChildren(explanationNode(currentChallenge));
    toast(`+${currentChallenge.xp} XP`, "success");
  } else {
    feedback.innerHTML = `<span style="color:var(--warn-500)">${t("ch.checkAnswer") === "Check answer" ? "Not quite — try again, or reveal a hint." : "ليست صحيحة تمامًا — حاول مجددًا أو اطّلع على تلميح."}</span>`;
  }
}

export function pickRandomChallenge() {
  const progress = getChallengeProgress();
  const all = localizedChallenges();
  const incomplete = all.filter((c) => !progress[c.id]);
  const pool = incomplete.length ? incomplete : all;
  const choice = pool[Math.floor(Math.random() * pool.length)];
  openChallengeModal(choice);
}

export function initChallenges() {
  renderTabs();
  renderChallengeGrid();
  updateXPWidget();

  qs("#random-challenge-btn")?.addEventListener("click", pickRandomChallenge);
  qs("#challenge-modal-overlay")?.addEventListener("click", (e) => {
    if (e.target.id === "challenge-modal-overlay") closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });
  onProgressChanged(updateXPWidget);
  onLocaleChanged(() => { closeModal(); renderTabs(); renderChallengeGrid(); });
}
