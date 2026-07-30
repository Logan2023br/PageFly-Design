import type { Vertical } from "./generate/content";
import { makeRng } from "./generate/seed";
import { mix, shiftHue, withAlpha, type MockupTokens } from "./styleTokens";

/* ==========================================================================
   Mock imagery.

   The first version of this composed a few CSS gradients, and the result read
   as "a coloured blob" rather than "a photograph of a product" — which is the
   thing the brief explicitly rules out. This replaces it with a seeded scene:
   a backdrop, a product silhouette chosen from the detected vertical, a contact
   shadow and a specular highlight.

   Everything is drawn, nothing is fetched. That keeps the mockups offline, keeps
   PNG export lossless and CORS-free, and keeps the output deterministic.
   ========================================================================== */

type Shape = {
  /** filled outline, in a 0-100 box */
  body: string;
  /** optional stroked detail (handle, band, strap) */
  mark?: string;
  markWidth?: number;
  /** optional second filled detail (lid, cap, sole) */
  detail?: string;
};

/* Silhouettes are deliberately simple: they have to be legible at 40px wide in
   a results card, not accurate at full size. */
const SHAPES: Record<Vertical, Shape[]> = {
  home: [
    {
      // mug
      body: "M30 34 h30 v26 a13 13 0 0 1 -13 13 h-4 a13 13 0 0 1 -13 -13 z",
      mark: "M62 41 a11 11 0 0 1 0 19",
      markWidth: 5,
    },
    {
      // vase
      body: "M42 26 h16 v6 c0 5 8 9 8 20 v10 c0 10 -7 11 -16 11 s-16 -1 -16 -11 v-10 c0 -11 8 -15 8 -20 z",
    },
    {
      // bowl / plate
      body: "M24 48 h52 c0 14 -12 25 -26 25 s-26 -11 -26 -25 z",
      detail: "M24 44 h52 v4 h-52 z",
    },
  ],
  food: [
    {
      // coffee bag
      body: "M32 34 h36 l-3 40 a5 5 0 0 1 -5 5 h-20 a5 5 0 0 1 -5 -5 z",
      detail: "M32 34 l5 -9 h26 l5 9 z",
    },
    {
      // bottle
      body: "M45 22 h10 v9 c0 4 7 7 7 16 v29 a6 6 0 0 1 -6 6 h-12 a6 6 0 0 1 -6 -6 v-29 c0 -9 7 -12 7 -16 z",
      detail: "M44 20 h12 v5 h-12 z",
    },
    {
      // jar
      body: "M36 36 h28 v34 a6 6 0 0 1 -6 6 h-16 a6 6 0 0 1 -6 -6 z",
      detail: "M34 29 h32 v7 h-32 z",
    },
  ],
  beauty: [
    {
      // dropper bottle
      body: "M40 34 h20 v36 a6 6 0 0 1 -6 6 h-8 a6 6 0 0 1 -6 -6 z",
      detail: "M44 22 h12 v12 h-12 z",
    },
    {
      // tube
      body: "M42 32 h16 v40 a4 4 0 0 1 -4 4 h-8 a4 4 0 0 1 -4 -4 z",
      detail: "M43 26 h14 v6 h-14 z",
    },
    {
      // jar / pot
      body: "M34 44 h32 v22 a8 8 0 0 1 -8 8 h-16 a8 8 0 0 1 -8 -8 z",
      detail: "M32 36 h36 v8 h-36 z",
    },
  ],
  apparel: [
    {
      // t-shirt
      body: "M38 26 l-14 7 -4 15 9 3 3 -7 v32 h36 v-32 l3 7 9 -3 -4 -15 -14 -7 c-3 6 -21 6 -24 0 z",
    },
    {
      // folded knit
      body: "M26 38 h48 v34 h-48 z",
      mark: "M26 52 h48",
      markWidth: 2,
    },
    {
      // trousers
      body: "M36 26 h28 v10 l-4 40 h-8 l-2 -30 -2 30 h-8 l-4 -40 z",
    },
  ],
  footwear: [
    {
      // sneaker profile
      body: "M22 64 c0 -7 5 -9 11 -11 6 -2 11 -9 16 -13 4 -3 9 -1 10 3 1 5 5 7 10 8 8 2 15 5 15 12 v3 h-62 z",
      detail: "M22 67 h62 v6 h-62 z",
    },
    {
      // boot
      body: "M34 24 h18 v34 c6 2 16 5 16 12 v3 h-40 v-6 z",
    },
  ],
  jewelry: [
    {
      // ring
      body: "M50 74 a20 20 0 1 1 0.1 0 z M50 66 a12 12 0 1 0 -0.1 0 z",
      detail: "M45 32 l5 -8 5 8 -5 6 z",
    },
    {
      // pendant
      body: "M50 46 l9 14 -9 14 -9 -14 z",
      mark: "M28 34 a26 22 0 0 0 44 0",
      markWidth: 3,
    },
  ],
  tech: [
    {
      // device
      body: "M28 26 h44 a6 6 0 0 1 6 6 v36 a6 6 0 0 1 -6 6 h-44 a6 6 0 0 1 -6 -6 v-36 a6 6 0 0 1 6 -6 z",
      detail: "M30 34 h40 v26 h-40 z",
    },
    {
      // headphones
      body: "M28 48 h10 v22 h-10 z M62 48 h10 v22 h-10 z",
      mark: "M28 50 a22 22 0 0 1 44 0",
      markWidth: 6,
    },
  ],
  pets: [
    {
      body: "M26 50 h48 c0 13 -11 24 -24 24 s-24 -11 -24 -24 z",
      detail: "M26 45 h48 v5 h-48 z",
    },
    {
      // bone
      body: "M34 44 h32 v12 h-32 z",
      mark: "M30 44 a7 7 0 1 0 0 12 M70 44 a7 7 0 1 1 0 12",
      markWidth: 6,
    },
  ],
  fitness: [
    {
      // dumbbell
      body: "M26 42 h8 v18 h-8 z M66 42 h8 v18 h-8 z M34 47 h32 v8 h-32 z",
    },
    {
      // rolled mat
      body: "M34 30 h32 v42 h-32 z",
      mark: "M50 30 a8 21 0 0 0 0 42",
      markWidth: 3,
    },
  ],
  kids: [
    {
      body: "M32 38 h36 v36 h-36 z",
      detail: "M40 46 h20 v20 h-20 z",
    },
    {
      // stacking rings
      body: "M28 62 h44 v10 h-44 z",
      mark: "M50 30 v32",
      markWidth: 4,
    },
  ],
  digital: [
    {
      // window
      body: "M22 28 h56 a4 4 0 0 1 4 4 v38 a4 4 0 0 1 -4 4 h-56 a4 4 0 0 1 -4 -4 v-38 a4 4 0 0 1 4 -4 z",
      detail: "M18 28 h64 v8 h-64 z",
    },
    {
      // stacked cards
      body: "M28 36 h44 v34 h-44 z",
      mark: "M34 30 h44",
      markWidth: 3,
    },
  ],
  general: [
    {
      // box
      body: "M28 38 l22 -11 22 11 v27 l-22 11 -22 -11 z",
      mark: "M28 38 l22 11 22 -11",
      markWidth: 2,
    },
    {
      body: "M32 32 h36 v42 h-36 z",
      detail: "M32 32 h36 v10 h-36 z",
    },
  ],
};

export type MockScene = {
  /** CSS background for the backdrop layer */
  backdrop: string;
  /** SVG paths to draw, in order */
  shape: Shape | null;
  /** fill gradient stops for the object */
  objectTop: string;
  objectBottom: string;
  markColor: string;
  /** transform applied to the 100x100 shape box */
  transform: string;
  /** contact shadow under the object */
  shadow: string;
  /** environment scenes get soft bands instead of a product */
  bands: { y: number; h: number; color: string }[];
  vignette: string;
  highlight: string;
};

/**
 * Builds one deterministic scene.
 *
 * `kind` nudges the composition: product shots centre an object, scene shots
 * drop the object for a soft environment, so a page reads as a real photo set
 * rather than twelve versions of the same picture.
 */
export function buildScene(
  seed: string,
  tokens: MockupTokens,
  vertical: Vertical,
  kind: "auto" | "product" | "scene" = "auto",
): MockScene {
  const rng = makeRng(`scene::${seed}`);
  const dark = isDark(tokens.bg);

  const mode =
    kind === "auto" ? (rng.bool(0.74) ? "product" : "scene") : kind;

  /* ---- backdrop -------------------------------------------------------- */
  const hue = rng.int(-26, 26);
  const base = shiftHue(
    mix(tokens.surfaceAlt === "transparent" ? tokens.bg : tokens.surfaceAlt,
      tokens.accent,
      0.1 + rng.next() * 0.2),
    hue,
  );
  const far = dark
    ? mix(base, "#000000", 0.34 + rng.next() * 0.2)
    : mix(base, "#ffffff", 0.4 + rng.next() * 0.25);
  const near = dark
    ? mix(base, "#ffffff", 0.06 + rng.next() * 0.08)
    : mix(base, "#000000", 0.04 + rng.next() * 0.07);

  const lightX = rng.int(16, 78);
  const lightY = rng.int(4, 34);

  const backdrop = [
    `radial-gradient(80% 62% at ${lightX}% ${lightY}%, ${withAlpha(
      dark ? "#ffffff" : "#ffffff",
      dark ? 0.11 : 0.62,
    )} 0%, transparent 66%)`,
    `linear-gradient(${rng.int(160, 205)}deg, ${near} 0%, ${far} 100%)`,
  ].join(", ");

  /* ---- object ---------------------------------------------------------- */
  const pool = SHAPES[vertical] ?? SHAPES.general;
  const shape = mode === "product" ? rng.pick(pool) : null;

  const objectBase = shiftHue(
    mix(tokens.accent, dark ? "#ffffff" : "#1a1616", 0.18 + rng.next() * 0.3),
    rng.int(-40, 40),
  );
  const objectTop = mix(objectBase, "#ffffff", dark ? 0.24 : 0.3);
  const objectBottom = mix(objectBase, "#000000", 0.22 + rng.next() * 0.16);

  const scale = 0.78 + rng.next() * 0.34;
  const rotate = rng.int(-7, 7);
  const dx = rng.int(-7, 7);
  const dy = rng.int(-4, 6);
  const transform = `translate(${dx} ${dy}) rotate(${rotate} 50 54) scale(${scale.toFixed(3)}) translate(${((1 - scale) * 50) / scale} ${((1 - scale) * 54) / scale})`;

  /* ---- scene bands (environment mode) ---------------------------------- */
  const bands =
    mode === "scene"
      ? Array.from({ length: rng.int(2, 3) }, (_, i) => {
          const y = 34 + i * rng.int(14, 22);
          return {
            y,
            h: rng.int(8, 22),
            color: withAlpha(
              mix(objectBase, dark ? "#000000" : "#ffffff", 0.2 + i * 0.16),
              0.5 - i * 0.12,
            ),
          };
        })
      : [];

  return {
    backdrop,
    shape,
    objectTop,
    objectBottom,
    markColor: mix(objectBase, dark ? "#ffffff" : "#000000", 0.18),
    transform,
    shadow: withAlpha(dark ? "#000000" : "#2a2320", dark ? 0.55 : 0.22),
    bands,
    vignette: `radial-gradient(120% 100% at 50% 40%, transparent 52%, ${withAlpha(
      "#000000",
      dark ? 0.42 : 0.14,
    )} 100%)`,
    highlight: withAlpha("#ffffff", dark ? 0.16 : 0.42),
  };
}

function isDark(hex: string): boolean {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return true; // rgba surfaces in the glass style sit on a dark canvas
  const v = parseInt(m[1], 16);
  const r = (v >> 16) & 255;
  const g = (v >> 8) & 255;
  const b = v & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.42;
}
