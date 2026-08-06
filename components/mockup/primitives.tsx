"use client";

import { createContext, useContext, useMemo, type CSSProperties, type ReactNode } from "react";
import {
  DENSITY_SCALE,
  IMAGE_FILTER,
  withAlpha,
  type MockupTokens,
} from "@/lib/styleTokens";
import { hashString, makeRng } from "@/lib/generate/seed";
import { buildScene } from "@/lib/mockArt";
import type { Vertical } from "@/lib/generate/content";

/* ==========================================================================
   Mockup primitives.

   Every block builds from these, so a style change lands everywhere at once.
   Sizing is in real pixels for the device width being rendered — the preview
   scales the whole frame, it never scales an image of a page.
   ========================================================================== */

export type Breakpoint = "mobile" | "tablet" | "desktop";

type MockEnv = {
  tokens: MockupTokens;
  /** detected product category — picks the silhouette MockImage draws */
  vertical: Vertical;
  width: number;
  bp: Breakpoint;
  /** page gutter */
  pad: number;
  /** max content width inside the gutter */
  contentMax: number;
  /** vertical band padding */
  band: number;
  /** grid gap */
  gap: number;
  /** scales a font size by the style's type scale */
  fs: (px: number) => number;
  /** picks a value per breakpoint */
  pick: <T>(desktop: T, tablet: T, mobile: T) => T;
};

const MockContext = createContext<MockEnv | null>(null);

export function useMock(): MockEnv {
  const ctx = useContext(MockContext);
  if (!ctx) throw new Error("Mockup blocks must render inside <MockProvider>");
  return ctx;
}

export function MockProvider({
  tokens,
  vertical,
  width,
  children,
}: {
  tokens: MockupTokens;
  vertical: Vertical;
  width: number;
  children: ReactNode;
}) {
  const env = useMemo<MockEnv>(() => {
    const bp: Breakpoint =
      width < 560 ? "mobile" : width < 960 ? "tablet" : "desktop";
    const d = DENSITY_SCALE[tokens.density];
    const pad = bp === "mobile" ? 20 : bp === "tablet" ? 32 : 56;
    const contentMax =
      bp === "desktop" ? Math.min(1180, width - pad * 2) : width - pad * 2;

    return {
      tokens,
      vertical,
      width,
      bp,
      pad,
      contentMax,
      band: Math.round((bp === "mobile" ? 44 : bp === "tablet" ? 60 : 84) * d),
      gap: Math.round(tokens.gap * (bp === "mobile" ? 0.7 : 1)),
      fs: (px: number) =>
        Math.round(px * tokens.scale * (bp === "mobile" ? 0.9 : 1) * 100) / 100,
      pick: <T,>(desktop: T, tablet: T, mobile: T) =>
        bp === "desktop" ? desktop : bp === "tablet" ? tablet : mobile,
    };
  }, [tokens, vertical, width]);

  return <MockContext.Provider value={env}>{children}</MockContext.Provider>;
}

/* ---- band / section ----------------------------------------------------- */

export function Band({
  band = "base",
  children,
  style,
  tight,
}: {
  band?: "base" | "alt" | "accent";
  children: ReactNode;
  style?: CSSProperties;
  tight?: boolean;
}) {
  const { tokens, pad, band: bandPad } = useMock();
  const bg =
    band === "accent"
      ? tokens.accent
      : band === "alt"
        ? tokens.surfaceAlt
        : tokens.bg;
  const color = band === "accent" ? tokens.accentInk : tokens.ink;

  return (
    <section
      style={{
        background: bg,
        color,
        paddingLeft: pad,
        paddingRight: pad,
        paddingTop: tight ? Math.round(bandPad * 0.45) : bandPad,
        paddingBottom: tight ? Math.round(bandPad * 0.45) : bandPad,
        ...style,
      }}
    >
      <Content>{children}</Content>
    </section>
  );
}

export function Content({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  const { contentMax } = useMock();
  return (
    <div style={{ maxWidth: contentMax, margin: "0 auto", ...style }}>
      {children}
    </div>
  );
}

/* ---- type --------------------------------------------------------------- */

export function Display({
  children,
  size = 44,
  style,
  as: Tag = "h2",
  dataPf,
}: {
  children: ReactNode;
  size?: number;
  style?: CSSProperties;
  as?: "h1" | "h2" | "h3" | "div";
  dataPf?: string;
}) {
  const { tokens, fs } = useMock();
  return (
    <Tag
      data-pf={dataPf}
      style={{
        fontFamily: tokens.fontDisplay,
        fontWeight: tokens.displayWeight,
        letterSpacing: tokens.tracking,
        textTransform: tokens.displayCase === "upper" ? "uppercase" : "none",
        fontSize: fs(size),
        lineHeight: 1.08,
        margin: 0,
        ...style,
      }}
    >
      {children}
    </Tag>
  );
}

export function Body({
  children,
  size = 15,
  muted = true,
  style,
  dataPf,
}: {
  children: ReactNode;
  size?: number;
  muted?: boolean;
  style?: CSSProperties;
  dataPf?: string;
}) {
  const { tokens, fs } = useMock();
  return (
    <p
      data-pf={dataPf}
      style={{
        fontFamily: tokens.fontBody,
        fontWeight: tokens.bodyWeight,
        fontSize: fs(size),
        lineHeight: 1.6,
        color: muted ? tokens.inkMuted : "inherit",
        margin: 0,
        ...style,
      }}
    >
      {children}
    </p>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  const { tokens, fs } = useMock();
  return (
    <div
      style={{
        fontFamily: tokens.fontBody,
        fontSize: fs(11),
        fontWeight: 600,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: tokens.accent,
      }}
    >
      {children}
    </div>
  );
}

/** Headline with exactly one word tinted by the accent. */
export function HeadlineWithHighlight({
  text,
  highlight,
  size,
  as = "h1",
}: {
  text: string;
  highlight: number;
  size: number;
  as?: "h1" | "h2";
}) {
  const { tokens } = useMock();
  const words = text.split(" ");
  return (
    <Display as={as} size={size}>
      {words.map((w, i) => (
        <span key={i} style={i === highlight ? { color: tokens.accent } : undefined}>
          {w}
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </Display>
  );
}

/* ---- controls ----------------------------------------------------------- */

export function Btn({
  label,
  variant = "primary",
  full,
  size = "md",
  dataPf = "button",
}: {
  label: string;
  variant?: "primary" | "ghost" | "onAccent";
  full?: boolean;
  size?: "sm" | "md" | "lg";
  dataPf?: string;
}) {
  const { tokens, fs } = useMock();
  const padY = size === "lg" ? 15 : size === "sm" ? 8 : 12;
  const padX = size === "lg" ? 28 : size === "sm" ? 14 : 22;

  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: tokens.fontBody,
    fontWeight: 600,
    fontSize: fs(size === "sm" ? 12 : 14),
    padding: `${padY}px ${padX}px`,
    borderRadius: tokens.radiusPill || tokens.radius,
    width: full ? "100%" : undefined,
    borderStyle: "solid",
    borderWidth: 0,
    whiteSpace: "nowrap",
    boxShadow: tokens.shadow === "none" ? undefined : tokens.shadow,
  };

  if (variant === "primary")
    return (
      <span
        data-pf={dataPf}
        style={{
          ...base,
          background: tokens.accent,
          color: tokens.accentInk,
          borderWidth: tokens.hardEdge ? tokens.borderWidth : 0,
          borderColor: tokens.border,
        }}
      >
        {label}
      </span>
    );

  if (variant === "onAccent")
    return (
      <span
        data-pf={dataPf}
        style={{
          ...base,
          background: tokens.accentInk,
          color: tokens.accent,
          boxShadow: undefined,
        }}
      >
        {label}
      </span>
    );

  return (
    <span
      data-pf={dataPf}
      style={{
        ...base,
        background: "transparent",
        color: "inherit",
        borderWidth: tokens.borderWidth,
        borderColor: tokens.border,
        boxShadow: undefined,
      }}
    >
      {label}
    </span>
  );
}

export function Card({
  children,
  style,
  pad = 20,
  band,
  dataPf,
}: {
  children: ReactNode;
  style?: CSSProperties;
  pad?: number;
  band?: "base" | "alt" | "accent";
  dataPf?: string;
}) {
  const { tokens } = useMock();
  return (
    <div
      data-pf={dataPf}
      style={{
        background:
          band === "accent"
            ? tokens.accentSoft
            : band === "alt"
              ? tokens.surfaceAlt
              : tokens.surface,
        borderWidth: tokens.borderWidth,
        borderStyle: "solid",
        borderColor: tokens.border,
        borderRadius: tokens.radiusLg,
        padding: pad,
        boxShadow: tokens.shadow,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Field({ label, wide }: { label: string; wide?: boolean }) {
  const { tokens, fs } = useMock();
  return (
    <div style={{ gridColumn: wide ? "1 / -1" : undefined }}>
      <div
        style={{
          fontFamily: tokens.fontBody,
          fontSize: fs(11),
          fontWeight: 600,
          color: tokens.inkMuted,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          height: fs(38),
          borderWidth: tokens.borderWidth,
          borderStyle: "solid",
          borderColor: tokens.border,
          borderRadius: tokens.radius,
          background: withAlpha("#ffffff", 0.02),
        }}
      />
    </div>
  );
}

export function Rule({ style }: { style?: CSSProperties }) {
  const { tokens } = useMock();
  return (
    <div
      style={{
        height: tokens.borderWidth,
        background: tokens.border,
        ...style,
      }}
    />
  );
}

export function Stars({ rating, size = 12 }: { rating: number; size?: number }) {
  const { tokens, fs } = useMock();
  return (
    <div
      style={{
        display: "flex",
        gap: 2,
        fontSize: fs(size),
        color: tokens.accent,
        letterSpacing: "0.06em",
      }}
    >
      {"★★★★★".slice(0, rating)}
      <span style={{ color: tokens.inkMuted }}>{"★★★★★".slice(rating)}</span>
    </div>
  );
}

export function Pill({
  children,
  tone = "soft",
}: {
  children: ReactNode;
  tone?: "soft" | "solid" | "outline";
}) {
  const { tokens, fs } = useMock();
  const shared: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontFamily: tokens.fontBody,
    fontSize: fs(11),
    fontWeight: 600,
    padding: "5px 11px",
    borderRadius: tokens.radiusPill || tokens.radius,
    borderStyle: "solid",
    borderWidth: 0,
    whiteSpace: "nowrap",
  };
  if (tone === "solid")
    return (
      <span style={{ ...shared, background: tokens.accent, color: tokens.accentInk }}>
        {children}
      </span>
    );
  if (tone === "outline")
    return (
      <span
        style={{
          ...shared,
          borderWidth: tokens.borderWidth,
          borderColor: tokens.border,
          color: tokens.inkMuted,
        }}
      >
        {children}
      </span>
    );
  return (
    <span style={{ ...shared, background: tokens.accentSoft, color: tokens.accent }}>
      {children}
    </span>
  );
}

/* ==========================================================================
   MockImage — a deterministic drawn "photograph".

   Earlier this stacked CSS gradients, and the honest verdict was that it read as
   a coloured blob rather than a product shot. It now draws a scene: a backdrop
   with a light source, a product silhouette picked from the DETECTED VERTICAL
   (a mug for ceramics, a bottle for skincare, a sneaker for footwear), a contact
   shadow and a specular highlight. Roughly a quarter of images drop the object
   for a soft environment, so a grid reads as a real photo set instead of the
   same picture twelve times.

   Product imagery is ALWAYS drawn, never taken from an uploaded reference. A
   reference image is a design reference — a screenshot of a layout the merchant
   likes — so pasting it into every product slot produced eight copies of the
   same screenshot and told the merchant nothing. References drive colour and
   structure (see lib/refLayout.ts); the pictures of the goods are invented here.

   Nothing is fetched. That keeps the mockups offline, keeps PNG export lossless
   and CORS-free, and keeps output identical for a given seed.
   ========================================================================== */

export function MockImage({
  seed,
  ratio = 1,
  style,
  radius,
  label,
  kind = "auto",
  dataPf,
}: {
  seed: string;
  /** height / width */
  ratio?: number;
  style?: CSSProperties;
  radius?: number;
  label?: string;
  kind?: "auto" | "product" | "scene";
  dataPf?: string;
}) {
  const { tokens, vertical, fs } = useMock();

  const scene = useMemo(
    () => buildScene(seed, tokens, vertical, kind),
    [seed, tokens, vertical, kind],
  );

  const grain = tokens.imageTreatment === "grain";
  const gid = `pfd-obj-${hashString(seed).toString(36)}`;

  return (
    <div
      data-pf={dataPf}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: `1 / ${ratio}`,
        borderRadius: radius ?? tokens.radius,
        overflow: "hidden",
        background: scene.backdrop,
        filter: IMAGE_FILTER[tokens.imageTreatment],
        borderWidth: tokens.hardEdge ? tokens.borderWidth : 0,
        borderStyle: "solid",
        borderColor: tokens.border,
        ...style,
      }}
    >
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid slice"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        aria-hidden
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0.35" y2="1">
            <stop offset="0%" stopColor={scene.objectTop} />
            <stop offset="100%" stopColor={scene.objectBottom} />
          </linearGradient>
        </defs>

        {/* environment bands, when there is no product in frame */}
        {scene.bands.map((b, i) => (
          <rect key={i} x={-10} y={b.y} width={120} height={b.h} fill={b.color} />
        ))}

        {scene.shape && (
          <g transform={scene.transform}>
            {/* contact shadow first, so the object sits on something */}
            <ellipse cx="50" cy="79" rx="26" ry="4.6" fill={scene.shadow} />
            <path d={scene.shape.body} fill={`url(#${gid})`} />
            {scene.shape.detail && (
              <path d={scene.shape.detail} fill={scene.objectBottom} />
            )}
            {scene.shape.mark && (
              <path
                d={scene.shape.mark}
                fill="none"
                stroke={scene.markColor}
                strokeWidth={scene.shape.markWidth ?? 4}
                strokeLinecap="round"
              />
            )}
            {/* specular highlight down the left edge of the object */}
            <path
              d={scene.shape.body}
              fill="none"
              stroke={scene.highlight}
              strokeWidth={1.4}
              strokeLinejoin="round"
            />
          </g>
        )}
      </svg>

      <div
        style={{ position: "absolute", inset: 0, background: scene.vignette }}
      />

      {grain && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0.16,
            backgroundImage:
              "repeating-linear-gradient(0deg, rgba(0,0,0,.5) 0 1px, transparent 1px 3px)",
          }}
        />
      )}
      {label && (
        <div
          style={{
            position: "absolute",
            left: 10,
            bottom: 8,
            fontFamily: tokens.fontBody,
            fontSize: fs(10),
            fontWeight: 600,
            color: "#fff",
            textShadow: "0 1px 4px rgba(0,0,0,.5)",
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
}

/** Deterministic text-line placeholder, used only inside dense table/list rows. */
export function useSeedRng(seed: string) {
  return useMemo(() => makeRng(seed), [seed]);
}

export function seedInt(seed: string, min: number, max: number) {
  return min + (hashString(seed) % (max - min + 1));
}

/* ---- layout helpers ----------------------------------------------------- */

export function Grid({
  cols,
  gap,
  children,
  style,
  dataPf,
}: {
  cols: number;
  gap?: number;
  children: ReactNode;
  style?: CSSProperties;
  dataPf?: string;
}) {
  const { gap: defaultGap } = useMock();
  return (
    <div
      data-pf={dataPf}
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gap: gap ?? defaultGap,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Stack({
  gap = 12,
  children,
  style,
  dataPf,
}: {
  gap?: number;
  children: ReactNode;
  style?: CSSProperties;
  dataPf?: string;
}) {
  return (
    <div data-pf={dataPf} style={{ display: "grid", gap, ...style }}>
      {children}
    </div>
  );
}

export function Row({
  gap = 12,
  children,
  style,
  wrap,
  dataPf,
}: {
  gap?: number;
  children: ReactNode;
  style?: CSSProperties;
  wrap?: boolean;
  dataPf?: string;
}) {
  return (
    <div
      data-pf={dataPf}
      style={{
        display: "flex",
        alignItems: "center",
        gap,
        flexWrap: wrap ? "wrap" : "nowrap",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function SectionHead({
  eyebrow,
  title,
  sub,
  align = "left",
  size = 34,
}: {
  eyebrow?: string;
  title?: string;
  sub?: string;
  align?: "left" | "center";
  size?: number;
}) {
  const { gap } = useMock();
  if (!eyebrow && !title && !sub) return null;
  return (
    <div
      style={{
        display: "grid",
        gap: 10,
        textAlign: align,
        justifyItems: align === "center" ? "center" : "start",
        marginBottom: gap,
        maxWidth: align === "center" ? 620 : undefined,
        marginLeft: align === "center" ? "auto" : undefined,
        marginRight: align === "center" ? "auto" : undefined,
      }}
    >
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      {title && <Display size={size}>{title}</Display>}
      {sub && <Body>{sub}</Body>}
    </div>
  );
}
