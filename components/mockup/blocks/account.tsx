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
  Stack,
  useMock,
} from "../primitives";

/* ---- AccountPanel ------------------------------------------------------- */

export function AccountPanel({
  content,
}: {
  content: BlockContent["accountPanel"];
}) {
  const { tokens, fs, bp } = useMock();
  const isMobile = bp === "mobile";

  if (content.mode === "auth") {
    return (
      <Band band="base">
        <div style={{ maxWidth: 400, marginLeft: "auto", marginRight: "auto" }}>
          <Card pad={isMobile ? 20 : 28}>
            <Stack gap={18}>
              <Row gap={0} style={{ borderRadius: tokens.radius, overflow: "hidden" }}>
                {content.tabs.map((t, i) => (
                  <div
                    key={t}
                    style={{
                      flex: 1,
                      textAlign: "center",
                      padding: "10px 8px",
                      fontFamily: tokens.fontBody,
                      fontSize: fs(12.5),
                      fontWeight: 600,
                      background: i === 0 ? tokens.accent : "transparent",
                      color: i === 0 ? tokens.accentInk : tokens.inkMuted,
                      borderWidth: tokens.borderWidth,
                      borderStyle: "solid",
                      borderColor: tokens.border,
                    }}
                  >
                    {t}
                  </div>
                ))}
              </Row>

              <Stack gap={6}>
                <Display size={22}>{content.title}</Display>
                {content.sub && <Body size={13}>{content.sub}</Body>}
              </Stack>

              <Stack gap={12}>
                {content.fields?.map((f) => (
                  <Field key={f.label} label={f.label} wide />
                ))}
              </Stack>

              <Stack gap={10}>
                <Btn label={content.cta ?? "Sign in"} full size="lg" />
                <Body size={11.5} style={{ textAlign: "center" }}>
                  Forgot your password?
                </Body>
              </Stack>
            </Stack>
          </Card>
        </div>
      </Band>
    );
  }

  return (
    <Band band="base" tight>
      <Stack gap={20}>
        <Stack gap={6}>
          <Display size={isMobile ? 28 : 36}>{content.title}</Display>
          {content.sub && <Body size={14}>{content.sub}</Body>}
        </Stack>

        <Row gap={8} wrap>
          {content.tabs.map((t, i) => (
            <Pill key={t} tone={i === 0 ? "solid" : "outline"}>
              {t}
            </Pill>
          ))}
        </Row>

        <Card pad={0} style={{ overflow: "hidden" }}>
          {content.orders?.map((o, i) => (
            <div key={o.id}>
              {i > 0 && <Rule />}
              <Row
                gap={14}
                wrap={isMobile}
                style={{
                  padding: isMobile ? "13px 15px" : "16px 20px",
                  justifyContent: "space-between",
                }}
              >
                <Stack gap={3}>
                  <div
                    style={{
                      fontFamily: tokens.fontBody,
                      fontSize: fs(13.5),
                      fontWeight: 600,
                    }}
                  >
                    {o.id}
                  </div>
                  <Body size={12}>{o.date}</Body>
                </Stack>
                <Row gap={14}>
                  <Pill tone={o.status === "Delivered" ? "soft" : "outline"}>
                    {o.status}
                  </Pill>
                  <span
                    style={{
                      fontFamily: tokens.fontBody,
                      fontSize: fs(13),
                      fontWeight: 600,
                    }}
                  >
                    {o.total}
                  </span>
                  <Btn label="View" variant="ghost" size="sm" />
                </Row>
              </Row>
            </div>
          ))}
        </Card>
      </Stack>
    </Band>
  );
}

/* ---- OrderTracker ------------------------------------------------------- */

export function OrderTracker({
  content,
  band,
}: {
  content: BlockContent["orderTracker"];
  band?: "base" | "alt" | "accent";
}) {
  const { tokens, fs, bp } = useMock();
  const isMobile = bp === "mobile";

  return (
    <Band band={band}>
      <div style={{ maxWidth: 780, marginLeft: "auto", marginRight: "auto" }}>
        <Stack gap={22}>
          <Row gap={14} wrap style={{ justifyContent: "space-between" }}>
            <Stack gap={5}>
              <Eyebrow>Order {content.orderId}</Eyebrow>
              <Display size={isMobile ? 26 : 33}>{content.eta}</Display>
            </Stack>
            <Btn label="Contact support" variant="ghost" />
          </Row>

          <Card pad={isMobile ? 18 : 24}>
            <div
              style={{
                display: isMobile ? "grid" : "flex",
                gap: isMobile ? 16 : 0,
                alignItems: isMobile ? "start" : "flex-start",
              }}
            >
              {content.steps.map((s, i) => (
                <div
                  key={s.label}
                  style={{
                    display: "flex",
                    flexDirection: isMobile ? "row" : "column",
                    gap: isMobile ? 12 : 10,
                    flex: 1,
                    position: "relative",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexDirection: isMobile ? "column" : "row",
                      alignItems: "center",
                      width: isMobile ? 18 : "100%",
                      gap: 0,
                    }}
                  >
                    <div
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: 999,
                        flexShrink: 0,
                        background: s.done ? tokens.accent : "transparent",
                        borderWidth: 2,
                        borderStyle: "solid",
                        borderColor: s.done ? tokens.accent : tokens.border,
                        display: "grid",
                        placeItems: "center",
                        color: tokens.accentInk,
                        fontSize: 9,
                        fontWeight: 700,
                      }}
                    >
                      {s.done ? "✓" : ""}
                    </div>
                    {i < content.steps.length - 1 && (
                      <div
                        style={{
                          flex: 1,
                          width: isMobile ? 2 : "auto",
                          minHeight: isMobile ? 26 : 2,
                          height: isMobile ? "auto" : 2,
                          background: content.steps[i + 1].done
                            ? tokens.accent
                            : tokens.border,
                          marginLeft: isMobile ? 0 : 4,
                          marginRight: isMobile ? 0 : 4,
                        }}
                      />
                    )}
                  </div>
                  <Stack gap={2} style={{ paddingRight: 8 }}>
                    <div
                      style={{
                        fontFamily: tokens.fontBody,
                        fontSize: fs(12.5),
                        fontWeight: 600,
                        color: s.done ? tokens.ink : tokens.inkMuted,
                      }}
                    >
                      {s.label}
                    </div>
                    <Body size={11}>{s.detail}</Body>
                  </Stack>
                </div>
              ))}
            </div>
          </Card>

          <Card pad={0} style={{ overflow: "hidden" }}>
            {content.items.map((it, i) => (
              <div key={it.seed}>
                {i > 0 && <Rule />}
                <Row gap={13} style={{ padding: "13px 16px" }}>
                  <div style={{ width: 46, flexShrink: 0 }}>
                    <MockImage seed={it.seed} ratio={1} />
                  </div>
                  <Stack gap={2} style={{ flex: 1 }}>
                    <div
                      style={{
                        fontFamily: tokens.fontBody,
                        fontSize: fs(13),
                        fontWeight: 600,
                      }}
                    >
                      {it.name}
                    </div>
                    <Body size={11.5}>Quantity {it.qty}</Body>
                  </Stack>
                </Row>
              </div>
            ))}
          </Card>
        </Stack>
      </div>
    </Band>
  );
}

/* ---- ContactPanel ------------------------------------------------------- */

export function ContactPanel({
  content,
  band,
}: {
  content: BlockContent["contactPanel"];
  band?: "base" | "alt" | "accent";
}) {
  const { tokens, fs, bp, pad, band: bandPad, contentMax, gap } = useMock();
  const isMobile = bp === "mobile";
  const bg = band === "alt" ? tokens.surfaceAlt : tokens.bg;

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
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1.15fr",
          gap: isMobile ? 24 : Math.max(gap, 40),
          alignItems: "start",
        }}
      >
        <Stack gap={16}>
          <Display size={isMobile ? 27 : 35}>{content.headline}</Display>
          <Body size={14.5} style={{ maxWidth: 380 }}>
            {content.body}
          </Body>
          <Stack gap={0} style={{ marginTop: 4 }}>
            {content.methods.map((m, i) => (
              <div key={m.label}>
                {i > 0 && <Rule />}
                <Row gap={12} style={{ padding: "12px 0", justifyContent: "space-between" }}>
                  <Body size={12.5}>{m.label}</Body>
                  <span
                    style={{
                      fontFamily: tokens.fontBody,
                      fontSize: fs(12.5),
                      fontWeight: 600,
                    }}
                  >
                    {m.value}
                  </span>
                </Row>
              </div>
            ))}
          </Stack>
          {content.hasMap && (
            <MockImage
              seed={`${content.headline}-map`}
              ratio={0.56}
              style={{ borderRadius: tokens.radiusLg }}
              label="Store location"
            />
          )}
        </Stack>

        <Card pad={isMobile ? 18 : 24}>
          <Stack gap={14}>
            <Grid cols={isMobile ? 1 : 2} gap={13}>
              {content.fields.map((f) => (
                <Field key={f.label} label={f.label} wide={f.wide} />
              ))}
            </Grid>
            <Btn label={content.cta} full size="lg" />
          </Stack>
        </Card>
      </div>
    </section>
  );
}

/* ---- EmptyState --------------------------------------------------------- */

export function EmptyState({ content }: { content: BlockContent["emptyState"] }) {
  const { tokens, fs, bp } = useMock();
  const isMobile = bp === "mobile";

  return (
    <Band band="base">
      <div style={{ maxWidth: 520, marginLeft: "auto", marginRight: "auto" }}>
        <Stack
          gap={16}
          style={{ justifyItems: "center", textAlign: "center", paddingTop: 20, paddingBottom: 20 }}
        >
          {content.code && (
            <Display
              size={isMobile ? 72 : 112}
              as="div"
              style={{ color: tokens.accent, lineHeight: 0.85 }}
            >
              {content.code}
            </Display>
          )}
          <Display size={isMobile ? 24 : 30} as="h1">
            {content.headline}
          </Display>
          <Body size={14.5}>{content.body}</Body>

          {content.searchable && (
            <div
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 10,
                height: 46,
                paddingLeft: 16,
                paddingRight: 6,
                marginTop: 4,
                borderWidth: tokens.borderWidth,
                borderStyle: "solid",
                borderColor: tokens.border,
                borderRadius: tokens.radiusPill || tokens.radius,
              }}
            >
              <span
                style={{
                  flex: 1,
                  textAlign: "left",
                  fontFamily: tokens.fontBody,
                  fontSize: fs(13),
                  color: tokens.inkMuted,
                }}
              >
                Search the store
              </span>
              <Btn label="Search" size="sm" />
            </div>
          )}

          <Row gap={10} wrap style={{ justifyContent: "center", marginTop: 4 }}>
            <Btn label={content.cta} />
            {content.secondaryCta && (
              <Btn label={content.secondaryCta} variant="ghost" />
            )}
          </Row>
        </Stack>
      </div>
    </Band>
  );
}
