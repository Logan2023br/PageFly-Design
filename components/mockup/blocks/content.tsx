"use client";

import type { BlockContent } from "@/lib/generate/types";
import {
  Band,
  Body,
  Btn,
  Card,
  Display,
  Eyebrow,
  Grid,
  MockImage,
  Pill,
  Row,
  Rule,
  SectionHead,
  Stack,
  useMock,
} from "../primitives";

/* ---- FeatureRow --------------------------------------------------------- */

export function FeatureRow({
  content,
  band,
}: {
  content: BlockContent["featureRow"];
  band?: "base" | "alt" | "accent";
}) {
  const { tokens, fs, pick } = useMock();
  const cols = pick(content.columns, 2, 1);

  return (
    <Band band={band}>
      <SectionHead title={content.title} sub={content.sub} />
      <Grid cols={cols}>
        {content.items.map((item, i) => (
          <Stack key={item.title} gap={10}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: tokens.radius,
                background: tokens.accentSoft,
                color: tokens.accent,
                display: "grid",
                placeItems: "center",
                fontFamily: tokens.fontBody,
                fontSize: fs(13),
                fontWeight: 700,
                borderWidth: tokens.hardEdge ? tokens.borderWidth : 0,
                borderStyle: "solid",
                borderColor: tokens.border,
              }}
            >
              {String(i + 1).padStart(2, "0")}
            </div>
            <Display size={17} as="h3">
              {item.title}
            </Display>
            <Body size={13.5}>{item.body}</Body>
          </Stack>
        ))}
      </Grid>
    </Band>
  );
}

/* ---- ImageSplit --------------------------------------------------------- */

export function ImageSplit({
  content,
  band,
}: {
  content: BlockContent["imageSplit"];
  band?: "base" | "alt" | "accent";
}) {
  const { tokens, bp, pad, band: bandPad, contentMax, gap } = useMock();
  const isMobile = bp === "mobile";
  const bg = band === "alt" ? tokens.surfaceAlt : tokens.bg;

  const text = (
    <Stack gap={14}>
      {content.eyebrow && <Eyebrow>{content.eyebrow}</Eyebrow>}
      <Display size={isMobile ? 26 : 34}>{content.headline}</Display>
      <Body size={15} style={{ maxWidth: 440 }}>
        {content.body}
      </Body>
      {content.cta && <Btn label={content.cta} variant="ghost" />}
    </Stack>
  );

  const image = (
    <MockImage
      seed={content.seed}
      ratio={isMobile ? 0.8 : 0.92}
      style={{ borderRadius: tokens.radiusLg }}
    />
  );

  return (
    <section
      style={{
        background: bg,
        color: tokens.ink,
        paddingLeft: pad,
        paddingRight: pad,
        paddingTop: bandPad,
        paddingBottom: bandPad,
      }}
    >
      <div
        style={{
          maxWidth: contentMax,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: isMobile ? 22 : Math.max(gap, 44),
          alignItems: "center",
        }}
      >
        {content.side === "left" || isMobile ? (
          <>
            {image}
            {text}
          </>
        ) : (
          <>
            {text}
            {image}
          </>
        )}
      </div>
    </section>
  );
}

/* ---- RichText ----------------------------------------------------------- */

export function RichText({
  content,
  band,
}: {
  content: BlockContent["richText"];
  band?: "base" | "alt" | "accent";
}) {
  const { bp } = useMock();

  return (
    <Band band={band}>
      <div style={{ maxWidth: 680 }}>
        <Stack gap={16}>
          {content.eyebrow && <Eyebrow>{content.eyebrow}</Eyebrow>}
          <Display size={bp === "mobile" ? 30 : 42}>{content.title}</Display>
          <Body size={17}>{content.lead}</Body>
          {content.sections.map((s) => (
            <Stack key={s.heading} gap={8} style={{ marginTop: 8 }}>
              <Display size={18} as="h3">
                {s.heading}
              </Display>
              <Body size={14.5}>{s.body}</Body>
            </Stack>
          ))}
        </Stack>
      </div>
    </Band>
  );
}

/* ---- BlogList ----------------------------------------------------------- */

export function BlogList({
  content,
  band,
}: {
  content: BlockContent["blogList"];
  band?: "base" | "alt" | "accent";
}) {
  const { tokens, fs, bp, pick, gap } = useMock();
  const isMobile = bp === "mobile";

  return (
    <Band band={band}>
      <SectionHead title={content.title} size={40} />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1.1fr 1fr",
          gap: isMobile ? 20 : Math.max(gap, 32),
          alignItems: "center",
          marginBottom: gap * 1.4,
        }}
      >
        <MockImage
          seed={`feat-${content.featured.title}`}
          ratio={isMobile ? 0.7 : 0.66}
          style={{ borderRadius: tokens.radiusLg }}
        />
        <Stack gap={12}>
          <Row gap={10}>
            <Pill>{content.featured.tag}</Pill>
            <Body size={12}>{content.featured.date}</Body>
          </Row>
          <Display size={isMobile ? 24 : 30}>{content.featured.title}</Display>
          <Body size={14.5}>{content.featured.excerpt}</Body>
          <span
            style={{
              fontFamily: tokens.fontBody,
              fontSize: fs(13),
              fontWeight: 600,
              color: tokens.accent,
            }}
          >
            Read it →
          </span>
        </Stack>
      </div>

      <Rule style={{ marginBottom: gap }} />

      <Grid cols={pick(4, 2, 1)}>
        {content.posts.map((p) => (
          <Stack key={p.title} gap={10}>
            <MockImage seed={`post-${p.title}`} ratio={0.72} />
            <Row gap={8}>
              <Pill tone="outline">{p.tag}</Pill>
              <Body size={11}>{p.date}</Body>
            </Row>
            <Display size={15} as="h3">
              {p.title}
            </Display>
            <Body size={12.5}>{p.excerpt}</Body>
          </Stack>
        ))}
      </Grid>
    </Band>
  );
}

/* ---- BlogArticle -------------------------------------------------------- */

export function BlogArticle({
  content,
}: {
  content: BlockContent["blogArticle"];
}) {
  const { tokens, fs, bp, pad, band, gap } = useMock();
  const isMobile = bp === "mobile";

  return (
    <section
      style={{
        background: tokens.bg,
        color: tokens.ink,
        paddingLeft: pad,
        paddingRight: pad,
        paddingTop: Math.round(band * 0.7),
        paddingBottom: band,
      }}
    >
      <div style={{ maxWidth: 700, margin: "0 auto" }}>
        <Stack gap={14}>
          <Row gap={10} wrap>
            <Pill tone="solid">{content.tag}</Pill>
            <Body size={12}>
              {content.author} · {content.date} · {content.readTime}
            </Body>
          </Row>
          <Display size={isMobile ? 30 : 44} as="h1">
            {content.title}
          </Display>
        </Stack>

        <MockImage
          seed={content.seed}
          ratio={0.56}
          style={{ marginTop: gap, marginBottom: gap, borderRadius: tokens.radiusLg }}
        />

        <Stack gap={18}>
          {content.paragraphs.slice(0, 2).map((p, i) => (
            <Body key={i} size={16} muted={false} style={{ color: tokens.ink }}>
              {p}
            </Body>
          ))}

          <div
            style={{
              borderLeftWidth: 3,
              borderLeftStyle: "solid",
              borderLeftColor: tokens.accent,
              paddingLeft: 20,
              paddingTop: 4,
              paddingBottom: 4,
            }}
          >
            <Display size={isMobile ? 20 : 25} as="div">
              {content.pullQuote}
            </Display>
          </div>

          {content.paragraphs.slice(2).map((p, i) => (
            <Body key={i} size={16} muted={false} style={{ color: tokens.ink }}>
              {p}
            </Body>
          ))}
        </Stack>

        <Rule style={{ marginTop: gap * 1.4, marginBottom: 16 }} />
        <Row gap={12} style={{ justifyContent: "space-between" }}>
          <Body size={12}>Written by {content.author}</Body>
          <Row gap={10}>
            {["Share", "Copy link"].map((s) => (
              <span
                key={s}
                style={{
                  fontFamily: tokens.fontBody,
                  fontSize: fs(12),
                  color: tokens.inkMuted,
                }}
              >
                {s}
              </span>
            ))}
          </Row>
        </Row>
      </div>
    </section>
  );
}

/* ---- MediaWall ---------------------------------------------------------- */

export function MediaWall({
  content,
  band,
}: {
  content: BlockContent["mediaWall"];
  band?: "base" | "alt" | "accent";
}) {
  const { tokens, fs, pick } = useMock();
  const cols = pick(3, 3, 2);

  return (
    <Band band={band}>
      <SectionHead title={content.title} sub={content.sub} align="center" />
      {content.handle && (
        <div style={{ textAlign: "center", marginTop: -8, marginBottom: 20 }}>
          <Pill>{content.handle}</Pill>
        </div>
      )}
      <Grid cols={cols} gap={10}>
        {content.tiles.map((t) => (
          <div
            key={t.seed}
            style={{ gridColumn: t.wide ? "span 2" : undefined, position: "relative" }}
          >
            <MockImage seed={t.seed} ratio={t.wide ? 0.62 : t.ratio} />
            {t.caption && (
              <div
                style={{
                  position: "absolute",
                  left: 10,
                  top: 10,
                  fontFamily: tokens.fontBody,
                  fontSize: fs(10),
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  color: "#fff",
                  textShadow: "0 1px 4px rgba(0,0,0,.6)",
                }}
              >
                {t.caption}
              </div>
            )}
            {content.shoppable && (
              <div
                style={{
                  position: "absolute",
                  right: 8,
                  bottom: 8,
                  width: 22,
                  height: 22,
                  borderRadius: 999,
                  background: tokens.accent,
                  color: tokens.accentInk,
                  display: "grid",
                  placeItems: "center",
                  fontSize: fs(12),
                  fontWeight: 700,
                }}
              >
                +
              </div>
            )}
          </div>
        ))}
      </Grid>
    </Band>
  );
}

/* ---- ListPanel ---------------------------------------------------------- */

export function ListPanel({
  content,
  band,
}: {
  content: BlockContent["listPanel"];
  band?: "base" | "alt" | "accent";
}) {
  const { tokens, fs, bp } = useMock();
  const isMobile = bp === "mobile";

  return (
    <Band band={band}>
      <SectionHead title={content.title} sub={content.sub} />
      <Card pad={0} style={{ overflow: "hidden" }}>
        {content.rows.map((r, i) => (
          <div key={r.primary}>
            {i > 0 && <Rule />}
            <Row
              gap={14}
              wrap={isMobile}
              style={{
                padding: isMobile ? "14px 16px" : "17px 20px",
                justifyContent: "space-between",
                alignItems: isMobile ? "flex-start" : "center",
              }}
            >
              <Stack gap={3} style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: tokens.fontBody,
                    fontSize: fs(14),
                    fontWeight: 600,
                  }}
                >
                  {r.primary}
                </div>
                <Body size={12.5}>{r.secondary}</Body>
              </Stack>
              <Row gap={14}>
                {r.meta && (
                  <span
                    style={{
                      fontFamily: tokens.fontBody,
                      fontSize: fs(12.5),
                      color: tokens.inkMuted,
                    }}
                  >
                    {r.meta}
                  </span>
                )}
                {r.action && <Btn label={r.action} variant="ghost" size="sm" />}
              </Row>
            </Row>
          </div>
        ))}
      </Card>
    </Band>
  );
}

/* ---- DataTable ---------------------------------------------------------- */

export function DataTable({
  content,
  band,
}: {
  content: BlockContent["dataTable"];
  band?: "base" | "alt" | "accent";
}) {
  const { tokens, fs, bp } = useMock();
  const isMobile = bp === "mobile";

  const cell = (
    key: string,
    value: string,
    opts: { head?: boolean; highlight?: boolean; first?: boolean },
  ) => {
    const isBool =
      content.booleanCells && (value === "yes" || value === "no");
    return (
      <div
        key={key}
        style={{
          padding: isMobile ? "10px 10px" : "13px 16px",
          fontFamily: tokens.fontBody,
          fontSize: fs(isMobile ? 11.5 : 13),
          fontWeight: opts.head || opts.first ? 600 : 400,
          color: opts.head
            ? tokens.ink
            : isBool
              ? value === "yes"
                ? tokens.accent
                : tokens.inkMuted
              : opts.first
                ? tokens.ink
                : tokens.inkMuted,
          background: opts.highlight ? tokens.accentSoft : "transparent",
          textAlign: opts.first ? "left" : "center",
          whiteSpace: "nowrap",
        }}
      >
        {isBool ? (value === "yes" ? "✓" : "—") : value}
      </div>
    );
  };

  const cols = content.columns.length;

  return (
    <Band band={band}>
      <SectionHead title={content.title} sub={content.note} />
      <Card pad={0} style={{ overflow: "hidden" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `minmax(84px, 1.4fr) repeat(${cols - 1}, minmax(60px, 1fr))`,
          }}
        >
          {content.columns.map((c, i) =>
            cell(`h${i}`, c, {
              head: true,
              first: i === 0,
              highlight: i === content.highlightColumn,
            }),
          )}
        </div>
        <Rule />
        {content.rows.map((row, ri) => (
          <div key={ri}>
            {ri > 0 && <Rule />}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `minmax(84px, 1.4fr) repeat(${cols - 1}, minmax(60px, 1fr))`,
              }}
            >
              {row.map((v, ci) =>
                cell(`r${ri}c${ci}`, v, {
                  first: ci === 0,
                  highlight: ci === content.highlightColumn,
                }),
              )}
            </div>
          </div>
        ))}
      </Card>
    </Band>
  );
}
