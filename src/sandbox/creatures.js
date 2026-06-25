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
  }

  clear() { this.list.length = 0; this.selected = null; this._notify(); }

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
  isDanger(px, py) {
    const b = this.behaviorAt(px, py);
    return b === "fire" || b === "lava" || b === "explosion" || b === "acid";
  }
  // is there solid ground just below this point? (for walkers)
  groundBelow(px, py) {
    const st = this.stateAt(px, py + this.sb.cell);
    return st === "solid" || st === "powder";
  }
  tempAt(px, py) {
    const c = this.cellAt(px, py);
    if (c.oob) return this.sb.ambient;
    return this.sb.temp[this.sb.idx(c.cx, c.cy)];
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

    if (danger) {
      cr.health -= 6; cr.state = "Fleeing danger!";
    }
    // extreme temperature hurts everyone a little
    if (t > 80) cr.health -= Math.min(3, (t - 80) / 60);
    if (t < -5) cr.health -= Math.min(2, (-t) / 30);

    if (spec.loco === "swim") {
      // FISH/SHARK: need water. Out of water = suffocating.
      if (!inWater) { cr.health -= 4; cr.state = "Suffocating!"; }
      else if (cr.state === "Suffocating!" || cr.state === "Idle") cr.state = "Swimming";
    } else if (spec.loco === "fly") {
      // FLYERS: drown if submerged in water; otherwise fine in open air.
      if (inWater) { cr.health -= 5; cr.state = "Drowning!"; }
    } else if (spec.loco === "walk") {
      // WALKERS (incl. humans): drown if head underwater.
      if (inWater) { cr.health -= 4; cr.state = "Drowning!"; }
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
    if (this.persistent) {
      // Floor health just above zero so creatures cling to life and recover.
      if (cr.health < 6) cr.health = 6;
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
      this._kill(cr, danger ? "Burned up" : (here === "oob" ? "Lost" : "Perished"));
      return;
    }

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
    // buoyancy: if not in water, sink (gravity) trying to fall back into a pool
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
    cr.x += cr.vx; cr.y += cr.vy;
  }

  _fly(cr, W, H) {
    const flee = this._fleeVector(cr, 4);
    if (flee) { cr.vx += flee.fx * 0.6; cr.vy += flee.fy * 0.6; cr.state = "Fleeing danger!"; }
    else {
      // tire over time -> must land and rest
      if (cr.restCD > 0) {
        cr.restCD--; cr.state = "Resting";
        cr.vx *= 0.8; cr.vy += 0.2; // settle down
      } else {
        if (cr.energy < 25 && this.groundBelow(cr.x, cr.y)) { cr.restCD = 120; cr.energy += 18; }
        // wander the sky with flutter
        const flutter = cr.spec.flutter || 0.6;
        cr.vx += (Math.random() * 2 - 1) * 0.25 * flutter;
        cr.vy += (Math.random() * 2 - 1) * 0.22 * flutter + Math.sin(cr.phase) * 0.05;
        // bees seek plants/flowers; gentle lift to stay airborne
        cr.vy -= 0.14; // counter gravity -> hovers
        if (cr.state !== "Fleeing danger!") cr.state = cr.kind === "bee" ? "Buzzing" : "Flying";
      }
    }
    // if it sinks into water, struggle upward
    if (this.isWater(cr.x, cr.y)) cr.vy -= 0.5;
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
        // wander; occasionally pause
        if (Math.random() < 0.02) cr.vx = 0;
        else cr.vx += (Math.random() * 2 - 1) * 0.12;
        if (!/!$/.test(cr.state)) cr.state = Math.abs(cr.vx) < 0.1 ? "Standing" : "Walking";
      }
    }
    // resolve ground: if a solid is directly below, stop falling and rest on it
    if (this.groundBelow(cr.x, cr.y)) { if (cr.vy > 0) cr.vy = 0; }
    else if (this.stateAt(cr.x, cr.y) === "solid" || this.stateAt(cr.x, cr.y) === "powder") {
      // embedded in solid -> pop up
      cr.vy = -1;
    }
    cr.vx *= 0.85;
    this._limit(cr, 1.6);
    cr.x += cr.vx; cr.y += cr.vy;
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
      if (this.groundBelow(cr.x, cr.y) && cr.vy > 0) cr.vy = 0;
      cr.vx *= 0.85;
      this._limit(cr, 1.8);
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
      ctx.font = `${size}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      // dead -> show a fading remains glyph
      const glyph = cr.alive ? spec.emoji : "✨";
      // selection / low-health ring
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
      ctx.fillText(glyph, 0, 0);
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
