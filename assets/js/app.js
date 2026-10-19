/**
 * app.js
 * Application shell: view routing between sidebar sections, theme toggle,
 * mobile sidebar, cheat sheet rendering + search, keyboard shortcuts, and
 * bootstrapping every feature module. This is the only file that touches
 * the top-level DOM structure of index.html directly.
 *
 * v2.1 added four new views (Learn, Labs, Quiz, Progress). v2.2 adds
 * English/Arabic bilingual support (i18n.js) with RTL layout switching.
 */

import { qs, qsa, el, debounce, attachRippleToAll, loadState, saveState, onProgressChanged } from "./utils.js";
import { CHEATSHEET_ROWS } from "./converter.js";
import { CHEATSHEET_ROWS_AR } from "./cheatsheet-data.ar.js";
import { TERMINAL_COMMANDS, TERMINAL_COMMAND_CATEGORIES } from "./terminal-commands-data.js";
import { TERMINAL_COMMANDS_AR, TERMINAL_COMMAND_CATEGORIES_AR } from "./terminal-commands-data.ar.js";
import { initSimulator } from "./simulator.js";
import { initCalculator } from "./calculator.js";
import { initTerminal } from "./terminal.js";
import { initScenarios } from "./scenarios.js";
import { initChallenges } from "./challenges.js";
import { initLearn } from "./learn.js";
import { initLabs } from "./labs.js";
import { initQuiz } from "./quiz.js";
import { initProgress } from "./progress.js";
import { getLocale, setLocale, t, localize, onLocaleChanged, applyStaticTranslations } from "./i18n.js";

const VIEW_IDS = ["home", "simulator", "calculator", "terminal", "learn", "labs", "challenges", "quiz", "cheatsheet", "progress", "about"];
const SHORTCUT_MAP = { "1": "simulator", "2": "calculator", "3": "terminal", "4": "learn", "5": "labs", "6": "challenges", "7": "quiz", "8": "cheatsheet", "9": "progress" };

let initializedViews = new Set();

function setActiveView(viewId, { updateHash = true } = {}) {
  VIEW_IDS.forEach((id) => {
    const view = qs(`#view-${id}`);
    if (view) view.classList.toggle("active", id === viewId);
  });
  qsa(".nav-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === viewId);
    btn.setAttribute("aria-current", btn.dataset.view === viewId ? "page" : "false");
  });
  if (updateHash) history.replaceState(null, "", `#${viewId}`);
  lazyInitView(viewId);
  closeMobileSidebar();
  qs(".main-region")?.scrollTo?.({ top: 0, behavior: "instant" in document.documentElement.style ? "instant" : "auto" });
  window.scrollTo(0, 0);
}

function lazyInitView(viewId) {
  if (initializedViews.has(viewId)) return;
  initializedViews.add(viewId);
  if (viewId === "simulator") initSimulator();
  if (viewId === "calculator") initCalculator();
  if (viewId === "terminal") { initTerminal(); initScenarios(); }
  if (viewId === "learn") initLearn();
  if (viewId === "labs") initLabs();
  if (viewId === "challenges") initChallenges();
  if (viewId === "quiz") initQuiz();
  if (viewId === "cheatsheet") initCheatSheet();
  if (viewId === "progress") initProgress();
}

function initRouting() {
  qsa(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => setActiveView(btn.dataset.view));
  });
  qsa("[data-goto]").forEach((btn) => {
    btn.addEventListener("click", () => setActiveView(btn.dataset.goto));
  });
  window.addEventListener("lpl:navigate", (e) => {
    const { view, focusTopicId } = e.detail || {};
    if (!view || !VIEW_IDS.includes(view)) return;
    setActiveView(view);
    if (focusTopicId) window.dispatchEvent(new CustomEvent("lpl:learn-focus-topic", { detail: focusTopicId }));
  });

  const initial = (location.hash || "").replace("#", "");
  setActiveView(VIEW_IDS.includes(initial) ? initial : "home", { updateHash: false });
}

/* ---------------------------- Mobile sidebar ---------------------------- */

function openMobileSidebar() {
  qs(".sidebar")?.classList.add("open");
  qs(".sidebar-backdrop")?.classList.add("active");
}
function closeMobileSidebar() {
  qs(".sidebar")?.classList.remove("open");
  qs(".sidebar-backdrop")?.classList.remove("active");
}

function initMobileSidebar() {
  qs("#mobile-menu-btn")?.addEventListener("click", openMobileSidebar);
  qs(".sidebar-backdrop")?.addEventListener("click", closeMobileSidebar);
}

/* ---------------------------- Theme toggle ---------------------------- */

function initTheme() {
  const stored = loadState().theme;
  const theme = stored || "dark";
  document.documentElement.setAttribute("data-theme", theme);
  updateThemeLabel(theme);

  qs("#theme-toggle-btn")?.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
    const next = current === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    saveState({ theme: next });
    updateThemeLabel(next);
  });
}

function updateThemeLabel(theme) {
  const label = qs("#theme-toggle-label");
  if (label) label.textContent = theme === "light" ? t("theme.light") : t("theme.dark");
}

/* ---------------------------- Language toggle (i18n) ---------------------------- */

function initLanguage() {
  document.documentElement.setAttribute("lang", getLocale() === "ar" ? "ar" : "en");
  document.documentElement.setAttribute("dir", getLocale() === "ar" ? "rtl" : "ltr");
  applyStaticTranslations();

  qs("#lang-toggle-btn")?.addEventListener("click", () => {
    setLocale(getLocale() === "ar" ? "en" : "ar");
  });

  onLocaleChanged(() => {
    updateThemeLabel(document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark");
  });
}

/* ---------------------------- Cheat sheet ---------------------------- */

function initCheatSheet() {
  renderCheatSheetRows();
  renderCommandRows();
  const search = qs("#cheat-search-input");
  if (search) {
    search.addEventListener("input", debounce(() => {
      const term = search.value.trim().toLowerCase();
      // One search box filters every table on the page.
      qsa("#cheat-table-body tr, #cmd-table-body tr[data-search]").forEach((tr) => {
        const matches = !term || tr.dataset.search.includes(term);
        tr.hidden = !matches;
      });
      // A category separator row has no data-search of its own — hide it
      // too once every row until the next separator is hidden, so a search
      // doesn't leave a stack of empty category headers behind.
      qsa("#cmd-table-body tr.cheat-cat-row").forEach((cat) => {
        let sib = cat.nextElementSibling;
        let anyVisible = false;
        while (sib && !sib.classList.contains("cheat-cat-row")) {
          if (!sib.hidden) anyVisible = true;
          sib = sib.nextElementSibling;
        }
        cat.hidden = !anyVisible;
      });
    }, 120));
  }
  onLocaleChanged(() => { renderCheatSheetRows(); renderCommandRows(); });
}

function renderCommandRows() {
  const tbody = qs("#cmd-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";
  const rows = localize(TERMINAL_COMMANDS, TERMINAL_COMMANDS_AR);
  const ar = getLocale() === "ar";
  TERMINAL_COMMAND_CATEGORIES.forEach((cat) => {
    const label = ar ? (TERMINAL_COMMAND_CATEGORIES_AR[cat.id] || cat.label) : cat.label;
    tbody.append(el("tr", { class: "cheat-cat-row" }, [el("td", { colspan: "3" }, label)]));
    rows.filter((r) => r.category === cat.id).forEach((row) => {
      tbody.append(el("tr", { "data-search": `${row.cmd} ${row.desc} ${row.requires || ""}`.toLowerCase() }, [
        el("td", { class: "cmd" }, row.cmd),
        el("td", { class: "desc" }, row.desc),
        el("td", { class: "desc requires" }, row.requires || "—"),
      ]));
    });
  });
}

function renderCheatSheetRows() {
  const tbody = qs("#cheat-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";
  const rows = localize(CHEATSHEET_ROWS, CHEATSHEET_ROWS_AR);
  rows.forEach((row) => {
    tbody.append(el("tr", { "data-search": `${row.octal} ${row.symbolic} ${row.desc}`.toLowerCase() }, [
      el("td", {}, row.octal),
      el("td", {}, row.symbolic),
      el("td", { class: "desc" }, row.desc),
    ]));
  });
}

/* ---------------------------- Toolbar: copy year, XP widget, etc ---------------------------- */

function initMisc() {
  const year = qs("#current-year");
  if (year) year.textContent = new Date().getFullYear();
  attachRippleToAll(".btn");
}

function initSidebarXPWidget() {
  // Lightweight cross-module summary shown in the sidebar footer at all times,
  // independent of whether the Progress view has been opened yet.
  const refresh = async () => {
    const { challengeTotalXP, challengeMaxXP } = await import("./challenges.js");
    const xp = challengeTotalXP();
    const maxXp = challengeMaxXP();
    const label = qs("#xp-widget-label");
    const fill = qs("#xp-widget-fill");
    if (label) label.textContent = `${xp} / ${maxXp} XP`;
    if (fill) fill.style.width = `${maxXp ? Math.round((xp / maxXp) * 100) : 0}%`;
  };
  refresh();
  onProgressChanged(refresh);
}

/* ---------------------------- Keyboard shortcuts ---------------------------- */

function initKeyboardShortcuts() {
  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input, textarea")) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const target = SHORTCUT_MAP[e.key];
    if (target) setActiveView(target);
  });
}

/* ---------------------------- Boot ---------------------------- */

document.addEventListener("DOMContentLoaded", () => {
  initLanguage();
  initTheme();
  initMobileSidebar();
  initRouting();
  initKeyboardShortcuts();
  initMisc();
  initSidebarXPWidget();
  document.documentElement.dataset.appReady = "true";
});
