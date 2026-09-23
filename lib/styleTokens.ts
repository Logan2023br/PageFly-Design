/* ==========================================================================
   styleToTokens — turns "Luxury / premium" + the merchant's hex codes into a
   concrete design system for the mockups.

   This is what makes a Luxury home page and a Neubrutalist home page read as
   different products rather than the same layout in different colors: each
   style moves palette, radius, border weight, type family, type scale,
   density, shadow AND image treatment together.

   Mockup type deliberately uses generic families (ui-serif, ui-monospace,
   ui-rounded...) instead of 15 loaded webfonts — the mockup only has to read
   as the right *kind* of page, and loading 15 families would cost more than
   it buys.
   ========================================================================== */

export type Density = "airy" | "normal" | "tight";
export type ImageTreatment =
  | "clean"
  | "warm"
  | "mono"
  | "duotone"
  | "grain"
  | "vivid";
export type TypeCase = "none" | "upper";

export type MockupTokens = {
  /** page background */
  bg: string;
  /** cards, panels, alternating bands */
  surface: string;
  surfaceAlt: string;
  /** body + heading ink */
  ink: string;
  inkMuted: string;
  /** brand accent and readable ink on top of it */
  accent: string;
  accentInk: string;
  accentSoft: string;
  border: string;
  borderWidth: number;

  radius: number;
  radiusLg: number;
  radiusPill: number;

  fontDisplay: string;
  fontBody: string;
  displayWeight: number;
  bodyWeight: number;
  tracking: string;
  displayCase: TypeCase;
  /** multiplies every type size in the blocks */
  scale: number;

  density: Density;
  gap: number;
  shadow: string;
  imageTreatment: ImageTreatment;
  /** decorative flag a few blocks read for style-specific flourishes */
  hardEdge: boolean;

  /* ========================================================================
     COLOURS THE MERCHANT NAMED THAT NO ROLE HAD ROOM FOR.

     There are three roles and a brief can name six colours. The extras used to
     be dropped at the slice, which by itself was only a waste — the damage came
     one step later, where both design prompts say "use these and nothing else".
     A merchant who wrote #8B5CF6 violet in their brief was reading a page whose
     designer had been explicitly forbidden to use it.

     So they are carried instead. Not as roles — nothing here says where they
     go, because that is the designing model's decision and the whole point of
     the free-design stage is that it makes those. They travel as permission:
     these are the merchant's own colours, they are allowed.
     ======================================================================== */
  named?: string[];
};

export type VisualStyleId =
  | "minimal"
  | "bold"
  | "luxury"
  | "playful"
  | "dark"
  | "editorial"
  | "retro"
  | "organic"
  | "tech"
  | "handmade"
  | "scandi"
  | "streetwear"
  | "neubrutalist"
  | "glass"
  | "y2k";

export const VISUAL_STYLE_IDS = [
  "minimal",
  "bold",
  "luxury",
  "playful",
  "dark",
  "editorial",
  "retro",
  "organic",
  "tech",
  "handmade",
  "scandi",
  "streetwear",
  "neubrutalist",
  "glass",
  "y2k",
] as const satisfies readonly VisualStyleId[];

export type VisualStyleDef = {
  id: VisualStyleId;
  label: string;
  /** one line shown under the card label */
  blurb: string;
  tokens: MockupTokens;
};

/* ---- font stacks -------------------------------------------------------- */

/* ==========================================================================
   Fonts.

   Every family named first here is a real web font, loaded by name from Google
   Fonts in app/layout.tsx and again by the .pagefly export's page CSS. That is
   the only way a mockup and the page it exports look the same on two machines.

   The previous stacks led with system families, and two things went wrong. The
   mockups did not use the fonts the app loads at all: next/font gives its faces
   hashed names, so a literal "Inter" here never matched the loaded face and every
   mockup silently fell back to system-ui. And the ones that were not generic were
   not portable — "SF Pro Rounded" exists only on Apple devices, "Arial Narrow"
   resolves to something different on nearly every platform.

   The system families are kept behind each web font as a fallback for the moment
   before it loads, chosen to be close in width so the reflow is small.
   ========================================================================== */
const SANS = '"Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif';
const GROTESK = 'Inter, ui-sans-serif, system-ui, sans-serif';
/* Gelasio is metric-compatible with Georgia, so the fallback swaps invisibly. */
const SERIF = 'Gelasio, Georgia, "Times New Roman", serif';
const MONO = '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace';
const ROUNDED = 'Nunito, "SF Pro Rounded", ui-rounded, system-ui, sans-serif';
const CONDENSED =
  '"Archivo Narrow", "Arial Narrow", "Helvetica Neue", sans-serif';

/** The Google Fonts stylesheet that makes the families above real. Shared by the
    app and by every exported page, so both load exactly the same faces. */
export const WEBFONT_CSS_URL =
  "https://fonts.googleapis.com/css2?family=Archivo+Narrow:wght@400;500;600;700" +
  "&family=Gelasio:wght@400;500;600;700" +
  "&family=Inter:wght@400;500;600;700;800" +
  "&family=JetBrains+Mono:wght@400;500;700" +
  "&family=Nunito:wght@400;500;600;700;800" +
  "&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap";

/* ---- shadows ------------------------------------------------------------ */

const NO_SHADOW = "none";
const SOFT = "0 12px 32px -16px rgba(16, 12, 32, 0.22)";
const LIFTED = "0 24px 60px -28px rgba(16, 12, 32, 0.38)";
const HARD = "6px 6px 0 0 currentColor";
const GLOWY = "0 18px 50px -20px rgba(120, 80, 255, 0.55)";

/* ==========================================================================
   The 15 styles.
   ========================================================================== */

export const VISUAL_STYLES: VisualStyleDef[] = [
  {
    id: "minimal",
    label: "Minimal & clean",
    blurb: "White space, one accent, nothing shouting.",
    tokens: {
      bg: "#FFFFFF",
      surface: "#FFFFFF",
      surfaceAlt: "#F7F7F8",
      ink: "#111114",
      inkMuted: "rgba(17,17,20,0.56)",
      accent: "#111114",
      accentInk: "#FFFFFF",
      accentSoft: "rgba(17,17,20,0.06)",
      border: "rgba(17,17,20,0.10)",
      borderWidth: 1,
      radius: 6,
      radiusLg: 10,
      radiusPill: 999,
      fontDisplay: GROTESK,
      fontBody: GROTESK,
      displayWeight: 600,
      bodyWeight: 400,
      tracking: "-0.02em",
      displayCase: "none",
      scale: 1,
      density: "airy",
      shadow: NO_SHADOW,
      imageTreatment: "clean",
      hardEdge: false,
      gap: 28,
    },
  },
  {
    id: "bold",
    label: "Bold & vibrant",
    blurb: "Saturated color, big type, high contrast.",
    tokens: {
      bg: "#FFFDF7",
      surface: "#FFFFFF",
      surfaceAlt: "#FFF0D9",
      ink: "#14110B",
      inkMuted: "rgba(20,17,11,0.62)",
      accent: "#FF4D2E",
      accentInk: "#FFFFFF",
      accentSoft: "rgba(255,77,46,0.14)",
      border: "rgba(20,17,11,0.14)",
      borderWidth: 2,
      radius: 14,
      radiusLg: 22,
      radiusPill: 999,
      fontDisplay: SANS,
      fontBody: GROTESK,
      displayWeight: 800,
      bodyWeight: 500,
      tracking: "-0.035em",
      displayCase: "none",
      scale: 1.12,
      density: "normal",
      shadow: SOFT,
      imageTreatment: "vivid",
      hardEdge: false,
      gap: 22,
    },
  },
  {
    id: "luxury",
    label: "Luxury / premium",
    blurb: "Serif caps, deep neutrals, restrained gold.",
    tokens: {
      bg: "#0E0D0B",
      surface: "#16150F",
      surfaceAlt: "#1D1B14",
      ink: "#F4F1E8",
      inkMuted: "rgba(244,241,232,0.58)",
      accent: "#C6A667",
      accentInk: "#14120C",
      accentSoft: "rgba(198,166,103,0.14)",
      border: "rgba(244,241,232,0.16)",
      borderWidth: 1,
      radius: 0,
      radiusLg: 2,
      radiusPill: 0,
      fontDisplay: SERIF,
      fontBody: GROTESK,
      displayWeight: 500,
      bodyWeight: 400,
      tracking: "0.02em",
      displayCase: "upper",
      scale: 0.98,
      density: "airy",
      shadow: NO_SHADOW,
      imageTreatment: "warm",
      hardEdge: true,
      gap: 34,
    },
  },
  {
    id: "playful",
    label: "Playful / friendly",
    blurb: "Rounded everything, candy palette, soft shadows.",
    tokens: {
      bg: "#FFF8F2",
      surface: "#FFFFFF",
      surfaceAlt: "#FFEDE2",
      ink: "#2A1B12",
      inkMuted: "rgba(42,27,18,0.60)",
      accent: "#FF7A45",
      accentInk: "#FFFFFF",
      accentSoft: "rgba(255,122,69,0.16)",
      border: "rgba(42,27,18,0.10)",
      borderWidth: 1,
      radius: 22,
      radiusLg: 34,
      radiusPill: 999,
      fontDisplay: ROUNDED,
      fontBody: ROUNDED,
      displayWeight: 700,
      bodyWeight: 500,
      tracking: "-0.015em",
      displayCase: "none",
      scale: 1.05,
      density: "normal",
      shadow: SOFT,
      imageTreatment: "warm",
      hardEdge: false,
      gap: 24,
    },
  },
  {
    id: "dark",
    label: "Dark & moody",
    blurb: "Near-black, cold light, heavy contrast.",
    tokens: {
      bg: "#0B0C0F",
      surface: "#12141A",
      surfaceAlt: "#171A21",
      ink: "#EEF1F6",
      inkMuted: "rgba(238,241,246,0.54)",
      accent: "#5B8CFF",
      accentInk: "#06080D",
      accentSoft: "rgba(91,140,255,0.14)",
      border: "rgba(238,241,246,0.12)",
      borderWidth: 1,
      radius: 10,
      radiusLg: 16,
      radiusPill: 999,
      fontDisplay: GROTESK,
      fontBody: GROTESK,
      displayWeight: 600,
      bodyWeight: 400,
      tracking: "-0.025em",
      displayCase: "none",
      scale: 1,
      density: "normal",
      shadow: LIFTED,
      imageTreatment: "mono",
      hardEdge: false,
      gap: 24,
    },
  },
  {
    id: "editorial",
    label: "Editorial / magazine",
    blurb: "Serif headlines, rules, columns, big captions.",
    tokens: {
      bg: "#FBFAF7",
      surface: "#FFFFFF",
      surfaceAlt: "#F1EFE9",
      ink: "#12100C",
      inkMuted: "rgba(18,16,12,0.58)",
      accent: "#8A1C1C",
      accentInk: "#FFFFFF",
      accentSoft: "rgba(138,28,28,0.10)",
      border: "rgba(18,16,12,0.22)",
      borderWidth: 1,
      radius: 0,
      radiusLg: 0,
      radiusPill: 0,
      fontDisplay: SERIF,
      fontBody: SERIF,
      displayWeight: 700,
      bodyWeight: 400,
      tracking: "-0.02em",
      displayCase: "none",
      scale: 1.08,
      density: "tight",
      shadow: NO_SHADOW,
      imageTreatment: "clean",
      hardEdge: true,
      gap: 18,
    },
  },
  {
    id: "retro",
    label: "Retro / vintage",
    blurb: "Faded print colors, thick rules, condensed caps.",
    tokens: {
      bg: "#F3E7CF",
      surface: "#FAF2E2",
      surfaceAlt: "#E8D6B4",
      ink: "#2B2113",
      inkMuted: "rgba(43,33,19,0.62)",
      accent: "#C2452D",
      accentInk: "#FAF2E2",
      accentSoft: "rgba(194,69,45,0.14)",
      border: "rgba(43,33,19,0.30)",
      borderWidth: 2,
      radius: 4,
      radiusLg: 6,
      radiusPill: 999,
      fontDisplay: CONDENSED,
      fontBody: SERIF,
      displayWeight: 700,
      bodyWeight: 400,
      tracking: "0.01em",
      displayCase: "upper",
      scale: 1.06,
      density: "tight",
      shadow: NO_SHADOW,
      imageTreatment: "grain",
      hardEdge: true,
      gap: 18,
    },
  },
  {
    id: "organic",
    label: "Organic / natural",
    blurb: "Earth tones, soft arches, generous air.",
    tokens: {
      bg: "#F6F3EC",
      surface: "#FFFFFF",
      surfaceAlt: "#E9E3D6",
      ink: "#28301F",
      inkMuted: "rgba(40,48,31,0.58)",
      accent: "#5C7A4A",
      accentInk: "#FFFFFF",
      accentSoft: "rgba(92,122,74,0.14)",
      border: "rgba(40,48,31,0.14)",
      borderWidth: 1,
      radius: 18,
      radiusLg: 40,
      radiusPill: 999,
      fontDisplay: SERIF,
      fontBody: GROTESK,
      displayWeight: 500,
      bodyWeight: 400,
      tracking: "-0.01em",
      displayCase: "none",
      scale: 1,
      density: "airy",
      shadow: NO_SHADOW,
      imageTreatment: "warm",
      hardEdge: false,
      gap: 30,
    },
  },
  {
    id: "tech",
    label: "Tech / futuristic",
    blurb: "Mono labels, grid lines, neon on charcoal.",
    tokens: {
      bg: "#07090C",
      surface: "#0D1117",
      surfaceAlt: "#121821",
      ink: "#E6F1FF",
      inkMuted: "rgba(230,241,255,0.52)",
      accent: "#3DF5C8",
      accentInk: "#04120E",
      accentSoft: "rgba(61,245,200,0.12)",
      border: "rgba(230,241,255,0.14)",
      borderWidth: 1,
      radius: 4,
      radiusLg: 8,
      radiusPill: 4,
      fontDisplay: GROTESK,
      fontBody: MONO,
      displayWeight: 600,
      bodyWeight: 400,
      tracking: "-0.03em",
      displayCase: "none",
      scale: 0.96,
      density: "tight",
      shadow: GLOWY,
      imageTreatment: "duotone",
      hardEdge: true,
      gap: 16,
    },
  },
  {
    id: "handmade",
    label: "Handmade / artisan",
    blurb: "Paper, clay tones, uneven edges, serif labels.",
    tokens: {
      bg: "#FBF6EF",
      surface: "#FFFFFF",
      surfaceAlt: "#EFE3D4",
      ink: "#3A2B21",
      inkMuted: "rgba(58,43,33,0.60)",
      accent: "#A9614B",
      accentInk: "#FFFFFF",
      accentSoft: "rgba(169,97,75,0.14)",
      border: "rgba(58,43,33,0.18)",
      borderWidth: 1,
      radius: 14,
      radiusLg: 26,
      radiusPill: 999,
      fontDisplay: SERIF,
      fontBody: GROTESK,
      displayWeight: 600,
      bodyWeight: 400,
      tracking: "-0.005em",
      displayCase: "none",
      scale: 1,
      density: "airy",
      shadow: SOFT,
      imageTreatment: "grain",
      hardEdge: false,
      gap: 26,
    },
  },
  {
    id: "scandi",
    label: "Scandinavian",
    blurb: "Pale wood, cool grey, quiet type, lots of light.",
    tokens: {
      bg: "#FAFAF8",
      surface: "#FFFFFF",
      surfaceAlt: "#EDEDE9",
      ink: "#1D1F1E",
      inkMuted: "rgba(29,31,30,0.52)",
      accent: "#6E8B84",
      accentInk: "#FFFFFF",
      accentSoft: "rgba(110,139,132,0.12)",
      border: "rgba(29,31,30,0.10)",
      borderWidth: 1,
      radius: 3,
      radiusLg: 6,
      radiusPill: 999,
      fontDisplay: GROTESK,
      fontBody: GROTESK,
      displayWeight: 500,
      bodyWeight: 400,
      tracking: "-0.012em",
      displayCase: "none",
      scale: 0.97,
      density: "airy",
      shadow: NO_SHADOW,
      imageTreatment: "clean",
      hardEdge: false,
      gap: 32,
    },
  },
  {
    id: "streetwear",
    label: "Streetwear",
    blurb: "Black, tape labels, condensed caps, hard crops.",
    tokens: {
      bg: "#0A0A0A",
      surface: "#141414",
      surfaceAlt: "#1C1C1C",
      ink: "#F5F5F5",
      inkMuted: "rgba(245,245,245,0.54)",
      accent: "#D9FF3D",
      accentInk: "#0A0A0A",
      accentSoft: "rgba(217,255,61,0.12)",
      border: "rgba(245,245,245,0.18)",
      borderWidth: 2,
      radius: 0,
      radiusLg: 0,
      radiusPill: 0,
      fontDisplay: CONDENSED,
      fontBody: GROTESK,
      displayWeight: 700,
      bodyWeight: 500,
      tracking: "0.005em",
      displayCase: "upper",
      scale: 1.14,
      density: "tight",
      shadow: NO_SHADOW,
      imageTreatment: "mono",
      hardEdge: true,
      gap: 14,
    },
  },
  {
    id: "neubrutalist",
    label: "Neubrutalist",
    blurb: "Thick black outlines, offset blocks, primary color.",
    tokens: {
      bg: "#FDF6E3",
      surface: "#FFFFFF",
      surfaceAlt: "#FFE066",
      ink: "#000000",
      inkMuted: "rgba(0,0,0,0.68)",
      accent: "#2B4CFF",
      accentInk: "#FFFFFF",
      accentSoft: "#FFE066",
      border: "#000000",
      borderWidth: 3,
      radius: 0,
      radiusLg: 0,
      radiusPill: 0,
      fontDisplay: SANS,
      fontBody: GROTESK,
      displayWeight: 800,
      bodyWeight: 500,
      tracking: "-0.02em",
      displayCase: "none",
      scale: 1.1,
      density: "normal",
      shadow: HARD,
      imageTreatment: "vivid",
      hardEdge: true,
      gap: 20,
    },
  },
  {
    id: "glass",
    label: "Glassmorphic",
    blurb: "Frosted panels, gradient light, thin bright borders.",
    tokens: {
      bg: "#101A2E",
      surface: "rgba(255,255,255,0.08)",
      surfaceAlt: "rgba(255,255,255,0.04)",
      ink: "#F2F6FF",
      inkMuted: "rgba(242,246,255,0.60)",
      accent: "#7B8CFF",
      accentInk: "#0A1024",
      accentSoft: "rgba(123,140,255,0.18)",
      border: "rgba(255,255,255,0.22)",
      borderWidth: 1,
      radius: 18,
      radiusLg: 28,
      radiusPill: 999,
      fontDisplay: SANS,
      fontBody: GROTESK,
      displayWeight: 600,
      bodyWeight: 400,
      tracking: "-0.025em",
      displayCase: "none",
      scale: 1,
      density: "normal",
      shadow: LIFTED,
      imageTreatment: "duotone",
      hardEdge: false,
      gap: 24,
    },
  },
  {
    id: "y2k",
    label: "Y2K",
    blurb: "Chrome gradients, bubble shapes, hot pink and cyan.",
    tokens: {
      bg: "#0C0420",
      surface: "#17093A",
      surfaceAlt: "#210C52",
      ink: "#FFFFFF",
      inkMuted: "rgba(255,255,255,0.62)",
      accent: "#FF3DCB",
      accentInk: "#12002B",
      accentSoft: "rgba(255,61,203,0.16)",
      border: "rgba(120,240,255,0.34)",
      borderWidth: 2,
      radius: 26,
      radiusLg: 999,
      radiusPill: 999,
      fontDisplay: SANS,
      fontBody: GROTESK,
      displayWeight: 800,
      bodyWeight: 500,
      tracking: "-0.03em",
      displayCase: "none",
      scale: 1.08,
      density: "normal",
      shadow: GLOWY,
      imageTreatment: "vivid",
      hardEdge: false,
      gap: 22,
    },
  },
];

export const STYLE_BY_ID: Record<VisualStyleId, VisualStyleDef> =
  Object.fromEntries(VISUAL_STYLES.map((s) => [s.id, s])) as Record<
    VisualStyleId,
    VisualStyleDef
  >;

/* ==========================================================================
   Color helpers — used to fold merchant brand colors into a style without
   producing unreadable combinations.
   ========================================================================== */

export function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

export function isValidHex(hex: string): boolean {
  return parseHex(hex) !== null;
}

/** Normalises `abc` / `#ABC` / `aabbcc` to `#aabbcc`. */
export function normalizeHex(hex: string): string | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  return (
    "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("")
  ).toLowerCase();
}

function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function luminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map(srgbToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Picks whichever of the two candidates reads better on `bg`. */
export function readableInk(bg: string, light = "#FFFFFF", dark = "#111114") {
  return contrastRatio(bg, light) >= contrastRatio(bg, dark) ? light : dark;
}

export function withAlpha(hex: string, alpha: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

export function mix(a: string, b: string, t: number): string {
  const ra = parseHex(a);
  const rb = parseHex(b);
  if (!ra || !rb) return a;
  const out = ra.map((v, i) => Math.round(v + (rb[i] - v) * t));
  return "#" + out.map((v) => v.toString(16).padStart(2, "0")).join("");
}

/** Rotates a hex colour's hue, keeping saturation and lightness. Used to give
    a grid of product images believable variety without leaving the palette. */
export function shiftHue(hex: string, deg: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const [r, g, b] = rgb.map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  h = (h + deg + 360) % 360;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const seg = Math.floor(h / 60) % 6;
  const table: [number, number, number][] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ];
  const [rr, gg, bb] = table[seg];
  const out = [rr + m, gg + m, bb + m].map((v) =>
    Math.max(0, Math.min(255, Math.round(v * 255))),
  );
  return "#" + out.map((v) => v.toString(16).padStart(2, "0")).join("");
}

/* ==========================================================================
   The public entry point.
   ========================================================================== */

/**
 * Resolve the mockup design system for a brief.
 *
 * Brand colors are layered on top of the style rather than replacing it:
 * - color 1 becomes the accent (with ink recomputed for contrast)
 * - color 2, if present and far enough from the accent, tints the alt surface
 * - the style keeps its own radius / type / density / treatment
 *
 * That ordering matters: it lets a merchant hand over a pink hex and still get
 * a recognisably "Scandinavian" or "Neubrutalist" page rather than a generic
 * one wearing pink.
 */
/**
 * What each brand colour is for, in the order they are picked.
 *
 * Written down because the order was the only thing saying it, and a flat list
 * of five swatches where two did anything promised more than it delivered. The
 * merchant now reads the job off the chip before choosing the colour.
 *
 * The cap on brand colours is the length of this list — a slot without a job is
 * a slot that should not exist.
 */
/* ==========================================================================
   HEXES FOUND IN PROSE, PUT IN THE ORDER THE ROLES NEED.

   THE BUG THIS FIXES, and it is worth writing down because the code that had it
   looked completely reasonable. `BRAND_COLOR_ROLES` is positional — first is the
   accent, second tints the alternating band, third draws the borders — and a
   merchant's SWATCHES are positional too, because the form labels each slot. So
   colours lifted out of the prompt were appended to that same list and took the
   roles their positions landed on.

   That assumes the order somebody writes colours in a sentence is the order this
   file happens to want. It is not, and there is no reason it would be. A real
   brief read:

       PALETTE #0A0A0F void, #12121A panel, #1A1A25 card,
               #FF6B00 orange, #8B5CF6 violet, #B6FF3B acid

   which is how anyone describes a palette — grounds first, then the colours that
   sit on them. Read positionally it made #0A0A0F the accent, so every button,
   price and badge on the page was told to be the same near-black as the
   background, and the orange, violet and acid fell off the end of a
   three-element list without a word. The deck came back in greys and the brief
   that produced it was perfectly good.

   SO THE ORDER IS EARNED, NOT ASSUMED. An accent's job is buttons, prices,
   badges and highlighted words; a colour within a few points of the page ground
   cannot do that job at any position in any sentence. The ones that CAN go
   first, most colourful first, and the rest keep their written order behind
   them — nothing is thrown away, it is only ranked.

   THIS DOES NOT TOUCH THE MERCHANT'S SWATCHES. Those are picked against labelled
   slots — the form says "Accent" above the first one — so their position is a
   decision, and re-ranking a decision is overruling it. Only prose is reordered,
   because only prose had no way to express a role.
   ========================================================================== */
export function orderHexesForRoles(hexes: string[], ground: string | null): string[] {
  /* `parseHex` is the file's own reader — reused rather than written again, so
     a three-digit hex or a stray space behaves here exactly as it does
     everywhere else. */
  const bg = parseHex(ground ?? "") ?? [255, 255, 255];

  const scored = hexes
    .map((hex, at) => {
      const norm = normalizeHex(hex);
      const rgb = norm ? parseHex(norm) : null;
      if (!norm || !rgb) return null;
      const [r, g, b] = rgb;

      /* How much colour it has, and how far it is from the ground. Both are
         needed: a mid grey is far from black and still cannot be an accent, and
         a saturated colour a shade off the background is invisible however
         saturated it is. */
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max === 0 ? 0 : (max - min) / max;
      const away = Math.hypot(r - bg[0], g - bg[1], b - bg[2]);

      return { hex: norm, at, sat, away, usable: sat > 0.25 && away > 60 };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const usable = scored.filter((x) => x.usable);
  /* NOTHING HAPPENS WHEN NOTHING QUALIFIES. A deliberately monochrome brief —
     five greys, no accent intended — must come through exactly as written
     rather than be shuffled by a rule that found no colour to promote. */
  if (usable.length === 0) return scored.map((x) => x.hex);

  /* ==========================================================================
     ONE COLOUR MOVES. EVERYTHING ELSE STAYS EXACTLY WHERE IT WAS WRITTEN.

     The first attempt promoted every usable colour to the front, and on the
     brief that prompted all this it produced an accent of orange, an alternating
     band of ACID GREEN and borders of violet — technically a fix and visibly
     worse. Acid was written as a highlight and got handed the background of
     every other section.

     Only one role actually requires a colour: the accent draws buttons, prices
     and badges, and a near-background one makes them invisible. Bands and
     borders have no such requirement — on a dark theme a near-background value
     is exactly what they should be, which is what a brief saying "#12121A
     panel, #1A1A25 card" is telling us in as many words.

     So this promotes the single best accent and leaves the rest in the order
     they were written. On that brief: accent orange, band #0A0A0F, borders
     #12121A — the palette the merchant described, with only the one thing the
     old code got backwards put right. The smallest move that fixes the defect
     invents the least.
     ========================================================================== */
  /* AND IT ONLY MOVES ANYTHING WHEN THE FIRST COLOUR CANNOT DO THE JOB. A brief
     that already leads with something that works as an accent has answered the
     question; reordering it then is not a fix, it is a preference — and on a
     light page "#0A0A0F and #FF6B00" has two valid answers, so picking the
     brighter one would be overruling a merchant who led with the near-black on
     purpose. Intervene on the defect, not on the taste. */
  if (scored[0]?.usable) return scored.map((x) => x.hex);

  const accent = usable.reduce((best, x) =>
    x.sat > best.sat || (x.sat === best.sat && x.at < best.at) ? x : best,
  );

  return [accent.hex, ...scored.filter((x) => x !== accent).map((x) => x.hex)];
}

export const BRAND_COLOR_ROLES = [
  { label: "Accent", hint: "Buttons, prices, badges, highlighted words" },
  { label: "Alt band", hint: "Background of every other section" },
  { label: "Borders", hint: "Card and section outlines" },
] as const;

export function styleToTokens(
  style: VisualStyleId,
  brandColors: string[] = [],
  /**
   * The page background and ink read off a reference screenshot.
   *
   * Applied FIRST, before anything derived, so that everything computed from
   * `bg` below — the alternating band, the muted ink, the card surface, the
   * accent's readable ink — is computed against the background the page will
   * actually have. Setting it afterwards would leave a page whose band tint was
   * mixed for white sitting on near-black.
   *
   * The style card still owns everything that is not a colour. A merchant who
   * uploaded a dark reference and picked "Editorial" gets Editorial's faces,
   * type scale, radius and border weight on their reference's dark ground —
   * which is what picking a card next to uploading a screenshot should mean.
   */
  surface?: { bg: string; ink: string } | null,
): MockupTokens {
  const base = STYLE_BY_ID[style]?.tokens ?? STYLE_BY_ID.minimal.tokens;
  const tokens: MockupTokens = { ...base };

  const refBg = surface ? normalizeHex(surface.bg) : null;
  const refInk = surface ? normalizeHex(surface.ink) : null;

  if (refBg && refInk && contrastRatio(refBg, refInk) >= 3) {
    tokens.bg = refBg;
    tokens.ink = refInk;
    tokens.inkMuted = mix(refInk, refBg, 0.42);
    /* A card has to be findable against the page without a second colour being
       introduced: a small step toward the ink, in the direction that works on
       both a light and a dark ground. */
    tokens.surface = mix(refBg, refInk, 0.05);
    tokens.surfaceAlt = mix(refBg, refInk, 0.09);
    tokens.border = withAlpha(refInk, 0.16);
    tokens.borderWidth = Math.max(tokens.borderWidth, 1);
  }

  const valid = brandColors
    .map((c) => normalizeHex(c))
    .filter((c): c is string => Boolean(c));

  if (valid.length > 0) {
    const accent = valid[0];
    tokens.accent = accent;
    tokens.accentInk = readableInk(accent, "#FFFFFF", mix(accent, "#000000", 0.78));
    tokens.accentSoft = withAlpha(accent, 0.14);

    // Neubrutalism keeps its hard black border no matter what.
    if (!tokens.hardEdge || style === "glass" || style === "y2k") {
      tokens.border = withAlpha(accent, 0.28);
    }
  }

  /* The third colour owns the border outright, on every style.

     The guard above protects a hard-edged style from having its signature
     black outline tinted by an accent it did not ask for — an incidental
     derivation. A third colour is not incidental: the merchant filled a slot
     labelled Borders. Honouring it everywhere is the only way that label is
     not a lie on the two styles that happen to be hard-edged. */
  if (valid.length > 2) {
    tokens.border = withAlpha(valid[2], 0.34);
    tokens.borderWidth = Math.max(tokens.borderWidth, 1);
  }

  /* ---- the accent has to be visible on the page it is on ------------------

     A merchant's page shipped with a `#24150D` Buy button on a `#0A0A0A` ground:
     1.17:1, a button nobody can see. The colour was faithfully taken from their
     reference and the page was unusable, which is the wrong trade — faithful to
     a screenshot is not the goal, the goal is their page.

     The extractor no longer offers a colour like that, and this is the net under
     it, because an accent can also arrive from a swatch the merchant typed or
     from a style card that was designed against white. Only the LIGHTNESS moves:
     the hue and the saturation are whoever chose them, so the button stays
     recognisably their colour and becomes a button. */
  if (contrastRatio(tokens.accent, tokens.bg) < 2.6) {
    const towardInk = luminance(tokens.bg) < 0.5 ? "#FFFFFF" : "#000000";
    for (const amount of [0.2, 0.35, 0.5, 0.65]) {
      const lifted = mix(tokens.accent, towardInk, amount);
      if (contrastRatio(lifted, tokens.bg) >= 2.6) {
        tokens.accent = lifted;
        tokens.accentInk = readableInk(lifted, "#FFFFFF", mix(lifted, "#000000", 0.78));
        tokens.accentSoft = withAlpha(lifted, 0.14);
        break;
      }
    }
  }

  if (valid.length > 1) {
    const second = valid[1];
    // Only tint the alternating band if the second color is actually distinct,
    // otherwise the page loses its light/dark rhythm.
    if (contrastRatio(second, tokens.accent) > 1.35) {
      const bgIsDark = luminance(tokens.bg) < 0.2;
      tokens.surfaceAlt = bgIsDark
        ? mix(tokens.bg, second, 0.22)
        : mix(tokens.bg, second, 0.14);
    }
  }

  return tokens;
}

/** The 3 dots + type sample shown on each style card in the brief form. */
/**
 * What a style card shows.
 *
 * `brandColors` is passed for the SELECTED card only, so that card previews the
 * merchant's own palette while the other fourteen keep their own — the grid is
 * a comparison, and fifteen cards wearing the same accent cannot be compared.
 */
export function styleSwatch(
  style: VisualStyleId,
  brandColors: string[] = [],
): {
  dots: [string, string, string];
  font: string;
  weight: number;
  tracking: string;
  case: TypeCase;
  bg: string;
  ink: string;
} {
  const t = styleToTokens(style, brandColors);
  return {
    dots: [t.accent, t.surfaceAlt, t.border],
    font: t.fontDisplay,
    weight: t.displayWeight,
    tracking: t.tracking,
    case: t.displayCase,
    bg: t.bg,
    ink: t.ink,
  };
}

/* Density → concrete spacing, read by every block. */
export const DENSITY_SCALE: Record<Density, number> = {
  airy: 1.28,
  normal: 1,
  tight: 0.78,
};

/** CSS filter implementing each image treatment. */
export const IMAGE_FILTER: Record<ImageTreatment, string> = {
  clean: "none",
  warm: "saturate(0.92) sepia(0.12)",
  mono: "grayscale(1) contrast(1.08)",
  duotone: "grayscale(1) contrast(1.1) brightness(0.92)",
  grain: "saturate(0.88) contrast(0.96)",
  vivid: "saturate(1.24) contrast(1.05)",
};
