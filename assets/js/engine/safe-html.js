/**
 * engine/safe-html.js  (v2.4.2)
 * Pure helpers that keep the terminal's HTML output safe.
 *
 * The terminal builds its output as HTML strings (coloured <span>s), and
 * several of those strings embed names the learner can create (touch, mkdir,
 * mv, cp, ln -s). Escaping every interpolation by hand is easy to get wrong —
 * v2.4 missed `ls`, `tree`, `find` and `grep`. So there are two layers:
 *   1. escapeHTML() at the call sites (primary defence)
 *   2. sanitizeTerminalHTML() inside printLine (safety net): every tag except
 *      the terminal's own <span class="t-…"> / </span> is escaped to text.
 */

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

const ALLOWED_TAG = /^<\/?span(?: class="t-[a-z-]+")?>$/;

/** Escape every tag (and every stray ">") that is not one of the terminal's own colour spans. */
export function sanitizeTerminalHTML(html) {
  return String(html).replace(/<[^>]*>?|>/g, (m) => (ALLOWED_TAG.test(m) ? m : escapeHTML(m)));
}
