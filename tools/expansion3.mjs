/* ============================================================================
   CRUCIBLE — Realistic Element Expansion BATCH 3 (v3.3)
   Pushes the library comfortably past 1000 real elements.
============================================================================ */
export function buildExpansion3(ctx) {
  const { el, combine, P, elements, recipes, key } = ctx;
  const has = (id) => elements.has(id);
  const used = (a, b) => recipes.has(key(a, b));
  const HUBS = ["water","fire","earth","air","life","human","plant","metal","stone",
    "sand","glass","wood","energy","heat","time","light","sun","sea","salt","oil",
    "carbon","ice","cloud","electricity","machine","acid","gas","animal","mammal",
    "bird","fish","insect","reptile","tree","flower","fruit","vegetable","grass",
    "leaf","city","house","steel","iron","gold","silver","music","sound","blood",
    "bone","brain","milk","meat","egg","honey","paper","plastic","rubber","fabric",
    "crystal","mountain","river","ocean","planet","star","space","engine","wheel",
    "computer","robot","metal","forest","jungle","desert","snow","mud","wine","beer",
    "coffee","tea","bread","cheese","rice","corn","wheat","sugar","chocolate","dough"];
  function attach(id, parents) {
    for (let i = 0; i < parents.length; i++)
      for (let j = i; j < parents.length; j++) {
        const a = parents[i], b = parents[j];
        if (a === id || b === id || !has(a) || !has(b) || used(a, b)) continue;
        combine(a, b, id); return true;
      }
    return false;
  }
  function def(id, parents, defObj) {
    if (has(id)) return id;
    el(id, defObj);
    if (!attach(id, parents)) attach(id, [...parents, ...HUBS]);
    return id;
  }
  const food  = () => P.solid({ density:1.0, behavior:"static", color:"#d9a066" });
  const drink = () => P.liquid({ density:1.0, behavior:"water", color:"#c98a3a" });
  const solid = (c) => () => P.solid({ density:3, behavior:"static", color:c });

  function batch(arr, parents, tier, cat, tags, physMaker) {
    for (const [id,name,emoji] of arr)
      def(id, parents, { name, emoji, icon:null, tier, category:cat, tags, phys: physMaker?physMaker():null, info:`${name}.` });
  }

  /* prehistoric / extinct (real) */
  batch([
    ["mammoth","Mammoth","🦣"],["sabertooth","Sabertooth Tiger","🐯"],["dodo","Dodo","🦤"],
    ["pterodactyl","Pterodactyl","🦅"],["triceratops","Triceratops","🦕"],["stegosaurus","Stegosaurus","🦕"],
    ["velociraptor","Velociraptor","🦖"],["trilobite","Trilobite","🦂"],["ammonite","Ammonite","🐚"],
    ["megalodon","Megalodon","🦈"],["fossil","Fossil","🦴"],["amber_fossil","Amber Insect","🦟"],
  ], ["dinosaur","trex","ice","stone","time","bone","animal","mammal","sea","amber","tree","earth"], 8, "life", ["animal","extinct"], null);

  /* world animals breadth */
  batch([
    ["crab_hermit","Hermit Crab","🦀"],["lobster_spiny","Spiny Lobster","🦞"],["meerkat","Meerkat","🦝"],
    ["armadillo","Armadillo","🦔"],["anteater","Anteater","🐜"],["platypus","Platypus","🦆"],
    ["wombat","Wombat","🐨"],["tapir","Tapir","🐗"],["okapi","Okapi","🦒"],
    ["antelope","Antelope","🦌"],["gazelle","Gazelle","🦌"],["buffalo","Buffalo","🐃"],
    ["yak","Yak","🐂"],["alpaca","Alpaca","🦙"],["porcupine","Porcupine","🦔"],
    ["weasel","Weasel","🦡"],["mongoose","Mongoose","🦝"],["lynx","Lynx","🐈"],
    ["cougar","Cougar","🐆"],["jaguar","Jaguar","🐆"],["polar_bear","Polar Bear","🐻‍❄️"],
    ["grizzly","Grizzly Bear","🐻"],["orangutan","Orangutan","🦧"],["chimpanzee","Chimpanzee","🐒"],
    ["baboon","Baboon","🐒"],["gibbon","Gibbon","🐒"],["aardvark","Aardvark","🐗"],
  ], ["mammal","savanna","jungle","forest","mountain","desert","snow","grass","river","tree","tundra","cave","animal"], 7, "life", ["animal","mammal"], null);

  /* world cuisines & foods */
  batch([
    ["ramen","Ramen","🍜"],["pho","Pho","🍜"],["gnocchi","Gnocchi","🍝"],
    ["lasagna","Lasagna","🍝"],["ravioli","Ravioli","🥟"],["burrito","Burrito","🌯"],
    ["quesadilla","Quesadilla","🫓"],["nachos","Nachos","🧀"],["falafel","Falafel","🧆"],
    ["hummus","Hummus","🥣"],["gyro","Gyro","🥙"],["shawarma","Shawarma","🥙"],
    ["tempura","Tempura","🍤"],["dimsum","Dim Sum","🥟"],["springroll","Spring Roll","🥢"],
    ["gelato","Gelato","🍨"],["tiramisu","Tiramisu","🍰"],["baklava","Baklava","🍯"],
    ["crepe","Crepe","🥞"],["churro","Churro","🍢"],["macaron","Macaron","🍬"],
    ["fondue","Fondue","🫕"],["raclette","Raclette","🧀"],["goulash","Goulash","🍲"],
    ["biryani","Biryani","🍛"],["tikka","Tikka","🍢"],["sashimi","Sashimi","🍣"],
    ["ceviche","Ceviche","🐟"],["paella_seafood","Seafood Paella","🦐"],["bouillabaisse","Bouillabaisse","🍲"],
  ], ["noodle","pasta","dough","rice","meat","fish","cheese","tomato","oil","sugar","egg","flour","bread","vegetable","milk","heat","chocolate"], 8, "life", ["food","dish"], food);

  /* drinks of the world */
  batch([
    ["sake","Sake","🍶"],["rum","Rum","🥃"],["tequila","Tequila","🥃"],
    ["gin","Gin","🍸"],["brandy","Brandy","🥃"],["mead","Mead","🍯"],
    ["kombucha","Kombucha","🍵"],["matcha","Matcha","🍵"],["chai","Chai","🍵"],
    ["mojito","Mojito","🍹"],["margarita","Margarita","🍹"],["sangria","Sangria","🍷"],
    ["hotchocolate","Hot Chocolate","☕"],["eggnog","Eggnog","🥛"],["limoncello","Limoncello","🍋"],
  ], ["alcohol","wine","beer","sugar","fruit","milk","coffee","tea","honey","water","ice","mint","chocolate","egg","lemon"], 8, "life", ["food","drink"], drink);

  /* more chemistry compounds */
  batch([
    ["salt_epsom","Epsom Salt","🧂"],["chlorine_bleach","Bleach","🧴"],["vinegar","Vinegar","🧴"],
    ["citric_acid","Citric Acid","🍋"],["caffeine","Caffeine","☕"],["nicotine","Nicotine","🚬"],
    ["aspirin","Aspirin","💊"],["penicillin","Penicillin","💊"],["insulin","Insulin","💉"],
    ["soap","Soap","🧼"],["detergent","Detergent","🧴"],["perfume","Perfume","🌸"],
    ["dye","Dye","🎨"],["pigment","Pigment","🎨"],["resin","Resin","🟤"],
    ["cellulose","Cellulose","📄"],["starch","Starch","🥔"],["keratin","Keratin","💅"],
    ["collagen","Collagen","🧬"],["chlorophyll","Chlorophyll","🌿"],["melanin","Melanin","🟤"],
    ["adrenaline","Adrenaline","💉"],["dopamine","Dopamine","🧠"],["enzyme","Enzyme","🧬"],
  ], ["acid","salt","water","oil","plant","blood","cell","sugar","fire","flower","carbon","leaf","brain","milk","fruit","potato","bacteria"], 5, "chemical", ["compound"], () => P.liquid({ density:1.1, behavior:"water", color:"#cfe0a0" }));

  /* musical instruments / world */
  batch([
    ["harp","Harp","🪕"],["banjo","Banjo","🪕"],["cello","Cello","🎻"],
    ["saxophone","Saxophone","🎷"],["clarinet","Clarinet","🎶"],["oboe","Oboe","🎶"],
    ["accordion","Accordion","🪗"],["harmonica","Harmonica","🎶"],["tambourine","Tambourine","🥁"],
    ["bongo","Bongo","🥁"],["xylophone","Xylophone","🎹"],["bagpipe","Bagpipe","🎶"],
    ["didgeridoo","Didgeridoo","🎶"],["ukulele","Ukulele","🎸"],["organ","Organ","🎹"],
  ], ["wood","metal","music","sound","air","wind","string","leather","human","brass"], 8, "technology", ["instrument"], null);
  def("string", ["silk","wood"], { name:"String", emoji:"🧵", icon:null, tier:6, category:"materials", tags:["material"], phys:null, info:"String: thin cord used for tying and instruments." });
  def("brass", ["copper","element_zinc"], { name:"Brass", emoji:"🎺", icon:null, tier:5, category:"metal", tags:["alloy"], phys:P.solid({ density:8.5, behavior:"static", color:"#c9a13a", conductive:true }), info:"Brass: a gold-coloured copper-zinc alloy." });

  /* sports & games */
  batch([
    ["chess","Chess","♟️"],["dice","Dice","🎲"],["cards","Playing Cards","🃏"],
    ["dart","Darts","🎯"],["bowling","Bowling","🎳"],["billiards","Billiards","🎱"],
    ["golf","Golf","⛳"],["baseball","Baseball","⚾"],["volleyball","Volleyball","🏐"],
    ["rugby","Rugby","🏉"],["hockey","Hockey","🏒"],["boxing","Boxing","🥊"],
    ["archery","Archery","🏹"],["fencing","Fencing","🤺"],["climbing","Climbing","🧗"],
    ["diving","Diving","🤿"],["sailing","Sailing","⛵"],["kayak","Kayak","🛶"],
  ], ["ball","human","wood","grass","sport","gold","sea","mountain","ice","steel","rubber","wheel","string"], 8, "technology", ["sport","game"], null);

  /* world landmarks (real) */
  batch([
    ["eiffel_tower","Eiffel Tower","🗼"],["great_wall","Great Wall","🧱"],["colosseum","Colosseum","🏛️"],
    ["taj_mahal","Taj Mahal","🕌"],["statue_liberty","Statue of Liberty","🗽"],["big_ben","Big Ben","🕰️"],
    ["sphinx","Sphinx","🦁"],["stonehenge","Stonehenge","🪨"],["machu_picchu","Machu Picchu","⛰️"],
    ["leaning_tower","Leaning Tower","🗼"],["windmill_dutch","Dutch Windmill","🌬️"],["pagoda","Pagoda","🏯"],
  ], ["tower","stone","metal","statue","city","pyramid","castle","temple","mountain","steel","wind","clock","human"], 9, "technology", ["landmark"], null);

  /* gemstones / metals breadth */
  batch([
    ["bronze","Bronze","🥉"],["pewter","Pewter","🍺"],["alloy_steel","Stainless Steel","🔩"],
    ["titanium_alloy","Titanium Alloy","🛩️"],["solder","Solder","🔌"],["amalgam","Amalgam","🦷"],
    ["foil","Foil","🥫"],["wire","Wire","🔌"],["coin","Coin","🪙"],
    ["ingot","Ingot","🧱"],["horseshoe","Horseshoe","🧲"],["bell","Bell","🔔"],
  ], ["copper","tin","iron","steel","metal","gold","silver","element_zinc","element_nickel","brass","fire","horse","sound"], 6, "metal", ["metal","alloy"], () => P.solid({ density:8, behavior:"static", color:"#b0894a", conductive:true }));

  /* nature / geography extra */
  batch([
    ["valley","Valley","🏞️"],["plateau","Plateau","🏔️"],["fjord","Fjord","🏞️"],
    ["delta","Delta","🛶"],["oasis","Oasis","🏝️"],["geode","Geode","💎"],
    ["stalactite","Stalactite","🪨"],["coral_atoll","Atoll","🏝️"],["wetland","Wetland","🦆"],
    ["prairie","Prairie","🌾"],["steppe","Steppe","🌾"],["rainforest","Rainforest","🌧️"],
    ["mangrove","Mangrove","🌳"],["meadow","Meadow","🌼"],["dunefield","Dune Field","🏜️"],
  ], ["mountain","river","sea","desert","cave","crystal","forest","grass","rain","tree","flower","sand","swamp","water","jungle","land"], 7, "geology", ["biome","place"], null);

  /* household & misc objects */
  batch([
    ["clockwork","Clockwork","⚙️"],["telescope_space","Space Telescope","🔭"],["wind_turbine","Wind Turbine","🌬️"],
    ["solar_farm","Solar Farm","🔆"],["dam_hydro","Hydro Dam","🌊"],["reactor","Nuclear Reactor","☢️"],
    ["greenhouse","Greenhouse","🪴"],["aqueduct","Aqueduct","🌉"],["elevator","Elevator","🛗"],
    ["escalator","Escalator","🪜"],["crane","Crane","🏗️"],["bulldozer","Bulldozer","🚜"],
    ["antenna","Antenna","📡"],["lightning_rod","Lightning Rod","⚡"],["battery_pack","Power Bank","🔋"],
  ], ["machine","metal","steel","electricity","sun","wind","water","glass","concrete","element_uranium","engine","plant","city","radio"], 9, "technology", ["machine"], null);

  return { count: elements.size };
}
