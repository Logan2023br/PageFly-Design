"use client";

import type { BlockContent } from "@/lib/generate/types";
import {
  Body,
  Btn,
  Content,
  Display,
  Field,
  Grid,
  Row,
  Rule,
  Stack,
  useMock,
} from "../primitives";

/* ---- NavBar ------------------------------------------------------------- */

export function NavBar({ content }: { content: BlockContent["nav"] }) {
  const { tokens, fs, pad, bp, contentMax } = useMock();
  const isMobile = bp === "mobile";

  return (
    <header style={{ background: tokens.bg, color: tokens.ink }}>
      {content.announcement && (
        <div
          style={{
            background: tokens.accent,
            color: tokens.accentInk,
            textAlign: "center",
            fontFamily: tokens.fontBody,
            fontSize: fs(11),
            fontWeight: 600,
            padding: "8px 12px",
            letterSpacing: "0.01em",
          }}
        >
          {content.announcement}
        </div>
      )}
      <div style={{ paddingLeft: pad, paddingRight: pad }}>
        <div
          style={{
            maxWidth: contentMax,
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            height: isMobile ? 56 : 68,
          }}
        >
          <Display size={17} as="div" style={{ letterSpacing: tokens.tracking }}>
            {content.brand}
          </Display>

          {!isMobile && (
            <nav style={{ display: "flex", gap: 26 }}>
              {content.links.map((l) => (
                <span
                  key={l}
                  style={{
                    fontFamily: tokens.fontBody,
                    fontSize: fs(13),
                    fontWeight: 500,
                    color: tokens.inkMuted,
                  }}
                >
                  {l}
                </span>
              ))}
            </nav>
          )}

          <Row gap={12}>
            {content.ctaLabel && !isMobile ? (
              <Btn label={content.ctaLabel} size="sm" />
            ) : null}
            {!isMobile && (
              <span
                style={{
                  fontFamily: tokens.fontBody,
                  fontSize: fs(12),
                  color: tokens.inkMuted,
                }}
              >
                Search
              </span>
            )}
            <span
              style={{
                fontFamily: tokens.fontBody,
                fontSize: fs(12),
                fontWeight: 600,
              }}
            >
              Cart ({content.cartCount})
            </span>
            {isMobile && (
              <Stack gap={4} style={{ width: 18 }}>
                <Rule />
                <Rule />
                <Rule />
              </Stack>
            )}
          </Row>
        </div>
      </div>
      <Rule />
    </header>
  );
}

/* ---- Footer ------------------------------------------------------------- */

export function Footer({ content }: { content: BlockContent["footer"] }) {
  const { tokens, fs, pad, band, pick } = useMock();

  return (
    <footer
      style={{
        background: tokens.surfaceAlt,
        color: tokens.ink,
        paddingLeft: pad,
        paddingRight: pad,
        paddingTop: band,
        paddingBottom: Math.round(band * 0.6),
      }}
    >
      <Content>
        <Grid cols={pick(4, 2, 1)} gap={28}>
          <Stack gap={12}>
            <Display size={19} as="div">
              {content.brand}
            </Display>
            <Body size={13}>{content.blurb}</Body>
            {content.newsletterLabel && (
              <Stack gap={8} style={{ marginTop: 6 }}>
                <Field label={content.newsletterLabel} wide />
                <Btn label="Subscribe" size="sm" />
              </Stack>
            )}
          </Stack>

          {content.columns.map((col) => (
            <Stack key={col.title} gap={10}>
              <div
                style={{
                  fontFamily: tokens.fontBody,
                  fontSize: fs(11),
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                }}
              >
                {col.title}
              </div>
              {col.links.map((l) => (
                <span
                  key={l}
                  style={{
                    fontFamily: tokens.fontBody,
                    fontSize: fs(13),
                    color: tokens.inkMuted,
                  }}
                >
                  {l}
                </span>
              ))}
            </Stack>
          ))}
        </Grid>

        <Rule style={{ marginTop: 32, marginBottom: 18 }} />
        <Row gap={14} wrap style={{ justifyContent: "space-between" }}>
          <Body size={12}>{content.note}</Body>
          <Row gap={14}>
            {["Terms", "Privacy", "Cookies"].map((l) => (
              <span
                key={l}
                style={{
                  fontFamily: tokens.fontBody,
                  fontSize: fs(12),
                  color: tokens.inkMuted,
                }}
              >
                {l}
              </span>
            ))}
          </Row>
        </Row>
      </Content>
    </footer>
  );
}
