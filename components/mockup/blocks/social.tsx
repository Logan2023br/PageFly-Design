"use client";

import type { BlockContent } from "@/lib/generate/types";
import {
  Band,
  Body,
  Card,
  Display,
  Grid,
  MockImage,
  Row,
  Stack,
  Stars,
  SectionHead,
  useMock,
} from "../primitives";

/* ---- LogoStrip ---------------------------------------------------------- */

export function LogoStrip({
  content,
  band,
}: {
  content: BlockContent["logoStrip"];
  band?: "base" | "alt" | "accent";
}) {
  const { tokens, fs, bp } = useMock();

  return (
    <Band band={band} tight>
      <Stack gap={16} style={{ justifyItems: "center" }}>
        {content.label && (
          <div
            style={{
              fontFamily: tokens.fontBody,
              fontSize: fs(11),
              fontWeight: 600,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: tokens.inkMuted,
            }}
          >
            {content.label}
          </div>
        )}
        <Row
          gap={bp === "mobile" ? 20 : 44}
          wrap
          style={{ justifyContent: "center" }}
        >
          {content.names.map((n) => (
            <span
              key={n}
              style={{
                fontFamily: tokens.fontDisplay,
                fontSize: fs(bp === "mobile" ? 13 : 17),
                fontWeight: 700,
                letterSpacing: "0.08em",
                color: tokens.ink,
                opacity: 0.42,
              }}
            >
              {n}
            </span>
          ))}
        </Row>
      </Stack>
    </Band>
  );
}

/* ---- StatsRow ----------------------------------------------------------- */

export function StatsRow({
  content,
  band,
}: {
  content: BlockContent["statsRow"];
  band?: "base" | "alt" | "accent";
}) {
  const { tokens, pick } = useMock();

  return (
    <Band band={band} tight>
      <Grid cols={pick(4, 2, 2)}>
        {content.items.map((s) => (
          <Stack key={s.label} gap={6}>
            <Display size={34} as="div" style={{ color: tokens.accent }}>
              {s.value}
            </Display>
            <Body size={12.5}>{s.label}</Body>
          </Stack>
        ))}
      </Grid>
    </Band>
  );
}

/* ---- Testimonials ------------------------------------------------------- */

export function Testimonials({
  content,
  band,
}: {
  content: BlockContent["testimonials"];
  band?: "base" | "alt" | "accent";
}) {
  const { tokens, fs, pick } = useMock();

  return (
    <Band band={band}>
      <SectionHead title={content.title} align="center" />
      <Grid cols={pick(3, 2, 1)}>
        {content.items.map((t, i) => (
          <Card key={i} pad={20}>
            <Stack gap={13}>
              <Stars rating={t.rating} size={13} />
              <Body
                size={14.5}
                muted={false}
                style={{ color: tokens.ink, lineHeight: 1.55 }}
              >
                “{t.quote}”
              </Body>
              <Row gap={10}>
                <div style={{ width: 30, flexShrink: 0 }}>
                  <MockImage seed={`avatar-${t.author}`} ratio={1} radius={999} />
                </div>
                <Stack gap={1}>
                  <div
                    style={{
                      fontFamily: tokens.fontBody,
                      fontSize: fs(12.5),
                      fontWeight: 600,
                    }}
                  >
                    {t.author}
                  </div>
                  <Body size={11}>{t.role}</Body>
                </Stack>
              </Row>
            </Stack>
          </Card>
        ))}
      </Grid>
    </Band>
  );
}
