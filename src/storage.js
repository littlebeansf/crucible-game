/* ============================================================================
   CRUCIBLE — Storage shim
   Uses persistent browser storage when available (e.g. GitHub Pages), and
   transparently falls back to an in-memory store when it is unavailable or
   blocked (e.g. sandboxed preview iframes). Same API either way.
============================================================================ */

function makeMemoryStore() {
  const mem = new Map();
  return {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(k, String(v)); },
    removeItem: (k) => { mem.delete(k); },
  };
}

function detectStore() {
  try {
    const ls = globalThis.localStorage;
    const probe = "__crucible_probe__";
    ls.setItem(probe, "1");
    ls.removeItem(probe);
    return ls;
  } catch {
    return makeMemoryStore();
  }
}

const store = detectStore();

export const storage = {
  get(key) { try { return store.getItem(key); } catch { return null; } },
  set(key, value) { try { store.setItem(key, value); } catch {} },
  remove(key) { try { store.removeItem(key); } catch {} },
};
