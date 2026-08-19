/* ==========================================================================
   The reference decides the colour.

       npx tsx scripts/test-surface.ts

   A merchant used to be able to upload a page on near-black, pick the closest
   style card, and get a white page with an accent borrowed from their upload.
   Every strong signal they gave lost to a card from a grid of fifteen. This
   asserts the three pieces that had to change together:

     1. the page background and ink are read off the image at all — `palette`
        cannot carry them, because its first pass discards everything under 16%
        saturation and a white background is not a saturated colour
     2. when a reference exists it wins every colour ROLE, aligned by index, so
        a swatch the merchant chose deliberately still does the job its label
        promised rather than falling off the end of the list
     3. the tonal checks in the audit ask about CONTRAST against the page's own
        ground, not about darkness — otherwise every dark page fails the audit
        and buys a repair call with nothing to repair, at about 35,000 tokens

   The third is the one worth having a test for. It is not visible in the output
   and it is the expensive one.
   ========================================================================== */

import { createRequire } from "node:module";
import Module from "node:module";

const require_ = createRequire(import.meta.url);
const resolve_ = (Module as unknown as { _resolveFilename: (r: string, ...a: unknown[]) => string })
  ._resolveFilename;
(Module as unknown as { _resolveFilename: unknown })._resolveFilename = function (
  this: unknown,
  request: string,
  ...args: unknown[]
) {
  if (request === "server-only") return require_.resolve("./server-only.cjs");
  return resolve_.call(this, request, ...args);
};

let failures = 0;
function check(ok: boolean, label: string, detail = ""): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

/** A section painted a colour, with one child, as the audit reads it. */
function band(bg: string | null) {
  return {
    type: "section" as const,
    role: "proof",
    css: bg ? { background: bg, padding: "96px 56px" } : { padding: "96px 56px" },
    children: [{ type: "heading" as const, level: 2, text: "92% of 2,000 buyers" }],
  };
}

async function main(): Promise<void> {
  const { styleToTokens } = await import("../lib/styleTokens");
  const { firstSurface } = await import("../lib/palette");
  const { audit } = await import("../lib/design/audit");
  const { planPage, seedFor } = await import("../lib/design/plan");

  /* ---- 1 · the surface reaches the tokens ------------------------------- */

  console.log("a dark reference sets the page, not just the accent");

  const dark = { bg: "#0B0B0C", ink: "#F2F2F0" };
  const light = styleToTokens("minimal", []);
  const onDark = styleToTokens("minimal", ["#C8FF4D"], dark);

  check(light.bg === "#FFFFFF" || light.bg.toUpperCase() !== "#0B0B0C", "no reference → style card's own background", light.bg);
  check(onDark.bg.toUpperCase() === "#0B0B0C", "reference background applied", onDark.bg);
  check(onDark.ink.toUpperCase() === "#F2F2F0", "reference ink applied", onDark.ink);
  check(onDark.accent.toUpperCase() === "#C8FF4D", "accent still comes from the palette", onDark.accent);

  /* The derived values are the point of applying the surface FIRST. A band
     mixed for white would be invisible here. */
  const bandLum = (hex: string) => {
    const h = hex.replace("#", "");
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  };
  check(bandLum(onDark.surfaceAlt) < 0.35, "alt band mixed against the dark ground, not against white", onDark.surfaceAlt);
  check(bandLum(onDark.inkMuted) > 0.35, "muted ink readable on the dark ground", onDark.inkMuted);

  /* A surface whose two colours do not contrast is not a surface. Rejected
     rather than applied, or the page arrives unreadable. */
  const flat = styleToTokens("minimal", [], { bg: "#3A3A3A", ink: "#444444" });
  check(flat.bg.toUpperCase() !== "#3A3A3A", "unreadable pair refused", `${flat.bg} / ${flat.ink}`);

  /* ---- 1b · the pixel read itself --------------------------------------- */

  console.log("\nreading a background out of colour buckets");
  const { extractSurface } = await import("../lib/imageAnalysis");
  const bucket = (rgb: [number, number, number], n: number) => ({ rgb, n });

  /* A plain light page: mostly white, some black text, an accent. */
  const lightPage = extractSurface(
    [bucket([252, 252, 250], 700), bucket([22, 24, 28], 140), bucket([200, 255, 77], 60)],
    1000,
  );
  check(lightPage?.bg === "#ffffff", "near-white snapped to pure white", lightPage?.bg);
  check(lightPage?.ink === "#16181c", "the dark text bucket became the ink", lightPage?.ink);

  /* A dark page. Same shape, inverted. */
  const darkPage = extractSurface(
    [bucket([8, 8, 9], 640), bucket([242, 242, 240], 180), bucket([200, 255, 77], 90)],
    1000,
  );
  check(darkPage?.bg === "#0a0a0a", "near-black snapped", darkPage?.bg);
  check(darkPage?.ink === "#f2f2f0", "the light bucket became the ink", darkPage?.ink);

  /* THE CASE THAT MATTERS. A screenshot with a big photograph in it: the
     photograph's colour is the largest bucket, but a neutral just behind it is
     the page. Pages have neutral grounds far more often than orange ones. */
  const withHero = extractSurface(
    [bucket([196, 150, 96], 380), bucket([250, 250, 248], 330), bucket([20, 20, 24], 120)],
    1000,
  );
  check(withHero?.bg === "#ffffff", "a neutral just behind the photo is preferred", withHero?.bg);

  /* But not a veto — a genuinely coloured ground that dominates still wins. */
  const colouredGround = extractSurface(
    [bucket([12, 46, 90], 720), bucket([245, 245, 240], 150)],
    1000,
  );
  check(colouredGround?.bg === "#0c2e5a", "a dominant coloured ground is kept", colouredGround?.bg);

  /* No background at all: one full-bleed photograph, nothing holding 15%. */
  const noGround = extractSurface(
    [bucket([190, 150, 96], 120), bucket([160, 130, 88], 110), bucket([120, 96, 70], 100)],
    1000,
  );
  check(noGround === null, "no bucket big enough → null rather than a guess");

  /* A page with a ground and no readable second colour still gets an ink. */
  const noText = extractSurface([bucket([250, 250, 248], 900)], 1000);
  check(noText?.ink === "#14161a", "ink falls back to a dark neutral on a light ground", noText?.ink);

  /* ---- 2 · first upload wins, not an average --------------------------- */

  console.log("\nseveral uploads");
  const merged = firstSurface([
    { surface: null },
    { surface: dark },
    { surface: { bg: "#FFFFFF", ink: "#111111" } },
  ]);
  check(merged?.bg === "#0B0B0C", "first upload that produced one wins outright", merged?.bg);
  check(firstSurface([{ surface: null }, {}]) === null, "no surface anywhere → null");

  /* ---- 3 · the audit on a dark page ------------------------------------ */

  console.log("\nthe audit on a page whose own background is dark");

  const order = planPage(
    { whatYouSell: "Skincare", verticalSlug: "skincare", visualStyle: "minimal" } as never,
    "home",
    seedFor("aurelia-skin.myshopify.com", "home", "minimal"),
  );

  /* Eight sections on a near-black page: most inherit the page ground and set
     no background, two invert to light. That is a correct dark page. */
  const goodDark = {
    sections: [
      band(null),
      band("#F2F2F0"),
      band(null),
      band(null),
      band("#F2F2F0"),
      band(null),
      band(null),
      band(null),
    ],
  };

  const asWhite = audit(goodDark as never, order);
  const asDark = audit(goodDark as never, order, "#0B0B0C");

  const tonal = (p: string[]) =>
    p.filter((s) => /steps away from the page background|inverted bands are adjacent/.test(s));

  console.log(`  judged against white:  ${tonal(asWhite).length} tonal complaint(s)`);
  console.log(`  judged against #0B0B0C: ${tonal(asDark).length} tonal complaint(s)`);
  check(tonal(asDark).length === 0, "a correct dark page raises no tonal complaint");

  /* The same tree read against white is what the old code did on every dark
     page. Shown rather than asserted loosely: this is the repair call the
     change stops paying for. */
  check(tonal(asWhite).length > 0, "and would have complained if judged against white — the bug this fixes");

  /* A page genuinely in one tone must still be caught, on a dark ground too. */
  const flatDark = { sections: [band(null), band(null), band(null), band(null)] };
  check(
    tonal(audit(flatDark as never, order, "#0B0B0C")).length > 0,
    "a dark page with no contrasting band is still caught",
  );

  /* And a barely-tinted band must still not count as one. */
  const tinted = { sections: [band(null), band("#F4F1EC"), band(null)] };
  check(
    tonal(audit(tinted as never, order, "#FFFFFF")).length > 0,
    "a #F4F1EC band on white is not tonal relief",
  );

  /* Adjacency, on a dark page. */
  const adjacent = {
    sections: [band(null), band("#F2F2F0"), band("#F2F2F0"), band(null), band(null)],
  };
  check(
    audit(adjacent as never, order, "#0B0B0C").some((p) => /adjacent/.test(p)),
    "two inverted bands in a row still caught on a dark page",
  );

  console.log();
  console.log(failures === 0 ? "PASS" : `FAIL — ${failures} problem${failures === 1 ? "" : "s"}`);
  if (failures) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
