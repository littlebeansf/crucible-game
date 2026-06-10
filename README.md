# 🔥 CRUCIBLE — Discover · Craft · Simulate

A browser game that fuses the **discovery-crafting** loop of *Little Alchemy* / *Infinite Craft* with the **physics sandbox** of *Sandboxels* — built entirely in **vanilla JS + SVG**, no build step, no AI, no external assets.

**▶ Play:** _(GitHub Pages link added after deploy)_

---

## The idea

1. **Forge** — Start with the four classical elements (Water, Fire, Earth, Air). Drag two together to discover new ones. A hand-authored, deterministic recipe tree of **~6,000 elements / ~5,800 combinations** spanning geology, life, chemistry, civilization, cosmos, mythology, vehicles, music and more.
2. **Sandbox** — Every discovery that has *physical properties* becomes a **placeable material** in a cellular-automata physics playground. Sand falls and piles, water flows and finds its level, gas rises and diffuses, fire spreads to flammables, lava + water → stone + steam, acid eats solids, gunpowder explodes, things freeze / boil / melt by temperature.

Discover it in the Forge → play with it in the Sandbox.

## Features

- **~6,000 elements**, all with unique **procedural SVG icons** (hand-authored for core elements, deterministically generated sigils for the rest — every icon is pure inline SVG).
- **Real-ish physics**: powders, liquids (density-sorted), gases (rise + lifespan), energy (fire/spark/explosion/plasma), temperature transfer, phase changes, and material reactions.
- **Progressive unlocking** with autosave (localStorage), search, sort (Recent / A–Z / Tier), a physics-only filter, and a **Hint** system.
- **Animated, modern UI** — drag-to-combine board, discovery cards, flashes, toasts.
- **Responsive**: desktop, mobile portrait (slide-up drawer), and landscape.
- **Zero dependencies, zero build** — just static files.

## How it works

```
index.html
src/
  main.js            app controller (forge board, sandbox wiring, drawer, touch)
  state.js           discovery state, recipe lookup, save/load, hints
  icons.js           SVG icon system (core art + procedural sigil generator)
  style.css          full UI + responsive styling
  sandbox/engine.js  cellular-automata physics engine + canvas renderer
  data/elements.json generated element + recipe library
tools/
  gen_elements.mjs   deterministic library generator (run with: node tools/gen_elements.mjs)
```

### Regenerating / extending the library

The entire element library is produced deterministically (no randomness, no AI) by
`tools/gen_elements.mjs`. Add curated recipes or new expansion "operators", then:

```bash
node tools/gen_elements.mjs   # rewrites src/data/elements.json
```

## Tech

Vanilla ES modules, Canvas 2D for the sandbox, inline SVG for all graphics.
Inspired by [Sandboxels](https://sandboxels.r74n.com/), [Little Alchemy](https://littlealchemy.com/) and [Infinite Craft](https://neal.fun/infinite-craft/) — but an original product, not a copy.

## License

MIT
