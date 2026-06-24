/* ============================================================================
   CRUCIBLE — Achievements
   ----------------------------------------------------------------------------
   A declarative achievement catalog + a lightweight engine that evaluates
   unlock conditions against game state and fires unlock callbacks (toasts).

   Each achievement:
     { id, name, desc, emoji, tier ("bronze"|"silver"|"gold"|"legendary"),
       secret?:bool, test(ctx) -> bool }

   ctx passed to test():
     { state, discoveredCount, has(id), countCategory(cat), runsBest,
       sandboxEvents:Set<kind>, lastEvent }

   The engine is evaluated:
     - on every discovery (Forge / Runs)
     - on notable sandbox events (phase change, reaction, explosion…)
     - on run end (best score)
   Unlocks are persisted via state.unlockAchievement(id).
============================================================================ */

export const ACHIEVEMENTS = [
  // ---- discovery milestones ----------------------------------------------
  { id: "first_steps", name: "First Spark", emoji: "✨", tier: "bronze",
    desc: "Discover your first new element.",
    test: c => c.discoveredCount >= 5 },
  { id: "apprentice", name: "Apprentice Alchemist", emoji: "🧪", tier: "bronze",
    desc: "Discover 25 elements.",
    test: c => c.discoveredCount >= 25 },
  { id: "journeyman", name: "Journeyman", emoji: "⚗️", tier: "silver",
    desc: "Discover 60 elements.",
    test: c => c.discoveredCount >= 60 },
  { id: "adept", name: "Adept", emoji: "🔮", tier: "silver",
    desc: "Discover 120 elements.",
    test: c => c.discoveredCount >= 120 },
  { id: "polymath", name: "Polymath", emoji: "🎓", tier: "gold",
    desc: "Discover 180 elements.",
    test: c => c.discoveredCount >= 180 },
  { id: "completionist", name: "The Crucible Mastered", emoji: "🏆", tier: "legendary",
    desc: "Discover every element in the game.",
    test: c => c.discoveredCount >= c.totalCount },

  // ---- the classic four & early science ----------------------------------
  { id: "elements_four", name: "Classical Quartet", emoji: "🌍", tier: "bronze",
    desc: "Have all four base elements in play (you start with them).",
    test: c => c.has("water") && c.has("fire") && c.has("earth") && c.has("air") },
  { id: "steam_age", name: "Steam Age", emoji: "♨️", tier: "bronze",
    desc: "Boil water into steam.",
    test: c => c.has("steam") },
  { id: "let_there_be_light", name: "Let There Be Light", emoji: "💡", tier: "bronze",
    desc: "Harness electricity.",
    test: c => c.has("electricity") },
  { id: "rock_cycle", name: "The Rock Cycle", emoji: "🪨", tier: "silver",
    desc: "Forge lava, then stone.",
    test: c => c.has("lava") && c.has("stone") },

  // ---- chemistry & matter -------------------------------------------------
  { id: "periodic_pioneer", name: "Periodic Pioneer", emoji: "🧫", tier: "silver",
    desc: "Discover 8 chemistry elements.",
    test: c => c.countCategory("chemical") >= 8 },
  { id: "chemist", name: "Master Chemist", emoji: "⚛️", tier: "gold",
    desc: "Discover 20 chemistry elements.",
    test: c => c.countCategory("chemical") >= 20 },
  { id: "phases_of_matter", name: "Three Phases", emoji: "🌡️", tier: "silver",
    desc: "Trigger a phase change in the Sandbox (melt, boil, freeze or condense).",
    test: c => c.sandboxEvents.has("phase") },
  { id: "go_nuclear", name: "Critical Mass", emoji: "☢️", tier: "gold",
    desc: "Refine uranium and plutonium.",
    test: c => c.has("uranium") && c.has("plutonium") },

  // ---- metals & materials -------------------------------------------------
  { id: "iron_age", name: "Iron Age", emoji: "🔩", tier: "bronze",
    desc: "Smelt iron.",
    test: c => c.has("iron") },
  { id: "gold_rush", name: "Gold Rush", emoji: "🪙", tier: "silver",
    desc: "Discover gold.",
    test: c => c.has("gold") },
  { id: "forge_master", name: "Forge Master", emoji: "🛠️", tier: "gold",
    desc: "Discover 10 metals.",
    test: c => c.countCategory("metal") >= 10 },
  { id: "carbon_crown", name: "Carbon Crown", emoji: "💎", tier: "gold",
    desc: "Crush carbon into a diamond.",
    test: c => c.has("diamond") },

  // ---- life ---------------------------------------------------------------
  { id: "spark_of_life", name: "Spark of Life", emoji: "🧬", tier: "silver",
    desc: "Create life from the elements.",
    test: c => c.has("life") },
  { id: "ascent_of_man", name: "Ascent of Man", emoji: "🧍", tier: "gold",
    desc: "Evolve all the way to a human.",
    test: c => c.has("human") },
  { id: "biologist", name: "Tree of Life", emoji: "🌳", tier: "gold",
    desc: "Discover 20 lifeforms.",
    test: c => c.countCategory("life") >= 20 },

  // ---- weather & geology --------------------------------------------------
  { id: "storm_chaser", name: "Storm Chaser", emoji: "⛈️", tier: "silver",
    desc: "Discover 8 weather phenomena.",
    test: c => c.countCategory("weather") >= 8 },
  { id: "after_the_rain", name: "After the Rain", emoji: "🌈", tier: "bronze",
    desc: "Find a rainbow.",
    test: c => c.has("rainbow") },
  { id: "geologist", name: "Deep Time", emoji: "⛰️", tier: "gold",
    desc: "Discover 15 geology elements.",
    test: c => c.countCategory("geology") >= 15 },

  // ---- space --------------------------------------------------------------
  { id: "stargazer", name: "Stargazer", emoji: "⭐", tier: "silver",
    desc: "Ignite a star.",
    test: c => c.has("star") || c.has("sun") },
  { id: "event_horizon", name: "Event Horizon", emoji: "🕳️", tier: "legendary",
    desc: "Collapse matter into a black hole.",
    test: c => c.has("black_hole") },
  { id: "cosmic", name: "Cosmic Cartographer", emoji: "🌌", tier: "gold",
    desc: "Discover a galaxy.",
    test: c => c.has("galaxy") },

  // ---- technology ---------------------------------------------------------
  { id: "machine_age", name: "Machine Age", emoji: "⚙️", tier: "silver",
    desc: "Build a computer.",
    test: c => c.has("computer") },
  { id: "singularity", name: "Singularity", emoji: "🤖", tier: "legendary",
    desc: "Create artificial intelligence.",
    test: c => c.has("ai") },

  // ---- sandbox playfulness ------------------------------------------------
  { id: "demolition", name: "Demolition", emoji: "💥", tier: "silver",
    desc: "Build the most destructive thing of all — a nuclear bomb.",
    test: c => c.has("nuclear_bomb") },
  { id: "alchemist_lab", name: "Living Lab", emoji: "🔬", tier: "silver",
    desc: "Witness a chemical reaction in the Sandbox.",
    test: c => c.sandboxEvents.has("reaction") },

  // ---- transmutation runs -------------------------------------------------
  { id: "first_run", name: "Into the Gauntlet", emoji: "🎲", tier: "bronze",
    desc: "Score points in a Transmutation Run.",
    test: c => c.runsBest >= 1 },
  { id: "high_roller", name: "High Roller", emoji: "📈", tier: "gold",
    desc: "Beat a run score of 1,000.",
    test: c => c.runsBest >= 1000 },

  // ---- secret / meme ------------------------------------------------------
  { id: "philosophers_stone", name: "The Great Work", emoji: "🜍", tier: "legendary", secret: true,
    desc: "Complete the alchemist's dream — the Philosopher's Stone.",
    test: c => c.has("philosophers_stone") },
  { id: "lady_l", name: "Lady L", emoji: "👑", tier: "legendary", secret: true,
    desc: "Some legends write themselves. (Coca Cola + Tattoo)",
    test: c => c.has("lady_l") },
  { id: "drop_the_bass", name: "Drop the Bass", emoji: "🎧", tier: "gold", secret: true,
    desc: "Forge hard techno.",
    test: c => c.has("hard_techno") || c.has("techno") },
];

export const TIER_LABEL = {
  bronze: "Bronze", silver: "Silver", gold: "Gold", legendary: "Legendary",
};

export class Achievements {
  constructor(state, runs) {
    this.state = state;
    this.runs = runs;
    this.sandboxEvents = new Set(); // kinds seen this session: phase|reaction|explosion|pressure
    this.onUnlock = null;           // callback(achievement)
    this.byId = Object.fromEntries(ACHIEVEMENTS.map(a => [a.id, a]));
  }

  ctx() {
    const s = this.state;
    const counts = {};
    return {
      state: s,
      discoveredCount: s.discovered.size,
      totalCount: Object.keys(s.elements).length,
      has: id => s.discovered.has(id),
      countCategory: cat => {
        if (counts[cat] == null) {
          let n = 0;
          for (const id of s.discovered) if (s.elements[id]?.category === cat) n++;
          counts[cat] = n;
        }
        return counts[cat];
      },
      runsBest: (this.runs && this.runs.best) || 0,
      sandboxEvents: this.sandboxEvents,
    };
  }

  // Record a sandbox event kind, then re-evaluate.
  noteSandboxEvent(kind) {
    if (!kind) return;
    if (!this.sandboxEvents.has(kind)) {
      this.sandboxEvents.add(kind);
      this.evaluate();
    }
  }

  // Evaluate all not-yet-unlocked achievements; fire callbacks for new ones.
  evaluate() {
    const c = this.ctx();
    const newly = [];
    for (const a of ACHIEVEMENTS) {
      if (this.state.hasAchievement(a.id)) continue;
      let ok = false;
      try { ok = !!a.test(c); } catch { ok = false; }
      if (ok) {
        this.state.unlockAchievement(a.id);
        newly.push(a);
      }
    }
    for (const a of newly) if (this.onUnlock) { try { this.onUnlock(a); } catch (e) {} }
    return newly;
  }

  // Summary for the panel: list with unlocked flag + counts.
  summary() {
    const list = ACHIEVEMENTS.map(a => ({
      ...a,
      unlocked: this.state.hasAchievement(a.id),
    }));
    const unlocked = list.filter(a => a.unlocked).length;
    return { list, unlocked, total: ACHIEVEMENTS.length };
  }
}
