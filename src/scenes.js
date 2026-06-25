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

// Draw a filled triangle "mountain/peak": base from fx0..fx1 at fyBase,
// rising to an apex at fxApex,fyApex. Optionally cap the top region.
function peak(sb, id, fx0, fx1, fyBase, fxApex, fyApex, capId, capFrac) {
  const x0 = px(sb, fx0), x1 = px(sb, fx1);
  const yb = py(sb, fyBase), ya = py(sb, fyApex);
  const xa = px(sb, fxApex);
  for (let x = x0; x <= x1; x++) {
    // interpolate apex height across the base width (tent shape)
    const t = (x - x0) / Math.max(1, (x1 - x0));
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

// A small lone disc (sun, moon) high in the sky region.
function disc(sb, id, fx, fy, fr) {
  const cx = px(sb, fx), cy = py(sb, fy), r = Math.max(2, Math.round(sb.W * fr));
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++)
      if (dx * dx + dy * dy <= r * r) {
        const x = cx + dx, y = cy + dy;
        if (x >= 0 && x < sb.W && y >= 0 && y < sb.H) sb.set(x, y, id);
      }
}

/* =====================================================================
   SCENE DEFINITIONS
   Ordered roughly easy → hard by how deep the required materials sit.
   Every `requires` id is a real, placeable (phys) material in elements.json.
   ===================================================================== */
export const SCENES = [
  {
    id: "beach",
    name: "Beach",
    emoji: "🏖️",
    blurb: "Sand, surf and a low sun. Watch the tide soak the shore.",
    requires: ["sand", "water", "sun"],
    paint(sb) {
      band(sb, "sand", 0.72, 1.0);          // sandy shore
      rect(sb, "water", 0.0, 0.55, 0.42, 0.78); // sea on the left
      disc(sb, "sun", 0.82, 0.16, 0.07);    // sun up-right
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
      // stone bowl
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
      rect(sb, "ice", 0.38, 0.18, 0.42, 0.45); // glacier streak
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
      rect(sb, "water", 0.4, 0.85, 0.6, 0.95); // forest pond
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
      // crater of lava at the top
      rect(sb, "lava", 0.44, 0.2, 0.56, 0.4);
      rect(sb, "lava", 0.46, 0.4, 0.54, 0.7); // lava channel down
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
      // dune curve
      peak(sb, "sand", 0.0, 0.45, 0.62, 0.22, 0.5, null, null);
      rect(sb, "water", 0.55, 0.78, 0.78, 0.92); // oasis pool
      rect(sb, "cactus", 0.83, 0.62, 0.85, 0.8); // cactus stem
      rect(sb, "cactus", 0.85, 0.66, 0.89, 0.69); // cactus arm
      disc(sb, "sun", 0.16, 0.16, 0.08);
    },
    hints: [
      { id: "salt", text: "Add Salt to the pool to make saltwater" },
      { id: "rain", text: "Bring Rain to flood the desert" },
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
