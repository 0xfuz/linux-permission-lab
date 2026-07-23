/**
 * calculator.js
 * Module 4 — Permission Calculator.
 * A standalone converter: type octal or symbolic, see every representation
 * update together. Independent of the Simulator's live state so learners
 * can experiment freely without disturbing their filesystem selection.
 */

import { qs, qsa, el, toast, copyToClipboard } from "./utils.js";
import {
  octalToState, symbolicToState, stateToSymbolic, stateToOctal, stateToBinaryGrouped,
  validateOctalInput, validateSymbolicInput,
} from "./converter.js";
import { t, onLocaleChanged } from "./i18n.js";

const PRESETS = ["777", "755", "700", "644", "600", "664", "750", "000"];

function setFieldError(input, errorNode, message) {
  if (message) {
    input.setAttribute("aria-invalid", "true");
    errorNode.textContent = message;
  } else {
    input.removeAttribute("aria-invalid");
    errorNode.textContent = "";
  }
}

function syncFromState(state, skip) {
  const octalOut = qs("#calc-octal-out");
  const symbolicOut = qs("#calc-symbolic-out");
  const binaryOut = qs("#calc-binary-out");
  if (octalOut && skip !== "octal") octalOut.textContent = stateToOctal(state, true);
  else if (octalOut) octalOut.textContent = stateToOctal(state, true);
  if (symbolicOut) symbolicOut.textContent = stateToSymbolic(state);
  if (binaryOut) binaryOut.textContent = stateToBinaryGrouped(state);

  const octalInput = qs("#calc-octal-input");
  const symbolicInput = qs("#calc-symbolic-input");
  if (octalInput && skip !== "octal") octalInput.value = stateToOctal(state, true);
  if (symbolicInput && skip !== "symbolic") symbolicInput.value = stateToSymbolic(state).replace(/^d/, "");
}

function renderPresets() {
  const mount = qs("#calc-presets");
  if (!mount) return;
  mount.innerHTML = "";
  PRESETS.forEach((p) => {
    const btn = el("button", {
      class: "btn btn-ghost btn-sm",
      type: "button",
      onClick: () => {
        const octalInput = qs("#calc-octal-input");
        octalInput.value = p;
        octalInput.dispatchEvent(new Event("input"));
      },
    }, p);
    mount.append(btn);
  });
}

export function initCalculator() {
  renderPresets();
  const octalInput = qs("#calc-octal-input");
  const symbolicInput = qs("#calc-symbolic-input");
  const octalError = qs("#calc-octal-error");
  const symbolicError = qs("#calc-symbolic-error");

  if (octalInput) {
    octalInput.value = "755";
    octalInput.addEventListener("input", () => {
      const { valid, message } = validateOctalInput(octalInput.value);
      setFieldError(octalInput, octalError, valid ? "" : message);
      if (!valid) return;
      const state = octalToState(octalInput.value);
      syncFromState(state, "octal");
    });
    octalInput.dispatchEvent(new Event("input"));
  }

  if (symbolicInput) {
    symbolicInput.addEventListener("input", () => {
      const { valid, message } = validateSymbolicInput(symbolicInput.value);
      setFieldError(symbolicInput, symbolicError, valid ? "" : message);
      if (!valid) return;
      const state = symbolicToState(symbolicInput.value);
      syncFromState(state, "symbolic");
    });
  }

  const copyBtn = qs("#calc-copy-btn");
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      const octalOut = qs("#calc-octal-out")?.textContent || "";
      copyToClipboard(`chmod ${octalOut} file.txt`, t("toast.copied"));
    });
  }

  onLocaleChanged(() => { octalInput?.dispatchEvent(new Event("input")); });
}
