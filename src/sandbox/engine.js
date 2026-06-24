/* ============================================================================
   CRUCIBLE — Physics Sandbox Engine (cellular automata)
   ----------------------------------------------------------------------------
   Sandboxels-inspired falling-sand simulation. Grid of cells; each cell holds
   an element id (or 0 for empty). Behaviors:
     powder  : falls down, piles, slides diagonally
     liquid  : falls + spreads horizontally, denser sinks below lighter
     gas     : rises + diffuses, has lifespan
     energy  : fire/spark/explosion/plasma — spreads to flammables, lifespan
     solid   : static (but can melt/burn/react)
     plant   : static, flammable, grows toward water occasionally
   Plus: temperature transfer, phase changes (freeze/boil/melt/condense),
   reactions (acid eats, lava+water=stone+steam, etc.), gravity-correct density.

   Rendering: draws to a canvas with one rect per cell, with subtle dithering.
============================================================================ */

import { pixelColor } from "../icons.js";

export class Sandbox {
  constructor(canvas, { cell = 6 } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.cell = cell;
    this.elements = null;     // id -> element def (set via setLibrary)
    this.physById = new Map(); // id -> phys (resolved)
    this.colorById = new Map();
    this.running = true;
    this.frame = 0;
    this.brushSize = 3;
    this.currentTool = null;  // element id to paint
    this.gravity = 1;
    // --- event log (ring buffer of notable reactions / phase changes) ---
    this.events = [];          // newest last: {frame, kind, text, a, b, key}
    this.eventSeen = new Map(); // de-dupe key -> last frame logged
    this.maxEvents = 60;
    this.onEvent = null;       // optional callback(evt) for live UI
    this.pressureEnabled = true;
    this.resize();
  }

  // push a notable event, de-duped so we don't spam identical reactions every frame
  logEvent(kind, text, dedupeKey) {
    const dk = dedupeKey || (kind + "|" + text);
    const last = this.eventSeen.get(dk);
    if (last != null && this.frame - last < 45) return; // throttle identical events (~0.75s)
    this.eventSeen.set(dk, this.frame);
    const evt = { frame: this.frame, kind, text };
    this.events.push(evt);
    if (this.events.length > this.maxEvents) this.events.shift();
    if (this.onEvent) { try { this.onEvent(evt); } catch (e) {} }
  }

  // human-friendly element name for logs/HUD
  nameOf(id) {
    if (!id) return "Air";
    const el = this.elements && this.elements[id];
    return (el && el.name) || id;
  }

  setLibrary(elements) {
    this.elements = elements;
    for (const [id, el] of Object.entries(elements)) {
      if (el.phys) this.physById.set(id, el.phys);
      this.colorById.set(id, pixelColor(el));
    }
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = 1; // sandbox uses cell grid; keep crisp & fast
    this.canvas.width = Math.max(1, Math.floor(rect.width));
    this.canvas.height = Math.max(1, Math.floor(rect.height));
    this.W = Math.max(10, Math.floor(this.canvas.width / this.cell));
    this.H = Math.max(10, Math.floor(this.canvas.height / this.cell));
    const N = this.W * this.H;
    if (!this.grid || this.grid.length !== N) {
      this.grid = new Array(N).fill(0);
      this.temp = new Float32Array(N).fill(20);
      this.life = new Int16Array(N).fill(0);
      this.tint = new Float32Array(N); // per-cell color jitter [-1,1]
      this.pressure = new Float32Array(N); // 0 = ambient; higher = trapped gas buildup
    }
  }

  idx(x, y) { return y * this.W + x; }
  inBounds(x, y) { return x >= 0 && x < this.W && y >= 0 && y < this.H; }

  phys(id) { return id ? this.physById.get(id) : null; }
  density(id) {
    if (!id) return 0.3; // air-ish
    const p = this.physById.get(id);
    return p ? (p.density ?? 5) : 9; // unknown solids are heavy/static
  }
  state(id) {
    if (!id) return "empty";
    const p = this.physById.get(id);
    return p ? p.state : "solid"; // elements w/o phys are inert solids when placed
  }

  set(x, y, id, opts = {}) {
    if (!this.inBounds(x, y)) return;
    const i = this.idx(x, y);
    this.grid[i] = id;
    const p = this.phys(id);
    this.temp[i] = opts.temp ?? (p && p.temp != null ? p.temp : 20);
    this.life[i] = opts.life ?? (p && p.lifespan ? p.lifespan : 0);
    if (!this.tint[i]) this.tint[i] = (Math.random() * 2 - 1) * 0.18;
  }

  clearCell(x, y) {
    const i = this.idx(x, y);
    this.grid[i] = 0; this.temp[i] = 20; this.life[i] = 0; this.pressure[i] = 0;
  }

  paint(px, py, id) {
    const cx = Math.floor(px / this.cell), cy = Math.floor(py / this.cell);
    const r = this.brushSize;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (dx*dx + dy*dy > r*r) continue;
        const x = cx + dx, y = cy + dy;
        if (!this.inBounds(x, y)) continue;
        if (id === 0) { this.clearCell(x, y); continue; }
        // density-based: don't overwrite something heavier with a gas spray, but allow on empty
        if (this.grid[this.idx(x,y)] === 0 || id === "eraser") {
          if (id === "eraser") this.clearCell(x,y); else this.set(x, y, id);
        } else if (this.state(id) !== "gas") {
          // allow overpaint of lighter cells for solids/liquids/powders
          this.set(x, y, id);
        }
      }
  }

  clearAll() {
    this.grid.fill(0); this.temp.fill(20); this.life.fill(0); this.pressure.fill(0);
    this.events.length = 0; this.eventSeen.clear();
  }

  // Return the element id occupying the cell under a pixel coord (or 0 if empty).
  idAtPixel(px, py) {
    const cx = Math.floor(px / this.cell), cy = Math.floor(py / this.cell);
    if (!this.inBounds(cx, cy)) return 0;
    return this.grid[this.idx(cx, cy)] || 0;
  }

  // --- HUD accessors: read temperature / pressure / phase under a pixel ---
  tempAtPixel(px, py) {
    const cx = Math.floor(px / this.cell), cy = Math.floor(py / this.cell);
    if (!this.inBounds(cx, cy)) return 20;
    return this.temp[this.idx(cx, cy)];
  }
  pressureAtPixel(px, py) {
    const cx = Math.floor(px / this.cell), cy = Math.floor(py / this.cell);
    if (!this.inBounds(cx, cy)) return 0;
    return this.pressure[this.idx(cx, cy)];
  }
  // phase/state label for an element id at a pixel (uses temperature when relevant)
  phaseAtPixel(px, py) {
    const id = this.idAtPixel(px, py);
    if (!id) return "gas"; // empty cell = open air
    return this.state(id);
  }
  // descriptive readout object for the HUD
  readoutAtPixel(px, py) {
    const id = this.idAtPixel(px, py);
    return {
      id,
      name: this.nameOf(id),
      temp: Math.round(this.tempAtPixel(px, py)),
      pressure: +(this.pressureAtPixel(px, py)).toFixed(2),
      phase: id ? this.state(id) : "empty",
    };
  }

  // ---- main step ----
  step() {
    if (!this.running) return;
    this.frame++;
    const { W, H, grid } = this;
    // iterate bottom-up so falling resolves in one pass; alternate x direction
    const leftFirst = (this.frame & 1) === 0;
    for (let y = H - 1; y >= 0; y--) {
      for (let k = 0; k < W; k++) {
        const x = leftFirst ? k : (W - 1 - k);
        const id = grid[this.idx(x, y)];
        if (!id) continue;
        this.updateCell(x, y, id);
      }
    }
    this.diffuseHeat();
    this.updatePressure();
  }

  // Light enclosed-gas pressure model (cheap, runs every 3rd frame).
  // A gas/empty cell gains pressure when blocked above by solid/liquid/powder
  // (trapped, can't rise) and loses it when open above. Pressure also relaxes
  // toward ambient so it reads naturally. Logs a "high pressure" event once
  // a cell crosses a threshold, so the event log surfaces sealed gas pockets.
  updatePressure() {
    if (!this.pressureEnabled) return;
    if ((this.frame % 3) !== 0) return;
    const { W, H, grid, pressure } = this;
    let peak = 0, peakX = -1, peakY = -1;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = this.idx(x, y);
        const id = grid[i];
        const st = id ? this.state(id) : "empty";
        const isGasLike = st === "gas" || st === "empty";
        if (!isGasLike) { pressure[i] = 0; continue; }
        // is this gas trapped? check the cell directly above
        let trapped = 0;
        if (y > 0) {
          const aid = grid[this.idx(x, y - 1)];
          const ast = aid ? this.state(aid) : "empty";
          if (ast === "solid" || ast === "liquid" || ast === "powder") trapped++;
        } else trapped++; // top wall counts as a lid
        // sealed sides add a little
        const lid = (x === 0) || (grid[this.idx(x - 1, y)] && this.state(grid[this.idx(x - 1, y)]) !== "gas" && this.state(grid[this.idx(x - 1, y)]) !== "empty");
        const rid = (x === W - 1) || (grid[this.idx(x + 1, y)] && this.state(grid[this.idx(x + 1, y)]) !== "gas" && this.state(grid[this.idx(x + 1, y)]) !== "empty");
        if (lid && rid) trapped += 0.5;
        // real gas (not just air) under a lid builds more pressure
        const gasMass = st === "gas" ? 1 : 0.35;
        const target = trapped > 0 ? trapped * gasMass * 1.4 : 0;
        // ease toward target so it's smooth and mobile-cheap
        pressure[i] += (target - pressure[i]) * 0.25;
        if (pressure[i] > peak) { peak = pressure[i]; peakX = x; peakY = y; }
      }
    }
    if (peak >= 1.6 && peakX >= 0) {
      const id = grid[this.idx(peakX, peakY)];
      this.logEvent("pressure", `High pressure pocket (${this.nameOf(id)}) building up`, "pressure-high");
    }
  }

  swap(x1, y1, x2, y2) {
    const i = this.idx(x1, y1), j = this.idx(x2, y2);
    const g = this.grid[i]; this.grid[i] = this.grid[j]; this.grid[j] = g;
    const t = this.temp[i]; this.temp[i] = this.temp[j]; this.temp[j] = t;
    const l = this.life[i]; this.life[i] = this.life[j]; this.life[j] = l;
    const ti = this.tint[i]; this.tint[i] = this.tint[j]; this.tint[j] = ti;
    const pr = this.pressure[i]; this.pressure[i] = this.pressure[j]; this.pressure[j] = pr;
  }

  updateCell(x, y, id) {
    const p = this.phys(id);
    const i = this.idx(x, y);
    // lifespan
    if (this.life[i] > 0) {
      this.life[i]--;
      if (this.life[i] <= 0) {
        // expire -> ash/smoke/empty depending on behavior
        const beh = p && p.behavior;
        if (beh === "fire" || beh === "explosion") {
          if (Math.random() < 0.3 && this.has("smoke")) this.set(x, y, "smoke");
          else this.clearCell(x, y);
        } else this.clearCell(x, y);
        return;
      }
    }
    const beh = p ? p.behavior : "static";

    // reactions first (may consume the cell)
    if (this.react(x, y, id, p)) return;

    switch (beh) {
      case "powder": this.movePowder(x, y, id); break;
      case "water": case "lava": case "acid": this.moveLiquid(x, y, id, beh); break;
      case "gas": case "smoke": this.moveGas(x, y, id, beh); break;
      case "fire": this.moveFire(x, y, id, p); break;
      case "spark": this.moveSpark(x, y, id, p); break;
      case "explosion": this.explode(x, y, id, p); break;
      case "plant": /* mostly static; growth handled in react */ break;
      case "static": default: this.maybeFall(x, y, id, p); break;
    }
  }

  has(id) { return this.physById.has(id) || (this.elements && this.elements[id]); }

  // generic powder: down, then down-diagonal
  movePowder(x, y, id) {
    const d = this.density(id);
    if (this.tryMoveInto(x, y, x, y + 1, d)) return;
    const dir = Math.random() < 0.5 ? -1 : 1;
    if (this.tryMoveInto(x, y, x + dir, y + 1, d)) return;
    if (this.tryMoveInto(x, y, x - dir, y + 1, d)) return;
  }

  // liquid: down, down-diag, then sideways spread
  moveLiquid(x, y, id, beh) {
    const d = this.density(id);
    if (this.tryMoveInto(x, y, x, y + 1, d)) return;
    const dir = Math.random() < 0.5 ? -1 : 1;
    if (this.tryMoveInto(x, y, x + dir, y + 1, d)) return;
    if (this.tryMoveInto(x, y, x - dir, y + 1, d)) return;
    // spread horizontally up to a few cells
    const reach = beh === "lava" ? 1 : 3;
    for (let s = 1; s <= reach; s++) {
      if (this.tryMoveInto(x, y, x + dir * s, y, d)) return;
      if (this.tryMoveInto(x, y, x - dir * s, y, d)) return;
    }
  }

  // gas: rise, up-diag, diffuse sideways
  moveGas(x, y, id, beh) {
    const i = this.idx(x, y);
    if (this.life[i] === 0 && (this.phys(id)?.lifespan)) this.life[i] = this.phys(id).lifespan;
    const d = this.density(id);
    // rises: try to move up into emptier/heavier-above
    if (this.tryRiseInto(x, y, x, y - 1, d)) return;
    const dir = Math.random() < 0.5 ? -1 : 1;
    if (this.tryRiseInto(x, y, x + dir, y - 1, d)) return;
    if (this.tryRiseInto(x, y, x - dir, y - 1, d)) return;
    if (Math.random() < 0.7) {
      if (this.tryRiseInto(x, y, x + dir, y, d)) return;
      if (this.tryRiseInto(x, y, x - dir, y, d)) return;
    }
  }

  moveFire(x, y, id, p) {
    // spread to flammable neighbors, rise like gas occasionally
    const neigh = [[0,-1],[0,1],[-1,0],[1,0],[-1,-1],[1,-1]];
    for (const [dx, dy] of neigh) {
      const nx = x+dx, ny = y+dy;
      if (!this.inBounds(nx, ny)) continue;
      const nid = this.grid[this.idx(nx, ny)];
      const np = this.phys(nid);
      if (np && np.flammable && Math.random() < 0.25) {
        const fid = this.has("fire") ? "fire" : id;
        this.set(nx, ny, fid);
      }
      // boil water it touches
      if (nid && np && np.behavior === "water" && Math.random() < 0.2 && this.has("steam")) {
        this.set(nx, ny, "steam");
      }
    }
    // flicker upward
    if (Math.random() < 0.5) this.tryRiseInto(x, y, x, y - 1, 0.2);
    // heat self area
    this.temp[this.idx(x,y)] = Math.max(this.temp[this.idx(x,y)], (p?.temp)||700);
  }

  moveSpark(x, y, id, p) {
    // travel along conductive materials, else dart upward and die
    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    for (const [dx,dy] of dirs) {
      const nx=x+dx, ny=y+dy;
      if (!this.inBounds(nx,ny)) continue;
      const nid = this.grid[this.idx(nx,ny)];
      const np = this.phys(nid);
      if (np && np.conductive && Math.random()<0.5 && this.has("electricity")) {
        this.set(nx, ny, "electricity", { life: 6 });
      }
      if (np && np.flammable && Math.random()<0.4 && this.has("fire")) this.set(nx,ny,"fire");
    }
    if (Math.random()<0.6) this.tryRiseInto(x,y,x,y-1,0.2);
  }

  explode(x, y, id, p) {
    const R = 4;
    for (let dy=-R; dy<=R; dy++) for (let dx=-R; dx<=R; dx++) {
      if (dx*dx+dy*dy > R*R) continue;
      const nx=x+dx, ny=y+dy;
      if (!this.inBounds(nx,ny)) continue;
      const nid = this.grid[this.idx(nx,ny)];
      const np = this.phys(nid);
      if (!nid) { if (Math.random()<0.25 && this.has("fire")) this.set(nx,ny,"fire"); continue; }
      if (np && (np.state==="powder"||np.state==="liquid") && Math.random()<0.5) this.clearCell(nx,ny);
      if (np && np.explosive && (nx!==x||ny!==y) && Math.random()<0.6 && this.has("explosion")) this.set(nx,ny,"explosion");
      if (np && np.flammable && this.has("fire")) this.set(nx,ny,"fire");
    }
    this.life[this.idx(x,y)] = Math.min(this.life[this.idx(x,y)] || 6, 6);
  }

  maybeFall(x, y, id, p) {
    // inert placed solids: stay put (static). Heavy unknown objects don't fall.
  }

  // ---- movement primitives (respect density: heavier sinks) ----
  tryMoveInto(x, y, tx, ty, d) {
    if (!this.inBounds(tx, ty)) return false;
    const tid = this.grid[this.idx(tx, ty)];
    if (tid === 0) { this.swap(x, y, tx, ty); return true; }
    // sink through lighter liquid/gas
    const ts = this.state(tid);
    if ((ts === "liquid" || ts === "gas") && this.density(tid) < d) {
      this.swap(x, y, tx, ty); return true;
    }
    return false;
  }
  tryRiseInto(x, y, tx, ty, d) {
    if (!this.inBounds(tx, ty)) return false;
    const tid = this.grid[this.idx(tx, ty)];
    if (tid === 0) { this.swap(x, y, tx, ty); return true; }
    // rise through heavier liquid (bubble up)
    const ts = this.state(tid);
    if (ts === "liquid" && this.density(tid) > d) { this.swap(x, y, tx, ty); return true; }
    return false;
  }

  // ---- reactions & phase changes ----
  react(x, y, id, p) {
    if (!p) return false;
    const i = this.idx(x, y);
    const t = this.temp[i];

    // ---- phase changes by REAL temperature thresholds ----
    // Each element carries its own °C thresholds (water boilAt 100, iron meltAt
    // 1538, etc). Fall back to generic defaults when a value isn't authored.
    const boilAt = p.boilAt ?? 100;
    const freezeAt = p.freezeAt ?? 0;
    const meltAt = p.meltAt ?? 5;
    const condenseAt = (p.boilAt != null ? p.boilAt - 5 : 95);
    if (p.boilTo && t >= boilAt && this.has(p.boilTo)) {
      this.logEvent("phase", `${this.nameOf(id)} boiled into ${this.nameOf(p.boilTo)} at ${Math.round(boilAt)}°C`, "boil|"+id);
      this.set(x, y, p.boilTo); return true;
    }
    if (p.freezeTo && t <= freezeAt && this.has(p.freezeTo)) {
      this.logEvent("phase", `${this.nameOf(id)} froze into ${this.nameOf(p.freezeTo)} at ${Math.round(freezeAt)}°C`, "freeze|"+id);
      this.set(x, y, p.freezeTo); return true;
    }
    if (p.meltTo && t >= meltAt && this.has(p.meltTo)) {
      this.logEvent("phase", `${this.nameOf(id)} melted into ${this.nameOf(p.meltTo)} at ${Math.round(meltAt)}°C`, "melt|"+id);
      this.set(x, y, p.meltTo); return true;
    }
    if (p.condenseTo && t <= condenseAt && p.state === "gas" && Math.random() < 0.02 && this.has(p.condenseTo)) {
      this.logEvent("phase", `${this.nameOf(id)} condensed into ${this.nameOf(p.condenseTo)}`, "condense|"+id);
      this.set(x, y, p.condenseTo); return true;
    }
    if (p.coolTo && t <= 600 && this.has(p.coolTo)) {
      this.logEvent("phase", `${this.nameOf(id)} cooled into ${this.nameOf(p.coolTo)}`, "cool|"+id);
      this.set(x, y, p.coolTo); return true;
    }

    const neigh = [[0,1],[0,-1],[1,0],[-1,0]];
    for (const [dx, dy] of neigh) {
      const nx = x+dx, ny = y+dy;
      if (!this.inBounds(nx, ny)) continue;
      const j = this.idx(nx, ny);
      const nid = this.grid[j];
      if (!nid) continue;
      const np = this.phys(nid);
      if (!np) continue;

      // lava + water -> stone + steam
      if (p.behavior === "lava" && np.behavior === "water") {
        this.logEvent("reaction", `${this.nameOf(id)} + ${this.nameOf(nid)} → Stone + Steam`, "lava-water");
        if (this.has("stone")) this.set(x, y, "stone");
        if (this.has("steam")) this.set(nx, ny, "steam");
        return true;
      }
      // water + lava handled above from lava's perspective; also cool hot cells
      // acid eats solids/powders (not glass)
      if (p.behavior === "acid" && (np.state === "solid" || np.state === "powder")
          && !(np.tags && np.tags.includes && np.tags.includes("glassy"))) {
        if (Math.random() < 0.08) {
          this.logEvent("reaction", `Acid dissolved ${this.nameOf(nid)}`, "acid|"+nid);
          this.clearCell(nx, ny); if (Math.random()<0.4) this.clearCell(x,y); return true;
        }
      }
      // water extinguishes fire
      if (p.behavior === "water" && (np.behavior === "fire")) {
        this.logEvent("reaction", `Water extinguished Fire → Steam`, "water-fire");
        this.clearCell(nx, ny);
        if (this.has("steam")) this.set(x, y, "steam");
        return true;
      }
      // salt dissolves in water
      if (p.soluble && np.behavior === "water" && Math.random() < 0.05) {
        if (this.has("saltwater")) {
          this.logEvent("reaction", `${this.nameOf(id)} dissolved into Saltwater`, "soluble|"+id);
          this.set(nx, ny, "saltwater"); this.clearCell(x, y); return true;
        }
      }
      // plant grows into adjacent water/empty toward light (up) occasionally
      if (p.behavior === "plant" && np.behavior === "water" && Math.random() < 0.01) {
        this.logEvent("reaction", `${this.nameOf(id)} grew into Water`, "grow|"+id);
        this.set(nx, ny, id); return false;
      }
      // heat transfer for reactions: hot neighbor heats us
      if (np.temp && np.temp > this.temp[i]) {
        this.temp[i] += (np.temp - this.temp[i]) * 0.15;
      }
      // ignite if flammable & hot neighbor
      if (p.flammable && np.behavior === "fire" && Math.random() < 0.3 && this.has("fire")) {
        this.logEvent("reaction", `${this.nameOf(id)} caught Fire`, "ignite|"+id);
        this.set(x, y, "fire"); return true;
      }
    }
    return false;
  }

  diffuseHeat() {
    // light-touch ambient cooling toward 20°C so things settle
    const { W, H } = this;
    if ((this.frame & 3) !== 0) return; // every 4 frames
    for (let i = 0; i < this.temp.length; i++) {
      if (this.grid[i] === 0) { this.temp[i] += (20 - this.temp[i]) * 0.05; continue; }
      this.temp[i] += (20 - this.temp[i]) * 0.01;
    }
  }

  // ---- rendering ----
  render() {
    const { ctx, W, H, cell, grid } = this;
    ctx.fillStyle = "#0b0e14";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = this.idx(x, y);
        const id = grid[i];
        if (!id) continue;
        let color = this.colorById.get(id) || "#9aa3ad";
        // temperature glow tint for hot cells
        const t = this.temp[i];
        ctx.fillStyle = this.shade(color, this.tint[i], t);
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }
  }

  shade(hex, jitter, temp) {
    let h = hex.replace("#", "");
    if (h.length === 3) h = h.split("").map(c=>c+c).join("");
    let r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
    const j = jitter || 0;
    r = Math.max(0, Math.min(255, r + r*j));
    g = Math.max(0, Math.min(255, g + g*j));
    b = Math.max(0, Math.min(255, b + b*j));
    if (temp > 300) { // glow toward orange/white
      const f = Math.min(1, (temp - 300) / 1500);
      r = Math.min(255, r + 180*f); g = Math.min(255, g + 90*f);
    } else if (temp > 80) { // warm: nudge toward orange
      const f = Math.min(1, (temp - 80) / 220);
      r = Math.min(255, r + 50*f); g = Math.min(255, g + 18*f); b = Math.max(0, b - 20*f);
    } else if (temp < 0) { // cold: nudge toward icy blue
      const f = Math.min(1, (-temp) / 40);
      b = Math.min(255, b + 70*f); g = Math.min(255, g + 25*f); r = Math.max(0, r - 30*f);
    }
    return `rgb(${r|0},${g|0},${b|0})`;
  }
}
