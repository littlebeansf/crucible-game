/* ============================================================================
   CRUCIBLE — Save Slots
   ----------------------------------------------------------------------------
   Lets a player keep multiple independent save games. Each slot owns its own
   namespaced copy of every progress key (discoveries, recent order,
   achievements, and the Runs best score). A small manifest tracks slot
   metadata and which slot is active.

   Storage layout
   --------------
     crucible_slots_v1                 -> manifest JSON { activeId, slots:[…] }
     crucible_save_v1__<slotId>        -> Forge/discovery save for a slot
     crucible_runs_best_v1__<slotId>   -> Runs best score for a slot

   The legacy single-save keys (crucible_save_v1 / crucible_runs_best_v1) are
   migrated into the first slot on first run, so existing progress is kept.

   The rest of the game never touches storage keys directly for progress; it
   asks Slots for the namespaced key of the *active* slot via `key(base)`.
============================================================================ */

import { storage } from "./storage.js";

const MANIFEST_KEY = "crucible_slots_v1";
export const SAVE_BASE = "crucible_save_v1";
export const RUNS_BEST_BASE = "crucible_runs_best_v1";

const MAX_SLOTS = 5;

function uid() {
  return "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

class SlotManager {
  constructor() {
    this.manifest = this._loadManifest();
    this._migrateIfNeeded();
  }

  _loadManifest() {
    try {
      const raw = JSON.parse(storage.get(MANIFEST_KEY) || "null");
      if (raw && Array.isArray(raw.slots) && raw.slots.length) return raw;
    } catch {}
    return null;
  }

  _saveManifest() {
    storage.set(MANIFEST_KEY, JSON.stringify(this.manifest));
  }

  // First run: adopt any legacy single-save as "Slot 1" so nothing is lost.
  _migrateIfNeeded() {
    if (this.manifest) return;
    const id = uid();
    const legacySave = storage.get(SAVE_BASE);
    const legacyBest = storage.get(RUNS_BEST_BASE);
    // Move legacy payloads into the new namespaced keys for this first slot.
    if (legacySave != null) storage.set(`${SAVE_BASE}__${id}`, legacySave);
    if (legacyBest != null) storage.set(`${RUNS_BEST_BASE}__${id}`, legacyBest);
    let found = 0;
    try { found = (JSON.parse(legacySave || "null")?.discovered || []).length || 0; } catch {}
    const now = Date.now();
    this.manifest = {
      activeId: id,
      slots: [{ id, name: "Slot 1", created: now, updated: now, found }],
    };
    this._saveManifest();
  }

  // ---- queries -------------------------------------------------------------
  list() { return this.manifest.slots.slice(); }
  count() { return this.manifest.slots.length; }
  canCreate() { return this.count() < MAX_SLOTS; }
  maxSlots() { return MAX_SLOTS; }
  activeId() { return this.manifest.activeId; }
  active() { return this.manifest.slots.find(s => s.id === this.manifest.activeId) || this.manifest.slots[0]; }
  get(id) { return this.manifest.slots.find(s => s.id === id) || null; }

  // The namespaced storage key for a base key under the ACTIVE slot.
  key(base) { return `${base}__${this.manifest.activeId}`; }
  // Namespaced key for a SPECIFIC slot (used when copying between slots).
  keyFor(base, id) { return `${base}__${id}`; }

  // ---- mutations -----------------------------------------------------------
  // Switch the active slot. Caller is responsible for reloading game state.
  setActive(id) {
    if (!this.get(id)) return false;
    this.manifest.activeId = id;
    this._saveManifest();
    return true;
  }

  // Refresh the cached metadata (found count + updated time) for a slot.
  // Called by the game after progress changes so the slot list stays accurate.
  touch(id = this.manifest.activeId, found = null) {
    const s = this.get(id);
    if (!s) return;
    s.updated = Date.now();
    if (found != null) s.found = found;
    this._saveManifest();
  }

  // Create a fresh, empty slot and return it (does not switch to it).
  create(name) {
    if (!this.canCreate()) return null;
    const id = uid();
    const n = name && name.trim() ? name.trim().slice(0, 28) : this._defaultName();
    const now = Date.now();
    const slot = { id, name: n, created: now, updated: now, found: 0 };
    this.manifest.slots.push(slot);
    this._saveManifest();
    return slot;
  }

  // Duplicate an existing slot's data into a new slot.
  duplicate(sourceId) {
    if (!this.canCreate()) return null;
    const src = this.get(sourceId);
    if (!src) return null;
    const id = uid();
    const now = Date.now();
    // copy namespaced payloads
    const save = storage.get(this.keyFor(SAVE_BASE, sourceId));
    const best = storage.get(this.keyFor(RUNS_BEST_BASE, sourceId));
    if (save != null) storage.set(this.keyFor(SAVE_BASE, id), save);
    if (best != null) storage.set(this.keyFor(RUNS_BEST_BASE, id), best);
    const slot = { id, name: this._copyName(src.name), created: now, updated: now, found: src.found };
    this.manifest.slots.push(slot);
    this._saveManifest();
    return slot;
  }

  rename(id, name) {
    const s = this.get(id);
    if (!s) return false;
    const n = (name || "").trim().slice(0, 28);
    if (!n) return false;
    s.name = n;
    this._saveManifest();
    return true;
  }

  // Delete a slot and its data. Cannot delete the last remaining slot.
  // If the active slot is deleted, falls back to the first remaining one.
  remove(id) {
    if (this.count() <= 1) return false;
    const idx = this.manifest.slots.findIndex(s => s.id === id);
    if (idx < 0) return false;
    this.manifest.slots.splice(idx, 1);
    storage.remove(this.keyFor(SAVE_BASE, id));
    storage.remove(this.keyFor(RUNS_BEST_BASE, id));
    if (this.manifest.activeId === id) this.manifest.activeId = this.manifest.slots[0].id;
    this._saveManifest();
    return true;
  }

  _defaultName() {
    // First unused "Slot N" label.
    const used = new Set(this.manifest.slots.map(s => s.name));
    for (let i = 1; i <= MAX_SLOTS + 1; i++) {
      const n = `Slot ${i}`;
      if (!used.has(n)) return n;
    }
    return "New slot";
  }

  _copyName(base) {
    let name = `${base} copy`.slice(0, 28);
    const used = new Set(this.manifest.slots.map(s => s.name));
    if (!used.has(name)) return name;
    for (let i = 2; i <= 9; i++) {
      const n = `${base} copy ${i}`.slice(0, 28);
      if (!used.has(n)) return n;
    }
    return name;
  }
}

export const slots = new SlotManager();
