/* Pure colour helpers shared by the client form and the server-side generator.
   Deliberately free of "use client" and of any DOM access: lib/imageAnalysis.ts
   is browser-only (it needs a canvas), and importing that from the API route
   would drag a client module into a server handler. */

export type Surface = { bg: string; ink: string };

export type ColourRead = {
  /** the page's own ground, or null when no upload could name one */
  surface: Surface | null;
  /** accent first, then alt band, then borders — see BRAND_COLOR_ROLES */
  palette: string[];
};

type RefImage = { palette?: string[]; surface?: Surface | null };

/* ---- small colour maths, duplicated on purpose --------------------------- */

/* `lib/imageAnalysis.ts` has these too and cannot be imported here: it is a
   "use client" module that needs a canvas, and this file runs on the server. Six
   lines of arithmetic each, with no state and no room to drift. */

function rgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) as [number, number, number];
}

function lum([r, g, b]: [number, number, number]): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function chroma([r, g, b]: [number, number, number]): number {
  return Math.max(r, g, b) - Math.min(r, g, b);
}

function hue([r, g, b]: [number, number, number]): number {
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return ((h * 60) % 360 + 360) % 360;
}

/** Shortest way round the wheel, 0–180. */
function hueGap(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function far(a: [number, number, number], b: [number, number, number]): boolean {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2) >= 54;
}

/* ==========================================================================
   Several uploads, ONE answer.

   The two ways a merchant hands over a page — one full-page capture, or seven
   screenshots taken while scrolling — have to end in the same colours, and until
   now they did not come close.

   The old pair of functions read the uploads as if they were unrelated pages:
   `firstSurface` took the first upload's background and ignored the rest, and
   `mergePalettes` went round-robin, one colour from each upload in turn. That was
   defensible while position 0 of a palette was just "the biggest area". It stopped
   being defensible when position 0 became the ACCENT, because seven screenshots of
   one page all report the same accent — so round-robin handed the same orange to
   the accent, then to the alternating band, then to the borders, and the page came
   out orange three times over with no neutral band anywhere.

   Read as one page instead:

   - The background is the one the uploads AGREE on, by count. Seven crops of one
     page all report `#0A0A0A` and outvote a hero crop that reported something
     else because a photograph filled it.
   - The accent is the best single answer across all uploads, not the first — a
     merchant whose accent appears only in the footer still gets it.
   - The remaining roles are filled with colours that are actually DIFFERENT: far
     enough from each other, and far enough round the hue wheel from the accent
     that a band cannot be a paler version of it.
   ========================================================================== */

export function mergeReferenceColour(images: RefImage[], limit = 4): ColourRead {
  /* ---- the ground the uploads agree on ---------------------------------- */

  const votes = new Map<string, { n: number; inks: Map<string, number> }>();
  for (const img of images) {
    if (!img.surface) continue;
    const key = img.surface.bg.toLowerCase();
    const row = votes.get(key) ?? { n: 0, inks: new Map() };
    row.n++;
    const ink = img.surface.ink.toLowerCase();
    row.inks.set(ink, (row.inks.get(ink) ?? 0) + 1);
    votes.set(key, row);
  }

  let surface: Surface | null = null;
  if (votes.size > 0) {
    /* Ties go to the upload order, which is the order the merchant added them —
       `Map` keeps insertion order, so a stable sort on count alone does that. */
    const [bg, row] = [...votes.entries()].sort((a, b) => b[1].n - a[1].n)[0];
    const ink = [...row.inks.entries()].sort((a, b) => b[1] - a[1])[0][0];
    surface = { bg, ink };
  }

  const bgRgb = surface ? rgb(surface.bg) : null;
  const bgLum = bgRgb ? lum(bgRgb) : null;

  /* ---- the accent: the best answer anywhere, not the first --------------- */

  let accent: string | null = null;
  let accentRgb: [number, number, number] | null = null;
  for (const img of images) {
    const hex = img.palette?.[0];
    if (!hex) continue;
    const c = rgb(hex);
    if (!c) continue;
    /* Unusable against the page it would sit on. `styleToTokens` has a net under
       this as well, but a colour that is simply wrong should not reach it. */
    if (bgLum !== null && Math.abs(lum(c) - bgLum) < 0.18) continue;
    if (!accentRgb || chroma(c) > chroma(accentRgb)) {
      accent = hex;
      accentRgb = c;
    }
  }

  /* ---- the other roles, and they have to be other colours --------------- */

  const out: string[] = [];
  const kept: [number, number, number][] = [];

  if (accent && accentRgb) {
    out.push(accent);
    kept.push(accentRgb);
  }

  /* Round-robin by DEPTH still, so one upload does not fill every role, but
     starting past position 0 — position 0 is the accent and it has been decided. */
  const depth = Math.max(0, ...images.map((i) => i.palette?.length ?? 0));
  for (let d = 0; d < depth && out.length < limit; d++) {
    for (const img of images) {
      if (out.length >= limit) break;
      const hex = img.palette?.[d];
      if (!hex) continue;
      const c = rgb(hex);
      if (!c) continue;
      /* 0.03, not the 0.18 the accent has to clear. An accent has to be SEEN —
         it is a button. An alternating band has to be TOLD APART, and a panel a
         few percent lighter than the page is exactly what a subtle band is; the
         reference's own card backgrounds live in that range. Reusing the accent's
         threshold here threw them all away and left the page with no band at
         all. */
      if (bgLum !== null && Math.abs(lum(c) - bgLum) < 0.03) continue;
      if (kept.some((k) => !far(k, c))) continue;
      /* A band or a border in the accent's own hue reads as a weaker accent
         rather than as a second colour, and on a page whose accent is used
         widely it makes the whole page one temperature. */
      if (accentRgb && chroma(c) >= 40 && hueGap(hue(c), hue(accentRgb)) < 25) continue;
      out.push(hex);
      kept.push(c);
    }
  }

  return { surface, palette: out };
}

/**
 * Merge the palettes of several references into one ordered list.
 *
 * Kept for the paths that want colours and nothing else — the mockup's own style
 * swatch, and anything reading an upload outside the build. The build itself uses
 * `mergeReferenceColour`, which answers the background and the accent together
 * because on one page they are one question.
 */
export function mergePalettes(images: { palette?: string[] }[], limit = 4): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  // Round-robin so the first image does not monopolise the list.
  const depth = Math.max(0, ...images.map((i) => i.palette?.length ?? 0));
  for (let d = 0; d < depth && out.length < limit; d++) {
    for (const img of images) {
      const hex = img.palette?.[d];
      if (!hex || seen.has(hex)) continue;
      seen.add(hex);
      out.push(hex);
      if (out.length >= limit) break;
    }
  }
  return out;
}
