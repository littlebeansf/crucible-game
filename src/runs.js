/* ============================================================================
   CRUCIBLE — TRANSMUTATION RUNS
   A roguelike crafting loop layered on top of the element graph.

   The player gets a small hand of elements, an Energy budget, and a TARGET
   element to reach. Every combine costs energy. Producing a NEW element (one
   not yet in this run's hand) refunds energy, scores points and grows a combo
   multiplier. A combine that yields something already in the hand (or no
   recipe) drains energy and breaks the combo. Reach the target to clear the
   stage, bank score, draft a Relic that bends the rules, and face a harder
   target. The run ends when energy hits zero.

   This module is self-contained game logic + a tiny event emitter. The DOM /
   rendering lives in main.js. It reuses the shared recipe graph from GameState
   but keeps its OWN per-run "hand" so a run never touches global progress.
============================================================================ */

import { storage } from "./storage.js";

const BEST_KEY = "crucible_runs_best_v1";
const BASE = ["water", "fire", "earth", "air"];

/* ---- Relics: between-stage modifiers (Balatro-style) --------------------- */
// effect hooks read/modify the live run via the `r` (run) object.
export const RELICS = [
  { id: "spark",     emoji: "⚡", name: "Spark",        desc: "+12 energy refunded on every new discovery." },
  { id: "flow",      emoji: "💧", name: "Tidal Flow",   desc: "Liquids & gases cost 0 energy to combine." },
  { id: "cascade",   emoji: "🌊", name: "Cascade",      desc: "Combo multiplier never resets — only grows." },
  { id: "alchemist", emoji: "🜂", name: "Alchemist",    desc: "Every 3rd new discovery refunds an extra +25 energy." },
  { id: "prospector",emoji: "⛏️", name: "Prospector",  desc: "Solids, powders & metals score ×2." },
  { id: "lifebloom", emoji: "🌱", name: "Lifebloom",    desc: "Life elements score ×3." },
  { id: "echo",      emoji: "🔁", name: "Echo",         desc: "New discoveries are auto-kept AND duplicated into your hand." },
  { id: "frugal",    emoji: "🪙", name: "Frugal",       desc: "Base combine cost reduced from 10 → 6 energy." },
  { id: "compass",   emoji: "🧭", name: "Pathfinder",   desc: "Reveals one ingredient of the target each stage." },
  { id: "surge",     emoji: "🔥", name: "Overdrive",    desc: "Combo multiplier grows twice as fast." },
];

export class RunEngine {
  constructor(state) {
    this.state = state;            // GameState (shared recipe graph)
    this.elements = state.elements;
    this.recipes = state.recipes;
    this.listeners = new Set();
    this.run = null;               // active run or null
    this.best = this._loadBest();
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(type, data = {}) { for (const fn of this.listeners) fn({ type, run: this.run, ...data }); }

  _loadBest() { try { return JSON.parse(storage.get(BEST_KEY) || "0") || 0; } catch { return 0; } }
  _saveBest() { if (this.run && this.run.score > this.best) { this.best = this.run.score; storage.set(BEST_KEY, JSON.stringify(this.best)); } }

  /* ---- recipe helpers ---------------------------------------------------- */
  key(a, b) { return [a, b].sort().join("|"); }
  resultOf(a, b) { return this.recipes[this.key(a, b)] || null; }

  /* Build the set of everything reachable from a starting hand, with the
     minimum number of combine-steps to reach each (BFS over the closure).
     Used to pick a TARGET that is genuinely reachable but a few steps away. */
  reachable(handIds, maxSteps = 6) {
    const have = new Set(handIds);
    const dist = new Map(handIds.map(id => [id, 0]));
    let frontier = [...have];
    for (let step = 1; step <= maxSteps; step++) {
      const next = new Set();
      // try combining every pair where at least one side is in `have`
      const arr = [...have];
      for (let i = 0; i < arr.length; i++) {
        for (let j = i; j < arr.length; j++) {
          const res = this.resultOf(arr[i], arr[j]);
          if (res && !have.has(res) && !next.has(res)) next.add(res);
        }
      }
      if (!next.size) break;
      for (const id of next) { have.add(id); if (!dist.has(id)) dist.set(id, step); }
      frontier = [...next];
    }
    return dist; // Map id -> steps
  }

  /* Pick a target: reachable in [minSteps..maxSteps], prefer higher tier /
     more interesting categories so it feels like a real goal. */
  pickTarget(handIds, stage) {
    const minSteps = Math.min(2 + Math.floor(stage / 2), 4);
    const maxSteps = minSteps + 2;
    const dist = this.reachable(handIds, maxSteps + 1);
    const candidates = [];
    for (const [id, steps] of dist) {
      if (steps < minSteps || steps > maxSteps) continue;
      const el = this.elements[id];
      if (!el || handIds.includes(id)) continue;
      // weight by tier + a nudge for evocative categories
      const catBonus = ({ life: 3, cosmic: 4, machine: 2, structure: 2 })[el.category] || 0;
      const weight = (el.tier || 1) + catBonus + steps;
      candidates.push({ id, steps, weight });
    }
    if (!candidates.length) {
      // fallback: anything reachable at all that isn't in hand
      for (const [id, steps] of dist) if (!handIds.includes(id)) candidates.push({ id, steps, weight: steps });
    }
    if (!candidates.length) return null;
    // weighted random toward higher weight
    candidates.sort((a, b) => b.weight - a.weight);
    const pool = candidates.slice(0, Math.max(6, Math.ceil(candidates.length * 0.25)));
    const pick = pool[Math.floor(Math.random() * pool.length)];
    return { id: pick.id, steps: pick.steps };
  }

  /* ---- run lifecycle ----------------------------------------------------- */
  start() {
    // starting hand: the 4 base elements + up to 3 random already-discovered,
    // low-tier elements (gives variety without trivialising the target).
    const extras = [...this.state.discovered]
      .filter(id => !BASE.includes(id) && (this.elements[id]?.tier ?? 9) <= 3)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);
    const hand = [...BASE, ...extras];

    this.run = {
      stage: 1,
      score: 0,
      energy: 100,
      maxEnergy: 100,
      combo: 1,
      bestCombo: 1,
      hand: new Set(hand),
      handOrder: [...hand],
      relics: [],
      target: null,
      newThisRun: new Set(),
      discoveryCount: 0,
      over: false,
      won: false,
      log: [],
    };
    this._setTarget();
    this.emit("start");
    return this.run;
  }

  _setTarget() {
    const r = this.run;
    const t = this.pickTarget([...r.hand], r.stage);
    r.target = t ? { id: t.id, steps: t.steps, revealed: this._compassHint(t.id) } : null;
    if (!r.target) { this._win(); } // nothing left to reach -> treat as victory
  }

  _compassHint(targetId) {
    // Pathfinder relic: reveal one ingredient of a recipe that yields target.
    if (!this.run.relics.includes("compass")) return null;
    for (const [k, res] of Object.entries(this.recipes)) {
      if (res !== targetId) continue;
      const [a, b] = k.split("|");
      // prefer revealing an ingredient the player already has access to
      const known = this.run.hand.has(a) ? b : (this.run.hand.has(b) ? a : a);
      return known;
    }
    return null;
  }

  has(id) { return this.run && this.run.hand.has(id); }

  /* base combine cost, after relics */
  _cost(a, b) {
    const r = this.run;
    let cost = r.relics.includes("frugal") ? 6 : 10;
    if (r.relics.includes("flow")) {
      const ca = this.elements[a]?.category, cb = this.elements[b]?.category;
      const cheap = c => c === "liquid" || c === "gas";
      if (cheap(ca) && cheap(cb)) cost = 0;
    }
    return cost;
  }

  _scoreFor(el) {
    const r = this.run;
    let base = 10 + (el.tier || 1) * 6;
    if (r.relics.includes("prospector") && ["solid", "powder", "metal"].includes(el.category)) base *= 2;
    if (r.relics.includes("lifebloom") && el.category === "life") base *= 3;
    return Math.round(base * r.combo);
  }

  /* The core action: try to combine two ids from the hand. */
  combine(a, b) {
    const r = this.run;
    if (!r || r.over) return { ok: false };
    if (!r.hand.has(a) || !r.hand.has(b)) return { ok: false, reason: "not-in-hand" };

    const cost = this._cost(a, b);
    const res = this.resultOf(a, b);
    const ea = this.elements[a], eb = this.elements[b];

    // miss: no recipe OR result already in hand -> drain + break combo
    if (!res || r.hand.has(res)) {
      const drain = res ? cost : Math.ceil(cost * 1.5); // dead pairs hurt more
      r.energy -= drain;
      if (!r.relics.includes("cascade")) r.combo = 1;
      const reason = res ? `${this.elements[res].name} — already in hand` : "no reaction";
      this._pushLog(`✗ ${ea.name} + ${eb.name} → ${reason}  (−${drain}⚡)`);
      this.emit("combine", { ok: false, a, b, result: res || null, isNew: false, drain });
      this._checkEnd();
      return { ok: false, result: res, isNew: false };
    }

    // hit: NEW element for this run
    const el = this.elements[res];
    r.energy -= cost;
    // combo growth
    const grow = (r.relics.includes("surge") ? 0.5 : 0.25) * (r.relics.includes("cascade") ? 1 : 1);
    r.combo = Math.round((r.combo + grow) * 100) / 100;
    r.bestCombo = Math.max(r.bestCombo, r.combo);
    // refund
    let refund = 8 + (r.relics.includes("spark") ? 12 : 0);
    r.discoveryCount++;
    if (r.relics.includes("alchemist") && r.discoveryCount % 3 === 0) refund += 25;
    r.energy = Math.min(r.maxEnergy, r.energy + refund);
    // score
    const gained = this._scoreFor(el);
    r.score += gained;
    // add to hand
    r.hand.add(res); r.handOrder.push(res); r.newThisRun.add(res);
    if (r.relics.includes("echo")) { /* duplicate is implicit: it's a Set, but flag for UI */ }

    this._pushLog(`✓ ${ea.name} + ${eb.name} → ${el.name}  +${gained}pt  ×${r.combo.toFixed(2)}  (+${refund}⚡)`);
    this.emit("combine", { ok: true, a, b, result: res, isNew: true, gained, refund, el });

    // reached the target?
    if (r.target && res === r.target.id) { this._clearStage(); return { ok: true, result: res, isNew: true, cleared: true }; }

    this._checkEnd();
    return { ok: true, result: res, isNew: true };
  }

  _pushLog(text) { this.run.log.unshift(text); if (this.run.log.length > 40) this.run.log.pop(); }

  _clearStage() {
    const r = this.run;
    const bonus = 80 + r.stage * 40 + Math.round(r.energy * 0.5);
    r.score += bonus;
    r.energy = Math.min(r.maxEnergy + 20, r.energy + 30); // small breather
    this._pushLog(`🎯 Target reached! Stage ${r.stage} cleared  +${bonus}pt bonus`);
    this.emit("stage-clear", { bonus });
    // offer relic draft
    this._offerRelics();
  }

  _offerRelics() {
    const owned = new Set(this.run.relics);
    const pool = RELICS.filter(x => !owned.has(x.id)).sort(() => Math.random() - 0.5).slice(0, 3);
    this.run.relicChoices = pool;
    this.emit("relic-offer", { choices: pool });
  }

  chooseRelic(id) {
    const r = this.run;
    if (!r.relicChoices) return;
    const relic = r.relicChoices.find(x => x.id === id);
    if (relic) {
      r.relics.push(relic.id);
      if (relic.id === "frugal") {/* applied in _cost */}
      this._pushLog(`✦ Relic acquired: ${relic.name}`);
    }
    r.relicChoices = null;
    // next, harder stage
    r.stage++;
    r.maxEnergy += 10;
    r.energy = Math.min(r.maxEnergy, r.energy + 20);
    this._setTarget();
    this.emit("stage-next");
  }

  skipRelic() {
    const r = this.run;
    r.relicChoices = null;
    r.stage++;
    r.maxEnergy += 10;
    r.energy = Math.min(r.maxEnergy, r.energy + 20);
    this._setTarget();
    this.emit("stage-next");
  }

  _checkEnd() {
    const r = this.run;
    if (r.energy <= 0 && !r.over) { r.energy = 0; this._gameOver(); }
  }

  _gameOver() {
    this.run.over = true;
    this.run.won = false;
    this._saveBest();
    this.emit("over", { won: false });
  }

  _win() {
    if (!this.run) return;
    this.run.over = true;
    this.run.won = true;
    this._saveBest();
    this.emit("over", { won: true });
  }

  abandon() {
    if (this.run && !this.run.over) { this.run.over = true; this._saveBest(); }
    this.emit("abandon");
    this.run = null;
  }

  /* Convenience for the UI: list of valid (non-miss) combine partners for an
     id, so we can show subtle "this leads somewhere new" cues if desired. */
  newPartners(id) {
    const r = this.run; const out = [];
    if (!r) return out;
    for (const other of r.hand) {
      const res = this.resultOf(id, other);
      if (res && !r.hand.has(res)) out.push(other);
    }
    return out;
  }
}
