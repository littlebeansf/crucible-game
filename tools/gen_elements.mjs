/* ============================================================================
   CRUCIBLE — Element & Recipe Library Generator
   ----------------------------------------------------------------------------
   Deterministic, rule-based generator (NO AI, NO runtime randomness).
   Produces a large, interconnected crafting tree (target 5000+ elements)
   plus physics metadata for the sandbox engine.

   Output: ../src/data/elements.json
   Schema per element:
     id        : stable string id (snake_case)
     name      : display name
     emoji     : fallback glyph (used only if no svg)
     icon      : key into the SVG icon atlas (procedural svg generator)
     tier      : discovery depth (0 = base)
     category  : semantic group (drives color + physics defaults)
     tags      : string[] for behavior + reaction matching
     phys      : { state, density, behavior, flammable, temp, reactions... } | null
   Recipes are emitted separately as a map "a+b" -> resultId (order-independent).
============================================================================ */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "src", "data");
fs.mkdirSync(OUT_DIR, { recursive: true });

/* ---------------------------------------------------------------------------
   Registries
--------------------------------------------------------------------------- */
const elements = new Map();      // id -> element
const recipes = new Map();       // "a|b" (sorted) -> resultId
const recipeMeta = new Map();    // resultId -> {a,b} first discovery pair (for hints)

function key(a, b) { return [a, b].sort().join("|"); }

function el(id, def) {
  if (elements.has(id)) return id;
  elements.set(id, {
    id,
    name: def.name,
    emoji: def.emoji || "✨",
    icon: def.icon || null,
    tier: def.tier ?? 0,
    category: def.category || "matter",
    tags: def.tags || [],
    phys: def.phys || null,
    base: !!def.base,
  });
  return id;
}

function combine(a, b, resultId, resultDef) {
  if (!elements.has(resultId) && resultDef) el(resultId, resultDef);
  const k = key(a, b);
  if (!recipes.has(k)) {
    recipes.set(k, resultId);
    if (!recipeMeta.has(resultId)) recipeMeta.set(resultId, { a, b });
  }
  return resultId;
}

/* ---------------------------------------------------------------------------
   PHYSICS HELPERS — sandbox behavior presets
   states: solid (static), powder (falls/piles), liquid (flows), gas (rises),
           energy (fire/spark/plasma)
--------------------------------------------------------------------------- */
const P = {
  powder: (o = {}) => ({ state: "powder", density: 5, ...o }),
  liquid: (o = {}) => ({ state: "liquid", density: 3, ...o }),
  gas:    (o = {}) => ({ state: "gas", density: 0.5, ...o }),
  solid:  (o = {}) => ({ state: "solid", density: 9, ...o }),
  energy: (o = {}) => ({ state: "energy", density: 0.2, ...o }),
};

/* ===========================================================================
   TIER 0 — THE FOUR CLASSICAL BASES (+ a couple of seeds)
=========================================================================== */
el("water", { name: "Water", emoji: "💧", icon: "water", base: true, tier: 0, category: "liquid",
  tags: ["wet", "liquid", "extinguisher"], phys: P.liquid({ density: 3, temp: 20, freezeTo: "ice", boilTo: "steam", behavior: "water" }) });
el("fire", { name: "Fire", emoji: "🔥", icon: "fire", base: true, tier: 0, category: "energy",
  tags: ["hot", "energy", "burns"], phys: P.energy({ temp: 700, behavior: "fire", lifespan: 80 }) });
el("earth", { name: "Earth", emoji: "🪨", icon: "earth", base: true, tier: 0, category: "powder",
  tags: ["solid", "ground"], phys: P.powder({ density: 6, behavior: "powder", color: "#7a5b3a" }) });
el("air", { name: "Air", emoji: "🌬️", icon: "air", base: true, tier: 0, category: "gas",
  tags: ["gas", "wind"], phys: P.gas({ density: 0.4, behavior: "gas", color: "#dbeafe" }) });

/* ===========================================================================
   TIER 1 — PRIMARY DERIVATIONS (hand-authored, the canonical core)
=========================================================================== */
const core = [
  // a, b, result, def
  ["water", "fire", "steam", { name: "Steam", emoji: "♨️", icon: "steam", tier: 1, category: "gas",
    tags: ["gas", "hot", "wet"], phys: P.gas({ density: 0.3, behavior: "gas", temp: 110, condenseTo: "water", color: "#e2e8f0" }) }],
  ["earth", "water", "mud", { name: "Mud", emoji: "🟤", icon: "mud", tier: 1, category: "powder",
    tags: ["wet", "earth"], phys: P.powder({ density: 6, behavior: "powder", color: "#5a4632" }) }],
  ["earth", "fire", "lava", { name: "Lava", emoji: "🌋", icon: "lava", tier: 1, category: "liquid",
    tags: ["hot", "molten", "burns"], phys: P.liquid({ density: 8, behavior: "lava", temp: 1100, coolTo: "stone", color: "#ff5a1f" }) }],
  ["air", "fire", "energy", { name: "Energy", emoji: "⚡", icon: "energy", tier: 1, category: "energy",
    tags: ["energy", "charged"], phys: P.energy({ behavior: "spark", temp: 300, lifespan: 30 }) }],
  ["air", "water", "rain", { name: "Rain", emoji: "🌧️", icon: "rain", tier: 1, category: "liquid",
    tags: ["wet", "weather"], phys: P.liquid({ density: 3, behavior: "water", color: "#5b9bd5" }) }],
  ["earth", "air", "dust", { name: "Dust", emoji: "🌫️", icon: "dust", tier: 1, category: "powder",
    tags: ["dry", "fine"], phys: P.powder({ density: 2, behavior: "powder", color: "#cbb994" }) }],
  ["water", "water", "sea", { name: "Sea", emoji: "🌊", icon: "sea", tier: 1, category: "liquid",
    tags: ["wet", "large"], phys: P.liquid({ density: 3, behavior: "water", color: "#1e6f9f" }) }],
  ["fire", "fire", "inferno", { name: "Inferno", emoji: "🔥", icon: "fire", tier: 1, category: "energy",
    tags: ["hot", "burns"], phys: P.energy({ behavior: "fire", temp: 1200, lifespan: 120 }) }],
  ["earth", "earth", "land", { name: "Land", emoji: "🏞️", icon: "land", tier: 1, category: "solid",
    tags: ["ground"], phys: P.solid({ behavior: "static", color: "#6b8e23" }) }],
  ["air", "air", "wind", { name: "Wind", emoji: "💨", icon: "wind", tier: 1, category: "gas",
    tags: ["gas", "moving"], phys: P.gas({ density: 0.3, behavior: "gas", color: "#cfe8ff" }) }],
];
core.forEach(([a, b, r, d]) => combine(a, b, r, d));

/* ===========================================================================
   TIER 2+ — CURATED CANONICAL CHAINS
   These give the tree real "meaning" and recognizable Little-Alchemy-style
   discoveries. The procedural expansion later hangs off these anchors.
=========================================================================== */
const C = (a, b, r, d) => combine(a, b, r, d);

// Geology / materials
C("lava", "air", "stone", { name: "Stone", emoji: "🪨", icon: "stone", tier: 2, category: "solid",
  tags: ["solid", "rock"], phys: P.solid({ behavior: "static", density: 9, color: "#8a8a8a" }) });
C("lava", "water", "obsidian", { name: "Obsidian", emoji: "⬛", icon: "obsidian", tier: 2, category: "solid",
  tags: ["solid", "glassy", "rock"], phys: P.solid({ behavior: "static", density: 9, color: "#1c1c22" }) });
C("stone", "fire", "metal", { name: "Metal", emoji: "🔩", icon: "metal", tier: 3, category: "solid",
  tags: ["solid", "metal", "conductive"], phys: P.solid({ behavior: "static", density: 10, color: "#9aa3ad", conductive: true }) });
C("stone", "stone", "pebble", { name: "Pebble", emoji: "🪨", icon: "pebble", tier: 3, category: "powder",
  tags: ["solid", "rock"], phys: P.powder({ density: 7, behavior: "powder", color: "#9a9a9a" }) });
C("metal", "fire", "steel", { name: "Steel", emoji: "🛠️", icon: "steel", tier: 4, category: "solid",
  tags: ["solid", "metal", "alloy", "conductive"], phys: P.solid({ behavior: "static", density: 10, color: "#b6c2cf", conductive: true }) });
C("sand", "fire", "glass", { name: "Glass", emoji: "🪟", icon: "glass", tier: 4, category: "solid",
  tags: ["solid", "glassy", "transparent"], phys: P.solid({ behavior: "static", density: 8, color: "#cfeefe" }) });
C("stone", "air", "sand", { name: "Sand", emoji: "🏖️", icon: "sand", tier: 3, category: "powder",
  tags: ["powder", "dry"], phys: P.powder({ density: 5, behavior: "powder", color: "#e3c982" }) });
C("sand", "water", "clay", { name: "Clay", emoji: "🧱", icon: "clay", tier: 4, category: "powder",
  tags: ["earth", "wet"], phys: P.powder({ density: 6, behavior: "powder", color: "#b5651d" }) });
C("clay", "fire", "brick", { name: "Brick", emoji: "🧱", icon: "brick", tier: 5, category: "solid",
  tags: ["solid", "built"], phys: P.solid({ behavior: "static", color: "#a8432a" }) });

// Ice / temperature
C("water", "air", "cloud", { name: "Cloud", emoji: "☁️", icon: "cloud", tier: 2, category: "gas",
  tags: ["gas", "weather", "wet"], phys: P.gas({ density: 0.3, behavior: "gas", color: "#f1f5f9" }) });
C("cloud", "air", "sky", { name: "Sky", emoji: "🌌", icon: "sky", tier: 3, category: "gas", tags: ["weather"] });
C("water", "cloud", "ice", { name: "Ice", emoji: "🧊", icon: "ice", tier: 3, category: "solid",
  tags: ["solid", "cold", "frozen"], phys: P.solid({ behavior: "static", temp: -10, meltTo: "water", color: "#bfe9ff" }) });
C("ice", "ice", "snow", { name: "Snow", emoji: "❄️", icon: "snow", tier: 4, category: "powder",
  tags: ["cold", "frozen", "powder"], phys: P.powder({ density: 2, behavior: "powder", temp: -5, meltTo: "water", color: "#eef7ff" }) });
C("snow", "snow", "blizzard", { name: "Blizzard", emoji: "🌨️", icon: "blizzard", tier: 5, category: "gas", tags: ["cold", "weather"] });
C("water", "energy", "electricity", { name: "Electricity", emoji: "⚡", icon: "electricity", tier: 2, category: "energy",
  tags: ["energy", "charged", "conductive"], phys: P.energy({ behavior: "spark", lifespan: 20 }) });
C("cloud", "electricity", "lightning", { name: "Lightning", emoji: "🌩️", icon: "lightning", tier: 3, category: "energy",
  tags: ["energy", "charged"], phys: P.energy({ behavior: "spark", temp: 900, lifespan: 14 }) });
C("lightning", "sand", "fulgurite", { name: "Fulgurite", emoji: "⚡", icon: "fulgurite", tier: 5, category: "solid", tags: ["solid","glassy"] });

// Life
C("mud", "energy", "life", { name: "Life", emoji: "🌟", icon: "life", tier: 3, category: "life", tags: ["organic", "alive"] });
C("life", "water", "bacteria", { name: "Bacteria", emoji: "🦠", icon: "bacteria", tier: 4, category: "life", tags: ["organic", "alive", "micro"] });
C("life", "earth", "plant", { name: "Plant", emoji: "🌱", icon: "plant", tier: 4, category: "life",
  tags: ["organic", "plant", "flammable"], phys: P.solid({ behavior: "plant", flammable: true, color: "#3fa34d" }) });
C("plant", "plant", "grass", { name: "Grass", emoji: "🌿", icon: "grass", tier: 5, category: "life",
  tags: ["plant", "flammable"], phys: P.powder({ density: 2, behavior: "plant", flammable: true, color: "#5fb35f" }) });
C("plant", "earth", "tree", { name: "Tree", emoji: "🌳", icon: "tree", tier: 5, category: "life",
  tags: ["plant", "wood", "flammable"], phys: P.solid({ behavior: "plant", flammable: true, color: "#4a7a32" }) });
C("tree", "fire", "charcoal", { name: "Charcoal", emoji: "⬛", icon: "charcoal", tier: 6, category: "powder",
  tags: ["fuel", "flammable"], phys: P.powder({ density: 4, behavior: "powder", flammable: true, color: "#2a2a2a" }) });
C("tree", "metal", "axe_tool", { name: "Axe", emoji: "🪓", icon: "axe", tier: 6, category: "tool", tags: ["tool"] });
C("tree", "air", "wood", { name: "Wood", emoji: "🪵", icon: "wood", tier: 6, category: "solid",
  tags: ["wood", "flammable", "fuel"], phys: P.solid({ behavior: "plant", flammable: true, color: "#8a5a2b" }) });
C("wood", "fire", "ash", { name: "Ash", emoji: "🌫️", icon: "ash", tier: 7, category: "powder",
  tags: ["powder", "burnt"], phys: P.powder({ density: 2, behavior: "powder", color: "#9a9a9a" }) });
C("plant", "time", "flower", { name: "Flower", emoji: "🌸", icon: "flower", tier: 6, category: "life", tags: ["plant", "pretty"] });
C("bacteria", "time", "amoeba", { name: "Amoeba", emoji: "🦠", icon: "amoeba", tier: 5, category: "life", tags: ["organic", "alive"] });
C("life", "sea", "fish", { name: "Fish", emoji: "🐟", icon: "fish", tier: 5, category: "life", tags: ["animal", "alive"] });
C("fish", "land", "lizard", { name: "Lizard", emoji: "🦎", icon: "lizard", tier: 6, category: "life", tags: ["animal", "alive"] });
C("lizard", "time", "dinosaur", { name: "Dinosaur", emoji: "🦕", icon: "dinosaur", tier: 7, category: "life", tags: ["animal"] });
C("dinosaur", "time", "bird", { name: "Bird", emoji: "🐦", icon: "bird", tier: 8, category: "life", tags: ["animal"] });
C("life", "land", "animal", { name: "Animal", emoji: "🐾", icon: "animal", tier: 5, category: "life", tags: ["animal"] });
C("animal", "time", "human", { name: "Human", emoji: "🧑", icon: "human", tier: 6, category: "life", tags: ["human", "intelligent"] });

// Special seed: TIME (Little Alchemy unlockable)
el("time", { name: "Time", emoji: "⏳", icon: "time", tier: 2, category: "concept", tags: ["concept"] });
C("sand", "glass", "time", null); // hourglass route
C("life", "stone", "time", null);

// Human civilization
C("human", "human", "love", { name: "Love", emoji: "❤️", icon: "love", tier: 7, category: "concept", tags: ["concept"] });
C("human", "metal", "tool", { name: "Tool", emoji: "🔧", icon: "tool", tier: 7, category: "tool", tags: ["tool"] });
C("human", "stone", "wall", { name: "Wall", emoji: "🧱", icon: "wall", tier: 7, category: "solid", tags: ["built"], phys: P.solid({ behavior:"static", color:"#9a8a78" }) });
C("wall", "wall", "house", { name: "House", emoji: "🏠", icon: "house", tier: 8, category: "structure", tags: ["built"] });
C("house", "house", "village", { name: "Village", emoji: "🏘️", icon: "village", tier: 9, category: "structure", tags: ["built"] });
C("village", "village", "city", { name: "City", emoji: "🏙️", icon: "city", tier: 10, category: "structure", tags: ["built"] });
C("city", "city", "country", { name: "Country", emoji: "🗺️", icon: "country", tier: 11, category: "structure", tags: ["built"] });
C("country", "country", "continent", { name: "Continent", emoji: "🌍", icon: "continent", tier: 12, category: "structure", tags: ["built"] });
C("continent", "continent", "planet", { name: "Planet", emoji: "🪐", icon: "planet", tier: 13, category: "cosmic", tags: ["cosmic"] });
C("human", "tool", "wheel", { name: "Wheel", emoji: "🛞", icon: "wheel", tier: 8, category: "tool", tags: ["tool"] });
C("wheel", "wheel", "cart", { name: "Cart", emoji: "🛒", icon: "cart", tier: 9, category: "machine", tags: ["machine"] });
C("cart", "metal", "car", { name: "Car", emoji: "🚗", icon: "car", tier: 10, category: "machine", tags: ["machine"] });
C("car", "air", "plane", { name: "Plane", emoji: "✈️", icon: "plane", tier: 11, category: "machine", tags: ["machine"] });
C("plane", "energy", "rocket", { name: "Rocket", emoji: "🚀", icon: "rocket", tier: 12, category: "machine", tags: ["machine"] });
C("rocket", "planet", "spaceship", { name: "Spaceship", emoji: "🛸", icon: "spaceship", tier: 14, category: "machine", tags: ["machine"] });

// Cosmos
C("fire", "fire", "sun", { name: "Sun", emoji: "☀️", icon: "sun", tier: 2, category: "cosmic", tags: ["cosmic", "hot"] });
C("sun", "sun", "star", { name: "Star", emoji: "⭐", icon: "star", tier: 3, category: "cosmic", tags: ["cosmic"] });
C("star", "star", "galaxy", { name: "Galaxy", emoji: "🌌", icon: "galaxy", tier: 4, category: "cosmic", tags: ["cosmic"] });
C("galaxy", "galaxy", "universe", { name: "Universe", emoji: "🌠", icon: "universe", tier: 5, category: "cosmic", tags: ["cosmic"] });
C("star", "earth", "moon", { name: "Moon", emoji: "🌙", icon: "moon", tier: 4, category: "cosmic", tags: ["cosmic"] });
C("planet", "planet", "solar_system", { name: "Solar System", emoji: "🪐", icon: "solar", tier: 14, category: "cosmic", tags: ["cosmic"] });
C("star", "metal", "black_hole", { name: "Black Hole", emoji: "🕳️", icon: "blackhole", tier: 6, category: "cosmic", tags: ["cosmic", "void"] });

// Chemistry / physics sandbox staples
C("air", "energy", "oxygen", { name: "Oxygen", emoji: "🅾️", icon: "oxygen", tier: 2, category: "gas",
  tags: ["gas", "oxidizer"], phys: P.gas({ density: 0.45, behavior: "gas", color: "#cfe8ff" }) });
C("water", "electricity", "hydrogen", { name: "Hydrogen", emoji: "🎈", icon: "hydrogen", tier: 3, category: "gas",
  tags: ["gas", "flammable", "explosive"], phys: P.gas({ density: 0.1, behavior: "gas", flammable: true, color: "#e0f2ff" }) });
C("fire", "wood", "smoke", { name: "Smoke", emoji: "💨", icon: "smoke", tier: 2, category: "gas",
  tags: ["gas", "dirty"], phys: P.gas({ density: 0.35, behavior: "smoke", lifespan: 120, color: "#5b5b5b" }) });
C("hydrogen", "oxygen", "water", null); // closes the loop nicely
C("fire", "earth", "sulfur", { name: "Sulfur", emoji: "🟡", icon: "sulfur", tier: 2, category: "powder",
  tags: ["powder", "flammable"], phys: P.powder({ density: 4, behavior: "powder", flammable: true, color: "#e3d24a" }) });
C("sulfur", "charcoal", "gunpowder", { name: "Gunpowder", emoji: "🧨", icon: "gunpowder", tier: 8, category: "powder",
  tags: ["powder", "explosive", "flammable"], phys: P.powder({ density: 4, behavior: "powder", flammable: true, explosive: true, color: "#3a3a3a" }) });
C("gunpowder", "fire", "explosion", { name: "Explosion", emoji: "💥", icon: "explosion", tier: 9, category: "energy",
  tags: ["energy", "boom"], phys: P.energy({ behavior: "explosion", temp: 1500, lifespan: 8 }) });
C("oxygen", "fire", "plasma", { name: "Plasma", emoji: "🟣", icon: "plasma", tier: 4, category: "energy",
  tags: ["energy", "ionized"], phys: P.energy({ behavior: "fire", temp: 5000, lifespan: 40, color: "#c026d3" }) });
C("metal", "electricity", "magnet", { name: "Magnet", emoji: "🧲", icon: "magnet", tier: 4, category: "solid", tags: ["metal", "magnetic"] });
C("oil", "fire", "fireball", { name: "Fireball", emoji: "🔥", icon: "fire", tier: 6, category: "energy", tags: ["hot","burns"], phys: P.energy({behavior:"fire",temp:1000,lifespan:90}) });
C("plant", "time", "oil", { name: "Oil", emoji: "🛢️", icon: "oil", tier: 6, category: "liquid",
  tags: ["liquid", "flammable", "fuel"], phys: P.liquid({ density: 2.5, behavior: "water", flammable: true, color: "#2b2b1a" }) });
C("oil", "earth", "petroleum", { name: "Petroleum", emoji: "🛢️", icon: "petroleum", tier: 7, category: "liquid",
  tags: ["liquid", "flammable", "fuel"], phys: P.liquid({ density: 2.5, behavior: "water", flammable: true, color: "#1a1a0a" }) });
C("petroleum", "fire", "gasoline", { name: "Gasoline", emoji: "⛽", icon: "gasoline", tier: 8, category: "liquid",
  tags: ["liquid", "flammable", "explosive"], phys: P.liquid({ density: 2, behavior: "water", flammable: true, color: "#caa64a" }) });
C("water", "earth", "salt", { name: "Salt", emoji: "🧂", icon: "salt", tier: 2, category: "powder",
  tags: ["powder", "soluble"], phys: P.powder({ density: 5, behavior: "powder", soluble: true, color: "#f0f0f0" }) });
C("salt", "water", "saltwater", { name: "Salt Water", emoji: "🌊", icon: "saltwater", tier: 3, category: "liquid",
  tags: ["liquid", "wet"], phys: P.liquid({ density: 3.2, behavior: "water", color: "#2f7fb0" }) });
C("water", "sulfur", "acid", { name: "Acid", emoji: "🧪", icon: "acid", tier: 3, category: "liquid",
  tags: ["liquid", "corrosive"], phys: P.liquid({ density: 3.5, behavior: "acid", color: "#9ee04a" }) });
C("acid", "metal", "rust", { name: "Rust", emoji: "🟫", icon: "rust", tier: 5, category: "powder",
  tags: ["powder", "oxide"], phys: P.powder({ density: 5, behavior: "powder", color: "#8a4a2a" }) });

// Food chain (Little Alchemy flavor)
C("plant", "time", "wheat", { name: "Wheat", emoji: "🌾", icon: "wheat", tier: 6, category: "food", tags: ["food", "plant", "flammable"] });
C("wheat", "stone", "flour", { name: "Flour", emoji: "🌾", icon: "flour", tier: 7, category: "food",
  tags: ["food", "powder"], phys: P.powder({ density: 3, behavior: "powder", flammable: true, color: "#efe6cf" }) });
C("flour", "water", "dough", { name: "Dough", emoji: "🥟", icon: "dough", tier: 8, category: "food", tags: ["food"] });
C("dough", "fire", "bread", { name: "Bread", emoji: "🍞", icon: "bread", tier: 9, category: "food", tags: ["food"] });
C("bread", "fire", "toast", { name: "Toast", emoji: "🍞", icon: "toast", tier: 10, category: "food", tags: ["food"] });
C("milk", "time", "cheese", { name: "Cheese", emoji: "🧀", icon: "cheese", tier: 8, category: "food", tags: ["food"] });
C("animal", "human", "milk", { name: "Milk", emoji: "🥛", icon: "milk", tier: 7, category: "liquid",
  tags: ["liquid", "food"], phys: P.liquid({ density: 3, behavior: "water", color: "#f5f5f0" }) });

console.log("Curated core elements:", elements.size, "recipes:", recipes.size);

/* ===========================================================================
   PROCEDURAL EXPANSION ENGINE
   ---------------------------------------------------------------------------
   We hang a large, MEANINGFUL tree off the curated anchors using
   deterministic "operators": modifiers applied to base nouns produce new
   nouns with sensible recipes. This is how we reach 5000+ without nonsense.
=========================================================================== */

// Reusable "modifier" elements (adjectives/agents) — each is itself craftable.
const modifiers = [
  // id, name, emoji, icon, derivedFrom (recipe a,b), tagAdds, category
  ["hot",      "Hot",       "🔆", "mod_hot",   ["fire", "air"],        ["hot"],        "concept"],
  ["cold",     "Cold",      "🧊", "mod_cold",  ["ice", "air"],         ["cold"],       "concept"],
  ["frozen",   "Frozen",    "❄️", "mod_frozen",["cold", "water"],      ["cold","frozen"],"concept"],
  ["wet",      "Wet",       "💦", "mod_wet",   ["water", "air"],       ["wet"],        "concept"],
  ["giant",    "Giant",     "🦣", "mod_giant", ["big", "life"],        ["big"],        "concept"],
  ["big",      "Big",       "⬆️", "mod_big",   ["earth", "earth"],     ["big"],        "concept"],
  ["tiny",     "Tiny",      "🔬", "mod_tiny",  ["dust", "dust"],       ["small"],      "concept"],
  ["wild",     "Wild",      "🐺", "mod_wild",  ["animal", "land"],     ["wild"],       "concept"],
  ["robotic",  "Robotic",   "🤖", "mod_robot", ["metal", "energy"],    ["machine"],    "concept"],
  ["golden",   "Golden",    "🟡", "mod_gold",  ["metal", "sun"],       ["precious"],   "concept"],
  ["crystal",  "Crystal",   "💎", "mod_crystal",["glass", "energy"],   ["crystal"],    "concept"],
  ["magic",    "Magic",     "✨", "mod_magic", ["energy", "life"],     ["magic"],      "concept"],
  ["holy",     "Holy",      "😇", "mod_holy",  ["magic", "love"],      ["holy"],       "concept"],
  ["cursed",   "Cursed",    "💀", "mod_cursed",["magic", "death"],     ["cursed"],     "concept"],
  ["ancient",  "Ancient",   "🏺", "mod_ancient",["time", "stone"],     ["ancient"],    "concept"],
  ["electric", "Electric",  "⚡", "mod_electric",["electricity","metal"],["charged"],  "concept"],
  ["frozen2",  "Glacial",   "🏔️", "mod_glacial",["ice","time"],        ["cold"],       "concept"],
  ["molten",   "Molten",    "🌋", "mod_molten",["lava","metal"],       ["hot","molten"],"concept"],
  ["toxic",    "Toxic",     "☣️", "mod_toxic", ["acid","smoke"],       ["toxic"],      "concept"],
  ["radiant",  "Radiant",   "🌟", "mod_radiant",["sun","crystal"],     ["bright"],     "concept"],
];
// death seed
el("death", { name: "Death", emoji: "💀", icon: "death", tier: 8, category: "concept", tags: ["concept", "dark"] });
C("life", "time", "death", null);
C("human", "death", "ghost", { name: "Ghost", emoji: "👻", icon: "ghost", tier: 9, category: "life", tags: ["spirit"] });

modifiers.forEach(([id, name, emoji, icon, [a, b], adds, cat]) => {
  el(id, { name, emoji, icon, tier: 4, category: cat, tags: ["modifier", ...adds] });
  combine(a, b, id, null);
});

// Base nouns that modifiers attach to (broad, recognizable set).
const nouns = [
  // id-ish, display
  ["stone", "Stone"], ["metal", "Metal"], ["steel", "Steel"], ["wood", "Wood"], ["water", "Water"],
  ["fire", "Fire"], ["ice", "Ice"], ["sand", "Sand"], ["glass", "Glass"], ["clay", "Clay"],
  ["plant", "Plant"], ["tree", "Tree"], ["flower", "Flower"], ["grass", "Grass"], ["fish", "Fish"],
  ["bird", "Bird"], ["lizard", "Lizard"], ["animal", "Animal"], ["human", "Human"], ["dinosaur", "Dinosaur"],
  ["sword_", "Sword"], ["shield_", "Shield"], ["armor_", "Armor"], ["castle_", "Castle"], ["tower_", "Tower"],
  ["dragon_", "Dragon"], ["knight_", "Knight"], ["wizard_", "Wizard"], ["potion_", "Potion"], ["crown_", "Crown"],
  ["ring_", "Ring"], ["gem_", "Gem"], ["coin_", "Coin"], ["key_", "Key"], ["door_", "Door"],
  ["robot_", "Robot"], ["engine_", "Engine"], ["gear_", "Gear"], ["circuit_", "Circuit"], ["battery_", "Battery"],
  ["star", "Star"], ["moon", "Moon"], ["sun", "Sun"], ["cloud", "Cloud"], ["storm_", "Storm"],
  ["river_", "River"], ["mountain_", "Mountain"], ["forest_", "Forest"], ["desert_", "Desert"], ["volcano_", "Volcano"],
  ["crystal_n", "Crystal"], ["diamond_", "Diamond"], ["gold_", "Gold"], ["silver_", "Silver"], ["bronze_", "Bronze"],
  ["fox_", "Fox"], ["wolf_", "Wolf"], ["bear_", "Bear"], ["eagle_", "Eagle"], ["snake_", "Snake"],
  ["spider_", "Spider"], ["beetle_", "Beetle"], ["whale_", "Whale"], ["shark_", "Shark"], ["octopus_", "Octopus"],
];

// First make sure every "noun seed" exists as an element (craft them from sensible pairs if not already).
const nounSeedRecipes = {
  sword_: ["metal", "steel"], shield_: ["metal", "wood"], armor_: ["metal", "human"],
  castle_: ["wall", "stone"], tower_: ["stone", "stone"], dragon_: ["lizard", "fire"],
  knight_: ["human", "armor_"], wizard_: ["human", "magic"], potion_: ["water", "magic"],
  crown_: ["gold_", "human"], ring_: ["gold_", "gem_"], gem_: ["stone", "crystal"],
  coin_: ["gold_", "tool"], key_: ["metal", "tool"], door_: ["wood", "wall"],
  robot_: ["metal", "robotic"], engine_: ["metal", "fire"], gear_: ["metal", "wheel"],
  circuit_: ["metal", "electricity"], battery_: ["metal", "acid"], storm_: ["cloud", "wind"],
  river_: ["water", "land"], mountain_: ["earth", "earth"], forest_: ["tree", "tree"],
  desert_: ["sand", "sun"], volcano_: ["mountain_", "lava"], crystal_n: ["glass", "crystal"],
  diamond_: ["charcoal", "time"], gold_: ["metal", "golden"], silver_: ["metal", "moon"],
  bronze_: ["metal", "copper_"], copper_: ["metal", "fire"],
  fox_: ["animal", "wild"], wolf_: ["animal", "wild"], bear_: ["animal", "mountain_"],
  eagle_: ["bird", "mountain_"], snake_: ["lizard", "wild"], spider_: ["animal", "tiny"],
  beetle_: ["animal", "tiny"], whale_: ["fish", "giant"], shark_: ["fish", "wild"], octopus_: ["fish", "sea"],
};
const nounDisplay = Object.fromEntries(nouns);
for (const [seedId, [a, b]] of Object.entries(nounSeedRecipes)) {
  if (!elements.has(seedId)) {
    el(seedId, { name: nounDisplay[seedId] || seedId, emoji: "🔹", icon: "auto:" + seedId, tier: 6, category: "object", tags: ["object"] });
  }
  // ensure prerequisites exist
  [a, b].forEach(x => { if (!elements.has(x)) el(x, { name: x.replace(/_$/,""), emoji: "🔹", icon: "auto:" + x, tier: 5, category: "object", tags: ["object"] }); });
  combine(a, b, seedId, null);
}

/* ---- THE BIG EXPANSION ----
   For each (modifier × noun) we create a new element + recipe.
   Result tier = max(noun tier, modifier tier)+1. Tags merge. Category inherits noun.
   This alone yields ~20 × ~65 = ~1300 elements.                                   */
let expansionCount = 0;
for (const [modId, , , , , adds] of modifiers) {
  const modName = elements.get(modId).name;
  for (const [nounId, nounName] of nouns) {
    if (!elements.has(nounId)) continue;
    const noun = elements.get(nounId);
    const newId = `${modId}_${nounId}`.replace(/_+/g, "_");
    const newName = `${modName} ${nounName}`;
    el(newId, {
      name: newName,
      emoji: noun.emoji,
      icon: "auto:" + newId,
      tier: Math.max(noun.tier, 4) + 1,
      category: noun.category,
      tags: Array.from(new Set([...(noun.tags || []), ...adds, "compound"])),
      phys: null,
    });
    combine(modId, nounId, newId, null);
    expansionCount++;
  }
}
console.log("Modifier×noun expansion added:", expansionCount, "total elements:", elements.size);

/* ---- SECOND-ORDER COMBINATIONS ----
   Combine pairs of curated "domain" elements to form recognizable composites,
   plus chain modified items together. We generate a controlled, deterministic
   web so the graph is dense and discoverable.                                   */

// Domain composite pairs: (list A) × (list B) -> "A B" composite
const compositeGroups = [
  {
    a: ["sword_", "shield_", "armor_", "crown_", "ring_", "axe_tool", "key_"],
    b: ["gold_", "silver_", "bronze_", "diamond_", "crystal_n", "steel", "obsidian"],
    join: (an, bn) => `${bn} ${an}`,
    cat: "object", tags: ["object", "crafted"], tier: 8,
  },
  {
    a: ["dragon_", "knight_", "wizard_", "robot_", "ghost", "human"],
    b: ["fire", "ice", "electricity", "magic", "acid", "plasma"],
    join: (an, bn) => `${bn} ${an}`,
    cat: "life", tags: ["creature", "crafted"], tier: 9,
  },
  {
    a: ["potion_", "battery_", "engine_", "circuit_"],
    b: ["energy", "magic", "acid", "crystal", "electricity"],
    join: (an, bn) => `${bn} ${an}`,
    cat: "object", tags: ["device", "crafted"], tier: 9,
  },
  {
    a: ["forest_", "desert_", "mountain_", "river_", "volcano_", "sea", "city"],
    b: ["fire", "ice", "storm_", "magic", "death", "ancient"],
    join: (an, bn) => `${bn} ${an}`,
    cat: "structure", tags: ["place", "crafted"], tier: 10,
  },
  {
    a: ["fox_", "wolf_", "bear_", "eagle_", "snake_", "spider_", "whale_", "shark_", "dragon_"],
    b: ["giant", "tiny", "robotic", "golden", "crystal", "magic", "cursed", "electric"],
    join: (an, bn) => `${bn} ${an}`,
    cat: "life", tags: ["creature", "crafted"], tier: 9,
  },
];

const niceName = id => (elements.get(id)?.name) || id.replace(/_+$/,"").replace(/_/g," ");
let compositeCount = 0;
for (const g of compositeGroups) {
  for (const aId of g.a) {
    if (!elements.has(aId)) continue;
    for (const bId of g.b) {
      if (!elements.has(bId)) continue;
      const newId = `cmp_${aId}_${bId}`.replace(/_+/g, "_");
      const an = niceName(aId), bn = niceName(bId);
      const newName = g.join(an, bn);
      const baseEmoji = elements.get(aId).emoji;
      el(newId, {
        name: newName, emoji: baseEmoji, icon: "auto:" + newId,
        tier: g.tier, category: g.cat,
        tags: Array.from(new Set([...g.tags, ...(elements.get(aId).tags||[]), ...(elements.get(bId).tags||[])])),
        phys: null,
      });
      combine(aId, bId, newId, null);
      compositeCount++;
    }
  }
}
console.log("Composite expansion added:", compositeCount, "total:", elements.size);

/* ---- THIRD-ORDER: ELEMENTAL ALLOYS & MIXTURES (physics-relevant) ----
   Cross every powder/liquid/gas with every other to mint mixtures that the
   sandbox can treat as new materials with blended physics.                      */
function physElsByState(state) {
  return [...elements.values()].filter(e => e.phys && e.phys.state === state);
}
const powders = physElsByState("powder");
const liquids = physElsByState("liquid");
const gases = physElsByState("gas");

let mixCount = 0;
function mintMixture(x, y, stateHint) {
  if (x.id === y.id) return;
  const id = `mix_${[x.id, y.id].sort().join("_")}`;
  if (elements.has(id)) return;
  const a = x.phys, b = y.phys;
  const density = ((a.density ?? 3) + (b.density ?? 3)) / 2;
  const flammable = !!(a.flammable || b.flammable);
  const behavior = stateHint === "liquid" ? "water" : stateHint === "gas" ? "gas" : "powder";
  el(id, {
    name: `${x.name}-${y.name} Mix`,
    emoji: "🌀", icon: "auto:" + id,
    tier: Math.max(x.tier, y.tier) + 1,
    category: stateHint,
    tags: Array.from(new Set([...(x.tags||[]), ...(y.tags||[]), "mixture"])),
    phys: { state: stateHint, density, behavior, flammable, color: blendColor(a.color, b.color) },
  });
  combine(x.id, y.id, id, null);
  mixCount++;
}
function blendColor(c1, c2) {
  const p = h => { h = (h||"#888888").replace("#",""); return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]; };
  const [r1,g1,b1] = p(c1), [r2,g2,b2] = p(c2);
  const m = (a,b)=>Math.round((a+b)/2).toString(16).padStart(2,"0");
  return `#${m(r1,r2)}${m(g1,g2)}${m(b1,b2)}`;
}
for (let i=0;i<powders.length;i++) for (let j=i+1;j<powders.length;j++) mintMixture(powders[i],powders[j],"powder");
for (let i=0;i<liquids.length;i++) for (let j=i+1;j<liquids.length;j++) mintMixture(liquids[i],liquids[j],"liquid");
for (let i=0;i<gases.length;i++) for (let j=i+1;j<gases.length;j++) mintMixture(gases[i],gases[j],"gas");
console.log("Mixture expansion added:", mixCount, "total:", elements.size);

/* ---- FOURTH-ORDER: "ERA / PLACE" THEMED SETS (taps user's interests:
   venues, travel, music) — gives flavor & more breadth.                         */
const eras = ["Ancient","Medieval","Industrial","Modern","Cyber","Cosmic","Mythic","Neon"];
const places = ["Temple","Market","Arena","Harbor","Factory","Station","Tower","Vault","Garden","Bridge","Theatre","Club"];
let eraCount = 0;
// seed era + place words as elements
const eraIds = {}, placeIds = {};
eras.forEach((e,i)=>{ const id="era_"+e.toLowerCase(); el(id,{name:e,emoji:"🕰️",icon:"auto:"+id,tier:7,category:"concept",tags:["era","modifier"]}); eraIds[e]=id;
  combine(i%2? "time":"ancient", i%2? "city":"stone", id, null); });
places.forEach((p,i)=>{ const id="place_"+p.toLowerCase(); el(id,{name:p,emoji:"🏛️",icon:"auto:"+id,tier:8,category:"structure",tags:["place"]}); placeIds[p]=id;
  combine("city", i%2?"stone":"wall", id, null); });
for (const e of eras) for (const p of places) {
  const id = `${eraIds[e]}_${placeIds[p]}`;
  el(id,{name:`${e} ${p}`,emoji:"🏛️",icon:"auto:"+id,tier:10,category:"structure",tags:["place","era","themed"]});
  combine(eraIds[e], placeIds[p], id, null);
  eraCount++;
}
console.log("Era×place expansion added:", eraCount, "total:", elements.size);

/* ---- FIFTH-ORDER: MUSIC/TECHNO themed (nods to the user) ---- */
const genres = ["Techno","Schranz","Industrial","Acid","Hardcore","Ambient","Trance","Breakbeat"];
const sonics = ["Kick","Bass","Synth","Riff","Drop","Loop","Beat","Pad","Stab","Rave"];
el("sound", { name:"Sound", emoji:"🔊", icon:"sound", tier:5, category:"concept", tags:["sound"] });
combine("air","energy","sound",null);
el("music", { name:"Music", emoji:"🎵", icon:"music", tier:6, category:"concept", tags:["sound","art"] });
combine("sound","human","music",null);
const genreIds={}, sonicIds={};
genres.forEach((g,i)=>{const id="genre_"+g.toLowerCase();el(id,{name:g,emoji:"🎧",icon:"auto:"+id,tier:7,category:"concept",tags:["music","genre"]});genreIds[g]=id;combine("music", i%2?"energy":"electricity", id,null);});
sonics.forEach((s,i)=>{const id="sonic_"+s.toLowerCase();el(id,{name:s,emoji:"🥁",icon:"auto:"+id,tier:7,category:"concept",tags:["music","sound"]});sonicIds[s]=id;combine("music", i%2?"metal":"energy", id,null);});
let musicCount=0;
for (const g of genres) for (const s of sonics){const id=`${genreIds[g]}_${sonicIds[s]}`;el(id,{name:`${g} ${s}`,emoji:"🎶",icon:"auto:"+id,tier:9,category:"concept",tags:["music","themed"]});combine(genreIds[g],sonicIds[s],id,null);musicCount++;}
console.log("Music expansion added:", musicCount, "total:", elements.size);

/* ===========================================================================
   SIXTH-ORDER: SECOND MODIFIER PASS
   Take a curated subset of already-modified nouns and apply a SECOND modifier
   (e.g. "Frozen" + "Golden Dragon" -> "Frozen Golden Dragon"). Deterministic,
   capped, and only on "creature/object" categories so names stay sensible.
=========================================================================== */
const secondPassMods = ["frozen","molten","giant","golden","crystal","cursed","holy","ancient"];
// Only apply to creature/object compounds, and only those built from the
// curated themed seeds (sword/dragon/etc) — keeps names sensible & count sane.
const secondPassTargets = [...elements.values()].filter(e =>
  e.tags?.includes("crafted") &&
  (e.category === "life" || e.category === "object")
);
let secondCount = 0;
for (const modId of secondPassMods) {
  const modName = elements.get(modId).name;
  const modAdds = elements.get(modId).tags.filter(t => t !== "modifier");
  for (const target of secondPassTargets) {
    // skip if target already carries this modifier word to avoid "Golden Golden"
    if (target.name.startsWith(modName + " ")) continue;
    if (target.id.startsWith(modId + "_")) continue;
    const newId = `s2_${modId}_${target.id}`;
    if (elements.has(newId)) continue;
    el(newId, {
      name: `${modName} ${target.name}`,
      emoji: target.emoji, icon: "auto:" + newId,
      tier: target.tier + 1, category: target.category,
      tags: Array.from(new Set([...(target.tags||[]), ...modAdds, "twice"])),
      phys: null,
    });
    combine(modId, target.id, newId, null);
    secondCount++;
  }
}
console.log("Second-modifier expansion added:", secondCount, "total:", elements.size);

/* ===========================================================================
   SEVENTH-ORDER: PROFESSIONS, VEHICLES, MYTHOLOGY breadth packs
=========================================================================== */
function pack(seedA, seedB, baseTier, cat, list, emoji) {
  // ensure an anchor element exists
  let added = 0;
  for (const name of list) {
    const id = `${cat}_${name.toLowerCase().replace(/[^a-z0-9]+/g,"_")}`;
    if (elements.has(id)) continue;
    el(id, { name, emoji, icon: "auto:" + id, tier: baseTier, category: cat, tags: [cat] });
    combine(seedA, seedB, id, null);
    added++;
  }
  return added;
}
// professions (human + tool/concept)
const professions = ["Farmer","Smith","Baker","Miner","Sailor","Soldier","Doctor","Priest","Hunter","Builder","Merchant","Scholar","Alchemist","Engineer","Pilot","Captain","King","Queen","Witch","Bard"];
let seventh = 0;
// give each profession a unique-ish recipe by pairing human with a rotating partner
const profPartners = ["plant","metal","bread","stone","sea","sword_","life","holy","animal","wall","coin_","time","magic","engine_","plane","car","crown_","crown_","magic","music"];
professions.forEach((name,i)=>{
  const id = "prof_" + name.toLowerCase();
  el(id,{name,emoji:"🧑\u200d🔧",icon:"auto:"+id,tier:8,category:"life",tags:["human","profession"]});
  combine("human", profPartners[i % profPartners.length], id, null);
  seventh++;
});
// mythology creatures
const myth = ["Phoenix","Griffin","Unicorn","Hydra","Kraken","Golem","Vampire","Werewolf","Titan","Demon","Angel","Fairy","Goblin","Troll","Mermaid","Centaur","Minotaur","Cyclops","Sphinx","Basilisk"];
const mythPartners=["fire","eagle_","horse_","snake_","sea","clay","death","wolf_","giant","cursed","holy","flower","cave_","mountain_","fish","horse_","bull_","giant","desert_","snake_"];
// ensure partner seeds exist
["horse_","bull_","cave_"].forEach(s=>{ if(!elements.has(s)){el(s,{name:s.replace(/_$/,"").replace(/^\w/,c=>c.toUpperCase()),emoji:"🐎",icon:"auto:"+s,tier:6,category:"life",tags:["animal"]}); combine("animal", s==="cave_"?"mountain_":"wild", s, null);} });
myth.forEach((name,i)=>{
  const id="myth_"+name.toLowerCase();
  el(id,{name,emoji:"🐉",icon:"auto:"+id,tier:9,category:"life",tags:["creature","mythic"]});
  combine("magic", mythPartners[i % mythPartners.length], id, null);
  seventh++;
});
// vehicles
const vehicles=["Bicycle","Motorcycle","Truck","Bus","Train","Tram","Submarine","Yacht","Helicopter","Jet","Tank","Drone","Hovercraft","Tractor","Ambulance"];
const vehPartners=["wheel","wheel","car","car","metal","city","sea","sea","air","plane","steel","robotic","air","plant","house"];
vehicles.forEach((name,i)=>{
  const id="veh_"+name.toLowerCase();
  el(id,{name,emoji:"🚙",icon:"auto:"+id,tier:11,category:"machine",tags:["machine","vehicle"]});
  combine(vehPartners[i%vehPartners.length], i%2?"metal":"engine_", id, null);
  seventh++;
});
console.log("Breadth packs added:", seventh, "total:", elements.size);

/* ===========================================================================
   EIGHTH-ORDER: apply modifiers to the new themed sets (myth, vehicles, prof,
   places, genres) for another dense, sensible layer.
=========================================================================== */
const eighthMods = ["giant","tiny","golden","crystal","magic","cursed","holy","ancient","electric","robotic","frozen","molten","toxic","radiant","wild"];
const eighthTargets = [...elements.values()].filter(e =>
  /^myth_|^veh_|^prof_|^place_|^genre_|^sonic_/.test(e.id)
);
let eighth = 0;
for (const modId of eighthMods) {
  const modName = elements.get(modId).name;
  const modAdds = elements.get(modId).tags.filter(t=>t!=="modifier");
  for (const target of eighthTargets) {
    const newId = `m8_${modId}_${target.id}`;
    if (elements.has(newId)) continue;
    el(newId,{
      name:`${modName} ${target.name}`, emoji:target.emoji, icon:"auto:"+newId,
      tier: target.tier+1, category: target.category,
      tags: Array.from(new Set([...(target.tags||[]), ...modAdds, "compound"])),
      phys: null,
    });
    combine(modId, target.id, newId, null);
    eighth++;
  }
}
console.log("Themed-modifier expansion added:", eighth, "total:", elements.size);

/* ---------------------------------------------------------------------------
   VALIDATION + WRITE
--------------------------------------------------------------------------- */
// Ensure every recipe references existing elements
let bad = 0;
for (const [k, r] of recipes) {
  const [a, b] = k.split("|");
  if (!elements.has(a) || !elements.has(b) || !elements.has(r)) { bad++; }
}
if (bad) console.warn("WARNING: dangling recipes:", bad);

const out = {
  meta: {
    name: "Crucible",
    version: "0.1.0",
    generated: new Date().toISOString(),
    elementCount: elements.size,
    recipeCount: recipes.size,
  },
  elements: Object.fromEntries(elements),
  recipes: Object.fromEntries(recipes),       // "a|b" -> resultId
  firstPair: Object.fromEntries(recipeMeta),  // resultId -> {a,b}
};

const file = path.join(OUT_DIR, "elements.json");
fs.writeFileSync(file, JSON.stringify(out));
console.log("\n=== DONE ===");
console.log("Elements:", elements.size);
console.log("Recipes :", recipes.size);
console.log("Written :", file, "(", (fs.statSync(file).size/1024/1024).toFixed(2), "MB )");
