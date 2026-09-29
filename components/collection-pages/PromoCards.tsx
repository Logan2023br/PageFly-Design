"use client";

import Link from "next/link";
import { EV, track } from "@/lib/analytics";
import type { ReactNode } from "react";
import { customRequestUrl } from "@/lib/collectionPages";
import { Icon } from "../ui";
import { useSeenOnce } from "./cpTrack";

/* ==========================================================================
   TWO WAYS TO GET A STORE THAT IS NOT ON THIS PAGE, AT THE END OF IT.

   After the premium sets, because that is where a visitor who has not found
   their look arrives: the last card is the moment "none of these is quite
   mine" is decided, and the answer should be sitting right there. One is a
   template made to order; the other is PageFly Design itself, three pages
   free, built from their own brief.

   CARDS, NOT A BANNER, so they sit in the same grid as the sets and read as
   two more choices rather than an advert under them. They are drawn instead
   of screenshotted — a picture of a page would look like a set to buy — and
   they come alive on hover so they are found by the same hand that has been
   hovering the sets.
   ========================================================================== */

export function PromoCards() {
  const seen = useSeenOnce<HTMLLIElement>(() => track(EV.cpSectionSeen, { section: "promo" }));
  return (
    <>
      <li ref={seen} className="h-full">
        <PromoCard
          href={customRequestUrl}
          tone="warm"
          eyebrow="Made to order"
          title="Pre-order your template"
          body="Tell us what you sell and the look you want. We design a full page set that is yours alone — guaranteed not to match any other template."
          badge="100% unique design"
          cta="Request a template"
          card="custom"
          art={<ArtRequest />}
        />
      </li>
      <li className="h-full">
        <PromoCard
          href="/design"
          tone="violet"
          eyebrow="PageFly Design"
          title="Build 3 pages free"
          body="Describe your store in a few lines and get three matching pages designed for it — no card, no password."
          cta="Start for free"
          card="build"
          art={<ArtBuild />}
        />
      </li>
    </>
  );
}

const TONES = {
  warm: {
    border: "border-pf-warn/30 hover:border-pf-warn/70",
    glow: "hover:shadow-[0_24px_60px_-20px_rgba(251,191,36,0.45)]",
    wash: "bg-[radial-gradient(120%_80%_at_100%_0%,rgba(251,191,36,0.22),transparent_60%),radial-gradient(90%_70%_at_0%_100%,rgba(244,114,182,0.14),transparent_60%)]",
    text: "text-pf-warn",
    cta: "bg-pf-warn text-pf-ink",
  },
  violet: {
    border: "border-pf-primary-hi/35 hover:border-pf-primary-hi/80",
    glow: "hover:shadow-[0_24px_60px_-20px_rgba(124,58,237,0.6)]",
    wash: "bg-[radial-gradient(120%_80%_at_100%_0%,rgba(139,92,246,0.3),transparent_60%),radial-gradient(90%_70%_at_0%_100%,rgba(56,189,248,0.14),transparent_60%)]",
    text: "text-pf-primary-hi",
    cta: "bg-pf-primary text-white",
  },
} as const;

function PromoCard({
  href,
  tone,
  eyebrow,
  title,
  body,
  cta,
  art,
  badge,
  card,
}: {
  card: "custom" | "build";
  href: string;
  /** a promise worth pinning to the picture */
  badge?: string;
  tone: keyof typeof TONES;
  eyebrow: string;
  title: string;
  body: string;
  cta: string;
  art: ReactNode;
}) {
  const t = TONES[tone];
  return (
    <Link
      href={href}
      onClick={() => track(EV.cpPromoClicked, { card })}
      className={`group relative flex h-full flex-col overflow-hidden rounded-pf-card border bg-pf-card shadow-pf-card transition-all duration-300 hover:-translate-y-1 motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${t.border} ${t.glow}`}
    >
      {/* The wash: faint at rest, full on hover. */}
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-0 opacity-40 transition-opacity duration-500 group-hover:opacity-100 ${t.wash}`}
      />
      <span
        aria-hidden
        className="pfd-grid pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-60"
      />

      <span className="relative block aspect-[4/3] overflow-hidden">
        {art}
        {badge && (
          <span
            className={`absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-pf-pill border bg-pf-bg/80 px-2.5 py-1 text-[11.5px] font-semibold backdrop-blur ${t.text} ${
              tone === "warm" ? "border-pf-warn/40" : "border-pf-primary-hi/40"
            }`}
          >
            <Icon name="ShieldCheck" size={12} />
            {badge}
          </span>
        )}
      </span>

      <span className="relative flex flex-1 flex-col border-t border-pf-border/70 px-4 py-4">
        <span className={`flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] ${t.text}`}>
          <Icon name="Sparkles" size={12} />
          {eyebrow}
        </span>
        <span className="mt-1.5 font-display text-[19px] font-semibold tracking-[-0.011em] text-pf-text">
          {title}
        </span>
        <span className="mt-1 block text-[13px] leading-snug text-pf-muted">{body}</span>
        <span className="mt-auto pt-4">
          <span
            className={`inline-flex items-center gap-1.5 rounded-pf-md px-3.5 py-2 text-[13px] font-semibold shadow-pf-button ${t.cta}`}
          >
            {cta}
            <Icon
              name="ArrowRight"
              size={14}
              className="transition-transform duration-300 group-hover:translate-x-1"
            />
          </span>
        </span>
      </span>
    </Link>
  );
}

/* ---- the pictures ------------------------------------------------------- */

/** A blank page drawn in dashes, being filled in on hover: "yours, not made yet". */
function ArtRequest() {
  return (
    <span className="absolute inset-0 grid place-items-center">
      <span
        aria-hidden
        className="absolute size-40 rounded-full bg-pf-warn/25 blur-3xl transition-transform duration-700 group-hover:scale-150"
      />
      <span className="relative w-[58%] rotate-[-4deg] rounded-pf-lg border-2 border-dashed border-pf-warn/50 bg-pf-bg/60 p-3 backdrop-blur-sm transition-transform duration-500 group-hover:rotate-0 group-hover:scale-105 motion-reduce:transition-none">
        <span className="block h-2 w-1/3 rounded-full bg-pf-warn/60" />
        <span className="mt-2.5 block h-10 rounded-pf-sm bg-pf-warn/15 transition-colors duration-500 group-hover:bg-pf-warn/30" />
        <span className="mt-2 grid grid-cols-3 gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              style={{ transitionDelay: `${120 + i * 90}ms` }}
              className="block h-7 rounded-pf-sm bg-pf-text/10 transition-colors duration-500 group-hover:bg-pf-warn/25"
            />
          ))}
        </span>
        <span className="mt-2 block h-1.5 w-3/4 rounded-full bg-pf-text/10" />
        <span className="mt-1.5 block h-1.5 w-1/2 rounded-full bg-pf-text/10" />
      </span>
      <span className="absolute right-[18%] top-[16%] grid size-10 place-items-center rounded-full bg-pf-warn text-pf-ink shadow-pf-button transition-transform duration-500 group-hover:rotate-90 group-hover:scale-110 motion-reduce:transition-none">
        <Icon name="Plus" size={18} />
      </span>
    </span>
  );
}

/** Three pages fanned out on hover — the three free ones. */
function ArtBuild() {
  const cards = [
    { rest: "-rotate-6 -translate-x-3", hover: "group-hover:-rotate-12 group-hover:-translate-x-14" },
    { rest: "rotate-0", hover: "group-hover:-translate-y-2" },
    { rest: "rotate-6 translate-x-3", hover: "group-hover:rotate-12 group-hover:translate-x-14" },
  ];
  return (
    <span className="absolute inset-0 grid place-items-center">
      <span
        aria-hidden
        className="absolute size-44 rounded-full bg-pf-primary/40 blur-3xl transition-transform duration-700 group-hover:scale-150"
      />
      <span className="relative h-[62%] w-[34%]">
        {cards.map((c, i) => (
          <span
            key={i}
            className={`absolute inset-0 rounded-pf-md border border-pf-primary-hi/40 bg-gradient-to-b from-pf-card-hi to-pf-bg p-2 shadow-pf-float transition-transform duration-500 ease-out motion-reduce:transition-none ${c.rest} ${c.hover}`}
            style={{ zIndex: i === 1 ? 2 : 1 }}
          >
            <span className="block h-[38%] rounded-[6px] bg-gradient-to-br from-pf-primary/70 to-pf-primary-hi/30" />
            <span className="mt-1.5 block h-1.5 w-3/4 rounded-full bg-pf-text/25" />
            <span className="mt-1 block h-1.5 w-1/2 rounded-full bg-pf-text/15" />
            <span className="mt-2 grid grid-cols-2 gap-1">
              <span className="block h-4 rounded-[4px] bg-pf-text/10" />
              <span className="block h-4 rounded-[4px] bg-pf-text/10" />
            </span>
          </span>
        ))}
      </span>
      <span className="absolute bottom-[12%] rounded-pf-pill border border-pf-primary-hi/50 bg-pf-bg/80 px-3 py-1 text-[12px] font-semibold text-pf-text backdrop-blur transition-transform duration-500 group-hover:-translate-y-1">
        3 pages · free
      </span>
    </span>
  );
}
