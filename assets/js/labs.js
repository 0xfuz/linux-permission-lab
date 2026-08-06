/**
 * labs.js
 * New in v2.1 — Interactive Labs module (rendering + progress). Data lives
 * in labs-data.js. Each lab steps through a mix of "answer" checkpoints
 * (graded like Challenges) and "info" checkpoints (read + acknowledge),
 * awarding XP once every step in the lab is complete. v2.2 adds Arabic
 * localization via labs-data.ar.js, merged in step-by-step.
 */

import { qs, qsa, el, toast, loadState, saveState, emitProgressChanged } from "./utils.js";
import { validateOctalInput } from "./converter.js";
import { LABS } from "./labs-data.js";
import { LABS_AR } from "./labs-data.ar.js";
import { t, onLocaleChanged, localize } from "./i18n.js";

/** Thin wrapper: labs need the shared localize()'s nested-array mode
 * because a step overlay carries only the translated prompt/hint/note,
 * not the type/target fields the base step already has. */
function localizedLab(lab) {
  return localize([lab], LABS_AR, { nestedArrayKey: "steps" })[0];
}

export function getLabsProgress() {
  const s = loadState();
  return s.labsProgress || {};
}

function setLabCompleted(labId, xp) {
  const progress = getLabsProgress();
  if (progress[labId]) return progress;
  progress[labId] = { completedAt: Date.now(), xp };
  saveState({ labsProgress: progress });
  emitProgressChanged();
  return progress;
}

let currentLab = null;
let stepIndex = 0;

function renderLabList() {
  const mount = qs("#labs-grid");
  if (!mount) return;
  mount.innerHTML = "";
  const progress = getLabsProgress();
  LABS.forEach((rawLab) => {
    const lab = localizedLab(rawLab);
    const completed = !!progress[lab.id];
    mount.append(el("div", { class: `challenge-card ${completed ? "completed" : ""}` }, [
      el("div", { class: "challenge-card-head" }, [
        el("div", {}, [
          el("span", { class: "badge badge-info", style: "margin-bottom:6px;display:inline-block" }, lab.difficulty),
          el("h3", {}, lab.title),
        ]),
        el("span", { class: "xp-tag" }, completed ? "✓ done" : `+${lab.xp} XP`),
      ]),
      el("p", {}, lab.summary),
      el("div", { class: "challenge-foot" }, [
        el("span", { class: "badge badge-neutral" }, `${lab.steps.length} ${t("labs.steps")}`),
        el("button", { class: "btn btn-primary btn-sm", type: "button", onClick: () => openLab(lab) }, completed ? t("labs.review") : t("labs.startLab")),
      ]),
    ]));
  });
}

function openLab(lab) {
  currentLab = lab;
  stepIndex = 0;
  qs("#labs-modal-overlay")?.classList.add("active");
  renderStep();
}

function closeLab() {
  qs("#labs-modal-overlay")?.classList.remove("active");
  currentLab = null;
}

function renderStep() {
  const modal = qs("#labs-modal");
  if (!modal || !currentLab) return;
  modal.innerHTML = "";

  if (stepIndex >= currentLab.steps.length) {
    setLabCompleted(currentLab.id, currentLab.xp);
    renderLabList();
    modal.append(
      el("button", { class: "btn btn-ghost btn-icon modal-close", type: "button", "aria-label": "Close", onClick: closeLab }, "✕"),
      el("span", { class: "badge badge-safe" }, "Lab complete"),
      el("h2", { style: "margin-top:10px" }, currentLab.title),
      el("p", {}, `+${currentLab.xp} XP.`),
      el("button", { class: "btn btn-primary btn-sm", type: "button", onClick: closeLab }, t("labs.done"))
    );
    toast(`+${currentLab.xp} XP — ${currentLab.title}`, "success");
    return;
  }

  const step = currentLab.steps[stepIndex];
  const progressLabel = `${stepIndex + 1} / ${currentLab.steps.length}`;

  modal.append(
    el("button", { class: "btn btn-ghost btn-icon modal-close", type: "button", "aria-label": "Close", onClick: closeLab }, "✕"),
    el("span", { class: "badge badge-info" }, progressLabel),
    el("h2", { style: "margin-top:10px" }, currentLab.title),
    el("p", {}, step.prompt)
  );

  if (step.type === "info") {
    modal.append(
      el("div", { class: "readout", style: "margin-bottom:16px" }, [
        el("div", { class: "readout-label" }, t("labs.explanation")),
        el("div", { style: "color:var(--text-secondary);font-size:0.85rem" }, step.note),
      ]),
      el("button", { class: "btn btn-primary btn-sm", type: "button", onClick: () => { stepIndex += 1; renderStep(); } },
        stepIndex === currentLab.steps.length - 1 ? t("labs.finishLab") : t("labs.continue"))
    );
  } else {
    modal.append(
      el("input", { id: "lab-answer-input", class: "terminal-input", style: "background:var(--bg-inset);border:1px solid var(--border-hairline);border-radius:8px;padding:10px 12px;width:100%;font-family:var(--font-mono);margin-bottom:8px", placeholder: "e.g. 755", autocomplete: "off" }),
      el("div", { id: "lab-answer-feedback", style: "min-height:20px;font-size:0.85rem;margin-bottom:12px" }),
      el("div", { class: "row wrap" }, [
        el("button", { class: "btn btn-ghost btn-sm", type: "button", onClick: () => toast(step.hint, "default", 4000) }, t("labs.showHint")),
        el("button", { class: "btn btn-primary btn-sm", type: "button", onClick: checkLabAnswer }, t("labs.checkAnswer")),
      ])
    );
    setTimeout(() => qs("#lab-answer-input")?.focus(), 50);
  }
}

function checkLabAnswer() {
  const step = currentLab.steps[stepIndex];
  const input = qs("#lab-answer-input");
  const feedback = qs("#lab-answer-feedback");
  const { valid, message } = validateOctalInput(input.value);
  if (!valid) { feedback.innerHTML = `<span style="color:var(--crit-500)">${message}</span>`; return; }

  const normalized = input.value.trim().replace(/^0+(?=\d)/, "");
  const target = step.target.replace(/^0+(?=\d)/, "");
  const correct = normalized === target || normalized.padStart(target.length, "0") === target;

  if (correct) {
    feedback.innerHTML = `<span style="color:var(--safe-500)">${t("labs.correct")}</span>`;
    setTimeout(() => { stepIndex += 1; renderStep(); }, 500);
  } else {
    feedback.innerHTML = `<span style="color:var(--warn-500)">${t("labs.incorrect")}</span>`;
  }
}

export function initLabs() {
  renderLabList();
  qs("#labs-modal-overlay")?.addEventListener("click", (e) => {
    if (e.target.id === "labs-modal-overlay") closeLab();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && qs("#labs-modal-overlay")?.classList.contains("active")) closeLab();
  });
  onLocaleChanged(() => { closeLab(); renderLabList(); });
}
