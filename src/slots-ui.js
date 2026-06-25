/* ============================================================================
   CRUCIBLE — Save Slots UI
   ----------------------------------------------------------------------------
   Renders the "Save slots" section inside the Settings panel and wires every
   action: switch, create, rename, duplicate and delete. Switching a slot
   reloads game + runs state in place (no page reload) via the supplied hooks.

   Decoupled from main.js so the emoji-rich markup lives in its own file.
   `setupSlots(ctx)` takes a context object:
     { slots, state, runs, onSwitch(), toast(msg, icon) }
============================================================================ */

const fmtAgo = (ts) => {
  if (!ts) return "never";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "yesterday" : `${d}d ago`;
};

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

export function setupSlots(ctx) {
  const { slots } = ctx;
  const list = document.querySelector("#slot-list");
  const newBtn = document.querySelector("#slot-new");
  if (!list || !newBtn) return; // markup absent — fail soft

  let renamingId = null;

  function render() {
    const all = slots.list();
    const activeId = slots.activeId();
    const total = ctx.state ? Object.keys(ctx.state.elements).length : 0;

    list.innerHTML = all
      .map((s) => {
        const isActive = s.id === activeId;
        const canDelete = all.length > 1;
        if (renamingId === s.id) {
          return `
            <div class="slot${isActive ? " active" : ""}" data-id="${s.id}">
              <input class="slot-rename" type="text" maxlength="28"
                     value="${esc(s.name)}" data-id="${s.id}" aria-label="Rename slot" />
              <div class="slot-acts">
                <button class="slot-act" data-act="rename-ok" data-id="${s.id}" title="Save name">✓</button>
                <button class="slot-act" data-act="rename-cancel" data-id="${s.id}" title="Cancel">✕</button>
              </div>
            </div>`;
        }
        const found = s.found || 0;
        const pct = total ? Math.round((found / total) * 100) : 0;
        const sub = isActive
          ? `<span class="slot-active-tag">● Active</span> · ${found}/${total} · ${pct}%`
          : `${found}/${total} discovered · ${fmtAgo(s.updated)}`;
        return `
          <div class="slot${isActive ? " active" : ""}" data-id="${s.id}">
            <button class="slot-pick" data-act="switch" data-id="${s.id}" title="${isActive ? "This is the active slot" : "Switch to this slot"}">
              <span class="slot-dot">${isActive ? "▶" : "◆"}</span>
              <span class="slot-meta">
                <span class="slot-name">${esc(s.name)}</span>
                <span class="slot-sub">${sub}</span>
              </span>
            </button>
            <div class="slot-acts">
              <button class="slot-act" data-act="rename" data-id="${s.id}" title="Rename">✎</button>
              <button class="slot-act" data-act="dupe" data-id="${s.id}" title="Duplicate"${slots.canCreate() ? "" : " disabled"}>⧉</button>
              <button class="slot-act danger" data-act="delete" data-id="${s.id}" title="Delete"${canDelete ? "" : " disabled"}>🗑</button>
            </div>
          </div>`;
      })
      .join("");

    newBtn.disabled = !slots.canCreate();
    newBtn.title = slots.canCreate()
      ? "Create a new save slot"
      : `Maximum ${slots.maxSlots()} slots reached`;
  }

  function switchTo(id) {
    if (id === slots.activeId()) return;
    if (!slots.setActive(id)) return;
    ctx.onSwitch();                 // reload game + runs state, re-render app
    render();
    const s = slots.get(id);
    ctx.toast(`Switched to ${s ? s.name : "slot"}`, "💾");
  }

  // event delegation for all slot actions
  list.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const id = btn.dataset.id;
    const act = btn.dataset.act;

    if (act === "switch") return switchTo(id);

    if (act === "rename") { renamingId = id; render(); 
      const inp = list.querySelector(`.slot-rename[data-id="${id}"]`);
      inp?.focus(); inp?.select(); return; }

    if (act === "rename-cancel") { renamingId = null; return render(); }

    if (act === "rename-ok") {
      const inp = list.querySelector(`.slot-rename[data-id="${id}"]`);
      const name = inp ? inp.value : "";
      if (name.trim()) slots.rename(id, name);
      renamingId = null;
      return render();
    }

    if (act === "dupe") {
      const s = slots.duplicate(id);
      if (s) { render(); ctx.toast(`Copied to “${s.name}”`, "⧉"); }
      return;
    }

    if (act === "delete") {
      const s = slots.get(id);
      if (!s) return;
      if (!confirm(`Delete “${s.name}”? Its discoveries and best run will be lost. This cannot be undone.`)) return;
      const wasActive = id === slots.activeId();
      slots.remove(id);
      if (wasActive) ctx.onSwitch(); // active slot changed → reload state
      render();
      ctx.toast(`Deleted “${s.name}”`, "🗑");
    }
  });

  // Enter / Escape while renaming
  list.addEventListener("keydown", (e) => {
    const inp = e.target.closest(".slot-rename");
    if (!inp) return;
    if (e.key === "Enter") {
      e.preventDefault();
      const id = inp.dataset.id;
      if (inp.value.trim()) slots.rename(id, inp.value);
      renamingId = null;
      render();
    } else if (e.key === "Escape") {
      e.preventDefault();
      renamingId = null;
      render();
    }
  });

  newBtn.addEventListener("click", () => {
    const s = slots.create();
    if (!s) return;
    render();
    ctx.toast(`Created “${s.name}”`, "✨");
  });

  render();
  // expose for tests / re-render after external save metadata changes
  return { render };
}
