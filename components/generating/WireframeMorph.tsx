"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useMemo, type CSSProperties } from "react";
import type { BlockKind, PageMockup } from "@/lib/generate/types";
import { recipeFor } from "@/lib/generate/recipes";
import { MockupThumb } from "../mockup/MockupThumb";

/* ==========================================================================
   THE SIGNATURE MOMENT

   A wireframe of the page's actual block sequence draws itself in, a violet
   shimmer sweeps across it, then it cross-dissolves into the finished mockup.

   The wireframe is not decorative filler: the rows are derived from the same
   `pageRecipes` entry the generator uses, so a Product page skeleton really
   does look like a Product page before it resolves.

   Reduced motion: the draw and the shimmer are dropped, but the sequential
   pending → building → done progression is kept, because that ordering is
   information about what the system is doing, not decoration.
   ========================================================================== */

/* `bar` and `band` are separate members rather than one with a union
   discriminant, so the early return in buildPlan narrows them both away and the
   final branch is provably the grid case. */
type Row =
  | { pattern: "bar"; h: number }
  | { pattern: "band"; h: number }
  | { pattern: "hero"; h: number }
  | { pattern: "text"; h: number; lines: number }
  | { pattern: "grid"; h: number; cols: number; rows: number }
  | { pattern: "split"; h: number };

const ROW_FOR: Partial<Record<BlockKind, Row>> = {
  nav: { pattern: "bar", h: 7 },
  hero: { pattern: "hero", h: 40 },
  logoStrip: { pattern: "bar", h: 9 },
  collectionHeader: { pattern: "text", h: 20, lines: 3 },
  productGrid: { pattern: "grid", h: 46, cols: 4, rows: 2 },
  productDetail: { pattern: "split", h: 52 },
  featureRow: { pattern: "grid", h: 26, cols: 3, rows: 1 },
  imageSplit: { pattern: "split", h: 38 },
  testimonials: { pattern: "grid", h: 26, cols: 3, rows: 1 },
  statsRow: { pattern: "grid", h: 16, cols: 4, rows: 1 },
  promoBanner: { pattern: "band", h: 13 },
  countdown: { pattern: "band", h: 22 },
  faqAccordion: { pattern: "text", h: 32, lines: 5 },
  blogList: { pattern: "grid", h: 42, cols: 4, rows: 1 },
  blogArticle: { pattern: "text", h: 54, lines: 8 },
  cartSummary: { pattern: "split", h: 40 },
  leadForm: { pattern: "split", h: 34 },
  dataTable: { pattern: "text", h: 30, lines: 6 },
  pricingTiers: { pattern: "grid", h: 38, cols: 3, rows: 1 },
  quizStep: { pattern: "text", h: 36, lines: 5 },
  accountPanel: { pattern: "text", h: 34, lines: 5 },
  orderTracker: { pattern: "bar", h: 14 },
  contactPanel: { pattern: "split", h: 38 },
  mediaWall: { pattern: "grid", h: 44, cols: 3, rows: 3 },
  richText: { pattern: "text", h: 34, lines: 6 },
  listPanel: { pattern: "text", h: 26, lines: 4 },
  emptyState: { pattern: "hero", h: 34 },
  searchResults: { pattern: "grid", h: 40, cols: 3, rows: 2 },
  giftCardPicker: { pattern: "split", h: 40 },
  bundleBuilder: { pattern: "grid", h: 36, cols: 3, rows: 1 },
  upsellOffer: { pattern: "split", h: 34 },
  thankYouPanel: { pattern: "hero", h: 34 },
  passwordGate: { pattern: "hero", h: 62 },
  footer: { pattern: "grid", h: 22, cols: 4, rows: 1 },
};

const FALLBACK: Row = { pattern: "text", h: 24, lines: 3 };

export type MorphPhase = "pending" | "building" | "done";

/* ---- plan --------------------------------------------------------------- */

/* Rects carry their own stagger delay, assigned once when the plan is built.
   Delays are precomputed rather than incremented during render so nothing is
   mutated mid-render. */
type Rect = { key: string; cls: string; delay: number; style?: CSSProperties };

type PlanRow =
  | { kind: "single"; rect: Rect }
  | { kind: "stack"; height?: number; gap: number; rects: Rect[] }
  | {
      kind: "grid";
      cols: number;
      rowsCount: number;
      rowHeight: number;
      rects: Rect[];
    }
  | { kind: "split"; height: number; left: Rect; right: Rect[] };

const STAGGER = 0.04;

function buildPlan(pageType: string): PlanRow[] {
  const rows = recipeFor(pageType).map((kind) => ROW_FOR[kind] ?? FALLBACK);
  let n = 0;
  const take = () => STAGGER * n++;

  return rows.map((row, ri): PlanRow => {
    const k = `r${ri}`;

    if (row.pattern === "bar" || row.pattern === "band") {
      return {
        kind: "single",
        rect: {
          key: k,
          cls: `w-full rounded-[2px] ${
            row.pattern === "band" ? "bg-pf-primary/40" : "bg-white/12"
          }`,
          delay: take(),
          style: { height: row.h },
        },
      };
    }

    if (row.pattern === "hero") {
      return {
        kind: "stack",
        height: row.h,
        gap: 5,
        rects: [
          {
            key: `${k}a`,
            cls: "w-3/4 rounded-[2px] bg-white/16",
            delay: take(),
            style: { height: row.h * 0.3 },
          },
          {
            key: `${k}b`,
            cls: "w-1/2 rounded-[2px] bg-white/9",
            delay: take(),
            style: { height: row.h * 0.12 },
          },
          {
            key: `${k}c`,
            cls: "w-1/4 rounded-[2px] bg-pf-primary/50",
            delay: take(),
            style: { height: row.h * 0.14 },
          },
          {
            key: `${k}d`,
            cls: "w-full rounded-[3px] bg-white/7",
            delay: take(),
            style: { height: row.h * 0.34 },
          },
        ],
      };
    }

    if (row.pattern === "text") {
      return {
        kind: "stack",
        gap: 4,
        rects: Array.from({ length: row.lines }, (_, i) => ({
          key: `${k}l${i}`,
          cls: "rounded-[2px] bg-white/10",
          delay: take(),
          style: {
            height: Math.max(4, row.h / row.lines - 4),
            width: i === 0 ? "58%" : i % 3 === 2 ? "82%" : "100%",
          },
        })),
      };
    }

    if (row.pattern === "split") {
      return {
        kind: "split",
        height: row.h,
        left: {
          key: `${k}a`,
          cls: "h-full rounded-[3px] bg-white/12",
          delay: take(),
        },
        right: [
          {
            key: `${k}b`,
            cls: "w-4/5 rounded-[2px] bg-white/14",
            delay: take(),
            style: { height: 8 },
          },
          {
            key: `${k}c`,
            cls: "w-full rounded-[2px] bg-white/8",
            delay: take(),
            style: { height: 5 },
          },
          {
            key: `${k}d`,
            cls: "w-11/12 rounded-[2px] bg-white/8",
            delay: take(),
            style: { height: 5 },
          },
          {
            key: `${k}e`,
            cls: "w-2/5 rounded-[2px] bg-pf-primary/45",
            delay: take(),
            style: { height: 8 },
          },
        ],
      };
    }

    return {
      kind: "grid",
      cols: row.cols,
      rowsCount: row.rows,
      rowHeight: row.h / row.rows - 5,
      rects: Array.from({ length: row.cols * row.rows }, (_, i) => ({
        key: `${k}c${i}`,
        cls: "h-full rounded-[3px] bg-white/10",
        delay: take(),
      })),
    };
  });
}

/* ---- render ------------------------------------------------------------- */

function Bar({ rect, animate }: { rect: Rect; animate: boolean }) {
  return (
    <motion.div
      className={rect.cls}
      style={{ originX: 0, ...rect.style }}
      initial={animate ? { scaleX: 0, opacity: 0.2 } : { scaleX: 1, opacity: 1 }}
      animate={{ scaleX: 1, opacity: 1 }}
      transition={
        animate
          ? { duration: 0.34, delay: rect.delay, ease: [0.22, 1, 0.36, 1] }
          : { duration: 0 }
      }
    />
  );
}

function Wireframe({
  pageType,
  animate,
}: {
  pageType: string;
  animate: boolean;
}) {
  const plan = useMemo(() => buildPlan(pageType), [pageType]);

  return (
    <div className="grid gap-[6px] p-[7px]">
      {plan.map((row, i) => {
        if (row.kind === "single")
          return <Bar key={i} rect={row.rect} animate={animate} />;

        if (row.kind === "stack")
          return (
            <div
              key={i}
              className="grid"
              style={{ gap: row.gap, height: row.height }}
            >
              {row.rects.map((r) => (
                <Bar key={r.key} rect={r} animate={animate} />
              ))}
            </div>
          );

        if (row.kind === "split")
          return (
            <div
              key={i}
              className="grid grid-cols-2 gap-[6px]"
              style={{ height: row.height }}
            >
              <Bar rect={row.left} animate={animate} />
              <div className="grid content-start gap-[4px]">
                {row.right.map((r) => (
                  <Bar key={r.key} rect={r} animate={animate} />
                ))}
              </div>
            </div>
          );

        return (
          <div
            key={i}
            className="grid gap-[5px]"
            style={{
              gridTemplateColumns: `repeat(${row.cols}, minmax(0,1fr))`,
              gridAutoRows: `${row.rowHeight}px`,
            }}
          >
            {row.rects.map((r) => (
              <Bar key={r.key} rect={r} animate={animate} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

/* ---- the morph ---------------------------------------------------------- */

export function WireframeMorph({
  pageType,
  page,
  phase,
  className = "",
}: {
  pageType: string;
  /** present once the page has been generated */
  page?: PageMockup;
  phase: MorphPhase;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const animate = !reduced;
  const showMockup = phase === "done" && page;

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <AnimatePresence initial={false}>
        {!showMockup && (
          <motion.div
            key="wire"
            className="absolute inset-0"
            initial={{ opacity: phase === "pending" ? 0.35 : 1 }}
            animate={{ opacity: phase === "pending" ? 0.35 : 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: animate ? 0.32 : 0 }}
          >
            <Wireframe
              pageType={pageType}
              animate={animate && phase === "building"}
            />

            {/* Shimmer sweep — only while this card is the one being built. */}
            {phase === "building" && animate && (
              <motion.div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "linear-gradient(100deg, transparent 20%, rgba(154,107,255,.30) 48%, rgba(217,200,255,.18) 55%, transparent 80%)",
                  backgroundSize: "220% 100%",
                }}
                initial={{ backgroundPositionX: "180%" }}
                animate={{ backgroundPositionX: "-80%" }}
                transition={{ duration: 1.15, repeat: Infinity, ease: "linear" }}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {showMockup && (
          <motion.div
            key="mock"
            className="absolute inset-0"
            initial={
              animate ? { opacity: 0, scale: 1.02 } : { opacity: 1, scale: 1 }
            }
            animate={{ opacity: 1, scale: 1 }}
            transition={
              animate
                ? { duration: 0.32, ease: [0.22, 1, 0.36, 1] }
                : { duration: 0 }
            }
          >
            <MockupThumb page={page} className="size-full" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
