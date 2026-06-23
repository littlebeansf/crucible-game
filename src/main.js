/* ============================================================================
   CRUCIBLE — Main application controller
   Ties together: GameState, the Forge (drag-combine board), the Sandbox
   (physics), the element drawer, search, discovery toasts, save/load.
============================================================================ */

import { GameState } from "./state.js";
import { Sandbox } from "./sandbox/engine.js";
import { iconHTML, emojiFor, pixelColor } from "./icons.js";
import { storage } from "./storage.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

let DB, state, sandbox;
let mode = "forge";              // 'forge' | 'sandbox'
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

  setupTabs();
  setupDrawer();
  setupForge();
  setupSandbox();
  setupCatalog();
  setupTopbar();
  renderDrawer();
  updateStats();

  $("#loading").classList.add("hidden");
  maybeShowWelcome();
  state.on(evt => {
    if (evt.type === "discover") {
      onDiscover(evt);
      // a newly discovered physical material should appear in the sandbox bar
      if (state.el(evt.id)?.phys) renderQuickBar();
    }
    if (evt.type === "discover" && mode === "catalog") renderCatalog();
    if (evt.type === "reset" || evt.type === "import") { clearForge(); renderDrawer(); renderQuickBar(); updateStats(); if (mode === "catalog") renderCatalog(); }
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
  $("#catalog-view").classList.toggle("hidden", m !== "catalog");
  // the element drawer is only useful in Forge/Sandbox; hide it in Catalog
  document.body.classList.toggle("catalog-mode", m === "catalog");
  drawerPhysOnly = (m === "sandbox");
  $("#phys-filter").classList.toggle("active", drawerPhysOnly);
  renderDrawer();
  if (m === "sandbox") { renderQuickBar(); sandbox.resize(); }
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
  liquid:    { label: "Liquids",     emoji: "\uD83D\uDCA7", order: 1 },
  gas:       { label: "Gases",       emoji: "\uD83D\uDCA8", order: 2 },
  energy:    { label: "Energy",      emoji: "\u26A1",       order: 3 },
  powder:    { label: "Powders",     emoji: "\uD83C\uDFD6\uFE0F", order: 4 },
  solid:     { label: "Solids",      emoji: "\uD83E\uDEA8", order: 5 },
  life:      { label: "Life",        emoji: "\uD83C\uDF31", order: 6 },
  food:      { label: "Food",        emoji: "\uD83C\uDF5E", order: 7 },
  structure: { label: "Structures",  emoji: "\uD83C\uDFDB\uFE0F", order: 8 },
  machine:   { label: "Machines",    emoji: "\u2699\uFE0F", order: 9 },
  tool:      { label: "Tools",       emoji: "\uD83D\uDD27", order: 10 },
  object:    { label: "Objects",     emoji: "\uD83D\uDCE6", order: 11 },
  cosmic:    { label: "Cosmic",      emoji: "\uD83C\uDF0C", order: 12 },
  concept:   { label: "Concepts",    emoji: "\u2728",       order: 13 },
  matter:    { label: "Matter",      emoji: "\uD83D\uDD36", order: 14 },
};
function catMeta(cat) { return CATEGORY_META[cat] || { label: cat, emoji: "\uD83D\uDD2E", order: 99 }; }

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

function setupCatalog() {
  $("#cat-search").addEventListener("input", e => { catQuery = e.target.value; renderCatalogDetail(); });
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
    ["⚛︎ Physical materials", cs.phys, "phys"],
    ["🌱 Lifeforms", cs.life, "life-bucket"],
  ];
  let html = `<div class="rail-section">Properties</div>`;
  for (const [label, v] of special) {
    const pct = v.total ? Math.round((v.found / v.total) * 100) : 0;
    html += railRow(label, v.found, v.total, pct, null, true);
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
  const cs = state.categoryStats().byCategory[catActiveCat] || { found: 0, total: 0 };
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
    const ph = phaseHintHTML(el);
    const physBadge = el.phys ? `<span class="cc-phys" title="Usable in the Sandbox">⚛︎</span>` : "";
    return `<div class="cat-cell found cat-${el.category}" data-id="${el.id}">
        <span class="cc-ic">${iconHTML(el, 30)}</span>
        <span class="cc-name">${el.name}</span>
        ${physBadge}
        ${ph}
      </div>`;
  }).join("");

  detail.innerHTML = head + `<div class="cat-grid-pdex">${cells || '<div class="cat-empty">No matches.</div>'}</div>`;
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
    anim.onfinish = () => {
      flash(cx, cy, out.isNew);
      removeItem(rec); removeItem(partner);
      spawnOnBoard(out.result, cx, cy);
    };
  } else {
    // no recipe: little shake
    rec.node.animate([{ transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(6px)" }, { transform: "translateX(0)" }], { duration: 220 });
    puff(cx, cy, "✕");
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
  card.querySelector(".dc-sub").textContent = el.phys ? "New material · usable in Sandbox" : "New discovery";
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

  let painting = false;
  const paintAt = e => {
    if (!sandbox.currentTool) return;
    const r = canvas.getBoundingClientRect();
    const px = (e.clientX - r.left), py = (e.clientY - r.top);
    sandbox.paint(px, py, sandbox.currentTool);
  };
  // Hover tooltip: shows which element sits under the cursor.
  const tip = $("#sb-tooltip");
  let tipId = null;
  // HUD readout nodes (live temp / pressure / phase under the cursor)
  const hudTemp = $("#hud-temp"), hudPress = $("#hud-press"), hudPhase = $("#hud-phase"), hudEl = $("#hud-el");
  const updateTip = e => {
    const r = canvas.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
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
  sandbox.onEvent = (evt) => {
    const empty = logList.querySelector(".log-empty");
    if (empty) empty.remove();
    const li = document.createElement("li");
    li.className = "log-item log-" + (evt.kind || "reaction");
    const icon = evt.kind === "phase" ? "❄" : evt.kind === "pressure" ? "⏲" : "⚗";
    li.innerHTML = `<span class="log-ic">${icon}</span><span class="log-txt">${evt.text}</span>`;
    logList.insertBefore(li, logList.firstChild);
    while (logList.children.length > LOG_CAP) logList.removeChild(logList.lastChild);
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

  canvas.addEventListener("pointerdown", e => { painting = true; canvas.setPointerCapture(e.pointerId); paintAt(e); });
  canvas.addEventListener("pointermove", e => { if (painting) paintAt(e); updateTip(e); });
  canvas.addEventListener("pointerup", () => painting = false);
  canvas.addEventListener("pointerleave", () => { painting = false; hideTip(); });

  $("#sb-clear").addEventListener("click", () => sandbox.clearAll());
  $("#sb-pause").addEventListener("click", () => {
    sandbox.running = !sandbox.running;
    $("#sb-pause").textContent = sandbox.running ? "⏸ Pause" : "▶ Play";
  });
  const brush = $("#sb-brush");
  brush.addEventListener("input", e => { sandbox.brushSize = +e.target.value; });
  $("#sb-eraser").addEventListener("click", () => selectSandboxTool("eraser"));

  renderQuickBar();

  // render loop
  const loop = () => {
    sandbox.step();
    sandbox.render();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  window.addEventListener("resize", () => { if (mode === "sandbox") sandbox.resize(); });
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

  // keep current tool valid
  const valid = new Set(mats.map(m => m.id));
  if (sandbox.currentTool && sandbox.currentTool !== "eraser" && !valid.has(sandbox.currentTool)) {
    sandbox.currentTool = null;
  }
  if (!sandbox.currentTool) {
    selectSandboxTool(mats[0].id, true);
  } else {
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
   TOPBAR / stats / reset
--------------------------------------------------------------------------- */
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
