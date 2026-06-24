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
  liquid:     ["#0b3d5c", "#4cc3ff"],
  gas:        ["#2b3a4a", "#bfe3ff"],
  energy:     ["#3a1500", "#ff9d2e"],
  earth:      ["#3a2c18", "#c9a06a"],
  weather:    ["#1d3344", "#8fd4ff"],
  chemical:   ["#2a1840", "#c08bff"],
  metal:      ["#2a2d33", "#c8d0dc"],
  geology:    ["#332a1c", "#caa46a"],
  materials:  ["#262a33", "#9fb0d0"],
  life:       ["#0f3520", "#5fd68a"],
  technology: ["#1c2730", "#7fd0e0"],
  physics:    ["#102a2a", "#5fe0c8"],
  space:      ["#0a0a2a", "#9db4ff"],
  meme:       ["#3a0f2a", "#ff77c8"],
  // legacy fallbacks (kept so any old saved/edge ids still tint)
  powder:     ["#3a2c18", "#e0b873"],
  solid:      ["#2a2d33", "#aab4c0"],
  matter:     ["#222831", "#a9b4c2"],
};

function pal(category) {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS.materials;
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
  liquid: "💧", gas: "💨", energy: "⚡", earth: "🟤", weather: "🌦️",
  chemical: "⚗️", metal: "🔩", geology: "🪨", materials: "📦", life: "🌱",
  technology: "⚙️", physics: "🔬", space: "🌌", meme: "😎",
  powder: "🟤", solid: "⬜", matter: "🔶",
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
