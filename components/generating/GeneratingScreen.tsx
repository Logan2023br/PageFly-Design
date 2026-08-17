"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { PAGE_BY_ID } from "@/lib/pageCatalog";
import { useStore } from "@/lib/store";
import { Button, Icon, Panel } from "../ui";
import { WireframeMorph, type MorphPhase } from "./WireframeMorph";

/* Status copy stays factual. No "consulting the design oracle" theatrics —
   the line says what is happening, because that is what is happening.

   It used to name the page being built, one at a time, which was true when
   pages appeared as fast as the generator could make them. The model designs
   every page at once and none of them lands for the better part of a minute,
   so naming one would be picking a page at random and calling it the current
   one. */
function statusLine(done: number, total: number): string {
  if (done >= total && total > 0) return "Almost there";
  if (done > 0) return `${done} of ${total} designed`;
  return total === 1 ? "Designing your page" : `Designing ${total} pages`;
}

/* Measured against the model actually in production, and four pages are
   designed at once, so a deck costs roughly one round of this per four pages.
   Used only to say "about two minutes" — never to draw a countdown, because a
   countdown that runs out while the bar has not moved is worse than no number.

   This was 55, which was Haiku's number and was left behind when the app moved
   to DeepSeek v4-flash. v4-flash is a reasoning model: it spends 15,000-16,000
   output tokens thinking before it writes any JSON, and one page measured
   125-134 seconds against Haiku's 20-25. So the screen promised 55 seconds
   while the work took over two minutes, and a merchant watching it had every
   reason to think the build had hung. */
const SECONDS_PER_ROUND = 115;
const AT_ONCE = 4;

function estimate(total: number): number {
  return Math.ceil(total / AT_ONCE) * SECONDS_PER_ROUND;
}

function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
}

/** Seconds since the build was asked for, ticking. */
function useElapsed(startedAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);
  if (startedAt === null) return 0;
  return Math.max(0, Math.floor((now - startedAt) / 1000));
}

export function GeneratingScreen() {
  const plan = useStore((s) => s.plan);
  const pages = useStore((s) => s.pages);
  const failures = useStore((s) => s.failures);
  const cancel = useStore((s) => s.cancel);
  const startedAt = useStore((s) => s.startedAt);
  const reduced = useReducedMotion();
  const elapsed = useElapsed(startedAt);

  const total = plan.length;
  const settled = pages.length + failures.length;
  const pct = total === 0 ? 0 : Math.round((settled / total) * 100);


  const byId = new Map(pages.map((p) => [p.id, p]));

  return (
    <motion.div
      key="generating"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
      className="mx-auto max-w-6xl"
    >
      <div className="mx-auto max-w-2xl px-1 pb-9 pt-4 text-center sm:pt-8">
        <h1 className="font-display text-[28px] font-semibold tracking-[-0.03em] text-pf-text sm:text-[38px]">
          Building your pages
        </h1>

        <div className="mt-7 grid gap-3">
          <div className="h-[3px] w-full overflow-hidden rounded-full bg-pf-border">
            <motion.div
              className="h-full rounded-full bg-pf-primary"
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: reduced ? 0 : 0.5, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
          <div className="flex items-center justify-between gap-3 text-[13px]">
            <span
              aria-live="polite"
              className="flex items-center gap-2 text-pf-body"
            >
              <motion.span
                animate={reduced ? {} : { rotate: 360 }}
                transition={{ duration: 2.2, repeat: Infinity, ease: "linear" }}
                className="text-pf-primary-hi"
              >
                <Icon name="Loader" size={14} />
              </motion.span>
              {statusLine(settled, total)}
            </span>
            <span className="tabular-nums text-pf-muted">
              {settled} of {total}
            </span>
          </div>

          {/* The reassurance, not a countdown. A merchant watching a bar that
              has not moved for forty seconds needs to know that is normal and
              that leaving costs them nothing — those two facts are the whole
              reason this line exists. */}
          <div className="flex items-center justify-between gap-3 text-[12px] text-pf-faint">
            <span>
              {settled >= total && total > 0
                ? "Finishing up"
                : `Usually about ${clock(estimate(total))} · you can close this tab, it keeps building`}
            </span>
            <span className="tabular-nums">{clock(elapsed)}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {plan.map((entry, i) => {
          const page = byId.get(entry.pageId);
          const failed = failures.some((f) => f.pageId === entry.pageId);
          /* Every page that has not landed is genuinely in flight — the model
             is given all of them at once. Marking only `settled` as building
             left the rest looking queued when nothing was waiting. */
          const phase: MorphPhase = page ? "done" : failed ? "pending" : "building";
          const def = PAGE_BY_ID[entry.pageType];

          return (
            <motion.div
              key={entry.pageId}
              initial={{ opacity: 0, y: 18, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{
                type: "spring",
                stiffness: 420,
                damping: 34,
                delay: reduced ? 0 : Math.min(i * 0.045, 0.6),
              }}
            >
              <Panel
                className={`overflow-hidden transition-colors duration-300 ${
                  phase === "building"
                    ? "border-pf-primary-hi/55 shadow-pf-glow"
                    : failed
                      ? "border-pf-danger/40"
                      : ""
                }`}
              >
                <div className="relative aspect-[3/4] bg-pf-bg-deep">
                  {failed ? (
                    <div className="grid size-full place-items-center gap-2 p-4 text-center">
                      <Icon name="CircleAlert" size={18} />
                      <span className="text-[12px] text-pf-muted">
                        Couldn&apos;t build this one
                      </span>
                    </div>
                  ) : (
                    <WireframeMorph
                      pageType={entry.pageType}
                      page={page}
                      phase={phase}
                      className="size-full"
                    />
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-pf-border px-3 py-2.5">
                  <span className="min-w-0 truncate text-[12.5px] font-semibold text-pf-text">
                    {def?.label ?? entry.pageType}
                    {entry.copyTotal > 1 && (
                      <span className="text-pf-faint"> {entry.copyIndex}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-pf-faint">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </div>
              </Panel>
            </motion.div>
          );
        })}
      </div>

      <div className="mt-8 flex justify-center pb-6">
        <Button variant="quiet" onClick={cancel} icon="ArrowLeft">
          Cancel and go back to the brief
        </Button>
      </div>
    </motion.div>
  );
}
