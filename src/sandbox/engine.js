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
    // Fired with an element id whenever a REACTION or PHASE CHANGE produces a
    // material (not when the player paints). The app uses this to mark the
    // result as discovered in the Forge. De-duped via producedSeen so a busy
    // sim doesn't fire thousands of times per second.
    this.onProduce = null;
    this.producedSeen = new Set();
    this.pressureEnabled = true;
    // --- temperature regulator ---
    // Global ambient temperature the whole grid relaxes toward (°C). The player
    // drives this with the Sandbox "Climate" slider: crank it below 0 and exposed
    // water freezes; push it past boiling/melting points and things change phase.
    // `enviroForce` is how strongly the environment pushes cells toward ambient
    // (0 = engine ignores the regulator and uses gentle settle-to-20 behavior).
    this.ambient = 20;
    this.enviroForce = 0;
    // Configurable temperature limits ("Abs Zero" / max) the regulator clamps to.
    // Exposed in the Sim panel so the player can widen or narrow the climate range.
    this.tempMin = -60;
    this.tempMax = 1600;
    // Simulation speed multiplier (steps run per frame). 1 = normal; the render
    // loop in main.js reads this. Density/gravity multiplier affects fall speed.
    this.speed = 1;
    // --- weather: a temporary, self-expiring environmental event (snow/storm/
    // tornado/lightning). Set via startWeather(); stepWeather() advances it and
    // clears it when ttl runs out. weatherFX holds funnel/bolt overlay particles.
    this.weather = null;        // {kind, ttl, max, ...}
    this.weatherFX = [];        // overlay particles: rain/snow/debris/bolts
    this.prevAmbient = null;    // ambient to restore when a weather event ends
    this.showAxes = true;       // draw faint x/y ruler ticks + grid coords overlay
    // --- visual FX particle layer (explosions etc.) ---
    // Sub-cell float particles drawn on top of the grid. Pure eye-candy: they do
    // not affect the simulation. Each: {x,y,vx,vy in CELL units, r radius px,
    // life, max, kind}. Kinds: flash, fireball, shock, ember, smoke, spark.
    this.fx = [];
    this.maxFx = 900;
    // --- visualisation mode ---
    // "normal"      : material colours (default)
    // "temperature" : every cell tinted by its temperature (blue→red heatmap)
    // "pressure"    : every cell tinted by its pressure (calm→red heatmap)
    // In temp/pressure modes EVERY cell is coloured, including the open air, so
    // the room reads as a continuous field rather than scattered particles.
    this.viewMode = "normal";
    // No-vacuum model: the sandbox is a room full of air, never empty space. The
    // background paints a faint air wash and empty cells get a subtle moving
    // air tint so "Nothing" never looks like a black void.
    this.airBaseDark = "#0c1118";   // air wash behind everything (dark theme)
    this.resize();
  }

  // Switch the canvas visualisation. mode ∈ {"normal","temperature","pressure"}.
  setViewMode(mode) {
    if (mode === "temperature" || mode === "pressure") this.viewMode = mode;
    else this.viewMode = "normal";
  }

  // Set the global ambient/environment temperature (°C). Passing a value other
  // than the neutral 20°C turns the regulator ON (enviroForce ramps up); back at
  // 20 it eases off so the sandbox returns to its natural light cooling.
  setAmbient(t) {
    this.ambient = Math.max(this.tempMin, Math.min(this.tempMax, Number(t) || 0));
    // off when neutral, otherwise stronger the further from room temperature so
    // the regulator feels responsive (water freezes / things heat in a second or two)
    const dist = Math.abs(this.ambient - 20);
    this.enviroForce = dist < 1 ? 0 : Math.min(0.5, 0.12 + dist / 320);
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

  // Note that a reaction / phase change produced `id`. Fires onProduce once per
  // distinct material per session so the Forge can mark it discovered.
  produced(id) {
    if (!id || this.producedSeen.has(id)) return;
    this.producedSeen.add(id);
    if (this.onProduce) { try { this.onProduce(id); } catch (e) {} }
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
      if (el.phys) {
        // mirror the element's tags onto phys so reaction selectors ("tag:metal")
        // can match neighbours from the resolved phys map.
        if (el.tags && !el.phys.tags) el.phys.tags = el.tags;
        this.physById.set(id, el.phys);
      }
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
  // How resistant a liquid is to flowing (0 = water-thin, 1 = barely moves).
  // Uses an authored `viscosity` when present; otherwise derives a believable
  // value from behavior + density so thick fluids (lava, honey, blood, oil)
  // ooze while thin ones (water, acid, alcohol) spread fast.
  viscosity(id) {
    const p = this.physById.get(id);
    if (!p) return 0.2;
    if (p.viscosity != null) return Math.max(0, Math.min(1, p.viscosity));
    if (p.behavior === "lava") return 0.9;
    if (p.behavior === "acid") return 0.1;
    const d = p.density ?? 1;
    // denser liquids (honey 1.42, blood 1.06, mercury 13.5) read as thicker;
    // very light fuels (oil/gasoline/alcohol) still ooze a touch.
    if (d >= 5) return 0.35;          // liquid metals: dense but mobile
    if (d >= 1.3) return 0.6;         // honey-like syrups
    if (d >= 1.02) return 0.3;        // blood/milk/brine
    if (d < 0.9) return 0.45;         // oils & fuels: a bit gloopy
    return 0.05;                       // water-thin default
  }

  set(x, y, id, opts = {}) {
    if (!this.inBounds(x, y)) return;
    const i = this.idx(x, y);
    this.grid[i] = id;
    const p = this.phys(id);
    this.temp[i] = opts.temp ?? (p && p.temp != null ? p.temp : this.ambient);
    this.life[i] = opts.life ?? (p && p.lifespan ? p.lifespan : 0);
    if (!this.tint[i]) this.tint[i] = (Math.random() * 2 - 1) * 0.18;
  }

  clearCell(x, y) {
    const i = this.idx(x, y);
    this.grid[i] = 0; this.temp[i] = this.ambient; this.life[i] = 0; this.pressure[i] = 0;
    if (this._blasted) this._blasted.delete(i);
    if (this._blastPower) this._blastPower.delete(i);
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
        const occupant = this.grid[this.idx(x, y)];
        // empty cell (or eraser): always honour the stroke
        if (occupant === 0 || id === "eraser") {
          if (id === "eraser") this.clearCell(x, y); else this.set(x, y, id);
          continue;
        }
        // Painting never destroys a solid/powder structure that's already there:
        // you can only overpaint empty space or DISPLACEABLE matter (a lighter
        // liquid/gas the new material would sink through anyway). This lets you
        // build up structures and pour liquids over them without erasing blocks.
        const occState = this.state(occupant);
        const occSettled = occState === "solid" || occState === "powder";
        if (occSettled) continue;
        // occupant is a liquid/gas/energy: only replace if the new material is
        // heavier than what's there (so a gas spray won't bury heavier matter,
        // and pouring water into oil/air works as expected).
        if (this.state(id) === "gas") continue;
        if (this.density(id) >= this.density(occupant)) this.set(x, y, id);
      }
  }

  clearAll() {
    this.grid.fill(0); this.temp.fill(this.ambient); this.life.fill(0); this.pressure.fill(0);
    this.events.length = 0; this.eventSeen.clear();
    this.fx.length = 0; this.weather = null;
    if (this._blasted) this._blasted.clear();
    if (this._blastPower) this._blastPower.clear();
  }

  // Drop a solid/powder residue (e.g. salt from evaporating saltwater) into the
  // nearest empty cell at/below (x,y) so it settles rather than disappearing.
  _dropResidue(x, y, residueId) {
    for (const [dx, dy] of [[0, 0], [0, 1], [-1, 0], [1, 0], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (this.inBounds(nx, ny) && this.grid[this.idx(nx, ny)] === 0) {
        this.set(nx, ny, residueId); this.produced(residueId); return;
      }
    }
  }

  // Count non-empty cells (for the coordinate/px readout).
  countFilled() {
    let n = 0;
    for (let i = 0; i < this.grid.length; i++) if (this.grid[i]) n++;
    return n;
  }

  // ---- shape stamping (Box / Circle containers) ----
  // Honour the same overpaint rules as paint() so shapes layer naturally and
  // never bulldoze existing solids (lets you draw a stone box AROUND water).
  _stampCell(x, y, id) {
    if (!this.inBounds(x, y)) return;
    if (id === 0 || id === "eraser") { this.clearCell(x, y); return; }
    const occ = this.grid[this.idx(x, y)];
    if (occ === 0) { this.set(x, y, id); return; }
    if (this.state(id) === "solid" && this.state(occ) === "solid") return;
    if (this.state(id) !== "gas") this.set(x, y, id);
  }
  // Stamp a rectangle in CELL coordinates. fill=false => only the perimeter (a
  // hollow container). thickness controls the wall width for outlined shapes.
  stampRect(cx0, cy0, cx1, cy1, id, { fill = true, thickness = 1 } = {}) {
    const x0 = Math.min(cx0, cx1), x1 = Math.max(cx0, cx1);
    const y0 = Math.min(cy0, cy1), y1 = Math.max(cy0, cy1);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (!fill) {
          const edge = (x - x0 < thickness) || (x1 - x < thickness) ||
                       (y - y0 < thickness) || (y1 - y < thickness);
          if (!edge) continue;
        }
        this._stampCell(x, y, id);
      }
    }
  }
  // Stamp an ellipse/circle bounded by the drag rect (cell coords). fill=false
  // => a ring (hollow round container).
  stampEllipse(cx0, cy0, cx1, cy1, id, { fill = true, thickness = 1 } = {}) {
    const x0 = Math.min(cx0, cx1), x1 = Math.max(cx0, cx1);
    const y0 = Math.min(cy0, cy1), y1 = Math.max(cy0, cy1);
    const rx = Math.max(0.5, (x1 - x0) / 2), ry = Math.max(0.5, (y1 - y0) / 2);
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const tin = Math.max(0, 1 - thickness / Math.max(rx, ry));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const nx = (x - mx) / rx, ny = (y - my) / ry;
        const d = nx * nx + ny * ny;
        if (d > 1.02) continue;                 // outside the ellipse
        if (!fill && d < tin * tin) continue;   // inside the ring's hollow
        this._stampCell(x, y, id);
      }
    }
  }

  // px helpers for shape tools
  cellOfPixel(px, py) {
    return { cx: Math.floor(px / this.cell), cy: Math.floor(py / this.cell) };
  }

  // ---- serialize / deserialize (save slots) ----
  // Compact RLE of the grid so saved states stay small when persisted.
  serialize() {
    const g = this.grid, n = g.length;
    const rle = [];
    let i = 0;
    while (i < n) {
      const v = g[i]; let j = i + 1;
      while (j < n && g[j] === v) j++;
      rle.push([v || 0, j - i]);
      i = j;
    }
    return { v: 1, W: this.W, H: this.H, cell: this.cell, ambient: this.ambient,
      tempMin: this.tempMin, tempMax: this.tempMax, rle };
  }
  // Restore a serialized grid. Resizes the cell grid to match the saved cell
  // size & dimensions, then expands the RLE. Temps reset to ambient (fast & small).
  deserialize(obj) {
    if (!obj || !obj.rle) return false;
    if (obj.cell && obj.cell !== this.cell) { this.cell = obj.cell; }
    // force a grid sized to the SAVED dimensions and keep the canvas in sync so
    // the restored scene fills the same area it was saved at.
    const W = obj.W, H = obj.H, N = W * H;
    this.W = W; this.H = H;
    this.canvas.width = W * this.cell;
    this.canvas.height = H * this.cell;
    this.grid = new Array(N).fill(0);
    this.temp = new Float32Array(N).fill(obj.ambient ?? 20);
    this.life = new Int16Array(N).fill(0);
    this.tint = new Float32Array(N);
    this.pressure = new Float32Array(N);
    let i = 0;
    for (const [v, run] of obj.rle) {
      for (let k = 0; k < run && i < N; k++, i++) {
        this.grid[i] = v || 0;
        if (v) {
          const p = this.phys(v);
          this.temp[i] = (p && p.temp != null) ? p.temp : (obj.ambient ?? 20);
          this.life[i] = (p && p.lifespan) ? p.lifespan : 0;
          this.tint[i] = (Math.random() * 2 - 1) * 0.18;
        }
      }
    }
    if (obj.tempMin != null) this.tempMin = obj.tempMin;
    if (obj.tempMax != null) this.tempMax = obj.tempMax;
    this.setAmbient(obj.ambient ?? 20);
    this.fx.length = 0; this.weather = null;
    this.events.length = 0; this.eventSeen.clear();
    this.producedSeen.clear();
    return true;
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
    if (!this.inBounds(cx, cy)) return this.ambient;
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
      nextChange: this.nextChangeFor(id, this.tempAtPixel(px, py)),
    };
  }

  // Describe the next phase transition for `id` at the given temperature, e.g.
  // "melts >1538\u00b0C" or "freezes <0\u00b0C". Returns "" when nothing applies.
  // Looks at the element's phys thresholds and picks the nearest one in the
  // direction temperature would have to move. Used by the per-pixel hover HUD.
  nextChangeFor(id, temp) {
    if (!id) return "";
    const p = this.phys(id);
    if (!p) return "";
    const opts = [];
    if (p.meltAt != null) opts.push({ t: p.meltAt, up: true, verb: "melts", to: p.meltTo });
    if (p.boilAt != null) opts.push({ t: p.boilAt, up: true, verb: "boils", to: p.boilTo });
    if (p.freezeAt != null) opts.push({ t: p.freezeAt, up: false, verb: "freezes", to: p.freezeTo });
    if (p.condenseAt != null) opts.push({ t: p.condenseAt, up: false, verb: "condenses", to: p.condenseTo });
    if (!opts.length) return "";
    // pick the nearest threshold the cell hasn't passed yet (smallest |delta|
    // in the correct direction); fall back to the globally nearest.
    let best = null, bestD = Infinity;
    for (const o of opts) {
      const pending = o.up ? (temp < o.t) : (temp > o.t);
      if (!pending) continue;
      const d = Math.abs(o.t - temp);
      if (d < bestD) { bestD = d; best = o; }
    }
    if (!best) {
      for (const o of opts) { const d = Math.abs(o.t - temp); if (d < bestD) { bestD = d; best = o; } }
    }
    if (!best) return "";
    const arrow = best.up ? ">" : "<";
    const toName = best.to ? " \u2192 " + this.nameOf(best.to) : "";
    return `${best.verb} ${arrow}${Math.round(best.t)}\u00b0C${toName}`;
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
    this.stepWeather();
    this.stepFX();
  }

  // Sealed-cavity pressure model (Sandboxels-style, cheap, every 3rd frame).
  //
  // Each gas/empty cell builds pressure from two coupled sources:
  //   1) CONFINEMENT  \u2014 non-gas neighbours on each side act as walls. The more
  //      sealed a pocket is, the higher the baseline pressure (trapped gas).
  //   2) HEAT (PV=nRT, fun-approximation) \u2014 hot trapped gas pushes harder. A
  //      cell sitting next to magma/lava or simply very hot ramps pressure up
  //      proportional to (T-20). This makes a sealed room with magma inside
  //      pressurise and heat its surroundings.
  //
  // Consequences when pressure is high enough:
  //   \u2022 brittle/weak walls CRACK and vent (so bombs-in-a-box blow out),
  //   \u2022 adjacent liquids/powders get SHOVED away from the high-pressure cell,
  //   \u2022 trapped hot gas bleeds a little heat into the walls (room warms up).
  updatePressure() {
    if (!this.pressureEnabled) return;
    if ((this.frame % 3) !== 0) return;
    const { W, H, grid, pressure, temp } = this;
    let peak = 0, peakX = -1, peakY = -1;
    const vents = []; // {x,y} brittle walls to crack this pass
    const shoves = []; // {x,y,dir} liquid/powder pushes
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = this.idx(x, y);
        const id = grid[i];
        const st = id ? this.state(id) : "empty";
        const isGasLike = st === "gas" || st === "empty";
        if (!isGasLike) { pressure[i] = 0; continue; }
        // --- confinement: count sealing (non-gas) neighbours on 4 sides ---
        let seals = 0;
        const up = (y === 0) || this._isWallCell(x, y - 1);
        const dn = (y === H - 1) || this._isWallCell(x, y + 1);
        const lf = (x === 0) || this._isWallCell(x - 1, y);
        const rt = (x === W - 1) || this._isWallCell(x + 1, y);
        if (up) seals++; if (dn) seals++; if (lf) seals++; if (rt) seals++;
        // a lid above (can't rise out) matters most
        let trapped = up ? 1 : 0;
        if (seals >= 3) trapped += (seals - 2) * 0.6; // nearly-sealed pocket
        // real gas (not just air) under a lid builds more pressure
        const gasMass = st === "gas" ? 1 : 0.3;
        let target = trapped > 0 ? trapped * gasMass * 1.4 : 0;
        // --- heat coupling (PV=nRT fun-approx): hot trapped gas pushes harder ---
        const tC = temp[i];
        if (trapped > 0 && tC > 40) {
          target += Math.min(4, (tC - 20) / 180) * (1 + seals * 0.25);
        }
        // ease toward target so it's smooth and mobile-cheap
        pressure[i] += (target - pressure[i]) * 0.25;
        const pr = pressure[i];
        if (pr > peak) { peak = pr; peakX = x; peakY = y; }
        // --- consequences of high local pressure ---
        if (pr >= 2.2) {
          // 1) crack a brittle wall neighbour and vent (look for the weakest)
          if ((this.frame % 6) === 0) {
            const dirs = [[0,-1],[0,1],[-1,0],[1,0]];
            for (const [dx,dy] of dirs) {
              const nx = x+dx, ny = y+dy;
              if (!this.inBounds(nx,ny)) continue;
              if (this._isBrittleWall(grid[this.idx(nx,ny)])) { vents.push({x:nx,y:ny}); break; }
            }
          }
          // 2) shove an adjacent liquid/powder away from the pressure source
          if ((this.frame % 6) === 3) {
            const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
            for (const [dx,dy] of dirs) {
              const nx = x+dx, ny = y+dy;
              if (!this.inBounds(nx,ny)) continue;
              const ns = this.state(grid[this.idx(nx,ny)]);
              if (ns === "liquid" || ns === "powder") { shoves.push({x:nx,y:ny,dx,dy}); break; }
            }
          }
          // 3) hot trapped gas bleeds heat into surrounding walls (room warms)
          if (tC > 60) {
            const dirs = [[0,-1],[0,1],[-1,0],[1,0]];
            for (const [dx,dy] of dirs) {
              const nx = x+dx, ny = y+dy;
              if (!this.inBounds(nx,ny)) continue;
              const j = this.idx(nx,ny);
              if (this._isWallCell(nx,ny)) temp[j] += (tC - temp[j]) * 0.04;
            }
          }
        }
      }
    }
    // apply cracks: brittle wall -> empty + a puff of smoke + a pressure release
    for (const v of vents) {
      const i = this.idx(v.x, v.y);
      this.grid[i] = 0; this.pressure[i] = 0;
      if (Math.random() < 0.5 && this.has("smoke")) { this.set(v.x, v.y, "smoke"); }
      this.logEvent("pressure", "Pressure cracked a wall and vented", "pressure-crack");
    }
    // apply shoves: move the liquid/powder one cell further from the source if open
    for (const s of shoves) {
      const tx = s.x + s.dx, ty = s.y + s.dy;
      if (this.inBounds(tx, ty) && this.grid[this.idx(tx, ty)] === 0) {
        this.swap(s.x, s.y, tx, ty);
      }
    }
    if (peak >= 2.0 && peakX >= 0) {
      const id = grid[this.idx(peakX, peakY)];
      this.logEvent("pressure", `High pressure pocket (${this.nameOf(id)}) building up`, "pressure-high");
    }
  }

  // A "wall" for pressure purposes = solid / liquid / powder (anything a gas
  // can't freely pass through). Out-of-bounds is handled by callers.
  _isWallCell(x, y) {
    const id = this.grid[this.idx(x, y)];
    if (!id) return false;
    const st = this.state(id);
    return st === "solid" || st === "liquid" || st === "powder";
  }

  // Brittle walls that high pressure can crack open. Powders are loosely packed,
  // and glass/ice/sand-like solids are brittle. Metals & sturdy stone resist.
  _isBrittleWall(id) {
    if (!id) return false;
    const p = this.phys(id);
    if (!p) return false;
    if (p.state === "powder") return true;
    const brittle = { glass: 1, ice: 1, obsidian: 1, ceramic: 1, brick: 1 };
    return !!brittle[id];
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
          if (Math.random() < 0.3 && this.has("smoke")) { this.set(x, y, "smoke"); this.produced("smoke"); }
          else this.clearCell(x, y);
        } else this.clearCell(x, y);
        return;
      }
    }
    const beh = p ? p.behavior : "static";

    // reactions first (may consume the cell)
    if (this.react(x, y, id, p)) return;

    // GRAVITY multiplier (Sim panel): <1 makes falling matter drift/float by
    // skipping some ticks; >1 gives an extra settling attempt so it packs faster.
    // Gas is inverted — stronger gravity makes it rise more sluggishly.
    const g = this.gravity;
    switch (beh) {
      case "powder":
        if (g < 1 && Math.random() > g) break;
        this.movePowder(x, y, id);
        if (g > 1 && Math.random() < (g - 1)) this.movePowder(x, y, id);
        break;
      case "water": case "lava": case "acid":
        if (g < 1 && Math.random() > g) break;
        this.moveLiquid(x, y, id, beh);
        if (g > 1 && Math.random() < (g - 1)) this.moveLiquid(x, y, id, beh);
        break;
      case "gas": case "smoke":
        if (g > 1 && Math.random() < (g - 1) * 0.5) break;
        this.moveGas(x, y, id, beh); break;
      case "fire": this.moveFire(x, y, id, p); break;
      case "spark": this.moveSpark(x, y, id, p); break;
      case "explosion": this.explode(x, y, id, p); break;
      // Celestial bodies (sun / moon / star): fixed in place. They never fall,
      // spread, burn neighbours, or expire. Sun/star still emit heat purely via
      // the diffuseHeat source loop (their authored temp ≥ 200). The moon is an
      // inert cool body. They are drawn as smooth glowing discs in render().
      case "celestial":
        if (p && p.temp != null && p.temp >= 200) {
          this.temp[i] = Math.max(this.temp[i], p.temp);
        }
        break;
      case "plant": /* mostly static; growth handled in react */ break;
      case "static": default: this.maybeFall(x, y, id, p); break;
    }
  }

  has(id) { return this.physById.has(id) || (this.elements && this.elements[id]); }

  // Can matter of density `d` occupy/displace the cell at (tx,ty)? (empty, or a
  // lighter liquid/gas it can sink through). Used to gate diagonal moves so
  // powders/liquids can't squeeze through a diagonal seam where a wall meets a
  // floor — a diagonal slide is only legal if an ORTHOGONALLY adjacent cell on
  // the way is also open. Fixes liquids/powders leaking out of sealed containers.
  _passable(tx, ty, d) {
    if (!this.inBounds(tx, ty)) return false;
    const tid = this.grid[this.idx(tx, ty)];
    if (tid === 0) return true;
    const ts = this.state(tid);
    return (ts === "liquid" || ts === "gas") && this.density(tid) < d;
  }
  // Try a diagonal down move into (x+dir, y+1), but only when the seam is open:
  // the cell directly below OR the cell directly beside must be passable. This
  // stops corner-tunnelling through solid walls.
  _diagDown(x, y, dir, d) {
    if (!this._passable(x, y + 1, d) && !this._passable(x + dir, y, d)) return false;
    return this.tryMoveInto(x, y, x + dir, y + 1, d);
  }

  // generic powder: down, then down-diagonal (corner-tunnelling guarded)
  movePowder(x, y, id) {
    const d = this.density(id);
    if (this.tryMoveInto(x, y, x, y + 1, d)) return;
    const dir = Math.random() < 0.5 ? -1 : 1;
    if (this._diagDown(x, y, dir, d)) return;
    if (this._diagDown(x, y, -dir, d)) return;
  }

  // liquid: down, down-diag, then sideways spread.
  // Viscosity governs HOW the fluid moves: thick fluids (lava/honey) sometimes
  // refuse to flow this tick and barely spread sideways, so they pile into
  // gloopy mounds; thin fluids (water/acid) flow every tick and level out fast.
  // Density governs stratification: a heavier liquid actively sinks through a
  // lighter one directly below it (oil floats on water, mercury sinks).
  moveLiquid(x, y, id, beh) {
    const d = this.density(id);
    const visc = this.viscosity(id);
    // sink straight down into empty / lighter fluid (gravity always wins)
    if (this.tryMoveInto(x, y, x, y + 1, d)) return;
    // active restratification: if the cell directly below is a DIFFERENT, lighter
    // liquid, trade places so heavier liquid ends up underneath (layering).
    const below = this.grid[this.idx(x, y + 1 < this.H ? y + 1 : y)];
    if (y + 1 < this.H && below && below !== id && this.state(below) === "liquid"
        && this.density(below) < d && Math.random() < 0.5) {
      this.swap(x, y, x, y + 1); return;
    }
    const dir = Math.random() < 0.5 ? -1 : 1;
    if (this._diagDown(x, y, dir, d)) return;
    if (this._diagDown(x, y, -dir, d)) return;
    // viscous fluids sometimes just don't flow sideways this tick (sticky)
    if (Math.random() < visc) return;
    // sideways spread reach shrinks with viscosity: water reaches far, lava ~1.
    // Walk outward one cell at a time and STOP at the first wall so a liquid can
    // never teleport across a solid barrier (no jumping through container walls).
    const reach = Math.max(1, Math.round(4 * (1 - visc)));
    for (const sdir of (Math.random() < 0.5 ? [dir, -dir] : [-dir, dir])) {
      for (let s = 1; s <= reach; s++) {
        const tx = x + sdir * s;
        if (!this._passable(tx, y, d)) break;          // blocked: stop, don't skip past walls
        if (this.tryMoveInto(x, y, tx, y, d)) return;
      }
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
        this.set(nx, ny, fid); this.produced(fid);
      }
      // boil water it touches
      if (nid && np && np.behavior === "water" && Math.random() < 0.2 && this.has("steam")) {
        this.set(nx, ny, "steam"); this.produced("steam");
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
        this.set(nx, ny, "electricity", { life: 6 }); this.produced("electricity");
      }
      if (np && np.flammable && Math.random()<0.4 && this.has("fire")) { this.set(nx,ny,"fire"); this.produced("fire"); }
    }
    if (Math.random()<0.6) this.tryRiseInto(x,y,x,y-1,0.2);
  }

  // A blast centred on (x,y). Radius and force scale with the source element's
  // authored `power` (bigger bomb = bigger crater). A single detonation now does
  // the WHOLE blast in one shot (carves a crater, flings/clears matter, ignites
  // the flammable, chain-detonates other explosives, and dumps a huge amount of
  // heat into the temperature grid) instead of nibbling 1 cell-radius per frame.
  explode(x, y, id, p) {
    // Only detonate ONCE per explosion cell: mark it spent so the multi-frame
    // lifespan doesn't re-run the full (expensive, ever-growing) blast.
    const ci = this.idx(x, y);
    if (this._blasted && this._blasted.has(ci)) {
      // already blew: just live out the brief flash, then expire
      this.life[ci] = Math.min(this.life[ci] || 3, 3);
      return;
    }
    if (!this._blasted) this._blasted = new Set();
    this._blasted.add(ci);

    // power -> radius. A bomb that detonated stashed its own power for this cell
    // (explosion's base power is small). Otherwise use the element's authored power.
    const stashed = this._blastPower && this._blastPower.get(ci);
    if (this._blastPower) this._blastPower.delete(ci);
    const power = stashed || (p && p.power) || 5;
    const R = Math.max(2, Math.round(power));
    const R2 = R * R;
    const blastTemp = (p && p.temp) || 2600;

    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const dist2 = dx * dx + dy * dy;
        if (dist2 > R2) continue;
        const nx = x + dx, ny = y + dy;
        if (!this.inBounds(nx, ny)) continue;
        const j = this.idx(nx, ny);
        const nid = this.grid[j];
        const np = this.phys(nid);
        // falloff: full force at the core, tapering to the rim
        const t = dist2 / R2;              // 0 at centre .. 1 at rim
        const force = 1 - t;               // 1 .. 0

        // 1) dump heat everywhere in the radius (this is what melts/ignites)
        this.temp[j] = Math.max(this.temp[j], blastTemp * (0.25 + 0.75 * force));

        // 2) chain-detonate other explosives caught in the blast
        if (np && np.explosive && (nx !== x || ny !== y) && this.has("explosion")) {
          this.set(nx, ny, "explosion"); this.produced("explosion"); continue;
        }

        // 3) destroy / fling matter. Closer = more likely to be obliterated.
        if (nid) {
          const isWall = np && (np.indestructible || np.behavior === "wall");
          if (!isWall) {
            // core obliterates almost everything; rim merely scatters powders/liquids
            const clearChance = np && np.state === "solid"
              ? 0.85 * force                       // solids: carve a crater near the core
              : 0.95 * force + 0.2;                // powder/liquid/gas: flung easily
            if (Math.random() < clearChance) {
              this.clearCell(nx, ny);
              // leftover flammables that survive may ignite
              if (np && np.flammable && Math.random() < 0.5 && this.has("fire")) {
                this.set(nx, ny, "fire"); this.produced("fire");
              }
              continue;
            }
            // survived: flammable matter at the fringe catches fire
            if (np && np.flammable && Math.random() < 0.4 * force && this.has("fire")) {
              this.set(nx, ny, "fire"); this.produced("fire");
            }
          }
        } else {
          // 4) fill the void with fire/smoke so the blast reads as a fireball
          if (Math.random() < (0.5 * force + 0.1)) {
            if (force > 0.45 && this.has("fire")) { this.set(nx, ny, "fire"); this.produced("fire"); }
            else if (this.has("smoke")) { this.set(nx, ny, "smoke"); this.produced("smoke"); }
          }
        }
      }
    }
    this.life[ci] = Math.min(this.life[ci] || 4, 4);
    this.spawnExplosionFX(x, y, R);
    this.logEvent("reaction", `${this.nameOf(id)} detonated (blast r=${R})`, "explode|" + id);
  }

  // Bombs/explosives detonate when they get hot enough OR touch fire/spark/
  // explosion. Called from react(). Replaces the explosive cell with an
  // explosion energy cell that does the actual blast next tick.
  _maybeDetonate(x, y, id, p) {
    if (!p || !p.explosive) return false;
    if (!this.has("explosion")) return false;
    const i = this.idx(x, y);
    // ignition threshold: unstable liquids (nitro) go off at low temp
    const trigger = (p.state === "liquid") ? 80 : 240;
    let go = this.temp[i] >= trigger;
    if (!go) {
      // touching fire / spark / explosion / lava also detonates
      const neigh = [[0,1],[0,-1],[1,0],[-1,0]];
      for (const [dx, dy] of neigh) {
        const nx = x + dx, ny = y + dy;
        if (!this.inBounds(nx, ny)) continue;
        const nb = this.phys(this.grid[this.idx(nx, ny)]);
        if (nb && (nb.behavior === "fire" || nb.behavior === "spark" ||
                   nb.behavior === "explosion" || nb.behavior === "lava")) { go = true; break; }
      }
    }
    if (!go) return false;
    // become an explosion that carries THIS bomb's power
    this.set(x, y, "explosion");
    this.temp[i] = Math.max(this.temp[i], (p.temp) || 2600);
    // stash the bomb's power on the new explosion cell via a side map so explode()
    // uses the right radius (explosion element's base power is small)
    if (!this._blastPower) this._blastPower = new Map();
    this._blastPower.set(i, (p.power) || 6);
    this.produced("explosion");
    return true;
  }

  // Spawn an elaborate, multi-layer burst of FX particles centred on grid cell
  // (cx,cy). Positions/velocities are in CELL units so the effect scales with the
  // grid. Layers: a white-hot flash, an orange fireball core, an expanding
  // shockwave ring, flying embers (gravity + drag), bright sparks, and lingering
  // smoke puffs that rise and fade. Caps total particles so chained blasts stay
  // performant.
  spawnExplosionFX(cx, cy, R) {
    if (this.fx.length > this.maxFx) return;
    const cell = this.cell;
    const rnd = (a, b) => a + Math.random() * (b - a);
    const TAU = Math.PI * 2;
    // 1. white-hot central flash (one big short-lived glow)
    this.fx.push({ kind: "flash", x: cx, y: cy, vx: 0, vy: 0, r: R * cell * 1.4, life: 7, max: 7 });
    // 2. fireball core blobs — a few overlapping orange/yellow puffs that expand
    for (let i = 0; i < 7; i++) {
      const a = rnd(0, TAU), sp = rnd(0.05, 0.5);
      this.fx.push({ kind: "fireball", x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        r: rnd(R * 0.5, R * 1.1) * cell, life: rnd(14, 24) | 0, max: 24, hue: rnd(18, 42) });
    }
    // 3. expanding shockwave ring (stroked circle that grows + thins)
    this.fx.push({ kind: "shock", x: cx, y: cy, vx: 0, vy: 0, r: cell * 0.6, life: 16, max: 16, grow: R * cell * 0.9 });
    // 4. embers / debris — fast, gravity-affected, fading hot dots
    const embers = 22 + (R * 4 | 0);
    for (let i = 0; i < embers; i++) {
      const a = rnd(0, TAU), sp = rnd(0.3, 1.6);
      this.fx.push({ kind: "ember", x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - rnd(0, 0.4),
        r: rnd(0.8, 2.2), life: rnd(18, 40) | 0, max: 40, hue: rnd(20, 55) });
    }
    // 5. bright white sparks — thin streaks, very fast, short-lived
    for (let i = 0; i < 10; i++) {
      const a = rnd(0, TAU), sp = rnd(1.2, 2.6);
      this.fx.push({ kind: "spark", x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        r: rnd(0.6, 1.4), life: rnd(8, 16) | 0, max: 16 });
    }
    // 6. lingering smoke puffs — slow, rise, grow, fade to grey
    for (let i = 0; i < 8; i++) {
      const a = rnd(0, TAU), sp = rnd(0.04, 0.28);
      this.fx.push({ kind: "smoke", x: cx + rnd(-1, 1), y: cy + rnd(-1, 1),
        vx: Math.cos(a) * sp, vy: -rnd(0.1, 0.35), r: rnd(R * 0.4, R * 0.9) * cell,
        life: rnd(40, 80) | 0, max: 80, shade: rnd(40, 90) | 0 });
    }
  }

  // Advance all FX particles one frame (called from step()). Applies velocity,
  // gravity/drag per kind, grows/shrinks, and culls dead ones.
  // ====================================================================
  //  WEATHER  — temporary, self-expiring environmental events.
  //  Kinds: "snow", "storm", "tornado", "lightning". Each is started with a
  //  time-to-live (ttl, in frames) and advanced once per step. When ttl hits 0
  //  the event ends and ambient is restored to whatever it was before.
  //  Visual overlay particles live in this.weatherFX (rain drops, snow flakes,
  //  funnel debris, lightning bolts) and are drawn in renderWeather().
  // ====================================================================
  startWeather(kind, frames) {
    if (this.prevAmbient == null) this.prevAmbient = this.ambient;
    const max = frames || 600;
    this.weather = { kind, ttl: max, max, t: 0, tornadoX: this.W * 0.3, tornadoDir: 1, flashUntil: 0 };
    this.weatherFX = this.weatherFX || [];
    if (kind === "snow") {
      // cool the world while it snows
      this.setAmbient(Math.min(this.ambient, -8));
    } else if (kind === "storm") {
      this.setAmbient(Math.min(this.ambient, 12));
    }
    this.logEvent("weather", `${kind[0].toUpperCase() + kind.slice(1)} began`, "weather-" + kind);
  }

  stopWeather() {
    if (!this.weather) return;
    this.logEvent("weather", `${this.weather.kind} cleared`, "weather-stop-" + this.weather.kind);
    this.weather = null;
    if (this.prevAmbient != null) { this.setAmbient(this.prevAmbient); this.prevAmbient = null; }
    if (this.weatherFX) this.weatherFX.length = 0;
  }

  weatherActive() { return !!this.weather; }

  // advance the active weather event by one frame (called from step())
  stepWeather() {
    const w = this.weather;
    if (!w) return;
    w.ttl--; w.t++;
    this.weatherFX = this.weatherFX || [];
    const { W, H } = this;
    if (w.kind === "snow") this._stepSnow(w);
    else if (w.kind === "storm") this._stepStorm(w);
    else if (w.kind === "tornado") this._stepTornado(w);
    else if (w.kind === "lightning") this._stepLightning(w);
    // advance overlay particles (rain/snow/debris)
    const fx = this.weatherFX; let n = 0;
    for (let i = 0; i < fx.length; i++) {
      const p = fx[i];
      p.life--; if (p.life <= 0) continue;
      p.x += p.vx; p.y += p.vy;
      if (p.kind === "flake") { p.x += Math.sin((w.t + i) * 0.08) * 0.05; }
      fx[n++] = p;
    }
    fx.length = n;
    if (w.ttl <= 0) this.stopWeather();
  }

  _stepSnow(w) {
    const { W, H } = this;
    // spawn falling snow flakes from the top
    if ((this.frame & 1) === 0) {
      for (let s = 0; s < 3; s++) {
        const cx = Math.random() * W;
        this.weatherFX.push({ kind: "flake", x: cx, y: -1, vx: (Math.random()-0.5)*0.1, vy: 0.18 + Math.random()*0.12, r: 0.6 + Math.random()*0.6, life: H * 6, max: H * 6 });
      }
    }
    // occasionally deposit real snow powder at the surface for accumulation
    if (this.has("snow") && (this.frame % 4) === 0) {
      const cx = (Math.random() * W) | 0;
      // find first solid/liquid from top, place snow above it
      for (let y = 1; y < H; y++) {
        const st = this.state(this.grid[this.idx(cx, y)]);
        if (st === "solid" || st === "liquid" || st === "powder") {
          if (this.grid[this.idx(cx, y - 1)] === 0) { this.set(cx, y - 1, "snow"); }
          break;
        }
        if (y === H - 1 && this.grid[this.idx(cx, y)] === 0) this.set(cx, y, "snow");
      }
    }
  }

  _stepStorm(w) {
    const { W, H } = this;
    // wind-blown rain
    const wind = Math.sin(w.t * 0.02) * 0.12;
    for (let s = 0; s < 5; s++) {
      const cx = Math.random() * W;
      this.weatherFX.push({ kind: "rain", x: cx, y: -1, vx: wind + 0.05, vy: 0.9 + Math.random()*0.5, r: 1, life: H * 2, max: H * 2 });
    }
    // wet the surface a touch: place water occasionally
    if (this.has("water") && (this.frame % 10) === 0) {
      const cx = (Math.random() * W) | 0;
      if (this.grid[this.idx(cx, 1)] === 0) this.set(cx, 0, "water");
    }
    // periodic lightning strikes during a storm
    if (w.t > 30 && Math.random() < 0.025) this._strike(w);
  }

  _stepTornado(w) {
    const { W, H } = this;
    // move the funnel back and forth across the canvas
    w.tornadoX += w.tornadoDir * 0.25;
    if (w.tornadoX > W * 0.85) w.tornadoDir = -1;
    if (w.tornadoX < W * 0.15) w.tornadoDir = 1;
    const fx = (w.tornadoX) | 0;
    const radius = Math.max(3, (W * 0.06) | 0);
    // lift loose powders/liquids near the funnel into a swirling column
    for (let y = H - 1; y >= 1; y--) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = fx + dx;
        if (x < 0 || x >= W) continue;
        const id = this.grid[this.idx(x, y)];
        if (!id) continue;
        const st = this.state(id);
        if (st === "powder" || st === "liquid") {
          // pull toward the funnel centre and upward with some probability
          if (Math.random() < 0.35) {
            const towardX = x + (dx > 0 ? -1 : (dx < 0 ? 1 : (Math.random()<0.5?-1:1)));
            const upY = y - 1;
            if (this.inBounds(towardX, upY) && this.grid[this.idx(towardX, upY)] === 0) {
              this.swap(x, y, towardX, upY);
            } else if (this.grid[this.idx(x, upY)] === 0) {
              this.swap(x, y, x, upY);
            }
          }
        }
      }
    }
    // funnel debris overlay particles
    if ((this.frame & 1) === 0) {
      const cy = (Math.random() * H) | 0;
      const swirl = Math.sin(w.t * 0.3 + cy) * radius;
      this.weatherFX.push({ kind: "debris", x: fx + swirl, y: cy, vx: (Math.random()-0.5)*0.3, vy: -0.3 - Math.random()*0.3, r: 0.8, life: 30, max: 30 });
    }
    w.funnelX = fx; w.funnelR = radius;
  }

  _stepLightning(w) {
    // a quick series of bolts then it ends naturally via ttl
    if (w.t === 1 || Math.random() < 0.05) this._strike(w);
  }

  // fire a single lightning bolt: pick a column, zig-zag from top to first
  // obstacle, flash the screen, heat/ignite the impact point.
  _strike(w) {
    const { W, H } = this;
    const col = (Math.random() * W) | 0;
    // find impact row (first non-empty from top, else floor)
    let impactY = H - 1;
    for (let y = 0; y < H; y++) { if (this.grid[this.idx(col, y)]) { impactY = y; break; } }
    // build jagged path
    const path = []; let x = col;
    for (let y = 0; y <= impactY; y++) {
      x += (Math.random() * 3 | 0) - 1; x = Math.max(0, Math.min(W - 1, x));
      path.push({ x, y });
    }
    this.weatherFX.push({ kind: "bolt", path, life: 8, max: 8 });
    w.flashUntil = this.frame + 6;
    // impact: heat + chance to ignite flammable, electrify conductive
    const ix = path.length ? path[path.length - 1].x : col;
    const i = this.idx(ix, impactY);
    this.temp[i] = Math.max(this.temp[i], 900);
    const id = this.grid[i];
    if (id) {
      const p = this.phys(id);
      if (p && p.flammable && this.has("fire")) { this.set(ix, Math.max(0, impactY - 1), "fire"); }
    }
    this.spawnExplosionFX(ix, impactY, 2);
    this.logEvent("weather", "Lightning strike", "weather-strike");
  }

  // draw the weather overlay: rain streaks, snow flakes, funnel, bolts, flash
  renderWeather() {
    const w = this.weather; if (!w) return;
    const ctx = this.ctx, cell = this.cell;
    const fx = this.weatherFX || [];
    ctx.save();
    // screen flash for lightning
    if (w.flashUntil && this.frame < w.flashUntil) {
      const a = (w.flashUntil - this.frame) / 6 * 0.35;
      ctx.fillStyle = `rgba(220,230,255,${a})`;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    for (let i = 0; i < fx.length; i++) {
      const p = fx[i];
      const px = p.x * cell, py = p.y * cell;
      if (p.kind === "rain") {
        ctx.strokeStyle = "rgba(150,180,220,0.5)";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - p.vx * cell * 2, py - p.vy * cell * 2); ctx.stroke();
      } else if (p.kind === "flake") {
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.beginPath(); ctx.arc(px, py, p.r * cell * 0.4, 0, Math.PI * 2); ctx.fill();
      } else if (p.kind === "debris") {
        ctx.fillStyle = "rgba(180,170,150,0.6)";
        ctx.fillRect(px, py, cell * 0.6, cell * 0.6);
      } else if (p.kind === "bolt") {
        const t = p.life / p.max;
        ctx.strokeStyle = `rgba(235,240,255,${t})`;
        ctx.lineWidth = Math.max(1.5, cell * 0.4 * t);
        ctx.shadowColor = "rgba(180,200,255,0.9)"; ctx.shadowBlur = cell * 2;
        ctx.beginPath();
        for (let k = 0; k < p.path.length; k++) {
          const pt = p.path[k];
          const lx = pt.x * cell + cell / 2, ly = pt.y * cell + cell / 2;
          if (k === 0) ctx.moveTo(lx, ly); else ctx.lineTo(lx, ly);
        }
        ctx.stroke(); ctx.shadowBlur = 0;
      }
    }
    // tornado funnel silhouette
    if (w.kind === "tornado" && w.funnelX != null) {
      const cxp = w.funnelX * cell;
      const grad = ctx.createLinearGradient(cxp, 0, cxp, this.canvas.height);
      grad.addColorStop(0, "rgba(120,120,130,0.30)");
      grad.addColorStop(1, "rgba(90,90,100,0.12)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      const H = this.canvas.height;
      const topR = w.funnelR * cell * 1.4, botR = w.funnelR * cell * 0.5;
      ctx.moveTo(cxp - topR, 0); ctx.lineTo(cxp + topR, 0);
      ctx.lineTo(cxp + botR + Math.sin(w.t * 0.3) * cell, H);
      ctx.lineTo(cxp - botR + Math.sin(w.t * 0.3) * cell, H);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  stepFX() {
    const fx = this.fx;
    if (!fx.length) return;
    let w = 0;
    for (let i = 0; i < fx.length; i++) {
      const p = fx[i];
      p.life--;
      if (p.life <= 0) continue;
      p.x += p.vx; p.y += p.vy;
      if (p.kind === "ember") { p.vy += 0.06; p.vx *= 0.94; p.vy *= 0.97; }
      else if (p.kind === "spark") { p.vx *= 0.9; p.vy *= 0.9; }
      else if (p.kind === "fireball") { p.vx *= 0.9; p.vy *= 0.9; p.r *= 1.015; }
      else if (p.kind === "smoke") { p.vx *= 0.97; p.vy *= 0.98; p.r *= 1.02; }
      else if (p.kind === "shock") { p.r += p.grow * 0.16; }
      fx[w++] = p;
    }
    fx.length = w;
  }

  // Draw the FX layer on top of the grid (called at end of render()). Uses
  // additive blending for the hot layers so overlapping particles glow.
  renderFX() {
    const fx = this.fx;
    if (!fx.length) return;
    const ctx = this.ctx, cell = this.cell;
    ctx.save();
    // additive pass: flash, fireball, shock, ember, spark
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < fx.length; i++) {
      const p = fx[i];
      const t = p.life / p.max;        // 1 -> 0 as it dies
      const px = p.x * cell + cell / 2, py = p.y * cell + cell / 2;
      if (p.kind === "smoke") continue; // smoke drawn in normal pass below
      if (p.kind === "flash") {
        const a = Math.min(1, t) * 0.9;
        const g = ctx.createRadialGradient(px, py, 0, px, py, p.r);
        g.addColorStop(0, `rgba(255,255,245,${a})`);
        g.addColorStop(0.4, `rgba(255,220,150,${a * 0.7})`);
        g.addColorStop(1, "rgba(255,160,60,0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(px, py, p.r, 0, Math.PI * 2); ctx.fill();
      } else if (p.kind === "fireball") {
        const a = t * 0.8;
        const g = ctx.createRadialGradient(px, py, 0, px, py, p.r);
        g.addColorStop(0, `hsla(${p.hue + 20},100%,75%,${a})`);
        g.addColorStop(0.5, `hsla(${p.hue},100%,55%,${a * 0.8})`);
        g.addColorStop(1, `hsla(${p.hue - 10},100%,40%,0)`);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(px, py, p.r, 0, Math.PI * 2); ctx.fill();
      } else if (p.kind === "shock") {
        const a = t * 0.5;
        ctx.strokeStyle = `rgba(255,235,200,${a})`;
        ctx.lineWidth = Math.max(1, cell * 0.5 * t);
        ctx.beginPath(); ctx.arc(px, py, p.r, 0, Math.PI * 2); ctx.stroke();
      } else if (p.kind === "ember") {
        const a = t;
        ctx.fillStyle = `hsla(${p.hue},100%,${55 + 25 * t}%,${a})`;
        ctx.beginPath(); ctx.arc(px, py, p.r * (0.5 + t), 0, Math.PI * 2); ctx.fill();
      } else if (p.kind === "spark") {
        const a = t;
        const lx = px - p.vx * cell * 1.5, ly = py - p.vy * cell * 1.5;
        ctx.strokeStyle = `rgba(255,255,235,${a})`;
        ctx.lineWidth = p.r;
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(px, py); ctx.stroke();
      }
    }
    // normal pass: smoke (dark, semi-transparent, no glow)
    ctx.globalCompositeOperation = "source-over";
    for (let i = 0; i < fx.length; i++) {
      const p = fx[i];
      if (p.kind !== "smoke") continue;
      const t = p.life / p.max;
      const a = Math.min(0.35, t * 0.4);
      const px = p.x * cell + cell / 2, py = p.y * cell + cell / 2;
      const s = p.shade;
      const g = ctx.createRadialGradient(px, py, 0, px, py, p.r);
      g.addColorStop(0, `rgba(${s},${s},${s},${a})`);
      g.addColorStop(1, `rgba(${s},${s},${s},0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(px, py, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
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

  // Does neighbour cell (nid/np) match a reaction selector like "water",
  // "behavior:gas", or "tag:metal"? Exact-id is the common case.
  _matchSel(sel, nid, np) {
    if (!sel) return false;
    if (sel === nid) return true;
    if (sel.startsWith("behavior:")) return np && np.behavior === sel.slice(9);
    if (sel.startsWith("state:")) return np && np.state === sel.slice(6);
    if (sel.startsWith("tag:")) return np && np.tags && np.tags.indexOf(sel.slice(4)) >= 0;
    return false;
  }

  // Run the element's declared phys.reactions against one neighbour. Returns
  // true if a reaction fired and consumed this cell's turn.
  _dataReact(x, y, i, id, p, nx, ny, j, nid, np) {
    const rules = p.reactions;
    if (!rules || !rules.length) return false;
    for (const r of rules) {
      if (!this._matchSel(r.with, nid, np)) continue;
      if (r.needs && !this.has(r.needs)) continue;
      if (r.needsNear && !this._neighborHas(x, y, r.needsNear) && !this._neighborHas(nx, ny, r.needsNear)) continue;
      if (r.p != null && Math.random() >= r.p) continue;
      // products must exist in the library (be discovered/known) to appear
      if (r.to && !this.has(r.to)) continue;
      if (r.n && !this.has(r.n)) continue;
      if (r.heat) { this.temp[i] += r.heat; this.temp[j] += r.heat; }
      let changed = false;
      // replace neighbour
      if (r.n) { this.set(nx, ny, r.n); this.produced(r.n); changed = true; }
      else if (r.clearN) { this.clearCell(nx, ny); changed = true; }
      // replace / clear THIS cell
      if (r.to) { this.set(x, y, r.to); this.produced(r.to); changed = true; }
      else if (r.consume) { this.clearCell(x, y); changed = true; }
      if (r.event) this.logEvent("reaction", r.event, "dr|" + id + "|" + nid);
      else if (changed) this.logEvent("reaction", `${this.nameOf(id)} reacted with ${this.nameOf(nid)}`, "dr|" + id + "|" + nid);
      // a reaction that replaces THIS cell consumes the turn; a pure neighbour /
      // catalytic effect lets normal movement continue.
      if (r.to || r.consume) return true;
    }
    return false;
  }

  // True if any 4-neighbour of (x,y) holds element `wid`.
  _neighborHas(x, y, wid) {
    const d = [[0,1],[0,-1],[1,0],[-1,0]];
    for (const [dx, dy] of d) {
      const nx = x+dx, ny = y+dy;
      if (this.inBounds(nx, ny) && this.grid[this.idx(nx, ny)] === wid) return true;
    }
    return false;
  }

  // ---- reactions & phase changes ----
  react(x, y, id, p) {
    if (!p) return false;
    const i = this.idx(x, y);
    const t = this.temp[i];

    // explosives detonate when hot enough or touching fire/spark/lava/explosion
    if (p.explosive && this._maybeDetonate(x, y, id, p)) return true;

    // ---- phase changes by REAL temperature thresholds ----
    // Each element carries its own °C thresholds (water boilAt 100, iron meltAt
    // 1538, etc). Fall back to generic defaults when a value isn't authored.
    const boilAt = p.boilAt ?? 100;
    const freezeAt = p.freezeAt ?? 0;
    const meltAt = p.meltAt ?? 5;
    const condenseAt = (p.boilAt != null ? p.boilAt - 5 : 95);
    if (p.boilTo && t >= boilAt && this.has(p.boilTo)) {
      this.logEvent("phase", `${this.nameOf(id)} boiled into ${this.nameOf(p.boilTo)} at ${Math.round(boilAt)}°C`, "boil|"+id);
      // Evaporation can leave a non-volatile residue behind (e.g. salt water /
      // brine boils off as steam but drops solid salt). Spawn the residue in a
      // nearby empty/loose cell so it accumulates rather than vanishing.
      if (p.evapResidue && this.has(p.evapResidue) && Math.random() < 0.5) {
        this._dropResidue(x, y, p.evapResidue);
      }
      this.set(x, y, p.boilTo); this.produced(p.boilTo); return true;
    }
    if (p.freezeTo && t <= freezeAt && this.has(p.freezeTo)) {
      this.logEvent("phase", `${this.nameOf(id)} froze into ${this.nameOf(p.freezeTo)} at ${Math.round(freezeAt)}°C`, "freeze|"+id);
      this.set(x, y, p.freezeTo); this.produced(p.freezeTo); return true;
    }
    if (p.meltTo && t >= meltAt && this.has(p.meltTo)) {
      this.logEvent("phase", `${this.nameOf(id)} melted into ${this.nameOf(p.meltTo)} at ${Math.round(meltAt)}°C`, "melt|"+id);
      this.set(x, y, p.meltTo); this.produced(p.meltTo); return true;
    }
    if (p.condenseTo && t <= condenseAt && p.state === "gas" && Math.random() < 0.02 && this.has(p.condenseTo)) {
      this.logEvent("phase", `${this.nameOf(id)} condensed into ${this.nameOf(p.condenseTo)}`, "condense|"+id);
      this.set(x, y, p.condenseTo); this.produced(p.condenseTo); return true;
    }
    if (p.coolTo && t <= 600 && this.has(p.coolTo)) {
      this.logEvent("phase", `${this.nameOf(id)} cooled into ${this.nameOf(p.coolTo)}`, "cool|"+id);
      this.set(x, y, p.coolTo); this.produced(p.coolTo); return true;
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

      // ---- DATA-DRIVEN reactions (phys.reactions) ----
      // Lets elements.json declare contact reactions without engine edits, so we
      // can pile in lots of gas/liquid chemistry. Each rule: { with, to, n, p,
      // needs, heat, event }. `with` matches the neighbour by exact id, or
      // "behavior:water", or "tag:metal". `to` replaces THIS cell (null + no `n`
      // clears it), `n` replaces the NEIGHBOUR cell. `needs` requires a 3rd id
      // present somewhere (e.g. "fire"). `heat` adds °C to both cells.
      if (this._dataReact(x, y, i, id, p, nx, ny, j, nid, np)) return true;

      // lava + water -> stone + steam
      if (p.behavior === "lava" && np.behavior === "water") {
        this.logEvent("reaction", `${this.nameOf(id)} + ${this.nameOf(nid)} → Stone + Steam`, "lava-water");
        if (this.has("stone")) { this.set(x, y, "stone"); this.produced("stone"); }
        if (this.has("steam")) { this.set(nx, ny, "steam"); this.produced("steam"); }
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
        if (this.has("steam")) { this.set(x, y, "steam"); this.produced("steam"); }
        return true;
      }
      // salt dissolves in water
      if (p.soluble && np.behavior === "water" && Math.random() < 0.05) {
        if (this.has("saltwater")) {
          this.logEvent("reaction", `${this.nameOf(id)} dissolved into Saltwater`, "soluble|"+id);
          this.set(nx, ny, "saltwater"); this.produced("saltwater"); this.clearCell(x, y); return true;
        }
      }
      // plant grows into adjacent water/empty toward light (up) occasionally
      if (p.behavior === "plant" && np.behavior === "water" && Math.random() < 0.01) {
        this.logEvent("reaction", `${this.nameOf(id)} grew into Water`, "grow|"+id);
        this.set(nx, ny, id); return false;
      }
      // heat transfer for reactions: a hotter neighbour heats us. Use the LIVE
      // grid temperature (this.temp[j]) so dynamically-heated cells conduct too,
      // and fall back to the neighbour's authored temp for fresh hot sources.
      const nLiveT = Math.max(this.temp[j], np.temp || -Infinity);
      if (nLiveT > this.temp[i]) {
        this.temp[i] += (nLiveT - this.temp[i]) * 0.2;
      }
      // ignite if flammable & hot neighbor
      if (p.flammable && np.behavior === "fire" && Math.random() < 0.3 && this.has("fire")) {
        this.logEvent("reaction", `${this.nameOf(id)} caught Fire`, "ignite|"+id);
        this.set(x, y, "fire"); this.produced("fire"); return true;
      }
    }
    return false;
  }

  diffuseHeat() {
    // Two passes, every frame:
    //   1) CONDUCTION — heat flows from hot cells into their 4 neighbours, so a
    //      fire / lava / molten cell actually warms everything around it (this is
    //      what makes fire melt nearby chocolate, ignite wood, boil water, …).
    //   2) AMBIENT relaxation — every cell drifts toward the regulated room
    //      temperature. Self-heating sources (fire/lava/plasma/sun) re-assert
    //      their authored temperature each frame so they stay a constant furnace
    //      instead of cooling down to ambient.
    const W = this.W, H = this.H, temp = this.temp, grid = this.grid;
    const amb = this.ambient;
    const ef = this.enviroForce;

    // --- 0) hot sources keep emitting (re-assert their authored temp) ---
    // Anything whose element carries a `temp` ≥ 200 °C is treated as an active
    // heat source (fire, lava, wildfire, plasma, sun, molten metals, …) and
    // floors its own cell temperature so ambient relaxation can't snuff it out.
    // We ALSO directly blast heat into its 4 neighbours the same frame, so even a
    // lava drop that only touches a material for a frame or two still scorches
    // it. Passive averaging (pass 1) alone is too slow for fast-moving sources.
    for (let i = 0; i < grid.length; i++) {
      const id = grid[i];
      if (!id) continue;
      const p = this.phys(id);
      if (!p || p.temp == null || p.temp < 200) continue;
      const srcT = p.temp;
      if (temp[i] < srcT) {
        // ease up to the source temp quickly (not instant, so it still glows-in)
        temp[i] += (srcT - temp[i]) * 0.6;
      }
      // direct emission into the 4-neighbourhood — drive each cooler neighbour a
      // big fraction of the way toward the source temperature this very frame.
      const x = i % W, y = (i / W) | 0;
      const EMIT = 0.45; // strong, so contact heating is immediate & obvious
      if (x > 0     && temp[i - 1] < srcT) temp[i - 1] += (srcT - temp[i - 1]) * EMIT;
      if (x < W - 1 && temp[i + 1] < srcT) temp[i + 1] += (srcT - temp[i + 1]) * EMIT;
      if (y > 0     && temp[i - W] < srcT) temp[i - W] += (srcT - temp[i - W]) * EMIT;
      if (y < H - 1 && temp[i + W] < srcT) temp[i + W] += (srcT - temp[i + W]) * EMIT;
    }

    // --- 1) neighbour conduction (explicit, mass-conserving averaging) ---
    // Snapshot temps so the pass is order-independent. Empty (air) cells conduct
    // too but lightly; solids/liquids conduct more (metals are configured hotter
    // via their authored temp, this is bulk thermal mixing). The conduction rate
    // is intentionally generous so heat visibly radiates a few cells out.
    const src = this._tempScratch && this._tempScratch.length === temp.length
      ? this._tempScratch : (this._tempScratch = new Float32Array(temp.length));
    src.set(temp);
    const KSOLID = 0.16;  // conduction coefficient through materials
    const KAIR = 0.10;    // conduction through empty air (radiative-ish)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const here = src[i];
        let flux = 0, n = 0;
        // 4-neighbourhood
        if (x > 0)     { flux += src[i - 1] - here; n++; }
        if (x < W - 1) { flux += src[i + 1] - here; n++; }
        if (y > 0)     { flux += src[i - W] - here; n++; }
        if (y < H - 1) { flux += src[i + W] - here; n++; }
        if (!n) continue;
        const k = grid[i] === 0 ? KAIR : KSOLID;
        temp[i] = here + (flux / n) * k;
      }
    }

    // --- 2) ambient relaxation toward the regulated environment temperature ---
    if ((this.frame & 1) === 0) {
      const emptyRate = 0.05 + ef * 4;   // air equalizes quickly
      const solidRate = 0.01 + ef;       // materials lag behind
      for (let i = 0; i < temp.length; i++) {
        if (grid[i] === 0) {
          temp[i] += (amb - temp[i]) * Math.min(0.6, emptyRate);
        } else {
          temp[i] += (amb - temp[i]) * Math.min(0.4, solidRate);
        }
      }
    }
  }

  // ---- rendering ----
  // True when an element id is a celestial body (sun/moon/star). These are NOT
  // drawn as individual grid cells — they are collected into bodies and drawn as
  // smooth glowing discs so they read as actual celestial objects, not powder.
  _isCelestial(id) {
    if (!id) return false;
    const p = this.phys(id);
    return !!(p && p.behavior === "celestial");
  }

  // Group all celestial cells by element id into round "bodies" (centroid +
  // radius), so each blob of e.g. sun cells becomes one disc. A flood scan keeps
  // separate blobs of the same element distinct.
  _collectCelestialBodies() {
    const { W, H, grid } = this;
    const bodies = [];
    let seen = this._celSeen;
    if (!seen || seen.length !== grid.length) seen = this._celSeen = new Uint8Array(grid.length);
    else seen.fill(0);
    const stack = [];
    for (let i = 0; i < grid.length; i++) {
      const id = grid[i];
      if (seen[i] || !this._isCelestial(id)) continue;
      // BFS flood over same-id celestial cells
      let sx = 0, sy = 0, n = 0, count = 0;
      stack.length = 0; stack.push(i); seen[i] = 1;
      while (stack.length) {
        const ci = stack.pop();
        const cx = ci % W, cy = (ci / W) | 0;
        sx += cx; sy += cy; n++; count++;
        const nb = [ci - 1, ci + 1, ci - W, ci + W];
        const xs = [cx - 1, cx + 1, cx, cx];
        const ys = [cy, cy, cy - 1, cy + 1];
        for (let k = 0; k < 4; k++) {
          const nx = xs[k], ny = ys[k], ni = nb[k];
          if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
          if (seen[ni] || grid[ni] !== id) continue;
          seen[ni] = 1; stack.push(ni);
        }
      }
      if (!n) continue;
      const r = Math.max(1.6, Math.sqrt(count / Math.PI));
      bodies.push({ id, cx: sx / n + 0.5, cy: sy / n + 0.5, r });
    }
    return bodies;
  }

  // Draw celestial bodies as smooth glowing discs in CANVAS px. Sun/star get a
  // hot radial glow + corona; the moon a soft lit sphere with a faint halo.
  _renderCelestialBodies(bodies) {
    if (!bodies.length) return;
    const ctx = this.ctx, cell = this.cell;
    ctx.save();
    for (const b of bodies) {
      const px = b.cx * cell, py = b.cy * cell;
      const rad = b.r * cell;
      const p = this.phys(b.id);
      const hot = p && p.temp != null && p.temp >= 200;
      const core = this.colorById.get(b.id) || (hot ? "#ffcf3a" : "#cfcfcf");
      // outer glow / corona (additive so it blooms against the sky)
      ctx.globalCompositeOperation = "lighter";
      const glowR = rad * (hot ? 2.4 : 1.7);
      const g = ctx.createRadialGradient(px, py, rad * 0.3, px, py, glowR);
      if (hot) {
        g.addColorStop(0, "rgba(255,240,200,0.55)");
        g.addColorStop(0.4, "rgba(255,180,70,0.30)");
        g.addColorStop(1, "rgba(255,140,40,0)");
      } else {
        g.addColorStop(0, "rgba(200,210,230,0.30)");
        g.addColorStop(0.5, "rgba(150,165,200,0.14)");
        g.addColorStop(1, "rgba(120,140,180,0)");
      }
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(px, py, glowR, 0, Math.PI * 2); ctx.fill();
      // solid body disc (normal blend) with a soft shaded sphere
      ctx.globalCompositeOperation = "source-over";
      const bg = ctx.createRadialGradient(
        px - rad * 0.3, py - rad * 0.3, rad * 0.1, px, py, rad);
      if (hot) {
        bg.addColorStop(0, "#fff6da");
        bg.addColorStop(0.6, core);
        bg.addColorStop(1, "#e8902a");
      } else {
        bg.addColorStop(0, "#f2f4f8");
        bg.addColorStop(0.6, core);
        bg.addColorStop(1, "#8b93a3");
      }
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.arc(px, py, rad, 0, Math.PI * 2); ctx.fill();
      // moon: a couple of subtle craters for character
      if (!hot) {
        ctx.fillStyle = "rgba(120,128,145,0.35)";
        ctx.beginPath(); ctx.arc(px + rad * 0.25, py - rad * 0.2, rad * 0.22, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(px - rad * 0.3, py + rad * 0.28, rad * 0.16, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  // Map a temperature (°C) to a heatmap colour: deep blue (cold) → cyan → green
  // → yellow → orange → white-hot. Used by the Temperature view.
  _tempColor(t) {
    // normalise across the configured climate range for good spread
    const lo = Math.min(this.tempMin, -20), hi = Math.max(this.tempMax, 1200);
    let f = (t - lo) / (hi - lo);
    f = Math.max(0, Math.min(1, f));
    // piecewise gradient stops {f, r,g,b}
    const stops = [
      [0.00,  20,  30,  90],   // cold deep blue
      [0.18,  30, 110, 210],   // blue
      [0.34,  40, 200, 200],   // cyan
      [0.48,  60, 200,  90],   // green
      [0.62, 230, 210,  60],   // yellow
      [0.78, 240, 130,  40],   // orange
      [0.90, 240,  60,  40],   // red
      [1.00, 255, 245, 235],   // white hot
    ];
    for (let k = 1; k < stops.length; k++) {
      if (f <= stops[k][0]) {
        const a = stops[k - 1], b = stops[k];
        const u = (f - a[0]) / (b[0] - a[0] || 1);
        const r = a[1] + (b[1] - a[1]) * u;
        const g = a[2] + (b[2] - a[2]) * u;
        const bl = a[3] + (b[3] - a[3]) * u;
        return `rgb(${r|0},${g|0},${bl|0})`;
      }
    }
    return "rgb(255,245,235)";
  }

  // Map a pressure value to a heatmap colour. Pressure is stored as buildup over
  // ambient; we display absolute atm (1 + buildup). 1 atm = calm slate; rising
  // pressure heads through teal/green/yellow to a hot red at very high pressure.
  _pressureColor(pBuildup) {
    const atm = 1 + Math.max(0, pBuildup);
    // map 1..5 atm onto 0..1
    let f = (atm - 1) / 4;
    f = Math.max(0, Math.min(1, f));
    const stops = [
      [0.00,  46,  58,  74],   // 1 atm calm slate
      [0.22,  40, 140, 150],   // teal
      [0.45,  70, 180,  90],   // green
      [0.68, 220, 200,  60],   // yellow
      [0.85, 235, 130,  45],   // orange
      [1.00, 240,  50,  45],   // high-pressure red
    ];
    for (let k = 1; k < stops.length; k++) {
      if (f <= stops[k][0]) {
        const a = stops[k - 1], b = stops[k];
        const u = (f - a[0]) / (b[0] - a[0] || 1);
        const r = a[1] + (b[1] - a[1]) * u;
        const g = a[2] + (b[2] - a[2]) * u;
        const bl = a[3] + (b[3] - a[3]) * u;
        return `rgb(${r|0},${g|0},${bl|0})`;
      }
    }
    return "rgb(240,50,45)";
  }

  render() {
    if (this.viewMode === "temperature" || this.viewMode === "pressure") {
      this._renderField(this.viewMode);
      return;
    }
    const { ctx, W, H, cell, grid } = this;
    // No vacuum: paint a faint air wash behind everything so empty cells read as
    // a room full of air, never a black void.
    ctx.fillStyle = this.airBaseDark;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = this.idx(x, y);
        const id = grid[i];
        if (!id) continue;
        if (this._isCelestial(id)) continue; // drawn as discs below
        let color = this.colorById.get(id) || "#9aa3ad";
        // temperature glow tint for hot cells
        const t = this.temp[i];
        ctx.fillStyle = this.shade(color, this.tint[i], t);
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }
    this._renderCelestialBodies(this._collectCelestialBodies());
    this.renderFX();
    this.renderWeather();
    if (this.showAxes) this._drawAxes();
  }

  // Render the Temperature or Pressure field: EVERY cell (including the open
  // air — there is no vacuum) is filled with a heatmap colour. Celestial bodies
  // are still drawn as discs on top so the sun/moon stay recognisable, then a
  // small legend is painted in the corner.
  _renderField(mode) {
    const { ctx, W, H, cell, grid, temp, pressure } = this;
    ctx.fillStyle = mode === "temperature" ? "#0a0d12" : "#0a0d12";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = this.idx(x, y);
        ctx.fillStyle = mode === "temperature"
          ? this._tempColor(temp[i])
          : this._pressureColor(pressure[i]);
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }
    // celestial discs stay visible (drawn faintly under a translucent veil so
    // the field still reads through them)
    this._renderCelestialBodies(this._collectCelestialBodies());
    this._renderFieldLegend(mode);
    if (this.showAxes) this._drawAxes();
  }

  // Small gradient legend + label for the active field view, bottom-left.
  _renderFieldLegend(mode) {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    const barW = Math.min(150, Math.max(90, W * 0.18));
    const barH = 9;
    const pad = 10;
    // bottom-right corner (keeps clear of the bottom-left coords readout)
    const x0 = W - pad - barW, y0 = H - pad - barH - 14;
    ctx.save();
    // build gradient from the same colour function
    const grad = ctx.createLinearGradient(x0, 0, x0 + barW, 0);
    if (mode === "temperature") {
      for (let s = 0; s <= 10; s++) {
        const f = s / 10;
        const t = (Math.min(this.tempMin, -20)) + f * ((Math.max(this.tempMax, 1200)) - (Math.min(this.tempMin, -20)));
        grad.addColorStop(f, this._tempColor(t));
      }
    } else {
      for (let s = 0; s <= 10; s++) {
        const f = s / 10;
        grad.addColorStop(f, this._pressureColor(f * 4));
      }
    }
    // label
    ctx.font = "600 11px ui-sans-serif, system-ui, sans-serif";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    const label = mode === "temperature" ? "\uD83C\uDF21 Temperature" : "\u23F2 Pressure";
    ctx.fillText(label, x0, y0 - 4);
    // bar with subtle border
    ctx.fillStyle = grad;
    ctx.fillRect(x0, y0, barW, barH);
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, barW, barH);
    // end labels
    ctx.font = "10px ui-monospace, Menlo, Consolas, monospace";
    ctx.fillStyle = "rgba(255,255,255,0.78)";
    ctx.textBaseline = "top";
    if (mode === "temperature") {
      ctx.fillText(`${Math.round(Math.min(this.tempMin, -20))}\u00b0`, x0, y0 + barH + 2);
      const hot = `${Math.round(Math.max(this.tempMax, 1200))}\u00b0`;
      ctx.fillText(hot, x0 + barW - ctx.measureText(hot).width, y0 + barH + 2);
    } else {
      ctx.fillText("1 atm", x0, y0 + barH + 2);
      const hi = "5+ atm";
      ctx.fillText(hi, x0 + barW - ctx.measureText(hi).width, y0 + barH + 2);
    }
    ctx.restore();
  }

  // Faint x/y ruler ticks + coordinate labels along the top and left edges,
  // so the player can read grid positions like in Sandboxels.
  _drawAxes() {
    const { ctx, W, H, cell } = this;
    // spacing in cells: aim for a label roughly every ~60px, rounded to 10s
    const stepCells = Math.max(10, Math.round(60 / cell / 10) * 10);
    ctx.save();
    ctx.font = "9px ui-monospace, Menlo, Consolas, monospace";
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(255,255,255,0.30)";
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    // top ruler (x)
    for (let x = 0; x <= W; x += stepCells) {
      const px = x * cell + 0.5;
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, 5); ctx.stroke();
      if (x > 0) ctx.fillText(String(x), px + 2, 1);
    }
    // left ruler (y)
    ctx.textBaseline = "middle";
    for (let y = 0; y <= H; y += stepCells) {
      const py = y * cell + 0.5;
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(5, py); ctx.stroke();
      if (y > 0) ctx.fillText(String(y), 2, py + 6);
    }
    ctx.restore();
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
