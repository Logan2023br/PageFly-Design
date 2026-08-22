"use client";

import type {
  LayoutFingerprint,
  RefBand,
  RefBandKind,
} from "./refLayout";
/* Shared with `briefSchema`, which validates what this produces. See the note
   on `MAX_SLICES` for why it lives there and not here. */
import { MAX_SLICES } from "./briefOptions";

/* ==========================================================================
   Reference image preparation.

   Runs entirely in the browser on a canvas. Two jobs:

   1. Downscale + re-encode to a data URL. Object URLs die when the upload is
      removed and cannot be serialised through the generation contract, which
      would leave already-generated mockups pointing at nothing. A bounded data
      URL is stable, survives a removal, and makes PNG export work without any
      CORS or blob-fetch handling.

   2. Read the reference: its dominant palette AND its layout fingerprint. A
      reference image is a picture of a page whose STRUCTURE the merchant wants,
      so the section rhythm, column counts and banding are the valuable part.

   The uploaded pixels are never used as product imagery — those are drawn from
   scratch in components/mockup/primitives.tsx. Pasting the reference into every
   product slot produced eight copies of the same screenshot.

   What this cannot do: read words, identify a font, or tell a testimonial block
   from an FAQ. That needs vision, and is what the Claude skill adds. See
   lib/refLayout.ts for the limits written out in full.
   ========================================================================== */

export const REF_MAX_EDGE = 1024;

/* ==========================================================================
   Slices for the vision pass.

   `REF_MAX_EDGE` caps the LONG edge, which is right for the thumbnail and wrong
   for reading. A page screenshot's long edge is its height, so a 1500x8000
   capture arrives 192 wide — and measured against the same image at full size,
   Haiku went from naming sixteen sections and quoting the page's own Polish
   headings to missing the FAQ, calling a light band dark, and guessing "massage
   device section" from a shape.

   Enlarging the whole image does not fix it. Claude resizes any image to 1568px
   on its long edge, so a 1:5.7 page is 275px wide however many megabytes were
   uploaded. The only thing that raises the horizontal resolution is cutting the
   page into pieces that are not extremely tall — four slices of that same page
   are 1100px wide each.

   Kept at the source resolution, capped only by what the API will use. */
const SLICE_MAX_EDGE = 1568;

/** Above this ratio a page is tall enough that one image cannot be read. */
const SLICE_ABOVE_RATIO = 2;

/** Each slice is about this tall relative to its width — near a photograph's
    shape, which is what the resize budget is spent best on. */
const SLICE_RATIO = 1.4;

/* How many pieces one upload may be cut into.
​
   Six, not four, and the difference is whether uploading one screenshot is as
   good as uploading seven. Measured on a real product page, 1140px wide and
   about 7,500 tall:

     4 slices   1875px tall each, over the 1568 ceiling → downscaled to 953px wide
     6 slices   1500px tall each, under the ceiling     → kept at 1140px wide

   The same page hand-cut into seven screenshots arrives at 1140px. So at four
   the merchant was rewarded for doing the cutting themselves, and at six the two
   ways of giving us the same page are worth the same. Cutting it up by hand also
   costs them the page's continuity — see `layoutToHints`.

   Each extra slice is about 600 Haiku tokens, once per build, so the ceiling on
   this is judgement rather than money: past six, slices get short enough that a
   section is regularly split across two of them. */
/**
 * The ceiling that actually bites, and it is not the file size.
 *
 * A canvas has a pixel budget, and browsers differ sharply: Safari gives up
 * around 16.7M pixels, Chrome much later. Past it `drawImage` does not throw —
 * it produces a blank canvas, so the upload looks accepted and every slice comes
 * back empty. A 50 MB retina capture of a long page is easily 60M pixels.
 *
 * 12M keeps the whole range safe. Anything larger is scaled down before it is
 * ever drawn, which costs sharpness the API would have taken anyway: each slice
 * is capped at 1568px regardless.
 */
const MAX_SOURCE_PIXELS = 12_000_000;
/** Palette is sampled from a tiny canvas — accuracy past this is wasted work. */
/* How many pixels the colour pass gets to look at.

   A BUDGET, not an edge length, and that distinction is the whole point. The
   sample used to be capped on its LONG edge at 48px, which is fine for a square
   photograph and close to useless for a page: a 1500x8000 screenshot came out
   9x48, or 432 pixels. Raising the cap to 96 only made it 15x96 — 1,440 pixels,
   fifteen of them across — and a page's ACCENT is small by nature, so at that
   width the buttons and rules that carry it are gone entirely. Measured on a real
   reference: the extractor found the dark panels and never saw the orange.

   Capping total area instead keeps the aspect ratio and spends the pixels where a
   tall page needs them. The same 1500x8000 becomes about 86x462 — 86 across
   rather than 15 — for the same arithmetic cost, because the cost is the pixel
   count and the pixel count is what is being held constant.

   40,000 is a loop of forty thousand additions in a browser that has just
   decoded a 20MB PNG. It does not register. */
const SAMPLE_PIXELS = 40_000;
const MAX_PALETTE = 4;

export type PreparedImage = {
  /** bounded, serialisable copy. NOT rendered into mockups — kept so the real
      vision-capable generator has the image to send. */
  dataUrl: string;
  /**
   * The same picture cut into readable pieces, in order, for the model that
   * reads it. One entry when the image is not tall; up to four when it is.
   */
  slices: string[];
  /** the structural read: section rhythm, columns, banding */
  layout: LayoutFingerprint | null;
  /** dominant colours, most prominent first */
  palette: string[];
  /**
   * The reference's own page background and text colour.
   *
   * Deliberately NOT taken from `palette`, which cannot answer this question:
   * its first pass throws away everything under 16% saturation, because it was
   * built to find three or four brand-ish colours and a white background is not
   * a brand colour. So a merchant who uploaded a page on near-black handed us
   * that fact and it reached nothing — the accent came off their reference and
   * the page underneath it stayed whatever Step 2's style card said.
   *
   * A page background is not the most VIVID colour in a screenshot, it is the
   * most COMMON one, and usually a neutral. That is a different question and
   * this is the answer to it. Null when no colour holds enough of the image to
   * be a background — a single full-bleed photograph with no page around it.
   */
  surface: { bg: string; ink: string } | null;
  width: number;
  height: number;
  /** 0..1 average perceptual lightness — used to pick the image treatment */
  lightness: number;
  /** 0..1 average saturation */
  saturation: number;
};

function toHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"))
      .join("")
  );
}

function rgbToHsl(r: number, g: number, b: number) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { s, l };
}

function luminance(r: number, g: number, b: number) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function distance(a: [number, number, number], b: [number, number, number]) {
  return Math.sqrt(
    (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2,
  );
}

/**
 * Coarse histogram quantisation.
 *
 * Not k-means: for picking three or four brand-ish colours out of a product
 * photo, bucketing into a 16-level-per-channel grid and taking the biggest
 * buckets gets the same answer far more cheaply, and — being arithmetic rather
 * than iterative — gives the same answer every time.
 */
/**
 * How far from grey, 0–255.
 *
 * Not HSL saturation, which is unstable at the two ends of the lightness range:
 * `#FAFAF8` is white to any eye and computes as 17% saturated, because the
 * formula divides a two-point spread by a denominator that has gone almost to
 * zero. That is exactly the range a page background lives in, so the neutral
 * test below read every off-white as a colour and preferred a photograph's
 * beige over the page it sat on.
 */
function chroma([r, g, b]: [number, number, number]): number {
  return Math.max(r, g, b) - Math.min(r, g, b);
}

/** Position on the colour wheel, 0–360. Grey returns 0 and is filtered out by
    `chroma` before this is ever asked. */
function hue([r, g, b]: [number, number, number]): number {
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h =
    max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return ((h * 60) % 360 + 360) % 360;
}

/** `#0A0A0A` back to numbers, for comparing an accent against the background. */
function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) as [number, number, number];
}

/** Clean up the extremes. A 16-level bucket averages #F0F0F0 and #FFFFFF into
    something like #FAFAFA, and a page whose background is "nearly white" but not
    white puts every card on a shade nobody chose. */
function snap(rgb: [number, number, number]): [number, number, number] {
  if (rgb.every((v) => v >= 244)) return [255, 255, 255];
  if (rgb.every((v) => v <= 14)) return [10, 10, 10];
  return rgb;
}

/**
 * The reference's page background, and the ink that sits on it.
 *
 * `bg` is the most common bucket, with one bias: among the top few, a neutral is
 * preferred over a saturated one that is close behind it. Pages have grey, white
 * and near-black backgrounds far more often than they have orange ones, and the
 * biggest bucket in a screenshot with a large photograph is sometimes the
 * photograph. The bias is a nudge, not a veto — a genuinely coloured background
 * that dominates the image still wins.
 *
 * `ink` is then the most common bucket far enough away from `bg` in lightness to
 * be readable on it, which is what body text is. Falling back to a flat invert
 * rather than to null: a background with no ink is not usable by the caller, and
 * black-on-white is never wrong.
 *
 * Exported for `scripts/test-surface.ts`. It takes buckets rather than pixels
 * precisely so it can be tested without a canvas — this decides the colour of
 * every section on the page, and a browser-only function is a function nobody
 * checks.
 */
/**
 * The one colour on the reference that is doing the shouting.
 *
 * `extractPalette` ranks by AREA, and for the background that is exactly right —
 * a background is the most common colour on a page. For the accent it is exactly
 * backwards, because AN ACCENT IS SMALL BY DEFINITION. It is a button, a rule,
 * one word in a headline.
 *
 * Measured on a real case: a reference on near-black with bright orange buttons
 * and orange underlines throughout. Ranked by area the biggest saturated buckets
 * were the dark brown panels behind the content, so the accent came out `#24150D`
 * — and on a `#0A0A0A` page a dark brown button is a button nobody can see. The
 * orange, being small, never got near the front of the list.
 *
 * So this ranks by chroma instead, over anything holding at least half a percent
 * of the image, and it requires a real lightness gap from the background. An
 * accent that cannot be seen against the page is not an accent, whatever the
 * reference did with it.
 */
function pickAccent(
  ranked: { rgb: [number, number, number]; n: number }[],
  counted: number,
  bg: [number, number, number] | null,
): [number, number, number] | null {
  if (counted === 0) return null;
  const bgLum = bg ? luminance(...bg) : null;

  const usable = ranked.filter((c) => {
    if (chroma(c.rgb) < 40) return false;
    if (bgLum !== null && Math.abs(luminance(...c.rgb) - bgLum) < 0.18) return false;
    return true;
  });
  if (usable.length === 0) return null;

  /* GROUPED BY HUE, then the purest member of the winning group.

     An area floor on a single bucket does not work here and two attempts at
     tuning one proved it. A 16-level bucket AVERAGES what falls into it, so one
     orange on a dark page arrives as a family: the pure `#E5671D` of a button
     face, the muddy `#773A18` where an orange rule is antialiased against black,
     and several shades between. Every one of them is small. Judged individually
     the muddy ones win on area and the pure one is rejected as noise, which is
     how the accent came out `#773A18` at 2.27:1 against the page.

     Asked as "which hue family does this page use for emphasis, and what is its
     purest form", both problems go away: the family is big enough to trust, and
     its most chromatic member is the colour the designer actually chose — the
     others are that colour blended with whatever it sat on.

     The floor moves to the family, at 0.2%. A whole hue family under a fifth of
     a percent of a page is not that page's accent. */
  const families = new Map<
    number,
    { n: number; best: { rgb: [number, number, number]; n: number } }
  >();
  for (const c of usable) {
    const bin = Math.floor(hue(c.rgb) / 30);
    const cur = families.get(bin);
    if (!cur) families.set(bin, { n: c.n, best: c });
    else {
      cur.n += c.n;
      if (chroma(c.rgb) > chroma(cur.best.rgb)) cur.best = c;
    }
  }

  const winner = [...families.values()].sort((a, b) => b.n - a.n)[0];
  if (!winner || winner.n / counted < 0.002) return null;
  return winner.best.rgb;
}

export function extractSurface(
  ranked: { rgb: [number, number, number]; n: number }[],
  counted: number,
): { bg: string; ink: string } | null {
  if (counted === 0 || ranked.length === 0) return null;

  const share = (n: number) => n / counted;

  /* Under this, nothing in the image is acting as a background — a single
     full-bleed photograph, or a collage. Better to say so than to paint the
     merchant's page the colour of a concrete floor. */
  if (share(ranked[0].n) < 0.15) return null;

  let bg = ranked[0];
  const neutral = ranked
    .slice(0, 6)
    .find((c) => chroma(c.rgb) < 24 && c.n >= ranked[0].n * 0.6);
  if (neutral) bg = neutral;

  const bgRgb = snap(bg.rgb);
  const bgLum = luminance(...bgRgb);

  /* The FARTHEST from the background, not the most common far-enough one.

     Taking the most common was wrong in a way that only showed up once the
     sample got big enough to see it: on a near-black page the most frequent
     bucket clearing the gap is the mid-grey of antialiased text EDGES, not the
     text. That produced `#878686` at 5.45:1 where the page's real ink is
     near-white at 18:1 — legible, and not what the merchant uploaded.

     Text sits at the far end; its edges sit between. So the extreme is the
     answer, with an area floor to keep a stray white speck out of it. */
  const inkCandidates = ranked.filter(
    (c) =>
      c.n / counted >= 0.002 &&
      chroma(c.rgb) < 60 &&
      Math.abs(luminance(...c.rgb) - bgLum) >= 0.45,
  );
  inkCandidates.sort(
    (a, b) =>
      Math.abs(luminance(...b.rgb) - bgLum) - Math.abs(luminance(...a.rgb) - bgLum) ||
      b.n - a.n,
  );
  const inkBucket = inkCandidates[0];

  const inkRgb: [number, number, number] = inkBucket
    ? snap(inkBucket.rgb)
    : bgLum > 0.5
      ? [20, 22, 26]
      : [246, 246, 244];

  return { bg: toHex(...bgRgb), ink: toHex(...inkRgb) };
}

/* Exported for `scripts/check-colours.ts`, which runs it on a real reference
   image and prints what it found. This function decides the colour of every
   section of the built page; verifying it by eye on a screenshot after a
   ten-minute build is not verifying it. */
export function extractPalette(data: Uint8ClampedArray): {
  palette: string[];
  surface: { bg: string; ink: string } | null;
  lightness: number;
  saturation: number;
} {
  const buckets = new Map<
    number,
    { n: number; r: number; g: number; b: number }
  >();

  let lumSum = 0;
  let satSum = 0;
  let counted = 0;

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 200) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    lumSum += luminance(r, g, b);
    satSum += rgbToHsl(r, g, b).s;
    counted++;

    const key =
      ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4); // 16 levels per channel
    const cur = buckets.get(key);
    if (cur) {
      cur.n++;
      cur.r += r;
      cur.g += g;
      cur.b += b;
    } else {
      buckets.set(key, { n: 1, r, g, b });
    }
  }

  const lightness = counted ? lumSum / counted : 0.5;
  const saturation = counted ? satSum / counted : 0;

  const ranked = [...buckets.values()]
    .map((v) => ({
      rgb: [v.r / v.n, v.g / v.n, v.b / v.n] as [number, number, number],
      n: v.n,
    }))
    .sort((a, b) => b.n - a.n);

  /* Two passes: first insist on colours with some life in them, then relax if
     the image genuinely is a greyscale or near-white photo. */
  const pick = (minSat: number, minLum: number, maxLum: number) => {
    const out: [number, number, number][] = [];
    for (const c of ranked) {
      const [r, g, b] = c.rgb;
      const { s } = rgbToHsl(r, g, b);
      const lum = luminance(r, g, b);
      if (s < minSat || lum < minLum || lum > maxLum) continue;
      // keep the swatches visibly distinct from each other
      if (out.some((o) => distance(o, c.rgb) < 54)) continue;
      out.push(c.rgb);
      if (out.length >= MAX_PALETTE) break;
    }
    return out;
  };

  let chosen = pick(0.16, 0.08, 0.93);
  if (chosen.length < 2) chosen = pick(0.06, 0.05, 0.96);
  if (chosen.length === 0) chosen = pick(0, 0, 1);

  const surface = extractSurface(ranked, counted);

  /* Position 0 of `palette` is the ACCENT — `BRAND_COLOR_ROLES` says so and
     `styleToTokens` reads it that way. It used to be whatever had the most area,
     which is the wrong question for an accent; `pickAccent` asks the right one
     and its answer is promoted to the front. The rest of the list keeps its
     area order, because "alt band" and "borders" genuinely do want the colours
     the reference used most. */
  const bgRgb = surface ? hexToRgb(surface.bg) : null;
  const accent = pickAccent(ranked, counted, bgRgb);

  /* Anything that cannot be told apart from the page is not usable in ANY of the
     three roles — accent, alt band and borders all sit on this background — so it
     is dropped rather than left to become one of them by position.

     This is what shipped the invisible Buy button in the end: even after
     `pickAccent` correctly declined a dark brown for having no lightness gap, the
     brown was still first in the area-ranked list, and first in the list IS the
     accent. Dropping it lets the merchant's own swatch, or failing that the style
     card, fill a role the reference has no answer for. */
  const usableChosen = chosen.filter((c) => {
    if (!bgRgb) return true;
    return Math.abs(luminance(...c) - luminance(...bgRgb)) >= 0.12;
  });

  if (accent) {
    const hex = toHex(...accent);
    const rest = usableChosen.map((c) => toHex(...c)).filter((h) => h !== hex);
    return { surface, palette: [hex, ...rest].slice(0, MAX_PALETTE), lightness, saturation };
  }

  return {
    surface,
    palette: usableChosen.map((c) => toHex(...c)).slice(0, MAX_PALETTE),
    lightness,
    saturation,
  };


}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not decode that image"));
    img.src = src;
  });
}

/**
 * Prepare one uploaded file for use in the mockups.
 * Throws if the file cannot be decoded — the caller shows an inline message.
 */

/**
 * Cut a tall screenshot into pieces a vision model can read.
 *
 * Returns one entry — the whole picture — when the image is not tall enough to
 * need it. Every slice keeps the source's own horizontal resolution up to what
 * the API will use, because horizontal resolution is the entire point: it is
 * what separates "reviews grid, 3 columns" from "some kind of section".
 */
function sliceForReading(img: HTMLImageElement): string[] {
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  if (!W || !H) return [];

  /* Scale the SOURCE rectangle rather than the canvas. drawImage reads from the
     image at whatever size it decoded to; the budget is on what we draw into. */
  const overBudget = Math.sqrt(MAX_SOURCE_PIXELS / (W * H));
  const fit = Math.min(1, overBudget);

  const ratio = H / W;
  /* Slices only cover the height. A wide image is downscaled by the API on its
     width instead, and cutting it vertically would split a row of cards in
     half — worse than reading it slightly smaller. */
  const count =
    ratio <= SLICE_ABOVE_RATIO
      ? 1
      : Math.min(MAX_SLICES, Math.ceil(ratio / SLICE_RATIO));

  const sliceH = Math.ceil(H / count);
  const scale = Math.min(fit, SLICE_MAX_EDGE / Math.max(W, sliceH));
  const outW = Math.max(1, Math.round(W * scale));
  const outH = Math.max(1, Math.round(sliceH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];

  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const sy = i * sliceH;
    /* The last slice is short when the height does not divide evenly. Drawing
       the full slice height anyway would stretch it. */
    const sh = Math.min(sliceH, H - sy);
    if (sh <= 0) break;
    const dh = Math.max(1, Math.round(sh * scale));

    canvas.height = dh;
    ctx.clearRect(0, 0, outW, dh);
    ctx.drawImage(img, 0, sy, W, sh, 0, 0, outW, dh);

    /* JPEG rather than WebP. Both are accepted, and a screenshot of a page is
       mostly flat colour and text where JPEG at this quality is
       indistinguishable and smaller — and these travel in a request body. */
    out.push(canvas.toDataURL("image/jpeg", 0.85));
  }
  return out;
}

export async function prepareReferenceImage(
  file: File,
): Promise<PreparedImage> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);

    const scale = Math.min(
      1,
      REF_MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight),
    );
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is unavailable");
    ctx.drawImage(img, 0, 0, w, h);

    /* Animated GIFs only ever contribute their first frame, which is the right
       trade: a mockup is a still. */
    const dataUrl =
      canvas.toDataURL("image/webp", 0.82) ||
      canvas.toDataURL("image/jpeg", 0.82);

    // Palette from a tiny second pass, area-budgeted — see SAMPLE_PIXELS.
    const sc = document.createElement("canvas");
    const sScale = Math.min(1, Math.sqrt(SAMPLE_PIXELS / (w * h)));
    sc.width = Math.max(1, Math.round(w * sScale));
    sc.height = Math.max(1, Math.round(h * sScale));
    const sctx = sc.getContext("2d", { willReadFrequently: true });
    if (!sctx) throw new Error("Canvas is unavailable");
    sctx.drawImage(img, 0, 0, sc.width, sc.height);
    const { palette, surface, lightness, saturation } = extractPalette(
      sctx.getImageData(0, 0, sc.width, sc.height).data,
    );

    const layout = extractLayout(img);
    /* Cut from the ORIGINAL image, not from the thumbnail above — the whole
       reason these exist is that the thumbnail is too small to read. */
    const slices = sliceForReading(img);

    return { dataUrl, slices, palette, surface, layout, width: w, height: h, lightness, saturation };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/* ==========================================================================
   Layout extraction.

   A page screenshot decomposes horizontally: rows that vary a lot across their
   width are content, rows that are near-uniform are gaps between sections.
   Grouping the content runs gives the section rhythm; measuring each run's
   column variance gives its grid; measuring adjacent-pixel change along x
   separates text lines from photography.

   All arithmetic, no iteration, so the same screenshot always reads the same.
   ========================================================================== */

/** Analysis canvas width. Height follows the aspect, capped for long pages. */
const LAYOUT_W = 110;
const LAYOUT_MAX_H = 900;

export function extractLayout(
  img: HTMLImageElement,
): LayoutFingerprint | null {
  const aspect = img.naturalHeight / Math.max(1, img.naturalWidth);
  const w = LAYOUT_W;
  const h = Math.max(24, Math.min(LAYOUT_MAX_H, Math.round(w * aspect)));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);

  const { data } = ctx.getImageData(0, 0, w, h);

  // Luminance grid.
  const lum = new Float32Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    lum[p] = luminance(data[i], data[i + 1], data[i + 2]);
  }

  const at = (x: number, y: number) => lum[y * w + x];

  /* ---- per-row statistics ---------------------------------------------- */
  const rowMean = new Float32Array(h);
  const rowSd = new Float32Array(h);
  const rowEdge = new Float32Array(h); // adjacent-pixel change along x

  for (let y = 0; y < h; y++) {
    let sum = 0;
    let edge = 0;
    for (let x = 0; x < w; x++) {
      sum += at(x, y);
      if (x > 0) edge += Math.abs(at(x, y) - at(x - 1, y));
    }
    const m = sum / w;
    rowMean[y] = m;
    rowEdge[y] = edge / (w - 1);
    let v = 0;
    for (let x = 0; x < w; x++) v += (at(x, y) - m) ** 2;
    rowSd[y] = Math.sqrt(v / w);
  }

  // Smooth the variance so single-pixel noise doesn't split a section.
  const smooth = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    let sum = 0;
    let n = 0;
    for (let k = -2; k <= 2; k++) {
      const yy = y + k;
      if (yy < 0 || yy >= h) continue;
      sum += rowSd[yy];
      n++;
    }
    smooth[y] = sum / n;
  }

  /* ---- content vs gap -------------------------------------------------- */
  const sdMax = Math.max(...smooth);
  if (sdMax <= 0.001) return null; // a flat colour swatch has no layout
  const threshold = Math.max(0.02, sdMax * 0.18);

  const isContent = (y: number) => smooth[y] > threshold;

  let contentRows = 0;
  for (let y = 0; y < h; y++) if (isContent(y)) contentRows++;

  /* ---- group into bands ------------------------------------------------ */
  const runs: [number, number][] = [];
  let start = -1;
  for (let y = 0; y < h; y++) {
    if (isContent(y)) {
      if (start < 0) start = y;
    } else if (start >= 0) {
      runs.push([start, y - 1]);
      start = -1;
    }
  }
  if (start >= 0) runs.push([start, h - 1]);

  // Merge runs separated by a gap smaller than 2% of the height: that is
  // padding inside one section, not a section break.
  const minGap = Math.max(2, Math.round(h * 0.02));
  const merged: [number, number][] = [];
  for (const run of runs) {
    const prev = merged[merged.length - 1];
    if (prev && run[0] - prev[1] <= minGap) prev[1] = run[1];
    else merged.push([...run] as [number, number]);
  }

  // Drop slivers that are almost certainly a rule or a shadow.
  const bandsRaw = merged.filter(([a, b]) => b - a >= Math.max(1, h * 0.008));
  if (bandsRaw.length === 0) return null;

  /* ---- describe each band ---------------------------------------------- */
  const bands: RefBand[] = bandsRaw.map(([y0, y1]) => {
    const rows = y1 - y0 + 1;

    let lumSum = 0;
    let edgeSum = 0;
    for (let y = y0; y <= y1; y++) {
      lumSum += rowMean[y];
      edgeSum += rowEdge[y];
    }
    const bandLum = lumSum / rows;
    const bandEdge = edgeSum / rows;

    // Column variance inside this band.
    const colSd = new Float32Array(w);
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let y = y0; y <= y1; y++) sum += at(x, y);
      const m = sum / rows;
      let v = 0;
      for (let y = y0; y <= y1; y++) v += (at(x, y) - m) ** 2;
      colSd[x] = Math.sqrt(v / rows);
    }
    const colMax = Math.max(...colSd);
    const colThreshold = colMax * 0.22;

    // Count contiguous column groups separated by low-variance gutters.
    let groups = 0;
    let inGroup = false;
    let gutter = 0;
    const minGutter = Math.max(1, Math.round(w * 0.02));
    for (let x = 0; x < w; x++) {
      if (colSd[x] > colThreshold) {
        if (!inGroup) {
          groups++;
          inGroup = true;
        }
        gutter = 0;
      } else if (inGroup) {
        gutter++;
        if (gutter >= minGutter) inGroup = false;
      }
    }
    const columns = Math.max(1, Math.min(6, groups));

    /* Kind. `edge` is high where thin horizontal detail repeats — text lines.
       A tall, low-edge, multi-column band is a media grid; a short band is a
       strip (announcement bar, logo row, promo). */
    const heightShare = rows / h;
    let kind: RefBandKind;
    if (heightShare < 0.045) kind = "strip";
    else if (columns >= 2 && bandEdge < 0.1) kind = "grid";
    else if (bandEdge > 0.085) kind = "text";
    else kind = "media";

    return { height: heightShare, lightness: bandLum, columns, kind };
  });

  /* ---- alternating banding -------------------------------------------- */
  let flips = 0;
  for (let i = 1; i < bands.length; i++) {
    if (Math.abs(bands[i].lightness - bands[i - 1].lightness) > 0.14) flips++;
  }
  const alternating = bands.length >= 3 && flips >= bands.length / 2;

  let whole = 0;
  for (let y = 0; y < h; y++) whole += rowMean[y];

  return {
    bands,
    density: contentRows / h,
    lightness: whole / h,
    alternating,
  };
}
