/**
 * boot-fallback.js — classic (non-module) script, loaded at the end of <body>.
 * Moved out of index.html in v2.4.2 (see boot-lang.js).
 */
// Non-module script: runs even when type="module" scripts are blocked by the
// browser's file:// CORS policy. If app.js hasn't flagged itself ready after
// a short delay, assume modules were blocked and show the fallback notice.
setTimeout(function () {
  if (document.documentElement.dataset.appReady !== "true") {
    document.getElementById("module-blocked-banner").style.display = "flex";
  }
}, 900);
