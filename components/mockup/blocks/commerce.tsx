"use client";

import type { BlockContent, MockProduct } from "@/lib/generate/types";
import {
  Band,
  Body,
  Btn,
  Card,
  Display,
  Eyebrow,
  Field,
  Grid,
  MockImage,
  Pill,
  Row,
  Rule,
  SectionHead,
  Stack,
  Stars,
  useMock,
} from "../primitives";

/* ---- shared product card ------------------------------------------------ */

function ProductCard({ p }: { p: MockProduct }) {
  const { tokens, fs } = useMock();
  return (
    <div style={{ position: "relative" }}>
      <MockImage seed={p.seed} ratio={p.ratio} />
      {p.badge && (
        <div style={{ position: "absolute", top: 10, left: 10 }}>
          <Pill tone="solid">{p.badge}</Pill>
        </div>
      )}
      <div style={{ marginTop: 10 }}>
        <div
          style={{
            fontFamily: tokens.fontBody,
            fontSize: fs(13),
            fontWeight: 600,
            lineHeight: 1.35,
          }}
        >
          {p.name}
        </div>
        <Row gap={8} style={{ marginTop: 4 }}>
          <span
            style={{
              fontFamily: tokens.fontBody,
              fontSize: fs(13),
              color: tokens.inkMuted,
            }}
          >
            {p.price}
          </span>
          {p.compareAt && (
            <span
              style={{
                fontFamily: tokens.fontBody,
                fontSize: fs(12),
                color: tokens.inkMuted,
                textDecoration: "line-through",
                opacity: 0.7,
              }}
            >
              {p.compareAt}
            </span>
          )}
        </Row>
      </div>
    </div>
  );
}

/* ---- CollectionHeader --------------------------------------------------- */

export function CollectionHeader({
  content,
}: {
  content: BlockContent["collectionHeader"];
}) {
  const { tokens, fs, bp, pick } = useMock();

  return (
    <Band band="base" tight>
      <Stack gap={16}>
        <Stack gap={8}>
          <Body size={12}>Home / {content.title}</Body>
          <Display size={pick(40, 34, 27)}>{content.title}</Display>
          <Body size={15} style={{ maxWidth: 520 }}>
            {content.description}
          </Body>
        </Stack>
        <Rule />
        <Row gap={10} wrap style={{ justifyContent: "space-between" }}>
          <Row gap={8} wrap>
            {content.filters
              .slice(0, bp === "mobile" ? 3 : content.filters.length)
              .map((f) => (
                <Pill key={f} tone="outline">
                  {f} ▾
                </Pill>
              ))}
          </Row>
          <Row gap={12}>
            <span
              style={{
                fontFamily: tokens.fontBody,
                fontSize: fs(12),
                color: tokens.inkMuted,
              }}
            >
              {content.resultCount}
            </span>
            <Pill tone="outline">{content.sortLabel}</Pill>
          </Row>
        </Row>
      </Stack>
    </Band>
  );
}

/* ---- ProductGrid -------------------------------------------------------- */

export function ProductGrid({
  content,
  band,
}: {
  content: BlockContent["productGrid"];
  band?: "base" | "alt" | "accent";
}) {
  const { pick } = useMock();
  const cols = pick(content.columns, 3, 2);

  return (
    <Band band={band}>
      <SectionHead title={content.title} sub={content.subtitle} />
      <Grid cols={cols}>
        {content.products.map((p) => (
          <ProductCard key={p.seed} p={p} />
        ))}
      </Grid>
    </Band>
  );
}

/* ---- ProductDetail ------------------------------------------------------ */

export function ProductDetail({
  content,
}: {
  content: BlockContent["productDetail"];
}) {
  const { tokens, fs, bp, pad, band, contentMax, gap } = useMock();
  const isMobile = bp === "mobile";

  const gallery = (
    <Stack gap={10}>
      <MockImage seed={`${content.seed}-0`} ratio={1.1} />
      <Grid cols={3} gap={10}>
        {Array.from({ length: content.galleryCount - 1 }, (_, i) => (
          <MockImage key={i} seed={`${content.seed}-${i + 1}`} ratio={1} />
        ))}
      </Grid>
    </Stack>
  );

  const info = (
    <Stack gap={16}>
      <Stack gap={8}>
        <Body size={12}>Home / Shop / {content.name}</Body>
        <Display size={isMobile ? 26 : 34}>{content.name}</Display>
        <Row gap={10}>
          <Stars rating={content.rating} />
          <Body size={12}>{content.reviewCount}</Body>
        </Row>
      </Stack>

      <Row gap={10}>
        <Display size={22} as="div">
          {content.price}
        </Display>
        {content.compareAt && (
          <span
            style={{
              fontFamily: tokens.fontBody,
              fontSize: fs(15),
              color: tokens.inkMuted,
              textDecoration: "line-through",
            }}
          >
            {content.compareAt}
          </span>
        )}
      </Row>

      <Rule />

      <Stack gap={8}>
        <div
          style={{
            fontFamily: tokens.fontBody,
            fontSize: fs(12),
            fontWeight: 600,
          }}
        >
          {content.variantLabel}
        </div>
        <Row gap={8} wrap>
          {content.variants.map((v, i) => (
            <span
              key={v}
              style={{
                fontFamily: tokens.fontBody,
                fontSize: fs(12),
                padding: "7px 13px",
                borderRadius: tokens.radius,
                borderWidth: i === 0 ? Math.max(2, tokens.borderWidth) : tokens.borderWidth,
                borderStyle: "solid",
                borderColor: i === 0 ? tokens.accent : tokens.border,
                color: i === 0 ? tokens.accent : tokens.inkMuted,
              }}
            >
              {v}
            </span>
          ))}
        </Row>
      </Stack>

      {content.sizes && (
        <Stack gap={8}>
          <Row gap={10} style={{ justifyContent: "space-between" }}>
            <div
              style={{
                fontFamily: tokens.fontBody,
                fontSize: fs(12),
                fontWeight: 600,
              }}
            >
              {content.sizeLabel}
            </div>
            <span
              style={{
                fontFamily: tokens.fontBody,
                fontSize: fs(11),
                color: tokens.accent,
                textDecoration: "underline",
              }}
            >
              Size guide
            </span>
          </Row>
          <Row gap={7} wrap>
            {content.sizes.map((s, i) => (
              <span
                key={s}
                style={{
                  fontFamily: tokens.fontBody,
                  fontSize: fs(12),
                  minWidth: 42,
                  textAlign: "center",
                  padding: "8px 4px",
                  borderRadius: tokens.radius,
                  borderWidth: tokens.borderWidth,
                  borderStyle: "solid",
                  borderColor: i === 2 ? tokens.accent : tokens.border,
                  color: i === 2 ? tokens.accent : tokens.inkMuted,
                  opacity: i === 4 ? 0.4 : 1,
                  textDecoration: i === 4 ? "line-through" : undefined,
                }}
              >
                {s}
              </span>
            ))}
          </Row>
        </Stack>
      )}

      <Stack gap={9}>
        <Btn label={content.cta} full size="lg" />
        <Btn label="Buy it now" variant="ghost" full size="lg" />
      </Stack>

      <Stack gap={7} style={{ marginTop: 4 }}>
        {content.bullets.map((b) => (
          <Row key={b} gap={9} style={{ alignItems: "flex-start" }}>
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: 999,
                background: tokens.accent,
                marginTop: 7,
                flexShrink: 0,
              }}
            />
            <Body size={13} style={{ flex: 1 }}>
              {b}
            </Body>
          </Row>
        ))}
      </Stack>
    </Stack>
  );

  return (
    <section
      style={{
        background: tokens.bg,
        color: tokens.ink,
        paddingLeft: pad,
        paddingRight: pad,
        paddingTop: Math.round(band * 0.6),
        paddingBottom: band,
      }}
    >
      <div
        style={{
          maxWidth: contentMax,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1.1fr 1fr",
          gap: isMobile ? 24 : Math.max(gap, 44),
          alignItems: "start",
        }}
      >
        {gallery}
        {info}
      </div>
    </section>
  );
}

/* ---- CartSummary -------------------------------------------------------- */

export function CartSummary({ content }: { content: BlockContent["cartSummary"] }) {
  const { tokens, fs, bp, pad, band, contentMax, gap } = useMock();
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
      <div style={{ maxWidth: contentMax, margin: "0 auto" }}>
        <Display size={isMobile ? 28 : 36} style={{ marginBottom: gap }}>
          {content.title}
        </Display>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1.5fr 1fr",
            gap: isMobile ? 24 : Math.max(gap, 36),
            alignItems: "start",
          }}
        >
          <Stack gap={0}>
            <Rule />
            {content.items.map((it, i) => (
              <div key={i}>
                <Row gap={14} style={{ padding: "16px 0", alignItems: "flex-start" }}>
                  <div style={{ width: isMobile ? 68 : 88, flexShrink: 0 }}>
                    <MockImage seed={`${content.title}-${i}`} ratio={1.1} />
                  </div>
                  <Stack gap={4} style={{ flex: 1 }}>
                    <div
                      style={{
                        fontFamily: tokens.fontBody,
                        fontSize: fs(13),
                        fontWeight: 600,
                      }}
                    >
                      {it.name}
                    </div>
                    <Body size={12}>{it.variant}</Body>
                    <Row gap={8} style={{ marginTop: 4 }}>
                      <span
                        style={{
                          fontFamily: tokens.fontBody,
                          fontSize: fs(12),
                          padding: "4px 10px",
                          borderWidth: tokens.borderWidth,
                          borderStyle: "solid",
                          borderColor: tokens.border,
                          borderRadius: tokens.radius,
                        }}
                      >
                        − {it.qty} +
                      </span>
                      <Body size={12}>Remove</Body>
                    </Row>
                  </Stack>
                  <div
                    style={{
                      fontFamily: tokens.fontBody,
                      fontSize: fs(13),
                      fontWeight: 600,
                    }}
                  >
                    {it.price}
                  </div>
                </Row>
                <Rule />
              </div>
            ))}
          </Stack>

          <Card pad={20}>
            <Stack gap={11}>
              {content.rows.map((r) => (
                <Row key={r.label} style={{ justifyContent: "space-between" }}>
                  <Body size={13}>{r.label}</Body>
                  <span
                    style={{
                      fontFamily: tokens.fontBody,
                      fontSize: fs(13),
                      fontWeight: 500,
                    }}
                  >
                    {r.value}
                  </span>
                </Row>
              ))}
              <Rule />
              <Row style={{ justifyContent: "space-between" }}>
                <Display size={16} as="div">
                  {content.total.label}
                </Display>
                <Display size={16} as="div">
                  {content.total.value}
                </Display>
              </Row>
              <Btn label={content.cta} full size="lg" />
              <Body size={11}>{content.note}</Body>
            </Stack>
          </Card>
        </div>
      </div>
    </section>
  );
}

/* ---- SearchResults ------------------------------------------------------ */

export function SearchResults({
  content,
}: {
  content: BlockContent["searchResults"];
}) {
  const { tokens, fs, pick } = useMock();

  return (
    <Band band="base" tight>
      <Stack gap={18}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            height: 50,
            paddingLeft: 16,
            paddingRight: 16,
            borderWidth: tokens.borderWidth,
            borderStyle: "solid",
            borderColor: tokens.border,
            borderRadius: tokens.radiusPill || tokens.radius,
          }}
        >
          <span style={{ color: tokens.inkMuted, fontSize: fs(14) }}>⌕</span>
          <span
            style={{
              fontFamily: tokens.fontBody,
              fontSize: fs(14),
              fontWeight: 500,
            }}
          >
            {content.query}
          </span>
        </div>

        <Row gap={8} wrap>
          {content.suggestions.map((s) => (
            <Pill key={s} tone="outline">
              {s}
            </Pill>
          ))}
        </Row>

        <Body size={13}>{content.resultCount}</Body>

        <Grid cols={pick(4, 3, 2)}>
          {content.products.map((p) => (
            <ProductCard key={p.seed} p={p} />
          ))}
        </Grid>
      </Stack>
    </Band>
  );
}

/* ---- BundleBuilder ------------------------------------------------------ */

export function BundleBuilder({
  content,
  band,
}: {
  content: BlockContent["bundleBuilder"];
  band?: "base" | "alt" | "accent";
}) {
  const { tokens, fs, pick, gap } = useMock();

  return (
    <Band band={band}>
      <SectionHead title={content.title} sub={content.sub} align="center" />
      <Grid cols={pick(3, 3, 1)}>
        {content.items.map((p, i) => (
          <Card key={p.seed} pad={14}>
            <Stack gap={10}>
              <MockImage seed={p.seed} ratio={1} />
              <Row style={{ justifyContent: "space-between" }}>
                <div
                  style={{
                    fontFamily: tokens.fontBody,
                    fontSize: fs(13),
                    fontWeight: 600,
                  }}
                >
                  {p.name}
                </div>
                <Body size={12}>{p.price}</Body>
              </Row>
              <Btn
                label={i < 3 ? "Selected" : "Choose"}
                variant={i < 3 ? "primary" : "ghost"}
                full
                size="sm"
              />
            </Stack>
          </Card>
        ))}
      </Grid>

      <Card pad={20} band="accent" style={{ marginTop: gap }}>
        <Row gap={16} wrap style={{ justifyContent: "space-between" }}>
          <Stack gap={4}>
            <Body size={12}>{content.totalLabel}</Body>
            <Row gap={10}>
              <Display size={26} as="div">
                {content.totalValue}
              </Display>
              <Pill tone="solid">{content.savingLabel}</Pill>
            </Row>
          </Stack>
          <Btn label={content.cta} size="lg" />
        </Row>
      </Card>
    </Band>
  );
}

/* ---- UpsellOffer -------------------------------------------------------- */

export function UpsellOffer({ content }: { content: BlockContent["upsellOffer"] }) {
  const { tokens, bp, pad, band, contentMax, gap } = useMock();
  const isMobile = bp === "mobile";

  return (
    <section
      style={{
        background: tokens.accent,
        color: tokens.accentInk,
        paddingLeft: pad,
        paddingRight: pad,
        paddingTop: band,
        paddingBottom: band,
      }}
    >
      <div
        style={{
          maxWidth: Math.min(contentMax, 900),
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1.1fr",
          gap: isMobile ? 22 : Math.max(gap, 36),
          alignItems: "center",
        }}
      >
        <MockImage
          seed={content.product.seed}
          ratio={1}
          style={{ borderRadius: tokens.radiusLg }}
        />
        <Stack gap={14}>
          <div
            style={{
              fontFamily: tokens.fontBody,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              opacity: 0.75,
            }}
          >
            {content.eyebrow}
          </div>
          <Display size={isMobile ? 26 : 34} style={{ color: tokens.accentInk }}>
            {content.headline}
          </Display>
          <Body size={14} muted={false} style={{ opacity: 0.82 }}>
            {content.body}
          </Body>
          <Row gap={10}>
            <Display size={22} as="div" style={{ color: tokens.accentInk }}>
              {content.product.price}
            </Display>
            <Body size={13} muted={false} style={{ opacity: 0.72 }}>
              {content.timerLabel}
            </Body>
          </Row>
          <Stack gap={8}>
            <Btn label={content.cta} variant="onAccent" full size="lg" />
            <div
              style={{
                fontFamily: tokens.fontBody,
                fontSize: 12,
                textAlign: "center",
                opacity: 0.7,
                textDecoration: "underline",
              }}
            >
              {content.decline}
            </div>
          </Stack>
        </Stack>
      </div>
    </section>
  );
}

/* ---- GiftCardPicker ---------------------------------------------------- */

export function GiftCardPicker({
  content,
}: {
  content: BlockContent["giftCardPicker"];
}) {
  const { tokens, fs, bp, pad, band, contentMax, gap } = useMock();
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
      <div
        style={{
          maxWidth: contentMax,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: isMobile ? 24 : Math.max(gap, 40),
          alignItems: "start",
        }}
      >
        <MockImage
          seed={content.seed}
          ratio={0.68}
          style={{ borderRadius: tokens.radiusLg }}
          label="Digital gift card"
        />
        <Stack gap={16}>
          <Stack gap={8}>
            <Eyebrow>Gift</Eyebrow>
            <Display size={isMobile ? 28 : 34}>{content.headline}</Display>
            <Body size={14}>{content.body}</Body>
          </Stack>

          <Stack gap={8}>
            <div
              style={{
                fontFamily: tokens.fontBody,
                fontSize: fs(12),
                fontWeight: 600,
              }}
            >
              Amount
            </div>
            <Row gap={8} wrap>
              {content.amounts.map((a, i) => (
                <span
                  key={a}
                  style={{
                    fontFamily: tokens.fontBody,
                    fontSize: fs(13),
                    fontWeight: 600,
                    padding: "10px 16px",
                    borderRadius: tokens.radius,
                    borderWidth:
                      i === content.selected
                        ? Math.max(2, tokens.borderWidth)
                        : tokens.borderWidth,
                    borderStyle: "solid",
                    borderColor:
                      i === content.selected ? tokens.accent : tokens.border,
                    color: i === content.selected ? tokens.accent : tokens.inkMuted,
                    background:
                      i === content.selected ? tokens.accentSoft : "transparent",
                  }}
                >
                  {a}
                </span>
              ))}
            </Row>
          </Stack>

          <Grid cols={isMobile ? 1 : 2} gap={12}>
            {content.fields.map((f) => (
              <Field key={f.label} label={f.label} wide={f.wide} />
            ))}
          </Grid>

          <Btn label={content.cta} full size="lg" />
        </Stack>
      </div>
    </section>
  );
}
