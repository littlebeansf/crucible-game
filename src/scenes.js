/* =====================================================================
   CRUCIBLE — Sandbox Scene Templates
   ---------------------------------------------------------------------
   A "scene" is a pre-built sandbox scenario (Beach, Mountain, Volcano…)
   that paints a starting layout for the player to experiment on top of.

   A scene UNLOCKS only once the player has discovered EVERY material it
   requires (`requires: [ids]`). Locked scenes still show in the panel
   with their missing-material chips, so they double as goals/hints.

   Painters are written against NORMALISED coordinates (0..1 across the
   grid) so a scene fills the canvas correctly at any resolution. The
   engine grid is `sandbox.W × sandbox.H`; helpers below convert.

   Three flavours of scene:
     · plain        — just a material layout to play on (Beach, Volcano…).
     · life-populated — also spawns living creatures on load via `life(sb,cs)`
       so the world feels alive immediately (Coral Reef, Aviary, Pond…).
     · puzzle       — carries a one-line `goal` telling the player a small
       challenge to trigger an effect by ERASING, HEATING or BREAKING
       something (Sealed Pond, Frozen Lake, Oil Field…).

   Each scene also carries `hints` — contextual "add X to test …" tips
   shown after the scene loads to nudge the player toward fun reactions.
   ===================================================================== */

// ---- painter helpers (operate on a Sandbox instance) -------------------
function px(sb, fx) { return Math.round(fx * (sb.W - 1)); }
function py(sb, fy) { return Math.round(fy * (sb.H - 1)); }

// Fill a horizontal band between fy0..fy1 (fractions) with `id`.
function band(sb, id, fy0, fy1) {
  const y0 = py(sb, fy0), y1 = py(sb, fy1);
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
    for (let x = 0; x < sb.W; x++) sb.set(x, y, id);
}

// Fill a rectangle in fractional coords.
function rect(sb, id, fx0, fy0, fx1, fy1) {
  const x0 = px(sb, fx0), x1 = px(sb, fx1), y0 = py(sb, fy0), y1 = py(sb, fy1);
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) sb.set(x, y, id);
}

// Outline (hollow) rectangle of thickness `t` cells — used for glass tanks,
// enclosure walls, barns, etc. so the interior can hold water/animals.
function box(sb, id, fx0, fy0, fx1, fy1, t = 1) {
  const x0 = px(sb, fx0), x1 = px(sb, fx1), y0 = py(sb, fy0), y1 = py(sb, fy1);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++)
      if (x < x0 + t || x > x1 - t || y < y0 + t || y > y1 - t) sb.set(x, y, id);
}

// Draw a filled triangle "mountain/peak": base from fx0..fx1 at fyBase,
// rising to an apex at fxApex,fyApex. Optionally cap the top region.
function peak(sb, id, fx0, fx1, fyBase, fxApex, fyApex, capId, capFrac) {
  const x0 = px(sb, fx0), x1 = px(sb, fx1);
  const yb = py(sb, fyBase), ya = py(sb, fyApex);
  const xa = px(sb, fxApex);
  for (let x = x0; x <= x1; x++) {
    const dist = Math.abs(x - xa) / Math.max(1, Math.max(xa - x0, x1 - xa));
    const topY = Math.round(ya + (yb - ya) * dist);
    for (let y = topY; y <= yb; y++) {
      let useId = id;
      if (capId && capFrac != null) {
        const into = (y - topY) / Math.max(1, (yb - topY));
        if (into < capFrac) useId = capId;
      }
      sb.set(x, y, useId);
    }
  }
}

// A simple "tree": trunk + canopy blob.
function tree(sb, fx, fyBase, h, trunkId, leafId) {
  const cx = px(sb, fx);
  const baseY = py(sb, fyBase);
  const topY = baseY - Math.max(3, Math.round(h * sb.H));
  for (let y = topY + 2; y <= baseY; y++) { sb.set(cx, y, trunkId); }
  const r = Math.max(2, Math.round(sb.W * 0.03));
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++)
      if (dx * dx + dy * dy <= r * r) {
        const x = cx + dx, y = topY + dy;
        if (x >= 0 && x < sb.W && y >= 0 && y < sb.H) sb.set(x, y, leafId);
      }
}

// A small lone disc (sun, moon, flower clump) high in the sky region.
function disc(sb, id, fx, fy, fr) {
  const cx = px(sb, fx), cy = py(sb, fy), r = Math.max(2, Math.round(sb.W * fr));
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++)
      if (dx * dx + dy * dy <= r * r) {
        const x = cx + dx, y = cy + dy;
        if (x >= 0 && x < sb.W && y >= 0 && y < sb.H) sb.set(x, y, id);
      }
}

// ---- life helper -------------------------------------------------------
// Spawn `count` creatures of `kind` near fractional point (fx,fy), jittered a
// little so they don't stack. `cs` is the CreatureSystem passed by loadScene.
function spawn(cs, sb, kind, fx, fy, count = 1, spread = 0.05) {
  if (!cs) return;
  const W = sb.W * sb.cell, H = sb.H * sb.cell;
  for (let i = 0; i < count; i++) {
    const jx = (Math.random() * 2 - 1) * spread;
    const jy = (Math.random() * 2 - 1) * spread;
    cs.spawn(kind, (fx + jx) * W, (fy + jy) * H);
  }
}

/* =====================================================================
   SCENE DEFINITIONS
   Ordered roughly easy → hard by how deep the required materials sit.
   Every `requires` id is a real, placeable (phys) material in elements.json.

   Optional fields:
     life(sb, cs)  — spawn creatures after the cells are painted.
     goal          — one-line puzzle objective shown in the hint bar.
   ===================================================================== */
export const SCENES = [
  /* ---------------------------------------------------------------- *
   * 1–7 · ORIGINAL TERRAIN SCENES                                     *
   * ---------------------------------------------------------------- */
  {
    id: "beach",
    name: "Beach",
    emoji: "🏖️",
    blurb: "Sand, surf and a low sun. Watch the tide soak the shore.",
    requires: ["sand", "water", "sun"],
    paint(sb) {
      band(sb, "sand", 0.72, 1.0);
      rect(sb, "water", 0.0, 0.55, 0.42, 0.78);
      disc(sb, "sun", 0.82, 0.16, 0.07);
    },
    hints: [
      { id: "fire", text: "Drop Fire on wet sand to see steam rise" },
      { id: "salt", text: "Sprinkle Salt into the water for saltwater" },
    ],
  },
  {
    id: "rockpool",
    name: "Rock Pool",
    emoji: "🪨",
    blurb: "Stone basin holding a still pool. Heat it, freeze it, fill it.",
    requires: ["stone", "water", "sand"],
    paint(sb) {
      band(sb, "sand", 0.85, 1.0);
      rect(sb, "stone", 0.18, 0.55, 0.24, 0.9);
      rect(sb, "stone", 0.66, 0.55, 0.72, 0.9);
      band(sb, "stone", 0.86, 0.9);
      rect(sb, "water", 0.25, 0.6, 0.65, 0.85);
    },
    hints: [
      { id: "fire", text: "Add Fire under the pool to boil it into steam" },
      { id: "ice", text: "Drop Ice in to chill the water" },
    ],
  },
  {
    id: "mountain",
    name: "Mountain",
    emoji: "⛰️",
    blurb: "A stone peak crowned with snow. Will it hold the cold?",
    requires: ["stone", "snow", "ice"],
    paint(sb) {
      band(sb, "stone", 0.92, 1.0);
      peak(sb, "stone", 0.1, 0.62, 0.95, 0.36, 0.12, "snow", 0.35);
      peak(sb, "stone", 0.5, 0.95, 0.95, 0.74, 0.3, "snow", 0.3);
      rect(sb, "ice", 0.38, 0.18, 0.42, 0.45);
    },
    hints: [
      { id: "sun", text: "Place the Sun nearby to melt the snow cap" },
      { id: "lava", text: "Add Lava at the base to fight ice with fire" },
    ],
  },
  {
    id: "forest",
    name: "Forest",
    emoji: "🌲",
    blurb: "Soil, grass and trees. A green stage for growth and fire.",
    requires: ["soil", "grass", "tree", "water"],
    paint(sb) {
      band(sb, "soil", 0.8, 1.0);
      band(sb, "grass", 0.76, 0.81);
      tree(sb, 0.22, 0.78, 0.32, "tree", "grass");
      tree(sb, 0.5, 0.78, 0.4, "tree", "grass");
      tree(sb, 0.78, 0.78, 0.3, "tree", "grass");
      rect(sb, "water", 0.4, 0.85, 0.6, 0.95);
    },
    hints: [
      { id: "fire", text: "A single spark of Fire spreads through the trees" },
      { id: "rain", text: "Add Rain to soak the soil and grow more" },
    ],
  },
  {
    id: "volcano",
    name: "Volcano",
    emoji: "🌋",
    blurb: "A stone cone with a molten core. Cool the lava into rock.",
    requires: ["stone", "lava", "basalt", "water"],
    paint(sb) {
      band(sb, "stone", 0.94, 1.0);
      peak(sb, "stone", 0.18, 0.82, 0.96, 0.5, 0.18, null, null);
      rect(sb, "lava", 0.44, 0.2, 0.56, 0.4);
      rect(sb, "lava", 0.46, 0.4, 0.54, 0.7);
      band(sb, "basalt", 0.9, 0.94);
    },
    hints: [
      { id: "water", text: "Pour Water on the lava — it hardens into stone" },
      { id: "ice", text: "Drop Ice on the crater for a violent quench" },
    ],
  },
  {
    id: "tundra",
    name: "Glacier",
    emoji: "🏔️",
    blurb: "Ice, snow and frost over frozen water. The deep freeze.",
    requires: ["ice", "snow", "glacier", "water", "frost"],
    paint(sb) {
      band(sb, "water", 0.82, 1.0);
      band(sb, "ice", 0.74, 0.83);
      peak(sb, "ice", 0.05, 0.5, 0.76, 0.28, 0.2, "snow", 0.4);
      peak(sb, "glacier", 0.45, 0.95, 0.76, 0.7, 0.28, "snow", 0.35);
      rect(sb, "frost", 0.0, 0.7, 1.0, 0.73);
    },
    hints: [
      { id: "fire", text: "Bring Fire to thaw the glacier back into water" },
      { id: "sun", text: "Hang the Sun above to melt it all down" },
    ],
  },
  {
    id: "oasis",
    name: "Desert Oasis",
    emoji: "🏜️",
    blurb: "Endless sand, a cactus, and one precious pool of water.",
    requires: ["sand", "water", "cactus", "sun"],
    paint(sb) {
      band(sb, "sand", 0.6, 1.0);
      peak(sb, "sand", 0.0, 0.45, 0.62, 0.22, 0.5, null, null);
      rect(sb, "water", 0.55, 0.78, 0.78, 0.92);
      rect(sb, "cactus", 0.83, 0.62, 0.85, 0.8);
      rect(sb, "cactus", 0.85, 0.66, 0.89, 0.69);
      disc(sb, "sun", 0.16, 0.16, 0.08);
    },
    hints: [
      { id: "salt", text: "Add Salt to the pool to make saltwater" },
      { id: "rain", text: "Bring Rain to flood the desert" },
    ],
  },

  /* ---------------------------------------------------------------- *
   * 8–13 · LIFE-POPULATED SCENES (spawn creatures on load)           *
   * ---------------------------------------------------------------- */
  {
    id: "reef",
    name: "Coral Reef",
    emoji: "🐠",
    blurb: "A deep blue tank already swimming with fish — and one hungry shark.",
    requires: ["water", "sand", "stone"],
    paint(sb) {
      band(sb, "water", 0.12, 1.0);          // deep water column
      band(sb, "sand", 0.9, 1.0);            // sandy bed
      rect(sb, "stone", 0.1, 0.78, 0.18, 0.9);   // coral rocks
      rect(sb, "stone", 0.74, 0.74, 0.84, 0.9);
    },
    life(sb, cs) {
      spawn(cs, sb, "fish", 0.3, 0.5, 6, 0.12);
      spawn(cs, sb, "fish", 0.65, 0.6, 4, 0.1);
      spawn(cs, sb, "shark", 0.5, 0.4, 1);
    },
    hints: [
      { id: "fire", text: "Heat the tank with Fire and watch the fish panic" },
      { id: "ice", text: "Drop Ice to chill the reef" },
    ],
  },
  {
    id: "aviary",
    name: "Aviary",
    emoji: "🐦",
    blurb: "Open sky over a leafy floor, alive with birds and butterflies.",
    requires: ["soil", "grass", "tree"],
    paint(sb) {
      band(sb, "soil", 0.88, 1.0);
      band(sb, "grass", 0.85, 0.89);
      tree(sb, 0.18, 0.86, 0.34, "tree", "grass");
      tree(sb, 0.82, 0.86, 0.3, "tree", "grass");
    },
    life(sb, cs) {
      spawn(cs, sb, "bird", 0.4, 0.3, 5, 0.18);
      spawn(cs, sb, "butterfly", 0.6, 0.4, 6, 0.2);
    },
    hints: [
      { id: "water", text: "Pour Water below — flyers drown if they fall in" },
      { id: "tree", text: "Plant more Trees for the birds to rest on" },
    ],
  },
  {
    id: "pond",
    name: "Pond Life",
    emoji: "🐸",
    blurb: "A grassy pond hopping with frogs, paddling ducks and a few fish.",
    requires: ["water", "soil", "grass"],
    paint(sb) {
      band(sb, "soil", 0.86, 1.0);
      band(sb, "grass", 0.83, 0.87);
      rect(sb, "water", 0.18, 0.66, 0.82, 0.9);   // the pond
    },
    life(sb, cs) {
      spawn(cs, sb, "frog", 0.3, 0.78, 3, 0.12);
      spawn(cs, sb, "duck", 0.5, 0.72, 3, 0.12);
      spawn(cs, sb, "fish", 0.5, 0.82, 3, 0.1);
    },
    hints: [
      { id: "fire", text: "Frogs and ducks flee from Fire" },
      { id: "ice", text: "Freeze the pond and see who copes" },
    ],
  },
  {
    id: "meadow",
    name: "Meadow",
    emoji: "🌼",
    blurb: "A sunlit flower field humming with bees and butterflies.",
    requires: ["soil", "grass", "flower", "sun"],
    paint(sb) {
      band(sb, "soil", 0.86, 1.0);
      band(sb, "grass", 0.8, 0.87);
      // scattered flowers along the grass
      for (let i = 0; i < 9; i++) rect(sb, "flower", 0.06 + i * 0.1, 0.77, 0.08 + i * 0.1, 0.8);
      disc(sb, "sun", 0.85, 0.15, 0.06);
    },
    life(sb, cs) {
      spawn(cs, sb, "bee", 0.4, 0.45, 5, 0.22);
      spawn(cs, sb, "butterfly", 0.6, 0.4, 5, 0.22);
    },
    hints: [
      { id: "water", text: "Add Water to grow the meadow greener" },
      { id: "fire", text: "Fire scatters the swarm in a panic" },
    ],
  },
  {
    id: "village",
    name: "Village",
    emoji: "🏘️",
    blurb: "Brick houses on a grassy street, with people and a dog about.",
    requires: ["brick", "wood", "grass", "soil"],
    paint(sb) {
      band(sb, "soil", 0.86, 1.0);
      band(sb, "grass", 0.83, 0.87);
      // two little brick houses with wood roofs
      box(sb, "brick", 0.1, 0.66, 0.3, 0.86, 2);
      peak(sb, "wood", 0.08, 0.32, 0.67, 0.2, 0.56, null, null);
      box(sb, "brick", 0.66, 0.68, 0.86, 0.86, 2);
      peak(sb, "wood", 0.64, 0.88, 0.69, 0.76, 0.58, null, null);
    },
    life(sb, cs) {
      spawn(cs, sb, "human", 0.45, 0.78, 3, 0.12);
      spawn(cs, sb, "dog", 0.55, 0.8, 1);
    },
    hints: [
      { id: "fire", text: "Set a wooden roof alight and watch them flee" },
      { id: "water", text: "Flood the street — humans can't breathe underwater" },
    ],
  },
  {
    id: "savanna",
    name: "Safari Plains",
    emoji: "🦓",
    blurb: "Dry grassland under a hot sun, roamed by grazers and a prowling lion.",
    requires: ["sand", "grass", "soil", "sun"],
    paint(sb) {
      band(sb, "soil", 0.88, 1.0);
      band(sb, "sand", 0.84, 0.89);
      band(sb, "grass", 0.82, 0.85);
      tree(sb, 0.8, 0.84, 0.26, "wood", "grass");
      disc(sb, "sun", 0.16, 0.14, 0.07);
    },
    life(sb, cs) {
      spawn(cs, sb, "horse", 0.3, 0.78, 2, 0.08);
      spawn(cs, sb, "cow", 0.5, 0.78, 2, 0.08);
      spawn(cs, sb, "sheep", 0.62, 0.79, 2, 0.06);
      spawn(cs, sb, "lion", 0.85, 0.78, 1);
    },
    hints: [
      { id: "water", text: "Carve a watering hole with Water" },
      { id: "fire", text: "A grass fire sends the herd running" },
    ],
  },

  /* ---------------------------------------------------------------- *
   * 14–18 · PUZZLE SCENES (erase / heat / break to trigger effects)  *
   * ---------------------------------------------------------------- */
  {
    id: "city",
    name: "Cement City",
    emoji: "🏙️",
    blurb: "A grey skyline of concrete towers on a paved street.",
    requires: ["concrete", "cement", "glass", "metal"],
    goal: "Erase a tower's base, or pour Water/Lava between the blocks — watch the concrete city react.",
    paint(sb) {
      band(sb, "concrete", 0.92, 1.0);          // street
      // a row of towers of varying heights
      const towers = [
        [0.06, 0.4], [0.2, 0.28], [0.34, 0.52], [0.5, 0.22],
        [0.64, 0.46], [0.78, 0.34], [0.9, 0.5],
      ];
      for (const [fx, top] of towers) {
        rect(sb, "concrete", fx, top, fx + 0.08, 0.92);
        // glass windows
        for (let wy = top + 0.04; wy < 0.9; wy += 0.08)
          rect(sb, "glass", fx + 0.02, wy, fx + 0.06, wy + 0.02);
      }
      rect(sb, "metal", 0.0, 0.9, 1.0, 0.92);   // steel kerb
    },
    hints: [
      { id: "lava", text: "Lava melts straight through the concrete" },
      { id: "water", text: "Flood the streets between the towers" },
    ],
  },
  {
    id: "sealedpond",
    name: "Sealed Pond",
    emoji: "🪨",
    blurb: "A pool of water trapped under a slab of stone. Free it.",
    requires: ["stone", "water", "sand"],
    goal: "Use the 🧽 Eraser to break the stone cap — the trapped water bursts out and floods the basin.",
    paint(sb) {
      band(sb, "sand", 0.9, 1.0);
      // stone basin walls
      rect(sb, "stone", 0.16, 0.5, 0.22, 0.9);
      rect(sb, "stone", 0.78, 0.5, 0.84, 0.9);
      band(sb, "stone", 0.88, 0.9);
      rect(sb, "water", 0.23, 0.58, 0.77, 0.86);  // trapped water
      rect(sb, "stone", 0.16, 0.5, 0.84, 0.56);   // the STONE CAP to erase
    },
    hints: [
      { id: "fire", text: "Or heat the cap from above to crack it" },
      { id: "ice", text: "Freeze the water first for a different result" },
    ],
  },
  {
    id: "frozenlake",
    name: "Frozen Lake",
    emoji: "🧊",
    blurb: "Fish lie frozen under a sheet of ice. Can you revive the lake?",
    requires: ["ice", "water", "snow", "stone"],
    goal: "Heat the ice with Fire or the 🌡️ Climate regulator — it melts to water and the fish swim free.",
    paint(sb) {
      band(sb, "stone", 0.93, 1.0);
      band(sb, "water", 0.6, 0.93);              // liquid water beneath
      band(sb, "ice", 0.5, 0.6);                 // ice lid on top
      band(sb, "snow", 0.46, 0.5);               // snow dusting
    },
    life(sb, cs) {
      // fish already in the liquid water below the ice
      spawn(cs, sb, "fish", 0.4, 0.78, 3, 0.12);
      spawn(cs, sb, "fish", 0.65, 0.82, 2, 0.1);
    },
    hints: [
      { id: "fire", text: "Fire thaws the ice into water" },
      { id: "lava", text: "Lava melts it fast — maybe too fast" },
    ],
  },
  {
    id: "oilfield",
    name: "Oil Field",
    emoji: "🛢️",
    blurb: "Black oil pools beneath the sand, ringed by a firebreak.",
    requires: ["oil", "sand", "stone"],
    goal: "Ignite the oil with Fire and watch it blaze — then erase the stone firebreak to let it spread.",
    paint(sb) {
      band(sb, "sand", 0.86, 1.0);
      rect(sb, "oil", 0.2, 0.7, 0.8, 0.86);       // oil reservoir
      rect(sb, "stone", 0.16, 0.66, 0.2, 0.86);   // firebreak walls
      rect(sb, "stone", 0.8, 0.66, 0.84, 0.86);
      rect(sb, "stone", 0.5, 0.5, 0.52, 0.7);     // a derrick post
    },
    hints: [
      { id: "fire", text: "A single Fire turns the field into an inferno" },
      { id: "water", text: "Water sits on top of oil — it won't smother it" },
    ],
  },
  {
    id: "aquarium",
    name: "Aquarium",
    emoji: "🐡",
    blurb: "A glass tank full of water and fish. The glass is the only thing saving them.",
    requires: ["glass", "water", "sand"],
    goal: "Break the glass wall with the 🧽 Eraser — the water drains out and the fish suffocate. Re-seal it to save them.",
    paint(sb) {
      band(sb, "sand", 0.92, 1.0);
      box(sb, "glass", 0.18, 0.34, 0.82, 0.9, 2);  // glass tank
      rect(sb, "water", 0.22, 0.38, 0.78, 0.86);   // water inside
      rect(sb, "sand", 0.22, 0.84, 0.78, 0.86);    // gravel bed
    },
    life(sb, cs) {
      spawn(cs, sb, "fish", 0.4, 0.55, 4, 0.1);
      spawn(cs, sb, "fish", 0.62, 0.6, 3, 0.1);
    },
    hints: [
      { id: "fire", text: "Heat the tank to stress the fish" },
      { id: "water", text: "Top the tank back up if it leaks" },
    ],
  },

  /* ---------------------------------------------------------------- *
   * 19–21 · ZOO-STYLE SCENES (humans + animals together)            *
   * ---------------------------------------------------------------- */
  {
    id: "zoo",
    name: "Zoo",
    emoji: "🦁",
    blurb: "Fenced enclosures of lions, elephants and monkeys — with visitors watching.",
    requires: ["concrete", "metal", "grass", "soil", "water"],
    goal: "Visitors stroll the concrete path while animals pace their pens. Try erasing a fence and see what happens.",
    paint(sb) {
      band(sb, "soil", 0.9, 1.0);
      band(sb, "concrete", 0.86, 0.9);           // visitor walkway
      // three enclosures with metal fences + grass floors
      box(sb, "metal", 0.04, 0.5, 0.32, 0.86, 1);
      rect(sb, "grass", 0.06, 0.82, 0.3, 0.85);
      box(sb, "metal", 0.36, 0.5, 0.64, 0.86, 1);
      rect(sb, "grass", 0.38, 0.82, 0.62, 0.85);
      rect(sb, "water", 0.46, 0.7, 0.56, 0.82);  // elephant pool
      box(sb, "metal", 0.68, 0.5, 0.96, 0.86, 1);
      tree(sb, 0.82, 0.84, 0.22, "wood", "grass");
    },
    life(sb, cs) {
      spawn(cs, sb, "lion", 0.18, 0.8, 2, 0.05);
      spawn(cs, sb, "elephant", 0.5, 0.78, 1);
      spawn(cs, sb, "monkey", 0.82, 0.78, 2, 0.05);
      spawn(cs, sb, "human", 0.5, 0.88, 4, 0.2);   // visitors on the path
    },
    hints: [
      { id: "fire", text: "Fire near a pen scatters everyone" },
      { id: "water", text: "Fill the elephant pool with more Water" },
    ],
  },
  {
    id: "farm",
    name: "Farm",
    emoji: "🚜",
    blurb: "A barn, fenced pens and a pond — worked by a farmer, dog and livestock.",
    requires: ["wood", "grass", "soil", "water", "brick"],
    goal: "A farmer and dog tend cows, sheep and a horse. Light the hay or flood a pen to test the herd.",
    paint(sb) {
      band(sb, "soil", 0.88, 1.0);
      band(sb, "grass", 0.84, 0.88);
      // barn
      box(sb, "brick", 0.06, 0.6, 0.32, 0.86, 2);
      peak(sb, "wood", 0.04, 0.34, 0.61, 0.19, 0.5, null, null);
      // fenced pen (wood posts)
      for (let fx = 0.42; fx <= 0.9; fx += 0.06) rect(sb, "wood", fx, 0.74, fx + 0.005, 0.86);
      rect(sb, "wood", 0.42, 0.74, 0.9, 0.745);
      rect(sb, "water", 0.6, 0.82, 0.74, 0.88);   // trough / pond
    },
    life(sb, cs) {
      spawn(cs, sb, "human", 0.2, 0.8, 1);          // farmer
      spawn(cs, sb, "dog", 0.28, 0.82, 1);
      spawn(cs, sb, "cow", 0.55, 0.79, 2, 0.05);
      spawn(cs, sb, "sheep", 0.72, 0.8, 2, 0.05);
      spawn(cs, sb, "horse", 0.82, 0.79, 1);
    },
    hints: [
      { id: "fire", text: "Fire in the barn drives the animals out" },
      { id: "water", text: "Refill the trough with fresh Water" },
    ],
  },
  {
    id: "resort",
    name: "Beach Resort",
    emoji: "🏖️",
    blurb: "Sunbathers on the sand, swimmers in the sea, gulls overhead and fish below.",
    requires: ["sand", "water", "sun", "stone"],
    goal: "Humans sunbathe and swim, birds wheel above and fish dart in the shallows. Mind the tide and the heat.",
    paint(sb) {
      band(sb, "sand", 0.7, 1.0);
      rect(sb, "water", 0.0, 0.58, 0.5, 0.78);     // the sea
      rect(sb, "stone", 0.5, 0.74, 0.54, 0.82);    // little jetty rock
      disc(sb, "sun", 0.85, 0.15, 0.07);
    },
    life(sb, cs) {
      spawn(cs, sb, "human", 0.7, 0.82, 3, 0.12);  // sunbathers on sand
      spawn(cs, sb, "human", 0.25, 0.7, 1);        // one swimmer near the surface
      spawn(cs, sb, "bird", 0.5, 0.25, 3, 0.2);    // gulls
      spawn(cs, sb, "fish", 0.2, 0.72, 4, 0.1);    // fish in the sea
    },
    hints: [
      { id: "fire", text: "Crank the heat — sunbathers and fish feel it differently" },
      { id: "ice", text: "Chill the sea and watch the swimmers struggle" },
    ],
  },
];

// ---- gating ------------------------------------------------------------
// A scene is unlocked when state.isDiscovered() is true for ALL requires.
export function sceneUnlocked(scene, state) {
  return scene.requires.every((id) => state.isDiscovered(id));
}

// Which required materials are still missing (for the locked-card chips).
export function missingFor(scene, state) {
  return scene.requires.filter((id) => !state.isDiscovered(id));
}
