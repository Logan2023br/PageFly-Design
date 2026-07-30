"use client";

import type { BlockContent } from "@/lib/generate/types";
import {
  Band,
  Body,
  Btn,
  Card,
  Display,
  Eyebrow,
  HeadlineWithHighlight,
  MockImage,
  Row,
  Stack,
  useMock,
} from "../primitives";

export function Hero({ content }: { content: BlockContent["hero"] }) {
  const { tokens, fs, bp, pad, band, contentMax, gap } = useMock();
  const isMobile = bp === "mobile";
  const headingSize = bp === "desktop" ? 56 : bp === "tablet" ? 42 : 32;

  const ctas = (
    <Row gap={10} wrap>
      <Btn label={content.primaryCta} size={isMobile ? "md" : "lg"} />
      {content.secondaryCta && (
        <Btn label={content.secondaryCta} variant="ghost" size={isMobile ? "md" : "lg"} />
      )}
    </Row>
  );

  const statCard = content.stat ? (
    <Card pad={16} style={{ display: "inline-block", minWidth: 168 }}>
      <Display size={26} as="div" style={{ color: tokens.accent }}>
        {content.stat.value}
      </Display>
      <Body size={12} style={{ marginTop: 4 }}>
        {content.stat.label}
      </Body>
    </Card>
  ) : null;

  /* ---- full bleed ------------------------------------------------------ */
  if (content.layout === "fullBleed") {
    return (
      <section style={{ position: "relative", background: tokens.bg }}>
        <MockImage
          seed={content.seed}
          ratio={isMobile ? 1.2 : 0.46}
          radius={0}
          style={{ borderWidth: 0 }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(to top, rgba(0,0,0,.72) 0%, rgba(0,0,0,.28) 55%, rgba(0,0,0,.05) 100%)",
            display: "flex",
            alignItems: "flex-end",
            padding: pad,
          }}
        >
          <div style={{ maxWidth: Math.min(contentMax, 620), color: "#fff" }}>
            <Stack gap={14}>
              {content.eyebrow && (
                <div
                  style={{
                    fontFamily: tokens.fontBody,
                    fontSize: fs(11),
                    fontWeight: 600,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    opacity: 0.85,
                  }}
                >
                  {content.eyebrow}
                </div>
              )}
              <Display size={headingSize} as="h1" style={{ color: "#fff" }}>
                {content.headline}
              </Display>
              <Body size={15} muted={false} style={{ opacity: 0.86, maxWidth: 480 }}>
                {content.sub}
              </Body>
              {ctas}
            </Stack>
          </div>
        </div>
      </section>
    );
  }

  /* ---- centered -------------------------------------------------------- */
  if (content.layout === "centered") {
    return (
      <Band band="base">
        <Stack gap={18} style={{ justifyItems: "center", textAlign: "center" }}>
          {content.eyebrow && <Eyebrow>{content.eyebrow}</Eyebrow>}
          <div style={{ maxWidth: 760 }}>
            <HeadlineWithHighlight
              text={content.headline}
              highlight={content.highlight}
              size={headingSize}
            />
          </div>
          <Body size={16} style={{ maxWidth: 540 }}>
            {content.sub}
          </Body>
          {ctas}
          {statCard}
          <MockImage
            seed={content.seed}
            ratio={isMobile ? 0.9 : 0.5}
            style={{ marginTop: gap, borderRadius: tokens.radiusLg }}
          />
        </Stack>
      </Band>
    );
  }

  /* ---- split ----------------------------------------------------------- */
  return (
    <section
      style={{
        background: tokens.bg,
        color: tokens.ink,
        paddingLeft: pad,
        paddingRight: pad,
        paddingTop: band,
        paddingBottom: band,
      }}
    >
      <div
        style={{
          maxWidth: contentMax,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1.05fr 1fr",
          gap: isMobile ? 26 : Math.max(gap, 40),
          alignItems: "center",
        }}
      >
        <Stack gap={16}>
          {content.eyebrow && <Eyebrow>{content.eyebrow}</Eyebrow>}
          <HeadlineWithHighlight
            text={content.headline}
            highlight={content.highlight}
            size={headingSize}
          />
          <Body size={16} style={{ maxWidth: 460 }}>
            {content.sub}
          </Body>
          {ctas}
          {statCard}
        </Stack>
        <MockImage
          seed={content.seed}
          ratio={isMobile ? 0.85 : 1.1}
          style={{ borderRadius: tokens.radiusLg }}
        />
      </div>
    </section>
  );
}

/* ---- PasswordGate ------------------------------------------------------- */

export function PasswordGate({
  content,
}: {
  content: BlockContent["passwordGate"];
}) {
  const { tokens, bp, pad } = useMock();
  const isMobile = bp === "mobile";

  return (
    <section
      style={{
        background: tokens.bg,
        color: tokens.ink,
        minHeight: isMobile ? 620 : 760,
        display: "grid",
        placeItems: "center",
        padding: pad,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(60% 50% at 50% 0%, ${tokens.accentSoft} 0%, transparent 70%)`,
        }}
      />
      <Stack
        gap={18}
        style={{
          position: "relative",
          justifyItems: "center",
          textAlign: "center",
          maxWidth: 420,
        }}
      >
        <Display size={20} as="div">
          {content.brand}
        </Display>
        <MockImage seed={`${content.brand}-gate`} ratio={0.62} style={{ width: 240 }} />
        <Display size={isMobile ? 28 : 36} as="h1">
          {content.headline}
        </Display>
        <Body size={15}>{content.body}</Body>
        <Stack gap={10} style={{ width: "100%", marginTop: 4 }}>
          <div
            style={{
              height: 44,
              borderWidth: tokens.borderWidth,
              borderStyle: "solid",
              borderColor: tokens.border,
              borderRadius: tokens.radius,
            }}
          />
          <Btn label={content.cta} full />
        </Stack>
        <Body size={12}>{content.note}</Body>
      </Stack>
    </section>
  );
}
