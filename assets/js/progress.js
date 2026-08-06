/**
 * progress.js
 * New in v2.1 — aggregates XP, level, and stats from Challenges, Labs and
 * Quiz into one dashboard, renders the Achievement grid, and unlocks a
 * printable completion certificate once the learner has cleared enough
 * of the material. Everything here is derived from localStorage state
 * already owned by the other modules — progress.js stores nothing new.
 */

import { qs, el, onProgressChanged, copyToClipboard, toast, navigateToView } from "./utils.js";
import { CHALLENGES } from "./challenges-data.js";
import { getChallengeProgress, challengeTotalXP, challengeMaxXP } from "./challenges.js";
import { getQuizStats } from "./quiz.js";
import { getLabsProgress } from "./labs.js";
import { LABS } from "./labs-data.js";
import { renderAchievementGrid, earnedAchievementCount, totalAchievementCount, computeAchievements } from "./achievements.js";
import { readTopicCount, totalTopicCount, firstUnreadTopicId } from "./learn.js";
import { t, onLocaleChanged } from "./i18n.js";

const LEVEL_STEP_XP = 250;

export function computeTotals() {
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

/* ---------------------------- Share / export (v2.3) ---------------------------- */
/* Roadmap item: "Exportable/shareable JSON progress". Everything here is
   derived read-only from the same localStorage-backed state the rest of
   this file already reads — no new persistent storage is introduced. */

export function buildProgressSnapshot() {
  const totals = computeTotals();
  const challengeProgress = getChallengeProgress();
  const labsProgress = getLabsProgress();
  const quiz = getQuizStats();
  const achievements = computeAchievements();

  return {
    product: "Linux Permission Lab",
    schema: "lpl-progress-v1",
    exportedAt: new Date().toISOString(),
    level: totals.level,
    totalXP: totals.totalXP,
    xpBreakdown: { challenges: totals.challengeXP, labs: totals.labsXP, quiz: totals.quizXP },
    challenges: { completed: Object.keys(challengeProgress).length, total: CHALLENGES.length },
    labs: { completed: Object.keys(labsProgress).length, total: LABS.length },
    quiz: {
      roundsPlayed: quiz.roundsPlayed,
      totalAnswered: quiz.totalAnswered,
      totalCorrect: quiz.totalCorrect,
      accuracyPct: quiz.totalAnswered ? Math.round((quiz.totalCorrect / quiz.totalAnswered) * 100) : 0,
      bestRoundScore: quiz.bestScore,
    },
    achievements: {
      earned: achievements.filter((a) => a.earned).map((a) => a.id),
      total: achievements.length,
    },
  };
}

function buildShareText(snapshot) {
  return `Linux Permission Lab — ${t("progress.level")} ${snapshot.level} (${snapshot.totalXP} ${t("progress.totalXP")}) · ` +
    `${snapshot.challenges.completed}/${snapshot.challenges.total} ${t("nav.challenges")} · ` +
    `${snapshot.labs.completed}/${snapshot.labs.total} ${t("nav.labs")} · ` +
    `${snapshot.quiz.accuracyPct}% ${t("progress.quizAccuracy")} · ` +
    `${snapshot.achievements.earned.length}/${snapshot.achievements.total} ${t("progress.achievements")} 🔐`;
}

function downloadJSON(snapshot) {
  try {
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const date = snapshot.exportedAt.slice(0, 10);
    a.href = url;
    a.download = `permission-lab-progress-${date}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast(t("progress.share.exportSuccess"), "success");
  } catch {
    toast(t("progress.share.exportError"), "error");
  }
}

function renderSharePanel() {
  const mount = qs("#progress-share-mount");
  if (!mount) return;
  const totals = computeTotals();
  mount.innerHTML = "";
  mount.append(el("div", { class: "panel" }, [
    el("div", { class: "row between", style: "margin-bottom:var(--space-3)" }, [
      el("div", { class: "panel-title", style: "margin-bottom:0" }, [el("span", { class: "dot" }), t("progress.share.title")]),
      el("span", { class: "badge badge-info" }, `${t("progress.level")} ${totals.level}`),
    ]),
    el("p", { class: "text-secondary", style: "font-size:0.85rem;margin-bottom:var(--space-4)" }, t("progress.share.desc")),
    el("div", { class: "row wrap", style: "gap:var(--space-2)" }, [
      el("button", {
        class: "btn btn-ghost btn-sm", type: "button",
        onClick: () => copyToClipboard(buildShareText(buildProgressSnapshot()), t("toast.copied")),
      }, t("progress.share.copyBtn")),
      el("button", {
        class: "btn btn-ghost btn-sm", type: "button",
        onClick: () => downloadJSON(buildProgressSnapshot()),
      }, t("progress.share.downloadBtn")),
    ]),
  ]));
}

/* ---------------------------- Guided Path (v2.3) ---------------------------- */
/* A suggested order through the four modules — Learn, Labs, Challenges,
   Quiz — built entirely from progress data the other modules already own.
   Nothing new is persisted here beyond the topic read-tracking that lives
   in learn.js itself. */

export function computePathPhases() {
  const challengesDone = Object.keys(getChallengeProgress()).length;
  const labsDone = Object.keys(getLabsProgress()).length;
  const quiz = getQuizStats();
  return [
    { id: "learn", view: "learn", done: readTopicCount(), total: totalTopicCount(), complete: readTopicCount() >= totalTopicCount() },
    { id: "labs", view: "labs", done: labsDone, total: LABS.length, complete: labsDone >= LABS.length },
    { id: "challenges", view: "challenges", done: challengesDone, total: CHALLENGES.length, complete: challengesDone >= CHALLENGES.length },
    { id: "quiz", view: "quiz", done: quiz.roundsPlayed, total: 1, complete: quiz.roundsPlayed >= 1, isQuiz: true },
  ];
}

function renderPathPanel() {
  const mount = qs("#progress-path-mount");
  if (!mount) return;
  const phases = computePathPhases();
  const nextPhase = phases.find((p) => !p.complete);

  const steps = phases.map((p, i) => {
    const status = p.complete ? "done" : nextPhase && nextPhase.id === p.id ? "current" : "upcoming";
    const pct = p.isQuiz ? (p.complete ? 100 : 0) : Math.min(100, Math.round((p.done / p.total) * 100));
    return el("div", { class: `path-step path-step-${status}` }, [
      el("div", { class: "path-step-head" }, [
        el("span", { class: "path-step-index" }, status === "done" ? "✓" : String(i + 1)),
        el("span", { class: "path-step-label" }, t(`nav.${p.id}`)),
      ]),
      el("div", { class: "path-step-bar" }, [el("div", { class: "path-step-bar-fill", style: `width:${pct}%` })]),
      el("span", { class: "path-step-count" }, p.isQuiz ? (p.complete ? t("path.quizDone") : t("path.quizTodo")) : `${p.done}/${p.total}`),
    ]);
  });

  const children = [
    el("div", { class: "panel-title" }, [el("span", { class: "dot" }), t("path.title")]),
    el("p", { class: "text-secondary", style: "font-size:0.85rem;margin-bottom:var(--space-4)" }, t("path.desc")),
    el("div", { class: "path-steps" }, steps),
  ];

  if (nextPhase) {
    children.push(el("button", {
      class: "btn btn-primary btn-sm", type: "button", style: "margin-top:var(--space-4)",
      onClick: () => navigateToView(nextPhase.view, nextPhase.id === "learn" ? { focusTopicId: firstUnreadTopicId() } : {}),
    }, `${t("path.continue")} ${t(`nav.${nextPhase.id}`)} →`));
  } else {
    children.push(el("div", { class: "path-complete-banner", style: "margin-top:var(--space-4)" }, `🎉 ${t("path.allDone")}`));
  }

  mount.innerHTML = "";
  mount.append(el("div", { class: "panel" }, children));
}

export function initProgress() {
  renderStatsPanel();
  renderPathPanel();
  renderCertificate();
  renderSharePanel();
  renderAchievementGrid("#achievement-grid-mount");
  onProgressChanged(() => {
    renderStatsPanel();
    renderPathPanel();
    renderCertificate();
    renderSharePanel();
    renderAchievementGrid("#achievement-grid-mount");
  });
  onLocaleChanged(() => {
    renderStatsPanel();
    renderPathPanel();
    renderCertificate();
    renderSharePanel();
    renderAchievementGrid("#achievement-grid-mount");
  });
}
