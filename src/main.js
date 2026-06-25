/* ============================================================================
   CRUCIBLE — Main application controller
   Ties together: GameState, the Forge (drag-combine board), the Sandbox
   (physics), the element drawer, search, discovery toasts, save/load.
============================================================================ */

import { GameState } from "./state.js";
import { Sandbox } from "./sandbox/engine.js";
import { RunEngine, RELICS } from "./runs.js";
import { iconHTML, emojiFor, pixelColor } from "./icons.js";
import { storage } from "./storage.js";
import { slots } from "./slots.js";
import { setupSlots as setupSlotsUI } from "./slots-ui.js";
import { Achievements, TIER_LABEL } from "./achievements.js";
import { setupSettings } from "./settings.js";
import { AudioEngine } from "./audio.js";
import { SCENES, sceneUnlocked, missingFor } from "./scenes.js";
import { CreatureSystem, SPECIES, PLACEABLE, habitatOf } from "./sandbox/creatures.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

let DB, state, sandbox, runs, achievements, slotsUI, creatures;
const GOAL_PREFIX = "\u{1F3AF} "; // target emoji prefix for scene goals
const audio = new AudioEngine();
let mode = "forge";              // 'forge' | 'sandbox' | 'runs' | 'catalog'
let drawerSort = "recent";
let drawerQuery = "";
let drawerPhysOnly = false;

/* ---------------------------------------------------------------------------
   BOOT
--------------------------------------------------------------------------- */
async function boot() {
  const res = await fetch("./src/data/elements.json");
  DB = await res.json();
  state = new GameState(DB);
  window.__crucible = { state, DB }; // debug handle

  runs = new RunEngine(state);
  window.__crucible.runs = runs;

  achievements = new Achievements(state, runs);
  achievements.onUnlock = onAchievementUnlock;
  window.__crucible.achievements = achievements;

  setupTabs();
  setupDrawer();
  setupForge();
  setupSandbox();
  setupRuns();
  setupCatalog();
  setupTopbar();
  setupAchievementsPanel();
  setupSettings(storage);
  setupAudio();
  setupSlots();
  renderDrawer();
  updateStats();

  $("#loading").classList.add("hidden");
  maybeShowWelcome();
  // Evaluate achievements once on boot so carried-over progress is reflected.
  achievements.evaluate();
  state.on(evt => {
    if (evt.type === "discover") {
      onDiscover(evt);
      // discovery chime (Sandbox-produced uses a softer reaction ping)
      audio.sfx(evt.from === "sandbox" ? "reaction" : "discover");
      // a newly discovered physical material should appear in the sandbox bar
      if (state.el(evt.id)?.phys) renderQuickBar();
      // a new material may unlock a scene — refresh the scene list
      renderScenes();
      achievements.evaluate();
      // keep the active slot's discovered count fresh if the panel is open
      slotsUI?.render();
    }
    if (evt.type === "discover" && mode === "catalog") renderCatalog();
    if (evt.type === "reset" || evt.type === "import") {
      clearForge(); renderDrawer(); renderQuickBar(); renderScenes(); updateStats();
      if (mode === "catalog") renderCatalog();
      achievements.evaluate();
      renderAchievementsPanel();
      // new slot / reset / import: let the sandbox re-announce produced
      // materials so they get rediscovered against the new progress.
      sandbox?.producedSeen?.clear();
    }
    updateStats();
  });
}

/* ---------------------------------------------------------------------------
   TABS / MODE
--------------------------------------------------------------------------- */
function setupTabs() {
  $$(".tab").forEach(t => t.addEventListener("click", () => switchMode(t.dataset.mode)));
}
function switchMode(m) {
  mode = m;
  $$(".tab").forEach(t => t.classList.toggle("active", t.dataset.mode === m));
  $("#forge-view").classList.toggle("hidden", m !== "forge");
  $("#sandbox-view").classList.toggle("hidden", m !== "sandbox");
  $("#runs-view").classList.toggle("hidden", m !== "runs");
  $("#catalog-view").classList.toggle("hidden", m !== "catalog");
  // the element drawer is only useful in Forge/Sandbox; hide it in Runs & Catalog
  document.body.classList.toggle("catalog-mode", m === "catalog" || m === "runs");
  drawerPhysOnly = (m === "sandbox");
  $("#phys-filter").classList.toggle("active", drawerPhysOnly);
  renderDrawer();
  if (m === "sandbox") { renderQuickBar(); sandbox.resize(); }
  if (m === "runs") renderRuns();
  if (m === "catalog") renderCatalog();
}

/* ---------------------------------------------------------------------------
   ELEMENT DRAWER (left/bottom palette)
--------------------------------------------------------------------------- */
function setupDrawer() {
  $("#search").addEventListener("input", e => { drawerQuery = e.target.value; renderDrawer(); });
  $$(".sort-btn").forEach(b => b.addEventListener("click", () => {
    drawerSort = b.dataset.sort;
    $$(".sort-btn").forEach(x => x.classList.toggle("active", x === b));
    renderDrawer();
  }));
  $("#phys-filter").addEventListener("click", () => {
    drawerPhysOnly = !drawerPhysOnly;
    $("#phys-filter").classList.toggle("active", drawerPhysOnly);
    renderDrawer();
  });
}

// Category display metadata: label, emoji badge, and a stable ordering.
const CATEGORY_META = {
  liquid:     { label: "Liquids",    emoji: "\uD83D\uDCA7", order: 1 },
  gas:        { label: "Gases",      emoji: "\uD83D\uDCA8", order: 2 },
  energy:     { label: "Energy",     emoji: "\u26A1",       order: 3 },
  weather:    { label: "Weather",    emoji: "\uD83C\uDF26\uFE0F", order: 4 },
  earth:      { label: "Earth",      emoji: "\uD83C\uDF0D", order: 5 },
  geology:    { label: "Geology",    emoji: "\uD83E\uDEA8", order: 6 },
  chemical:   { label: "Chemistry",  emoji: "\u2697\uFE0F", order: 7 },
  metal:      { label: "Metals",     emoji: "\uD83D\uDD29", order: 8 },
  materials:  { label: "Materials",  emoji: "\uD83D\uDCE6", order: 9 },
  life:       { label: "Life",       emoji: "\uD83C\uDF31", order: 10 },
  physics:    { label: "Physics",    emoji: "\uD83D\uDD2C", order: 11 },
  technology: { label: "Technology", emoji: "\u2699\uFE0F", order: 12 },
  space:      { label: "Space",      emoji: "\uD83C\uDF0C", order: 13 },
  meme:       { label: "Meme & Myth",emoji: "\uD83D\uDE0E", order: 14 },
};
// Pseudo-categories: property buckets that span multiple categories.
const PSEUDO_META = {
  __phys__: { label: "Physical materials", emoji: "\u269B\uFE0F", order: -2 },
  __life__: { label: "Lifeforms",          emoji: "\uD83C\uDF31", order: -1 },
};
function catMeta(cat) { return CATEGORY_META[cat] || PSEUDO_META[cat] || { label: cat, emoji: "\uD83D\uDD2E", order: 99 }; }

function renderDrawer() {
  const list = state.discoveredList({ query: drawerQuery, sort: drawerSort, physOnly: drawerPhysOnly });
  const wrap = $("#drawer-items");
  wrap.innerHTML = "";
  wrap.classList.toggle("grouped", drawerSort === "category");
  const frag = document.createDocumentFragment();

  if (drawerSort === "category") {
    // group by category, ordered, then alpha within each group
    const groups = new Map();
    for (const el of list) {
      if (!groups.has(el.category)) groups.set(el.category, []);
      groups.get(el.category).push(el);
    }
    const ordered = [...groups.entries()].sort((a, b) => catMeta(a[0]).order - catMeta(b[0]).order);
    for (const [cat, els] of ordered) {
      els.sort((x, y) => x.name.localeCompare(y.name));
      const m = catMeta(cat);
      const header = document.createElement("div");
      header.className = "cat-header cat-" + cat;
      header.innerHTML = `<span class="cat-badge">${m.emoji}</span><span class="cat-label">${m.label}</span><span class="cat-num">${els.length}</span>`;
      // "Add all" — drop every discovered element in this category onto the Forge
      // board in a tidy grid. Switches to Forge first if you're in the Sandbox.
      const addAll = document.createElement("button");
      addAll.className = "cat-addall";
      addAll.type = "button";
      addAll.title = `Add all ${els.length} ${m.label} to the Forge`;
      addAll.innerHTML = `<span class="caa-ic">⊕</span><span class="caa-tx">Add all</span>`;
      const ids = els.map(e => e.id);
      addAll.addEventListener("click", (ev) => { ev.stopPropagation(); addCategoryToForge(ids, m.label); });
      header.appendChild(addAll);
      frag.appendChild(header);
      const grid = document.createElement("div");
      grid.className = "cat-grid";
      for (const el of els) grid.appendChild(makeChip(el, true));
      frag.appendChild(grid);
    }
  } else {
    for (const el of list) frag.appendChild(makeChip(el, true));
  }

  wrap.appendChild(frag);
  $("#drawer-count").textContent = list.length;
}

function makeChip(el, draggable) {
  const chip = document.createElement("button");
  chip.className = "chip cat-" + el.category;
  chip.dataset.id = el.id;
  chip.title = el.name;
  chip.innerHTML = `<span class="chip-ic">${iconHTML(el, 32)}</span><span class="chip-name">${el.name}</span>`;
  if (draggable) {
    chip.draggable = true;
    chip.addEventListener("dragstart", e => {
      e.dataTransfer.setData("text/plain", el.id);
      e.dataTransfer.effectAllowed = "copy";
    });
    // tap/click to add to board (mobile-friendly)
    chip.addEventListener("click", () => {
      if (mode === "forge") spawnOnBoard(el.id, null);
      else selectSandboxTool(el.id);
    });
    // pointer-based drag for touch
    chip.addEventListener("pointerdown", e => {
      if (e.pointerType === "mouse") return; // mouse uses native dnd
      startTouchDrag(e, el.id);
    });
  }
  return chip;
}

/* ---------------------------------------------------------------------------
   CATALOG — Pokédex-style collection: per-category progress + locked silhouettes
--------------------------------------------------------------------------- */
let catActiveCat = null;   // currently selected category in the rail
let catQuery = "";
let catActiveId = null;    // currently inspected element (detail sheet)

function setupCatalog() {
  $("#cat-search").addEventListener("input", e => { catQuery = e.target.value; catActiveId = null; renderCatalogDetail(); });
}

// Phase-change hint chips for an element (freeze/melt/boil thresholds, flags).
function phaseHintHTML(el) {
  const info = state.phaseInfo(el);
  if (!info) return "";
  const chips = [];
  const nm = id => state.el(id)?.name || id;
  if (info.freeze) chips.push(`<span class="ph ph-cold">❄ ≤ ${info.freeze.at}° → ${nm(info.freeze.to)}</span>`);
  if (info.melt)   chips.push(`<span class="ph ph-hot">🔥 ≥ ${info.melt.at}° → ${nm(info.melt.to)}</span>`);
  if (info.boil)   chips.push(`<span class="ph ph-hot">♨ ≥ ${info.boil.at}° → ${nm(info.boil.to)}</span>`);
  if (info.condense) chips.push(`<span class="ph ph-cold">💧 ≤ ${info.condense.at}° → ${nm(info.condense.to)}</span>`);
  if (info.flammable) chips.push(`<span class="ph ph-flag">🔥 Flammable</span>`);
  if (info.conductive) chips.push(`<span class="ph ph-flag">⚡ Conductive</span>`);
  if (info.explosive) chips.push(`<span class="ph ph-flag">💥 Explosive</span>`);
  if (info.soluble) chips.push(`<span class="ph ph-flag">🧂 Soluble</span>`);
  return chips.length ? `<div class="ph-row">${chips.join("")}</div>` : "";
}

function renderCatalog() {
  renderCatalogRail();
  if (!catActiveCat) {
    // default to the category with the most discovered entries
    const cs = state.categoryStats().byCategory;
    let best = null, bestN = -1;
    for (const [c, v] of Object.entries(cs)) if (v.found > bestN) { bestN = v.found; best = c; }
    catActiveCat = best || Object.keys(cs)[0];
  }
  renderCatalogDetail();
}

function renderCatalogRail() {
  const cs = state.categoryStats();
  const rail = $("#cat-rail");
  // overall header
  const totalFound = state.discovered.size;
  const totalAll = Object.keys(DB.elements).length;
  $("#cat-overall-pct").textContent = ((totalFound / totalAll) * 100).toFixed(1) + "%";
  $("#cat-overall-found").textContent = totalFound;
  $("#cat-overall-total").textContent = totalAll;

  const entries = Object.entries(cs.byCategory)
    .sort((a, b) => catMeta(a[0]).order - catMeta(b[0]).order);
  // a couple of special "property" buckets at the top
  const special = [
    ["⚛︎ Physical materials", cs.phys, "__phys__"],
    ["🌱 Lifeforms", cs.life, "__life__"],
  ];
  let html = `<div class="rail-section">Properties</div>`;
  for (const [label, v, key] of special) {
    const pct = v.total ? Math.round((v.found / v.total) * 100) : 0;
    html += railRow(label, v.found, v.total, pct, key, true);
  }
  html += `<div class="rail-section">Categories</div>`;
  for (const [cat, v] of entries) {
    const m = catMeta(cat);
    const pct = v.total ? Math.round((v.found / v.total) * 100) : 0;
    html += railRow(`${m.emoji} ${m.label}`, v.found, v.total, pct, cat, false);
  }
  rail.innerHTML = html;
  $$("#cat-rail .cat-row[data-cat]").forEach(row => {
    row.addEventListener("click", () => { catActiveCat = row.dataset.cat; renderCatalogDetail(); });
  });
}

function railRow(label, found, total, pct, cat, isProperty) {
  const active = cat && cat === catActiveCat ? " active" : "";
  const clickable = cat ? ` data-cat="${cat}"` : "";
  return `<button class="cat-row${active}${isProperty ? " is-prop" : ""}"${clickable}>
      <div class="cat-row-top"><span class="cat-row-label">${label}</span><span class="cat-row-num">${found}/${total}</span></div>
      <div class="cat-bar"><span style="width:${pct}%"></span></div>
    </button>`;
}

function renderCatalogDetail() {
  const detail = $("#cat-detail");
  if (!catActiveCat) { detail.innerHTML = ""; return; }
  // refresh rail active state without full re-render
  $$("#cat-rail .cat-row[data-cat]").forEach(r => r.classList.toggle("active", r.dataset.cat === catActiveCat));
  const m = catMeta(catActiveCat);
  const list = state.catalogCategory(catActiveCat, { query: catQuery });
  const stats = state.categoryStats();
  const cs = catActiveCat === "__phys__" ? stats.phys
    : catActiveCat === "__life__" ? stats.life
    : (stats.byCategory[catActiveCat] || { found: 0, total: 0 });
  const pct = cs.total ? ((cs.found / cs.total) * 100).toFixed(0) : 0;

  const head = `<div class="cat-detail-head">
      <span class="cdh-title">${m.emoji} ${m.label}</span>
      <span class="cdh-prog">${cs.found} / ${cs.total} · ${pct}%</span>
    </div>`;

  const cells = list.map(({ el, found }) => {
    if (!found) {
      // Pokédex silhouette for locked entries
      return `<div class="cat-cell locked" title="Undiscovered"><span class="cc-ic">❔</span><span class="cc-name">???</span></div>`;
    }
    const physBadge = el.phys ? `<span class="cc-phys" title="Usable in the Sandbox">⚛︎</span>` : "";
    const sym = el.phys?.symbol ? `<span class="cc-sym">${el.phys.symbol}</span>` : "";
    const active = el.id === catActiveId ? " active" : "";
    return `<div class="cat-cell found cat-${el.category}${active}" data-id="${el.id}" tabindex="0" role="button">
        <span class="cc-ic">${iconHTML(el, 30)}</span>
        <span class="cc-name">${el.name}</span>
        ${sym}
        ${physBadge}
      </div>`;
  }).join("");

  const sheet = catActiveId ? catalogSheetHTML(catActiveId) : "";
  detail.innerHTML = head
    + `<div class="cat-grid-pdex">${cells || '<div class="cat-empty">No matches.</div>'}</div>`
    + sheet;

  // wire cell -> sheet
  $$("#cat-detail .cat-cell.found").forEach(c => {
    const open = () => { catActiveId = (catActiveId === c.dataset.id) ? null : c.dataset.id; renderCatalogDetail(); };
    c.addEventListener("click", open);
    c.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
  });
  $("#cat-sheet-close")?.addEventListener("click", () => { catActiveId = null; renderCatalogDetail(); });
  // keep the open sheet in view on small screens
  if (catActiveId) $("#cat-sheet")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// A property + recipe data-sheet for one discovered element.
function catalogSheetHTML(id) {
  const el = state.el(id);
  if (!el) return "";
  const nm = i => state.el(i)?.name || i;
  const chip = i => {
    const e = state.el(i);
    if (!e) return `<span class="sheet-chip">${i}</span>`;
    const known = state.discovered.has(i);
    return `<span class="sheet-chip${known ? "" : " unknown"}">${known ? iconHTML(e, 18) : "❔"}<span>${known ? e.name : "???"}</span></span>`;
  };

  // --- recipes that PRODUCE this element ---
  const recipes = state.recipesFor(id) || [];
  let recipeHTML = "";
  if (el.base) {
    recipeHTML = `<div class="sheet-recipe base">A base element — present from the start.</div>`;
  } else if (recipes.length) {
    recipeHTML = recipes.slice(0, 8).map(([a, b]) =>
      `<div class="sheet-recipe">${chip(a)}<span class="sheet-plus">+</span>${chip(b)}<span class="sheet-eq">=</span>${chip(id)}</div>`
    ).join("");
    if (recipes.length > 8) recipeHTML += `<div class="sheet-more">+${recipes.length - 8} more combinations…</div>`;
  } else {
    recipeHTML = `<div class="sheet-recipe none">No known recipe.</div>`;
  }

  // --- what this element is USED IN (only reveal discovered results) ---
  const uses = (state.usedIn(id) || []).filter(u => state.discovered.has(u.result));
  let usesHTML = "";
  if (uses.length) {
    usesHTML = `<div class="sheet-section-h">Used in</div><div class="sheet-uses">` +
      uses.slice(0, 10).map(u =>
        `<div class="sheet-use">${chip(u.a === id ? u.b : u.a)}<span class="sheet-eq">→</span>${chip(u.result)}</div>`
      ).join("") +
      (uses.length > 10 ? `<div class="sheet-more">+${uses.length - 10} more…</div>` : "") +
      `</div>`;
  }

  // --- property data table ---
  const info = state.phaseInfo(el);
  const rows = [];
  const add = (k, v) => { if (v != null && v !== "") rows.push(`<div class="prop"><span class="prop-k">${k}</span><span class="prop-v">${v}</span></div>`); };
  const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  if (info) {
    if (info.symbol) add("Symbol", `<b>${info.symbol}</b>`);
    if (info.formula) add("Formula", info.formula);
    add("State", cap(info.state));
    if (info.density != null) add("Density", `${info.density} g/cm³`);
    if (info.meltAt != null) add("Melting pt", `${info.meltAt} °C`);
    if (info.boilAt != null) add("Boiling pt", `${info.boilAt} °C`);
  }
  let flags = [];
  if (info?.flammable) flags.push(`<span class="pflag fire">🔥 Flammable</span>`);
  if (info?.conductive) flags.push(`<span class="pflag spark">⚡ Conductive</span>`);
  if (info?.explosive) flags.push(`<span class="pflag boom">💥 Explosive</span>`);
  if (info?.soluble) flags.push(`<span class="pflag drop">🧂 Soluble</span>`);
  const flagHTML = flags.length ? `<div class="sheet-flags">${flags.join("")}</div>` : "";
  const ph = phaseHintHTML(el);

  const tierTag = `<span class="sheet-tier">Tier ${el.tier}</span>`;
  const m = catMeta(el.category);
  const propTable = rows.length
    ? `<div class="sheet-section-h">Properties</div><div class="sheet-props">${rows.join("")}</div>${flagHTML}${ph}`
    : (el.phys ? "" : `<div class="sheet-noprop">A conceptual element — no physical properties.</div>`);

  return `<div id="cat-sheet" class="cat-sheet">
      <button id="cat-sheet-close" class="cat-sheet-close" aria-label="Close">✕</button>
      <div class="sheet-hero">
        <div class="sheet-ic">${iconHTML(el, 56)}</div>
        <div class="sheet-id">
          <div class="sheet-name">${el.name} ${tierTag}</div>
          <div class="sheet-cat">${m.emoji} ${m.label}</div>
        </div>
      </div>
      ${el.info ? `<p class="sheet-info">${el.info}</p>` : ""}
      <div class="sheet-section-h">How to make it</div>
      <div class="sheet-recipes">${recipeHTML}</div>
      ${usesHTML}
      ${propTable}
    </div>`;
}

/* ---------------------------------------------------------------------------
   FORGE — drag/combine board
--------------------------------------------------------------------------- */
let board, boardItems = [], itemSeq = 0;

function setupForge() {
  board = $("#board");
  board.addEventListener("dragover", e => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; });
  board.addEventListener("drop", e => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    const r = board.getBoundingClientRect();
    spawnOnBoard(id, e.clientX - r.left, e.clientY - r.top);
  });
  board.addEventListener("contextmenu", e => e.preventDefault()); // no native menu on the board
  $("#clear-board").addEventListener("click", clearForge);
  $("#hint-btn").addEventListener("click", showHint);
  $("#export-btn").addEventListener("click", exportProgress);
  $("#import-btn").addEventListener("click", () => $("#import-file").click());
  $("#import-file").addEventListener("change", importProgress);
}

/* ---------------------------------------------------------------------------
   IMPORT / EXPORT — share Forge progress between devices/browsers
--------------------------------------------------------------------------- */
function exportProgress() {
  const json = state.exportSave();
  const stamp = new Date().toISOString().slice(0, 10);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `crucible-save-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(`Exported ${state.discovered.size} discoveries`, "⬆️");
}

function importProgress(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = ""; // allow re-importing the same file later
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const replace = confirm(
      "Import progress?\n\nOK = REPLACE your current discoveries with the file.\nCancel = MERGE the file into what you already have."
    );
    const res = state.importSave(String(reader.result), replace ? "replace" : "merge");
    if (!res.ok) { toast(res.error || "Couldn't import that file.", "⛔"); return; }
    const verb = replace ? "Loaded" : "Merged";
    toast(`${verb} save · ${res.total} discoveries (+${res.added})`, "⬇️");
  };
  reader.onerror = () => toast("Couldn't read that file.", "⛔");
  reader.readAsText(file);
}

function spawnOnBoard(id, x, y) {
  const el = state.el(id);
  if (!el) return;
  const r = board.getBoundingClientRect();
  if (x == null) { x = r.width/2 + (Math.random()*120-60); y = r.height/2 + (Math.random()*120-60); }
  const node = document.createElement("div");
  node.className = "bitem cat-" + el.category;
  node.dataset.id = id;
  node.dataset.uid = ++itemSeq;
  node.style.left = (x - 36) + "px";
  node.style.top = (y - 36) + "px";
  node.innerHTML = `<div class="bitem-ic">${iconHTML(el, 52)}</div><div class="bitem-name">${el.name}</div>`;
  board.appendChild(node);
  const rec = { uid: itemSeq, id, node, x: x-36, y: y-36 };
  boardItems.push(rec);
  board.classList.add("has-items");
  makeDraggable(rec);
  // pop-in animation
  node.animate([{ transform: "scale(.4)", opacity: 0 }, { transform: "scale(1)", opacity: 1 }], { duration: 220, easing: "cubic-bezier(.2,1.4,.4,1)" });
}

// Drop every element id in `ids` onto the Forge board in a tidy, centered grid.
// Triggered from the "Add all" button on a category header (category sort).
function addCategoryToForge(ids, label = "items") {
  if (!ids || !ids.length) return;
  if (mode !== "forge") switchMode("forge");
  const r = board.getBoundingClientRect();
  const TILE = 84;                       // spacing between node centers
  const margin = 56;
  const usableW = Math.max(TILE, r.width - margin * 2);
  const cols = Math.max(1, Math.min(ids.length, Math.floor(usableW / TILE)));
  const rows = Math.ceil(ids.length / cols);
  const gridW = (cols - 1) * TILE;
  const gridH = (rows - 1) * TILE;
  const startX = r.width / 2 - gridW / 2;
  const startY = Math.max(margin, r.height / 2 - gridH / 2);
  ids.forEach((id, i) => {
    const col = i % cols, row = (i / cols) | 0;
    const jx = (Math.random() * 10 - 5), jy = (Math.random() * 10 - 5); // tiny scatter so it feels organic
    spawnOnBoard(id, startX + col * TILE + jx, startY + row * TILE + jy);
  });
  audio.sfx("combine");
  toast(`Added ${ids.length} ${label} to the Forge`, "\u2295");
}

function makeDraggable(rec) {
  const node = rec.node;
  let startX, startY, ox, oy, dragging = false, moved = false;
  node.addEventListener("pointerdown", e => {
    if (e.button === 2) return; // right-click handled by contextmenu (delete)
    dragging = true; moved = false; node.setPointerCapture(e.pointerId);
    node.classList.add("dragging");
    startX = e.clientX; startY = e.clientY; ox = rec.x; oy = rec.y;
  });
  node.addEventListener("pointermove", e => {
    if (!dragging) return;
    rec.x = ox + (e.clientX - startX);
    rec.y = oy + (e.clientY - startY);
    if (Math.abs(e.clientX - startX) > 3 || Math.abs(e.clientY - startY) > 3) moved = true;
    node.style.left = rec.x + "px"; node.style.top = rec.y + "px";
    updateConnections(rec);
  });
  node.addEventListener("pointerup", e => {
    if (!dragging) return;
    dragging = false; node.classList.remove("dragging");
    clearConnections();
    if (moved) tryCombineAt(rec);
  });
  // double-click to DUPLICATE (spawn a copy just beside this one)
  node.addEventListener("dblclick", e => {
    e.preventDefault();
    spawnOnBoard(rec.id, rec.x + 36 + 28, rec.y + 36 + 28);
  });
  // right-click to DELETE
  node.addEventListener("contextmenu", e => {
    e.preventDefault();
    removeItem(rec, true);
  });
}

// Items are 72px wide; rec.x/rec.y is the top-left, so centers are +36.
const ITEM_HALF = 36;
const SNAP_RADIUS = 84;   // generous: items connect well before fully overlapping
function itemCenter(r) { return { cx: r.x + ITEM_HALF, cy: r.y + ITEM_HALF }; }
function itemDistance(a, b) {
  const A = itemCenter(a), B = itemCenter(b);
  return Math.hypot(A.cx - B.cx, A.cy - B.cy);
}
// Find the NEAREST other item within snap range that forms a VALID recipe.
// Falls back to nearest item of any kind so a near-miss still snaps (and shakes).
function nearestPartner(rec, validOnly = false) {
  let best = null, bestD = SNAP_RADIUS;
  for (const other of boardItems) {
    if (other.uid === rec.uid) continue;
    if (validOnly && !state.canCombine(rec.id, other.id)) continue;
    const d = itemDistance(rec, other);
    if (d < bestD) { bestD = d; best = other; }
  }
  return best;
}

/* --- animated dotted connection lines --- */
const SVGNS = "http://www.w3.org/2000/svg";
let linkSvg = null;
function clearConnections() {
  if (linkSvg) linkSvg.innerHTML = "";
  for (const it of boardItems) it.node.classList.remove("target", "compatible", "known");
}
// While dragging `rec`, draw a dotted line to every item it can actually
// combine with, and mark the nearest in-range valid partner as the active target.
function updateConnections(rec) {
  if (!linkSvg) linkSvg = $("#board-links");
  linkSvg.innerHTML = "";
  const A = itemCenter(rec);
  const target = nearestPartner(rec, true);
  for (const other of boardItems) {
    if (other.uid === rec.uid) continue;
    const hit = state.canCombine(rec.id, other.id);
    const known = !!hit && !hit.isNew; // result already discovered
    other.node.classList.toggle("compatible", !!hit);
    other.node.classList.toggle("known", known);
    other.node.classList.toggle("target", other === target);
    if (!hit) continue;
    const B = itemCenter(other);
    const line = document.createElementNS(SVGNS, "line");
    line.setAttribute("x1", A.cx); line.setAttribute("y1", A.cy);
    line.setAttribute("x2", B.cx); line.setAttribute("y2", B.cy);
    line.setAttribute("class", "link" + (known ? " known" : "") + (other === target ? " active" : ""));
    linkSvg.appendChild(line);
  }
}

function tryCombineAt(rec) {
  const partner = nearestPartner(rec, true) || nearestPartner(rec, false);
  $$(".bitem.target, .bitem.compatible", board).forEach(n => n.classList.remove("target", "compatible"));
  if (!partner) return;
  const cx = (rec.x + partner.x) / 2 + ITEM_HALF, cy = (rec.y + partner.y) / 2 + ITEM_HALF;
  const out = state.combine(rec.id, partner.id);
  if (out) {
    // success: glide the dragged item into its partner for satisfying feedback,
    // then remove both and spawn the result with a flash.
    const targetX = partner.x, targetY = partner.y;
    const anim = rec.node.animate(
      [{ transform: "translate(0,0)" },
       { transform: `translate(${targetX - rec.x}px, ${targetY - rec.y}px) scale(.6)`, opacity: .4 }],
      { duration: 130, easing: "cubic-bezier(.4,0,.2,1)", fill: "forwards" }
    );
    // new discoveries get the "discover" chime via the state event; an already-
    // known result just gets a soft combine confirm here.
    if (!out.isNew) audio.sfx("combine");
    anim.onfinish = () => {
      flash(cx, cy, out.isNew);
      removeItem(rec); removeItem(partner);
      spawnOnBoard(out.result, cx, cy);
    };
  } else {
    // no recipe: little shake
    rec.node.animate([{ transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(6px)" }, { transform: "translateX(0)" }], { duration: 220 });
    puff(cx, cy, "✕");
    audio.sfx("error");
  }
}

function removeItem(rec, withFx = false) {
  const i = boardItems.findIndex(x => x.uid === rec.uid);
  if (i >= 0) boardItems.splice(i, 1);
  if (withFx) {
    puff(rec.x + ITEM_HALF, rec.y + ITEM_HALF, "\uD83D\uDCA8");
    rec.node.animate([{ transform: "scale(1)", opacity: 1 }, { transform: "scale(.3)", opacity: 0 }],
      { duration: 160, easing: "ease-in" }).onfinish = () => rec.node.remove();
  } else {
    rec.node.remove();
  }
  if (!boardItems.length) board.classList.remove("has-items");
}
function clearForge() { boardItems.forEach(r => r.node.remove()); boardItems = []; clearConnections(); board.classList.remove("has-items"); }

function flash(x, y, isNew) {
  const f = document.createElement("div");
  f.className = "flash" + (isNew ? " new" : "");
  f.style.left = x + "px"; f.style.top = y + "px";
  board.appendChild(f);
  f.animate([{ transform: "scale(.2)", opacity: .9 }, { transform: "scale(2.4)", opacity: 0 }], { duration: 520, easing: "ease-out" });
  setTimeout(() => f.remove(), 520);
}
function puff(x, y, txt) {
  const p = document.createElement("div");
  p.className = "puff"; p.textContent = txt;
  p.style.left = x + "px"; p.style.top = y + "px";
  board.appendChild(p);
  p.animate([{ transform: "translateY(0) scale(1)", opacity: .8 }, { transform: "translateY(-26px) scale(1.2)", opacity: 0 }], { duration: 600 });
  setTimeout(() => p.remove(), 600);
}

function showHint() {
  const h = state.hint();
  if (!h) { toast("You've discovered everything reachable. Legend.", "🏆"); return; }
  const ea = state.el(h.a), eb = state.el(h.b);
  toast(`Try combining ${ea.name} + ${eb.name}`, "💡");
  // auto-spawn the two hint items
  clearForge();
  spawnOnBoard(h.a, board.clientWidth/2 - 90, board.clientHeight/2);
  spawnOnBoard(h.b, board.clientWidth/2 + 90, board.clientHeight/2);
}

/* ---------------------------------------------------------------------------
   DISCOVERY feedback
--------------------------------------------------------------------------- */
function onDiscover(evt) {
  const el = state.el(evt.id);
  renderDrawer();
  const card = $("#discover-card");
  card.querySelector(".dc-ic").innerHTML = iconHTML(el, 56);
  card.querySelector(".dc-name").textContent = el.name;
  const fromSandbox = evt.from === "sandbox";
  card.querySelector(".dc-sub").textContent = fromSandbox
    ? "Discovered in the Sandbox"
    : (el.phys ? "New material · usable in Sandbox" : "New discovery");
  card.classList.add("show");
  clearTimeout(card._t);
  card._t = setTimeout(() => card.classList.remove("show"), 2200);
}
function toast(msg, icon = "✨") {
  const t = $("#toast");
  t.innerHTML = `<span>${icon}</span> ${msg}`;
  t.classList.add("show");
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ---------------------------------------------------------------------------
   SANDBOX
--------------------------------------------------------------------------- */
function setupSandbox() {
  const canvas = $("#sandbox-canvas");
  sandbox = new Sandbox(canvas, { cell: 5 });
  sandbox.setLibrary(DB.elements);
  if (window.__crucible) window.__crucible.sandbox = sandbox; // debug handle

  // When a reaction or phase change in the sandbox produces a material, also
  // mark it discovered in the Forge. discoverFromSandbox emits a "discover"
  // event, so the toast, drawer, catalog, quick-bar and achievements all
  // update through the normal path. Only fires for genuinely new materials.
  sandbox.onProduce = (id) => { state.discoverFromSandbox(id); };

  // ---- Living creature layer (agents that ride on top of the cell grid) ----
  creatures = new CreatureSystem(sandbox);
  if (window.__crucible) window.__crucible.creatures = creatures;
  creatures.onChange = renderLifePanel;

  // canvas pixel from a pointer event (accounts for CSS scaling of the canvas)
  const pxFromEvent = e => {
    const r = canvas.getBoundingClientRect();
    const sx = canvas.width / r.width, sy = canvas.height / r.height;
    return { px: (e.clientX - r.left) * sx, py: (e.clientY - r.top) * sy };
  };

  let painting = false;
  let draggingCreature = null;   // creature being repositioned via drag
  const paintAt = e => {
    const { px, py } = pxFromEvent(e);
    // Life tools (tool id "creature:<kind>") spawn living creatures, not cells.
    if (typeof sandbox.currentTool === "string" && sandbox.currentTool.startsWith("creature:")) {
      const kind = sandbox.currentTool.slice(9);
      const cr = creatures.spawn(kind, px, py);
      if (cr) { creatures.select(cr); audio.sfx("click"); }
      return;
    }
    if (!sandbox.currentTool) return;
    sandbox.paint(px, py, sandbox.currentTool);
  };
  // Hover tooltip: shows which element sits under the cursor.
  const tip = $("#sb-tooltip");
  let tipId = null;
  // HUD readout nodes (live temp / pressure / phase under the cursor)
  const hudTemp = $("#hud-temp"), hudPress = $("#hud-press"), hudPhase = $("#hud-phase"), hudEl = $("#hud-el");
  const updateTip = e => {
    const { px, py } = pxFromEvent(e);
    // when hovering a creature, show its species + live state instead of cell info
    const hoverCr = creatures.pick(px, py);
    if (hoverCr) {
      hudEl.textContent = hoverCr.spec.name;
      hudPhase.textContent = hoverCr.state;
      if (tipId !== "cr:" + hoverCr.uid) {
        tip.innerHTML = `<span class="tt-ic">${hoverCr.spec.emoji}</span><span class="tt-name">${hoverCr.spec.name} — ${hoverCr.state}</span>`;
        tipId = "cr:" + hoverCr.uid;
        tip.classList.add("show");
      }
      tip.style.left = (px + 14) + "px";
      tip.style.top = (py - 14) + "px";
      canvas.style.cursor = "pointer";
      return;
    }
    canvas.style.cursor = "";
    const id = sandbox.idAtPixel(px, py);
    // ---- live HUD readout (works on empty cells too: shows ambient air) ----
    const ro = sandbox.readoutAtPixel(px, py);
    if (ro) {
      hudTemp.textContent = `${Math.round(ro.temp)}°C`;
      hudPress.textContent = `${(1 + ro.pressure).toFixed(1)} atm`;
      hudPhase.textContent = ro.phase || "—";
      hudEl.textContent = ro.name || "empty";
    }
    if (!id) {
      if (tipId !== null) { tip.classList.remove("show"); tipId = null; }
      return;
    }
    if (id !== tipId) {
      const el = DB.elements[id];
      tip.innerHTML = el
        ? `<span class="tt-ic">${emojiFor(el)}</span><span class="tt-name">${el.name}</span>`
        : id;
      tipId = id;
      tip.classList.add("show");
    }
    // position the tooltip above the cursor, clamped inside the canvas
    let tx = px + 14, ty = py - 14;
    tip.style.left = tx + "px";
    tip.style.top = ty + "px";
  };
  const hideTip = () => { tip.classList.remove("show"); tipId = null; };

  // ---- Event log: phase changes & reactions pushed from the engine ----
  const logList = $("#sb-log-list");
  const LOG_CAP = 60;
  let lastSfxAt = 0; // throttle reaction SFX so rapid events don't pile up
  sandbox.onEvent = (evt) => {
    const empty = logList.querySelector(".log-empty");
    if (empty) empty.remove();
    const li = document.createElement("li");
    li.className = "log-item log-" + (evt.kind || "reaction");
    const icon = evt.kind === "phase" ? "❄" : evt.kind === "pressure" ? "⏲" : "⚗";
    li.innerHTML = `<span class="log-ic">${icon}</span><span class="log-txt">${evt.text}</span>`;
    logList.insertBefore(li, logList.firstChild);
    while (logList.children.length > LOG_CAP) logList.removeChild(logList.lastChild);
    // throttled reaction/phase SFX (max ~6/sec) so it stays pleasant
    const now = performance.now();
    if (now - lastSfxAt > 160) {
      lastSfxAt = now;
      const txt = (evt.text || "").toLowerCase();
      if (evt.kind === "phase" && /(freez|ice|frost|solid)/.test(txt)) audio.sfx("freeze");
      else if (/(boil|steam|evapor)/.test(txt)) audio.sfx("bubble");
      else if (/(burn|fire|melt|lava|smoke)/.test(txt)) audio.sfx("sizzle");
      else audio.sfx("reaction");
    }
    // feed achievements (phase change / reaction unlocks)
    if (achievements) achievements.noteSandboxEvent(evt.kind);
  };
  const logEmpty = () => {
    logList.innerHTML = `<li class="log-empty">Reactions and phase changes will appear here.</li>`;
  };
  $("#sb-log-toggle").addEventListener("click", () => {
    const open = $("#sb-log").classList.toggle("open");
    $("#sb-log-toggle").classList.toggle("active", open);
  });
  $("#sb-log-clear").addEventListener("click", () => {
    sandbox.events = [];
    if (sandbox.eventSeen) sandbox.eventSeen.clear();
    logEmpty();
  });

  canvas.addEventListener("pointerdown", e => {
    const { px, py } = pxFromEvent(e);
    // Right-click (or ctrl/middle) removes a creature under the cursor.
    if (e.button === 2 || e.button === 1 || e.ctrlKey) {
      if (creatures.removeAt(px, py)) { e.preventDefault(); return; }
    }
    // If a creature is under the cursor and we're NOT placing a Life tool,
    // select it and start dragging it (so the player can reposition life).
    const isLifeTool = typeof sandbox.currentTool === "string" && sandbox.currentTool.startsWith("creature:");
    if (!isLifeTool) {
      const cr = creatures.pick(px, py);
      if (cr) {
        creatures.select(cr);
        draggingCreature = cr;
        canvas.setPointerCapture(e.pointerId);
        return;
      }
    }
    painting = true; canvas.setPointerCapture(e.pointerId); paintAt(e);
  });
  canvas.addEventListener("pointermove", e => {
    if (draggingCreature) {
      const { px, py } = pxFromEvent(e);
      draggingCreature.x = px; draggingCreature.y = py;
      draggingCreature.vx = 0; draggingCreature.vy = 0;
      return;
    }
    if (painting) paintAt(e);
    updateTip(e);
  });
  canvas.addEventListener("pointerup", () => { painting = false; draggingCreature = null; });
  canvas.addEventListener("pointerleave", () => { painting = false; draggingCreature = null; hideTip(); });
  // suppress the browser context menu so right-click can remove creatures
  canvas.addEventListener("contextmenu", e => e.preventDefault());

  $("#sb-clear").addEventListener("click", () => { sandbox.clearAll(); creatures.clear(); resetClimateUI(); });
  $("#sb-pause").addEventListener("click", () => {
    sandbox.running = !sandbox.running;
    $("#sb-pause").textContent = sandbox.running ? "⏸ Pause" : "▶ Play";
  });
  const brush = $("#sb-brush");
  brush.addEventListener("input", e => { sandbox.brushSize = +e.target.value; });
  $("#sb-eraser").addEventListener("click", () => selectSandboxTool("eraser"));

  renderQuickBar();

  // render loop — creatures step & draw on top of the cell grid
  const loop = () => {
    sandbox.step();
    sandbox.render();
    if (sandbox.running) creatures.step();
    creatures.render(sandbox.ctx);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  window.addEventListener("resize", () => { if (mode === "sandbox") sandbox.resize(); });

  // Scenes UI lives inside the sandbox view.
  setupScenes();
  // Temperature regulator (global ambient climate control).
  setupClimate();
  // Live "Life" stats panel + Life palette (creature placement tools).
  setupLife();
}

/* ---------------------------------------------------------------------------
   CLIMATE — temperature regulator: drives the sandbox's global ambient temp
--------------------------------------------------------------------------- */
function setupClimate() {
  const panel = $("#sb-climate");
  const toggle = $("#sb-climate-toggle");
  const slider = $("#sb-climate-slider");
  const valEl = $("#clm-val");
  const stateEl = $("#clm-state");
  if (!panel || !toggle || !slider) return;

  // Describe the current climate in plain language + a colour cue.
  const describe = (t) => {
    if (t <= -20) return { label: "Deep freeze", cls: "cold" };
    if (t < 0)    return { label: "Freezing", cls: "cold" };
    if (t < 15)   return { label: "Cold", cls: "cool" };
    if (t <= 25)  return { label: "Off", cls: "off" };
    if (t < 100)  return { label: "Warm", cls: "warm" };
    if (t < 400)  return { label: "Hot", cls: "hot" };
    if (t < 900)  return { label: "Scorching", cls: "hot" };
    return { label: "Molten", cls: "hot" };
  };

  const apply = (t, { sfx = false } = {}) => {
    const v = Math.max(-60, Math.min(1600, Math.round(t)));
    sandbox.setAmbient(v);
    slider.value = String(v);
    valEl.textContent = `${v}\u00B0C`;
    const d = describe(v);
    stateEl.textContent = d.label;
    panel.dataset.clm = d.cls;
    // tint the toolbar button when the regulator is actively on
    toggle.classList.toggle("active", d.cls !== "off");
    // fill the slider track up to the thumb for a nice gradient read
    const pct = ((v - (-60)) / (1600 - (-60))) * 100;
    slider.style.setProperty("--clm-pct", pct.toFixed(1) + "%");
    if (sfx) {
      if (v <= 0) audio.sfx("freeze");
      else if (v >= 300) audio.sfx("sizzle");
      else audio.sfx("click");
    }
  };

  toggle.addEventListener("click", () => {
    const open = panel.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
    if (open) { closeOtherSbPanels("climate"); audio.sfx("click"); }
  });
  $("#sb-climate-close")?.addEventListener("click", () => panel.classList.remove("open"));

  // live drag (no SFX spam) + a single tick when released
  slider.addEventListener("input", () => apply(+slider.value));
  slider.addEventListener("change", () => apply(+slider.value, { sfx: true }));

  panel.querySelectorAll(".clm-preset").forEach(btn => {
    btn.addEventListener("click", () => apply(+btn.dataset.temp, { sfx: true }));
  });

  // initialise readout to the engine's current ambient
  apply(sandbox.ambient ?? 20);
  // expose so Clear / scene load can reset the climate UI in sync
  resetClimateUI = () => apply(20);
}

// Reset the climate regulator back to neutral (set by setupClimate).
let resetClimateUI = () => {};

// Close sandbox overlay panels other than the one being opened, so Climate,
// Scenes and the Log don't stack on top of each other on small screens.
function closeOtherSbPanels(keep) {
  if (keep !== "scenes") $("#sb-scenes")?.classList.remove("open");
  if (keep !== "climate") $("#sb-climate")?.classList.remove("open");
  if (keep !== "life") $("#sb-life")?.classList.remove("open");
  if (keep !== "life") $("#sb-life-toggle")?.classList.remove("active");
  if (keep !== "scenes") $("#sb-scenes-toggle")?.classList.remove("active");
  if (keep !== "climate") $("#sb-climate-toggle")?.classList.remove("active");
}

/* ---------------------------------------------------------------------------
   LIFE — creature placement palette + live stats panel.
   The palette lets the player pick one of the PLACEABLE species (a "Life tool"
   whose id is "creature:<kind>"); clicking the canvas then spawns that animal.
   The stats panel lists every living creature with health/energy/age bars and
   its live behaviour state, plus a population counter split by habitat.
--------------------------------------------------------------------------- */
function setupLife() {
  const toggle = $("#sb-life-toggle");
  const panel = $("#sb-life");
  const close = $("#sb-life-close");
  const palette = $("#sb-life-palette");

  // build the placement palette once (one button per placeable species)
  if (palette && !palette.dataset.built) {
    palette.dataset.built = "1";
    PLACEABLE.forEach((kind) => {
      const spec = SPECIES[kind];
      const b = document.createElement("button");
      b.className = "life-tool";
      b.dataset.kind = kind;
      b.title = `Place ${spec.name} (${habitatOf(kind)})`;
      b.innerHTML = `<span class="life-emoji">${spec.emoji}</span><span class="life-label">${spec.name}</span>`;
      b.addEventListener("click", () => selectLifeTool(kind));
      palette.appendChild(b);
    });
  }

  toggle?.addEventListener("click", () => {
    const open = panel.classList.toggle("open");
    toggle.classList.toggle("active", open);
    audio.sfx("click");
    if (open) { closeOtherSbPanels("life"); renderLifePanel(); }
  });
  close?.addEventListener("click", () => {
    panel.classList.remove("open");
    toggle?.classList.remove("active");
  });
  $("#sb-life-clear")?.addEventListener("click", () => { creatures.clear(); audio.sfx("click"); });

  renderLifePanel();
}

// Select a Life placement tool. Sets a synthetic "creature:<kind>" tool so the
// canvas paint handler spawns living creatures instead of cells.
function selectLifeTool(kind) {
  if (mode !== "sandbox") switchMode("sandbox");
  sandbox.currentTool = "creature:" + kind;
  // de-highlight material quick-bar; highlight the chosen life tool
  markActiveQuick(null);
  $$("#sb-life-palette .life-tool").forEach(b =>
    b.classList.toggle("active", b.dataset.kind === kind));
  const spec = SPECIES[kind];
  setCurrentLabel(null);
  const node = $("#sb-current");
  if (node && spec) node.innerHTML = `<span class="sb-cur-ic">${spec.emoji}</span> ${spec.name}`;
  toast(`Placing: ${spec.name} — click the canvas`, spec.emoji);
}

let _lifeRaf = 0;
// Re-render the live stats panel (throttled to once per animation frame so the
// engine's frequent onChange calls don't thrash the DOM).
function renderLifePanel() {
  if (_lifeRaf) return;
  _lifeRaf = requestAnimationFrame(() => {
    _lifeRaf = 0;
    _renderLifePanelNow();
  });
}

function _renderLifePanelNow() {
  const panel = $("#sb-life");
  if (!panel || !creatures) return;
  const countNode = $("#sb-life-count");
  const censusNode = $("#sb-life-census");
  const listNode = $("#sb-life-list");

  const alive = creatures.list.filter(c => c.alive);
  const cen = creatures.census();
  if (countNode) countNode.textContent = String(alive.length);
  if (censusNode) {
    censusNode.innerHTML =
      `<span class="life-hab" title="Land dwellers">🌳 ${cen.land}</span>` +
      `<span class="life-hab" title="Flyers">🌤 ${cen.air}</span>` +
      `<span class="life-hab" title="Swimmers">🌊 ${cen.water}</span>`;
  }

  // Toggle button badge so the player sees population without opening the panel
  const badge = $("#sb-life-badge");
  if (badge) {
    badge.textContent = alive.length ? String(alive.length) : "";
    badge.classList.toggle("show", alive.length > 0);
  }

  if (!listNode) return;
  if (!alive.length) {
    listNode.innerHTML = `<div class="life-empty">No life yet — pick a creature above and click the canvas, or load a life-populated scene. Fish need water, flyers need air. Watch them live, struggle and fade.</div>`;
    return;
  }
  // sort: selected first, then most-recently spawned (highest uid)
  const sel = creatures.selected;
  const rows = alive.slice().sort((a, b) => {
    if (a === sel) return -1; if (b === sel) return 1;
    return b.uid - a.uid;
  }).slice(0, 40); // cap visible rows for perf

  const bar = (val, kind) => {
    const f = Math.max(0, Math.min(100, val));
    return `<div class="life-bar life-bar-${kind}"><span style="width:${f}%"></span></div>`;
  };
  const stateClass = (st) =>
    /!$/.test(st) ? "danger" : /Starving|Hunting|Suffocating|Drowning|Fleeing/.test(st) ? "warn" : "ok";

  listNode.innerHTML = rows.map((cr) => {
    const agePct = Math.min(100, (cr.age / cr.maxAge) * 100);
    const isSel = cr === sel ? " selected" : "";
    return `
      <div class="life-row${isSel}" data-uid="${cr.uid}">
        <div class="life-row-head">
          <span class="life-row-emoji">${cr.spec.emoji}</span>
          <span class="life-row-name">${cr.spec.name}</span>
          <span class="life-row-state ${stateClass(cr.state)}">${cr.state}</span>
        </div>
        <div class="life-stats">
          <span class="life-stat">❤ ${bar(cr.health, "hp")}</span>
          <span class="life-stat">⚡ ${bar(cr.energy, "en")}</span>
          <span class="life-stat">⏳ ${bar(agePct, "age")}</span>
        </div>
      </div>`;
  }).join("");

  // click a row to focus/select that creature on the canvas
  listNode.querySelectorAll(".life-row").forEach((row) => {
    row.addEventListener("click", () => {
      const uid = +row.dataset.uid;
      const cr = creatures.list.find(c => c.uid === uid && c.alive);
      if (cr) { creatures.select(cr); }
    });
  });
}

/* ---------------------------------------------------------------------------
   AUDIO — music + SFX controls (Web Audio synth, no asset files)
--------------------------------------------------------------------------- */
const SND_MUTED_KEY = "crucible.snd.muted";
const SND_MUSIC_KEY = "crucible.snd.music";
const SND_VOL_KEY   = "crucible.snd.vol";

function setupAudio() {
  // restore prefs
  const savedMuted = storage.get(SND_MUTED_KEY) === "1";
  const savedMusic = storage.get(SND_MUSIC_KEY);
  const rawVol = storage.get(SND_VOL_KEY);            // null when unset
  const savedVol = rawVol == null ? NaN : Number(rawVol);
  const musicOn = savedMusic == null ? true : savedMusic === "1";
  const vol = Number.isFinite(savedVol) ? savedVol / 100 : 0.7;

  audio._muted = savedMuted;
  audio._music = musicOn;
  audio._vol = vol;

  // Web Audio must be created/resumed after a user gesture. Lazily start on
  // the first pointer/key interaction anywhere in the app.
  const kick = () => {
    audio.init();
    audio.resume();
    if (audio.musicOn()) audio.setMusic(true);
    window.removeEventListener("pointerdown", kick);
    window.removeEventListener("keydown", kick);
  };
  window.addEventListener("pointerdown", kick, { once: false });
  window.addEventListener("keydown", kick, { once: false });

  const musicBtn = $("#snd-music");
  const sfxBtn = $("#snd-sfx");
  const volSlider = $("#snd-vol");
  const volLabel = $("#snd-vol-label");

  const syncBtns = () => {
    if (musicBtn) {
      musicBtn.classList.toggle("on", audio.musicOn());
      musicBtn.setAttribute("aria-pressed", String(audio.musicOn()));
    }
    if (sfxBtn) {
      const sfxOn = !audio.isMuted();
      sfxBtn.classList.toggle("on", sfxOn);
      sfxBtn.setAttribute("aria-pressed", String(sfxOn));
    }
    if (volSlider) volSlider.value = String(Math.round(audio.volume() * 100));
    if (volLabel) volLabel.textContent = `${Math.round(audio.volume() * 100)}%`;
  };

  musicBtn?.addEventListener("click", () => {
    audio.init();
    audio.setMusic(!audio.musicOn());
    storage.set(SND_MUSIC_KEY, audio.musicOn() ? "1" : "0");
    audio.sfx("click");
    syncBtns();
  });

  // "Sound FX" toggle doubles as master mute (music routes through master too,
  // but we keep the music bed independently controllable). Muting kills all.
  sfxBtn?.addEventListener("click", () => {
    audio.init();
    audio.setMuted(!audio.isMuted());
    storage.set(SND_MUTED_KEY, audio.isMuted() ? "1" : "0");
    if (!audio.isMuted()) audio.sfx("click");
    syncBtns();
  });

  volSlider?.addEventListener("input", (e) => {
    audio.init();
    audio.setVolume(Number(e.target.value) / 100);
    if (volLabel) volLabel.textContent = `${e.target.value}%`;
  });
  volSlider?.addEventListener("change", () => {
    storage.set(SND_VOL_KEY, String(Math.round(audio.volume() * 100)));
  });

  syncBtns();
}

/* ---------------------------------------------------------------------------
   SCENES — pre-built sandbox templates, unlock-gated by discovered materials
--------------------------------------------------------------------------- */
let hintTimer = null;

function setupScenes() {
  const toggle = $("#sb-scenes-toggle");
  const panel = $("#sb-scenes");
  const close = $("#sb-scenes-close");
  toggle?.addEventListener("click", () => {
    const open = panel.classList.toggle("open");
    toggle.classList.toggle("active", open);
    audio.sfx("click");
    if (open) { closeOtherSbPanels("scenes"); renderScenes(); }
  });
  close?.addEventListener("click", () => {
    panel.classList.remove("open");
    toggle?.classList.remove("active");
  });
  $("#sb-hint-close")?.addEventListener("click", () => hideHint());
  renderScenes();
}

function matChip(id) {
  const el = DB.elements[id];
  const ic = el ? emojiFor(el) : "❓";
  const nm = el ? el.name : id;
  return { ic, nm };
}

function renderScenes() {
  const list = $("#sb-scenes-list");
  if (!list) return;
  // unlocked first, then locked sorted by how close (fewest missing) they are
  const decorated = SCENES.map((s) => {
    const missing = missingFor(s, state);
    return { s, unlocked: missing.length === 0, missing };
  });
  decorated.sort((a, b) => {
    if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
    return a.missing.length - b.missing.length;
  });

  list.innerHTML = decorated.map(({ s, unlocked, missing }) => {
    const reqChips = s.requires.map((id) => {
      const { ic, nm } = matChip(id);
      const have = state.isDiscovered(id);
      return `<span class="scn-req ${have ? "have" : "need"}" title="${nm}${have ? " — discovered" : " — not yet discovered"}">${ic} ${nm}</span>`;
    }).join("");
    const action = unlocked
      ? `<button class="scn-load" data-scene="${s.id}">Load scene</button>`
      : `<div class="scn-locked-note">🔒 Discover ${missing.length} more material${missing.length > 1 ? "s" : ""} to unlock</div>`;
    return `
      <div class="scn-card ${unlocked ? "unlocked" : "locked"}">
        <div class="scn-top">
          <span class="scn-emoji">${s.emoji}</span>
          <div class="scn-meta">
            <div class="scn-name">${s.name}</div>
            <div class="scn-blurb">${s.blurb}</div>
          </div>
        </div>
        <div class="scn-reqs">${reqChips}</div>
        <div class="scn-actions">${action}</div>
      </div>`;
  }).join("");

  list.querySelectorAll(".scn-load").forEach((b) =>
    b.addEventListener("click", () => loadScene(b.dataset.scene))
  );
}

function loadScene(sceneId) {
  const scene = SCENES.find((s) => s.id === sceneId);
  if (!scene || !sceneUnlocked(scene, state)) { audio.sfx("error"); return; }
  // make sure the grid is sized (sandbox tab is active when this is reachable)
  sandbox.resize();
  sandbox.clearAll();
  creatures?.clear();
  scene.paint(sandbox);
  // spawn any pre-populated life for this scene
  if (typeof scene.life === "function" && creatures) {
    try { scene.life(sandbox, creatures); } catch (e) { console.warn("scene life spawn failed", e); }
    renderLifePanel();
  }
  // close the picker so the player sees the result
  $("#sb-scenes")?.classList.remove("open");
  $("#sb-scenes-toggle")?.classList.remove("active");
  audio.sfx("scene");
  // surface the scene goal (puzzle/zoo scenes) or a contextual material hint
  if (scene.goal) {
    showHintBar(GOAL_PREFIX + scene.goal);
  } else {
    showSceneHint(scene);
  }
}

function showSceneHint(scene) {
  const usable = (scene.hints || []).filter((h) => state.isDiscovered(h.id) || !DB.elements[h.id]);
  // prefer hints whose suggested material the player owns; fall back to first
  const pool = usable.length ? usable : (scene.hints || []);
  if (!pool.length) return;
  const h = pool[Math.floor(Math.random() * pool.length)];
  const { ic, nm } = matChip(h.id);
  const owned = state.isDiscovered(h.id);
  const text = owned
    ? `Tip: ${h.text} — grab ${ic} ${nm} from the bar below.`
    : `Goal: discover ${ic} ${nm} — then ${h.text.charAt(0).toLowerCase() + h.text.slice(1)}.`;
  showHintBar(text);
}

function showHintBar(text) {
  const bar = $("#sb-hint-bar");
  const txt = $("#sb-hint-text");
  if (!bar || !txt) return;
  txt.textContent = text;
  bar.hidden = false;
  bar.classList.add("show");
  clearTimeout(hintTimer);
  hintTimer = setTimeout(hideHint, 9000);
}

function hideHint() {
  const bar = $("#sb-hint-bar");
  if (!bar) return;
  bar.classList.remove("show");
  clearTimeout(hintTimer);
  setTimeout(() => { if (!bar.classList.contains("show")) bar.hidden = true; }, 300);
}

// Active sandbox category filter ("all" or a category id). Lets the player
// narrow the material palette to one family instead of one giant flat row.
let sbCatFilter = "all";

// Build the quick-pick bar from ONLY discovered physical materials, GROUPED by
// category with little section headers. A filter row of category tabs lets the
// player focus on Liquids / Powders / Gases / Solids / Energy at a time.
function renderQuickBar() {
  const qbar = $("#sb-quick");
  const tabsRow = $("#sb-cat-tabs");
  const mats = state.discoveredList({ sort: "tier", physOnly: true });
  qbar.innerHTML = "";
  if (tabsRow) tabsRow.innerHTML = "";

  if (!mats.length) {
    qbar.innerHTML = `<div class="sb-empty">No materials yet — discover physical elements in the ⚗️ Forge and they'll appear here to play with.</div>`;
    sandbox.currentTool = null;
    setCurrentLabel(null);
    return;
  }

  // group materials by category, preserving CATEGORY_META order
  const groups = new Map();
  for (const el of mats) {
    if (!groups.has(el.category)) groups.set(el.category, []);
    groups.get(el.category).push(el);
  }
  const orderedCats = [...groups.keys()].sort((a, b) => catMeta(a).order - catMeta(b).order);

  // --- category filter tabs (All + each present category) ---
  if (tabsRow) {
    if (!groups.has(sbCatFilter) && sbCatFilter !== "all") sbCatFilter = "all";
    const mkTab = (key, label) => {
      const t = document.createElement("button");
      t.className = "sb-cat-tab" + (sbCatFilter === key ? " active" : "");
      t.dataset.cat = key;
      t.textContent = label;
      t.addEventListener("click", () => { sbCatFilter = key; renderQuickBar(); });
      return t;
    };
    tabsRow.appendChild(mkTab("all", `All · ${mats.length}`));
    for (const cat of orderedCats) {
      const m = catMeta(cat);
      tabsRow.appendChild(mkTab(cat, `${m.emoji} ${m.label} ${groups.get(cat).length}`));
    }
  }

  // --- material sections ---
  const frag = document.createDocumentFragment();
  const catsToShow = sbCatFilter === "all" ? orderedCats : [sbCatFilter];
  for (const cat of catsToShow) {
    const list = groups.get(cat) || [];
    if (!list.length) continue;
    const m = catMeta(cat);
    const section = document.createElement("div");
    section.className = "sb-cat-section";
    const head = document.createElement("div");
    head.className = "sb-cat-head";
    head.innerHTML = `<span class="sb-cat-dot cat-${cat}"></span>${m.emoji} ${m.label} <span class="sb-cat-n">${list.length}</span>`;
    section.appendChild(head);
    const row = document.createElement("div");
    row.className = "sb-cat-mats";
    for (const el of list) {
      const b = document.createElement("button");
      b.className = "qmat cat-" + el.category;
      b.dataset.id = el.id;
      b.title = el.name;
      b.innerHTML = iconHTML(el, 26);
      b.addEventListener("click", () => selectSandboxTool(el.id));
      row.appendChild(b);
    }
    section.appendChild(row);
    frag.appendChild(section);
  }
  qbar.appendChild(frag);

  // keep current tool valid (Life tools "creature:*" are always kept)
  const valid = new Set(mats.map(m => m.id));
  const isLifeTool = typeof sandbox.currentTool === "string" && sandbox.currentTool.startsWith("creature:");
  if (sandbox.currentTool && sandbox.currentTool !== "eraser" && !isLifeTool && !valid.has(sandbox.currentTool)) {
    sandbox.currentTool = null;
  }
  if (!sandbox.currentTool) {
    selectSandboxTool(mats[0].id, true);
  } else if (!isLifeTool) {
    markActiveQuick(sandbox.currentTool);
  }
}

function markActiveQuick(id) {
  $$("#sb-quick .qmat").forEach(b => b.classList.toggle("active", b.dataset.id === id));
}
function setCurrentLabel(el) {
  const node = $("#sb-current");
  if (el === "eraser") { node.innerHTML = `<span class="sb-cur-ic">🧽</span> Eraser`; return; }
  if (!el) { node.innerHTML = `<span class="sb-cur-ic">🎨</span> Pick a material`; return; }
  node.innerHTML = `<span class="sb-cur-ic">${emojiFor(el)}</span> ${el.name}`;
}

function selectSandboxTool(id, silent = false) {
  // Only jump into the sandbox on an explicit user pick, not on silent auto-select.
  if (mode !== "sandbox" && !silent) switchMode("sandbox");
  if (id === "eraser") {
    sandbox.currentTool = "eraser";
    setCurrentLabel("eraser");
    markActiveQuick(null);
    if (!silent) toast("Eraser selected", "🧽");
    return;
  }
  const el = DB.elements[id];
  // Gate: only discovered, physical materials are placeable in the Sandbox.
  if (!el || !el.phys) { if (!silent) toast("That element has no physical form.", "⛔"); return; }
  if (!state.isDiscovered(id)) { if (!silent) toast("Discover it in the Forge first.", "🔒"); return; }
  sandbox.currentTool = id;
  setCurrentLabel(el);
  markActiveQuick(id);
  if (!silent) toast(`Painting: ${el.name}`, "🖌️");
}

/* ---------------------------------------------------------------------------
   TOUCH DRAG (drawer -> board / sandbox)
--------------------------------------------------------------------------- */
let touchGhost = null;
function startTouchDrag(e, id) {
  e.preventDefault();
  const el = state.el(id);
  touchGhost = document.createElement("div");
  touchGhost.className = "ghost";
  touchGhost.innerHTML = iconHTML(el, 52);
  document.body.appendChild(touchGhost);
  const move = ev => {
    touchGhost.style.left = ev.clientX + "px";
    touchGhost.style.top = ev.clientY + "px";
  };
  const up = ev => {
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", up);
    touchGhost?.remove(); touchGhost = null;
    if (mode === "forge") {
      const r = board.getBoundingClientRect();
      if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) {
        spawnOnBoard(id, ev.clientX - r.left, ev.clientY - r.top);
      }
    } else {
      selectSandboxTool(id);
    }
  };
  move(e);
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", up);
}

/* ---------------------------------------------------------------------------
   TRANSMUTATION RUNS (roguelike mode)
--------------------------------------------------------------------------- */
let runSelA = null; // first selected hand element id (awaiting a partner)
const RUN_RELIC_BY_ID = Object.fromEntries(RELICS.map(r => [r.id, r]));

function setupRuns() {
  $("#runs-start").addEventListener("click", startRun);
  $("#runs-again").addEventListener("click", startRun);
  $("#runs-abandon").addEventListener("click", () => {
    if (runs.run && !runs.run.over && !confirm("Abandon this run? Your score won't be banked unless it beats your best.")) return;
    runs.abandon();
    renderRuns();
  });
  $("#relic-skip").addEventListener("click", () => runs.skipRelic());

  // react to engine events
  runs.on(evt => {
    switch (evt.type) {
      case "start":       runSelA = null; showRunScreen("play"); renderRunFull(); break;
      case "combine":     renderRunFull(); flashCombine(evt); break;
      case "stage-clear": renderRunHud(); break;
      case "relic-offer": showRelicDraft(evt.choices); break;
      case "stage-next":  $("#relic-overlay").classList.add("hidden"); runSelA = null; renderRunFull(); break;
      case "over":        showRunOver(evt.won); if (achievements) achievements.evaluate(); break;
      case "abandon":     showRunScreen("intro"); break;
    }
  });
}

function startRun() {
  $("#runs-over").classList.add("hidden");
  $("#relic-overlay").classList.add("hidden");
  runs.start();
}

// Top-level: choose which sub-screen of the Runs view is visible.
function showRunScreen(which) {
  $("#runs-intro").classList.toggle("hidden", which !== "intro");
  $("#runs-play").classList.toggle("hidden", which !== "play");
  if (which === "intro") { $("#runs-over").classList.add("hidden"); $("#relic-overlay").classList.add("hidden"); }
}

// Entry point when the tab is opened.
function renderRuns() {
  $("#runs-best").textContent = runs.best.toLocaleString();
  if (runs.run && !runs.run.over) { showRunScreen("play"); renderRunFull(); }
  else if (runs.run && runs.run.over) { showRunScreen("play"); renderRunFull(); showRunOver(runs.run.won); }
  else { showRunScreen("intro"); }
}

function renderRunFull() { renderRunHud(); renderRunTarget(); renderRunRelics(); renderRunHand(); renderRunLog(); }

function renderRunHud() {
  const r = runs.run; if (!r) return;
  $("#rh-stage").textContent = r.stage;
  $("#rh-score").textContent = r.score.toLocaleString();
  $("#rh-combo").textContent = "\u00d7" + r.combo.toFixed(2);
  $("#rh-combo").classList.toggle("hot", r.combo >= 2);
  $("#rh-energy-val").textContent = Math.max(0, Math.round(r.energy));
  const pct = Math.max(0, Math.min(100, (r.energy / r.maxEnergy) * 100));
  const fill = $("#rh-bar-fill");
  fill.style.width = pct + "%";
  fill.classList.toggle("low", pct <= 25);
}

function renderRunTarget() {
  const r = runs.run; if (!r || !r.target) return;
  const el = state.el(r.target.id);
  $("#rt-ic").innerHTML = iconHTML(el, 30);
  $("#rt-name").textContent = el.name;
  let steps = `~${r.target.steps} step${r.target.steps === 1 ? "" : "s"} away`;
  if (r.target.revealed) steps += ` \u00b7 hint: needs ${state.el(r.target.revealed)?.name || r.target.revealed}`;
  $("#rt-steps").textContent = steps;
}

function renderRunRelics() {
  const r = runs.run; if (!r) return;
  const wrap = $("#runs-relics");
  wrap.innerHTML = "";
  for (const id of r.relics) {
    const relic = RUN_RELIC_BY_ID[id];
    if (!relic) continue;
    const chip = document.createElement("span");
    chip.className = "relic-chip";
    chip.innerHTML = `<span>${relic.emoji}</span> ${relic.name}`;
    chip.title = relic.desc;
    wrap.appendChild(chip);
  }
}

function renderRunHand() {
  const r = runs.run; if (!r) return;
  $("#runs-hand-count").textContent = r.hand.size;
  const wrap = $("#runs-hand");
  wrap.innerHTML = "";
  const frag = document.createDocumentFragment();
  // newest last so fresh discoveries appear at the end and get the "new" glow
  for (const id of r.handOrder) {
    const el = state.el(id); if (!el) continue;
    const btn = document.createElement("button");
    btn.className = "rhand";
    btn.dataset.id = id;
    if (id === runSelA) btn.classList.add("sel");
    if (r.newThisRun.has(id)) btn.classList.add("fresh");
    btn.innerHTML = `<span class="rhand-ic">${iconHTML(el, 28)}</span><span class="rhand-n">${el.name}</span>`;
    btn.addEventListener("click", () => onHandClick(id));
    frag.appendChild(btn);
  }
  wrap.appendChild(frag);
  // pick prompt
  const pick = $("#runs-pick");
  if (runSelA) {
    const a = state.el(runSelA);
    pick.innerHTML = `Selected <b>${a.name}</b> \u2014 pick a partner, double-click it to self-combine, or click once to cancel`;
  } else {
    pick.textContent = "Pick two elements to combine";
  }
}

let runSelTime = 0;
function onHandClick(id) {
  const r = runs.run; if (!r || r.over) return;
  if (r.relicChoices) return; // waiting on relic draft
  if (!runSelA) { runSelA = id; runSelTime = Date.now(); renderRunHand(); return; }
  if (runSelA === id) {
    // rapid second click on the same tile = self-combine; slow click = cancel
    if (Date.now() - runSelTime < 400) {
      runSelA = null;
      runs.combine(id, id); // self-combine (e.g. water + water)
      return;
    }
    runSelA = null; renderRunHand(); return; // cancel
  }
  const a = runSelA, b = id;
  runSelA = null;
  runs.combine(a, b); // emits 'combine' -> renderRunFull
}

function renderRunLog() {
  const r = runs.run; if (!r) return;
  const ul = $("#runs-log");
  ul.innerHTML = "";
  if (!r.log.length) { ul.innerHTML = `<li class="rl-empty">Your combines will appear here.</li>`; return; }
  for (const line of r.log) {
    const li = document.createElement("li");
    li.className = line.startsWith("\u2713") ? "rl-hit" : line.startsWith("\uD83C\uDFAF") ? "rl-goal" : line.startsWith("\u2726") ? "rl-relic" : "rl-miss";
    li.textContent = line;
    ul.appendChild(li);
  }
}

function flashCombine(evt) {
  if (evt.ok && evt.isNew) {
    toast(`+${evt.gained} \u00b7 ${evt.el.name}`, "\u2728");
  } else if (!evt.ok && evt.drain) {
    // subtle shake on the energy bar
    const bar = $("#rh-bar-fill"); bar.classList.remove("shake"); void bar.offsetWidth; bar.classList.add("shake");
  }
}

function showRelicDraft(choices) {
  const wrap = $("#relic-choices");
  wrap.innerHTML = "";
  for (const relic of choices) {
    const card = document.createElement("button");
    card.className = "relic-card";
    card.innerHTML = `<div class="relic-emoji">${relic.emoji}</div><div class="relic-name">${relic.name}</div><div class="relic-desc">${relic.desc}</div>`;
    card.addEventListener("click", () => runs.chooseRelic(relic.id));
    wrap.appendChild(card);
  }
  $("#relic-overlay").classList.remove("hidden");
}

function showRunOver(won) {
  const r = runs.run; if (!r) return;
  $("#ro-glyph").textContent = won ? "\uD83C\uDFC6" : "\uD83D\uDCA5";
  $("#ro-title").textContent = won ? "Transmutation complete!" : "Out of energy";
  $("#ro-score").textContent = r.score.toLocaleString();
  $("#ro-combo").textContent = "\u00d7" + r.bestCombo.toFixed(2);
  $("#ro-stage").textContent = r.stage;
  $("#ro-disc").textContent = r.newThisRun.size;
  const isBest = r.score >= runs.best && r.score > 0;
  $("#ro-best").innerHTML = isBest ? `\uD83C\uDF1F New best score!` : `Best: <b>${runs.best.toLocaleString()}</b>`;
  $("#runs-best").textContent = runs.best.toLocaleString();
  $("#runs-over").classList.remove("hidden");
}

/* ---------------------------------------------------------------------------
   ACHIEVEMENTS — slide-over panel + unlock toast
--------------------------------------------------------------------------- */
let achFilter = "all"; // all | unlocked | locked

function setupAchievementsPanel() {
  $("#ach-btn")?.addEventListener("click", openAchievements);
  $("#ach-close")?.addEventListener("click", closeAchievements);
  $("#ach-backdrop")?.addEventListener("click", closeAchievements);
  $$("#ach-filters .ach-filter").forEach(b => b.addEventListener("click", () => {
    achFilter = b.dataset.filter;
    $$("#ach-filters .ach-filter").forEach(x => x.classList.toggle("active", x === b));
    renderAchievementsPanel();
  }));
}

function openAchievements() {
  renderAchievementsPanel();
  $("#ach-panel").classList.add("open");
  $("#ach-backdrop").classList.add("show");
}
function closeAchievements() {
  $("#ach-panel").classList.remove("open");
  $("#ach-backdrop").classList.remove("show");
}

function renderAchievementsPanel() {
  if (!achievements) return;
  const { list, unlocked, total } = achievements.summary();
  const pct = total ? Math.round((unlocked / total) * 100) : 0;
  $("#ach-count").textContent = `${unlocked} / ${total}`;
  $("#ach-prog-fill").style.width = pct + "%";
  // update the topbar badge
  const badge = $("#ach-badge");
  if (badge) { badge.textContent = unlocked; badge.classList.toggle("hidden", unlocked === 0); }

  let shown = list;
  if (achFilter === "unlocked") shown = list.filter(a => a.unlocked);
  else if (achFilter === "locked") shown = list.filter(a => !a.unlocked);
  // unlocked first, then by tier weight
  const tierW = { legendary: 0, gold: 1, silver: 2, bronze: 3 };
  shown = [...shown].sort((a, b) =>
    (a.unlocked === b.unlocked ? 0 : a.unlocked ? -1 : 1) ||
    (tierW[a.tier] - tierW[b.tier]));

  const body = $("#ach-list");
  body.innerHTML = shown.map(a => {
    const locked = !a.unlocked;
    const hidden = a.secret && locked;
    const name = hidden ? "???" : a.name;
    const desc = hidden ? "Hidden achievement — keep experimenting." : a.desc;
    const emoji = hidden ? "\uD83D\uDD12" : a.emoji;
    return `<div class="ach-item ach-${a.tier}${locked ? " locked" : " unlocked"}">
        <div class="ach-medal">${emoji}</div>
        <div class="ach-meta">
          <div class="ach-name">${name} <span class="ach-tier-tag ach-tag-${a.tier}">${TIER_LABEL[a.tier]}</span></div>
          <div class="ach-desc">${desc}</div>
        </div>
        <div class="ach-state">${a.unlocked ? "\u2713" : ""}</div>
      </div>`;
  }).join("") || `<div class="ach-empty">Nothing here yet.</div>`;
}

// queue so multiple simultaneous unlocks don't overlap
let achToastQueue = [], achToastBusy = false;
function onAchievementUnlock(a) {
  // refresh panel & badge live
  renderAchievementsPanel();
  audio.sfx("achievement");
  achToastQueue.push(a);
  if (!achToastBusy) drainAchToast();
}
function drainAchToast() {
  const a = achToastQueue.shift();
  if (!a) { achToastBusy = false; return; }
  achToastBusy = true;
  const t = $("#ach-toast");
  t.className = `ach-toast ach-${a.tier} show`;
  t.innerHTML = `<div class="at-medal">${a.emoji}</div>
    <div class="at-meta"><div class="at-tag">ACHIEVEMENT \u00b7 ${TIER_LABEL[a.tier]}</div>
    <div class="at-name">${a.name}</div><div class="at-desc">${a.desc}</div></div>`;
  clearTimeout(t._t);
  t._t = setTimeout(() => {
    t.classList.remove("show");
    setTimeout(drainAchToast, 380);
  }, 3000);
}

/* ---------------------------------------------------------------------------
   TOPBAR / stats / reset
--------------------------------------------------------------------------- */
/* ---------------------------------------------------------------------------
   SAVE SLOTS — multiple independent save games
--------------------------------------------------------------------------- */
function setupSlots() {
  slotsUI = setupSlotsUI({
    slots,
    state,
    runs,
    // Called after switching to / deleting the active slot: re-read that
    // slot's progress and best score, then refresh every view in place.
    onSwitch() {
      state.reload();        // emits 'reset' -> boot listener re-renders app
      runs.reloadBest();
      if (mode === "runs") renderRuns();
    },
    toast,
  });
}

function setupTopbar() {
  $("#reset-btn").addEventListener("click", () => {
    if (confirm("Reset all discoveries? This cannot be undone.")) state.reset();
  });
  $("#drawer-toggle")?.addEventListener("click", () => {
    $("#drawer").classList.toggle("open");
  });
}
function maybeShowWelcome() {
  const seen = storage.get("crucible_welcomed");
  const w = $("#welcome");
  if (!seen) w.classList.remove("hidden");
  $("#welcome-start").addEventListener("click", () => {
    w.classList.add("closing");
    storage.set("crucible_welcomed", "1");
    setTimeout(() => w.classList.add("hidden"), 360);
  });
}
function updateStats() {
  const s = state.stats();
  $("#stat-discovered").textContent = s.discovered;
  $("#stat-total").textContent = s.total;
  const pct = ((s.discovered / s.total) * 100).toFixed(1);
  $("#stat-pct").textContent = pct + "%";
}

boot();
