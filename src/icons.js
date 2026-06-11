/* ============================================================================
   CRUCIBLE — Emoji icon system
   ----------------------------------------------------------------------------
   Every element carries an `emoji` field in elements.json. We render that
   directly as crisp, native, universally-recognizable glyphs. A deterministic
   per-element hue (from the id hash) tints the rounded tile behind the emoji
   so the thousands of items still read as distinct, colorful, and consistent.
   The sandbox canvas keeps using `pixelColor()` for per-pixel fills.
============================================================================ */

// ---- deterministic hash (FNV-1a) ----
export function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// ---- category palettes (background tint + accent) ----
export const CATEGORY_COLORS = {
  liquid:   ["#0b3d5c", "#4cc3ff"],
  gas:      ["#2b3a4a", "#bfe3ff"],
  energy:   ["#3a1500", "#ff9d2e"],
  powder:   ["#3a2c18", "#e0b873"],
  solid:    ["#2a2d33", "#aab4c0"],
  life:     ["#0f3520", "#5fd68a"],
  food:     ["#3a2410", "#f2b35c"],
  concept:  ["#2a1840", "#c08bff"],
  cosmic:   ["#0a0a2a", "#9db4ff"],
  structure:["#332a1c", "#d8b06a"],
  machine:  ["#1c2730", "#7fd0e0"],
  tool:     ["#2c2417", "#d6c08a"],
  object:   ["#262a33", "#9fb0d0"],
  matter:   ["#222831", "#a9b4c2"],
};

function pal(category) {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS.matter;
}

// Per-element accent hue derived from category accent + a small id-based shift,
// so siblings in the same category still differ slightly. Returned as a CSS color.
const _hueCache = new Map();
export function accentColor(el) {
  if (_hueCache.has(el.id)) return _hueCache.get(el.id);
  const base = pal(el.category)[1];
  _hueCache.set(el.id, base);
  return base;
}

/* ---------------------------------------------------------------------------
   PUBLIC: get the emoji glyph for an element (with a sane fallback)
--------------------------------------------------------------------------- */
const FALLBACK_BY_CATEGORY = {
  liquid: "💧", gas: "💨", energy: "⚡", powder: "🟤", solid: "⬜",
  life: "🌱", food: "🍞", concept: "✨", cosmic: "🌌", structure: "🏛️",
  machine: "⚙️", tool: "🔧", object: "📦", matter: "🔶",
};

export function emojiFor(el) {
  if (el && el.emoji && el.emoji.trim()) return el.emoji;
  return (el && FALLBACK_BY_CATEGORY[el.category]) || "🔮";
}

/* ---------------------------------------------------------------------------
   PUBLIC: HTML for an element icon — a tinted rounded tile + emoji glyph.
   `size` is the tile edge in px; the emoji scales to ~62% of it.
--------------------------------------------------------------------------- */
export function iconHTML(el, size = 40) {
  const glyph = emojiFor(el);
  const fontSize = Math.round(size * 0.62);
  return `<span class="emoji-ic" style="font-size:${fontSize}px;line-height:1;">${glyph}</span>`;
}

// Back-compat alias: older call sites used svgString(el, size).
export const svgString = iconHTML;

// flat fill color for sandbox pixels
export function pixelColor(el) {
  if (el.phys && el.phys.color) return el.phys.color;
  return pal(el.category)[1];
}
