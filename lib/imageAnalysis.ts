"use client";

import type {
  LayoutFingerprint,
  RefBand,
  RefBandKind,
} from "./refLayout";

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
/** Palette is sampled from a tiny canvas — accuracy past this is wasted work. */
const SAMPLE_EDGE = 48;
const MAX_PALETTE = 4;

export type PreparedImage = {
  /** bounded, serialisable copy. NOT rendered into mockups — kept so the real
      vision-capable generator has the image to send. */
  dataUrl: string;
  /** the structural read: section rhythm, columns, banding */
  layout: LayoutFingerprint | null;
  /** dominant colours, most prominent first */
  palette: string[];
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
function extractPalette(data: Uint8ClampedArray): {
  palette: string[];
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

  return {
    palette: chosen.map(([r, g, b]) => toHex(r, g, b)),
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

    // Palette from a tiny second pass.
    const sc = document.createElement("canvas");
    const sEdge = Math.min(SAMPLE_EDGE, Math.max(w, h));
    sc.width = Math.max(1, Math.round((w / Math.max(w, h)) * sEdge));
    sc.height = Math.max(1, Math.round((h / Math.max(w, h)) * sEdge));
    const sctx = sc.getContext("2d", { willReadFrequently: true });
    if (!sctx) throw new Error("Canvas is unavailable");
    sctx.drawImage(img, 0, 0, sc.width, sc.height);
    const { palette, lightness, saturation } = extractPalette(
      sctx.getImageData(0, 0, sc.width, sc.height).data,
    );

    const layout = extractLayout(img);

    return { dataUrl, palette, layout, width: w, height: h, lightness, saturation };
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
