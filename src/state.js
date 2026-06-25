/* ============================================================================
   CRUCIBLE — Game State (discovery, save/load, recipe lookup)
============================================================================ */

import { storage } from "./storage.js";
import { slots, SAVE_BASE } from "./slots.js";

// Resolve the active slot's namespaced save key on every access so switching
// slots routes reads/writes to the right payload without reconstructing state.
function saveKey() { return slots.key(SAVE_BASE); }
const BASE_DISCOVERED = ["water", "fire", "earth", "air"];

export class GameState {
  constructor(db) {
    this.db = db;                       // parsed elements.json
    this.elements = db.elements;        // id -> el
    this.recipes = db.recipes;          // "a|b" -> resultId
    this.firstPair = db.firstPair || {};
    this.discovered = new Set();        // ids
    this.recentlyDiscovered = [];       // ordered ids (newest first)
    this.unlockedAchievements = new Set(); // achievement ids
    this.listeners = new Set();
    this.buildRecipeIndex();
    this.load();
  }

  // Build reverse indexes once: which pairs PRODUCE an id, and which recipes
  // an id is an INGREDIENT in. Powers the catalog's combination view.
  buildRecipeIndex() {
    this._producedBy = {}; // resultId -> [[a,b], ...]
    this._ingredientOf = {}; // id -> [{ a, b, result }, ...]
    for (const k in this.recipes) {
      const result = this.recipes[k];
      const [a, b] = k.split("|");
      (this._producedBy[result] ||= []).push([a, b]);
      (this._ingredientOf[a] ||= []).push({ a, b, result });
      if (b !== a) (this._ingredientOf[b] ||= []).push({ a, b, result });
    }
  }

  // Ingredient pairs that produce `id` (all of them, even undiscovered).
  recipesFor(id) { return this._producedBy[id] || []; }
  // Recipes where `id` is an ingredient.
  usedIn(id) { return this._ingredientOf[id] || []; }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(evt) { for (const fn of this.listeners) fn(evt); }

  // Re-read progress for the (possibly newly-switched) active slot, then notify
  // listeners so the whole UI re-renders against the loaded slot.
  reload() {
    this.load();
    this.emit({ type: "reset" });
  }

  load() {
    let saved = null;
    try { saved = JSON.parse(storage.get(saveKey()) || "null"); } catch {}
    // Save migration: keep every previously-unlocked id that still exists in the
    // new element set (stable snake_case ids carry over), then ensure the four
    // base elements are always present. Unknown/removed ids are simply dropped.
    const ids = (saved && Array.isArray(saved.discovered)) ? saved.discovered : BASE_DISCOVERED;
    this.discovered = new Set(ids.filter(id => this.elements[id]));
    for (const b of BASE_DISCOVERED) this.discovered.add(b);
    this.recentlyDiscovered = (saved && saved.recent ? saved.recent : [...this.discovered]).filter(id=>this.elements[id]);
    // Achievements persist across the overhaul too.
    const ach = (saved && Array.isArray(saved.achievements)) ? saved.achievements : [];
    this.unlockedAchievements = new Set(ach);
  }

  save() {
    storage.set(saveKey(), JSON.stringify({
      discovered: [...this.discovered],
      recent: this.recentlyDiscovered.slice(0, 200),
      achievements: [...this.unlockedAchievements],
      ts: Date.now(),
    }));
    // keep the slot manifest's metadata (found count + timestamp) in sync
    slots.touch(slots.activeId(), this.discovered.size);
  }

  reset() {
    this.discovered = new Set(BASE_DISCOVERED);
    this.recentlyDiscovered = [...BASE_DISCOVERED];
    this.unlockedAchievements = new Set();
    this.save();
    this.emit({ type: "reset" });
  }

  // ---- Achievements persistence ----
  hasAchievement(id) { return this.unlockedAchievements.has(id); }
  unlockAchievement(id) {
    if (this.unlockedAchievements.has(id)) return false;
    this.unlockedAchievements.add(id);
    this.save();
    return true;
  }

  isDiscovered(id) { return this.discovered.has(id); }
  el(id) { return this.elements[id]; }

  // ---- Save import / export (share progress between devices/browsers) ----
  // Serialise the current progress to a portable JSON string.
  exportSave() {
    return JSON.stringify({
      app: "crucible",
      version: 1,
      discovered: [...this.discovered],
      recent: this.recentlyDiscovered.slice(0, 500),
      achievements: [...this.unlockedAchievements],
      stats: { found: this.discovered.size, total: Object.keys(this.elements).length },
      ts: Date.now(),
    }, null, 2);
  }

  // Load progress from an exported JSON string.
  // mode "replace" (default) overwrites current progress; "merge" adds to it.
  // Returns { ok, added, total } or { ok:false, error }.
  importSave(text, mode = "replace") {
    let data;
    try { data = JSON.parse(text); } catch { return { ok: false, error: "That file isn't valid JSON." }; }
    const list = data && Array.isArray(data.discovered) ? data.discovered : null;
    if (!list) return { ok: false, error: "No discoveries found in that file." };
    const valid = list.filter(id => this.elements[id]);
    if (!valid.length) return { ok: false, error: "None of the elements in that file match this version of the game." };
    const before = this.discovered.size;
    if (mode === "replace") {
      this.discovered = new Set(BASE_DISCOVERED);
      this.recentlyDiscovered = [...BASE_DISCOVERED];
    }
    for (const id of valid) this.discovered.add(id);
    // merge any achievements carried in the imported save
    if (Array.isArray(data.achievements)) for (const a of data.achievements) this.unlockedAchievements.add(a);
    // rebuild recent order: imported recent first (valid + discovered), then the rest
    const importedRecent = (Array.isArray(data.recent) ? data.recent : valid)
      .filter(id => this.elements[id] && this.discovered.has(id));
    const seen = new Set();
    const recent = [];
    for (const id of importedRecent) if (!seen.has(id)) { seen.add(id); recent.push(id); }
    for (const id of this.recentlyDiscovered) if (!seen.has(id) && this.discovered.has(id)) { seen.add(id); recent.push(id); }
    for (const id of this.discovered) if (!seen.has(id)) { seen.add(id); recent.push(id); }
    this.recentlyDiscovered = recent;
    this.save();
    this.emit({ type: "import" });
    return { ok: true, added: this.discovered.size - before, total: this.discovered.size };
  }

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
    // Pseudo-buckets: filter by a physical property instead of a category.
    const matchCat = (el) => {
      if (cat === "__phys__") return !!el.phys;
      if (cat === "__life__") return (el.category || "other") === "life";
      return (el.category || "other") === cat;
    };
    for (const id in this.elements) {
      const el = this.elements[id];
      if (!matchCat(el)) continue;
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
    // Use REAL per-element thresholds when present; fall back to defaults.
    if (p.freezeTo) info.freeze = { to: p.freezeTo, at: p.freezeAt ?? 0 };
    if (p.meltTo) info.melt = { to: p.meltTo, at: p.meltAt ?? 5 };
    if (p.boilTo) info.boil = { to: p.boilTo, at: p.boilAt ?? 100 };
    if (p.condenseTo) info.condense = { to: p.condenseTo, at: (p.boilAt != null ? p.boilAt - 5 : 95) };
    if (p.coolTo) info.cool = { to: p.coolTo, at: 600 };
    if (p.flammable) info.flammable = true;
    if (p.conductive) info.conductive = true;
    if (p.explosive) info.explosive = true;
    if (p.soluble) info.soluble = true;
    info.state = p.state;
    info.density = p.density;
    if (p.meltAt != null) info.meltAt = p.meltAt;
    if (p.boilAt != null) info.boilAt = p.boilAt;
    if (p.symbol) info.symbol = p.symbol;
    if (p.formula) info.formula = p.formula;
    if (p.color) info.color = p.color;
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
