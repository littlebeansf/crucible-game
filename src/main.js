/* ============================================================================
   CRUCIBLE — Main application controller
   Ties together: GameState, the Forge (drag-combine board), the Sandbox
   (physics), the element drawer, search, discovery toasts, save/load.
============================================================================ */

import { GameState } from "./state.js";
import { Sandbox } from "./sandbox/engine.js";
import { svgString, pixelColor } from "./icons.js";
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
    if (evt.type === "discover") onDiscover(evt);
    if (evt.type === "reset") { clearForge(); renderDrawer(); updateStats(); }
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
  if (m === "sandbox") { sandbox.resize(); }
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
  chip.innerHTML = `<span class="chip-ic">${svgString(el, 30)}</span><span class="chip-name">${el.name}</span>`;
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
  node.innerHTML = `<div class="bitem-ic">${svgString(el, 46)}</div><div class="bitem-name">${el.name}</div>`;
  board.appendChild(node);
  const rec = { uid: itemSeq, id, node, x: x-36, y: y-36 };
  boardItems.push(rec);
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
}
function clearForge() { boardItems.forEach(r => r.node.remove()); boardItems = []; }

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
  card.querySelector(".dc-ic").innerHTML = svgString(el, 64);
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
  sandbox.currentTool = "sand";

  let painting = false;
  const paintAt = e => {
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

  // quick-pick common materials
  const quick = ["sand","water","fire","stone","oil","steam","lava","ice","acid","gunpowder","plant","salt"];
  const qbar = $("#sb-quick");
  quick.forEach(id => {
    if (!DB.elements[id]) return;
    const el = DB.elements[id];
    const b = document.createElement("button");
    b.className = "qmat cat-" + el.category;
    b.title = el.name;
    b.innerHTML = svgString(el, 26);
    b.addEventListener("click", () => selectSandboxTool(id));
    qbar.appendChild(b);
  });

  // render loop
  const loop = () => {
    sandbox.step();
    sandbox.render();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  window.addEventListener("resize", () => { if (mode === "sandbox") sandbox.resize(); });
}

function selectSandboxTool(id) {
  if (mode !== "sandbox") switchMode("sandbox");
  sandbox.currentTool = id === "eraser" ? "eraser" : id;
  const el = id === "eraser" ? null : DB.elements[id];
  $("#sb-current").innerHTML = id === "eraser"
    ? `<span class="sb-cur-ic">🧽</span> Eraser`
    : `<span class="sb-cur-ic">${svgString(el, 24)}</span> ${el.name}`;
  toast(id === "eraser" ? "Eraser selected" : `Painting: ${el.name}`, "🖌️");
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
  touchGhost.innerHTML = svgString(el, 44);
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
