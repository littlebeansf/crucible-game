/* ============================================================================
   CRUCIBLE — Procedural SVG Icon System
   ----------------------------------------------------------------------------
   - Hand-authored SVG for the ~100 core/iconic elements (crisp, recognizable).
   - Deterministic PROCEDURAL generator for the thousands of auto elements:
     a seeded "sigil" built from category palette + tag glyphs + id hash, so
     every element gets a unique, attractive, consistent icon — all pure SVG.
   No external images. Everything is inline <svg>.
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
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 0xffffffff;
  };
}

// ---- category palettes (background + accent) ----
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

/* ---------------------------------------------------------------------------
   HAND-AUTHORED CORE ICONS
   Each returns inner SVG markup drawn in a 0 0 100 100 viewBox.
--------------------------------------------------------------------------- */
const CORE = {
  water: `<defs><linearGradient id="w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fdbff"/><stop offset="1" stop-color="#1e6f9f"/></linearGradient></defs>
    <path d="M50 14 C30 42 24 56 24 68 a26 26 0 0 0 52 0 C76 56 70 42 50 14 Z" fill="url(#w)"/>
    <ellipse cx="40" cy="56" rx="7" ry="10" fill="#ffffff" opacity=".35"/>`,
  fire: `<defs><radialGradient id="f" cx="50%" cy="65%" r="65%"><stop offset="0" stop-color="#fff2a8"/><stop offset=".5" stop-color="#ff8a1e"/><stop offset="1" stop-color="#d72200"/></radialGradient></defs>
    <path d="M50 8 C58 30 78 34 70 58 C66 72 58 84 50 90 C42 84 34 72 30 58 C24 40 40 40 40 26 C46 34 48 22 50 8 Z" fill="url(#f)">
    <animateTransform attributeName="transform" type="scale" values="1 1;1.04 0.97;1 1" dur="0.9s" repeatCount="indefinite" additive="sum"/></path>
    <path d="M50 44 C54 56 60 60 56 72 C53 80 50 84 50 86 C46 80 44 74 44 66 C44 56 48 54 50 44 Z" fill="#ffe08a"/>`,
  earth: `<defs><linearGradient id="e" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9a734a"/><stop offset="1" stop-color="#5b3d23"/></linearGradient></defs>
    <path d="M22 60 q8 -16 28 -16 t28 16 q4 18 -28 22 q-32 -4 -28 -22 Z" fill="url(#e)"/>
    <circle cx="40" cy="58" r="4" fill="#3d2a18"/><circle cx="60" cy="62" r="3" fill="#3d2a18"/><circle cx="52" cy="52" r="2.5" fill="#7a5a38"/>`,
  air: `<g fill="none" stroke="#cfe8ff" stroke-width="5" stroke-linecap="round" opacity=".9">
    <path d="M20 38 H62 a8 8 0 1 0 -8 -8"><animate attributeName="opacity" values=".5;1;.5" dur="2s" repeatCount="indefinite"/></path>
    <path d="M18 54 H70 a9 9 0 1 1 -9 9"><animate attributeName="opacity" values="1;.5;1" dur="2.4s" repeatCount="indefinite"/></path>
    <path d="M24 70 H52 a6 6 0 1 0 -6 6"/></g>`,
  steam: `<g fill="none" stroke="#e2e8f0" stroke-width="6" stroke-linecap="round" opacity=".85">
    <path d="M34 80 q-8 -14 0 -26 q8 -12 0 -26"><animate attributeName="opacity" values=".4;.9;.4" dur="2s" repeatCount="indefinite"/></path>
    <path d="M54 84 q-8 -14 0 -26 q8 -12 0 -26"><animate attributeName="opacity" values=".9;.4;.9" dur="2.3s" repeatCount="indefinite"/></path>
    <path d="M70 78 q-6 -10 0 -20 q6 -10 0 -18"/></g>`,
  smoke: `<g fill="#6b6b6b" opacity=".8"><circle cx="42" cy="64" r="14"><animate attributeName="cy" values="64;40;64" dur="3s" repeatCount="indefinite"/><animate attributeName="opacity" values=".8;.2;.8" dur="3s" repeatCount="indefinite"/></circle>
    <circle cx="58" cy="52" r="11"><animate attributeName="cy" values="52;28;52" dur="3.4s" repeatCount="indefinite"/><animate attributeName="opacity" values=".7;.1;.7" dur="3.4s" repeatCount="indefinite"/></circle>
    <circle cx="50" cy="74" r="10"/></g>`,
  lava: `<defs><radialGradient id="lv" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="#ffe04a"/><stop offset=".5" stop-color="#ff6a1f"/><stop offset="1" stop-color="#8a1a00"/></radialGradient></defs>
    <path d="M20 64 q8 -18 30 -18 t30 18 q2 16 -30 20 q-32 -4 -30 -20 Z" fill="url(#lv)"/>
    <circle cx="42" cy="60" r="3" fill="#fff2a8"><animate attributeName="r" values="3;5;3" dur="1.5s" repeatCount="indefinite"/></circle>
    <circle cx="60" cy="64" r="2.5" fill="#fff2a8"><animate attributeName="r" values="2.5;4;2.5" dur="1.8s" repeatCount="indefinite"/></circle>`,
  steam2: ``,
  energy: `<path d="M54 8 L30 52 H46 L40 92 L72 40 H54 L62 8 Z" fill="#ffd23f" stroke="#ff9d2e" stroke-width="2">
    <animate attributeName="opacity" values="1;.6;1" dur=".7s" repeatCount="indefinite"/></path>`,
  electricity: `<path d="M54 8 L30 52 H46 L40 92 L72 40 H54 L62 8 Z" fill="#7fdfff" stroke="#2bb6ff" stroke-width="2">
    <animate attributeName="opacity" values="1;.5;1" dur=".5s" repeatCount="indefinite"/></path>`,
  lightning: `<path d="M58 6 L28 50 H48 L40 94 L76 38 H54 L66 6 Z" fill="#fff27a" stroke="#ffd23f" stroke-width="2"/>`,
  stone: `<path d="M24 62 q4 -20 26 -20 t26 20 q2 16 -26 20 q-28 -4 -26 -20 Z" fill="#8a8a8a"/><path d="M40 48 l10 6 l-6 10" fill="none" stroke="#6a6a6a" stroke-width="2"/>`,
  metal: `<defs><linearGradient id="mt" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e7edf3"/><stop offset=".5" stop-color="#9aa3ad"/><stop offset="1" stop-color="#5e6670"/></linearGradient></defs>
    <rect x="26" y="34" width="48" height="32" rx="5" fill="url(#mt)"/><rect x="32" y="40" width="36" height="4" rx="2" fill="#ffffff" opacity=".5"/>`,
  steel: `<defs><linearGradient id="st" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#eef4fb"/><stop offset="1" stop-color="#7c8794"/></linearGradient></defs>
    <rect x="24" y="36" width="52" height="28" rx="4" fill="url(#st)"/><line x1="24" y1="50" x2="76" y2="50" stroke="#ffffff" stroke-width="2" opacity=".6"/>`,
  glass: `<rect x="34" y="24" width="32" height="56" rx="6" fill="#bfeaff" opacity=".5" stroke="#9fdcff" stroke-width="2"/><rect x="40" y="30" width="6" height="40" rx="3" fill="#ffffff" opacity=".6"/>`,
  sand: `<g fill="#e3c982"><path d="M22 66 q6 -14 28 -14 t28 14 q2 12 -28 16 q-30 -4 -28 -16Z"/></g><circle cx="38" cy="62" r="2" fill="#c9a85a"/><circle cx="56" cy="64" r="2" fill="#c9a85a"/><circle cx="48" cy="58" r="1.6" fill="#fff" opacity=".6"/>`,
  ice: `<defs><linearGradient id="ic" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e8fbff"/><stop offset="1" stop-color="#7fc6e8"/></linearGradient></defs>
    <rect x="30" y="30" width="40" height="40" rx="6" transform="rotate(8 50 50)" fill="url(#ic)" stroke="#bfeaff" stroke-width="2"/>`,
  snow: `<g stroke="#dff2ff" stroke-width="4" stroke-linecap="round"><line x1="50" y1="20" x2="50" y2="80"/><line x1="24" y1="35" x2="76" y2="65"/><line x1="76" y1="35" x2="24" y2="65"/></g>`,
  cloud: `<g fill="#f1f5f9"><circle cx="38" cy="56" r="16"/><circle cx="58" cy="52" r="18"/><circle cx="68" cy="60" r="12"/><rect x="34" y="56" width="40" height="14" rx="7"/></g>`,
  plant: `<path d="M50 86 V44" stroke="#3fa34d" stroke-width="5" stroke-linecap="round"/><path d="M50 56 q-20 -6 -22 -26 q20 2 22 26Z" fill="#5fd68a"/><path d="M50 48 q20 -8 24 -28 q-22 4 -24 28Z" fill="#3fa34d"/>`,
  tree: `<rect x="45" y="58" width="10" height="30" rx="3" fill="#8a5a2b"/><circle cx="50" cy="42" r="24" fill="#4a7a32"/><circle cx="36" cy="50" r="14" fill="#5b9140"/><circle cx="64" cy="50" r="14" fill="#5b9140"/>`,
  flower: `<g><circle cx="50" cy="46" r="8" fill="#ffd23f"/><g fill="#ff7eb6"><ellipse cx="50" cy="30" rx="7" ry="11"/><ellipse cx="66" cy="46" rx="11" ry="7"/><ellipse cx="50" cy="62" rx="7" ry="11"/><ellipse cx="34" cy="46" rx="11" ry="7"/></g><line x1="50" y1="62" x2="50" y2="88" stroke="#3fa34d" stroke-width="4"/></g>`,
  life: `<path d="M50 84 C20 60 26 30 50 30 C74 30 80 60 50 84Z" fill="#5fd68a"/><circle cx="50" cy="46" r="8" fill="#fff" opacity=".7"/>`,
  human: `<circle cx="50" cy="30" r="12" fill="#f0c9a0"/><path d="M30 84 q0 -28 20 -28 t20 28Z" fill="#5b7fb0"/>`,
  sun: `<circle cx="50" cy="50" r="20" fill="#ffd23f"/><g stroke="#ffb01f" stroke-width="4" stroke-linecap="round"><line x1="50" y1="14" x2="50" y2="26"/><line x1="50" y1="74" x2="50" y2="86"/><line x1="14" y1="50" x2="26" y2="50"/><line x1="74" y1="50" x2="86" y2="50"/><line x1="26" y1="26" x2="34" y2="34"/><line x1="74" y1="74" x2="66" y2="66"/><line x1="74" y1="26" x2="66" y2="34"/><line x1="26" y1="74" x2="34" y2="66"/></g>`,
  star: `<path d="M50 10 L61 38 L92 40 L67 59 L76 90 L50 72 L24 90 L33 59 L8 40 L39 38 Z" fill="#ffe14d" stroke="#ffb01f" stroke-width="2"/>`,
  moon: `<path d="M62 18 a34 34 0 1 0 0 64 a26 26 0 1 1 0 -64Z" fill="#dfe6f0"/>`,
  oil: `<path d="M50 16 C34 40 30 52 30 62 a20 20 0 0 0 40 0 C70 52 66 40 50 16Z" fill="#2b2b1a"/><ellipse cx="42" cy="56" rx="4" ry="6" fill="#6a6a3a" opacity=".5"/>`,
  acid: `<path d="M36 24 h28 v18 l10 30 a14 14 0 0 1 -13 20 H39 a14 14 0 0 1 -13 -20 l10 -30Z" fill="#9ee04a" opacity=".85" stroke="#6fb82a" stroke-width="2"/>`,
  salt: `<g fill="#f0f0f0" stroke="#cfcfcf" stroke-width="1.5"><rect x="40" y="40" width="9" height="9"/><rect x="52" y="46" width="8" height="8"/><rect x="46" y="54" width="7" height="7"/><rect x="56" y="36" width="6" height="6"/></g>`,
  gunpowder: `<g fill="#3a3a3a"><circle cx="42" cy="58" r="6"/><circle cx="56" cy="54" r="5"/><circle cx="50" cy="66" r="5"/><circle cx="62" cy="64" r="4"/></g><path d="M56 40 l6 -10" stroke="#ff8a1e" stroke-width="3"/>`,
  explosion: `<path d="M50 8 L58 34 L84 24 L66 46 L92 56 L64 60 L74 88 L50 66 L26 88 L36 60 L8 56 L34 46 L16 24 L42 34Z" fill="#ff7a1e" stroke="#ffd23f" stroke-width="2"><animate attributeName="opacity" values="1;.6;1" dur=".4s" repeatCount="indefinite"/></path>`,
  magnet: `<path d="M30 30 v28 a20 20 0 0 0 40 0 v-28 h-14 v28 a6 6 0 0 1 -12 0 v-28Z" fill="#d23b3b"/><rect x="30" y="58" width="14" height="14" fill="#9aa3ad"/><rect x="56" y="58" width="14" height="14" fill="#9aa3ad"/>`,
  music: `<g fill="#c08bff"><circle cx="38" cy="70" r="9"/><circle cx="66" cy="62" r="9"/><rect x="45" y="28" width="5" height="44"/><rect x="73" y="20" width="5" height="44"/><path d="M45 28 L78 20 V32 L45 40Z"/></g>`,
  death: `<path d="M50 22 a22 22 0 0 1 22 22 c0 10 -6 14 -6 20 H34 c0 -6 -6 -10 -6 -20 a22 22 0 0 1 22 -22Z" fill="#e6e6e6"/><circle cx="41" cy="46" r="5" fill="#222"/><circle cx="59" cy="46" r="5" fill="#222"/><rect x="40" y="64" width="20" height="10" rx="2" fill="#e6e6e6"/>`,
  diamond: `<path d="M30 36 H70 L84 50 L50 90 L16 50Z" fill="#9fe8ff" stroke="#5fc6ff" stroke-width="2"/><path d="M30 36 L42 50 L50 90 M70 36 L58 50 L50 90 M16 50 H84 M42 50 H58" stroke="#dffaff" stroke-width="1.5" fill="none"/>`,
};
// aliases
CORE.rain = CORE.water; CORE.sea = CORE.water; CORE.saltwater = CORE.water;
CORE.inferno = CORE.fire; CORE.plasma = CORE.fire; CORE.mud = CORE.earth;
CORE.dust = CORE.sand; CORE.ash = CORE.smoke; CORE.charcoal = CORE.gunpowder;
CORE.wind = CORE.air; CORE.sky = CORE.air; CORE.galaxy = CORE.star;
CORE.universe = CORE.star; CORE.hydrogen = CORE.air; CORE.oxygen = CORE.air;
CORE.electricity = CORE.electricity; CORE.crystal = CORE.diamond; CORE.gem_ = CORE.diamond;
CORE.diamond_ = CORE.diamond; CORE.obsidian = CORE.stone; CORE.pebble = CORE.stone;
CORE.brick = CORE.stone; CORE.clay = CORE.earth; CORE.sulfur = CORE.gunpowder;
CORE.rust = CORE.earth; CORE.milk = CORE.water; CORE.gasoline = CORE.oil;
CORE.petroleum = CORE.oil; CORE.sound = CORE.music; CORE.snow = CORE.snow;
CORE.blizzard = CORE.snow; CORE.bird = CORE.life; CORE.fish = CORE.life;
CORE.animal = CORE.life; CORE.grass = CORE.plant; CORE.wheat = CORE.plant;

/* ---------------------------------------------------------------------------
   PROCEDURAL SIGIL GENERATOR (for auto: icons)
   Builds a layered emblem: base shape (by category) + tag-driven overlay +
   a unique hashed glyph cluster. Returns inner SVG markup (0 0 100 100).
--------------------------------------------------------------------------- */
const TAG_OVERLAYS = {
  hot:    c => `<path d="M50 30 C56 44 66 46 60 60 C56 70 50 76 50 80 C50 76 44 70 40 60 C36 48 46 46 50 30Z" fill="#ff8a1e" opacity=".9"/>`,
  cold:   c => `<g stroke="#bfeaff" stroke-width="3" stroke-linecap="round" opacity=".9"><line x1="50" y1="34" x2="50" y2="66"/><line x1="36" y1="42" x2="64" y2="58"/><line x1="64" y1="42" x2="36" y2="58"/></g>`,
  magic:  c => `<g fill="#e9c8ff"><circle cx="68" cy="34" r="2.6"/><circle cx="32" cy="40" r="2"/><path d="M50 28 l3 7 l7 3 l-7 3 l-3 7 l-3 -7 l-7 -3 l7 -3Z"/></g>`,
  cursed: c => `<path d="M40 40 q10 -10 20 0 M38 60 q12 12 24 0" stroke="#9b59ff" stroke-width="2.5" fill="none"/>`,
  holy:   c => `<g fill="#fff3b0" opacity=".9"><rect x="47" y="26" width="6" height="20" rx="2"/><rect x="40" y="32" width="20" height="6" rx="2"/></g>`,
  golden: c => `<circle cx="50" cy="50" r="6" fill="#ffd84d" stroke="#e0a300" stroke-width="2"/>`,
  crystal:c => `<path d="M50 24 L62 44 L50 76 L38 44Z" fill="#bff0ff" opacity=".7" stroke="#7fd8ff" stroke-width="1.5"/>`,
  giant:  c => `<path d="M28 72 L40 50 L50 64 L60 46 L72 72Z" fill="${c[1]}" opacity=".5"/>`,
  tiny:   c => `<circle cx="50" cy="50" r="6" fill="${c[1]}"/>`,
  machine:c => `<g fill="none" stroke="${c[1]}" stroke-width="3"><circle cx="50" cy="50" r="10"/><circle cx="50" cy="50" r="3"/></g>`,
  music:  c => `<g fill="${c[1]}"><circle cx="44" cy="64" r="6"/><rect x="49" y="36" width="3" height="28"/><path d="M49 36 L66 32 V40 L49 44Z"/></g>`,
  charged:c => `<path d="M54 30 L40 52 H50 L46 72 L62 46 H52Z" fill="#ffe14d"/>`,
  toxic:  c => `<g fill="#9ee04a"><circle cx="50" cy="50" r="6"/><circle cx="40" cy="44" r="3"/><circle cx="60" cy="44" r="3"/><circle cx="50" cy="62" r="3"/></g>`,
  creature:c => `<path d="M40 44 a10 10 0 0 1 20 0 v10 a10 10 0 0 1 -20 0Z" fill="${c[1]}"/><circle cx="45" cy="48" r="2" fill="#111"/><circle cx="55" cy="48" r="2" fill="#111"/>`,
  vehicle:c => `<rect x="32" y="46" width="36" height="14" rx="4" fill="${c[1]}"/><circle cx="40" cy="62" r="5" fill="#333"/><circle cx="60" cy="62" r="5" fill="#333"/>`,
  place:  c => `<path d="M30 64 V44 L50 30 L70 44 V64Z" fill="${c[1]}"/><rect x="44" y="50" width="12" height="14" fill="${c[0]}"/>`,
};

function baseShape(category, c, r) {
  const accent = c[1];
  const variant = Math.floor(r() * 4);
  switch (category) {
    case "liquid": return `<path d="M50 18 C34 44 28 56 28 66 a22 22 0 0 0 44 0 C72 56 66 44 50 18Z" fill="${accent}" opacity=".85"/>`;
    case "gas": return `<g fill="${accent}" opacity=".55"><circle cx="42" cy="58" r="14"/><circle cx="60" cy="50" r="12"/><circle cx="54" cy="66" r="10"/></g>`;
    case "energy": return `<path d="M54 16 L32 52 H46 L42 84 L70 44 H54 L60 16Z" fill="${accent}"/>`;
    case "powder": return `<path d="M24 64 q6 -16 26 -16 t26 16 q2 14 -26 18 q-28 -4 -26 -18Z" fill="${accent}" opacity=".9"/>`;
    case "life": return `<path d="M50 84 C22 60 28 30 50 30 C72 30 78 60 50 84Z" fill="${accent}"/>`;
    case "cosmic": return `<circle cx="50" cy="50" r="22" fill="${accent}"/><circle cx="50" cy="50" r="30" fill="none" stroke="${accent}" stroke-width="2" opacity=".5"/>`;
    case "structure": return `<path d="M28 70 V42 L50 26 L72 42 V70Z" fill="${accent}"/>`;
    case "machine": return `<rect x="30" y="36" width="40" height="34" rx="6" fill="${accent}"/>`;
    case "tool": return `<rect x="46" y="28" width="8" height="44" rx="3" fill="${accent}"/><rect x="36" y="28" width="28" height="12" rx="3" fill="${accent}"/>`;
    case "food": return `<circle cx="50" cy="54" r="22" fill="${accent}"/>`;
    case "concept": return variant % 2
      ? `<polygon points="50,22 74,40 66,72 34,72 26,40" fill="${accent}" opacity=".85"/>`
      : `<circle cx="50" cy="50" r="22" fill="none" stroke="${accent}" stroke-width="5"/>`;
    default: // solid / object / matter
      return variant === 0 ? `<rect x="30" y="34" width="40" height="36" rx="6" fill="${accent}"/>`
        : variant === 1 ? `<path d="M26 62 q6 -20 24 -20 t24 20 q2 14 -24 18 q-26 -4 -24 -18Z" fill="${accent}"/>`
        : variant === 2 ? `<polygon points="50,24 72,42 64,72 36,72 28,42" fill="${accent}"/>`
        : `<circle cx="50" cy="52" r="22" fill="${accent}"/>`;
  }
}

export function proceduralSVG(id, el) {
  const c = pal(el.category);
  const r = rng(hash(id));
  const tags = el.tags || [];
  let layers = `<rect x="6" y="6" width="88" height="88" rx="20" fill="${c[0]}"/>`;
  layers += baseShape(el.category, c, r);

  // tag overlays (pick up to 2 meaningful tags)
  const overlayTags = tags.filter(t => TAG_OVERLAYS[t]);
  for (let i = 0; i < Math.min(2, overlayTags.length); i++) {
    layers += TAG_OVERLAYS[overlayTags[i]](c);
  }

  // unique hashed sparkle cluster so each icon differs
  const dots = 2 + Math.floor(r() * 3);
  let spark = `<g opacity=".55">`;
  for (let i = 0; i < dots; i++) {
    const x = 24 + r() * 52, y = 24 + r() * 52, rad = 1.2 + r() * 2.4;
    spark += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rad.toFixed(1)}" fill="#ffffff"/>`;
  }
  spark += `</g>`;
  layers += spark;

  // subtle rim
  layers += `<rect x="6" y="6" width="88" height="88" rx="20" fill="none" stroke="${c[1]}" stroke-width="2" opacity=".5"/>`;
  return layers;
}

/* ---------------------------------------------------------------------------
   PUBLIC: get inner SVG markup for an element
--------------------------------------------------------------------------- */
const _cache = new Map();
export function iconInner(el) {
  if (_cache.has(el.id)) return _cache.get(el.id);
  let inner;
  const key = el.icon;
  if (key && !key.startsWith("auto:") && CORE[key]) {
    inner = CORE[key];
  } else if (CORE[el.id]) {
    inner = CORE[el.id];
  } else {
    inner = proceduralSVG(el.id, el);
  }
  _cache.set(el.id, inner);
  return inner;
}

export function svgString(el, size = 48) {
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" class="el-svg">${iconInner(el)}</svg>`;
}

// flat fill color for sandbox pixels
export function pixelColor(el) {
  if (el.phys && el.phys.color) return el.phys.color;
  return pal(el.category)[1];
}
