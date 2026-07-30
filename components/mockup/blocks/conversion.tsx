"use client";

import type { BlockContent } from "@/lib/generate/types";
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
  useMock,
} from "../primitives";

/* ---- PromoBanner -------------------------------------------------------- */

export function PromoBanner({
  content,
}: {
  content: BlockContent["promoBanner"];
}) {
  const { tokens, bp, pad, contentMax } = useMock();
  const onAccent = content.tone === "accent";
  const isMobile = bp === "mobile";

  return (
    <section
      style={{
        background: onAccent ? tokens.accent : tokens.ink,
        color: onAccent ? tokens.accentInk : tokens.bg,
        paddingLeft: pad,
        paddingRight: pad,
        paddingTop: isMobile ? 22 : 28,
        paddingBottom: isMobile ? 22 : 28,
      }}
    >
      <div
        style={{
          maxWidth: contentMax,
          margin: "0 auto",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <Stack gap={4}>
          <Display size={isMobile ? 19 : 24} as="div" style={{ color: "inherit" }}>
            {content.headline}
          </Display>
          {content.sub && (
            <Body size={13} muted={false} style={{ opacity: 0.75 }}>
              {content.sub}
            </Body>
          )}
        </Stack>
        <Btn label={content.cta} variant={onAccent ? "onAccent" : "primary"} />
      </div>
    </section>
  );
}

/* ---- Countdown ---------------------------------------------------------- */

export function Countdown({ content }: { content: BlockContent["countdown"] }) {
  const { tokens, fs, bp, pad, contentMax } = useMock();
  const isMobile = bp === "mobile";
  // Fixed digits — a mockup must not imply a running timer.
  const values = ["02", "14", "39", "06"];

  return (
    <section
      style={{
        background: tokens.accent,
        color: tokens.accentInk,
        paddingLeft: pad,
        paddingRight: pad,
        paddingTop: isMobile ? 30 : 44,
        paddingBottom: isMobile ? 30 : 44,
      }}
    >
      <div
        style={{
          maxWidth: contentMax,
          margin: "0 auto",
          display: "grid",
          gap: 18,
          justifyItems: "center",
          textAlign: "center",
        }}
      >
        <Display size={isMobile ? 22 : 28} style={{ color: tokens.accentInk }}>
          {content.headline}
        </Display>
        <Row gap={isMobile ? 8 : 14}>
          {values.map((v, i) => (
            <Stack key={i} gap={6} style={{ justifyItems: "center" }}>
              <div
                style={{
                  minWidth: isMobile ? 56 : 84,
                  padding: isMobile ? "12px 8px" : "18px 14px",
                  background: tokens.accentInk,
                  color: tokens.accent,
                  borderRadius: tokens.radius,
                  fontFamily: tokens.fontDisplay,
                  fontWeight: 700,
                  fontSize: fs(isMobile ? 26 : 38),
                  lineHeight: 1,
                }}
              >
                {v}
              </div>
              <div
                style={{
                  fontFamily: tokens.fontBody,
                  fontSize: fs(10.5),
                  fontWeight: 600,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  opacity: 0.8,
                }}
              >
                {content.units[i]}
              </div>
            </Stack>
          ))}
        </Row>
        {content.sub && (
          <Body size={13} muted={false} style={{ opacity: 0.78, maxWidth: 420 }}>
            {content.sub}
          </Body>
        )}
      </div>
    </section>
  );
}

/* ---- FaqAccordion ------------------------------------------------------- */

export function FaqAccordion({
  content,
  band,
}: {
  content: BlockContent["faqAccordion"];
  band?: "base" | "alt" | "accent";
}) {
  const { tokens, fs } = useMock();

  return (
    <Band band={band}>
      <div style={{ maxWidth: 760, marginLeft: "auto", marginRight: "auto" }}>
        <SectionHead title={content.title} align="center" />
        <Card pad={0} style={{ overflow: "hidden" }}>
          {content.items.map((item, i) => {
            const open = i === content.openIndex;
            return (
              <div key={item.q}>
                {i > 0 && <Rule />}
                <div style={{ padding: "16px 20px" }}>
                  <Row gap={14} style={{ justifyContent: "space-between" }}>
                    <div
                      style={{
                        fontFamily: tokens.fontBody,
                        fontSize: fs(14.5),
                        fontWeight: 600,
                        color: open ? tokens.accent : tokens.ink,
                      }}
                    >
                      {item.q}
                    </div>
                    <span
                      style={{
                        color: open ? tokens.accent : tokens.inkMuted,
                        fontSize: fs(16),
                        lineHeight: 1,
                        flexShrink: 0,
                      }}
                    >
                      {open ? "−" : "+"}
                    </span>
                  </Row>
                  {open && (
                    <Body size={13.5} style={{ marginTop: 10, maxWidth: 620 }}>
                      {item.a}
                    </Body>
                  )}
                </div>
              </div>
            );
          })}
        </Card>
      </div>
    </Band>
  );
}

/* ---- PricingTiers ------------------------------------------------------- */

export function PricingTiers({
  content,
  band,
}: {
  content: BlockContent["pricingTiers"];
  band?: "base" | "alt" | "accent";
}) {
  const { tokens, fs, pick } = useMock();

  return (
    <Band band={band}>
      <SectionHead title={content.title} sub={content.sub} align="center" />
      <Grid cols={pick(3, 3, 1)}>
        {content.tiers.map((t) => (
          <Card
            key={t.name}
            pad={22}
            style={{
              borderColor: t.featured ? tokens.accent : tokens.border,
              borderWidth: t.featured
                ? Math.max(2, tokens.borderWidth)
                : tokens.borderWidth,
              position: "relative",
            }}
          >
            {t.featured && (
              <div style={{ position: "absolute", top: -11, left: 20 }}>
                <Pill tone="solid">Most popular</Pill>
              </div>
            )}
            <Stack gap={14}>
              <Stack gap={6}>
                <Display size={16} as="h3">
                  {t.name}
                </Display>
                <Row gap={6} style={{ alignItems: "baseline" }}>
                  <Display size={34} as="div">
                    {t.price}
                  </Display>
                  <Body size={12}>{t.period}</Body>
                </Row>
              </Stack>
              <Rule />
              <Stack gap={9}>
                {t.features.map((f) => (
                  <Row key={f} gap={9} style={{ alignItems: "flex-start" }}>
                    <span
                      style={{
                        color: tokens.accent,
                        fontSize: fs(12),
                        lineHeight: 1.5,
                        flexShrink: 0,
                      }}
                    >
                      ✓
                    </span>
                    <Body size={13}>{f}</Body>
                  </Row>
                ))}
              </Stack>
              <Btn
                label={t.cta}
                variant={t.featured ? "primary" : "ghost"}
                full
              />
            </Stack>
          </Card>
        ))}
      </Grid>
    </Band>
  );
}

/* ---- QuizStep ----------------------------------------------------------- */

export function QuizStep({ content }: { content: BlockContent["quizStep"] }) {
  const { tokens, fs, bp } = useMock();
  const isMobile = bp === "mobile";
  const pct = (content.step / content.total) * 100;

  return (
    <Band band="base">
      <div style={{ maxWidth: 620, marginLeft: "auto", marginRight: "auto" }}>
        <Stack gap={22}>
          <Stack gap={10}>
            <Row style={{ justifyContent: "space-between" }}>
              <Eyebrow>
                Step {content.step} of {content.total}
              </Eyebrow>
              <Body size={12}>{Math.round(pct)}%</Body>
            </Row>
            <div
              style={{
                height: 4,
                borderRadius: 999,
                background: tokens.accentSoft,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${pct}%`,
                  height: "100%",
                  background: tokens.accent,
                }}
              />
            </div>
          </Stack>

          <Display size={isMobile ? 26 : 33}>{content.question}</Display>

          <Stack gap={10}>
            {content.options.map((o, i) => {
              const on = i === content.selected;
              return (
                <div
                  key={o.label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "15px 18px",
                    borderRadius: tokens.radiusLg,
                    borderWidth: on
                      ? Math.max(2, tokens.borderWidth)
                      : tokens.borderWidth,
                    borderStyle: "solid",
                    borderColor: on ? tokens.accent : tokens.border,
                    background: on ? tokens.accentSoft : tokens.surface,
                  }}
                >
                  <div
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 999,
                      borderWidth: 2,
                      borderStyle: "solid",
                      borderColor: on ? tokens.accent : tokens.border,
                      display: "grid",
                      placeItems: "center",
                      flexShrink: 0,
                    }}
                  >
                    {on && (
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 999,
                          background: tokens.accent,
                        }}
                      />
                    )}
                  </div>
                  <Stack gap={2} style={{ flex: 1 }}>
                    <div
                      style={{
                        fontFamily: tokens.fontBody,
                        fontSize: fs(14),
                        fontWeight: 600,
                        color: on ? tokens.accent : tokens.ink,
                      }}
                    >
                      {o.label}
                    </div>
                    {o.hint && <Body size={12}>{o.hint}</Body>}
                  </Stack>
                </div>
              );
            })}
          </Stack>

          <Row gap={10} style={{ justifyContent: "space-between" }}>
            <Btn label="Back" variant="ghost" />
            <Btn label="Next question" size="lg" />
          </Row>
        </Stack>
      </div>
    </Band>
  );
}

/* ---- LeadForm ----------------------------------------------------------- */

export function LeadForm({
  content,
  band,
}: {
  content: BlockContent["leadForm"];
  band?: "base" | "alt" | "accent";
}) {
  const { tokens, bp, pad, band: bandPad, contentMax, gap } = useMock();
  const isMobile = bp === "mobile";
  const bg = band === "alt" ? tokens.surfaceAlt : tokens.bg;

  const form = (
    <Card pad={isMobile ? 18 : 24}>
      <Stack gap={14}>
        <Grid cols={isMobile ? 1 : 2} gap={13}>
          {content.fields.map((f) => (
            <Field key={f.label} label={f.label} wide={f.wide} />
          ))}
        </Grid>
        <Btn label={content.cta} full size="lg" />
        {content.note && <Body size={11}>{content.note}</Body>}
      </Stack>
    </Card>
  );

  if (content.layout === "centered") {
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
        <div style={{ maxWidth: 520, margin: "0 auto" }}>
          <Stack gap={16} style={{ textAlign: "center", justifyItems: "center" }}>
            {content.eyebrow && <Eyebrow>{content.eyebrow}</Eyebrow>}
            <Display size={isMobile ? 27 : 34}>{content.headline}</Display>
            <Body size={14.5}>{content.body}</Body>
            <div style={{ width: "100%", textAlign: "left", marginTop: 4 }}>
              {form}
            </div>
          </Stack>
        </div>
      </section>
    );
  }

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
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1.05fr",
          gap: isMobile ? 22 : Math.max(gap, 40),
          alignItems: "center",
        }}
      >
        <Stack gap={14}>
          {content.eyebrow && <Eyebrow>{content.eyebrow}</Eyebrow>}
          <Display size={isMobile ? 27 : 36}>{content.headline}</Display>
          <Body size={15} style={{ maxWidth: 420 }}>
            {content.body}
          </Body>
          <MockImage
            seed={content.seed}
            ratio={0.5}
            style={{ marginTop: 6, borderRadius: tokens.radiusLg }}
          />
        </Stack>
        {form}
      </div>
    </section>
  );
}

/* ---- ThankYouPanel ------------------------------------------------------ */

export function ThankYouPanel({
  content,
}: {
  content: BlockContent["thankYouPanel"];
}) {
  const { tokens, fs, bp } = useMock();
  const isMobile = bp === "mobile";

  return (
    <Band band="base">
      <div style={{ maxWidth: 640, marginLeft: "auto", marginRight: "auto" }}>
        <Stack gap={18} style={{ justifyItems: "center", textAlign: "center" }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 999,
              background: tokens.accentSoft,
              color: tokens.accent,
              display: "grid",
              placeItems: "center",
              fontSize: fs(24),
              fontWeight: 700,
            }}
          >
            ✓
          </div>
          <Display size={isMobile ? 29 : 40} as="h1">
            {content.headline}
          </Display>
          <Body size={15} style={{ maxWidth: 460 }}>
            {content.body}
          </Body>
          <Pill tone="outline">Order {content.orderId}</Pill>

          <Grid cols={isMobile ? 1 : 3} gap={13} style={{ width: "100%", marginTop: 8 }}>
            {content.steps.map((s, i) => (
              <Card key={s.label} pad={16} style={{ textAlign: "left" }}>
                <Stack gap={6}>
                  <Eyebrow>{String(i + 1).padStart(2, "0")}</Eyebrow>
                  <div
                    style={{
                      fontFamily: tokens.fontBody,
                      fontSize: fs(13.5),
                      fontWeight: 600,
                    }}
                  >
                    {s.label}
                  </div>
                  <Body size={12}>{s.detail}</Body>
                </Stack>
              </Card>
            ))}
          </Grid>

          <Btn label={content.cta} size="lg" />
        </Stack>
      </div>
    </Band>
  );
}
