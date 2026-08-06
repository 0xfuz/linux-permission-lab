/**
 * utils.js
 * Small shared helpers used across every module. Nothing here knows about
 * permissions/chmod semantics — that logic lives in converter.js.
 */

export const qs = (sel, scope = document) => scope.querySelector(sel);
export const qsa = (sel, scope = document) => Array.from(scope.querySelectorAll(sel));

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else if (key === "html") node.innerHTML = value;
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value !== false && value !== null && value !== undefined) {
      node.setAttribute(key, value);
    }
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined) continue;
    node.append(child.nodeType ? child : document.createTextNode(child));
  }
  return node;
}

/* ---------------------------- Toasts ---------------------------- */

let toastRegion;
export function toast(message, variant = "default", duration = 2600) {
  if (!toastRegion) {
    toastRegion = qs(".toast-region");
    if (!toastRegion) {
      toastRegion = el("div", { class: "toast-region", role: "status", "aria-live": "polite" });
      document.body.append(toastRegion);
    }
  }
  const node = el("div", { class: `toast ${variant !== "default" ? "toast-" + variant : ""}` }, message);
  toastRegion.append(node);
  setTimeout(() => {
    node.style.transition = "opacity 200ms ease, transform 200ms ease";
    node.style.opacity = "0";
    node.style.transform = "translateX(16px)";
    setTimeout(() => node.remove(), 220);
  }, duration);
}

/* ---------------------------- Clipboard ---------------------------- */

export async function copyToClipboard(text, successMessage = "Copied to clipboard") {
  try {
    await navigator.clipboard.writeText(text);
    toast(successMessage, "success");
    return true;
  } catch (err) {
    toast("Couldn't copy — select and copy manually", "error");
    return false;
  }
}

/* ---------------------------- Local storage ---------------------------- */

const STORAGE_KEY = "lpl_state_v1";

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveState(partial) {
  const current = loadState();
  const merged = { ...current, ...partial };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {
    /* storage unavailable — fail silently, app still works in-memory */
  }
  return merged;
}

/* ---------------------------- Ripple effect ---------------------------- */

export function attachRipple(node) {
  node.classList.add("ripple-host");
  node.addEventListener("click", (e) => {
    const rect = node.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const span = el("span", { class: "ripple-span" });
    span.style.width = span.style.height = `${size}px`;
    span.style.left = `${e.clientX - rect.left - size / 2}px`;
    span.style.top = `${e.clientY - rect.top - size / 2}px`;
    node.append(span);
    setTimeout(() => span.remove(), 600);
  });
}

export function attachRippleToAll(selector = ".btn") {
  qsa(selector).forEach(attachRipple);
}

/* ---------------------------- Progress event bus ---------------------------- */

const progressListeners = new Set();
export function onProgressChanged(cb) {
  progressListeners.add(cb);
}
export function emitProgressChanged() {
  progressListeners.forEach((cb) => {
    try { cb(); } catch { /* a listener failing shouldn't break the emitter */ }
  });
}

/* ---------------------------- Cross-module navigation (v2.3) ---------------------------- */
/* A tiny window-level event so a module like Progress can send the user to
   another view (and optionally focus something inside it) without a direct
   import cycle back into app.js, which owns the actual view-switching. */

export function navigateToView(viewId, extra = {}) {
  window.dispatchEvent(new CustomEvent("lpl:navigate", { detail: { view: viewId, ...extra } }));
}

/* ---------------------------- Misc ---------------------------- */

export function debounce(fn, wait = 200) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export function flashValue(node) {
  node.classList.remove("value-flash");
  void node.offsetWidth; // restart animation
  node.classList.add("value-flash");
}
