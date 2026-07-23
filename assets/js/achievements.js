/**
 * achievements.js
 * New in v2.1 — badge/achievement system computed from the same
 * localStorage progress data used by Challenges, Quiz and Labs. Nothing
 * here is stored independently; achievements are always *derived*, so
 * they can never drift out of sync with the underlying progress.
 */

import { el, qs, loadState, onProgressChanged } from "./utils.js";
import { t, onLocaleChanged } from "./i18n.js";
import { CHALLENGES } from "./challenges-data.js";
import { getChallengeProgress } from "./challenges.js";
import { getQuizStats } from "./quiz.js";
import { getLabsProgress } from "./labs.js";

const ICONS = {
  spark: '<path d="M12 2 14 9 21 12 14 15 12 22 10 15 3 12 10 9 12 2Z"/>',
  shield: '<path d="M12 2 20 6v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6l8-4Z"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="0.8" fill="currentColor"/>',
  crown: '<path d="M4 18h16l1-9-5 4-4-7-4 7-5-4 1 9Z"/>',
  binary: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12 20 3M17 6l3 3M14 9l2.5 2.5"/>',
  book: '<path d="M4 4h9a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3V4Z"/><path d="M16 4h4v16h-4"/>',
  trophy: '<path d="M8 4h8v4a4 4 0 0 1-8 0V4Z"/><path d="M6 4H4v2a4 4 0 0 0 4 4M18 4h2v2a4 4 0 0 1-4 4"/><path d="M10 15h4v3h-4zM8 21h8"/>',
  graduate: '<path d="M12 3 2 8l10 5 10-5-10-5Z"/><path d="M6 11v5c0 1.5 2.5 3 6 3s6-1.5 6-3v-5"/>',
  balance: '<path d="M12 3v18M7 7 3 15a4 4 0 0 0 8 0L7 7ZM17 7l-4 8a4 4 0 0 0 8 0l-4-8ZM4 7h16"/>',
};

function suidBitSet(target) {
  if (target.length !== 4) return false;
  return (parseInt(target[0], 10) & 4) !== 0;
}

const SUID_CHALLENGE_IDS = new Set(CHALLENGES.filter((c) => suidBitSet(c.target)).map((c) => c.id));

export function computeAchievements() {
  const challengeProgress = getChallengeProgress();
  const completedIds = Object.keys(challengeProgress);
  const completedCount = completedIds.length;
  const beginnerTotal = CHALLENGES.filter((c) => c.tier === "Beginner").length;
  const beginnerDone = CHALLENGES.filter((c) => c.tier === "Beginner" && challengeProgress[c.id]).length;
  const expertTotal = CHALLENGES.filter((c) => c.tier === "Expert").length;
  const expertDone = CHALLENGES.filter((c) => c.tier === "Expert" && challengeProgress[c.id]).length;
  const suidDone = completedIds.filter((id) => SUID_CHALLENGE_IDS.has(id)).length;

  const quiz = getQuizStats();
  const labs = getLabsProgress();
  const labsDone = Object.keys(labs).length;

  const list = [
    { id: "first-steps", title: t("ach.first-steps.title"), icon: "spark", description: t("ach.first-steps.desc"), earned: completedCount >= 1 },
    { id: "linux-apprentice", title: t("ach.linux-apprentice.title"), icon: "book", description: t("ach.linux-apprentice.desc"), earned: beginnerDone >= beginnerTotal, progress: `${beginnerDone}/${beginnerTotal}` },
    { id: "challenge-hunter", title: t("ach.challenge-hunter.title"), icon: "target", description: t("ach.challenge-hunter.desc"), earned: completedCount >= 10, progress: `${completedCount}/10` },
    { id: "permission-master", title: t("ach.permission-master.title"), icon: "crown", description: t("ach.permission-master.desc"), earned: completedCount >= CHALLENGES.length, progress: `${completedCount}/${CHALLENGES.length}` },
    { id: "suid-explorer", title: t("ach.suid-explorer.title"), icon: "key", description: t("ach.suid-explorer.desc"), earned: suidDone >= 5, progress: `${suidDone}/5` },
    { id: "special-bits-master", title: t("ach.special-bits-master.title"), icon: "shield", description: t("ach.special-bits-master.desc"), earned: expertDone >= expertTotal, progress: `${expertDone}/${expertTotal}` },
    { id: "quiz-rookie", title: t("ach.quiz-rookie.title"), icon: "binary", description: t("ach.quiz-rookie.desc"), earned: quiz.roundsPlayed >= 1 },
    { id: "perfect-score", title: t("ach.perfect-score.title"), icon: "trophy", description: t("ach.perfect-score.desc"), earned: quiz.bestScore >= 10 },
    { id: "quiz-whiz", title: t("ach.quiz-whiz.title"), icon: "binary", description: t("ach.quiz-whiz.desc"), earned: quiz.totalCorrect >= 50, progress: `${quiz.totalCorrect}/50` },
    { id: "lab-graduate", title: t("ach.lab-graduate.title"), icon: "graduate", description: t("ach.lab-graduate.desc"), earned: labsDone >= 10, progress: `${labsDone}/10` },
    { id: "well-rounded", title: t("ach.well-rounded.title"), icon: "balance", description: t("ach.well-rounded.desc"), earned: completedCount >= 1 && quiz.roundsPlayed >= 1 && labsDone >= 1 },
  ];

  const legendEarned = list.every((a) => a.earned);
  list.push({ id: "permission-legend", title: t("ach.permission-legend.title"), icon: "crown", description: t("ach.permission-legend.desc"), earned: legendEarned });

  return list;
}

function iconSvg(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">${ICONS[name] || ICONS.spark}</svg>`;
}

export function renderAchievementGrid(mountSelector) {
  const mount = qs(mountSelector);
  if (!mount) return;
  mount.innerHTML = "";
  const achievements = computeAchievements();
  achievements.forEach((a) => {
    mount.append(el("div", { class: `achievement-badge ${a.earned ? "earned" : "locked"}` }, [
      el("div", { class: "achievement-icon", html: iconSvg(a.icon) }),
      el("div", { class: "achievement-info" }, [
        el("h4", {}, a.title),
        el("p", {}, a.description),
        a.progress ? el("span", { class: "badge badge-neutral" }, a.progress) : "",
      ]),
      el("span", { class: `badge ${a.earned ? "badge-safe" : "badge-neutral"}` }, a.earned ? t("progress.earned") : t("progress.locked")),
    ]));
  });
}

export function earnedAchievementCount() {
  return computeAchievements().filter((a) => a.earned).length;
}

export function totalAchievementCount() {
  return computeAchievements().length;
}
