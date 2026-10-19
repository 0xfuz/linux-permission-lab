/**
 * tests/helpers/ui-harness.js
 * Extends dom-shim.js just enough to DRIVE a rendered panel from node:test:
 * listeners are recorded (so a "click"/"change" can be fired exactly like a
 * native <button>/<input> would on Enter/Space), nodes can be found by id,
 * and `#id` lookups resolve to registered mount points. Not a browser — it
 * proves wiring and structure, not pixels or CSS.
 */
import { installDomShim } from "./dom-shim.js";

export function installUiHarness() {
  installDomShim();
  const registry = new Map();
  const base = document.createElement;
  const isNode = (n) => n && typeof n === "object" && "tag" in n;

  document.createElement = (tag) => {
    const n = base(tag);
    n.listeners = {};
    n.addEventListener = (ev, fn) => { n.listeners[ev] = fn; };
    n.replaceChildren = (...kids) => { n.children = kids; };
    n.style = {};
    n.remove = () => {};
    n.focus = () => { document.activeElement = n; };
    n.querySelector = (sel) => (sel.startsWith("#") ? find(n, (x) => x.attrs.id === sel.slice(1))[0] || null : null);
    return n;
  };
  document.querySelector = (sel) => registry.get(sel) ?? null;
  document.body = { append() {} };

  const mountPoint = (id) => { const n = document.createElement("div"); n.attrs.id = id; registry.set(`#${id}`, n); return n; };
  return { mountPoint };
}

export function find(root, pred, out = []) {
  if (isElement(root) && pred(root)) out.push(root);
  (root.children || []).forEach((c) => find(c, pred, out));
  return out;
}
const isElement = (n) => n && typeof n === "object" && "tag" in n;
export const byId = (root, id) => find(root, (n) => n.attrs && n.attrs.id === id)[0] || null;
export const byTag = (root, tag) => find(root, (n) => n.tag === tag);

/** All text under a node, space-joined. */
export function textOf(node) {
  if (node && node.nodeType === 3) return node.text;
  return (node.children || []).map(textOf).join(" ");
}
export function click(node) {
  if (!node) throw new Error("click: node not found");
  if (node.attrs && node.attrs.disabled !== undefined) return false; // disabled controls never fire
  node.listeners.click({ target: node });
  return true;
}
export function change(node) { node.listeners.change({ target: node }); }
/** The button whose visible label is exactly `label`. */
export const buttonByLabel = (root, label) => byTag(root, "button").find((b) => textOf(b).trim() === label) || null;
