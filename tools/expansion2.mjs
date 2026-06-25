/* ============================================================================
   CRUCIBLE — Realistic Element Expansion BATCH 2 (v3.2)
   ----------------------------------------------------------------------------
   Second wave of real, existing things to push the library past 1000 elements.
   Same uniqueness/reachability guarantees via the shared auto-pairing helper.
============================================================================ */

export function buildExpansion2(ctx) {
  const { el, combine, P, elements, recipes, key } = ctx;

  const has = (id) => elements.has(id);
  const used = (a, b) => recipes.has(key(a, b));

  const HUBS = ["water","fire","earth","air","life","human","plant","metal",
    "stone","sand","glass","wood","energy","heat","time","light","sun","sea",
    "salt","oil","carbon","ice","cloud","electricity","machine","acid","gas",
    "animal","mammal","bird","fish","insect","tree","flower","fruit","vegetable",
    "grass","leaf","city","house","metal","steel","iron","gold","music","sound",
    "blood","bone","brain","milk","meat","egg","honey","silk","wool","leather",
    "paper","plastic","rubber","fabric","wax","crystal","mountain","river","ocean",
    "planet","star","space","engine","wheel","computer","robot","tool","paint"];

  function attach(id, parents) {
    for (let i = 0; i < parents.length; i++)
      for (let j = i; j < parents.length; j++) {
        const a = parents[i], b = parents[j];
        if (a === id || b === id) continue; // never self-reference
        if (!has(a) || !has(b) || used(a, b)) continue;
        combine(a, b, id);
        return true;
      }
    return false;
  }
  function def(id, parents, defObj) {
    if (has(id)) return id;
    el(id, defObj);
    if (!attach(id, parents)) attach(id, [...parents, ...HUBS]);
    return id;
  }
  const food  = (o={}) => P.solid({ density:1.0, behavior:"static", color:"#d9a066", ...o });
  const drink = (o={}) => P.liquid({ density:1.0, behavior:"water", color:"#c98a3a", ...o });
  const liv   = (info,name) => ({ phys:null });

  // generic helper to add a themed batch of living things (no phys)
  function batchLife(arr, parents, tier, tags) {
    for (const [id,name,emoji] of arr)
      def(id, parents, { name, emoji, icon:null, tier, category:"life", tags, phys:null, info:`${name}: a living thing.` });
  }
  function batchObj(arr, parents, tier, cat, tags, physMaker) {
    for (const [id,name,emoji] of arr)
      def(id, parents, { name, emoji, icon:null, tier, category:cat, tags, phys: physMaker ? physMaker() : null, info:`${name}.` });
  }

  /* ---- more mammals ---- */
  batchLife([
    ["leopard","Leopard","🐆"],["cheetah","Cheetah","🐆"],["panther","Panther","🐈‍⬛"],
    ["hyena","Hyena","🐺"],["jackal","Jackal","🐕"],["raccoon","Raccoon","🦝"],
    ["squirrel","Squirrel","🐿️"],["hedgehog","Hedgehog","🦔"],["otter","Otter","🦦"],
    ["beaver","Beaver","🦫"],["badger","Badger","🦡"],["skunk","Skunk","🦨"],
    ["sloth","Sloth","🦥"],["koala","Koala","🐨"],["panda","Panda","🐼"],
    ["llama","Llama","🦙"],["goat","Goat","🐐"],["donkey","Donkey","🫏"],
    ["bull","Bull","🐂"],["bison","Bison","🦬"],["boar","Boar","🐗"],
    ["moose","Moose","🫎"],["seal","Seal","🦭"],["walrus","Walrus","🦭"],
    ["mole","Mole","🦫"],["rat","Rat","🐀"],["hamster","Hamster","🐹"],
    ["chipmunk","Chipmunk","🐿️"],["ferret","Ferret","🦦"],["lemur","Lemur","🐒"],
  ], ["mammal","forest","grass","mountain","river","tree","earth","snow","sea","desert","jungle","savanna","tundra"], 7, ["animal","mammal"]);

  /* ---- more birds ---- */
  batchLife([
    ["sparrow","Sparrow","🐦"],["robin","Robin","🐦"],["pigeon","Pigeon","🕊️"],
    ["dove","Dove","🕊️"],["seagull","Seagull","🕊️"],["pelican","Pelican","🐦"],
    ["stork","Stork","🐦"],["heron","Heron","🐦"],["woodpecker","Woodpecker","🐦"],
    ["hummingbird","Hummingbird","🐦"],["falcon","Falcon","🦅"],["hawk","Hawk","🦅"],
    ["vulture","Vulture","🦅"],["toucan","Toucan","🦜"],["kingfisher","Kingfisher","🐦"],
    ["turkey","Turkey","🦃"],["goose","Goose","🪿"],["rooster","Rooster","🐓"],
  ], ["bird","air","tree","sea","river","forest","mountain","sky","feather","egg","jungle","ice"], 7, ["animal","bird"]);
  def("sky", ["air","light"], { name:"Sky", emoji:"🌌", icon:null, tier:3, category:"weather", tags:["air"], phys:null, info:"Sky: the atmosphere seen from the ground." });

  /* ---- more sea life ---- */
  batchLife([
    ["clownfish","Clownfish","🐠"],["pufferfish","Pufferfish","🐡"],["salmon","Salmon","🐟"],
    ["tuna","Tuna","🐟"],["eel","Eel","🐍"],["stingray","Stingray","🐟"],
    ["swordfish","Swordfish","🐟"],["anglerfish","Anglerfish","🐟"],["manta_ray","Manta Ray","🐟"],
    ["orca","Orca","🐋"],["narwhal","Narwhal","🐋"],["barnacle","Barnacle","🦪"],
    ["oyster","Oyster","🦪"],["clam","Clam","🐚"],["mussel","Mussel","🦪"],
    ["urchin","Sea Urchin","🦔"],["anemone","Sea Anemone","🪸"],["plankton","Plankton","🦠"],
  ], ["fish","sea","ocean","water","salt","reef","coral","ice","sand","stone"], 7, ["animal","sea"]);

  /* ---- more bugs/reptiles/amphibians ---- */
  batchLife([
    ["beetle","Beetle","🪲"],["cockroach","Cockroach","🪳"],["cricket","Cricket","🦗"],
    ["moth","Moth","🦋"],["termite","Termite","🐜"],["wasp","Wasp","🐝"],
    ["centipede","Centipede","🐛"],["millipede","Millipede","🐛"],["tick","Tick","🕷️"],
    ["firefly","Firefly","🪰"],["caterpillar","Caterpillar","🐛"],["maggot","Maggot","🪱"],
    ["gecko","Gecko","🦎"],["iguana","Iguana","🦎"],["chameleon","Chameleon","🦎"],
    ["cobra","Cobra","🐍"],["python","Python","🐍"],["viper","Viper","🐍"],
    ["toad","Toad","🐸"],["salamander","Salamander","🦎"],["newt","Newt","🦎"],
    ["tadpole","Tadpole","🐸"],["dinosaur","Dinosaur","🦕"],["trex","T-Rex","🦖"],
  ], ["insect","reptile","amphibian","forest","swamp","grass","mud","leaf","flower","jungle","desert","stone","egg","life"], 7, ["animal"]);

  /* ---- trees & plants breadth ---- */
  batchLife([
    ["oak","Oak","🌳"],["pine","Pine","🌲"],["birch","Birch","🌳"],
    ["willow","Willow","🌳"],["cedar","Cedar","🌲"],["redwood","Redwood","🌲"],
    ["fern","Fern","🌿"],["ivy","Ivy","🌿"],["vine","Vine","🌿"],
    ["seaweed","Seaweed","🌿"],["algae","Algae","🦠"],["lichen","Lichen","🌿"],
    ["dandelion","Dandelion","🌼"],["orchid","Orchid","🌸"],["lavender","Lavender","💜"],
    ["clover","Clover","🍀"],["thistle","Thistle","🌿"],["reed","Reed","🌾"],
    ["wheatgrass","Wheatgrass","🌾"],["nettle","Nettle","🌿"],["mint","Mint","🌿"],
    ["basil","Basil","🌿"],["rosemary","Rosemary","🌿"],["thyme","Thyme","🌿"],
  ], ["tree","plant","leaf","seed","forest","grass","flower","water","sun","mountain","sea","swamp","jungle","earth"], 6, ["plant"]);

  /* ---- nuts, grains, spices ---- */
  batchObj([
    ["nut","Nut","🌰"],["almond","Almond","🌰"],["walnut","Walnut","🌰"],
    ["peanut","Peanut","🥜"],["chestnut","Chestnut","🌰"],["oat","Oat","🌾"],
    ["barley","Barley","🌾"],["soy","Soybean","🫘"],["bean","Bean","🫘"],
    ["lentil","Lentil","🫘"],["pea","Pea","🫛"],["pepper_spice","Black Pepper","🧂"],
    ["cinnamon","Cinnamon","🟤"],["ginger","Ginger","🫚"],["vanilla","Vanilla","🟤"],
    ["saffron","Saffron","🌸"],["paprika","Paprika","🌶️"],["cumin","Cumin","🟤"],
  ], ["seed","tree","plant","grass","fruit","wheat","sun","earth","leaf","root"], 7, "life", ["food","plant"], food);
  def("root", ["plant","earth"], { name:"Root", emoji:"🥕", icon:null, tier:5, category:"life", tags:["plant"], phys:null, info:"Root: the underground part of a plant." });

  /* ---- more dishes & drinks ---- */
  batchObj([
    ["pie","Pie","🥧"],["bagel","Bagel","🥯"],["croissant","Croissant","🥐"],
    ["pretzel","Pretzel","🥨"],["waffle","Waffle","🧇"],["muffin","Muffin","🧁"],
    ["dumpling","Dumpling","🥟"],["noodle","Noodle","🍜"],["curry","Curry","🍛"],
    ["stew","Stew","🍲"],["risotto","Risotto","🍚"],["paella","Paella","🥘"],
    ["kebab","Kebab","🍢"],["hotdog","Hot Dog","🌭"],["bacon","Bacon","🥓"],
    ["sausage","Sausage","🌭"],["ham","Ham","🍖"],["ribs","Ribs","🍖"],
    ["soup_tomato","Tomato Soup","🍲"],["porridge","Porridge","🥣"],["cereal","Cereal","🥣"],
    ["toast","Toast","🍞"],["pudding","Pudding","🍮"],["candy","Candy","🍬"],
    ["lollipop","Lollipop","🍭"],["marshmallow","Marshmallow","🍡"],["caramel","Caramel","🍮"],
  ], ["dough","flour","meat","rice","egg","butter","sugar","fire","oil","tomato","cheese","vegetable","bread","milk","chocolate","heat"], 8, "life", ["food","dish"], food);
  batchObj([
    ["soda","Soda","🥤"],["milkshake","Milkshake","🥤"],["cocktail","Cocktail","🍹"],
    ["espresso","Espresso","☕"],["latte","Latte","☕"],["cappuccino","Cappuccino","☕"],
    ["whiskey","Whiskey","🥃"],["vodka","Vodka","🍸"],["champagne","Champagne","🍾"],
    ["cider","Cider","🍺"],["punch","Punch","🍹"],["nectar","Nectar","🍯"],
  ], ["water","sugar","milk","coffee","alcohol","fruit","ice","wine","beer","gas","honey"], 8, "life", ["food","drink"], drink);

  /* ---- minerals, gems, geology ---- */
  batchObj([
    ["quartz","Quartz","💎"],["ruby","Ruby","💎"],["sapphire","Sapphire","💎"],
    ["emerald","Emerald","💚"],["amethyst","Amethyst","💜"],["topaz","Topaz","💛"],
    ["opal","Opal","🌈"],["jade","Jade","🟢"],["pearl","Pearl","🦪"],
    ["amber","Amber","🟠"],["obsidian","Obsidian","⚫"],["granite","Granite","🪨"],
    ["marble","Marble","🏛️"],["limestone","Limestone","🪨"],["sandstone","Sandstone","🪨"],
    ["slate","Slate","🪨"],["basalt","Basalt","🪨"],["flint","Flint","🪨"],
    ["chalk","Chalk","⚪"],["gypsum","Gypsum","⚪"],["quartzite","Quartzite","🪨"],
    ["onyx","Onyx","⚫"],["turquoise","Turquoise","🔵"],["garnet","Garnet","🔴"],
  ], ["stone","crystal","pressure","heat","mountain","lava","sea","sand","earth","diamond","salt","time"], 5, "geology",
     ["mineral","gem"], () => P.solid({ density:3, behavior:"static", color:"#9fd0e0" }));

  /* ---- buildings & structures ---- */
  batchObj([
    ["hut","Hut","🛖"],["cabin","Cabin","🏚️"],["tent","Tent","⛺"],
    ["barn","Barn","🏚️"],["factory","Factory","🏭"],["warehouse","Warehouse","🏬"],
    ["office","Office","🏢"],["hospital","Hospital","🏥"],["school","School","🏫"],
    ["church","Church","⛪"],["mosque","Mosque","🕌"],["library","Library","📚"],
    ["museum","Museum","🏛️"],["theater","Theater","🎭"],["bank","Bank","🏦"],
    ["hotel","Hotel","🏨"],["restaurant","Restaurant","🍽️"],["bakery","Bakery","🥖"],
    ["farm","Farm","🚜"],["mill","Mill","🏭"],["mine","Mine","⛏️"],
    ["tower","Tower","🗼"],["wall","Wall","🧱"],["road","Road","🛣️"],
    ["fountain","Fountain","⛲"],["garden","Garden","🌷"],["park","Park","🏞️"],
    ["zoo","Zoo","🦁"],["aquarium","Aquarium","🐠"],["airport","Airport","🛫"],
  ], ["brick","wood","stone","concrete","steel","glass","house","city","human","road","water","book","fire","plant","animal","fish","plane"], 8, "technology",
     ["building"], null);
  def("plane", ["engine","sky"], { name:"Plane", emoji:"🛩️", icon:null, tier:8, category:"technology", tags:["vehicle"], phys:null, info:"Plane: an aircraft with fixed wings." });

  /* ---- more tools, household, clothing ---- */
  batchObj([
    ["spoon","Spoon","🥄"],["fork","Fork","🍴"],["plate","Plate","🍽️"],
    ["cup","Cup","🥤"],["pan","Pan","🍳"],["pot","Pot","🍲"],
    ["kettle","Kettle","🫖"],["broom","Broom","🧹"],["bucket","Bucket","🪣"],
    ["ladder","Ladder","🪜"],["rope","Rope","🪢"],["chain","Chain","⛓️"],
    ["net","Net","🥅"],["hook","Hook","🪝"],["wrench","Wrench","🔧"],
    ["drill","Drill","🛠️"],["chisel","Chisel","🔨"],["anvil","Anvil","⚒️"],
    ["scale","Scale","⚖️"],["thermometer","Thermometer","🌡️"],["magnifier","Magnifier","🔍"],
    ["flashlight","Flashlight","🔦"],["fan","Fan","🪭"],["heater","Heater","🔥"],
    ["chair","Chair","🪑"],["table","Table","🪑"],["bed","Bed","🛏️"],
    ["door","Door","🚪"],["window","Window","🪟"],["lamp","Lamp","💡"],
  ], ["metal","wood","glass","steel","iron","plastic","rope","fire","machine","electricity","fabric","stone","silver"], 7, "technology",
     ["tool"], () => P.solid({ density:2.5, behavior:"static", color:"#9aa0a6" }));
  batchObj([
    ["shirt","Shirt","👕"],["pants","Pants","👖"],["dress","Dress","👗"],
    ["coat","Coat","🧥"],["hat","Hat","🎩"],["shoe","Shoe","👟"],
    ["boot","Boot","🥾"],["glove","Glove","🧤"],["scarf","Scarf","🧣"],
    ["sock","Sock","🧦"],["tie","Tie","👔"],["jacket","Jacket","🧥"],
    ["sweater","Sweater","🧶"],["jeans","Jeans","👖"],["bikini","Swimsuit","👙"],
    ["ring","Ring","💍"],["necklace","Necklace","📿"],["watch","Watch","⌚"],
  ], ["fabric","wool","silk","leather","cotton","rubber","gold","diamond","crown","metal","human"], 7, "materials",
     ["clothing"], () => P.solid({ density:0.8, behavior:"static", color:"#d8cdbb", flammable:true }));
  def("cotton", ["plant","sun"], { name:"Cotton", emoji:"🧵", icon:null, tier:6, category:"life", tags:["plant","fabric"], phys:P.powder({ density:0.3, behavior:"powder", color:"#f4f0e8", flammable:true }), info:"Cotton: soft fibre from the cotton plant." });

  /* ---- more space ---- */
  batchObj([
    ["venus","Venus","🟡"],["mercury_planet","Mercury","⚪"],["neptune","Neptune","🔵"],
    ["uranus_planet","Uranus","🔵"],["pluto","Pluto","🪐"],["quasar","Quasar","💫"],
    ["pulsar","Pulsar","🌟"],["wormhole","Wormhole","🕳️"],["cosmic_dust","Cosmic Dust","✨"],
    ["solar_flare","Solar Flare","☀️"],["eclipse","Eclipse","🌑"],["crater","Crater","🌑"],
    ["orbit","Orbit","🛰️"],["gravity_well","Gravity Well","🕳️"],["star_cluster","Star Cluster","✨"],
    ["dwarf_star","Dwarf Star","⭐"],["red_giant","Red Giant","🔴"],["milky_way","Milky Way","🌌"],
  ], ["space","star","planet","sun","moon","gravity","gas","ice","stone","light","galaxy","fire","time"], 9, "space",
     ["space"], null);
  def("gravity", ["mass","space"], { name:"Gravity", emoji:"🌐", icon:null, tier:5, category:"physics", tags:["force"], phys:null, info:"Gravity: the attraction between masses." });
  def("mass", ["stone","pressure"], { name:"Mass", emoji:"⚫", icon:null, tier:4, category:"physics", tags:["property"], phys:null, info:"Mass: the amount of matter in an object." });

  /* ---- physics & abstract science ---- */
  batchObj([
    ["atom","Atom","⚛️"],["molecule","Molecule","🔬"],["proton","Proton","🔴"],
    ["neutron","Neutron","⚪"],["electron","Electron","🔵"],["photon","Photon","💡"],
    ["quark","Quark","🔮"],["plasma","Plasma","🌟"],["magnetism","Magnetism","🧲"],
    ["radiation","Radiation","☢️"],["x_ray","X-Ray","🩻"],["laser_beam","Laser Beam","🔦"],
    ["friction","Friction","🔥"],["vacuum","Vacuum","🕳️"],["entropy","Entropy","🌀"],
    ["force","Force","💪"],["velocity","Velocity","💨"],["momentum","Momentum","➡️"],
  ], ["atom","energy","electricity","light","heat","pressure","magnet","fire","air","metal","space","time","force","wind"], 4, "physics",
     ["physics"], null);

  /* ---- emotions/concepts (real human concepts) ---- */
  batchObj([
    ["idea","Idea","💡"],["dream","Dream","💭"],["knowledge","Knowledge","📖"],
    ["wisdom","Wisdom","🦉"],["love","Love","❤️"],["fear","Fear","😨"],
    ["hope","Hope","🕊️"],["art","Art","🖼️"],["language","Language","🗣️"],
    ["story","Story","📖"],["song","Song","🎶"],["dance","Dance","💃"],
    ["poem","Poem","📜"],["history","History","📜"],["science","Science","🔬"],
    ["philosophy","Philosophy","🤔"],["money","Money","💰"],["law","Law","⚖️"],
  ], ["human","brain","book","time","heart","music","art","light","life","knowledge","gold"], 8, "life",
     ["concept"], null);

  /* ---- weather/disaster extras ---- */
  batchObj([
    ["monsoon","Monsoon","🌧️"],["typhoon","Typhoon","🌀"],["cyclone","Cyclone","🌀"],
    ["sleet","Sleet","🌨️"],["smog","Smog","🌫️"],["heatwave","Heatwave","🥵"],
    ["sandstorm","Sandstorm","🌪️"],["whirlpool","Whirlpool","🌀"],["geyser","Geyser","💦"],
    ["quicksand","Quicksand","🏜️"],["sinkhole","Sinkhole","🕳️"],["landslide","Landslide","⛰️"],
  ], ["rain","storm","wind","sea","sand","cloud","heat","sun","mud","water","mountain","ice","desert"], 6, "weather",
     ["weather"], null);

  return { count: elements.size };
}
