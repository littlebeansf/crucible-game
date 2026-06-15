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

  // ---- Catalog support ----
  // Per-category progress: { category: { total, found } }, plus a special
  // "phys" pseudo-bucket counting physical (sandbox-usable) materials.
  categoryStats() {
    const out = {};
    let physTotal = 0, physFound = 0, lifeTotal = 0, lifeFound = 0;
    for (const id in this.elements) {
      const el = this.elements[id];
      const c = el.category || "other";
      if (!out[c]) out[c] = { total: 0, found: 0 };
      out[c].total++;
      const found = this.discovered.has(id);
      if (found) out[c].found++;
      if (el.phys) { physTotal++; if (found) physFound++; }
      if (c === "life") { lifeTotal++; if (found) lifeFound++; }
    }
    return { byCategory: out, phys: { total: physTotal, found: physFound }, life: { total: lifeTotal, found: lifeFound } };
  }

  // All elements in a category, each tagged with whether it's discovered.
  // Used by the Pokédex-style catalog grid (locked entries show as silhouettes).
  catalogCategory(cat, { query = "" } = {}) {
    const q = query.trim().toLowerCase();
    const list = [];
    for (const id in this.elements) {
      const el = this.elements[id];
      if ((el.category || "other") !== cat) continue;
      const found = this.discovered.has(id);
      if (q && found && !el.name.toLowerCase().includes(q)) continue;
      if (q && !found) continue; // can't search by name for locked entries
      list.push({ el, found });
    }
    // discovered first (alpha), then locked (by tier so early ones cluster)
    list.sort((a, b) => {
      if (a.found !== b.found) return a.found ? -1 : 1;
      if (a.found) return a.el.name.localeCompare(b.el.name);
      return (a.el.tier - b.el.tier) || a.el.id.localeCompare(b.el.id);
    });
    return list;
  }

  // Phase-change hints for an element with physical properties.
  // Returns { freeze, melt, boil, condense } thresholds in °C where defined.
  phaseInfo(el) {
    const p = el && el.phys;
    if (!p) return null;
    const info = {};
    if (p.freezeTo) info.freeze = { to: p.freezeTo, at: 0 };
    if (p.meltTo) info.melt = { to: p.meltTo, at: p.meltAt ?? 5 };
    if (p.boilTo) info.boil = { to: p.boilTo, at: 100 };
    if (p.condenseTo) info.condense = { to: p.condenseTo, at: 95 };
    if (p.coolTo) info.cool = { to: p.coolTo, at: 600 };
    if (p.flammable) info.flammable = true;
    if (p.conductive) info.conductive = true;
    if (p.explosive) info.explosive = true;
    if (p.soluble) info.soluble = true;
    info.state = p.state;
    info.density = p.density;
    if (p.temp != null) info.temp = p.temp;
    return info;
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
