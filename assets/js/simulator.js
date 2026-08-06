/**
 * simulator.js
 * Module 1 — Permission Simulator (the home view of the Simulator page).
 * Owns the current permission state and re-renders the live output any time
 * a toggle changes. Filesystem selections and the special-bit visualizer
 * both feed into this same state.
 */

import { qs, qsa, el, flashValue, copyToClipboard } from "./utils.js";
import {
  defaultPermissionState, stateToSymbolic, stateToOctal, stateToBinaryGrouped,
  stateToChmodCommand, octalToState,
} from "./converter.js";
import { analyzePermissions, severityBadgeClass, severityLabel } from "./security.js";
import { initFilesystem, onFilesystemSelect } from "./filesystem.js";
import { renderVisualizer, onVisualizerTry } from "./visualizer.js";
import { t, onLocaleChanged } from "./i18n.js";

let state = defaultPermissionState(false);
let currentFilename = "file.txt";
let currentContext = { isSensitive: false };

const ROLES = ["owner", "group", "others"];
function permsList() {
  return [
    { key: "read", label: "R", name: t("sim.read") },
    { key: "write", label: "W", name: t("sim.write") },
    { key: "execute", label: "X", name: t("sim.execute") },
  ];
}
function roleLabel(role) {
  return t("sim." + role);
}

function buildPermBlock(role) {
  const head = el("div", { class: "perm-block-head" }, [
    el("h4", {}, roleLabel(role)),
    el("span", { class: "octal-chip", id: `octal-${role}` }, "0"),
  ]);

  const row = el("div", { class: "led-row" });
  permsList().forEach((p) => {
    const toggle = el("button", {
      type: "button",
      class: "led-toggle",
      "data-role": role,
      "data-perm": p.key,
      "data-on": state[role][p.key] ? "true" : "false",
      "aria-pressed": state[role][p.key] ? "true" : "false",
      "aria-label": `${p.name} for ${role}`,
      "data-tooltip": `${p.name} (${p.key === "read" ? "r=4" : p.key === "write" ? "w=2" : "x=1"})`,
      onClick: () => toggleLed(role, p.key),
    }, [
      el("span", { class: "led-glass" }, p.label),
      el("span", { class: "led-label" }, p.name),
    ]);
    row.append(toggle);
  });

  return el("div", { class: "perm-block", id: `perm-block-${role}` }, [head, row]);
}

function buildSpecialBitsBlock() {
  const specials = [
    { key: "suid", label: "S", name: t("sim.suidLabel") },
    { key: "sgid", label: "S", name: t("sim.sgidLabel") },
    { key: "sticky", label: "T", name: t("sim.stickyLabel") },
  ];
  const head = el("div", { class: "perm-block-head" }, [
    el("h4", {}, t("sim.special")),
    el("span", { class: "badge badge-info" }, t("sim.advanced")),
  ]);
  const row = el("div", { class: "led-row" });
  specials.forEach((s) => {
    const toggle = el("button", {
      type: "button",
      class: "led-toggle role-special",
      "data-special": s.key,
      "data-on": state[s.key] ? "true" : "false",
      "aria-pressed": state[s.key] ? "true" : "false",
      "aria-label": s.name,
      "data-tooltip": s.name,
      onClick: () => toggleSpecial(s.key),
    }, [
      el("span", { class: "led-glass" }, s.label),
      el("span", { class: "led-label" }, s.name),
    ]);
    row.append(toggle);
  });
  return el("div", { class: "perm-block", id: "perm-block-special" }, [head, row]);
}

function rebuildAllBlocks() {
  ROLES.forEach((role) => {
    const current = qs(`#perm-block-${role}`);
    if (current) current.replaceWith(buildPermBlock(role));
  });
  const currentSpecial = qs("#perm-block-special");
  if (currentSpecial) currentSpecial.replaceWith(buildSpecialBitsBlock());
  render();
}

function toggleLed(role, permKey) {
  state[role][permKey] = !state[role][permKey];
  render();
}

function toggleSpecial(key) {
  state[key] = !state[key];
  render();
}

function applyFromExternal(partialState) {
  state = { ...state, ...partialState };
  render();
  toastActivated();
}

function toastActivated() {
  const region = qs("#simulator-panel");
  if (region) {
    region.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function render() {
  ROLES.forEach((role) => {
    const digit = ((state[role].read ? 4 : 0) + (state[role].write ? 2 : 0) + (state[role].execute ? 1 : 0));
    const chip = qs(`#octal-${role}`);
    if (chip) { chip.textContent = String(digit); }
    permsList().forEach((p) => {
      const btn = qs(`.led-toggle[data-role="${role}"][data-perm="${p.key}"]`);
      if (!btn) return;
      const on = state[role][p.key];
      btn.dataset.on = on ? "true" : "false";
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  });

  ["suid", "sgid", "sticky"].forEach((key) => {
    const btn = qs(`.led-toggle[data-special="${key}"]`);
    if (!btn) return;
    btn.dataset.on = state[key] ? "true" : "false";
    btn.setAttribute("aria-pressed", state[key] ? "true" : "false");
  });

  const symbolic = qs("#readout-symbolic");
  const octal = qs("#readout-octal");
  const binary = qs("#readout-binary");
  if (symbolic) { symbolic.textContent = stateToSymbolic(state); flashValue(symbolic); }
  if (octal) { octal.textContent = stateToOctal(state); flashValue(octal); }
  if (binary) { binary.textContent = stateToBinaryGrouped(state); flashValue(binary); }

  const cmdText = qs("#chmod-cmd-text");
  if (cmdText) {
    const cmd = stateToChmodCommand(state, currentFilename);
    cmdText.innerHTML = `<span class="flag">chmod</span> ${stateToOctal(state)} ${currentFilename}`;
    cmdText.dataset.raw = cmd;
  }

  const analysis = analyzePermissions(state, currentContext);
  const badge = qs("#security-badge");
  const reasonsList = qs("#security-reasons");
  if (badge) {
    badge.className = `badge ${severityBadgeClass(analysis.level)}`;
    badge.textContent = severityLabel(analysis.level);
  }
  if (reasonsList) {
    reasonsList.innerHTML = "";
    analysis.reasons.forEach((r) => reasonsList.append(el("li", {}, r)));
  }
  const headline = qs("#security-headline");
  if (headline) headline.textContent = analysis.headline;
}

function wireCopyAndReset() {
  const copyBtn = qs("#copy-chmod-btn");
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      const cmdText = qs("#chmod-cmd-text");
      copyToClipboard(cmdText?.dataset.raw || stateToChmodCommand(state, currentFilename), t("toast.copied"));
    });
  }
  const resetBtn = qs("#reset-sim-btn");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      state = defaultPermissionState(state.isDir);
      render();
    });
  }
}

export function initSimulator() {
  const ownerMount = qs("#perm-owner-mount");
  const groupMount = qs("#perm-group-mount");
  const othersMount = qs("#perm-others-mount");
  const specialMount = qs("#perm-special-mount");
  if (ownerMount) ownerMount.replaceWith(buildPermBlock("owner"));
  if (groupMount) groupMount.replaceWith(buildPermBlock("group"));
  if (othersMount) othersMount.replaceWith(buildPermBlock("others"));
  if (specialMount) specialMount.replaceWith(buildSpecialBitsBlock());

  wireCopyAndReset();

  onFilesystemSelect((node) => {
    state = octalToState(node.octal, node.isDir);
    currentFilename = node.isSymlink ? `${node.path} -> ${node.target}` : node.path;
    currentContext = { isSensitive: !!node.sensitive, isSymlink: !!node.isSymlink, symlinkTarget: node.target, hasAcl: !!(node.acl && node.acl.length) };
    render();
  });
  initFilesystem();

  renderVisualizer();
  onVisualizerTry((partial) => applyFromExternal(partial));

  render();
  onLocaleChanged(() => { rebuildAllBlocks(); renderVisualizer(); });
}
