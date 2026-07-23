/**
 * progress.js
 * New in v2.1 — aggregates XP, level, and stats from Challenges, Labs and
 * Quiz into one dashboard, renders the Achievement grid, and unlocks a
 * printable completion certificate once the learner has cleared enough
 * of the material. Everything here is derived from localStorage state
 * already owned by the other modules — progress.js stores nothing new.
 */

import { qs, el, onProgressChanged } from "./utils.js";
import { CHALLENGES } from "./challenges-data.js";
import { getChallengeProgress, challengeTotalXP, challengeMaxXP } from "./challenges.js";
import { getQuizStats } from "./quiz.js";
import { getLabsProgress } from "./labs.js";
import { LABS } from "./labs-data.js";
import { renderAchievementGrid, earnedAchievementCount, totalAchievementCount } from "./achievements.js";
import { t, onLocaleChanged } from "./i18n.js";

const LEVEL_STEP_XP = 250;

function computeTotals() {
  const challengeXP = challengeTotalXP();
  const labsProgress = getLabsProgress();
  const labsXP = Object.values(labsProgress).reduce((s, p) => s + (p.xp || 0), 0);
  const quiz = getQuizStats();
  const quizXP = quiz.totalCorrect * 5;
  const totalXP = challengeXP + labsXP + quizXP;
  const level = Math.floor(totalXP / LEVEL_STEP_XP) + 1;
  const xpIntoLevel = totalXP % LEVEL_STEP_XP;
  return { challengeXP, labsXP, quizXP, totalXP, level, xpIntoLevel };
}

function renderStatsPanel() {
  const mount = qs("#progress-stats-mount");
  if (!mount) return;
  const totals = computeTotals();
  const challengeProgress = getChallengeProgress();
  const labsProgress = getLabsProgress();
  const quiz = getQuizStats();

  mount.innerHTML = "";
  mount.append(
    el("div", { class: "panel", style: "margin-bottom:var(--space-5)" }, [
      el("div", { class: "row between", style: "margin-bottom:var(--space-3)" }, [
        el("div", { class: "panel-title", style: "margin-bottom:0" }, [el("span", { class: "dot" }), `${t("progress.level")} ${totals.level}`]),
        el("span", { class: "badge badge-info" }, `${totals.totalXP} ${t("progress.totalXP")}`),
      ]),
      el("div", { class: "xp-bar-track", style: "height:8px" }, [
        el("div", { class: "xp-bar-fill", style: `width:${Math.round((totals.xpIntoLevel / LEVEL_STEP_XP) * 100)}%` }),
      ]),
      el("p", { class: "text-tertiary", style: "font-size:0.78rem;margin-top:8px;margin-bottom:0" }, `${totals.xpIntoLevel} / ${LEVEL_STEP_XP} ${t("progress.xpToNext")} ${totals.level + 1}`),
    ]),
    el("div", { class: "output-grid", style: "margin-bottom:var(--space-5)" }, [
      el("div", { class: "readout" }, [el("div", { class: "readout-label" }, t("progress.challengesCompleted")), el("div", { class: "readout-value" }, `${Object.keys(challengeProgress).length}/${CHALLENGES.length}`)]),
      el("div", { class: "readout" }, [el("div", { class: "readout-label" }, t("progress.labsCompleted")), el("div", { class: "readout-value" }, `${Object.keys(labsProgress).length}/${LABS.length}`)]),
      el("div", { class: "readout" }, [el("div", { class: "readout-label" }, t("progress.roundsPlayed")), el("div", { class: "readout-value" }, String(quiz.roundsPlayed))]),
      el("div", { class: "readout" }, [el("div", { class: "readout-label" }, t("progress.quizAccuracy")), el("div", { class: "readout-value" }, `${quiz.totalAnswered ? Math.round((quiz.totalCorrect / quiz.totalAnswered) * 100) : 0}%`)]),
      el("div", { class: "readout" }, [el("div", { class: "readout-label" }, t("progress.bestQuizRound")), el("div", { class: "readout-value" }, `${quiz.bestScore}/10`)]),
      el("div", { class: "readout" }, [el("div", { class: "readout-label" }, t("progress.achievements")), el("div", { class: "readout-value" }, `${earnedAchievementCount()}/${totalAchievementCount()}`)]),
    ])
  );
}

function renderCertificate() {
  const mount = qs("#progress-certificate-mount");
  if (!mount) return;
  const challengeProgress = getChallengeProgress();
  const labsProgress = getLabsProgress();
  const challengesDone = Object.keys(challengeProgress).length;
  const labsDone = Object.keys(labsProgress).length;
  const unlocked = challengesDone >= CHALLENGES.length && labsDone >= LABS.length;
  const pct = Math.round(((challengesDone / CHALLENGES.length) + (labsDone / LABS.length)) / 2 * 100);

  mount.innerHTML = "";
  if (!unlocked) {
    mount.append(el("div", { class: "panel" }, [
      el("div", { class: "panel-title" }, [el("span", { class: "dot" }), t("progress.certificate")]),
      el("p", {}, `${t("progress.certLocked")} ${pct}%.`),
    ]));
    return;
  }
  mount.append(el("div", { class: "panel", id: "certificate-card" }, [
    el("div", { class: "panel-title" }, [el("span", { class: "dot" }), t("progress.certificate")]),
    el("h2", { style: "margin-bottom:6px" }, "Linux Permission Lab"),
    el("p", { style: "margin-bottom:4px" }, t("progress.certUnlockedLine1")),
    el("p", { class: "text-tertiary", style: "font-size:0.85rem" }, t("progress.certUnlockedLine2")),
    el("button", { class: "btn btn-primary btn-sm", type: "button", onClick: () => window.print() }, t("progress.printCert")),
  ]));
}

export function initProgress() {
  renderStatsPanel();
  renderCertificate();
  renderAchievementGrid("#achievement-grid-mount");
  onProgressChanged(() => {
    renderStatsPanel();
    renderCertificate();
    renderAchievementGrid("#achievement-grid-mount");
  });
  onLocaleChanged(() => {
    renderStatsPanel();
    renderCertificate();
    renderAchievementGrid("#achievement-grid-mount");
  });
}
