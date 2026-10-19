/**
 * scenario-progress.js  (v2.12)
 * Persistence for terminal challenges and investigations. Stored under its
 * own `scenarioProgress` key in the existing localStorage state, so state
 * saved by v2.11 (which has no such key) loads unchanged: a missing or
 * malformed value simply reads as "nothing completed yet".
 */
import { loadState, saveState, emitProgressChanged } from "./utils.js";
import { SCENARIOS } from "./scenarios-data.js";

export function getScenarioProgress() {
  const p = loadState().scenarioProgress;
  return p && typeof p === "object" && !Array.isArray(p) ? p : {};
}

/** Records a completion once; a repeat completion never awards XP twice. Unknown ids are ignored. */
export function markScenarioComplete(id, { attempts = 0, hintsUsed = 0 } = {}) {
  const def = SCENARIOS.find((s) => s.id === id);
  if (!def) return getScenarioProgress();
  const progress = getScenarioProgress();
  if (progress[id]) return progress;
  progress[id] = { completedAt: Date.now(), xp: def.xp, attempts, hintsUsed };
  saveState({ scenarioProgress: progress });
  emitProgressChanged();
  return progress;
}

export function scenarioTotalXP(progress = getScenarioProgress()) {
  return Object.values(progress).reduce((sum, p) => sum + (p && Number(p.xp) > 0 ? Number(p.xp) : 0), 0);
}
