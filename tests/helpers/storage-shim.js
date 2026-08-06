/**
 * tests/helpers/storage-shim.js
 * A minimal in-memory localStorage polyfill for Node's test runner.
 * utils.js's loadState()/saveState() only touch `localStorage` inside
 * function bodies (never at module scope), so this just has to exist by
 * the time a test actually calls something that persists state — it does
 * not need to run before import. Deliberately hand-written instead of
 * pulling in a devDependency; the whole app's philosophy is zero
 * dependencies, and ~15 lines here keeps that true for the test suite too.
 */

export function installLocalStorageShim() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: (key) => { store.delete(key); },
    clear: () => { store.clear(); },
    get length() { return store.size; },
    key: (i) => Array.from(store.keys())[i] ?? null,
  };
  return store;
}

/** Reset to a clean slate between tests that care about isolation. */
export function resetLocalStorageShim() {
  if (globalThis.localStorage) globalThis.localStorage.clear();
}
