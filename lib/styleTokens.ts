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

const SANS = '"Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif';
const GROTESK = 'Inter, ui-sans-serif, system-ui, sans-serif';
const SERIF = 'ui-serif, Georgia, "Times New Roman", serif';
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const ROUNDED =
  '"SF Pro Rounded", ui-rounded, "Segoe UI Variable", system-ui, sans-serif';
const CONDENSED =
  '"Arial Narrow", "Helvetica Neue", Impact, ui-sans-serif, sans-serif';

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
export function styleToTokens(
  style: VisualStyleId,
  brandColors: string[] = [],
): MockupTokens {
  const base = STYLE_BY_ID[style]?.tokens ?? STYLE_BY_ID.minimal.tokens;
  const tokens: MockupTokens = { ...base };

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
export function styleSwatch(style: VisualStyleId): {
  dots: [string, string, string];
  font: string;
  weight: number;
  tracking: string;
  case: TypeCase;
  bg: string;
  ink: string;
} {
  const t = STYLE_BY_ID[style].tokens;
  return {
    dots: [t.accent, t.surfaceAlt, t.ink],
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
