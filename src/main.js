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
    if (evt.type === "reset") { clearForge(); renderDrawer(); renderQuickBar(); updateStats(); }
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
  drawerPhysOnly = (m === "sandbox");
  $("#phys-filter").classList.toggle("active", drawerPhysOnly);
  renderDrawer();
  if (m === "sandbox") { renderQuickBar(); sandbox.resize(); }
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

function renderDrawer() {
  const list = state.discoveredList({ query: drawerQuery, sort: drawerSort, physOnly: drawerPhysOnly });
  const wrap = $("#drawer-items");
  wrap.innerHTML = "";
  const frag = document.createDocumentFragment();
  for (const el of list) {
    frag.appendChild(makeChip(el, true));
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
  $("#clear-board").addEventListener("click", clearForge);
  $("#hint-btn").addEventListener("click", showHint);
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
  let startX, startY, ox, oy, dragging = false;
  node.addEventListener("pointerdown", e => {
    dragging = true; node.setPointerCapture(e.pointerId);
    node.classList.add("dragging");
    startX = e.clientX; startY = e.clientY; ox = rec.x; oy = rec.y;
  });
  node.addEventListener("pointermove", e => {
    if (!dragging) return;
    rec.x = ox + (e.clientX - startX);
    rec.y = oy + (e.clientY - startY);
    node.style.left = rec.x + "px"; node.style.top = rec.y + "px";
    highlightOverlap(rec);
  });
  node.addEventListener("pointerup", e => {
    if (!dragging) return;
    dragging = false; node.classList.remove("dragging");
    tryCombineAt(rec);
  });
  node.addEventListener("dblclick", () => removeItem(rec)); // quick delete
}

function itemsOverlap(a, b) {
  const dx = (a.x) - (b.x), dy = (a.y) - (b.y);
  return Math.hypot(dx, dy) < 56;
}
function highlightOverlap(rec) {
  for (const other of boardItems) {
    if (other.uid === rec.uid) continue;
    other.node.classList.toggle("target", itemsOverlap(rec, other));
  }
}
function tryCombineAt(rec) {
  let partner = null;
  for (const other of boardItems) {
    if (other.uid === rec.uid) continue;
    if (itemsOverlap(rec, other)) { partner = other; break; }
  }
  $$(".bitem.target", board).forEach(n => n.classList.remove("target"));
  if (!partner) return;
  const out = state.combine(rec.id, partner.id);
  const cx = (rec.x + partner.x) / 2 + 36, cy = (rec.y + partner.y) / 2 + 36;
  if (out) {
    // success: remove both, spawn result with a flash
    flash(cx, cy, out.isNew);
    removeItem(rec); removeItem(partner);
    spawnOnBoard(out.result, cx, cy);
  } else {
    // no recipe: little shake
    rec.node.animate([{ transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(6px)" }, { transform: "translateX(0)" }], { duration: 220 });
    puff(cx, cy, "✕");
  }
}

function removeItem(rec) {
  const i = boardItems.findIndex(x => x.uid === rec.uid);
  if (i >= 0) boardItems.splice(i, 1);
  rec.node.remove();
  if (!boardItems.length) board.classList.remove("has-items");
}
function clearForge() { boardItems.forEach(r => r.node.remove()); boardItems = []; board.classList.remove("has-items"); }

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

  let painting = false;
  const paintAt = e => {
    if (!sandbox.currentTool) return;
    const r = canvas.getBoundingClientRect();
    const px = (e.clientX - r.left), py = (e.clientY - r.top);
    sandbox.paint(px, py, sandbox.currentTool);
  };
  canvas.addEventListener("pointerdown", e => { painting = true; canvas.setPointerCapture(e.pointerId); paintAt(e); });
  canvas.addEventListener("pointermove", e => { if (painting) paintAt(e); });
  canvas.addEventListener("pointerup", () => painting = false);
  canvas.addEventListener("pointerleave", () => painting = false);

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

// Build the quick-pick bar from ONLY discovered physical materials, newest-ish
// first with a stable ordering. Keeps the current tool valid; otherwise selects
// the first available material (or none, showing an empty-state hint).
function renderQuickBar() {
  const qbar = $("#sb-quick");
  const mats = state.discoveredList({ sort: "tier", physOnly: true });
  qbar.innerHTML = "";
  if (!mats.length) {
    qbar.innerHTML = `<div class="sb-empty">No materials yet — discover physical elements in the ⚗️ Forge and they'll appear here to play with.</div>`;
    sandbox.currentTool = null;
    setCurrentLabel(null);
    return;
  }
  const frag = document.createDocumentFragment();
  for (const el of mats) {
    const b = document.createElement("button");
    b.className = "qmat cat-" + el.category;
    b.dataset.id = el.id;
    b.title = el.name;
    b.innerHTML = iconHTML(el, 26);
    b.addEventListener("click", () => selectSandboxTool(el.id));
    frag.appendChild(b);
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
