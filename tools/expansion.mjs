/* ============================================================================
   CRUCIBLE — Realistic Element Expansion (v3)
   ----------------------------------------------------------------------------
   Adds a large batch of REAL, existing things on top of the v2 base library,
   targeting 1000+ total elements. Everything here is a real-world entity:
   chemical elements, animals, plants, foods, places, vehicles, tools,
   instruments, body parts, weather, space, sports, professions, etc.

   All recipes stay realistic-ish and — critically — every new element is
   reachable from the four bases and uses a UNIQUE ingredient pair so there are
   no recipe-key collisions. A small auto-pairing helper guarantees this.

   This module is imported by gen_elements.mjs and given its authoring helpers.
============================================================================ */

export function buildExpansion(ctx) {
  const { el, R, alt, combine, P, elements, recipes, key } = ctx;

  // -- helpers -------------------------------------------------------------
  const has = (id) => elements.has(id);
  const used = (a, b) => recipes.has(key(a, b));

  // Define an element `id` as the product of the first UNUSED pair drawn from
  // `parents` (a list of existing ids). Guarantees uniqueness + reachability
  // (as long as parents are reachable). Falls back across all parent pairs.
  function def(id, parents, defObj) {
    if (has(id)) return id;
    // ensure element exists first (so we can attach >=1 recipe)
    el(id, defObj);
    if (!attach(id, parents)) {
      // last resort: pair with any two already-defined reachable hubs
      attach(id, [...parents, ...HUBS]);
    }
    return id;
  }

  // attach a single recipe to an existing element using a free pair
  function attach(id, parents) {
    for (let i = 0; i < parents.length; i++) {
      for (let j = i; j < parents.length; j++) {
        const a = parents[i], b = parents[j];
        if (a === id || b === id) continue; // never self-reference
        if (!has(a) || !has(b)) continue;
        if (used(a, b)) continue;
        combine(a, b, id);
        return true;
      }
    }
    return false;
  }

  // add an extra (alternate) recipe if the pair is free
  function also(a, b, id) {
    if (has(a) && has(b) && has(id) && !used(a, b)) combine(a, b, id);
  }

  // Common hub ingredients we can always fall back on for pairing.
  const HUBS = ["water","fire","earth","air","life","human","plant","metal",
    "stone","sand","glass","wood","energy","heat","time","light","sun","sea",
    "salt","oil","carbon","ice","cloud","electricity","machine","acid","gas"];

  // quick property presets
  const meat   = (o={}) => P.solid({ density:1.05, behavior:"static", color:"#b5524e", flammable:false, ...o });
  const food   = (o={}) => P.solid({ density:1.0, behavior:"static", color:"#d9a066", ...o });
  const drink  = (o={}) => P.liquid({ density:1.0, behavior:"water", color:"#c98a3a", ...o });
  const animal = (o={}) => null; // animals are living, no sandbox phys by default
  const solidC = (color, o={}) => P.solid({ density:4, behavior:"static", color, ...o });
  const powd   = (color, o={}) => P.powder({ density:2, behavior:"powder", color, ...o });

  /* =========================================================================
     1) PERIODIC TABLE — real chemical elements (symbols, states, properties)
        Each branches off chemistry hubs so all are reachable & unique.
     ========================================================================= */
  // ensure some chemistry hubs exist for pairing
  const chemHubs = ["carbon","oxygen","hydrogen","nitrogen","sulfur","metal","acid","salt","stone","fire","water","air","earth","heat","electricity"];

  // [id, Name, symbol, emoji, state, density(g/cm3), melt°C, boil°C, color, conductive, flammable, blurb]
  const ELEMENTS118 = [
    ["element_lithium","Lithium","Li","🔋","solid",0.53,180,1342,"#cf9fff",true,true,"Lithium: the lightest metal, used in batteries."],
    ["element_beryllium","Beryllium","Be","⚙️","solid",1.85,1287,2469,"#9fd9c7",true,false,"Beryllium: a light, stiff, toxic metal."],
    ["element_boron","Boron","B","🟤","solid",2.34,2076,3927,"#6b5b3a",false,false,"Boron: a metalloid used in glass and detergents."],
    ["element_fluorine","Fluorine","F","🟡","gas",0.0017,-220,-188,"#d6e85b",false,false,"Fluorine: the most reactive element, a pale gas."],
    ["element_neon","Neon","Ne","💡","gas",0.0009,-249,-246,"#ff5a4d",true,false,"Neon: a noble gas that glows orange-red in lights."],
    ["element_sodium","Sodium","Na","🧂","solid",0.97,98,883,"#e7e7ef",true,true,"Sodium: a soft, reactive metal; half of table salt."],
    ["element_magnesium","Magnesium","Mg","✨","solid",1.74,650,1090,"#d8dde0",true,true,"Magnesium: a light metal that burns bright white."],
    ["element_aluminium","Aluminium","Al","🥫","solid",2.70,660,2470,"#cfd4d8",true,false,"Aluminium: a light, corrosion-resistant metal."],
    ["element_silicon","Silicon","Si","💻","solid",2.33,1414,3265,"#5a5f66",true,false,"Silicon: the semiconductor at the heart of chips."],
    ["element_phosphorus","Phosphorus","P","🔥","solid",1.82,44,280,"#ffd24a",false,true,"Phosphorus: glows in the dark; vital to life."],
    ["element_chlorine","Chlorine","Cl","🟢","gas",0.0032,-101,-34,"#bff05a",false,false,"Chlorine: a green, toxic gas used to disinfect water."],
    ["element_argon","Argon","Ar","🎈","gas",0.0018,-189,-186,"#9fd0ff",false,false,"Argon: an inert noble gas filling light bulbs."],
    ["element_potassium","Potassium","K","🍌","solid",0.86,64,759,"#e8e3ff",true,true,"Potassium: a reactive metal essential to nerves."],
    ["element_calcium","Calcium","Ca","🦴","solid",1.55,842,1484,"#eeeee6",true,true,"Calcium: builds bones, shells and limestone."],
    ["element_titanium","Titanium","Ti","🛩️","solid",4.51,1668,3287,"#b8bcc2",true,false,"Titanium: strong, light, corrosion-proof metal."],
    ["element_chromium","Chromium","Cr","🪞","solid",7.19,1907,2671,"#c7ccd1",true,false,"Chromium: a hard, shiny metal used in plating."],
    ["element_manganese","Manganese","Mn","⛓️","solid",7.21,1246,2061,"#9a9ea3",true,false,"Manganese: hardens steel."],
    ["element_cobalt","Cobalt","Co","🔵","solid",8.90,1495,2927,"#3f6fb0",true,false,"Cobalt: a magnetic metal used in blue pigments."],
    ["element_nickel","Nickel","Ni","🪙","solid",8.91,1455,2913,"#c2c7c2",true,false,"Nickel: a tough metal used in coins and alloys."],
    ["element_zinc","Zinc","Zn","🔩","solid",7.14,420,907,"#bcc2c9",true,false,"Zinc: galvanises steel against rust."],
    ["element_arsenic","Arsenic","As","☠️","solid",5.73,817,614,"#7a8a7a",false,false,"Arsenic: a notoriously poisonous metalloid."],
    ["element_bromine","Bromine","Br","🟥","liquid",3.12,-7,59,"#8a2d1f",false,false,"Bromine: a red-brown liquid nonmetal."],
    ["element_krypton","Krypton","Kr","🦸","gas",0.0037,-157,-153,"#a7e3ff",false,false,"Krypton: a noble gas used in some lighting."],
    ["element_silver_e","Silver","Ag","🥈","solid",10.49,962,2162,"#e6e8ea",true,false,"Silver: the best electrical conductor."],
    ["element_tin","Tin","Sn","🥫","solid",7.27,232,2602,"#cdd2d6",true,false,"Tin: a soft metal used to coat cans and make solder."],
    ["element_iodine","Iodine","I","🟣","solid",4.93,114,184,"#6a3fb0",false,false,"Iodine: a purple-black solid used as antiseptic."],
    ["element_xenon","Xenon","Xe","💡","gas",0.0059,-112,-108,"#9fc9ff",false,false,"Xenon: a heavy noble gas used in bright lamps."],
    ["element_platinum","Platinum","Pt","💍","solid",21.45,1768,3825,"#dfe2e5",true,false,"Platinum: a dense, precious, unreactive metal."],
    ["element_mercury","Mercury","Hg","🌡️","liquid",13.53,-39,357,"#c8ccd0",true,false,"Mercury: the only metal liquid at room temperature."],
    ["element_lead","Lead","Pb","🔋","solid",11.34,327,1749,"#6e7479",true,false,"Lead: a heavy, soft, toxic metal."],
    ["element_uranium","Uranium","U","☢️","solid",19.05,1132,4131,"#5fa05f",true,false,"Uranium: a radioactive metal that fuels reactors."],
    ["element_plutonium","Plutonium","Pu","☢️","solid",19.84,640,3228,"#7fb07f",true,false,"Plutonium: a radioactive metal used in weapons."],
    ["element_tungsten","Tungsten","W","💡","solid",19.25,3422,5555,"#9aa0a6",true,false,"Tungsten: highest melting point of all metals."],
    ["element_helium_e","Helium","He","🎈","gas",0.00018,-272,-269,"#fff3a8",false,false,"Helium: a light noble gas that lifts balloons."],
  ];
  for (const [id,name,sym,emoji,state,density,melt,boil,color,cond,flam,info] of ELEMENTS118) {
    const phys = state === "gas"
      ? P.gas({ density, color, conductive:cond, flammable:flam, symbol:sym, boilAt:boil, freezeAt:melt })
      : state === "liquid"
      ? P.liquid({ density, color, conductive:cond, flammable:flam, symbol:sym, freezeAt:melt, boilAt:boil })
      : P.solid({ density, color, conductive:cond, flammable:flam, symbol:sym, meltAt:melt, boilAt:boil });
    def(id, [...chemHubs], { name, emoji, icon:null, tier:4, category:"chemical", tags:["element","periodic"], phys, info });
  }

  /* =========================================================================
     2) COMPOUNDS & CHEMISTRY breadth (real molecules)
     ========================================================================= */
  const COMPOUNDS = [
    ["ammonia","Ammonia","NH₃","🧴","gas",0.00073,"#cfe8ff",false,"Ammonia: a pungent gas used in fertiliser and cleaners."],
    ["methane","Methane","CH₄","💨","gas",0.00067,"#bfe3c0",true,"Methane: the simplest hydrocarbon and main natural gas."],
    ["carbon_dioxide","Carbon Dioxide","CO₂","🫧","gas",0.0018,"#dfe3e6",false,"Carbon dioxide: exhaled by life, absorbed by plants."],
    ["carbon_monoxide","Carbon Monoxide","CO","☠️","gas",0.00115,"#c9ccd0",true,"Carbon monoxide: a silent, toxic combustion gas."],
    ["sulfuric_acid","Sulfuric Acid","H₂SO₄","🧪","liquid",1.83,"#e8e2a0",false,"Sulfuric acid: a powerful, corrosive industrial acid."],
    ["nitric_acid","Nitric Acid","HNO₃","🧪","liquid",1.51,"#f0e08a",false,"Nitric acid: a strong acid used in fertilisers and explosives."],
    ["hydrochloric_acid","Hydrochloric Acid","HCl","🧪","liquid",1.18,"#e6f0c0",false,"Hydrochloric acid: stomach acid and a lab staple."],
    ["sodium_hydroxide","Sodium Hydroxide","NaOH","🧼","solid",2.13,"#f0f0f0",false,"Sodium hydroxide: lye, a strong base for soap-making."],
    ["baking_soda","Baking Soda","NaHCO₃","🧁","powder",2.2,"#f2f2ee",false,"Baking soda: leavens cakes and neutralises acids."],
    ["hydrogen_peroxide","Hydrogen Peroxide","H₂O₂","🧴","liquid",1.45,"#e8f6ff",false,"Hydrogen peroxide: a bleaching, disinfecting liquid."],
    ["ozone","Ozone","O₃","🛡️","gas",0.0021,"#a7d8ff",false,"Ozone: a reactive form of oxygen that shields us from UV."],
    ["ethanol","Ethanol","C₂H₅OH","🍸","liquid",0.79,"#eae0c0",true,"Ethanol: drinking alcohol and a clean-burning fuel."],
    ["methanol","Methanol","CH₃OH","⛽","liquid",0.79,"#e6e0c8",true,"Methanol: wood alcohol, toxic but useful as fuel."],
    ["acetone","Acetone","C₃H₆O","💅","liquid",0.79,"#eceef2",true,"Acetone: a solvent and nail-polish remover."],
    ["glucose","Glucose","C₆H₁₂O₆","🍬","solid",1.54,"#f4ead0",true,"Glucose: the sugar that fuels living cells."],
    ["calcium_carbonate","Calcium Carbonate","CaCO₃","🐚","solid",2.71,"#efeee8",false,"Calcium carbonate: chalk, limestone and seashells."],
    ["silicon_dioxide","Silicon Dioxide","SiO₂","🏖️","solid",2.65,"#e8dcb0",false,"Silicon dioxide: quartz and the main component of sand."],
    ["rust","Rust","Fe₂O₃","🟤","powder",5.24,"#8a4a2a",false,"Rust: iron oxide formed when iron meets oxygen and water."],
    ["graphite","Graphite","C","✏️","solid",2.27,"#3a3d42",true,"Graphite: a soft, conductive form of carbon used in pencils."],
    ["dry_ice","Dry Ice","CO₂","🧊","solid",1.56,"#e3eef5",false,"Dry ice: frozen carbon dioxide that sublimes into fog."],
  ];
  for (const [id,name,formula,emoji,state,density,color,flam,info] of COMPOUNDS) {
    const phys = state === "gas" ? P.gas({ density, color, flammable:flam, formula })
      : state === "powder" ? P.powder({ density, color, flammable:flam, formula })
      : state === "liquid" ? P.liquid({ density, color, flammable:flam, formula })
      : P.solid({ density, color, flammable:flam, formula });
    def(id, ["acid","water","oxygen","hydrogen","carbon","nitrogen","sulfur","salt","fire","metal","iron","sand","stone","heat","air"], {
      name, emoji, icon:null, tier:4, category:"chemical", tags:["compound","molecule"], phys, info });
  }

  /* =========================================================================
     3) ANIMALS — real species (life, no sandbox phys)
     ========================================================================= */
  // ensure generic animal hubs
  def("animal", ["life","earth"], { name:"Animal", emoji:"🐾", icon:null, tier:6, category:"life", tags:["organic","living"], phys:null, info:"Animal: a multicellular organism that moves and feeds." });
  def("insect", ["animal","air"], { name:"Insect", emoji:"🐛", icon:null, tier:6, category:"life", tags:["organic","small"], phys:null, info:"Insect: a six-legged arthropod — the most numerous animals." });
  def("amphibian", ["animal","water"], { name:"Amphibian", emoji:"🐸", icon:null, tier:6, category:"life", tags:["organic"], phys:null, info:"Amphibian: a cold-blooded animal living in water and on land." });

  const MAMMALS = [
    ["dog","Dog","🐕","Dog: a loyal domesticated canine."],
    ["cat","Cat","🐈","Cat: an independent domesticated feline."],
    ["cow","Cow","🐄","Cow: a domesticated bovine raised for milk and beef."],
    ["horse","Horse","🐎","Horse: a hooved mammal long used for transport."],
    ["pig","Pig","🐖","Pig: an intelligent farm animal raised for pork."],
    ["sheep","Sheep","🐑","Sheep: a woolly farm mammal."],
    ["lion","Lion","🦁","Lion: the social big cat of the savanna."],
    ["tiger","Tiger","🐅","Tiger: the largest striped big cat."],
    ["elephant","Elephant","🐘","Elephant: the largest land animal."],
    ["bear","Bear","🐻","Bear: a large, powerful omnivore."],
    ["wolf","Wolf","🐺","Wolf: a wild pack-hunting canine."],
    ["fox","Fox","🦊","Fox: a cunning small canine."],
    ["rabbit","Rabbit","🐇","Rabbit: a fast-breeding burrowing mammal."],
    ["mouse","Mouse","🐁","Mouse: a small, ubiquitous rodent."],
    ["monkey","Monkey","🐒","Monkey: an agile, clever primate."],
    ["gorilla","Gorilla","🦍","Gorilla: the largest living primate."],
    ["whale","Whale","🐋","Whale: the largest animal ever to live."],
    ["dolphin","Dolphin","🐬","Dolphin: a highly intelligent marine mammal."],
    ["bat","Bat","🦇","Bat: the only truly flying mammal."],
    ["deer","Deer","🦌","Deer: a graceful antlered herbivore."],
    ["giraffe","Giraffe","🦒","Giraffe: the tallest land animal."],
    ["zebra","Zebra","🦓","Zebra: a striped African equine."],
    ["kangaroo","Kangaroo","🦘","Kangaroo: a hopping Australian marsupial."],
    ["camel","Camel","🐫","Camel: a desert mammal that stores fat in its humps."],
    ["rhinoceros","Rhinoceros","🦏","Rhinoceros: a massive horned herbivore."],
    ["hippopotamus","Hippopotamus","🦛","Hippopotamus: a huge semi-aquatic mammal."],
  ];
  for (const [id,name,emoji,info] of MAMMALS)
    def(id, ["mammal","life","animal","earth","grass","forest","water","human","milk","meat"], { name, emoji, icon:null, tier:7, category:"life", tags:["animal","mammal"], phys:null, info });

  const BIRDS = [
    ["eagle","Eagle","🦅","Eagle: a powerful bird of prey."],
    ["owl","Owl","🦉","Owl: a silent nocturnal hunter."],
    ["penguin","Penguin","🐧","Penguin: a flightless seabird of the cold south."],
    ["chicken","Chicken","🐔","Chicken: the world's most common domesticated bird."],
    ["duck","Duck","🦆","Duck: a waterfowl with webbed feet."],
    ["parrot","Parrot","🦜","Parrot: a colourful bird that can mimic speech."],
    ["flamingo","Flamingo","🦩","Flamingo: a pink wading bird."],
    ["peacock","Peacock","🦚","Peacock: famed for its iridescent tail."],
    ["swan","Swan","🦢","Swan: an elegant long-necked waterbird."],
    ["crow","Crow","🐦‍⬛","Crow: a clever, adaptable black bird."],
    ["ostrich","Ostrich","🦤","Ostrich: the largest, fastest-running bird."],
  ];
  for (const [id,name,emoji,info] of BIRDS)
    def(id, ["bird","air","life","animal","egg","feather","tree","sea","ice"], { name, emoji, icon:null, tier:7, category:"life", tags:["animal","bird"], phys:null, info });

  const SEALIFE = [
    ["shark","Shark","🦈","Shark: an ancient cartilaginous predator fish."],
    ["octopus","Octopus","🐙","Octopus: a highly intelligent eight-armed mollusc."],
    ["crab","Crab","🦀","Crab: a sideways-walking crustacean."],
    ["lobster","Lobster","🦞","Lobster: a large clawed crustacean."],
    ["shrimp","Shrimp","🦐","Shrimp: a small, popular edible crustacean."],
    ["jellyfish","Jellyfish","🪼","Jellyfish: a drifting, stinging gelatinous animal."],
    ["squid","Squid","🦑","Squid: a fast, ten-armed cephalopod."],
    ["seahorse","Seahorse","🐠","Seahorse: a tiny fish where males carry the young."],
    ["starfish","Starfish","⭐","Starfish: a five-armed echinoderm of the seabed."],
    ["turtle","Turtle","🐢","Turtle: a shelled reptile, some living a century."],
    ["frog","Frog","🐸","Frog: a leaping amphibian that starts life as a tadpole."],
    ["snake","Snake","🐍","Snake: a legless reptile."],
    ["crocodile","Crocodile","🐊","Crocodile: a large ambush-predator reptile."],
    ["coral","Coral","🪸","Coral: tiny colonial animals that build reefs.",P.solid({ density:2.6, behavior:"static", color:"#ff8c69" })],
  ];
  for (const [id,name,emoji,info,phys] of SEALIFE)
    def(id, ["fish","sea","water","life","animal","reptile","amphibian","salt","ice","stone"], { name, emoji, icon:null, tier:7, category:"life", tags:["animal","sea"], phys:phys||null, info });

  const BUGS = [
    ["bee","Bee","🐝","Bee: a pollinator that makes honey."],
    ["butterfly","Butterfly","🦋","Butterfly: a nectar-feeding insect with patterned wings."],
    ["ant","Ant","🐜","Ant: a social insect living in vast colonies."],
    ["spider","Spider","🕷️","Spider: an eight-legged arachnid that spins silk."],
    ["ladybug","Ladybug","🐞","Ladybug: a spotted beetle beloved by gardeners."],
    ["mosquito","Mosquito","🦟","Mosquito: a blood-feeding, disease-spreading insect."],
    ["dragonfly","Dragonfly","🪰","Dragonfly: a fast aerial insect predator."],
    ["grasshopper","Grasshopper","🦗","Grasshopper: a jumping, chirping insect."],
    ["scorpion","Scorpion","🦂","Scorpion: a venomous arachnid with a stinging tail."],
    ["snail","Snail","🐌","Snail: a slow mollusc carrying a spiral shell."],
    ["worm","Worm","🪱","Worm: a soft, burrowing invertebrate that aerates soil."],
  ];
  for (const [id,name,emoji,info] of BUGS)
    def(id, ["insect","life","flower","grass","plant","mud","honey","silk","blood","leaf","forest"], { name, emoji, icon:null, tier:7, category:"life", tags:["animal","insect"], phys:null, info });

  // animal-derived products
  def("honey", ["bee","sugar"], { name:"Honey", emoji:"🍯", icon:null, tier:8, category:"life", tags:["food","sweet"], phys:P.liquid({ density:1.42, behavior:"water", color:"#e0a300" }), info:"Honey: a sweet syrup made by bees from nectar." });
  def("silk", ["worm","plant"], { name:"Silk", emoji:"🧵", icon:null, tier:7, category:"materials", tags:["fabric"], phys:P.solid({ density:1.3, behavior:"static", color:"#f2ead6", flammable:true }), info:"Silk: a fine, strong fibre spun by silkworms." });
  def("wool", ["sheep","plant"], { name:"Wool", emoji:"🧶", icon:null, tier:7, category:"materials", tags:["fabric","warm"], phys:P.solid({ density:1.3, behavior:"static", color:"#efe6d6", flammable:true }), info:"Wool: warm fibre from sheep fleece." });
  def("leather", ["cow","salt"], { name:"Leather", emoji:"🧳", icon:null, tier:7, category:"materials", tags:["fabric"], phys:P.solid({ density:0.9, behavior:"static", color:"#7a4a2a", flammable:true }), info:"Leather: tanned animal hide." });
  def("feather", ["bird","air"], { name:"Feather", emoji:"🪶", icon:null, tier:7, category:"life", tags:["light"], phys:P.powder({ density:0.05, behavior:"powder", color:"#f0f0f0", flammable:true }), info:"Feather: a light, insulating bird structure." });
  def("egg", ["chicken","stone"], { name:"Egg", emoji:"🥚", icon:null, tier:7, category:"life", tags:["food","organic"], phys:P.solid({ density:1.03, behavior:"static", color:"#f3ead2" }), info:"Egg: a protective shell around a developing embryo." });

  /* =========================================================================
     4) PLANTS, FRUIT & VEGETABLES — real species
     ========================================================================= */
  def("grass", ["plant","earth"], { name:"Grass", emoji:"🌿", icon:null, tier:5, category:"life", tags:["plant","green"], phys:P.solid({ density:0.5, behavior:"static", color:"#5fae3a", flammable:true }), info:"Grass: fast-growing ground-cover plants." });
  def("leaf", ["tree","light"], { name:"Leaf", emoji:"🍃", icon:null, tier:5, category:"life", tags:["plant","green"], phys:P.powder({ density:0.4, behavior:"powder", color:"#4f9e3a", flammable:true }), info:"Leaf: a plant's solar panel for photosynthesis." });
  def("vegetable", ["plant","seed"], { name:"Vegetable", emoji:"🥬", icon:null, tier:6, category:"life", tags:["food","plant"], phys:food({ color:"#5fae3a" }), info:"Vegetable: an edible plant part." });
  def("wheat", ["grass","sun"], { name:"Wheat", emoji:"🌾", icon:null, tier:6, category:"life", tags:["crop","food"], phys:P.powder({ density:0.7, behavior:"powder", color:"#d9b24a", flammable:true }), info:"Wheat: a cereal grain milled into flour." });
  def("rice", ["grass","water"], { name:"Rice", emoji:"🍚", icon:null, tier:6, category:"life", tags:["crop","food"], phys:P.powder({ density:0.85, behavior:"powder", color:"#f2eede" }), info:"Rice: a staple cereal feeding half the world." });
  def("corn", ["grass","gold"], { name:"Corn", emoji:"🌽", icon:null, tier:6, category:"life", tags:["crop","food"], phys:food({ color:"#f2c200" }), info:"Corn: maize, a tall cereal grass." });

  const FRUITS = [
    ["apple","Apple","🍎"],["banana","Banana","🍌"],["orange_fruit","Orange","🍊"],
    ["grape","Grape","🍇"],["strawberry","Strawberry","🍓"],["lemon","Lemon","🍋"],
    ["watermelon","Watermelon","🍉"],["pineapple","Pineapple","🍍"],["cherry","Cherry","🍒"],
    ["peach","Peach","🍑"],["mango","Mango","🥭"],["coconut","Coconut","🥥"],
    ["kiwi","Kiwi","🥝"],["pear","Pear","🍐"],["avocado","Avocado","🥑"],
  ];
  for (const [id,name,emoji] of FRUITS)
    def(id, ["fruit","tree","seed","sun","plant","water","leaf","sugar","sea","sand"], { name, emoji, icon:null, tier:7, category:"life", tags:["food","fruit"], phys:food({ color:"#e85d4d" }), info:`${name}: an edible fruit.` });

  const VEG = [
    ["potato","Potato","🥔"],["carrot","Carrot","🥕"],["tomato","Tomato","🍅"],
    ["onion","Onion","🧅"],["garlic","Garlic","🧄"],["pepper","Pepper","🫑"],
    ["broccoli","Broccoli","🥦"],["cucumber","Cucumber","🥒"],["mushroom","Mushroom","🍄"],
    ["eggplant","Eggplant","🍆"],["lettuce","Lettuce","🥬"],["chili","Chili","🌶️"],
  ];
  for (const [id,name,emoji] of VEG)
    def(id, ["vegetable","earth","seed","plant","water","mud","sun","leaf","grass","clay"], { name, emoji, icon:null, tier:7, category:"life", tags:["food","vegetable"], phys:food({ color:"#5fae3a" }), info:`${name}: an edible vegetable.` });

  const FLOWERS = [
    ["rose","Rose","🌹"],["sunflower","Sunflower","🌻"],["tulip","Tulip","🌷"],
    ["daisy","Daisy","🌼"],["lotus","Lotus","🪷"],["hibiscus","Hibiscus","🌺"],
    ["cactus","Cactus","🌵"],["bamboo","Bamboo","🎋"],["palm_tree","Palm Tree","🌴"],
    ["maple","Maple","🍁"],["mushroom_fungus","Fungus","🍄‍🟫"],["moss","Moss","🌿"],
  ];
  for (const [id,name,emoji] of FLOWERS)
    def(id, ["flower","plant","leaf","seed","sun","water","sand","desert","forest","swamp","tree"], { name, emoji, icon:null, tier:6, category:"life", tags:["plant"], phys:P.solid({ density:0.5, behavior:"static", color:"#e84d8a", flammable:true }), info:`${name}: a plant.` });

  /* =========================================================================
     5) FOOD & COOKING — real dishes & ingredients
     ========================================================================= */
  def("meat", ["cow","fire"], { name:"Meat", emoji:"🥩", icon:null, tier:7, category:"life", tags:["food"], phys:meat(), info:"Meat: animal muscle eaten as food." });
  def("butter", ["milk","salt"], { name:"Butter", emoji:"🧈", icon:null, tier:7, category:"life", tags:["food","dairy"], phys:P.solid({ density:0.91, behavior:"static", color:"#f2d65a", meltAt:32, meltTo:"oil" }), info:"Butter: churned milk fat." });
  def("sugar_crystal", ["sugar","water"], { name:"Sugar Crystal", emoji:"🍬", icon:null, tier:6, category:"chemical", tags:["food","sweet"], phys:P.powder({ density:1.6, behavior:"powder", color:"#f6f1e7" }), info:"Sugar crystal: refined sucrose." });
  def("chocolate", ["seed","milk"], { name:"Chocolate", emoji:"🍫", icon:null, tier:8, category:"life", tags:["food","sweet"], phys:P.solid({ density:1.3, behavior:"static", color:"#5a3420", meltAt:34, meltTo:"oil" }), info:"Chocolate: a treat made from roasted cacao." });
  const DISHES = [
    ["cake","Cake","🍰",["dough","sugar"]],
    ["cookie","Cookie","🍪",["dough","chocolate"]],
    ["pasta","Pasta","🍝",["dough","tomato"]],
    ["soup","Soup","🍲",["water","vegetable"]],
    ["salad","Salad","🥗",["lettuce","tomato"]],
    ["sandwich","Sandwich","🥪",["bread","cheese"]],
    ["burger","Burger","🍔",["bread","meat"]],
    ["taco","Taco","🌮",["corn","meat"]],
    ["sushi","Sushi","🍣",["rice","fish"]],
    ["icecream","Ice Cream","🍦",["milk","ice"]],
    ["pancake","Pancake","🥞",["flour","egg"]],
    ["fries","Fries","🍟",["potato","oil"]],
    ["popcorn","Popcorn","🍿",["corn","heat"]],
    ["donut","Donut","🍩",["dough","sugar_crystal"]],
    ["honey_cake","Honey Cake","🍯",["cake","honey"]],
    ["omelette","Omelette","🍳",["egg","butter"]],
    ["steak","Steak","🥩",["meat","heat"]],
    ["cheese_wheel","Cheese Wheel","🧀",["cheese","wheel"]],
    ["jam","Jam","🫙",["fruit","sugar"]],
    ["juice","Juice","🧃",["fruit","water"]],
    ["smoothie","Smoothie","🥤",["fruit","milk"]],
    ["tea","Tea","🍵",["leaf","water"]],
    ["lemonade","Lemonade","🍋",["lemon","sugar"]],
    ["chips","Chips","🥔",["potato","salt"]],
    ["yogurt","Yogurt","🥛",["milk","bacteria"]],
  ];
  for (const [id,name,emoji,parents] of DISHES) {
    const isLiquid = ["juice","smoothie","tea","lemonade","soup"].includes(id);
    const phys = isLiquid ? drink() : food();
    def(id, [...parents, "fire","oil","water","salt","sugar","bread","flour","milk","egg"], { name, emoji, icon:null, tier:8, category:"life", tags:["food","dish"], phys, info:`${name}: a prepared food.` });
  }

  /* =========================================================================
     6) GEOGRAPHY — countries, landmarks, biomes, water bodies
     ========================================================================= */
  def("mountain", ["stone","pressure"], { name:"Mountain", emoji:"⛰️", icon:null, tier:5, category:"geology", tags:["large","earth"], phys:P.solid({ density:2.7, behavior:"static", color:"#7a7066" }), info:"Mountain: a large natural elevation of rock." });
  def("river", ["water","mountain"], { name:"River", emoji:"🏞️", icon:null, tier:4, category:"liquid", tags:["water","flowing"], phys:P.liquid({ density:1, behavior:"water", color:"#3b8fc4" }), info:"River: flowing freshwater toward the sea." });
  def("lake", ["water","land"], { name:"Lake", emoji:"🏞️", icon:null, tier:4, category:"liquid", tags:["water"], phys:P.liquid({ density:1, behavior:"water", color:"#2f7fb0" }), info:"Lake: an inland body of standing water." });
  def("island", ["land","sea"], { name:"Island", emoji:"🏝️", icon:null, tier:5, category:"geology", tags:["land"], phys:null, info:"Island: land surrounded by water." });
  def("ocean", ["sea","sea"], { name:"Ocean", emoji:"🌊", icon:null, tier:5, category:"liquid", tags:["water","vast"], phys:P.liquid({ density:1.03, behavior:"water", color:"#0f5e85" }), info:"Ocean: the vast connected body of salt water." });
  def("cave", ["mountain","water"], { name:"Cave", emoji:"🕳️", icon:null, tier:5, category:"geology", tags:["earth"], phys:null, info:"Cave: a natural hollow in rock." });
  def("canyon", ["river","time"], { name:"Canyon", emoji:"🏜️", icon:null, tier:6, category:"geology", tags:["earth"], phys:null, info:"Canyon: a deep gorge carved by a river." });
  def("jungle", ["forest","rain"], { name:"Jungle", emoji:"🌴", icon:null, tier:7, category:"life", tags:["biome"], phys:null, info:"Jungle: a dense tropical rainforest." });
  def("tundra", ["ice","grass"], { name:"Tundra", emoji:"🏔️", icon:null, tier:6, category:"geology", tags:["biome","cold"], phys:null, info:"Tundra: a cold, treeless biome." });
  def("savanna", ["grass","desert"], { name:"Savanna", emoji:"🌾", icon:null, tier:6, category:"life", tags:["biome"], phys:null, info:"Savanna: a tropical grassland with scattered trees." });
  def("reef", ["coral","ocean"], { name:"Coral Reef", emoji:"🪸", icon:null, tier:8, category:"life", tags:["biome","sea"], phys:null, info:"Coral reef: a vibrant undersea ecosystem built by coral." });
  def("waterfall", ["river","mountain"], { name:"Waterfall", emoji:"🌊", icon:null, tier:6, category:"liquid", tags:["water"], phys:P.liquid({ density:1, behavior:"water", color:"#9fd6ef" }), info:"Waterfall: a river plunging over a cliff.", });

  const COUNTRIES = [
    ["country_italy","Italy","🇮🇹",["human","pizza"]],
    ["country_japan","Japan","🇯🇵",["human","sushi"]],
    ["country_france","France","🇫🇷",["human","wine"]],
    ["country_egypt","Egypt","🇪🇬",["desert","human"]],
    ["country_brazil","Brazil","🇧🇷",["jungle","human"]],
    ["country_usa","USA","🇺🇸",["human","burger"]],
    ["country_china","China","🇨🇳",["human","rice"]],
    ["country_india","India","🇮🇳",["human","chili"]],
    ["country_mexico","Mexico","🇲🇽",["human","taco"]],
    ["country_switzerland","Switzerland","🇨🇭",["mountain","cheese"]],
    ["country_greece","Greece","🇬🇷",["island","human"]],
    ["country_canada","Canada","🇨🇦",["tundra","human"]],
  ];
  for (const [id,name,emoji,parents] of COUNTRIES)
    def(id, [...parents, "human","land","sea","mountain","city"], { name, emoji, icon:null, tier:9, category:"earth", tags:["place","country"], phys:null, info:`${name}: a country.` });

  const LANDMARKS = [
    ["pyramid","Pyramid","🔺",["stone","desert"]],
    ["castle","Castle","🏰",["stone","knight"]],
    ["lighthouse","Lighthouse","🗼",["light","sea"]],
    ["bridge","Bridge","🌉",["steel","river"]],
    ["skyscraper","Skyscraper","🏙️",["steel","glass"]],
    ["windmill","Windmill","🌬️",["wind","machine"]],
    ["statue","Statue","🗿",["stone","human"]],
    ["temple","Temple","🛕",["stone","god"]],
    ["stadium","Stadium","🏟️",["concrete","human"]],
    ["dam","Dam","🌊",["concrete","river"]],
  ];
  for (const [id,name,emoji,parents] of LANDMARKS)
    def(id, [...parents, "stone","steel","concrete","human","city","glass"], { name, emoji, icon:null, tier:9, category:"technology", tags:["building"], phys:null, info:`${name}: a built structure.` });

  def("city", ["house","house"], { name:"City", emoji:"🏙️", icon:null, tier:9, category:"technology", tags:["place"], phys:null, info:"City: a large permanent human settlement." });
  def("house", ["brick","wood"], { name:"House", emoji:"🏠", icon:null, tier:7, category:"technology", tags:["building"], phys:null, info:"House: a building where people live." });
  def("village", ["house","tree"], { name:"Village", emoji:"🏘️", icon:null, tier:8, category:"technology", tags:["place"], phys:null, info:"Village: a small rural settlement." });

  /* =========================================================================
     7) VEHICLES & TRANSPORT
     ========================================================================= */
  def("wheel", ["stone","stone"], { name:"Wheel", emoji:"🛞", icon:null, tier:5, category:"technology", tags:["part"], phys:P.solid({ density:1.2, behavior:"static", color:"#2b2b2b" }), info:"Wheel: a circle that turns to roll loads — a key invention.", });
  also("wood","wheel","wheel");
  def("engine", ["machine","fire"], { name:"Engine", emoji:"🔧", icon:null, tier:7, category:"technology", tags:["part"], phys:P.solid({ density:6, behavior:"static", color:"#5a5f66", conductive:true }), info:"Engine: a machine that converts fuel into motion." });
  const VEHICLES = [
    ["cart","Cart","🛒",["wheel","wood"]],
    ["car","Car","🚗",["engine","wheel"]],
    ["bicycle","Bicycle","🚲",["wheel","metal"]],
    ["motorcycle","Motorcycle","🏍️",["engine","bicycle"]],
    ["bus","Bus","🚌",["car","city"]],
    ["truck","Truck","🚚",["car","steel"]],
    ["train","Train","🚆",["engine","iron"]],
    ["boat","Boat","⛵",["wood","sea"]],
    ["ship","Ship","🚢",["boat","steel"]],
    ["submarine","Submarine","🛥️",["ship","ocean"]],
    ["airplane","Airplane","✈️",["engine","air"]],
    ["helicopter","Helicopter","🚁",["engine","wind"]],
    ["tractor","Tractor","🚜",["engine","wheat"]],
    ["tank","Tank","🛡️",["car","steel"]],
  ];
  for (const [id,name,emoji,parents] of VEHICLES)
    def(id, [...parents, "engine","wheel","metal","steel","machine","fire","oil","human"], { name, emoji, icon:null, tier:8, category:"technology", tags:["vehicle"], phys:null, info:`${name}: a vehicle.` });
  also("rocket","car","spaceship");
  def("spaceship", ["rocket","metal"], { name:"Spaceship", emoji:"🚀", icon:null, tier:10, category:"space", tags:["vehicle"], phys:null, info:"Spaceship: a craft built to travel beyond Earth." });

  /* =========================================================================
     8) TOOLS, TECH & EVERYDAY OBJECTS
     ========================================================================= */
  const TOOLS = [
    ["knife","Knife","🔪",["steel","stone"]],
    ["hammer","Hammer","🔨",["metal","wood"]],
    ["axe","Axe","🪓",["metal","tree"]],
    ["saw","Saw","🪚",["steel","wood"]],
    ["nail","Nail","📌",["iron","hammer"]],
    ["screw","Screw","🔩",["metal","machine"]],
    ["scissors","Scissors","✂️",["knife","knife"]],
    ["shovel","Shovel","🛠️",["metal","earth"]],
    ["key","Key","🔑",["metal","gold"]],
    ["lock","Lock","🔒",["metal","key"]],
    ["clock","Clock","🕰️",["machine","time"]],
    ["compass","Compass","🧭",["magnet","needle"]],
    ["needle","Needle","🪡",["iron","fire"]],
    ["telescope","Telescope","🔭",["glass","star"]],
    ["microscope","Microscope","🔬",["glass","cell"]],
    ["camera","Camera","📷",["glass","light"]],
    ["battery","Battery","🔋",["acid","metal"]],
    ["lightbulb","Light Bulb","💡",["glass","electricity"]],
    ["phone","Phone","📱",["computer","glass"]],
    ["television","Television","📺",["glass","electricity"]],
    ["radio","Radio","📻",["electricity","wind"]],
    ["speaker","Speaker","🔊",["electricity","sound"]],
    ["fridge","Fridge","🧊",["machine","ice"]],
    ["oven","Oven","🔥",["machine","heat"]],
    ["umbrella","Umbrella","☂️",["fabric","rain"]],
    ["candle","Candle","🕯️",["wax","fire"]],
    ["book","Book","📚",["paper","ink"]],
    ["pencil","Pencil","✏️",["graphite","wood"]],
    ["mirror","Mirror","🪞",["glass","silver"]],
    ["bottle","Bottle","🍾",["glass","sand"]],
  ];
  for (const [id,name,emoji,parents] of TOOLS)
    def(id, [...parents, "metal","steel","iron","glass","wood","machine","electricity","fire","stone","plastic"], { name, emoji, icon:null, tier:7, category:"technology", tags:["tool"], phys:P.solid({ density:3, behavior:"static", color:"#8a8f96" }), info:`${name}: a useful object.` });

  // supporting materials
  def("sound", ["air","music"], { name:"Sound", emoji:"🔉", icon:null, tier:5, category:"physics", tags:["wave"], phys:null, info:"Sound: pressure waves travelling through a medium." });
  def("music", ["sound","human"], { name:"Music", emoji:"🎵", icon:null, tier:6, category:"physics", tags:["art"], phys:null, info:"Music: organised sound and silence." });
  def("paper", ["wood","water"], { name:"Paper", emoji:"📄", icon:null, tier:6, category:"materials", tags:["material"], phys:P.solid({ density:0.8, behavior:"static", color:"#f2efe6", flammable:true }), info:"Paper: thin sheets pressed from wood pulp." });
  def("plastic", ["oil","heat"], { name:"Plastic", emoji:"🧴", icon:null, tier:6, category:"materials", tags:["material"], phys:P.solid({ density:1.1, behavior:"static", color:"#cfd6dd", flammable:true }), info:"Plastic: a moldable polymer made from oil." });
  def("rubber", ["oil","sulfur"], { name:"Rubber", emoji:"🛞", icon:null, tier:6, category:"materials", tags:["material"], phys:P.solid({ density:1.1, behavior:"static", color:"#222", flammable:true }), info:"Rubber: an elastic polymer from latex or oil." });
  def("wax", ["oil","plant"], { name:"Wax", emoji:"🕯️", icon:null, tier:6, category:"materials", tags:["material"], phys:P.solid({ density:0.9, behavior:"static", color:"#f0e6c0", meltAt:60, meltTo:"oil", flammable:true }), info:"Wax: a soft, meltable, water-repellent solid." });
  def("fabric", ["wool","silk"], { name:"Fabric", emoji:"🧵", icon:null, tier:7, category:"materials", tags:["material"], phys:P.solid({ density:0.7, behavior:"static", color:"#d8cdbb", flammable:true }), info:"Fabric: woven cloth." });

  const TECH = [
    ["computer_chip","Microchip","🔲",["silicon","electricity"]],
    ["transistor","Transistor","🔌",["silicon","metal"]],
    ["laser","Laser","🔦",["light","crystal"]],
    ["solar_panel","Solar Panel","🔆",["silicon","sun"]],
    ["satellite","Satellite","🛰️",["machine","space"]],
    ["drone","Drone","🛸",["robot","air"]],
    ["smartwatch","Smartwatch","⌚",["computer_chip","clock"]],
    ["headphones","Headphones","🎧",["speaker","music"]],
    ["keyboard","Keyboard","⌨️",["computer","plastic"]],
    ["printer","Printer","🖨️",["computer","ink"]],
    ["gps","GPS","📍",["satellite","compass"]],
    ["wifi","Wi-Fi","📶",["radio","internet"]],
  ];
  for (const [id,name,emoji,parents] of TECH)
    def(id, [...parents, "silicon","electricity","computer","machine","metal","glass","light","internet"], { name, emoji, icon:null, tier:9, category:"technology", tags:["tech"], phys:null, info:`${name}: a piece of technology.` });
  def("crystal", ["stone","pressure"], { name:"Crystal", emoji:"💎", icon:null, tier:5, category:"geology", tags:["mineral"], phys:P.solid({ density:2.6, behavior:"static", color:"#bfeaff" }), info:"Crystal: a solid with atoms in a repeating lattice." });

  /* =========================================================================
     9) SPACE & ASTRONOMY
     ========================================================================= */
  const SPACE = [
    ["planet","Planet","🪐",["space","stone"]],
    ["mars","Mars","🔴",["planet","rust"]],
    ["jupiter","Jupiter","🟠",["planet","storm"]],
    ["saturn","Saturn","🪐",["planet","ice"]],
    ["earth_planet","Earth","🌍",["planet","life"]],
    ["comet","Comet","☄️",["ice","space"]],
    ["asteroid","Asteroid","🌑",["stone","space"]],
    ["meteor","Meteor","💫",["asteroid","air"]],
    ["galaxy","Galaxy","🌌",["star","star"]],
    ["nebula","Nebula","🌫️",["gas","space"]],
    ["black_hole","Black Hole","🕳️",["star","pressure"]],
    ["supernova","Supernova","💥",["star","fire"]],
    ["solar_system","Solar System","☀️",["sun","planet"]],
    ["constellation","Constellation","✨",["star","time"]],
    ["astronaut","Astronaut","🧑‍🚀",["human","spaceship"]],
    ["space_station","Space Station","🛰️",["satellite","astronaut"]],
  ];
  for (const [id,name,emoji,parents] of SPACE)
    def(id, [...parents, "space","star","sun","moon","planet","stone","ice","gas","fire"], { name, emoji, icon:null, tier:9, category:"space", tags:["space"], phys:null, info:`${name}: an object in space.` });

  /* =========================================================================
     10) WEATHER & NATURE EXTRAS
     ========================================================================= */
  const WEATHER = [
    ["fog","Fog","🌫️",["cloud","earth"]],
    ["frost","Frost","❄️",["ice","grass"]],
    ["hail","Hail","🧊",["ice","storm"]],
    ["thunder","Thunder","🌩️",["sound","storm"]],
    ["rainbow_w","Double Rainbow","🌈",["rain","rain"]],
    ["aurora","Aurora","🌌",["light","wind"]],
    ["blizzard","Blizzard","🌨️",["snow","storm"]],
    ["drought","Drought","🏜️",["desert","time"]],
    ["flood","Flood","🌊",["rain","river"]],
    ["avalanche","Avalanche","🏔️",["snow","mountain"]],
    ["mist","Mist","🌁",["water","air"]],
    ["dew","Dew","💧",["cold","grass"]],
  ];
  for (const [id,name,emoji,parents] of WEATHER)
    def(id, [...parents, "cloud","rain","storm","ice","snow","wind","water","cold","heat","sun"], { name, emoji, icon:null, tier:6, category:"weather", tags:["weather"], phys:null, info:`${name}: a weather phenomenon.` });

  /* =========================================================================
     11) HUMAN — anatomy, professions, society
     ========================================================================= */
  def("dna", ["cell","life"], { name:"DNA", emoji:"🧬", icon:null, tier:7, category:"life", tags:["organic"], phys:null, info:"DNA: the molecule that stores genetic instructions." });
  def("brain", ["human","electricity"], { name:"Brain", emoji:"🧠", icon:null, tier:8, category:"life", tags:["organ"], phys:null, info:"Brain: the organ of thought and control." });
  def("heart", ["human","blood"], { name:"Heart", emoji:"🫀", icon:null, tier:8, category:"life", tags:["organ"], phys:null, info:"Heart: the muscle that pumps blood." });
  def("bone", ["human","element_calcium"], { name:"Bone", emoji:"🦴", icon:null, tier:7, category:"life", tags:["organ"], phys:P.solid({ density:1.8, behavior:"static", color:"#efe9d6" }), info:"Bone: rigid tissue forming the skeleton." });
  def("muscle", ["meat","life"], { name:"Muscle", emoji:"💪", icon:null, tier:7, category:"life", tags:["organ"], phys:null, info:"Muscle: tissue that contracts to create movement." });
  def("eye", ["human","light"], { name:"Eye", emoji:"👁️", icon:null, tier:8, category:"life", tags:["organ"], phys:null, info:"Eye: the organ of sight." });

  const JOBS = [
    ["doctor","Doctor","🩺",["human","heart"]],
    ["teacher","Teacher","🧑‍🏫",["human","book"]],
    ["farmer","Farmer","🧑‍🌾",["human","wheat"]],
    ["chef","Chef","🧑‍🍳",["human","oven"]],
    ["scientist","Scientist","🧑‍🔬",["human","microscope"]],
    ["artist","Artist","🧑‍🎨",["human","paint"]],
    ["musician","Musician","🎼",["human","music"]],
    ["soldier","Soldier","🪖",["human","tank"]],
    ["firefighter","Firefighter","🧑‍🚒",["human","fire"]],
    ["pilot","Pilot","🧑‍✈️",["human","airplane"]],
    ["sailor","Sailor","⚓",["human","ship"]],
    ["miner","Miner","⛏️",["human","cave"]],
    ["king","King","🤴",["human","gold"]],
    ["queen","Queen","👸",["human","crown"]],
  ];
  for (const [id,name,emoji,parents] of JOBS)
    def(id, [...parents, "human","city","book","hammer","machine","gold"], { name, emoji, icon:null, tier:9, category:"life", tags:["person","job"], phys:null, info:`${name}: a human profession or role.` });
  def("paint", ["oil","rainbow"], { name:"Paint", emoji:"🎨", icon:null, tier:6, category:"materials", tags:["material"], phys:P.liquid({ density:1.3, behavior:"water", color:"#e84d8a" }), info:"Paint: pigmented liquid for coating surfaces." });
  def("crown", ["gold","diamond"], { name:"Crown", emoji:"👑", icon:null, tier:9, category:"materials", tags:["jewelry"], phys:P.solid({ density:19, behavior:"static", color:"#ffd54a" }), info:"Crown: a royal headpiece of precious metal." });

  /* =========================================================================
     12) SPORTS, MUSIC INSTRUMENTS, ART
     ========================================================================= */
  const INSTRUMENTS = [
    ["guitar","Guitar","🎸",["wood","music"]],
    ["piano","Piano","🎹",["wood","metal"]],
    ["drum","Drum","🥁",["leather","wood"]],
    ["violin","Violin","🎻",["wood","silk"]],
    ["trumpet","Trumpet","🎺",["metal","air"]],
    ["flute","Flute","🪈",["metal","wind"]],
    ["microphone","Microphone","🎤",["metal","sound"]],
    ["synthesizer","Synthesizer","🎛️",["electricity","music"]],
  ];
  for (const [id,name,emoji,parents] of INSTRUMENTS)
    def(id, [...parents, "wood","metal","music","sound","electricity","air","human"], { name, emoji, icon:null, tier:8, category:"technology", tags:["instrument"], phys:null, info:`${name}: a musical instrument.` });

  const SPORTS = [
    ["ball","Ball","⚽",["rubber","air"]],
    ["football","Football","🏈",["ball","human"]],
    ["basketball","Basketball","🏀",["ball","city"]],
    ["tennis","Tennis","🎾",["ball","grass"]],
    ["skateboard","Skateboard","🛹",["wheel","wood"]],
    ["ski","Ski","🎿",["wood","snow"]],
    ["surfboard","Surfboard","🏄",["wood","wave"]],
    ["trophy","Trophy","🏆",["gold","sport"]],
  ];
  for (const [id,name,emoji,parents] of SPORTS)
    def(id, [...parents, "ball","rubber","wood","human","wheel","grass","gold"], { name, emoji, icon:null, tier:8, category:"technology", tags:["sport"], phys:null, info:`${name}: a sport or sports object.` });
  def("sport", ["ball","human"], { name:"Sport", emoji:"🏅", icon:null, tier:8, category:"life", tags:["activity"], phys:null, info:"Sport: organised physical competition." });

  return { count: elements.size };
}
