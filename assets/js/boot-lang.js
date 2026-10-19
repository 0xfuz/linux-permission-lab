/**
 * boot-lang.js — classic (non-module) script, loaded synchronously in <head>.
 * Moved out of index.html in v2.4.2 so the page can ship a Content-Security-Policy
 * with script-src 'self' (no inline scripts).
 */
// Set lang/dir synchronously before first paint, so a stored Arabic
// preference doesn't flash as LTR English for a frame. i18n.js re-applies
// this properly once it loads; this is just the pre-paint fast path.
try {
  var raw = localStorage.getItem("lpl_state_v1");
  var storedLocale = raw ? JSON.parse(raw).locale : null;
  if (storedLocale === "ar") {
    document.documentElement.setAttribute("lang", "ar");
    document.documentElement.setAttribute("dir", "rtl");
  }
} catch (e) { /* localStorage unavailable — default LTR English is fine */ }
