/* ============================================================================
   CRUCIBLE — Living Creature System (agent layer over the cellular sandbox)
   ----------------------------------------------------------------------------
   The Sandbox engine is a stateless cell grid (sand falls, water flows, things
   freeze/burn). Living things need IDENTITY and PERSISTENT STATE — a fish must
   remember it is THIS fish, with this much health, this hunger, this age — so we
   model them as a separate "agent" layer that rides ON TOP of the grid:

     - Each Creature is a real object with continuous (x,y) pixel position,
       velocity, and stats (health, energy, age, state label).
     - Every frame they sense the cells around them (water? air? fire?), steer,
       move, and lose energy. Their survival depends on the environment:
         · Fish / Shark  — must stay submerged in WATER. Out of water they
           suffocate; in fire/lava they cook.
         · Bird / Butterfly / Bee — FLYERS: roam the open air, tire and must
           land/rest, drown if they fall into deep water.
         · Human / Dog / Duck / Frog — WALKERS/AMPHIBIANS: walk on solid ground,
           need air to breathe; humans drown underwater, frogs & ducks are fine
           in water, ducks paddle, frogs hop between land and pond.
     - All creatures age, get hungry, flee danger, and eventually DIE (fade to
       a short-lived ✨ remains, then vanish). This makes the sandbox feel alive.

   Rendering: drawn as emoji sprites over the canvas after the engine renders the
   cells, so they read clearly at any cell size. Interaction (select / drag /
   remove) is handled by main.js which calls into this system.
============================================================================ */

import { drawPixelCreature } from "./pixel-sprites.js";

// Per-species blueprint. `locomotion` decides the physics model; the survival
// rules below read the habitat flags. Tunings are picked for FUN over realism
// (creatures live ~30-90s so you actually see births, struggles and deaths).
export const SPECIES = {
  fish:      { kind: "fish",      emoji: "🐟", name: "Fish",      loco: "swim", maxAge: 5200, foodEnergy: 0, size: 16 },
  shark:     { kind: "shark",     emoji: "🦈", name: "Shark",     loco: "swim", maxAge: 6000, predator: true, size: 22 },
  bird:      { kind: "bird",      emoji: "🐦", name: "Bird",      loco: "fly",  maxAge: 5000, size: 16 },
  butterfly: { kind: "butterfly", emoji: "🦋", name: "Butterfly", loco: "fly",  maxAge: 3600, flutter: 1.6, size: 14 },
  bee:       { kind: "bee",       emoji: "🐝", name: "Bee",       loco: "fly",  maxAge: 3400, flutter: 1.3, seeksPlants: true, size: 13 },
  human:     { kind: "human",     emoji: "🧑", name: "Human",     loco: "walk", maxAge: 8000, size: 20 },
  dog:       { kind: "dog",       emoji: "🐕", name: "Dog",       loco: "walk", maxAge: 6000, follows: "human", size: 17 },
  duck:      { kind: "duck",      emoji: "🦆", name: "Duck",      loco: "amph", maxAge: 5200, size: 16 },
  frog:      { kind: "frog",      emoji: "🐸", name: "Frog",      loco: "amph", maxAge: 4200, hops: true, size: 14 },
  // zoo / farm walkers
  cow:       { kind: "cow",       emoji: "🐄", name: "Cow",       loco: "walk", maxAge: 8000, size: 22 },
  sheep:     { kind: "sheep",     emoji: "🐑", name: "Sheep",     loco: "walk", maxAge: 7000, size: 19 },
  horse:     { kind: "horse",     emoji: "🐎", name: "Horse",     loco: "walk", maxAge: 8000, size: 22 },
  lion:      { kind: "lion",      emoji: "🦁", name: "Lion",      loco: "walk", maxAge: 7000, predator: true, size: 21 },
  elephant:  { kind: "elephant",  emoji: "🐘", name: "Elephant",  loco: "walk", maxAge: 9000, size: 26 },
  monkey:    { kind: "monkey",    emoji: "🐒", name: "Monkey",    loco: "walk", maxAge: 6000, size: 17 },
  penguin:   { kind: "penguin",   emoji: "🐧", name: "Penguin",   loco: "amph", maxAge: 6000, size: 17 },
};

// Ordered list of species the player can PLACE from the Life palette.
export const PLACEABLE = [
  "fish", "shark", "bird", "butterfly", "bee", "human", "dog", "duck", "frog",
];

// A Life placeable archetype unlocks as soon as ANY creature in its family is
// discovered in the Forge. The player rarely discovers the exact generic id
// ("fish"); they usually discover a specific species (anglerfish, clownfish…).
// Each list below is a roster of related element ids — discovering any one of
// them unlocks that placeable so the Life palette feels responsive.
export const PLACEABLE_UNLOCKERS = {
  fish:      ["fish", "anglerfish", "clownfish", "swordfish", "jellyfish", "starfish", "kingfisher", "salmon", "tuna", "eel", "seahorse"],
  shark:     ["shark", "whale", "dolphin", "orca", "octopus", "squid", "crab", "lobster"],
  bird:      ["bird", "eagle", "owl", "parrot", "penguin", "duck", "chicken", "crow", "sparrow", "robin", "flamingo", "peacock", "hummingbird", "kingfisher"],
  butterfly: ["butterfly", "moth", "caterpillar", "dragonfly"],
  bee:       ["bee", "wasp", "ant", "mosquito", "beetle", "ladybug", "firefly", "termite", "cockroach"],
  human:     ["human"],
  dog:       ["dog", "cat", "wolf", "fox", "lion", "tiger", "bear", "cow", "horse", "sheep", "pig", "goat", "rabbit", "deer", "elephant", "monkey", "mouse", "rat", "hamster"],
  duck:      ["duck", "goose", "swan", "pelican"],
  frog:      ["frog", "toad", "salamander", "newt", "tadpole"],
};

// True if a placeable archetype should be unlocked given the discovery state.
// `isDiscovered` is a predicate (id) => boolean (e.g. state.isDiscovered).
export function isPlaceableUnlocked(kind, isDiscovered) {
  const fam = PLACEABLE_UNLOCKERS[kind] || [kind];
  return fam.some((id) => isDiscovered(id));
}

// habitat grouping for the population counter
export function habitatOf(kind) {
  const s = SPECIES[kind];
  if (!s) return "land";
  if (s.loco === "swim") return "water";
  if (s.loco === "fly") return "air";
  return "land"; // walk + amph counted as land-dwellers
}

let UID = 1;

export class CreatureSystem {
  constructor(sandbox) {
    this.sb = sandbox;
    this.list = [];
    this.cap = 60;            // hard cap so mobile stays smooth
    this.selected = null;     // currently selected creature (for stats focus)
    this.onChange = null;     // callback when population/state changes (for UI)
    this._dirtyAt = 0;
    // When true (default), creatures never DIE & vanish on their own. They still
    // suffer, show distress states (Suffocating!, Drowning!, …) and lose health,
    // but health floors just above zero and recovers once conditions improve, so
    // the population a player builds (or a scene spawns) stays put. Only an
    // explicit removeAt()/clear() removes life.
    this.persistent = true;
    // Render mode for living things: true = hand-drawn pixel sprites (default),
    // false = emoji glyphs. Toggled from Settings → Look.
    this.pixelArt = true;
  }

  clear() { this.list.length = 0; this.selected = null; this._notify(); }

  // ---- save / load: compact snapshot of all living creatures for save slots ----
  // We persist only the fields needed to restore a creature; spec is re-derived
  // from kind on load. Remains/fading creatures are skipped.
  serialize() {
    const out = [];
    for (const cr of this.list) {
      if (!cr.alive) continue;
      out.push({
        k: cr.kind,
        x: Math.round(cr.x), y: Math.round(cr.y),
        vx: +cr.vx.toFixed(2), vy: +cr.vy.toFixed(2),
        h: Math.round(cr.health), e: Math.round(cr.energy), a: cr.age,
        f: cr.facing,
      });
    }
    return out;
  }

  deserialize(arr) {
    this.list.length = 0;
    this.selected = null;
    if (!Array.isArray(arr)) { this._notify(); return; }
    for (const c of arr) {
      const spec = SPECIES[c.k];
      if (!spec) continue;
      const cr = this.spawn(c.k, c.x, c.y);
      if (!cr) continue;
      cr.vx = c.vx || 0; cr.vy = c.vy || 0;
      cr.health = c.h != null ? c.h : 100;
      cr.energy = c.e != null ? c.e : 70;
      cr.age = c.a || 0;
      cr.facing = c.f || 1;
    }
    this._notify();
  }

  count() { return this.list.length; }

  // population split by habitat
  census() {
    const c = { land: 0, air: 0, water: 0 };
    for (const cr of this.list) if (cr.alive) c[habitatOf(cr.kind)]++;
    return c;
  }

  _notify() {
    if (this.onChange) { try { this.onChange(); } catch (e) {} }
  }

  // Spawn a creature at pixel (px,py). Returns the creature (or null if capped /
  // unknown species).
  spawn(kind, px, py) {
    const spec = SPECIES[kind];
    if (!spec) return null;
    if (this.list.filter(c => c.alive).length >= this.cap) return null;
    const cr = {
      uid: UID++,
      kind,
      spec,
      x: px, y: py,
      vx: (Math.random() * 2 - 1) * 0.6,
      vy: 0,
      health: 100,
      energy: 70 + Math.random() * 30,
      age: 0,
      maxAge: spec.maxAge * (0.8 + Math.random() * 0.4),
      alive: true,
      remains: 0,        // >0 while fading after death
      state: "Idle",
      facing: Math.random() < 0.5 ? -1 : 1,
      phase: Math.random() * Math.PI * 2, // for flutter/bob
      restCD: 0,
      // directional persistence: commit to a heading for a stretch of frames so
      // walkers stroll in straight lines and flyers cruise instead of jittering.
      heading: Math.random() < 0.5 ? -1 : 1,
      headingCD: 40 + Math.floor(Math.random() * 80),
      // flyers seek a preferred cruising altitude (set on first fly tick)
      cruiseY: 0,
    };
    this.list.push(cr);
    this._notify();
    return cr;
  }

  // ---- environment sensing helpers (pixel -> cell) ----
  cellAt(px, py) {
    const sb = this.sb;
    const cx = Math.floor(px / sb.cell), cy = Math.floor(py / sb.cell);
    if (!sb.inBounds(cx, cy)) return { id: 0, oob: true, cx, cy };
    return { id: sb.grid[sb.idx(cx, cy)] || 0, oob: false, cx, cy };
  }
  stateAt(px, py) {
    const c = this.cellAt(px, py);
    if (c.oob) return "oob";
    return c.id ? this.sb.state(c.id) : "empty";
  }
  behaviorAt(px, py) {
    const c = this.cellAt(px, py);
    if (!c.id) return null;
    const p = this.sb.phys(c.id);
    return p ? p.behavior : null;
  }
  isWater(px, py) { return this.behaviorAt(px, py) === "water"; }
  // Solid OR powder cell -> a creature cannot pass through it (it's a wall/floor).
  isSolid(px, py) {
    const st = this.stateAt(px, py);
    return st === "solid" || st === "powder";
  }
  // A cell that injures life. Fire, lava, explosion and acid are lethal to the
  // touch; live electricity/lightning (spark) electrocutes; molten-hot cells
  // burn even without an explicit hazard behavior.
  isDanger(px, py) {
    const b = this.behaviorAt(px, py);
    if (b === "fire" || b === "lava" || b === "explosion" || b === "acid" || b === "spark") return true;
    // anything scorchingly hot (molten metal, plasma) also counts as danger
    if (this.tempAt(px, py) >= 200) return true;
    return false;
  }
  // How badly a danger cell hurts (per frame). Lets bombs/fire kill, acid sting.
  dangerSeverity(px, py) {
    const b = this.behaviorAt(px, py);
    if (b === "explosion") return 60;   // a blast is near-instantly fatal
    if (b === "lava") return 28;
    if (b === "fire") return 22;
    if (b === "spark") return 26;       // electrocution
    if (b === "acid") return 14;
    if (this.tempAt(px, py) >= 200) return 16; // burned by molten/plasma heat
    return 8;
  }
  // is there solid ground just below this point? (for walkers)
  groundBelow(px, py) {
    const st = this.stateAt(px, py + this.sb.cell);
    return st === "solid" || st === "powder";
  }
  // Find the surface height (pixel Y of the TOP of the topmost filled cell) at
  // column `px`, searching downward from `fromPy`. The sandbox is a 2-D side-on
  // room, so walkers must stand ON TOP of sand/solids, not be buried inside them.
  // Returns the surface pixel Y, or null if no ground is found below.
  surfaceY(px, fromPy) {
    const sb = this.sb, cell = sb.cell;
    let cx = Math.floor(px / cell);
    let cy = Math.max(0, Math.floor(fromPy / cell));
    if (cx < 0 || cx >= sb.W) return null;
    for (let y = cy; y < sb.H; y++) {
      const id = sb.grid[sb.idx(cx, y)];
      if (!id) continue;
      const st = sb.state(id);
      if (st === "solid" || st === "powder") return y * cell; // top edge of this cell
    }
    return null;
  }
  // Snap a grounded walker so its FEET rest on the surface (sprite is drawn
  // centred on cr.y, so the feet sit ~footOffset below centre). Keeps the
  // creature sitting cleanly on top of the sand instead of sunk into it.
  _settleOnSurface(cr) {
    const foot = (cr.spec.size || 16) * 0.42; // distance from centre to feet
    // look from a little above the creature so we don't grab a ceiling cell
    const surf = this.surfaceY(cr.x, cr.y - foot);
    if (surf == null) return false;
    const restY = surf - foot;
    // only correct when standing on / sunk into ground (don't yank mid-jump up)
    if (cr.y >= restY - 1) { cr.y = restY; if (cr.vy > 0) cr.vy = 0; return true; }
    return false;
  }
  tempAt(px, py) {
    const c = this.cellAt(px, py);
    if (c.oob) return this.sb.ambient;
    return this.sb.temp[this.sb.idx(c.cx, c.cy)];
  }
  pressureAt(px, py) {
    const c = this.cellAt(px, py);
    if (c.oob) return 0;
    return this.sb.pressure[this.sb.idx(c.cx, c.cy)];
  }

  // Is the cell at (px,py) a SUFFOCATING gas/powder for air-breathers? Smoke,
  // CO2, poison/toxic gas and other dense fumes displace breathable air. We
  // treat any non-water gas whose id/tags signal toxicity or smoke as choking,
  // plus the explicit smoke/co2/poison ids. Steam is hot but breathable-ish, so
  // it's excluded (its heat is handled separately).
  isSuffocatingGas(px, py) {
    const c = this.cellAt(px, py);
    if (!c.id) return false;
    const sb = this.sb;
    const st = sb.state(c.id);
    if (st !== "gas") return false;
    if (c.id === "steam" || c.id === "water_vapor") return false;
    const choke = { smoke: 1, co2: 1, carbon_dioxide: 1, poison: 1, poison_gas: 1,
      toxic_gas: 1, chlorine: 1, methane: 1, carbon_monoxide: 1, nitrogen: 1 };
    if (choke[c.id]) return true;
    const el = sb.elements && sb.elements[c.id];
    const tags = (el && el.tags) || [];
    return tags.includes("toxic") || tags.includes("suffocant") || tags.includes("smoke");
  }

  // nearest creature of a given kind (for dog->human, predator->prey)
  nearestOf(cr, kindTest, maxDist) {
    let best = null, bd = (maxDist || 1e9) ** 2;
    for (const o of this.list) {
      if (o === cr || !o.alive) continue;
      if (!kindTest(o)) continue;
      const dx = o.x - cr.x, dy = o.y - cr.y;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  // ---- main update (called each engine frame) ----
  step() {
    const sb = this.sb;
    const W = sb.W * sb.cell, H = sb.H * sb.cell;
    let changed = false;
    for (const cr of this.list) {
      if (!cr.alive) {
        if (cr.remains > 0) { cr.remains--; if (cr.remains === 0) changed = true; }
        continue;
      }
      this._updateCreature(cr, W, H);
    }
    // cull faded remains
    const before = this.list.length;
    this.list = this.list.filter(c => c.alive || c.remains > 0);
    if (this.list.length !== before) changed = true;
    // throttled UI notify (~3x/sec) so the stats panel feels live without churn
    if (sb.frame - this._dirtyAt > 18) { this._dirtyAt = sb.frame; this._notify(); }
    else if (changed) this._notify();
  }

  _kill(cr, cause) {
    cr.alive = false;
    cr.state = cause || "Died";
    cr.remains = 36; // ~0.6s fade
    cr.health = 0;
  }

  _updateCreature(cr, W, H) {
    const sb = this.sb;
    const spec = cr.spec;
    cr.age++;
    cr.phase += 0.18;

    // --- aging & hunger drain ---
    // Persistent mode: metabolism is gentle and old age never kills — life endures.
    cr.energy -= this.persistent ? 0.02 : 0.05;
    if (!this.persistent && cr.age > cr.maxAge) { this._kill(cr, "Died of old age"); return; }

    // --- environmental damage / survival by locomotion ---
    const here = this.stateAt(cr.x, cr.y);
    const danger = this.isDanger(cr.x, cr.y);
    const inWater = this.isWater(cr.x, cr.y);
    const t = this.tempAt(cr.x, cr.y);

    // HAZARDS ARE LETHAL. Fire, lava, a bomb blast, live lightning or acid do
    // real, severe damage that CAN kill a creature outright — even in persistent
    // mode (an explosion should not leave survivors). We track this with
    // cr.fatalHit so the persistent-mode health floor below is bypassed.
    cr.fatalHit = false;
    if (danger) {
      const dmg = this.dangerSeverity(cr.x, cr.y);
      cr.health -= dmg;
      cr.state = "Fleeing danger!";
      if (dmg >= 16) cr.fatalHit = true; // serious burns/blasts can be fatal
    }
    // also catch a blast shockwave / fire raging in the immediate vicinity even
    // if the exact centre cell isn't a hazard this frame (sparse hazard cells).
    if (!danger && this._dangerNear(cr, 1)) {
      cr.health -= 10; cr.state = "Fleeing danger!"; cr.fatalHit = true;
    }
    // a live explosion FX flash right on top of a creature incinerates it
    if (this._inExplosionFX(cr)) { cr.health -= 70; cr.state = "Caught in blast!"; cr.fatalHit = true; }
    // extreme temperature hurts everyone a little
    if (t > 80) cr.health -= Math.min(3, (t - 80) / 60);
    if (t < -5) cr.health -= Math.min(2, (-t) / 30);

    // --- GAS SUFFOCATION: air-breathers choke in smoke / toxic / dense fumes ---
    // Swimmers (fish/shark) breathe water so smoke in air doesn't apply to them;
    // everyone else takes damage and is flagged distressed while engulfed.
    // A breathing failure is a LETHAL condition: it bypasses the persistent
    // health floor so the creature actually dies instead of clinging at 1 HP.
    cr.lethal = false;
    if (spec.loco !== "swim" && this.isSuffocatingGas(cr.x, cr.y)) {
      cr.health -= 3.5;
      cr.state = "Suffocating!";
      cr.choking = true;
      cr.lethal = true;
    } else {
      cr.choking = false;
    }

    if (spec.loco === "swim") {
      // FISH/SHARK: need water. Out of water = suffocating (LETHAL).
      if (!inWater) { cr.health -= 4; cr.state = "Suffocating!"; cr.lethal = true; }
      else if (cr.state === "Suffocating!" || cr.state === "Idle") cr.state = "Swimming";
    } else if (spec.loco === "fly") {
      // FLYERS: drown if submerged in water (LETHAL); otherwise fine in open air.
      if (inWater) { cr.health -= 5; cr.state = "Drowning!"; cr.lethal = true; }
      else if (cr.state === "Drowning!") cr.state = "Idle"; // back in air -> recover
    } else if (spec.loco === "walk") {
      // WALKERS (incl. humans): drown if head underwater (LETHAL).
      if (inWater) { cr.health -= 4; cr.state = "Drowning!"; cr.lethal = true; }
      else if (cr.state === "Drowning!") cr.state = "Idle"; // breathing air again -> recover
    } else if (spec.loco === "amph") {
      // AMPHIBIANS (frog/duck/penguin): happy in water OR on land.
      if (inWater && (cr.state === "Idle")) cr.state = "Swimming";
    }

    // --- starvation ---
    if (cr.energy <= 0) {
      cr.energy = 0;
      // in persistent mode hunger nags but doesn't drain to death
      if (!this.persistent) cr.health -= 1.2;
      if (!danger && !/!$/.test(cr.state)) cr.state = this.persistent ? "Hungry" : "Starving";
    }
    // Death from a HAZARD always applies, even in persistent mode — a bomb,
    // fire or lightning strike is a real, expected death (the whole point of
    // the user's request). Natural starvation/old-age stays disabled in
    // persistent mode via the health floor below.
    if (cr.fatalHit && cr.health <= 0) {
      const b = this.behaviorAt(cr.x, cr.y);
      const cause = b === "explosion" || cr.state === "Caught in blast!" ? "Killed in blast"
        : b === "lava" ? "Incinerated in lava"
        : b === "spark" ? "Electrocuted"
        : b === "acid" ? "Dissolved in acid"
        : "Burned to death";
      this._kill(cr, cause);
      return;
    }
    // A LETHAL breathing failure (suffocation / drowning) also kills outright,
    // bypassing the persistent floor — animals must not live forever at 1 HP.
    if (cr.lethal && cr.health <= 0) {
      const cause = cr.state === "Drowning!" ? "Drowned" : "Suffocated";
      this._kill(cr, cause);
      return;
    }
    if (this.persistent) {
      // Floor health just above zero so creatures cling to life and recover —
      // but NOT while taking a fatal hazard hit or a lethal breathing failure.
      if (cr.health < 6 && !cr.fatalHit && !cr.lethal) cr.health = 6;
      // Recover when safe & in the right element, and slowly refill energy so
      // creatures don't sit pinned at "Hungry" forever.
      const safeHere = !danger && t <= 80 && t >= -5;
      const rightElement =
        (spec.loco === "swim" && inWater) ||
        (spec.loco === "fly" && !inWater) ||
        (spec.loco === "walk" && !inWater) ||
        (spec.loco === "amph");
      if (safeHere && rightElement && cr.health < 100) cr.health = Math.min(100, cr.health + 1.5);
      if (cr.energy < 100) cr.energy = Math.min(100, cr.energy + 0.05);
    } else if (cr.health <= 0) {
      this._kill(cr, danger ? "Burned up" : (cr.lethal ? (cr.state === "Drowning!" ? "Drowned" : "Suffocated") : (here === "oob" ? "Lost" : "Perished")));
      return;
    }

    // --- ENVIRONMENTAL FORCES: tornado lift/swirl + high-pressure shove ---
    // A tornado near the creature picks it up (especially light flyers/small
    // bodies) and flings it toward & up the funnel. High local pressure shoves
    // it away from the source. These push velocity directly so the creature is
    // physically thrown by the weather/pressure systems.
    this._applyEnvForces(cr);

    // --- steering & movement per locomotion ---
    switch (spec.loco) {
      case "swim": this._swim(cr, W, H); break;
      case "fly":  this._fly(cr, W, H); break;
      case "amph": this._amph(cr, W, H); break;
      case "walk":
      default:     this._walk(cr, W, H); break;
    }

    // clamp to canvas
    if (cr.x < 4) { cr.x = 4; cr.vx = Math.abs(cr.vx); }
    if (cr.x > W - 4) { cr.x = W - 4; cr.vx = -Math.abs(cr.vx); }
    if (cr.y < 4) { cr.y = 4; cr.vy = Math.abs(cr.vy) * 0.3; }
    if (cr.y > H - 4) { cr.y = H - 4; cr.vy = Math.min(0, cr.vy); }
    if (cr.vx !== 0) cr.facing = cr.vx < 0 ? -1 : 1;
  }

  // Tornado lift/swirl + high-pressure shove. Called each frame per creature.
  _applyEnvForces(cr) {
    const sb = this.sb, cell = sb.cell;
    // --- tornado ---
    const w = sb.weather;
    if (w && w.kind === "tornado" && w.funnelX != null) {
      const funnelPx = w.funnelX * cell;
      const radiusPx = (w.funnelR || 4) * cell;
      const dx = cr.x - funnelPx;
      if (Math.abs(dx) < radiusPx * 2.2) {
        // lighter creatures get tossed harder (flyers + small bodies)
        const mass = (cr.spec.size || 16) / 16;
        const pull = (1 - Math.min(1, Math.abs(dx) / (radiusPx * 2.2))) / mass;
        // suck toward the funnel centre, spin, and lift upward
        cr.vx += (-Math.sign(dx) || 1) * pull * 1.6;
        cr.vx += Math.cos(sb.frame * 0.4 + cr.uid) * pull * 1.2; // swirl
        cr.vy -= pull * 2.4; // lift
        cr.state = "Caught in tornado!";
      }
    }
    // --- high-pressure shove (push away from the highest-pressure neighbour) ---
    const pHere = this.pressureAt(cr.x, cr.y);
    if (pHere >= 1.8) {
      let bestP = pHere, bx = 0, by = 0;
      const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
      for (const [ox, oy] of dirs) {
        const p = this.pressureAt(cr.x + ox * cell, cr.y + oy * cell);
        if (p > bestP) { bestP = p; bx = ox; by = oy; }
      }
      // push AWAY from the higher-pressure side
      const force = Math.min(2.5, (pHere - 1.0) * 0.6);
      cr.vx -= bx * force; cr.vy -= by * force;
      if (bestP >= 2.4 && cr.state !== "Caught in tornado!") cr.state = "Pushed by pressure!";
    }
  }

  // is a hazard cell within `cells` of the creature centre (8-neighbourhood)?
  _dangerNear(cr, cells) {
    const step = this.sb.cell;
    for (let dy = -cells; dy <= cells; dy++) {
      for (let dx = -cells; dx <= cells; dx++) {
        if (dx === 0 && dy === 0) continue;
        if (this.isDanger(cr.x + dx * step, cr.y + dy * step)) return true;
      }
    }
    return false;
  }
  // is a live explosion FX flash/fireball overlapping the creature right now?
  // The engine stores FX particles in CELL units on sb.fx; flash & fireball are
  // the hot, damaging cores.
  _inExplosionFX(cr) {
    const fx = this.sb.fx;
    if (!fx || !fx.length) return false;
    const cell = this.sb.cell;
    const cx = cr.x / cell, cy = cr.y / cell; // creature centre in cell units
    for (let i = 0; i < fx.length; i++) {
      const p = fx[i];
      if (p.kind !== "flash" && p.kind !== "fireball") continue;
      const rCells = (p.r / cell) || 0;
      if (rCells <= 0) continue;
      const dx = p.x - cx, dy = p.y - cy;
      if (dx * dx + dy * dy <= rCells * rCells) return true;
    }
    return false;
  }

  // flee vector away from nearest danger cell within a small radius
  _fleeVector(cr, radius) {
    const sb = this.sb, step = sb.cell;
    let fx = 0, fy = 0, found = false;
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const px = cr.x + dx * step, py = cr.y + dy * step;
        if (this.isDanger(px, py)) {
          const d = Math.hypot(dx, dy) || 1;
          fx -= dx / (d * d); fy -= dy / (d * d); found = true;
        }
      }
    }
    return found ? { fx, fy } : null;
  }

  _swim(cr, W, H) {
    // seek water; if currently out of water, thrash toward the nearest water below
    const flee = this._fleeVector(cr, 4);
    if (flee) { cr.vx += flee.fx * 0.5; cr.vy += flee.fy * 0.5; }
    else {
      // gentle wander
      cr.vx += (Math.random() * 2 - 1) * 0.12;
      cr.vy += (Math.random() * 2 - 1) * 0.12;
      // predators chase fish
      if (cr.spec.predator) {
        const prey = this.nearestOf(cr, o => o.kind === "fish", 140);
        if (prey) {
          cr.vx += Math.sign(prey.x - cr.x) * 0.18;
          cr.vy += Math.sign(prey.y - cr.y) * 0.18;
          cr.state = "Hunting";
          if (Math.hypot(prey.x - cr.x, prey.y - cr.y) < 12) {
            cr.energy = Math.min(100, cr.energy + 40);
            if (this.persistent) {
              // persistent mode: the chase is for show — nudge the prey away
              // (a near-miss) instead of removing it, so life never vanishes.
              prey.vx += Math.sign(prey.x - cr.x || 1) * 1.4;
              prey.vy += Math.sign(prey.y - cr.y || 1) * 1.4;
              prey.state = "Fleeing danger!";
            } else {
              this._kill(prey, "Eaten");
            }
          }
        }
      }
    }
    // buoyancy: if not in water, sink (gravity) trying to flop back into a pool
    if (!this.isWater(cr.x, cr.y)) { cr.vy += 0.25; cr.vx *= 0.96; }
    else {
      // stay submerged: avoid the surface (rise a bit if water below, sink if air below)
      const below = this.isWater(cr.x, cr.y + this.sb.cell * 2);
      const above = this.isWater(cr.x, cr.y - this.sb.cell * 2);
      if (!below) cr.vy -= 0.12; // bottom: drift up
      if (!above) cr.vy += 0.06; // surface: dip down a touch
      cr.vx *= 0.92; cr.vy *= 0.9;
    }
    this._limit(cr, 1.7);
    // move with SOLID collision: a fish must not pass through objects — it can
    // only swim through water (or fall through air). Resolve X and Y separately
    // so it slides along walls/floors instead of tunnelling into them.
    this._moveCollideSolid(cr);
  }

  // Integrate cr.vx/cr.vy but stop at solid/powder cells (walls, floors, rocks).
  // Water and empty air are passable. Used by swimmers so a beached/flopping
  // fish rests on top of sand instead of sinking through the world.
  _moveCollideSolid(cr) {
    const step = this.sb.cell;
    const half = (cr.spec.size || 16) * 0.4; // body half-extent toward leading edge
    // X axis
    if (cr.vx !== 0) {
      const edge = cr.x + Math.sign(cr.vx) * half;
      if (this.isSolid(edge + cr.vx, cr.y)) { cr.vx = 0; }
      else cr.x += cr.vx;
    }
    // Y axis
    if (cr.vy !== 0) {
      const edge = cr.y + Math.sign(cr.vy) * half;
      if (this.isSolid(cr.x, edge + cr.vy)) {
        // landed on / hit a solid surface: snap feet to its top edge when falling
        if (cr.vy > 0) {
          const surf = this.surfaceY(cr.x, cr.y - half);
          if (surf != null) cr.y = surf - half;
        }
        cr.vy = 0;
      } else cr.y += cr.vy;
    }
  }

  _fly(cr, W, H) {
    // Establish a personal cruising altitude inside an upper-middle flight band
    // the first time this creature flies (and re-roll it occasionally). The band
    // sits between ~18% and ~55% of the room height: high enough to look like
    // flight, but the creature is gently pulled BACK toward it instead of being
    // pushed ever-upward, so bees/birds no longer escape and pin to the ceiling.
    const bandTop = H * 0.18, bandBot = H * 0.55;
    if (!cr.cruiseY || cr.cruiseY < bandTop || cr.cruiseY > bandBot) {
      cr.cruiseY = bandTop + Math.random() * (bandBot - bandTop);
    }
    const flee = this._fleeVector(cr, 4);
    if (flee) { cr.vx += flee.fx * 0.6; cr.vy += flee.fy * 0.6; cr.state = "Fleeing danger!"; }
    else {
      // tire over time -> must land and rest on the ground
      if (cr.restCD > 0) {
        cr.restCD--; cr.state = "Resting";
        cr.vx *= 0.8; cr.vy += 0.2; // settle down
      } else {
        if (cr.energy < 25 && this.groundBelow(cr.x, cr.y)) { cr.restCD = 120; cr.energy += 18; }
        // occasionally pick a new cruising altitude so flight looks lively
        if (Math.random() < 0.01) cr.cruiseY = bandTop + Math.random() * (bandBot - bandTop);
        const flutter = cr.spec.flutter || 0.6;
        // --- horizontal: persistent heading (commit to a direction for a while)
        if (--cr.headingCD <= 0) {
          cr.heading = Math.random() < 0.5 ? -cr.heading : cr.heading;
          if (Math.random() < 0.25) cr.heading = Math.random() < 0.5 ? -1 : 1;
          cr.headingCD = 50 + Math.floor(Math.random() * 90);
        }
        cr.vx += cr.heading * 0.06 + (Math.random() * 2 - 1) * 0.06 * flutter;
        // --- vertical: spring back toward the cruise altitude (band-seeking)
        const dy = cr.cruiseY - cr.y;
        cr.vy += dy * 0.012;            // restoring pull toward the band
        cr.vy += Math.sin(cr.phase) * 0.05 * flutter; // gentle bob/flutter
        cr.vy *= 0.9;                   // damp vertical so it settles in-band
        if (cr.state !== "Fleeing danger!") cr.state = cr.kind === "bee" ? "Buzzing" : "Flying";
      }
    }
    // if it sinks into water, struggle upward
    if (this.isWater(cr.x, cr.y)) cr.vy -= 0.5;
    // never let a flyer cross the very top edge of the room
    if (cr.y < bandTop * 0.6 && cr.vy < 0) cr.vy = 0;
    this._limit(cr, cr.spec.flutter ? 1.5 : 1.9);
    cr.x += cr.vx; cr.y += cr.vy;
  }

  _walk(cr, W, H) {
    const flee = this._fleeVector(cr, 4);
    cr.vy += 0.5; // gravity
    if (flee) { cr.vx += flee.fx * 0.8; cr.state = "Fleeing danger!"; }
    else {
      // dogs follow nearest human
      if (cr.spec.follows) {
        const tgt = this.nearestOf(cr, o => o.kind === cr.spec.follows, 200);
        if (tgt && Math.abs(tgt.x - cr.x) > 18) { cr.vx += Math.sign(tgt.x - cr.x) * 0.14; cr.state = "Following"; }
        else { cr.vx += (Math.random() * 2 - 1) * 0.1; if (cr.state === "Idle" || cr.state === "Following") cr.state = "Wandering"; }
      } else {
        // Directional persistence: commit to one heading for a stretch of frames
        // and stroll in a STRAIGHT line, rather than re-rolling vx every tick
        // (which produced the old jittery, twitchy wander). Occasionally pause to
        // stand still, then resume — sometimes reversing direction.
        if (--cr.headingCD <= 0) {
          const r = Math.random();
          if (r < 0.30) { cr.heading = 0; cr.headingCD = 30 + Math.floor(Math.random() * 50); }      // pause/stand
          else if (r < 0.50) { cr.heading = -cr.heading || (Math.random() < 0.5 ? -1 : 1); cr.headingCD = 70 + Math.floor(Math.random() * 110); } // reverse
          else { cr.heading = Math.random() < 0.5 ? -1 : 1; cr.headingCD = 70 + Math.floor(Math.random() * 130); }   // new direction
        }
        if (cr.heading === 0) {
          cr.state = !/!$/.test(cr.state) ? "Standing" : cr.state; // settle to a stop
        } else {
          cr.vx += cr.heading * 0.10; // steady push in the committed direction
          if (!/!$/.test(cr.state)) cr.state = "Walking";
        }
      }
    }
    cr.vx *= 0.85;
    // clamp horizontal stroll speed only; let gravity build a real fall speed so
    // creatures drop onto the floor instead of drifting down at a crawl.
    if (cr.vx > 1.6) cr.vx = 1.6; else if (cr.vx < -1.6) cr.vx = -1.6;
    if (cr.vy > 6) cr.vy = 6;
    cr.x += cr.vx; cr.y += cr.vy;
    // resolve ground: rest the creature's FEET on the sand/solid surface so it
    // stands on top of the 2-D room floor instead of sinking into it.
    this._settleOnSurface(cr);
  }

  _amph(cr, W, H) {
    const inWater = this.isWater(cr.x, cr.y);
    const flee = this._fleeVector(cr, 4);
    if (inWater) {
      // paddle like a swimmer but can surface freely
      if (flee) { cr.vx += flee.fx * 0.5; cr.vy += flee.fy * 0.5; }
      else { cr.vx += (Math.random() * 2 - 1) * 0.12; cr.vy += (Math.random() * 2 - 1) * 0.1 - 0.04; }
      cr.vx *= 0.9; cr.vy *= 0.9;
      if (!/!$/.test(cr.state)) cr.state = cr.kind === "duck" ? "Paddling" : "Swimming";
      this._limit(cr, 1.4);
    } else {
      cr.vy += 0.5; // gravity on land
      if (flee) { cr.vx += flee.fx * 0.8; }
      else if (cr.spec.hops) {
        // frogs: occasional hop
        if (this.groundBelow(cr.x, cr.y) && Math.random() < 0.04) {
          cr.vy = -3.2; cr.vx = (Math.random() * 2 - 1) * 2; cr.state = "Hopping";
        } else if (this.groundBelow(cr.x, cr.y)) { cr.vx *= 0.6; if (!/!$/.test(cr.state)) cr.state = "Resting"; }
      } else {
        cr.vx += (Math.random() * 2 - 1) * 0.12;
        if (!/!$/.test(cr.state)) cr.state = "Waddling";
      }
      cr.vx *= 0.85;
      // clamp horizontal speed only; allow a real gravity fall to the floor
      if (cr.vx > 1.8) cr.vx = 1.8; else if (cr.vx < -1.8) cr.vx = -1.8;
      if (cr.vy > 6) cr.vy = 6;
      cr.x += cr.vx; cr.y += cr.vy;
      // rest feet on the surface (skip while mid-hop / rising)
      if (cr.vy >= -0.5) this._settleOnSurface(cr);
      return;
    }
    cr.x += cr.vx; cr.y += cr.vy;
  }

  _limit(cr, max) {
    const s = Math.hypot(cr.vx, cr.vy);
    if (s > max) { cr.vx = cr.vx / s * max; cr.vy = cr.vy / s * max; }
  }

  // ---- interaction ----
  // creature under a pixel (within its size radius), prefer topmost (last drawn)
  pick(px, py) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const cr = this.list[i];
      if (!cr.alive) continue;
      const r = (cr.spec.size || 16) * 0.7;
      if (Math.abs(cr.x - px) <= r && Math.abs(cr.y - py) <= r) return cr;
    }
    return null;
  }
  select(cr) { this.selected = cr || null; this._notify(); }
  removeAt(px, py) {
    const cr = this.pick(px, py);
    if (cr) { this._kill(cr, "Removed"); cr.remains = 8; if (this.selected === cr) this.selected = null; this._notify(); return true; }
    return false;
  }

  // ---- rendering: emoji sprites over the canvas ----
  render(ctx) {
    for (const cr of this.list) {
      const spec = cr.spec;
      let alpha = 1, scale = 1;
      if (!cr.alive) { alpha = cr.remains / 36; scale = 0.6 + (cr.remains / 36) * 0.4; }
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.translate(cr.x, cr.y);
      // gentle bob for flyers/swimmers
      const bob = (spec.loco === "fly" || spec.loco === "swim") ? Math.sin(cr.phase) * 1.5 : 0;
      ctx.translate(0, bob);
      if (cr.facing < 0) ctx.scale(-1, 1);
      const size = (spec.size || 16) * scale;
      // selection / low-health ring (drawn un-flipped so it stays circular)
      if (cr.alive && this.selected === cr) {
        ctx.save();
        if (cr.facing < 0) ctx.scale(-1, 1);
        ctx.beginPath();
        ctx.arc(0, 0, size * 0.85, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255,180,60,0.95)";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }
      if (!cr.alive) {
        // fading sparkle remains, regardless of render mode
        ctx.font = `${size}px serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("✨", 0, 0);
      } else if (this.pixelArt) {
        drawPixelCreature(ctx, cr.kind, size * 1.1);
      } else {
        ctx.font = `${size}px serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(spec.emoji, 0, 0);
      }
      ctx.restore();
      // tiny health pip under hurt creatures (alive, <60% hp)
      if (cr.alive && cr.health < 60) {
        const w = (spec.size || 16) * 0.8;
        const hx = cr.x - w / 2, hy = cr.y + (spec.size || 16) * 0.6 + bob;
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(hx - 1, hy - 1, w + 2, 4);
        const frac = Math.max(0, cr.health / 100);
        ctx.fillStyle = frac > 0.5 ? "#5fd17a" : frac > 0.25 ? "#e6b34a" : "#e0584a";
        ctx.fillRect(hx, hy, w * frac, 2);
        ctx.restore();
      }
    }
  }
}
