/* ============================================================================
   CRUCIBLE — Pixel creature sprites
   ----------------------------------------------------------------------------
   Hand-authored low-res sprites for every creature species, drawn blocky on the
   sandbox canvas as an alternative to the emoji renderer. Each sprite is a small
   grid of single-character keys that map into a per-sprite palette:

       "." = transparent (skip)
       any other key = a colour from that sprite's `pal`

   Sprites are authored FACING RIGHT. The creature renderer handles horizontal
   flipping (facing), bob, scale and tint, so these only describe the artwork.

   drawPixelCreature() scales the grid so the sprite's WIDTH ≈ the species'
   on-screen size, centres it on the creature's origin, and paints one filled
   rect per opaque pixel. A 1px "pixel gap" is avoided by rounding to device
   pixels and slightly overdrawing each block.
============================================================================ */

// Shared palette atoms reused across sprites (keeps definitions short & tidy).
const C = {
  k: "#1a1d24", // outline / dark
  w: "#f4f6fb", // white
  o: "#ff7a1a", // orange
  y: "#ffd23f", // yellow
  r: "#e0584a", // red
  p: "#ff5fa2", // pink
  g: "#5fd17a", // green
  G: "#2f9e54", // deep green
  b: "#3aa0ff", // blue
  B: "#1f6fd0", // deep blue
  c: "#7fe3ff", // cyan
  n: "#8a5a2b", // brown
  N: "#5e3c1c", // dark brown
  t: "#d9a066", // tan
  s: "#9aa3ad", // grey
  S: "#5b636e", // dark grey
  d: "#2b2f38", // near-black body
  f: "#ffe0b0", // skin / flesh
  u: "#b07a45", // hide
  e: "#101319", // eye-dark
};

/* Each entry: { w, h, pal, px:[rows] }. Rows are equal-length strings. */
export const SPRITES = {
  // ---- water -------------------------------------------------------------
  fish: {
    pal: { O: C.o, Y: C.y, k: C.k, w: C.w, e: C.e },
    px: [
      "...OO....",
      "..OOOOO.k",
      ".OOYYOOkk",
      "OOOYwOOOk",
      ".OOYYOOkk",
      "..OOOOO.k",
      "...OO....",
    ],
  },
  shark: {
    pal: { s: C.s, S: C.S, w: C.w, k: C.k, e: C.e },
    px: [
      "....S......",
      "...SSS.....",
      "SSSSSSSSk..",
      "sSSSSSSSSSk",
      "swwSSSSSSSk",
      "swewSSSSk..",
      ".sssSSk....",
      "....SS.....",
    ],
  },
  duck: {
    pal: { w: C.w, y: C.y, o: C.o, k: C.k, e: C.e },
    px: [
      "....www..",
      "...wwwwwo",
      "..wwwwwoo",
      "k.wwwwww.",
      "wwwwwwww.",
      "wwwwwwww.",
      ".oo..oo..",
    ],
  },
  // ---- air ---------------------------------------------------------------
  bird: {
    pal: { b: C.b, B: C.B, y: C.y, k: C.k, w: C.w, e: C.e },
    px: [
      "...BB....",
      "..BBBBy..",
      ".BBwBByy.",
      "BBBwBBB..",
      ".BBBBBB..",
      "..BBBB...",
      "...y.y...",
    ],
  },
  butterfly: {
    pal: { p: C.p, P: "#c93f7d", y: C.y, k: C.k },
    px: [
      "pp..k..pp",
      "ppp.k.ppp",
      "pPpykypPp",
      ".pp.k.pp.",
      "ppp.k.ppp",
      "pPp.k.pPp",
      ".p..k..p.",
    ],
  },
  bee: {
    pal: { y: C.y, k: C.k, w: C.w, e: C.e },
    px: [
      ".w...w...",
      "..www....",
      ".kykyky.k",
      "yykykyyykk",
      ".kykyky.k",
      "..yyyy...",
    ],
  },
  // ---- land walkers ------------------------------------------------------
  human: {
    pal: { f: C.f, b: C.B, k: C.k, n: C.n, e: C.e },
    px: [
      "..nn..",
      "..ff..",
      ".feef.",
      "..ff..",
      ".bbbb.",
      ".bbbb.",
      ".b..b.",
      ".f..f.",
    ],
  },
  dog: {
    pal: { n: C.n, N: C.N, k: C.k, w: C.w, e: C.e },
    px: [
      "......nn.",
      ".nn..nnnn",
      "nnnnnnnne",
      "nnnnnnnnn",
      "nnnnnnnn.",
      ".n.nn.n..",
      ".n.nn.n..",
    ],
  },
  frog: {
    pal: { g: C.g, G: C.G, k: C.k, w: C.w, e: C.e },
    px: [
      ".w.....w.",
      "gegg.ggeg",
      "ggggggggg",
      "GgggggggG",
      "GGGGGGGGG",
      "gG.GGG.Gg",
      "g.......g",
    ],
  },
  cow: {
    pal: { w: C.w, k: C.k, p: C.p, e: C.e },
    px: [
      "k......k.",
      "wwwkwwwwk",
      "wkwwwwwwe",
      "wwwwkkwww",
      "wwkkwwwww",
      ".k.kk.k..",
      ".k.kk.k..",
    ],
  },
  sheep: {
    pal: { w: C.w, S: C.S, k: C.k, e: C.e },
    px: [
      "..wwww...",
      ".wwwwwwSS",
      "wwwwwwwSe",
      "wwwwwwSSS",
      "wwwwwwww.",
      ".S.SS.S..",
      ".S.SS.S..",
    ],
  },
  horse: {
    pal: { n: C.n, N: C.N, k: C.k, e: C.e },
    px: [
      ".......nn",
      "N....nnnn",
      "Nnnnnnnne",
      "NnnnnnnnN",
      ".nnnnnnn.",
      ".n.nn.n..",
      ".n.nn.n..",
    ],
  },
  lion: {
    pal: { t: C.t, n: C.n, N: C.N, k: C.k, e: C.e },
    px: [
      "......nn.",
      ".nnn.nttn",
      "ntntntte.",
      "ntttttttt",
      ".ttttttt.",
      ".t.tt.t..",
      ".t.tt.tn.",
    ],
  },
  elephant: {
    pal: { s: C.s, S: C.S, k: C.k, w: C.w, e: C.e },
    px: [
      "...sssss..",
      "..ssssssss",
      ".sssssssse",
      "sssssssss.",
      "ssssssss..",
      "ss.ss.ss.s",
      "ss.ss.ss.s",
    ],
  },
  monkey: {
    pal: { n: C.n, t: C.t, k: C.k, e: C.e },
    px: [
      "n......n.",
      ".nttttn..",
      ".ntetn..n",
      ".nttttn.n",
      "nnnnnnn.n",
      ".n.nn.n.n",
      ".n.nn.n..",
    ],
  },
  penguin: {
    pal: { k: C.k, w: C.w, o: C.o, e: C.e },
    px: [
      "..kkk....",
      ".kkkkk...",
      "kkwwkke..",
      "kwwwwko..",
      "kwwwwwk..",
      "kwwwwwk..",
      ".oo.oo...",
    ],
  },
};

// Fallback dot for any species without a sprite yet.
const FALLBACK = { pal: { a: "#cfd6e2" }, px: ["aa", "aa"] };

/* Draw a creature's pixel sprite, centred on the current ctx origin and already
   flipped/scaled by the caller. `size` is the desired on-screen WIDTH in px. */
export function drawPixelCreature(ctx, kind, size) {
  const sp = SPRITES[kind] || FALLBACK;
  const cols = sp.px[0].length;
  const rows = sp.px.length;
  // one art-pixel = `unit` device px; keep crisp by rounding, min 1px.
  const unit = Math.max(1, Math.round(size / cols));
  const ox = -(cols * unit) / 2;
  const oy = -(rows * unit) / 2;
  // overdraw blocks by ~0.6px to hide seams between adjacent pixels.
  const pad = 0.6;
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < rows; y++) {
    const row = sp.px[y];
    for (let x = 0; x < cols; x++) {
      const key = row[x];
      if (!key || key === ".") continue;
      const col = sp.pal[key];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(ox + x * unit - pad, oy + y * unit - pad, unit + pad * 2, unit + pad * 2);
    }
  }
}

export function hasPixelSprite(kind) {
  return !!SPRITES[kind];
}
