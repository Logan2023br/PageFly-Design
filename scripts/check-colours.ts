/* ==========================================================================
   What did we actually read off this image?

       npx tsx scripts/check-colours.ts <image> [more images...]

   The colour extractor decides the background, the text colour and the accent of
   every section of the built page. Until now the only way to check its answer was
   to build a page, import it into a store and look — a ten-minute round trip
   that shows you the CONSEQUENCE of a wrong colour rather than the colour.

   This runs the real functions from `lib/imageAnalysis.ts` on a real file and
   prints what they returned, next to swatches you can compare against the image
   in another window. The browser reads pixels off a canvas; here `sharp` reads
   them, downsampled exactly as the browser downsamples them, so the numbers are
   the numbers the app would use.

   It also prints the contrast ratios that matter, because a plausible-looking
   set of three hex codes can still be an unreadable page: a button whose fill is
   1.4:1 against the background is invisible however well it matches the
   reference.
   ========================================================================== */

import sharp from "sharp";

/* Mirrors `prepareReferenceImage`: the colour pass reads a downsample capped on
   total AREA, not on its long edge. Kept in step by hand — if SAMPLE_PIXELS
   moves, this has to move with it or the check stops checking the same thing. */
const SAMPLE_PIXELS = 40_000;

function ratio(a: string, b: string): number {
  const lum = (hex: string) => {
    const h = hex.replace("#", "");
    const [r, g, bb] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bb);
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** A block of colour in the terminal, so the hex can be checked by eye. */
function swatch(hex: string): string {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return `\x1b[48;2;${r};${g};${b}m      \x1b[0m`;
}

function verdict(r: number, floor: number): string {
  return r >= floor ? `\x1b[32mok\x1b[0m` : `\x1b[31mtoo low\x1b[0m`;
}

async function one(file: string) {
  const { extractPalette } = await import("../lib/imageAnalysis");

  const meta = await sharp(file).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;

  const scale = Math.min(1, Math.sqrt(SAMPLE_PIXELS / Math.max(1, w * h)));
  const { data, info } = await sharp(file)
    .resize(Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const read = extractPalette(new Uint8ClampedArray(data));

  console.log(`\n${file}`);
  console.log(`  source ${w}×${h}  ·  sampled ${info.width}×${info.height} = ${info.width * info.height} px`);
  console.log(`  mean lightness ${read.lightness.toFixed(2)}  ·  mean saturation ${read.saturation.toFixed(2)}`);

  if (!read.surface) {
    console.log(`\n  surface: \x1b[33mnull\x1b[0m — no colour holds 15% of the image.`);
    console.log(`  The page keeps the Step 2 style card's own background. That is`);
    console.log(`  the intended answer for a single full-bleed photograph.`);
  } else {
    const { bg, ink } = read.surface;
    console.log(`\n  background  ${swatch(bg)} ${bg}`);
    console.log(`  text        ${swatch(ink)} ${ink}`);
  }

  console.log(`\n  palette, position 0 is the ACCENT:`);
  read.palette.forEach((hex, i) => {
    const role = ["accent", "alt band", "borders", "(unused)"][i] ?? "(unused)";
    console.log(`    ${i} ${swatch(hex)} ${hex}  ${role}`);
  });

  /* The numbers that decide whether the page is usable, as opposed to faithful. */
  if (read.surface && read.palette[0]) {
    const { bg, ink } = read.surface;
    console.log(`\n  contrast:`);
    const rows: [string, number, number][] = [
      ["text on background", ratio(ink, bg), 4.5],
      ["accent on background", ratio(read.palette[0], bg), 3],
    ];
    for (const [label, r, floor] of rows)
      console.log(`    ${label.padEnd(22)} ${r.toFixed(2)}:1   needs ${floor}   ${verdict(r, floor)}`);
    console.log(
      `\n  "accent on background" is the one that was wrong in the field: a\n` +
        `  dark-brown accent on a near-black page measured about 1.3:1, which is\n` +
        `  a Buy button nobody can see. pickAccent now ranks by chroma and\n` +
        `  requires a lightness gap, rather than taking whatever had most area.`,
    );
  }

  return read;
}

/** Every file read, then merged the way a build merges them. */
async function all(files: string[]): Promise<void> {
  const { mergeReferenceColour } = await import("../lib/palette");
  const reads: { palette?: string[]; surface?: { bg: string; ink: string } | null }[] = [];

  for (const f of files) {
    try {
      reads.push(await one(f));
    } catch (err) {
      console.log(`\n${f}\n  could not be read — ${(err as Error).message}`);
    }
  }

  if (reads.length === 0) return;

  /* The number that matters when a merchant hands over seven screenshots of one
     page: what the BUILD ends up with, not what each image said on its own. */
  const merged = mergeReferenceColour(reads, 4);
  console.log(`\n${"═".repeat(58)}`);
  console.log(`MERGED — what the build would use for ${reads.length} upload(s)`);
  if (!merged.surface) console.log(`  surface: \x1b[33mnull\x1b[0m`);
  else {
    console.log(`  background  ${swatch(merged.surface.bg)} ${merged.surface.bg}`);
    console.log(`  text        ${swatch(merged.surface.ink)} ${merged.surface.ink}`);
  }
  merged.palette.forEach((hex, i) => {
    const role = ["accent", "alt band", "borders", "(unused)"][i] ?? "(unused)";
    console.log(`  ${role.padEnd(11)} ${swatch(hex)} ${hex}`);
  });
  if (merged.surface && merged.palette[0]) {
    const r = ratio(merged.palette[0], merged.surface.bg);
    console.log(`\n  accent on background  ${r.toFixed(2)}:1   ${verdict(r, 3)}`);
  }
}

async function main(): Promise<void> {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.log("Give it one or more image files.");
    process.exitCode = 1;
    return;
  }
  await all(files);
  console.log();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
