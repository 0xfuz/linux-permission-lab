/**
 * boot-fallback.js — classic (non-module) script, loaded at the end of <body>.
 * Moved out of index.html in v2.4.2 (see boot-lang.js).
 *
 * It has to be a classic script (and plain ES5) because its whole job is to still run when the browser refuses
 * to run the ES-module app.
 *
 * v2.13.0 fix. Before, a bare 900 ms timer decided "app.js has not flagged itself ready yet, so modules must be
 * blocked by file://" and showed a "needs a local server" overlay on EVERY origin — and never removed it. The
 * app is 39 modules / ~615 KiB with 10 sequential import levels, so on a cold load over a real network (GitHub
 * Pages, Android on mobile data, even localhost with latency) it routinely needs more than 900 ms: visitors saw
 * the overlay on top of a perfectly working page until they refreshed (when the cache made it fast enough).
 *
 * Now slowness is never treated as failure. The notice appears only on a real failure signal, and which notice
 * depends on where the page is running:
 *   - the browser reports an error on the app's own module <script> (what Chrome does for a blocked file:// load,
 *     and for a missing/failed module anywhere), or
 *   - the app's own code throws before it has flagged itself ready.
 * Errors from anything else (Google Fonts stylesheet, images, extensions) are ignored.
 *   file://            -> "This page needs a local server" (the only place that advice is true)
 *   http(s) and others -> "The app could not start" (no local-server advice)
 * On file:// only, a 4 s watchdog remains as a safety net for a browser that blocks modules without reporting
 * an event. If the app does become ready after a notice was shown, the notice is removed.
 */
(function () {
  "use strict";

  var root = document.documentElement;
  var banner = document.getElementById("module-blocked-banner");
  var fileBox = document.getElementById("module-blocked-file");
  var failBox = document.getElementById("module-blocked-failed");
  if (!banner || !fileBox || !failBox) return;

  var isFile = location.protocol === "file:";

  // URL prefix of the app's own scripts, resolved against the page (works under a sub-path such as
  // /linux-permission-lab/, with a query string or a #hash route).
  var appBase = "";
  try { appBase = new URL("assets/js/", document.baseURI).href; } catch (e) { appBase = ""; }

  function ready() { return root.dataset.appReady === "true"; }
  function isAppUrl(u) { return !!appBase && typeof u === "string" && u.indexOf(appBase) === 0; }

  function show(which) {
    if (ready()) return;
    fileBox.style.display = which === "file" ? "block" : "none";
    failBox.style.display = which === "file" ? "none" : "block";
    banner.style.display = "flex";
  }
  function hide() { banner.style.display = "none"; }
  function fail() { show(isFile ? "file" : "failed"); }

  // Resource errors do not bubble, so listen in the capture phase on window.
  window.addEventListener("error", function (e) {
    if (ready()) return;
    var t = e.target;
    if (t && t.tagName) {
      // A resource failed to load. Only the app's own module script is a boot failure; a blocked stylesheet,
      // font, image or unrelated script must not raise the notice.
      if (t.tagName === "SCRIPT" && t.type === "module" && isAppUrl(t.src)) fail();
      return;
    }
    // An uncaught exception. Only the app's own code counts (not browser extensions or other pages' scripts).
    if (isAppUrl(e.filename)) fail();
  }, true);

  if (isFile) {
    setTimeout(function () { if (!ready()) show("file"); }, 4000);
  }

  // Never leave a notice over a working app.
  if (typeof MutationObserver === "function") {
    new MutationObserver(function () { if (ready()) hide(); })
      .observe(root, { attributes: true, attributeFilter: ["data-app-ready"] });
  }
})();
