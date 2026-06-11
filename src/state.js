/* ============================================================================
   CRUCIBLE — Game State (discovery, save/load, recipe lookup)
============================================================================ */

import { storage } from "./storage.js";

const SAVE_KEY = "crucible_save_v1";
const BASE_DISCOVERED = ["water", "fire", "earth", "air"];

export class GameState {
  constructor(db) {
    this.db = db;                       // parsed elements.json
    this.elements = db.elements;        // id -> el
    this.recipes = db.recipes;          // "a|b" -> resultId
    this.firstPair = db.firstPair || {};
    this.discovered = new Set();        // ids
    this.recentlyDiscovered = [];       // ordered ids (newest first)
    this.listeners = new Set();
    this.load();
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(evt) { for (const fn of this.listeners) fn(evt); }

  load() {
    let saved = null;
    try { saved = JSON.parse(storage.get(SAVE_KEY) || "null"); } catch {}
    const ids = (saved && Array.isArray(saved.discovered)) ? saved.discovered : BASE_DISCOVERED;
    this.discovered = new Set(ids.filter(id => this.elements[id]));
    for (const b of BASE_DISCOVERED) this.discovered.add(b);
    this.recentlyDiscovered = (saved && saved.recent ? saved.recent : [...this.discovered]).filter(id=>this.elements[id]);
  }

  save() {
    storage.set(SAVE_KEY, JSON.stringify({
      discovered: [...this.discovered],
      recent: this.recentlyDiscovered.slice(0, 200),
      ts: Date.now(),
    }));
  }

  reset() {
    this.discovered = new Set(BASE_DISCOVERED);
    this.recentlyDiscovered = [...BASE_DISCOVERED];
    this.save();
    this.emit({ type: "reset" });
  }

  isDiscovered(id) { return this.discovered.has(id); }
  el(id) { return this.elements[id]; }

  key(a, b) { return [a, b].sort().join("|"); }

  // does a recipe exist for this pair? returns { result, isNew } | null (no side effects)
  canCombine(a, b) {
    const result = this.recipes[this.key(a, b)];
    if (!result) return null;
    return { result, isNew: !this.discovered.has(result) };
  }

  // attempt to combine -> returns { result, isNew } | null
  combine(a, b) {
    const k = this.key(a, b);
    const result = this.recipes[k];
    if (!result) return null;
    const isNew = !this.discovered.has(result);
    if (isNew) {
      this.discovered.add(result);
      this.recentlyDiscovered.unshift(result);
      this.save();
      this.emit({ type: "discover", id: result, from: [a, b] });
    }
    return { result, isNew };
  }

  // list of discovered elements, optionally filtered/sorted
  discoveredList({ query = "", sort = "recent", physOnly = false } = {}) {
    let ids = [...this.discovered];
    if (physOnly) ids = ids.filter(id => this.elements[id]?.phys);
    if (query) {
      const q = query.toLowerCase();
      ids = ids.filter(id => this.elements[id]?.name.toLowerCase().includes(q));
    }
    const els = ids.map(id => this.elements[id]).filter(Boolean);
    if (sort === "recent") {
      const order = new Map(this.recentlyDiscovered.map((id, i) => [id, i]));
      els.sort((x, y) => (order.get(x.id) ?? 1e9) - (order.get(y.id) ?? 1e9));
    } else if (sort === "az") {
      els.sort((x, y) => x.name.localeCompare(y.name));
    } else if (sort === "tier") {
      els.sort((x, y) => x.tier - y.tier || x.name.localeCompare(y.name));
    }
    return els;
  }

  stats() {
    return {
      discovered: this.discovered.size,
      total: Object.keys(this.elements).length,
      recipes: Object.keys(this.recipes).length,
    };
  }

  // hint: find one undiscovered result reachable from currently-discovered items
  hint() {
    for (const [k, r] of Object.entries(this.recipes)) {
      if (this.discovered.has(r)) continue;
      const [a, b] = k.split("|");
      if (this.discovered.has(a) && this.discovered.has(b)) {
        return { a, b, result: r };
      }
    }
    return null;
  }
}
