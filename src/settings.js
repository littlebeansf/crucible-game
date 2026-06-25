/* ============================================================================
   CRUCIBLE — Settings
   ----------------------------------------------------------------------------
   A small, dependency-free settings module. Wires the topbar gear button and
   the settings slide-over panel:

     • Theme        : "dark" (default) | "light"
     • Accent       : a hue chosen from a preset swatch row OR a custom picker

   Both are applied by toggling a `data-theme` attribute and writing CSS custom
   properties on <html>, and are persisted via the storage shim so the choice
   survives reloads (on GitHub Pages; in-memory inside sandboxed iframes).

   The CSS in style.css reads:
     html[data-theme="light"] { ...light tokens... }
     :root { --accent: …; --accent-2: …; --accent-ink: … }
============================================================================ */

const THEME_KEY = "crucible_theme";
const ACCENT_KEY = "crucible_accent";
const CREATURE_VIEW_KEY = "crucible_creature_view"; // "pixel" (default) | "emoji"

// Apply the chosen creature rendering style to the live creature system, if it
// exists yet. Safe to call before creatures are created (no-ops); main.js also
// re-applies the saved pref once the system is built.
function applyCreatureView(view) {
  const pixel = view !== "emoji";
  const cs = window.__crucible && window.__crucible.creatures;
  if (cs) cs.pixelArt = pixel;
  return pixel ? "pixel" : "emoji";
}

// Preset accent hues (HSL hue degrees). Calibrated to feel distinct.
export const ACCENT_PRESETS = [
  { id: "ember",   name: "Ember",   hue: 24,  label: "🔥" }, // default forge orange
  { id: "magma",   name: "Magma",   hue: 8,   label: "🌋" },
  { id: "gold",    name: "Gold",    hue: 42,  label: "🪙" },
  { id: "acid",    name: "Acid",    hue: 86,  label: "🧪" },
  { id: "jade",    name: "Jade",    hue: 158, label: "🌿" },
  { id: "cyan",    name: "Cyan",    hue: 188, label: "💎" },
  { id: "azure",   name: "Azure",   hue: 212, label: "🌊" },
  { id: "violet",  name: "Violet",  hue: 268, label: "🔮" },
  { id: "magenta", name: "Magenta", hue: 322, label: "🎆" },
];

const DEFAULT_HUE = 24;

// Derive a full accent set from a single hue and apply to :root.
function applyAccent(hue) {
  const h = Math.max(0, Math.min(360, Number(hue) || DEFAULT_HUE));
  const root = document.documentElement;
  // primary, a slightly shifted secondary (for gradients), a soft tint, ink for text-on-accent
  root.style.setProperty("--accent-h", String(h));
  root.style.setProperty("--accent", `hsl(${h} 92% 56%)`);
  root.style.setProperty("--accent-2", `hsl(${(h + 18) % 360} 96% 50%)`);
  // legacy alias used throughout style.css
  root.style.setProperty("--accent2", `hsl(${(h + 160) % 360} 90% 62%)`);
  root.style.setProperty("--accent-strong", `hsl(${h} 96% 46%)`);
  root.style.setProperty("--accent-soft", `hsl(${h} 86% 60% / 0.16)`);
  root.style.setProperty("--accent-line", `hsl(${h} 80% 60% / 0.34)`);
  root.style.setProperty("--accent-glow", `hsl(${h} 95% 56% / 0.40)`);
  // dark text reads better on bright yellow/green hues; light text on the rest
  const darkInk = h >= 36 && h <= 150;
  root.style.setProperty("--accent-ink", darkInk ? "#160c00" : "#fff");
}

function applyTheme(theme) {
  const t = theme === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", t);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", t === "light" ? "#f4f1ea" : "#0b0e14");
  return t;
}

export function setupSettings(storage) {
  // --- restore persisted prefs (apply before first paint of panel) ---------
  const savedTheme = storage.get(THEME_KEY) || "dark";
  const savedHue = Number(storage.get(ACCENT_KEY));
  applyTheme(savedTheme);
  applyAccent(Number.isFinite(savedHue) ? savedHue : DEFAULT_HUE);

  const savedView = storage.get(CREATURE_VIEW_KEY) === "emoji" ? "emoji" : "pixel";
  applyCreatureView(savedView);

  let theme = savedTheme === "light" ? "light" : "dark";
  let hue = Number.isFinite(savedHue) ? savedHue : DEFAULT_HUE;
  let creatureView = savedView;

  const $ = (s) => document.querySelector(s);
  const panel = $("#settings-panel");
  const backdrop = $("#settings-backdrop");
  const btn = $("#settings-btn");
  if (!panel) return; // HTML not present yet — fail soft

  const open = () => {
    syncUI();
    panel.classList.add("open");
    backdrop?.classList.add("show");
  };
  const close = () => {
    panel.classList.remove("open");
    backdrop?.classList.remove("show");
  };

  btn?.addEventListener("click", open);
  $("#settings-close")?.addEventListener("click", close);
  backdrop?.addEventListener("click", close);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && panel.classList.contains("open")) close();
  });

  // --- settings tabs --------------------------------------------------------
  const tabBtns = [...panel.querySelectorAll(".set-tab")];
  const panes = [...panel.querySelectorAll(".set-pane")];
  const selectTab = (name) => {
    tabBtns.forEach((b) => {
      const on = b.dataset.tab === name;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-selected", String(on));
    });
    panes.forEach((p) => {
      const on = p.dataset.pane === name;
      p.classList.toggle("is-active", on);
      p.hidden = !on;
    });
  };
  tabBtns.forEach((b) => b.addEventListener("click", () => selectTab(b.dataset.tab)));

  // --- theme toggle ---------------------------------------------------------
  // Scope to buttons that actually carry data-theme so the creature-style
  // toggle (also .theme-opt) isn't mistaken for a theme switch.
  const themeBtns = [...panel.querySelectorAll(".theme-opt[data-theme]")];
  themeBtns.forEach((b) =>
    b.addEventListener("click", () => {
      theme = b.dataset.theme === "light" ? "light" : "dark";
      applyTheme(theme);
      storage.set(THEME_KEY, theme);
      syncUI();
    })
  );

  // --- creature style toggle (pixel | emoji) --------------------------------
  const viewBtns = [...panel.querySelectorAll(".theme-opt[data-creature-view]")];
  viewBtns.forEach((b) =>
    b.addEventListener("click", () => {
      creatureView = b.dataset.creatureView === "emoji" ? "emoji" : "pixel";
      applyCreatureView(creatureView);
      storage.set(CREATURE_VIEW_KEY, creatureView);
      syncUI();
    })
  );

  // --- accent swatches ------------------------------------------------------
  const swatchWrap = $("#accent-swatches");
  if (swatchWrap) {
    swatchWrap.innerHTML = ACCENT_PRESETS.map(
      (p) =>
        `<button class="swatch" data-hue="${p.hue}" title="${p.name}"
           style="--sw:hsl(${p.hue} 92% 56%)"><span class="sw-dot"></span><span class="sw-name">${p.name}</span></button>`
    ).join("");
    swatchWrap.querySelectorAll(".swatch").forEach((b) =>
      b.addEventListener("click", () => {
        hue = Number(b.dataset.hue);
        applyAccent(hue);
        storage.set(ACCENT_KEY, String(hue));
        syncUI();
      })
    );
  }

  // --- custom hue slider ----------------------------------------------------
  const slider = $("#accent-slider");
  if (slider) {
    slider.addEventListener("input", (e) => {
      hue = Number(e.target.value);
      applyAccent(hue);
      syncUI(true);
    });
    slider.addEventListener("change", () => storage.set(ACCENT_KEY, String(hue)));
  }

  // --- keep the panel's controls in sync with current state -----------------
  function syncUI(sliderOnly = false) {
    if (!sliderOnly) {
      themeBtns.forEach((b) =>
        b.classList.toggle("active", b.dataset.theme === theme)
      );
      viewBtns.forEach((b) =>
        b.classList.toggle("active", b.dataset.creatureView === creatureView)
      );
      if (slider) slider.value = String(hue);
    }
    swatchWrap?.querySelectorAll(".swatch").forEach((b) =>
      b.classList.toggle("active", Number(b.dataset.hue) === hue)
    );
    const preview = $("#accent-preview");
    if (preview) {
      preview.style.background = `hsl(${hue} 92% 56%)`;
      const lbl = $("#accent-hue-label");
      if (lbl) lbl.textContent = `${Math.round(hue)}°`;
    }
  }

  syncUI();

  // expose for debugging / tests
  return {
    setTheme: (t) => { theme = t; applyTheme(t); storage.set(THEME_KEY, t); syncUI(); },
    setHue: (h) => { hue = h; applyAccent(h); storage.set(ACCENT_KEY, String(h)); syncUI(); },
    setCreatureView: (v) => { creatureView = v === "emoji" ? "emoji" : "pixel"; applyCreatureView(creatureView); storage.set(CREATURE_VIEW_KEY, creatureView); syncUI(); },
    get theme() { return theme; },
    get hue() { return hue; },
    get creatureView() { return creatureView; },
  };
}
