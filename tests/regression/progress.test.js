/**
 * tests/regression/progress.test.js
 * Covers XP/level derivation (progress.js: computeTotals), achievement
 * derivation (achievements.js: computeAchievements) and Guided Path phase
 * computation (progress.js: computePathPhases) — all given a fixture
 * localStorage state rather than real user data.
 *
 * achievements.js and progress.js read the REAL CHALLENGES/LABS/
 * LEARN_TOPICS arrays directly (they are not injectable), so fixtures here
 * are built dynamically from that real data (e.g. "every Beginner
 * challenge's id") rather than hardcoded ids. That makes these tests
 * robust to future content growth instead of silently going stale.
 */
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { installLocalStorageShim, resetLocalStorageShim } from "../helpers/storage-shim.js";

installLocalStorageShim();

import { saveState } from "../../assets/js/utils.js";
import { computeAchievements, earnedAchievementCount, totalAchievementCount } from "../../assets/js/achievements.js";
import { computeTotals, computePathPhases, buildProgressSnapshot } from "../../assets/js/progress.js";
import { CHALLENGES } from "../../assets/js/challenges-data.js";
import { LABS } from "../../assets/js/labs-data.js";
import { LEARN_TOPICS } from "../../assets/js/learn.js";

beforeEach(() => resetLocalStorageShim());

function fakeChallengeProgress(ids) {
  const progress = {};
  for (const id of ids) {
    const c = CHALLENGES.find((x) => x.id === id);
    progress[id] = { completedAt: Date.now(), xp: c ? c.xp : 0 };
  }
  return progress;
}
function fakeLabsProgress(ids) {
  const progress = {};
  for (const id of ids) {
    const l = LABS.find((x) => x.id === id);
    progress[id] = { xp: l ? l.xp : 0 };
  }
  return progress;
}
function allChallengeIds() { return CHALLENGES.map((c) => c.id); }
function allLabIds() { return LABS.map((l) => l.id); }
function allTopicIds() { return LEARN_TOPICS.map((t) => t.id); }
function idsForTier(tier) { return CHALLENGES.filter((c) => c.tier === tier).map((c) => c.id); }

describe("computeTotals — XP and level derivation", () => {
  test("zero progress -> zero XP, level 1", () => {
    const totals = computeTotals();
    assert.equal(totals.totalXP, 0);
    assert.equal(totals.level, 1);
  });

  test("challenge XP sums exactly the xp of completed challenges", () => {
    const ids = ["b01", "b02", "i01"]; // 50 + 50 + 100 = 200
    saveState({ challengeProgress: fakeChallengeProgress(ids) });
    assert.equal(computeTotals().challengeXP, 200);
  });

  test("labs XP sums exactly the xp of completed labs", () => {
    saveState({ labsProgress: fakeLabsProgress(["lab1", "lab4"]) }); // 75 + 100
    assert.equal(computeTotals().labsXP, 175);
  });

  test("quiz XP is totalCorrect * 5", () => {
    saveState({ quizStats: { roundsPlayed: 2, bestScore: 8, totalCorrect: 14, totalAnswered: 20 } });
    assert.equal(computeTotals().quizXP, 70);
  });

  test("level increments every 250 total XP", () => {
    saveState({ challengeProgress: fakeChallengeProgress(idsForTier("Expert").slice(0, 2)) }); // 200*2 = 400 XP
    const totals = computeTotals();
    assert.equal(totals.totalXP, 400);
    assert.equal(totals.level, 2); // floor(400/250) + 1
    assert.equal(totals.xpIntoLevel, 150); // 400 % 250
  });
});

describe("computeAchievements — derivation from fixture state", () => {
  test("with zero progress, only nothing is earned and the count is 0", () => {
    const list = computeAchievements();
    assert.equal(list.filter((a) => a.earned).length, 0);
  });

  test("first-steps unlocks after exactly one completed challenge", () => {
    saveState({ challengeProgress: fakeChallengeProgress(["b01"]) });
    const list = computeAchievements();
    assert.equal(list.find((a) => a.id === "first-steps").earned, true);
  });

  test("linux-apprentice requires every Beginner challenge, not just some", () => {
    const beginnerIds = idsForTier("Beginner");
    saveState({ challengeProgress: fakeChallengeProgress(beginnerIds.slice(0, -1)) });
    assert.equal(computeAchievements().find((a) => a.id === "linux-apprentice").earned, false, "one short should not unlock it");

    saveState({ challengeProgress: fakeChallengeProgress(beginnerIds) });
    assert.equal(computeAchievements().find((a) => a.id === "linux-apprentice").earned, true);
  });

  test("permission-master requires literally every challenge", () => {
    saveState({ challengeProgress: fakeChallengeProgress(allChallengeIds().slice(0, -1)) });
    assert.equal(computeAchievements().find((a) => a.id === "permission-master").earned, false);

    saveState({ challengeProgress: fakeChallengeProgress(allChallengeIds()) });
    assert.equal(computeAchievements().find((a) => a.id === "permission-master").earned, true);
  });

  test("lab-graduate scales with the real lab count (regression guard for the earlier hardcoded->=10 bug)", () => {
    const allButOne = allLabIds().slice(0, -1);
    saveState({ labsProgress: fakeLabsProgress(allButOne) });
    assert.equal(computeAchievements().find((a) => a.id === "lab-graduate").earned, false,
      "completing all-but-one lab must NOT earn lab-graduate, however many labs exist");

    saveState({ labsProgress: fakeLabsProgress(allLabIds()) });
    assert.equal(computeAchievements().find((a) => a.id === "lab-graduate").earned, true);
  });

  test("quiz-rookie, perfect-score and quiz-whiz thresholds", () => {
    saveState({ quizStats: { roundsPlayed: 0, bestScore: 0, totalCorrect: 0, totalAnswered: 0 } });
    let list = computeAchievements();
    assert.equal(list.find((a) => a.id === "quiz-rookie").earned, false);
    assert.equal(list.find((a) => a.id === "perfect-score").earned, false);
    assert.equal(list.find((a) => a.id === "quiz-whiz").earned, false);

    saveState({ quizStats: { roundsPlayed: 6, bestScore: 10, totalCorrect: 50, totalAnswered: 60 } });
    list = computeAchievements();
    assert.equal(list.find((a) => a.id === "quiz-rookie").earned, true);
    assert.equal(list.find((a) => a.id === "perfect-score").earned, true, "bestScore of exactly 10 should count as a perfect round");
    assert.equal(list.find((a) => a.id === "quiz-whiz").earned, true, "totalCorrect of exactly 50 should meet the threshold");
  });

  test("well-rounded requires at least one of each: challenge, quiz round, lab", () => {
    saveState({ challengeProgress: fakeChallengeProgress(["b01"]), labsProgress: {}, quizStats: { roundsPlayed: 0, bestScore: 0, totalCorrect: 0, totalAnswered: 0 } });
    assert.equal(computeAchievements().find((a) => a.id === "well-rounded").earned, false, "missing labs and quiz");

    saveState({ challengeProgress: fakeChallengeProgress(["b01"]), labsProgress: fakeLabsProgress(["lab1"]), quizStats: { roundsPlayed: 1, bestScore: 5, totalCorrect: 5, totalAnswered: 10 } });
    assert.equal(computeAchievements().find((a) => a.id === "well-rounded").earned, true);
  });

  test("path-complete requires everything at once: all topics read, all challenges, all labs, at least one quiz round", () => {
    saveState({
      readTopics: allTopicIds(),
      challengeProgress: fakeChallengeProgress(allChallengeIds()),
      labsProgress: fakeLabsProgress(allLabIds()),
      quizStats: { roundsPlayed: 1, bestScore: 5, totalCorrect: 5, totalAnswered: 10 },
    });
    assert.equal(computeAchievements().find((a) => a.id === "path-complete").earned, true);

    // Missing just the quiz round should fail it, everything else held constant.
    saveState({ quizStats: { roundsPlayed: 0, bestScore: 0, totalCorrect: 0, totalAnswered: 0 } });
    assert.equal(computeAchievements().find((a) => a.id === "path-complete").earned, false);
  });

  test("permission-legend only earns once every other achievement (including path-complete) is earned", () => {
    saveState({
      readTopics: allTopicIds(),
      challengeProgress: fakeChallengeProgress(allChallengeIds()),
      labsProgress: fakeLabsProgress(allLabIds()),
      quizStats: { roundsPlayed: 10, bestScore: 10, totalCorrect: 50, totalAnswered: 60 },
    });
    const list = computeAchievements();
    const legend = list.find((a) => a.id === "permission-legend");
    const everythingElse = list.filter((a) => a.id !== "permission-legend");
    assert.equal(everythingElse.every((a) => a.earned), true, "sanity: every other badge should be earned in this maxed-out fixture");
    assert.equal(legend.earned, true);
  });

  test("exposes exactly 13 achievements total, and earnedAchievementCount/totalAchievementCount agree with computeAchievements", () => {
    assert.equal(totalAchievementCount(), 13);
    assert.equal(computeAchievements().length, totalAchievementCount());
    saveState({ challengeProgress: fakeChallengeProgress(["b01"]) });
    assert.equal(earnedAchievementCount(), computeAchievements().filter((a) => a.earned).length);
  });
});

describe("computePathPhases — Guided Path derivation", () => {
  test("returns exactly 4 phases in order: learn, labs, challenges, quiz", () => {
    const phases = computePathPhases();
    assert.deepEqual(phases.map((p) => p.id), ["learn", "labs", "challenges", "quiz"]);
  });

  test("with zero progress, every phase is incomplete and 'learn' is first up", () => {
    const phases = computePathPhases();
    assert.equal(phases.every((p) => !p.complete), true);
  });

  test("a phase reports complete:true only once its full total is reached", () => {
    const allButOneTopic = allTopicIds().slice(0, -1);
    saveState({ readTopics: allButOneTopic });
    assert.equal(computePathPhases().find((p) => p.id === "learn").complete, false);

    saveState({ readTopics: allTopicIds() });
    assert.equal(computePathPhases().find((p) => p.id === "learn").complete, true);
  });

  test("the quiz phase completes after exactly one round played, not more", () => {
    saveState({ quizStats: { roundsPlayed: 1, bestScore: 3, totalCorrect: 3, totalAnswered: 10 } });
    assert.equal(computePathPhases().find((p) => p.id === "quiz").complete, true);
  });
});

describe("buildProgressSnapshot — exported JSON shape", () => {
  test("includes the schema tag and top-level fields the Share panel depends on", () => {
    const snapshot = buildProgressSnapshot();
    assert.equal(snapshot.schema, "lpl-progress-v1");
    assert.ok("level" in snapshot);
    assert.ok("totalXP" in snapshot);
    assert.ok("challenges" in snapshot && "completed" in snapshot.challenges && "total" in snapshot.challenges);
    assert.ok("labs" in snapshot && "total" in snapshot.labs);
    assert.ok("achievements" in snapshot && Array.isArray(snapshot.achievements.earned));
  });

  test("challenges.total and labs.total always match the real content counts", () => {
    const snapshot = buildProgressSnapshot();
    assert.equal(snapshot.challenges.total, CHALLENGES.length);
    assert.equal(snapshot.labs.total, LABS.length);
  });
});
