/* ==========================================================================
   A PNG DECODER AND SSIM, IN THE REPOSITORY, WITH NO DEPENDENCY.

   The comparison needs pixels, and every library that hands them over — sharp,
   pngjs, canvas — is a native build on a VPS that already runs `npm run build`
   in place over the directory it serves. A failed native compile there is the
   site down, and this project has had that outage once already this month.

   So: the two pieces we actually need. `fflate` is already a dependency (the
   .pagefly file IS a zip), and its inflate is the only hard part of a PNG.

   ONLY WHAT CHROME EMITS. 8-bit, colour type 6 (RGBA) or 2 (RGB), no
   interlacing, no palette. A file outside that throws by name rather than
   decoding to something plausible and wrong.
   ========================================================================== */

import { unzlibSync } from "fflate";

export type Bitmap = { width: number; height: number; /** grayscale, 0-255 */ gray: Uint8Array };

const SIG = [137, 80, 78, 71, 13, 10, 26, 10];

/** One PNG, as luminance. Colour is not what this comparison is about. */
export function decodePng(bytes: Uint8Array): Bitmap {
  for (let i = 0; i < SIG.length; i++)
    if (bytes[i] !== SIG[i]) throw new Error("not a PNG");

  let width = 0;
  let height = 0;
  let depth = 0;
  let colour = 0;
  const idat: Uint8Array[] = [];

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 8;
  while (at < bytes.length) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(bytes[at + 4], bytes[at + 5], bytes[at + 6], bytes[at + 7]);
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") {
      width = view.getUint32(at + 8);
      height = view.getUint32(at + 12);
      depth = bytes[at + 16];
      colour = bytes[at + 17];
      if (depth !== 8) throw new Error(`PNG bit depth ${depth} unsupported`);
      if (colour !== 6 && colour !== 2) throw new Error(`PNG colour type ${colour} unsupported`);
      if (bytes[at + 20] !== 0) throw new Error("interlaced PNG unsupported");
    } else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
    at += 12 + length;
  }

  const channels = colour === 6 ? 4 : 3;
  const joined = new Uint8Array(idat.reduce((n, c) => n + c.length, 0));
  let off = 0;
  for (const c of idat) {
    joined.set(c, off);
    off += c.length;
  }
  const raw = unzlibSync(joined);

  /* Unfilter, in place, one scanline at a time. The five filters are the whole
     of PNG's compression cleverness and each refers to the pixel to the left,
     the one above, or both. */
  const stride = width * channels;
  const out = new Uint8Array(width * height * channels);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const row = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? row[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let value = line[x];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      row[x] = value & 0xff;
    }
    prev = row;
  }

  /* Rec. 601 luma, and alpha composited onto white — a screenshot's
     transparent corner is white on the merchant's screen, not black. */
  const gray = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < gray.length; i++, p += channels) {
    const alpha = channels === 4 ? out[p + 3] / 255 : 1;
    const r = out[p] * alpha + 255 * (1 - alpha);
    const g = out[p + 1] * alpha + 255 * (1 - alpha);
    const b = out[p + 2] * alpha + 255 * (1 - alpha);
    gray[i] = (0.299 * r + 0.587 * g + 0.114 * b) | 0;
  }
  return { width, height, gray };
}

/**
 * Mean SSIM over 8×8 windows, the standard constants.
 *
 * TWO IMAGES OF DIFFERENT HEIGHT ARE COMPARED OVER THE SHORTER, and the
 * difference is charged: a band that came out half as tall is not 1.0 similar
 * over its top half. Without that, losing the bottom of every section would
 * score perfectly.
 */
export function ssim(a: Bitmap, b: Bitmap): number {
  const width = Math.min(a.width, b.width);
  const height = Math.min(a.height, b.height);
  if (width < 8 || height < 8) return a.width === b.width && a.height === b.height ? 1 : 0;

  const C1 = (0.01 * 255) ** 2;
  const C2 = (0.03 * 255) ** 2;
  let total = 0;
  let windows = 0;

  for (let y = 0; y + 8 <= height; y += 8) {
    for (let x = 0; x + 8 <= width; x += 8) {
      let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
      for (let j = 0; j < 8; j++) {
        for (let i = 0; i < 8; i++) {
          const va = a.gray[(y + j) * a.width + x + i];
          const vb = b.gray[(y + j) * b.width + x + i];
          sa += va; sb += vb; saa += va * va; sbb += vb * vb; sab += va * vb;
        }
      }
      const n = 64;
      const ma = sa / n;
      const mb = sb / n;
      const va = saa / n - ma * ma;
      const vb = sbb / n - mb * mb;
      const cab = sab / n - ma * mb;
      total +=
        ((2 * ma * mb + C1) * (2 * cab + C2)) /
        ((ma * ma + mb * mb + C1) * (va + vb + C2));
      windows++;
    }
  }

  const mean = windows ? total / windows : 1;
  /* The shape penalty: the area one image has and the other does not counts as
     zero similarity, weighted by how much of the union it is. */
  const union = Math.max(a.width, b.width) * Math.max(a.height, b.height);
  const shared = width * height;
  return mean * (shared / union);
}
