/* ============================================================================
   CRUCIBLE — Realistic Element & Recipe Library Generator (v2 — Realism Overhaul)
   ----------------------------------------------------------------------------
   Hand-authored, science-grounded crafting tree. NO procedural filler.
   ~700 real elements (chemistry / physics / geology / biology / materials)
   + ~150 meme/mythology elements (clearly flagged category:"meme").

   Goals:
     - Educational: every real element carries a MODERATE property schema
       (state, density, melt/boil/freeze °C, flammable, conductive, soluble,
        formula/symbol where applicable, short description).
     - Real recipes respect real chemistry where reasonable; fun > rigour.
     - Stable snake_case ids preserved for carryover so existing player saves
       keep their unlocked discoveries after this update.
     - 4 classical bases: water, fire, earth, air.

   Output: ../src/data/elements.json  ->  { meta, elements, recipes, firstPair }
   Schema per element:
     id, name, emoji, icon, tier, category, tags[], phys{...}|null, base, info
   phys (moderate schema):
     { state, density, temp, behavior, color,
       meltAt, boilAt, freezeAt,          // °C thresholds (engine uses these)
       freezeTo, boilTo, condenseTo, coolTo, meltTo,  // phase targets
       flammable, conductive, explosive, soluble, lifespan,
       symbol, formula }                  // chem identity where real
   Recipes: map "a|b" (sorted, "|" delim) -> resultId
============================================================================ */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildExpansion } from "./expansion.mjs";
import { buildExpansion2 } from "./expansion2.mjs";
import { buildExpansion3 } from "./expansion3.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "src", "data");
fs.mkdirSync(OUT_DIR, { recursive: true });

/* ---------------------------------------------------------------------------
   Registries + helpers
--------------------------------------------------------------------------- */
const elements = new Map();   // id -> element
const recipes = new Map();    // "a|b" (sorted) -> resultId
const recipeMeta = new Map(); // resultId -> {a,b} first discovery pair

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
    info: def.info || "",
  });
  return id;
}

const collisions = [];
function combine(a, b, resultId, resultDef) {
  if (!elements.has(resultId) && resultDef) el(resultId, resultDef);
  const k = key(a, b);
  if (!recipes.has(k)) {
    recipes.set(k, resultId);
    if (!recipeMeta.has(resultId)) recipeMeta.set(resultId, { a, b });
  } else if (recipes.get(k) !== resultId) {
    collisions.push(`${k} -> ${recipes.get(k)} (tried ${resultId})`);
  }
  return resultId;
}

// alias: define an element then a single recipe in one shot
function R(a, b, id, def) { return combine(a, b, id, def); }
// add an extra recipe pointing to an already-defined element
function alt(a, b, id) { return combine(a, b, id, null); }

/* ---------------------------------------------------------------------------
   PHYSICS PRESETS — sandbox behavior
   states: solid (static), powder (falls/piles), liquid (flows), gas (rises),
           energy (fire/spark/plasma)
--------------------------------------------------------------------------- */
const P = {
  powder: (o = {}) => ({ state: "powder", density: 5, behavior: "powder", ...o }),
  liquid: (o = {}) => ({ state: "liquid", density: 3, behavior: "water", ...o }),
  gas:    (o = {}) => ({ state: "gas", density: 0.5, behavior: "gas", ...o }),
  solid:  (o = {}) => ({ state: "solid", density: 9, behavior: "static", ...o }),
  energy: (o = {}) => ({ state: "energy", density: 0.2, behavior: "spark", ...o }),
};

/* ===========================================================================
   TIER 0 — THE FOUR CLASSICAL BASES + core abstract drivers
=========================================================================== */
el("water", { name: "Water", emoji: "💧", icon: "water", base: true, tier: 0, category: "liquid",
  tags: ["wet","liquid","extinguisher","solvent"],
  phys: P.liquid({ density: 1, temp: 20, freezeAt: 0, boilAt: 100, freezeTo: "ice", boilTo: "steam", behavior: "water", color: "#3ba7e0", conductive: false, soluble: true, formula: "H₂O" }),
  info: "Water (H₂O): the universal solvent. Freezes at 0 °C, boils at 100 °C." });
el("fire", { name: "Fire", emoji: "🔥", icon: "fire", base: true, tier: 0, category: "energy",
  tags: ["hot","energy","burns","oxidizer"],
  phys: P.energy({ temp: 800, behavior: "fire", lifespan: 80, color: "#ff7a18" }),
  info: "Fire: rapid oxidation releasing heat and light. Needs fuel, oxygen and heat." });
el("earth", { name: "Earth", emoji: "🪨", icon: "earth", base: true, tier: 0, category: "earth",
  tags: ["solid","ground","mineral"],
  phys: P.powder({ density: 1.5, behavior: "powder", color: "#7a5b3a", temp: 15 }),
  info: "Earth: loose mineral matter — the raw ground beneath us." });
el("air", { name: "Air", emoji: "🌬️", icon: "air", base: true, tier: 0, category: "gas",
  tags: ["gas","wind","breathable"],
  phys: P.gas({ density: 0.0012, behavior: "gas", color: "#dbeafe", temp: 20, formula: "N₂+O₂" }),
  info: "Air: ~78% nitrogen, 21% oxygen. The mixture we breathe." });

// Abstract drivers (not "scientific" but useful crafting reagents — kept tiny)
el("energy", { name: "Energy", emoji: "⚡", icon: "energy", tier: 1, category: "energy",
  tags: ["energy","charged","driver"],
  phys: P.energy({ behavior: "spark", temp: 300, lifespan: 30, color: "#ffd84a" }),
  info: "Energy: the capacity to do work — heat, light, motion, electricity." });
el("heat", { name: "Heat", emoji: "🌡️", icon: "heat", tier: 1, category: "energy",
  tags: ["hot","energy","driver"],
  phys: P.energy({ behavior: "spark", temp: 600, lifespan: 40, color: "#ff9d3a" }),
  info: "Heat: thermal energy transferred between bodies at different temperatures." });
el("pressure", { name: "Pressure", emoji: "🪨", icon: "pressure", tier: 1, category: "energy",
  tags: ["force","driver"],
  phys: null,
  info: "Pressure: force per unit area. Drives phase changes and rock metamorphism." });
el("time", { name: "Time", emoji: "⏳", icon: "time", tier: 1, category: "energy",
  tags: ["driver","aging"],
  phys: null,
  info: "Time: the dimension along which weathering, decay and growth unfold." });
el("life", { name: "Life", emoji: "🧬", icon: "life", tier: 6, category: "life",
  tags: ["organic","living","driver"],
  phys: null,
  info: "Life: self-organizing, self-replicating organic chemistry." });
el("electricity", { name: "Electricity", emoji: "🔌", icon: "electricity", tier: 3, category: "energy",
  tags: ["energy","charged","current"],
  phys: P.energy({ behavior: "spark", temp: 200, lifespan: 25, color: "#7cd6ff", conductive: true }),
  info: "Electricity: the flow of electric charge through a conductor." });

// Wind & sea (self-combine of bases) + driver bootstraps
R("air","air","wind", { name:"Wind", emoji:"💨", icon:"wind", tier:1, category:"weather",
  tags:["gas","moving","weather"], phys:P.gas({ density:0.0012, behavior:"gas", color:"#cfe8ff" }),
  info:"Wind: air in motion, driven by pressure differences." });
R("water","water","sea", { name:"Sea", emoji:"🌊", icon:"sea", tier:1, category:"liquid",
  tags:["wet","large","saline"], phys:P.liquid({ density:1.03, behavior:"water", color:"#1e6f9f", soluble:true }),
  info:"Sea: a vast body of salt water covering most of Earth." });

// DRIVER BOOTSTRAPS — each from a UNIQUE base/early pair so all are reachable.
// (Tier-1 'stone' = earth+earth is defined below; drivers avoid that key.)
combine("fire","air","energy");        // air feeds fire -> released energy
combine("fire","sea","heat");          // huge fire heating the sea -> heat driver
combine("wind","wind","pressure");     // moving air builds pressure
combine("earth","wind","time");        // weathering of exposed earth implies time
combine("energy","water","electricity"); // moving charge in water
combine("wind","sea","cold");          // cold sea wind

/* ===========================================================================
   TIER 1 — PRIMARY DERIVATIONS (classical element interactions)
=========================================================================== */
R("water","fire","steam", { name:"Steam", emoji:"♨️", icon:"steam", tier:1, category:"gas",
  tags:["gas","hot","wet","water-cycle"],
  phys:P.gas({ density:0.0006, behavior:"gas", temp:110, condenseTo:"water", color:"#e2e8f0", formula:"H₂O(g)" }),
  info:"Steam: water vapour above 100 °C. Condenses back to liquid water on cooling." });
R("earth","water","mud", { name:"Mud", emoji:"🟤", icon:"mud", tier:1, category:"earth",
  tags:["wet","earth","soft"], phys:P.powder({ density:1.8, behavior:"powder", color:"#5a4632" }),
  info:"Mud: water-saturated soil and clay." });
R("earth","fire","lava", { name:"Lava", emoji:"🌋", icon:"lava", tier:1, category:"geology",
  tags:["hot","molten","burns"],
  phys:P.liquid({ density:3, behavior:"lava", temp:1150, coolTo:"basalt", color:"#ff5a1f" }),
  info:"Lava: molten rock erupted at ~700–1200 °C. Cools into igneous rock." });
R("air","water","rain", { name:"Rain", emoji:"🌧️", icon:"rain", tier:1, category:"weather",
  tags:["wet","weather","water-cycle"], phys:P.liquid({ density:1, behavior:"water", color:"#5b9bd5" }),
  info:"Rain: liquid water droplets falling from clouds." });
R("earth","air","dust", { name:"Dust", emoji:"🌫️", icon:"dust", tier:1, category:"earth",
  tags:["dry","fine","powder"], phys:P.powder({ density:0.5, behavior:"powder", color:"#cbb994" }),
  info:"Dust: fine airborne mineral and organic particles." });
R("earth","earth","stone", { name:"Stone", emoji:"🪨", icon:"stone", tier:1, category:"geology",
  tags:["solid","mineral","building"], phys:P.solid({ density:2.7, behavior:"static", meltAt:1200, meltTo:"lava", color:"#8a8a8a" }),
  info:"Stone: consolidated rock. The foundation of tools and buildings." });

/* ===========================================================================
   TIER 2 — STATES OF MATTER & THE WATER CYCLE
=========================================================================== */
R("water","cold","ice", { name:"Ice", emoji:"🧊", icon:"ice", tier:2, category:"liquid",
  tags:["cold","solid","frozen","water-cycle"],
  phys:P.solid({ density:0.92, behavior:"static", temp:-5, meltAt:0, meltTo:"water", color:"#bfe9ff", formula:"H₂O(s)" }),
  info:"Ice: solid water below 0 °C. Less dense than liquid water, so it floats." });
el("cold", { name:"Cold", emoji:"❄️", icon:"cold", tier:1, category:"energy",
  tags:["cold","driver"], phys:P.energy({ behavior:"spark", temp:-30, lifespan:30, color:"#bfe9ff" }),
  info:"Cold: low thermal energy. The absence of heat." });
R("air","cold","frost", { name:"Frost", emoji:"🌨️", icon:"frost", tier:2, category:"weather",
  tags:["cold","frozen","weather"], phys:P.powder({ density:0.3, behavior:"powder", temp:-5, color:"#dff6ff" }),
  info:"Frost: ice crystals formed by direct deposition of water vapour." });
R("sea","air","mist", { name:"Mist", emoji:"🌁", icon:"mist", tier:2, category:"weather",
  tags:["wet","gas","weather"], phys:P.gas({ density:0.001, behavior:"gas", color:"#e8f1f7" }),
  info:"Mist: suspended water droplets near the ground; thin fog." });
R("mist","mist","fog", { name:"Fog", emoji:"🌫️", icon:"fog", tier:2, category:"weather",
  tags:["wet","gas","weather"], phys:P.gas({ density:0.001, behavior:"gas", color:"#dbe6ee" }),
  info:"Fog: a dense ground-level cloud of suspended water droplets." });
R("steam","cold","cloud", { name:"Cloud", emoji:"☁️", icon:"cloud", tier:2, category:"weather",
  tags:["wet","sky","water-cycle"], phys:P.gas({ density:0.0008, behavior:"gas", color:"#f4f8fb" }),
  info:"Cloud: condensed water droplets or ice crystals suspended in air." });
R("cloud","cold","snow", { name:"Snow", emoji:"❄️", icon:"snow", tier:2, category:"weather",
  tags:["cold","frozen","weather"], phys:P.powder({ density:0.3, behavior:"powder", temp:-3, meltAt:0, meltTo:"water", color:"#ffffff" }),
  info:"Snow: ice crystals that form in clouds and fall as snowflakes." });
R("cloud","ice","hail", { name:"Hail", emoji:"🌨️", icon:"hail", tier:2, category:"weather",
  tags:["cold","frozen","weather"], phys:P.powder({ density:0.9, behavior:"powder", temp:-2, color:"#cfeeff" }),
  info:"Hail: balls of layered ice formed in strong thunderstorm updrafts." });
R("cloud","electricity","lightning", { name:"Lightning", emoji:"⚡", icon:"lightning", tier:3, category:"weather",
  tags:["energy","plasma","weather"], phys:P.energy({ behavior:"spark", temp:30000, lifespan:8, color:"#fdf6b2" }),
  info:"Lightning: a plasma discharge reaching ~30,000 °C — hotter than the Sun's surface." });
R("rain","sun","rainbow", { name:"Rainbow", emoji:"🌈", icon:"rainbow", tier:3, category:"weather",
  tags:["light","optics","weather"], phys:null,
  info:"Rainbow: sunlight refracted and dispersed by raindrops into a spectrum." });
R("cloud","wind","storm", { name:"Storm", emoji:"⛈️", icon:"storm", tier:3, category:"weather",
  tags:["weather","violent"], phys:null,
  info:"Storm: a disturbed atmosphere with strong wind, rain and often lightning." });

/* ===========================================================================
   TIER 2 — LIGHT & THE SUN (optics / EM spectrum)
=========================================================================== */
R("fire","energy","light", { name:"Light", emoji:"💡", icon:"light", tier:2, category:"energy",
  tags:["light","em","wave"], phys:P.energy({ behavior:"spark", temp:0, lifespan:20, color:"#fff4c2" }),
  info:"Light: visible electromagnetic radiation, wavelengths ~400–700 nm." });
R("fire","sky","sun", { name:"Sun", emoji:"☀️", icon:"sun", tier:3, category:"space",
  tags:["star","hot","light"], phys:P.energy({ behavior:"fire", temp:5500, lifespan:9999, color:"#ffcf3a" }),
  info:"Sun: a G-type star, ~5,500 °C at its surface, fusing hydrogen into helium." });
R("air","light","sky", { name:"Sky", emoji:"🌌", icon:"sky", tier:2, category:"weather",
  tags:["air","scatter"], phys:null,
  info:"Sky: the atmosphere overhead; blue from Rayleigh scattering of sunlight." });
R("light","glass","laser", { name:"Laser", emoji:"🔦", icon:"laser", tier:6, category:"technology",
  tags:["light","coherent","tech"], phys:P.energy({ behavior:"spark", temp:0, lifespan:14, color:"#ff3b6b" }),
  info:"Laser: coherent, single-wavelength light amplified by stimulated emission." });
R("electricity","light","photon", { name:"Photon", emoji:"✨", icon:"photon", tier:4, category:"physics",
  tags:["light","quantum","particle"], phys:null,
  info:"Photon: the quantum (smallest packet) of electromagnetic energy." });

/* ===========================================================================
   TIER 2/3 — PERIODIC ELEMENTS (the building blocks of chemistry)
   Each carries symbol, real state, density, MP/BP and a short use.
=========================================================================== */
// Hydrogen & oxygen — split water, then recombine
R("water","electricity","hydrogen", { name:"Hydrogen", emoji:"🎈", icon:"hydrogen", tier:3, category:"chemical",
  tags:["element","gas","flammable","fuel"],
  phys:P.gas({ density:0.00009, behavior:"gas", flammable:true, explosive:true, boilAt:-253, color:"#cfe8ff", symbol:"H" }),
  info:"Hydrogen (H): the lightest, most abundant element. Highly flammable. BP −253 °C." });
R("air","electricity","oxygen", { name:"Oxygen", emoji:"🅾️", icon:"oxygen", tier:3, category:"chemical",
  tags:["element","gas","oxidizer"],
  phys:P.gas({ density:0.0013, behavior:"gas", boilAt:-183, color:"#bfe0ff", symbol:"O" }),
  info:"Oxygen (O₂): ~21% of air. Supports combustion and respiration. BP −183 °C." });
R("hydrogen","oxygen","water",null); // real synthesis (combustion of H₂)
R("air","pressure","nitrogen", { name:"Nitrogen", emoji:"🧊", icon:"nitrogen", tier:3, category:"chemical",
  tags:["element","gas","inert"],
  phys:P.gas({ density:0.00125, behavior:"gas", boilAt:-196, color:"#e6f0ff", symbol:"N" }),
  info:"Nitrogen (N₂): ~78% of air; inert. Liquid nitrogen boils at −196 °C." });
R("fire","stone","carbon", { name:"Carbon", emoji:"⚫", icon:"carbon", tier:3, category:"chemical",
  tags:["element","solid","fuel","life"],
  phys:P.powder({ density:2.2, behavior:"powder", flammable:true, color:"#2b2b2b", symbol:"C" }),
  info:"Carbon (C): backbone of all life. Forms graphite, diamond and millions of compounds." });
R("volcano","sun","sulfur", { name:"Sulfur", emoji:"🟡", icon:"sulfur", tier:4, category:"chemical",
  tags:["element","powder","yellow"],
  phys:P.powder({ density:2.07, behavior:"powder", flammable:true, meltAt:115, color:"#e3d11a", symbol:"S" }),
  info:"Sulfur (S): a brittle yellow nonmetal. Burns with a blue flame; melts at 115 °C." });
R("stone","pressure","phosphorus", { name:"Phosphorus", emoji:"🟠", icon:"phosphorus", tier:4, category:"chemical",
  tags:["element","powder","reactive"],
  phys:P.powder({ density:1.82, behavior:"powder", flammable:true, color:"#ff7a3c", symbol:"P" }),
  info:"Phosphorus (P): white phosphorus ignites in air. Essential to DNA and bone." });
R("stone","sun","silicon", { name:"Silicon", emoji:"🔲", icon:"silicon", tier:4, category:"chemical",
  tags:["element","metalloid","semiconductor"],
  phys:P.solid({ density:2.33, behavior:"static", meltAt:1414, color:"#6b7280", symbol:"Si", conductive:true }),
  info:"Silicon (Si): a metalloid and the heart of computer chips. MP 1,414 °C." });
R("salt","electricity","sodium", { name:"Sodium", emoji:"🧂", icon:"sodium", tier:4, category:"chemical",
  tags:["element","metal","reactive","alkali"],
  phys:P.solid({ density:0.97, behavior:"static", meltAt:98, flammable:true, color:"#d9d9e0", symbol:"Na", conductive:true }),
  info:"Sodium (Na): a soft alkali metal that reacts violently with water. MP 98 °C." });
R("salt","fire","chlorine", { name:"Chlorine", emoji:"🟢", icon:"chlorine", tier:4, category:"chemical",
  tags:["element","gas","toxic","halogen"],
  phys:P.gas({ density:0.003, behavior:"gas", boilAt:-34, color:"#b6e34a", symbol:"Cl" }),
  info:"Chlorine (Cl₂): a toxic green-yellow gas used to disinfect water." });
R("ash","water","potassium", { name:"Potassium", emoji:"🟣", icon:"potassium", tier:4, category:"chemical",
  tags:["element","metal","reactive","alkali"],
  phys:P.solid({ density:0.86, behavior:"static", meltAt:63, flammable:true, color:"#c9b8e8", symbol:"K", conductive:true }),
  info:"Potassium (K): an alkali metal that bursts into lilac flame on water. MP 63 °C." });
R("stone","electricity","calcium", { name:"Calcium", emoji:"🦴", icon:"calcium", tier:4, category:"chemical",
  tags:["element","metal","alkaline-earth"],
  phys:P.solid({ density:1.55, behavior:"static", meltAt:842, color:"#e8e4d8", symbol:"Ca", conductive:true }),
  info:"Calcium (Ca): builds bones, shells and limestone. MP 842 °C." });
R("stone","acid","aluminium", { name:"Aluminium", emoji:"🥫", icon:"aluminium", tier:4, category:"metal",
  tags:["element","metal","light"],
  phys:P.solid({ density:2.7, behavior:"static", meltAt:660, conductive:true, color:"#cfd4da", symbol:"Al" }),
  info:"Aluminium (Al): light, corrosion-resistant metal. MP 660 °C. Smelted by electrolysis." });
R("stone","heat","iron", { name:"Iron", emoji:"🛠️", icon:"iron", tier:4, category:"metal",
  tags:["element","metal","magnetic","ferrous"],
  phys:P.solid({ density:7.87, behavior:"static", meltAt:1538, conductive:true, color:"#9aa0a6", symbol:"Fe" }),
  info:"Iron (Fe): the most-used metal; ferromagnetic. MP 1,538 °C. Rusts in moist air." });
R("iron","heat","copper", { name:"Copper", emoji:"🟫", icon:"copper", tier:4, category:"metal",
  tags:["element","metal","conductive"],
  phys:P.solid({ density:8.96, behavior:"static", meltAt:1085, conductive:true, color:"#c87533", symbol:"Cu" }),
  info:"Copper (Cu): an excellent electrical conductor. MP 1,085 °C." });
R("copper","pressure","zinc", { name:"Zinc", emoji:"⚙️", icon:"zinc", tier:4, category:"metal",
  tags:["element","metal"],
  phys:P.solid({ density:7.14, behavior:"static", meltAt:420, conductive:true, color:"#b6bcc2", symbol:"Zn" }),
  info:"Zinc (Zn): used to galvanise steel against rust. MP 420 °C." });
R("stone","lead","tin", { name:"Tin", emoji:"🥫", icon:"tin", tier:4, category:"metal",
  tags:["element","metal","soft"],
  phys:P.solid({ density:7.31, behavior:"static", meltAt:232, conductive:true, color:"#cdd2d8", symbol:"Sn" }),
  info:"Tin (Sn): a soft, low-melting metal smelted from ore, used in solder and bronze. MP 232 °C." });
R("stone","time","lead", { name:"Lead", emoji:"🪫", icon:"lead", tier:4, category:"metal",
  tags:["element","metal","heavy","toxic"],
  phys:P.solid({ density:11.34, behavior:"static", meltAt:327, color:"#6b7178", symbol:"Pb", conductive:true }),
  info:"Lead (Pb): a heavy, soft, toxic metal once used in pipes and paint. MP 327 °C." });
R("stone","light","gold", { name:"Gold", emoji:"🥇", icon:"gold", tier:5, category:"metal",
  tags:["element","metal","precious","noble"],
  phys:P.solid({ density:19.3, behavior:"static", meltAt:1064, conductive:true, color:"#ffd34d", symbol:"Au" }),
  info:"Gold (Au): a dense, unreactive precious metal. MP 1,064 °C." });
R("gold","cold","silver", { name:"Silver", emoji:"🥈", icon:"silver", tier:5, category:"metal",
  tags:["element","metal","precious"],
  phys:P.solid({ density:10.49, behavior:"static", meltAt:962, conductive:true, color:"#dfe3e6", symbol:"Ag" }),
  info:"Silver (Ag): the best electrical conductor of all metals. MP 962 °C." });
R("iron","time","nickel", { name:"Nickel", emoji:"🪙", icon:"nickel", tier:4, category:"metal",
  tags:["element","metal","magnetic"],
  phys:P.solid({ density:8.9, behavior:"static", meltAt:1455, conductive:true, color:"#b8bcc0", symbol:"Ni" }),
  info:"Nickel (Ni): a ferromagnetic metal used in coins and stainless steel. MP 1,455 °C." });
R("light","gas","helium", { name:"Helium", emoji:"🎈", icon:"helium", tier:4, category:"chemical",
  tags:["element","gas","inert","noble"],
  phys:P.gas({ density:0.00018, behavior:"gas", boilAt:-269, color:"#fff0c2", symbol:"He" }),
  info:"Helium (He): an inert noble gas, lighter than air. BP −269 °C, near absolute zero." });
el("gas", { name:"Gas", emoji:"💨", icon:"gas", tier:2, category:"chemical",
  tags:["gas","fuel"], phys:P.gas({ density:0.0008, behavior:"gas", flammable:true, color:"#e7eef7" }),
  info:"Gas: a generic combustible gaseous fuel." });
R("oil","heat","gas",null);

R("iron","gold","mercury", { name:"Mercury", emoji:"🌡️", icon:"mercury", tier:5, category:"metal",
  tags:["element","metal","liquid","toxic"],
  phys:P.liquid({ density:13.5, behavior:"water", freezeAt:-39, boilAt:357, color:"#c0c4c8", symbol:"Hg", conductive:true }),
  info:"Mercury (Hg): the only metal liquid at room temperature. Toxic. BP 357 °C." });
R("iron","life","cobalt", { name:"Cobalt", emoji:"🔵", icon:"cobalt", tier:5, category:"metal",
  tags:["element","metal","magnetic","blue"],
  phys:P.solid({ density:8.9, behavior:"static", meltAt:1495, conductive:true, color:"#3b5bdb", symbol:"Co" }),
  info:"Cobalt (Co): a ferromagnetic metal; its salts give glass a deep blue." });
R("stone","laser","neodymium", { name:"Neodymium", emoji:"🧲", icon:"neodymium", tier:6, category:"metal",
  tags:["element","metal","magnetic","rare-earth"],
  phys:P.solid({ density:7.0, behavior:"static", meltAt:1024, conductive:true, color:"#9ca3af", symbol:"Nd" }),
  info:"Neodymium (Nd): a rare-earth metal making the strongest permanent magnets." });
R("stone","radiation","uranium", { name:"Uranium", emoji:"☢️", icon:"uranium", tier:8, category:"chemical",
  tags:["element","metal","radioactive","heavy"],
  phys:P.solid({ density:19.1, behavior:"static", meltAt:1132, color:"#5ee06b", symbol:"U" }),
  info:"Uranium (U): a dense radioactive metal; fuel for nuclear fission. MP 1,132 °C." });
R("uranium","time","plutonium", { name:"Plutonium", emoji:"☢️", icon:"plutonium", tier:9, category:"chemical",
  tags:["element","metal","radioactive"],
  phys:P.solid({ density:19.8, behavior:"static", meltAt:640, color:"#7dd87d", symbol:"Pu" }),
  info:"Plutonium (Pu): a synthetic radioactive metal used in reactors and weapons." });

/* ===========================================================================
   TIER 3/4 — SIMPLE COMPOUNDS (real chemistry, balanced where noted)
=========================================================================== */
R("sodium","chlorine","salt", { name:"Salt", emoji:"🧂", icon:"salt", tier:4, category:"chemical",
  tags:["compound","crystal","soluble","mineral"],
  phys:P.powder({ density:2.16, behavior:"powder", soluble:true, meltAt:801, color:"#f4f4f6", formula:"NaCl" }),
  info:"Table salt (NaCl): an ionic crystal. 2Na + Cl₂ → 2NaCl. Melts at 801 °C." });
// also obtainable simply from sea/water early-game
R("sea","sun","salt",null);
R("carbon","oxygen","carbon_dioxide", { name:"Carbon Dioxide", emoji:"🫧", icon:"co2", tier:4, category:"chemical",
  tags:["compound","gas","greenhouse"],
  phys:P.gas({ density:0.0019, behavior:"gas", color:"#dfe7ee", formula:"CO₂" }),
  info:"Carbon dioxide (CO₂): C + O₂ → CO₂. A greenhouse gas exhaled by animals." });
R("carbon","heat","carbon_monoxide", { name:"Carbon Monoxide", emoji:"☠️", icon:"co", tier:5, category:"chemical",
  tags:["compound","gas","toxic"],
  phys:P.gas({ density:0.00125, behavior:"gas", flammable:true, color:"#cdd6df", formula:"CO" }),
  info:"Carbon monoxide (CO): a colourless, odourless, deadly gas from incomplete burning." });
R("hydrogen","carbon","methane", { name:"Methane", emoji:"💨", icon:"methane", tier:5, category:"chemical",
  tags:["compound","gas","fuel","flammable"],
  phys:P.gas({ density:0.00067, behavior:"gas", flammable:true, explosive:true, boilAt:-161, color:"#d7f0d0", formula:"CH₄" }),
  info:"Methane (CH₄): C + 2H₂ → CH₄. The main component of natural gas." });
R("hydrogen","nitrogen","ammonia", { name:"Ammonia", emoji:"🧴", icon:"ammonia", tier:5, category:"chemical",
  tags:["compound","gas","base","pungent"],
  phys:P.gas({ density:0.00073, behavior:"gas", soluble:true, boilAt:-33, color:"#e3f0ff", formula:"NH₃" }),
  info:"Ammonia (NH₃): N₂ + 3H₂ → 2NH₃ (Haber process). Basis of fertiliser." });
R("hydrogen","chlorine","hydrochloric_acid", { name:"Hydrochloric Acid", emoji:"🧪", icon:"hcl", tier:5, category:"chemical",
  tags:["compound","acid","corrosive","liquid"],
  phys:P.liquid({ density:1.2, behavior:"acid", soluble:true, color:"#eafff0", formula:"HCl" }),
  info:"Hydrochloric acid (HCl): a strong acid. H₂ + Cl₂ → 2HCl. Found in stomach acid." });
R("sulfur","water","sulfuric_acid", { name:"Sulfuric Acid", emoji:"⚗️", icon:"h2so4", tier:6, category:"chemical",
  tags:["compound","acid","corrosive","liquid"],
  phys:P.liquid({ density:1.84, behavior:"acid", soluble:true, color:"#fff7d6", formula:"H₂SO₄" }),
  info:"Sulfuric acid (H₂SO₄): the most-produced industrial chemical. Made via the contact process." });
R("sodium","water","sodium_hydroxide", { name:"Sodium Hydroxide", emoji:"🧼", icon:"naoh", tier:6, category:"chemical",
  tags:["compound","base","caustic","soluble"],
  phys:P.powder({ density:2.13, behavior:"powder", soluble:true, meltAt:318, color:"#f0f0f0", formula:"NaOH" }),
  info:"Sodium hydroxide (NaOH): caustic soda. Made by electrolysis of brine. Used in soap." });
R("calcium","carbon_dioxide","limestone", { name:"Limestone", emoji:"🪨", icon:"limestone", tier:5, category:"geology",
  tags:["rock","sedimentary","mineral"],
  phys:P.solid({ density:2.7, behavior:"static", color:"#d8d2c0", formula:"CaCO₃" }),
  info:"Limestone (CaCO₃): a sedimentary rock of compressed shells and coral." });
R("limestone","heat","quicklime", { name:"Quicklime", emoji:"⚪", icon:"quicklime", tier:6, category:"chemical",
  tags:["compound","caustic","cement"],
  phys:P.powder({ density:3.34, behavior:"powder", color:"#f2efe6", formula:"CaO" }),
  info:"Quicklime (CaO): CaCO₃ → CaO + CO₂ when limestone is heated. Used to make cement." });
R("quicklime","water","cement", { name:"Cement", emoji:"🪣", icon:"cement", tier:6, category:"materials",
  tags:["material","building","powder"],
  phys:P.powder({ density:1.4, behavior:"powder", color:"#b7b7ad" }),
  info:"Cement: a binder that hardens with water; the glue of concrete." });

/* ===========================================================================
   TIER 2/3 — GEOLOGY (rock cycle, minerals, soils)
=========================================================================== */
R("lava","water","basalt", { name:"Basalt", emoji:"⬛", icon:"basalt", tier:3, category:"geology",
  tags:["rock","igneous","mineral"],
  phys:P.solid({ density:3, behavior:"static", color:"#3a3a40", meltAt:1200, meltTo:"lava" }),
  info:"Basalt: a dark, fine-grained igneous rock; the most common volcanic rock." });
R("lava","time","granite", { name:"Granite", emoji:"🪨", icon:"granite", tier:3, category:"geology",
  tags:["rock","igneous","mineral","building"],
  phys:P.solid({ density:2.75, behavior:"static", color:"#b0a0a0", meltAt:1260, meltTo:"lava" }),
  info:"Granite: a coarse, intrusive igneous rock of quartz and feldspar." });
R("stone","water","sand", { name:"Sand", emoji:"🏖️", icon:"sand", tier:2, category:"geology",
  tags:["powder","grain","silica"],
  phys:P.powder({ density:1.6, behavior:"powder", meltAt:1700, meltTo:"glass", color:"#e3c98a", formula:"SiO₂" }),
  info:"Sand: weathered rock grains, mostly quartz (SiO₂). Melts into glass at ~1,700 °C." });
R("sand","water","clay", { name:"Clay", emoji:"🟫", icon:"clay", tier:3, category:"geology",
  tags:["powder","earth","ceramic"],
  phys:P.powder({ density:1.7, behavior:"powder", color:"#b07a4f" }),
  info:"Clay: fine weathered mineral particles; plastic when wet, hard when fired." });
R("sand","pressure","sandstone", { name:"Sandstone", emoji:"🧱", icon:"sandstone", tier:4, category:"geology",
  tags:["rock","sedimentary"],
  phys:P.solid({ density:2.3, behavior:"static", color:"#d4a96a" }),
  info:"Sandstone: sedimentary rock formed from cemented sand grains." });
R("limestone","pressure","marble", { name:"Marble", emoji:"🏛️", icon:"marble", tier:5, category:"geology",
  tags:["rock","metamorphic","building"],
  phys:P.solid({ density:2.7, behavior:"static", color:"#f0ece4" }),
  info:"Marble: metamorphosed limestone, prized by sculptors." });
R("clay","pressure","slate", { name:"Slate", emoji:"⬛", icon:"slate", tier:5, category:"geology",
  tags:["rock","metamorphic"],
  phys:P.solid({ density:2.8, behavior:"static", color:"#4a4f57" }),
  info:"Slate: a fine metamorphic rock that splits into flat sheets for roofing." });
R("carbon","pressure","diamond", { name:"Diamond", emoji:"💎", icon:"diamond", tier:7, category:"geology",
  tags:["mineral","gem","hard","carbon"],
  phys:P.solid({ density:3.5, behavior:"static", color:"#bfefff", formula:"C" }),
  info:"Diamond: pure carbon crystallised under extreme pressure — the hardest natural material." });
R("carbon","electricity","graphite", { name:"Graphite", emoji:"✏️", icon:"graphite", tier:5, category:"materials",
  tags:["mineral","carbon","conductive"],
  phys:P.solid({ density:2.2, behavior:"static", conductive:true, color:"#2f3439", formula:"C" }),
  info:"Graphite: soft, layered carbon that conducts electricity — pencil 'lead'." });
R("silicon","oxygen","quartz", { name:"Quartz", emoji:"🔮", icon:"quartz", tier:5, category:"geology",
  tags:["mineral","crystal","silica"],
  phys:P.solid({ density:2.65, behavior:"static", color:"#e6e1f5", formula:"SiO₂" }),
  info:"Quartz: crystalline silicon dioxide; piezoelectric and used in watches." });
R("aluminium","oxygen","ruby", { name:"Ruby", emoji:"❤️", icon:"ruby", tier:6, category:"geology",
  tags:["mineral","gem","red"],
  phys:P.solid({ density:4, behavior:"static", color:"#e0115f", formula:"Al₂O₃" }),
  info:"Ruby: corundum (Al₂O₃) coloured red by traces of chromium." });
R("carbon","life","coal", { name:"Coal", emoji:"🪨", icon:"coal", tier:4, category:"geology",
  tags:["rock","fuel","fossil","flammable"],
  phys:P.powder({ density:1.3, behavior:"powder", flammable:true, color:"#1f1f22" }),
  info:"Coal: a fossil fuel formed from ancient compressed plant matter." });
R("coal","pressure","oil", { name:"Oil", emoji:"🛢️", icon:"oil", tier:5, category:"geology",
  tags:["liquid","fuel","fossil","flammable"],
  phys:P.liquid({ density:0.88, behavior:"water", flammable:true, color:"#2a241c" }),
  info:"Crude oil: a liquid fossil fuel from ancient marine organisms." });
R("oil","fire","gasoline", { name:"Gasoline", emoji:"⛽", icon:"gasoline", tier:6, category:"materials",
  tags:["liquid","fuel","flammable"],
  phys:P.liquid({ density:0.74, behavior:"water", flammable:true, explosive:true, color:"#e8d27a" }),
  info:"Gasoline: a volatile fuel distilled from crude oil for engines." });
R("earth","life","soil", { name:"Soil", emoji:"🟫", icon:"soil", tier:3, category:"geology",
  tags:["earth","fertile","powder"],
  phys:P.powder({ density:1.3, behavior:"powder", color:"#5b4029" }),
  info:"Soil: weathered minerals mixed with organic matter; supports plant life." });
R("stone","stone","gravel", { name:"Gravel", emoji:"🪨", icon:"gravel", tier:2, category:"geology",
  tags:["powder","rock"],
  phys:P.powder({ density:1.7, behavior:"powder", color:"#8d8d8d" }),
  info:"Gravel: loose fragments of rock, larger than sand." });
R("fire","tree","ash", { name:"Ash", emoji:"🌋", icon:"ash", tier:2, category:"materials",
  tags:["powder","residue"],
  phys:P.powder({ density:0.6, behavior:"powder", color:"#9a9a96" }),
  info:"Ash: the mineral residue left after combustion." });
R("fire","wood","charcoal", { name:"Charcoal", emoji:"🪵", icon:"charcoal", tier:3, category:"materials",
  tags:["powder","fuel","carbon","flammable"],
  phys:P.powder({ density:0.5, behavior:"powder", flammable:true, color:"#2a2a2a" }),
  info:"Charcoal: carbon-rich fuel from heating wood without oxygen." });

/* ===========================================================================
   TIER 4/5 — METALS, ALLOYS & MATERIALS
=========================================================================== */
R("iron","oxygen","rust", { name:"Rust", emoji:"🟤", icon:"rust", tier:5, category:"chemical",
  tags:["compound","corrosion","iron"],
  phys:P.powder({ density:5.2, behavior:"powder", color:"#a8451f", formula:"Fe₂O₃" }),
  info:"Rust (Fe₂O₃): iron oxidised by water and oxygen over time." });
alt("rust","time","rust"); // weathering loop hint
R("iron","carbon","steel", { name:"Steel", emoji:"🔩", icon:"steel", tier:5, category:"metal",
  tags:["alloy","metal","strong","building"],
  phys:P.solid({ density:7.85, behavior:"static", meltAt:1425, conductive:true, color:"#aab0b6" }),
  info:"Steel: iron alloyed with ~0.2–2% carbon — far stronger than pure iron." });
R("steel","nickel","stainless_steel", { name:"Stainless Steel", emoji:"🍴", icon:"stainless", tier:6, category:"metal",
  tags:["alloy","metal","rustproof"],
  phys:P.solid({ density:7.9, behavior:"static", meltAt:1450, conductive:true, color:"#c4c9ce" }),
  info:"Stainless steel: steel with chromium and nickel that resists corrosion." });
R("copper","tin","bronze", { name:"Bronze", emoji:"🛡️", icon:"bronze", tier:5, category:"metal",
  tags:["alloy","metal"],
  phys:P.solid({ density:8.8, behavior:"static", meltAt:950, conductive:true, color:"#b8732e" }),
  info:"Bronze: copper + tin. The defining alloy of the Bronze Age." });
R("copper","zinc","brass", { name:"Brass", emoji:"🎺", icon:"brass", tier:5, category:"metal",
  tags:["alloy","metal"],
  phys:P.solid({ density:8.5, behavior:"static", meltAt:930, conductive:true, color:"#d4a72c" }),
  info:"Brass: copper + zinc. Bright, corrosion-resistant, used for instruments." });
R("sand","fire","glass", { name:"Glass", emoji:"🪟", icon:"glass", tier:4, category:"materials",
  tags:["material","transparent","brittle"],
  phys:P.solid({ density:2.5, behavior:"static", meltAt:1400, color:"#cfeefc" }),
  info:"Glass: silica sand melted at ~1,700 °C and cooled without crystallising." });
R("clay","fire","ceramic", { name:"Ceramic", emoji:"🏺", icon:"ceramic", tier:4, category:"materials",
  tags:["material","fired","brittle"],
  phys:P.solid({ density:2.3, behavior:"static", color:"#d8946a" }),
  info:"Ceramic: clay hardened by firing in a kiln. Pottery, tiles, porcelain." });
R("clay","sun","brick", { name:"Brick", emoji:"🧱", icon:"brick", tier:4, category:"materials",
  tags:["material","building"],
  phys:P.solid({ density:1.9, behavior:"static", color:"#b5532f" }),
  info:"Brick: a moulded clay block, sun-dried or kiln-fired for building." });
R("cement","gravel","concrete", { name:"Concrete", emoji:"🧱", icon:"concrete", tier:6, category:"materials",
  tags:["material","building","strong"],
  phys:P.solid({ density:2.4, behavior:"static", color:"#9a9a92" }),
  info:"Concrete: cement + sand + gravel + water — the world's most-used building material." });
R("oil","pressure","plastic", { name:"Plastic", emoji:"🧴", icon:"plastic", tier:6, category:"materials",
  tags:["material","polymer","synthetic"],
  phys:P.solid({ density:1.0, behavior:"static", flammable:true, meltAt:150, color:"#5fb0e8" }),
  info:"Plastic: synthetic polymers refined from oil; cheap, durable, mouldable." });
R("plastic","plastic","rubber", { name:"Rubber", emoji:"🛞", icon:"rubber", tier:6, category:"materials",
  tags:["material","elastic","polymer"],
  phys:P.solid({ density:1.1, behavior:"static", flammable:true, color:"#2b2b2b" }),
  info:"Rubber: an elastic polymer, natural (latex) or synthetic." });
R("silicon","fire","silicon_chip", { name:"Silicon Chip", emoji:"🔌", icon:"chip", tier:7, category:"technology",
  tags:["tech","semiconductor","electronic"],
  phys:P.solid({ density:2.3, behavior:"static", conductive:true, color:"#2f6f4f" }),
  info:"Silicon chip: a wafer of doped silicon etched with millions of transistors." });
R("carbon","carbon","graphene", { name:"Graphene", emoji:"🕸️", icon:"graphene", tier:8, category:"materials",
  tags:["material","carbon","strong","conductive"],
  phys:P.solid({ density:2.27, behavior:"static", conductive:true, color:"#3b4148" }),
  info:"Graphene: a one-atom-thick sheet of carbon — ultra-strong and conductive." });

/* ===========================================================================
   TIER 1/2 — EARLY HUMAN CHEMISTRY (intuitive fun chains)
=========================================================================== */
R("sun","clay","brick",null);
R("water","earth","mud",null);
R("plant","time","wood", { name:"Wood", emoji:"🪵", icon:"wood", tier:3, category:"life",
  tags:["organic","fuel","building","flammable"],
  phys:P.solid({ density:0.7, behavior:"static", flammable:true, color:"#8a5a2b" }),
  info:"Wood: the fibrous structural tissue of trees; fuel and building material." });
// (wood feeds fire — handled in engine, not a recipe)
R("salt","water","brine", { name:"Brine", emoji:"🧂", icon:"brine", tier:3, category:"chemical",
  tags:["liquid","saline","soluble"],
  phys:P.liquid({ density:1.2, behavior:"water", soluble:true, color:"#a7d8e8" }),
  info:"Brine: highly concentrated salt water; electrolysed to make chlorine and NaOH." });

/* ===========================================================================
   TIER 5/6 — ORIGIN OF LIFE & BIOLOGY
=========================================================================== */
R("methane","lightning","amino_acid", { name:"Amino Acid", emoji:"🧬", icon:"amino", tier:6, category:"life",
  tags:["organic","biomolecule","life"],
  phys:P.solid({ density:1.4, behavior:"static", soluble:true, color:"#7ad17a" }),
  info:"Amino acids: the Miller–Urey experiment made these from methane, ammonia and sparks." });
R("amino_acid","amino_acid","protein", { name:"Protein", emoji:"🥩", icon:"protein", tier:7, category:"life",
  tags:["organic","biomolecule","life"],
  phys:P.solid({ density:1.3, behavior:"static", color:"#d98a8a" }),
  info:"Protein: long chains of amino acids that fold into life's molecular machines." });
R("amino_acid","time","cell", { name:"Cell", emoji:"🦠", icon:"cell", tier:7, category:"life",
  tags:["organic","living","life"],
  phys:null,
  info:"Cell: the smallest unit of life, bounded by a membrane." });
R("cell","water","bacteria", { name:"Bacteria", emoji:"🦠", icon:"bacteria", tier:7, category:"life",
  tags:["organic","microbe","living"],
  phys:null,
  info:"Bacteria: single-celled microbes, among the first life on Earth." });
R("cell","cell","algae", { name:"Algae", emoji:"🟢", icon:"algae", tier:7, category:"life",
  tags:["organic","plant","living","photosynthetic"],
  phys:P.liquid({ density:1, behavior:"water", color:"#3fa34d" }),
  info:"Algae: simple photosynthetic organisms; early oxygen producers." });
R("algae","sun","oxygen",null); // photosynthesis
R("cell","sun","life",null);
R("life","soil","plant", { name:"Plant", emoji:"🌱", icon:"plant", tier:6, category:"life",
  tags:["organic","living","photosynthetic","plant"],
  phys:P.solid({ density:0.6, behavior:"plant", flammable:true, color:"#4caf50" }),
  info:"Plant: a multicellular organism that turns sunlight into sugar." });
R("plant","sun","tree", { name:"Tree", emoji:"🌳", icon:"tree", tier:7, category:"life",
  tags:["organic","living","plant","large"],
  phys:P.solid({ density:0.7, behavior:"plant", flammable:true, color:"#2e7d32" }),
  info:"Tree: a tall woody plant; forests are Earth's lungs." });
R("plant","water","flower", { name:"Flower", emoji:"🌸", icon:"flower", tier:7, category:"life",
  tags:["organic","living","plant"],
  phys:P.solid({ density:0.5, behavior:"plant", color:"#ec9bd0" }),
  info:"Flower: the reproductive structure of flowering plants." });
R("flower","time","seed", { name:"Seed", emoji:"🌰", icon:"seed", tier:6, category:"life",
  tags:["organic","plant"],
  phys:P.powder({ density:0.9, behavior:"powder", color:"#9c6b3f" }),
  info:"Seed: an embryonic plant packaged with a food store." });
R("life","sea","fish", { name:"Fish", emoji:"🐟", icon:"fish", tier:8, category:"life",
  tags:["organic","animal","living"],
  phys:null,
  info:"Fish: aquatic vertebrates; the first animals with backbones." });
R("fish","land","amphibian", { name:"Amphibian", emoji:"🐸", icon:"amphibian", tier:8, category:"life",
  tags:["organic","animal"],
  phys:null,
  info:"Amphibian: vertebrates that bridge water and land, like frogs." });
R("amphibian","time","reptile", { name:"Reptile", emoji:"🦎", icon:"reptile", tier:8, category:"life",
  tags:["organic","animal"],
  phys:null,
  info:"Reptile: scaly, egg-laying vertebrates such as lizards and snakes." });
R("reptile","time","dinosaur", { name:"Dinosaur", emoji:"🦕", icon:"dinosaur", tier:9, category:"life",
  tags:["organic","animal","extinct"],
  phys:null,
  info:"Dinosaur: dominant land reptiles of the Mesozoic, ancestors of birds." });
R("reptile","air","bird", { name:"Bird", emoji:"🐦", icon:"bird", tier:9, category:"life",
  tags:["organic","animal","flying"],
  phys:null,
  info:"Bird: feathered, warm-blooded descendants of theropod dinosaurs." });
R("reptile","life","mammal", { name:"Mammal", emoji:"🐾", icon:"mammal", tier:9, category:"life",
  tags:["organic","animal","warm-blooded"],
  phys:null,
  info:"Mammal: warm-blooded vertebrates with hair that nurse their young." });
R("mammal","time","human", { name:"Human", emoji:"🧑", icon:"human", tier:10, category:"life",
  tags:["organic","animal","intelligent"],
  phys:null,
  info:"Human (Homo sapiens): a tool-making, language-using primate." });
R("dinosaur","time","fossil", { name:"Fossil", emoji:"🦴", icon:"fossil", tier:9, category:"geology",
  tags:["mineral","ancient"],
  phys:P.solid({ density:2.5, behavior:"static", color:"#c9b48a" }),
  info:"Fossil: mineralised remains of ancient life preserved in rock." });

/* ===========================================================================
   TIER 5/6 — FOOD CHEMISTRY (fun but grounded)
=========================================================================== */
R("fruit","heat","sugar", { name:"Sugar", emoji:"🍬", icon:"sugar", tier:5, category:"life",
  tags:["organic","food","soluble","crystal"],
  phys:P.powder({ density:1.59, behavior:"powder", soluble:true, flammable:true, meltAt:186, color:"#f6f1e7", formula:"C₁₂H₂₂O₁₁" }),
  info:"Sugar (sucrose): a sweet carbohydrate. Caramelises at ~186 °C." });
R("sugar","yeast","alcohol", { name:"Alcohol", emoji:"🍺", icon:"alcohol", tier:6, category:"chemical",
  tags:["compound","liquid","flammable","food"],
  phys:P.liquid({ density:0.79, behavior:"water", flammable:true, boilAt:78, color:"#f0e6c0", formula:"C₂H₅OH" }),
  info:"Ethanol (C₂H₅OH): made by fermenting sugar with yeast. Boils at 78 °C." });
R("alcohol","air","vinegar", { name:"Vinegar", emoji:"🧪", icon:"vinegar", tier:6, category:"chemical",
  tags:["compound","acid","liquid","food"],
  phys:P.liquid({ density:1.01, behavior:"acid", soluble:true, color:"#f2e6b0", formula:"CH₃COOH" }),
  info:"Vinegar (acetic acid): ethanol oxidised by bacteria into a mild acid." });
R("life","sugar","yeast", { name:"Yeast", emoji:"🫧", icon:"yeast", tier:6, category:"life",
  tags:["organic","fungus","living"],
  phys:P.powder({ density:1.1, behavior:"powder", color:"#e3cf9a" }),
  info:"Yeast: a fungus that ferments sugar into alcohol and CO₂." });
R("flour","water","dough", { name:"Dough", emoji:"🥟", icon:"dough", tier:6, category:"life",
  tags:["organic","food"],
  phys:P.powder({ density:1.1, behavior:"powder", color:"#ecdcae" }),
  info:"Dough: flour and water kneaded together — the base of bread." });
R("seed","stone","flour", { name:"Flour", emoji:"🌾", icon:"flour", tier:6, category:"life",
  tags:["organic","food","powder"],
  phys:P.powder({ density:0.6, behavior:"powder", flammable:true, color:"#f3ecd9" }),
  info:"Flour: ground cereal grain, the staple of baking." });
R("dough","fire","bread", { name:"Bread", emoji:"🍞", icon:"bread", tier:7, category:"life",
  tags:["organic","food"],
  phys:P.solid({ density:0.4, behavior:"static", flammable:true, color:"#c89b5a" }),
  info:"Bread: leavened dough baked into a staple food." });
R("milk","time","cheese", { name:"Cheese", emoji:"🧀", icon:"cheese", tier:7, category:"life",
  tags:["organic","food"],
  phys:P.solid({ density:1.1, behavior:"static", color:"#f1c93b" }),
  info:"Cheese: milk curdled and aged by bacteria and enzymes." });
R("mammal","life","milk", { name:"Milk", emoji:"🥛", icon:"milk", tier:8, category:"life",
  tags:["organic","food","liquid"],
  phys:P.liquid({ density:1.03, behavior:"water", color:"#f7f5ef" }),
  info:"Milk: a nutrient-rich fluid mammals produce to feed their young." });
R("sugar","milk","chocolate", { name:"Chocolate", emoji:"🍫", icon:"chocolate", tier:8, category:"life",
  tags:["organic","food"],
  phys:P.solid({ density:1.3, behavior:"static", meltAt:34, color:"#5a3417" }),
  info:"Chocolate: cocoa, sugar and milk; melts near body temperature (~34 °C)." });
R("water","sugar","syrup", { name:"Syrup", emoji:"🍯", icon:"syrup", tier:6, category:"life",
  tags:["organic","food","liquid","soluble"],
  phys:P.liquid({ density:1.37, behavior:"water", soluble:true, color:"#c98a2b" }),
  info:"Syrup: a thick, concentrated sugar solution." });
R("fruit","sugar","jam", { name:"Jam", emoji:"🍓", icon:"jam", tier:7, category:"life",
  tags:["organic","food"],
  phys:P.liquid({ density:1.3, behavior:"water", color:"#c0264a" }),
  info:"Jam: fruit boiled with sugar until it sets." });
R("flower","sun","fruit", { name:"Fruit", emoji:"🍎", icon:"fruit", tier:7, category:"life",
  tags:["organic","food"],
  phys:P.solid({ density:0.9, behavior:"static", color:"#e23b3b" }),
  info:"Fruit: the seed-bearing structure of a flowering plant." });

/* ===========================================================================
   TIER 5/6 — PHYSICS & ELECTRICITY
=========================================================================== */
R("copper","electricity","wire", { name:"Wire", emoji:"🔌", icon:"wire", tier:5, category:"technology",
  tags:["tech","conductive","metal"],
  phys:P.solid({ density:8.9, behavior:"static", conductive:true, color:"#c87533" }),
  info:"Wire: a drawn metal strand that carries electric current." });
R("iron","copper","magnet", { name:"Magnet", emoji:"🧲", icon:"magnet", tier:5, category:"physics",
  tags:["magnetic","iron","physics"],
  phys:P.solid({ density:7.5, behavior:"static", conductive:true, color:"#b22222" }),
  info:"Magnet: a material with a persistent magnetic field; iron, nickel and cobalt are ferromagnetic." });
R("magnet","wire","generator", { name:"Generator", emoji:"🔋", icon:"generator", tier:7, category:"technology",
  tags:["tech","power","machine"],
  phys:P.solid({ density:5, behavior:"static", conductive:true, color:"#3d6b8c" }),
  info:"Generator: spins a magnet past coils to induce electricity (Faraday's law)." });
R("acid","metal","battery", { name:"Battery", emoji:"🔋", icon:"battery", tier:6, category:"technology",
  tags:["tech","power","stored-energy"],
  phys:P.solid({ density:3, behavior:"static", conductive:true, color:"#2e8b57" }),
  info:"Battery: stores chemical energy and releases it as electric current." });
el("metal", { name:"Metal", emoji:"🪙", icon:"metal", tier:3, category:"metal",
  tags:["metal","conductive","generic"],
  phys:P.solid({ density:8, behavior:"static", conductive:true, color:"#9aa0a6" }),
  info:"Metal: a lustrous, conductive, malleable material." });
R("iron","stone","metal",null);
el("acid", { name:"Acid", emoji:"🧪", icon:"acid", tier:4, category:"chemical",
  tags:["acid","corrosive","liquid"],
  phys:P.liquid({ density:1.2, behavior:"acid", soluble:true, color:"#d8ff8a" }),
  info:"Acid: a corrosive solution that donates hydrogen ions (low pH)." });
R("hydrogen","water","acid",null);
R("electricity","metal","robot", { name:"Robot", emoji:"🤖", icon:"robot", tier:8, category:"technology",
  tags:["tech","machine","intelligent"],
  phys:P.solid({ density:5, behavior:"static", conductive:true, color:"#7f8c99" }),
  info:"Robot: a programmable machine that senses and acts on the world." });
R("silicon_chip","electricity","computer", { name:"Computer", emoji:"💻", icon:"computer", tier:8, category:"technology",
  tags:["tech","machine","logic"],
  phys:P.solid({ density:3, behavior:"static", conductive:true, color:"#34506b" }),
  info:"Computer: a machine that processes information using logic circuits." });
R("computer","computer","internet", { name:"Internet", emoji:"🌐", icon:"internet", tier:9, category:"technology",
  tags:["tech","network"],
  phys:null,
  info:"Internet: a global network linking billions of computers." });
R("computer","internet","ai", { name:"Artificial Intelligence", emoji:"🧠", icon:"ai", tier:10, category:"technology",
  tags:["tech","intelligent","logic"],
  phys:null,
  info:"AI: software that performs tasks normally requiring human intelligence." });

/* ===========================================================================
   TIER 7/8 — SPACE & ASTRONOMY
=========================================================================== */
R("hydrogen","pressure","star", { name:"Star", emoji:"⭐", icon:"star", tier:8, category:"space",
  tags:["space","hot","fusion"],
  phys:P.energy({ behavior:"fire", temp:6000, lifespan:9999, color:"#ffe066" }),
  info:"Star: a ball of plasma fusing hydrogen into helium, releasing light and heat." });
R("star","star","galaxy", { name:"Galaxy", emoji:"🌌", icon:"galaxy", tier:9, category:"space",
  tags:["space","vast"],
  phys:null,
  info:"Galaxy: billions of stars bound by gravity. Ours is the Milky Way." });
R("star","time","supernova", { name:"Supernova", emoji:"💥", icon:"supernova", tier:9, category:"space",
  tags:["space","explosion","energy"],
  phys:P.energy({ behavior:"explosion", temp:100000, lifespan:10, color:"#ff7ae0" }),
  info:"Supernova: a dying massive star's explosion, forging heavy elements." });
R("supernova","time","black_hole", { name:"Black Hole", emoji:"🕳️", icon:"blackhole", tier:10, category:"space",
  tags:["space","gravity","extreme"],
  phys:null,
  info:"Black hole: a region where gravity is so strong not even light escapes." });
R("earth","space","moon", { name:"Moon", emoji:"🌙", icon:"moon", tier:8, category:"space",
  tags:["space","rock"],
  phys:P.solid({ density:3.3, behavior:"static", color:"#cfcfcf" }),
  info:"Moon: Earth's rocky natural satellite, raising the tides." });
R("stone","space","planet", { name:"Planet", emoji:"🪐", icon:"planet", tier:8, category:"space",
  tags:["space","world"],
  phys:null,
  info:"Planet: a large body orbiting a star, cleared of debris in its path." });
R("sky","star","space", { name:"Space", emoji:"🌠", icon:"space", tier:7, category:"space",
  tags:["space","vacuum"],
  phys:null,
  info:"Space: the near-vacuum beyond a planet's atmosphere." });
R("metal","fire","rocket", { name:"Rocket", emoji:"🚀", icon:"rocket", tier:8, category:"technology",
  tags:["tech","machine","space"],
  phys:P.solid({ density:4, behavior:"static", color:"#d0d4d9" }),
  info:"Rocket: a vehicle propelled by ejecting high-speed exhaust — works in vacuum." });

/* ===========================================================================
   TIER 8/9 — NUCLEAR
=========================================================================== */
R("uranium","electricity","nuclear_reactor", { name:"Nuclear Reactor", emoji:"☢️", icon:"reactor", tier:9, category:"technology",
  tags:["tech","nuclear","power"],
  phys:P.solid({ density:6, behavior:"static", temp:300, color:"#4caf50" }),
  info:"Nuclear reactor: controls fission of uranium to generate heat and electricity." });
R("uranium","uranium","nuclear_bomb", { name:"Nuclear Bomb", emoji:"💣", icon:"nuke", tier:9, category:"technology",
  tags:["tech","nuclear","explosion"],
  phys:P.energy({ behavior:"explosion", temp:1000000, lifespan:12, color:"#ffcf3a" }),
  info:"Nuclear bomb: an uncontrolled chain reaction releasing colossal energy." });
R("hydrogen","star","fusion", { name:"Fusion", emoji:"☀️", icon:"fusion", tier:9, category:"physics",
  tags:["nuclear","energy","physics"],
  phys:P.energy({ behavior:"fire", temp:150000, lifespan:30, color:"#ffe9a8" }),
  info:"Fusion: merging light nuclei to release energy — how stars shine." });
R("lightning","metal","radiation", { name:"Radiation", emoji:"☢️", icon:"radiation", tier:8, category:"physics",
  tags:["nuclear","energy","physics","danger"],
  phys:P.energy({ behavior:"spark", temp:50, lifespan:40, color:"#9bff6b" }),
  info:"Radiation: energy or particles emitted by unstable (radioactive) atoms." });

/* ===========================================================================
   ATOMIC / PARTICLE PHYSICS
=========================================================================== */
R("energy","pressure","atom", { name:"Atom", emoji:"⚛️", icon:"atom", tier:5, category:"physics",
  tags:["physics","particle","fundamental"],
  phys:null,
  info:"Atom: the smallest unit of an element, a nucleus orbited by electrons." });
R("atom","atom","molecule", { name:"Molecule", emoji:"🧫", icon:"molecule", tier:6, category:"physics",
  tags:["physics","particle"],
  phys:null,
  info:"Molecule: two or more atoms bonded together." });
R("atom","electricity","electron", { name:"Electron", emoji:"🔵", icon:"electron", tier:6, category:"physics",
  tags:["physics","particle","charged"],
  phys:null,
  info:"Electron: a fundamental particle with negative charge; carries electric current." });
R("atom","pressure","proton", { name:"Proton", emoji:"🔴", icon:"proton", tier:6, category:"physics",
  tags:["physics","particle","charged"],
  phys:null,
  info:"Proton: a positively charged particle in the atomic nucleus." });
R("proton","electron","neutron", { name:"Neutron", emoji:"⚪", icon:"neutron", tier:6, category:"physics",
  tags:["physics","particle"],
  phys:null,
  info:"Neutron: a neutral nuclear particle; its count sets the isotope." });
R("electron","electron","quark", { name:"Quark", emoji:"🟣", icon:"quark", tier:7, category:"physics",
  tags:["physics","particle","fundamental"],
  phys:null,
  info:"Quark: a truly fundamental particle; three make a proton or neutron." });
R("energy","time","plasma", { name:"Plasma", emoji:"🌟", icon:"plasma", tier:6, category:"physics",
  tags:["physics","state","hot"],
  phys:P.energy({ behavior:"fire", temp:10000, lifespan:25, color:"#ff66cc" }),
  info:"Plasma: the fourth state of matter — ionised gas, as in stars and lightning." });

/* ===========================================================================
   MISC USEFUL INTERMEDIATES referenced above
=========================================================================== */
el("land", { name:"Land", emoji:"🏞️", icon:"land", tier:1, category:"geology",
  tags:["ground"], phys:P.solid({ behavior:"static", density:1.6, color:"#6b8e23" }),
  info:"Land: solid ground above the water." });
R("earth","stone","land",null);

/* ===========================================================================
   MEME / MYTHOLOGY ELEMENTS (category:"meme") — ~150
   Clearly non-scientific, fun discoveries. Includes the requested Lady L.
=========================================================================== */
function meme(id, def) { el(id, { ...def, category: "meme", phys: def.phys || null, info: def.info || "A playful, non-scientific discovery." }); return id; }

// Foundational meme reagents
R("human","time","life",null);
R("syrup","gas","coca_cola", { name:"Coca Cola", emoji:"🥤", icon:"cola", tier:6, category:"meme",
  tags:["drink","fizzy","meme"], phys:P.liquid({ density:1.04, behavior:"water", color:"#3a1f12" }),
  info:"Coca Cola: a famous caramel-coloured fizzy drink." });

R("ink","human","tattoo", { name:"Tattoo", emoji:"💉", icon:"tattoo", tier:7, category:"meme",
  tags:["body-art","meme"], phys:null,
  info:"Tattoo: ink injected into the skin to make permanent art." });
R("carbon","water","ink", { name:"Ink", emoji:"🖋️", icon:"ink", tier:5, category:"materials",
  tags:["liquid","pigment"], phys:P.liquid({ density:1.1, behavior:"water", color:"#0f0f14" }),
  info:"Ink: a pigmented liquid used for writing, printing and tattoos." });

// *** THE REQUESTED MEME: Lady L = Coca Cola + Tattoo ***
R("coca_cola","tattoo","lady_l", { name:"Lady L", emoji:"👑", icon:"lady_l", tier:9, category:"meme",
  tags:["legend","meme","icon"], phys:null,
  info:"Lady L: a legendary icon born of Coca Cola and ink. The crown jewel of CRUCIBLE's secret recipes." });

// *** EASTER EGG: Lady L + Heart -> Magic (a secret alternate path to Magic) ***
R("lady_l","heart","magic",null);

// A spread of fun memes (each defined once, reachable from real elements)
meme("dragon", { name:"Dragon", emoji:"🐉", icon:"dragon", tier:8, tags:["mythology","fire"], info:"Dragon: a mythical fire-breathing reptile." });
R("lizard_seed","fire","dragon",null);
R("reptile","fire","dragon",null);
meme("phoenix", { name:"Phoenix", emoji:"🐦‍🔥", icon:"phoenix", tier:8, tags:["mythology","fire"], info:"Phoenix: a mythical bird reborn from its own ashes." });
R("bird","fire","phoenix",null);
meme("unicorn", { name:"Unicorn", emoji:"🦄", icon:"unicorn", tier:8, tags:["mythology"], info:"Unicorn: a legendary horse with a single horn." });
R("mammal","rainbow","unicorn",null);
meme("mermaid", { name:"Mermaid", emoji:"🧜‍♀️", icon:"mermaid", tier:8, tags:["mythology","water"], info:"Mermaid: a mythical half-human, half-fish being." });
R("human","fish","mermaid",null);
meme("ghost", { name:"Ghost", emoji:"👻", icon:"ghost", tier:7, tags:["mythology","spirit"], info:"Ghost: the spirit of the dead, said to haunt the living." });
R("human","radiation","ghost",null);
meme("zombie", { name:"Zombie", emoji:"🧟", icon:"zombie", tier:8, tags:["mythology","undead"], info:"Zombie: a reanimated corpse craving brains." });
R("human","bacteria","zombie",null);
// blood (defined before use)
R("human","life","blood", { name:"Blood", emoji:"🩸", icon:"blood", tier:8, category:"life", tags:["organic","liquid"], phys:P.liquid({ density:1.06, behavior:"water", color:"#a01122" }), info:"Blood: the red fluid that carries oxygen through the body." });
meme("vampire", { name:"Vampire", emoji:"🧛", icon:"vampire", tier:8, tags:["mythology","undead"], info:"Vampire: an undead being that feeds on blood." });
R("human","blood","vampire",null);
meme("werewolf", { name:"Werewolf", emoji:"🐺", icon:"werewolf", tier:8, tags:["mythology"], info:"Werewolf: a human that transforms under the full moon." });
R("human","moon","werewolf",null);
meme("golem", { name:"Golem", emoji:"🗿", icon:"golem", tier:8, tags:["mythology","earth"], info:"Golem: a creature of clay brought to life by magic." });
R("clay","life","golem",null);
meme("wizard", { name:"Wizard", emoji:"🧙", icon:"wizard", tier:8, tags:["mythology","magic"], info:"Wizard: a wielder of arcane magic." });
R("human","magic","wizard",null);
meme("magic", { name:"Magic", emoji:"✨", icon:"magic", tier:6, tags:["mythology"], info:"Magic: the impossible made real." });
R("rainbow","star","magic",null);
meme("potion", { name:"Potion", emoji:"🧪", icon:"potion", tier:7, tags:["mythology","liquid"], phys:P.liquid({ density:1.1, behavior:"water", color:"#9b59b6" }), info:"Potion: a magical brew with mysterious effects." });
R("water","magic","potion",null);
meme("crystal_ball", { name:"Crystal Ball", emoji:"🔮", icon:"crystalball", tier:8, tags:["mythology"], info:"Crystal ball: a sphere said to reveal the future." });
R("glass","magic","crystal_ball",null);
meme("excalibur", { name:"Excalibur", emoji:"⚔️", icon:"excalibur", tier:9, tags:["mythology","weapon"], info:"Excalibur: the legendary sword of King Arthur." });
R("steel","magic","excalibur",null);
meme("genie", { name:"Genie", emoji:"🧞", icon:"genie", tier:8, tags:["mythology"], info:"Genie: a wish-granting spirit of myth." });
R("magic","wind","genie",null);
meme("fairy", { name:"Fairy", emoji:"🧚", icon:"fairy", tier:8, tags:["mythology"], info:"Fairy: a tiny winged magical being." });
R("flower","magic","fairy",null);
meme("kraken", { name:"Kraken", emoji:"🐙", icon:"kraken", tier:9, tags:["mythology","sea"], info:"Kraken: a giant sea monster of Norse legend." });
R("sea","magic","kraken",null);
meme("yeti", { name:"Yeti", emoji:"🦍", icon:"yeti", tier:8, tags:["mythology","cold"], info:"Yeti: an ape-like creature of the Himalayan snows." });
R("snow","mammal","yeti",null);
meme("alien", { name:"Alien", emoji:"👽", icon:"alien", tier:9, tags:["space","life"], info:"Alien: life originating beyond Earth." });
R("life","space","alien",null);
meme("ufo", { name:"UFO", emoji:"🛸", icon:"ufo", tier:9, tags:["space","tech"], info:"UFO: an unidentified flying object." });
R("alien","rocket","ufo",null);
meme("ninja", { name:"Ninja", emoji:"🥷", icon:"ninja", tier:8, tags:["human"], info:"Ninja: a stealthy covert agent of feudal Japan." });
R("human","ash","ninja",null);
meme("samurai", { name:"Samurai", emoji:"🗡️", icon:"samurai", tier:8, tags:["human","weapon"], info:"Samurai: an elite warrior of old Japan." });
R("human","excalibur","samurai",null);
meme("pirate", { name:"Pirate", emoji:"🏴‍☠️", icon:"pirate", tier:8, tags:["human","sea"], info:"Pirate: a seafaring raider." });
R("human","sea","pirate",null);
meme("knight", { name:"Knight", emoji:"🛡️", icon:"knight", tier:8, tags:["human"], info:"Knight: an armoured mounted warrior." });
R("human","steel","knight",null);
meme("robot_army", { name:"Robot Army", emoji:"🤖", icon:"robotarmy", tier:9, tags:["tech"], info:"Robot army: a legion of machines." });
R("robot","robot","robot_army",null);
meme("meme", { name:"Meme", emoji:"😂", icon:"meme", tier:8, tags:["internet"], info:"Meme: an idea that spreads across the internet." });
R("internet","human","meme",null);
meme("troll", { name:"Troll", emoji:"🧌", icon:"troll", tier:8, tags:["internet","mythology"], info:"Troll: a cave-dwelling brute — or an internet pest." });
R("internet","ghost","troll",null);
meme("emoji", { name:"Emoji", emoji:"😀", icon:"emoji", tier:8, tags:["internet"], info:"Emoji: a tiny pictogram used in messages." });
R("internet","light","emoji",null);
meme("god", { name:"God", emoji:"🌟", icon:"god", tier:10, tags:["mythology"], info:"God: a supreme being of myth and faith." });
R("life","star","god",null);
meme("philosophers_stone", { name:"Philosopher's Stone", emoji:"🟥", icon:"pstone", tier:10, tags:["mythology","alchemy"], info:"Philosopher's Stone: the legendary alchemical substance that turns lead to gold." });
R("lead","magic","philosophers_stone",null);
meme("gold_from_lead", { name:"Alchemic Gold", emoji:"🥇", icon:"gold", tier:10, tags:["alchemy"], info:"Gold transmuted from lead — the alchemist's dream realised." });
R("lead","philosophers_stone","gold_from_lead",null);

// pop-culture-ish fun
meme("rave", { name:"Rave", emoji:"🔊", icon:"rave", tier:8, tags:["music","party"], info:"Rave: an all-night electronic dance party." });
R("human","electricity","rave",null);
meme("techno", { name:"Techno", emoji:"🎶", icon:"techno", tier:9, tags:["music"], info:"Techno: pounding electronic dance music born in Detroit." });
R("rave","machine","techno",null);
meme("machine", { name:"Machine", emoji:"⚙️", icon:"machine", tier:6, tags:["tech"], phys:P.solid({ density:6, behavior:"static", conductive:true, color:"#8a8f96" }), info:"Machine: a device that does work using power." });
R("metal","gas","machine",null);
meme("hard_techno", { name:"Hard Techno", emoji:"🥁", icon:"hardtechno", tier:10, tags:["music"], info:"Hard Techno: relentless, high-BPM industrial techno." });
R("techno","fire","hard_techno",null);
meme("coffee", { name:"Coffee", emoji:"☕", icon:"coffee", tier:7, tags:["drink","food"], phys:P.liquid({ density:1, behavior:"water", color:"#3b2417" }), info:"Coffee: a caffeinated brew that fuels the world." });
R("seed","water","coffee",null);
meme("pizza", { name:"Pizza", emoji:"🍕", icon:"pizza", tier:8, tags:["food"], info:"Pizza: baked dough with toppings — Italy's gift to the world." });
R("dough","cheese","pizza",null);
meme("beer", { name:"Beer", emoji:"🍺", icon:"beer", tier:7, tags:["drink","food"], phys:P.liquid({ density:1.01, behavior:"water", flammable:false, color:"#e0a32a" }), info:"Beer: a fermented grain beverage." });
R("alcohol","bread","beer",null);
meme("wine", { name:"Wine", emoji:"🍷", icon:"wine", tier:7, tags:["drink","food"], phys:P.liquid({ density:0.99, behavior:"water", color:"#6b1330" }), info:"Wine: fermented grape juice." });
R("fruit","yeast","wine",null);

// seed helper used by dragon
R("reptile","seed","lizard_seed", { name:"Lizard Egg", emoji:"🥚", icon:"egg", tier:8, category:"life", tags:["organic"], info:"A reptile's egg." });

/* ===========================================================================
   A FEW MORE REAL CHAINS for breadth & connectivity
=========================================================================== */
R("water","cold","ice",null);
R("ice","fire","water",null);
R("ice","heat","water",null);
R("snow","fire","water",null);
R("steam","air","cloud",null);
R("sea","cold","ice",null);
R("sun","water","steam",null);
R("plant","light","sugar",null); // photosynthesis
R("sun","ice","water",null);
R("wind","water","wave", { name:"Wave", emoji:"🌊", icon:"wave", tier:3, category:"weather", tags:["water","motion"], phys:P.liquid({ density:1.03, behavior:"water", color:"#2b7fae" }), info:"Wave: energy travelling across the surface of water." });
R("wave","wave","tsunami", { name:"Tsunami", emoji:"🌊", icon:"tsunami", tier:5, category:"weather", tags:["water","disaster"], phys:P.liquid({ density:1.03, behavior:"water", color:"#155e85" }), info:"Tsunami: a giant sea wave triggered by an undersea quake." });
R("earth","pressure","earthquake", { name:"Earthquake", emoji:"🌐", icon:"earthquake", tier:5, category:"geology", tags:["disaster","geology"], phys:null, info:"Earthquake: ground shaking from sudden movement of tectonic plates." });
R("lava","earth","volcano", { name:"Volcano", emoji:"🌋", icon:"volcano", tier:4, category:"geology", tags:["geology","fire"], phys:null, info:"Volcano: a vent where molten rock erupts onto the surface." });
R("wind","storm","tornado", { name:"Tornado", emoji:"🌪️", icon:"tornado", tier:5, category:"weather", tags:["weather","disaster"], phys:null, info:"Tornado: a violently rotating column of air touching the ground." });
R("storm","sea","hurricane", { name:"Hurricane", emoji:"🌀", icon:"hurricane", tier:6, category:"weather", tags:["weather","disaster"], phys:null, info:"Hurricane: a vast rotating tropical storm system." });
R("fire","oxygen","flame", { name:"Flame", emoji:"🔥", icon:"flame", tier:3, category:"energy", tags:["hot","burns"], phys:P.energy({ behavior:"fire", temp:1000, lifespan:60, color:"#ff8c1a" }), info:"Flame: the visible glowing region of a fire — the fire triangle needs fuel, heat and oxygen." });
R("wood","tree","forest", { name:"Forest", emoji:"🌲", icon:"forest", tier:8, category:"life", tags:["plant","large"], phys:null, info:"Forest: a dense community of trees." });
R("forest","fire","wildfire", { name:"Wildfire", emoji:"🔥", icon:"wildfire", tier:8, category:"weather", tags:["fire","disaster"], phys:P.energy({ behavior:"fire", temp:900, lifespan:140, color:"#ff5e1a" }), info:"Wildfire: an uncontrolled fire spreading through vegetation." });
R("mud","tree","swamp", { name:"Swamp", emoji:"🥾", icon:"swamp", tier:5, category:"geology", tags:["wet","earth"], phys:P.liquid({ density:1.1, behavior:"water", color:"#3b5a2e" }), info:"Swamp: a forested wetland of slow water and mud." });
R("sand","sun","desert", { name:"Desert", emoji:"🏜️", icon:"desert", tier:4, category:"geology", tags:["dry","large"], phys:null, info:"Desert: an arid region receiving little rain." });
R("ice","ice","glacier", { name:"Glacier", emoji:"🏔️", icon:"glacier", tier:5, category:"geology", tags:["cold","ice"], phys:P.solid({ density:0.9, behavior:"static", temp:-10, meltAt:0, meltTo:"water", color:"#cdeeff" }), info:"Glacier: a slow-moving river of compacted ice." });
R("mud","fire","ceramic",null);
R("sand","wind","dune", { name:"Dune", emoji:"🏜️", icon:"dune", tier:3, category:"geology", tags:["sand"], phys:P.powder({ density:1.6, behavior:"powder", color:"#e0c178" }), info:"Dune: a hill of wind-blown sand." });

console.log("Authored base library:", elements.size, "elements,", recipes.size, "recipes.");

/* ===========================================================================
   V3 EXPANSION — large batch of real-world things (targets 1000+ total)
=========================================================================== */
buildExpansion({ el, R, alt, combine, P, elements, recipes, key });
console.log("After expansion 1:", elements.size, "elements,", recipes.size, "recipes.");
buildExpansion2({ el, R, alt, combine, P, elements, recipes, key });
console.log("After expansion 2:", elements.size, "elements,", recipes.size, "recipes.");
buildExpansion3({ el, R, alt, combine, P, elements, recipes, key });
console.log("After expansion 3:", elements.size, "elements,", recipes.size, "recipes.");
if (collisions.length) {
  console.warn("\nRECIPE KEY COLLISIONS (", collisions.length, "):");
  collisions.forEach((c) => console.warn("  " + c));
}

/* ===========================================================================
   STABLE-ID CARRYOVER GUARANTEE
   These ids are the ones older saves may have unlocked. We assert they exist
   so existing player discoveries survive the migration (state.js keeps any
   discovered id that still exists in the new elements map).
=========================================================================== */
const CARRYOVER = [
  "water","fire","earth","air","steam","mud","lava","rain","dust","stone",
  "sea","wind","energy","ice","snow","cloud","sand","salt","glass","iron",
  "steel","metal","gold","silver","copper","wood","plant","tree","life",
  "stone","brick","clay","ash","coal","oil","acid","magnet","sun","light",
];
const missingCarry = CARRYOVER.filter((id) => !elements.has(id));
if (missingCarry.length) {
  console.warn("WARNING: carryover ids missing (saves would lose these):", missingCarry.join(", "));
} else {
  console.log("Carryover OK: all", CARRYOVER.length, "legacy stable ids present.");
}

/* ---------------------------------------------------------------------------
   VALIDATION
--------------------------------------------------------------------------- */
// 1) every recipe references existing elements
let dangling = 0;
for (const [k, r] of recipes) {
  const [a, b] = k.split("|");
  if (!elements.has(a) || !elements.has(b) || !elements.has(r)) {
    dangling++;
    console.warn("  dangling recipe:", k, "->", r);
  }
}
if (dangling) console.warn("WARNING: dangling recipes:", dangling);

// 2) reachability from the 4 bases (BFS over recipes)
const BASES = ["water","fire","earth","air"];
const reachable = new Set(BASES);
// also treat zero-ingredient abstract drivers we seed as discoverable via their recipes only
let changed = true;
while (changed) {
  changed = false;
  for (const [k, r] of recipes) {
    const [a, b] = k.split("|");
    if (reachable.has(a) && reachable.has(b) && !reachable.has(r)) {
      reachable.add(r);
      changed = true;
    }
  }
}
const unreachable = [...elements.keys()].filter((id) => !reachable.has(id) && !BASES.includes(id));
console.log("Reachable from 4 bases:", reachable.size, "/", elements.size);
if (unreachable.length) {
  console.warn("Unreachable elements (", unreachable.length, "):", unreachable.slice(0, 40).join(", ") + (unreachable.length > 40 ? " ..." : ""));
}

// 3) orphan products: elements that are never the result of any recipe and are not bases
const products = new Set(recipes.values());
const orphans = [...elements.keys()].filter((id) => !products.has(id) && !BASES.includes(id) && !elements.get(id).base);
if (orphans.length) {
  console.warn("Orphan elements (no recipe yields them):", orphans.length, "->", orphans.slice(0, 40).join(", "));
}

/* ---------------------------------------------------------------------------
   WRITE
--------------------------------------------------------------------------- */
const out = {
  meta: {
    name: "Crucible",
    version: "2.0.0",
    generated: new Date().toISOString(),
    elementCount: elements.size,
    recipeCount: recipes.size,
    realCount: [...elements.values()].filter((e) => e.category !== "meme").length,
    memeCount: [...elements.values()].filter((e) => e.category === "meme").length,
  },
  elements: Object.fromEntries(elements),
  recipes: Object.fromEntries(recipes),
  firstPair: Object.fromEntries(recipeMeta),
};

const file = path.join(OUT_DIR, "elements.json");
fs.writeFileSync(file, JSON.stringify(out));
console.log("\n=== DONE ===");
console.log("Elements:", elements.size, "(real:", out.meta.realCount, "meme:", out.meta.memeCount, ")");
console.log("Recipes :", recipes.size);
console.log("Written :", file, "(", (fs.statSync(file).size / 1024).toFixed(1), "KB )");
