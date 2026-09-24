"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ProofItem } from "@/lib/proof";

/* ==========================================================================
   ONE MERCHANT AT A TIME, IN THE CORNER.

   The strip under the hero carries four figures. A figure is a claim a visitor
   either accepts or does not; this is a witness — one store, one thing it did,
   one moment — and a witness is the half of proof that reads as true because it
   is specific rather than large.

   IT ENTERS FROM THE LEFT AND LEAVES THE SAME WAY. Sliding out to the right
   would carry it across the page it is not about; going back where it came from
   reads as a thing that looked in and left. The corner is the left one because
   the page's own reading starts there and returns there on every line, so a
   card that appears in it is seen without being chased.

   AND IT IS NOT A NOTIFICATION. It cannot be replied to, it carries no action,
   it never stacks, and it takes no keyboard focus — a visitor mid-sentence in
   the brief must not have their cursor stolen by an advertisement. One card at
   a time, gone on its own, with a close that means "not again this visit".

   WHAT THE TIMINGS ARE FOR. The first appearance waits until the page has been
   read a little: a card that arrives during the first paint is part of the
   furniture and is not read as somebody else's store. After that the gap is
   long enough that the corner is empty most of the time, because a corner that
   always has something in it stops being looked at.

   NOTHING IS INVENTED. Every line comes from `/api/showcase`, masked on the
   server; an empty feed renders nothing at all rather than a placeholder
   merchant.
   ========================================================================== */

/** Long enough to read a sentence of about twenty words, and no longer. */
const SHOW_MS = 5_000;
/** Read a little first. */
const FIRST_DELAY_MS = 12_000;
/** And then rarely, so the corner is empty most of the time. */
const GAP_MS = 22_000;

/** The slide, matched to the CSS transition below. */
const SLIDE_MS = 420;

function Stars({ n }: { n: number }) {
  return (
    <span aria-label={`${n} out of 5`} className="text-[12px] leading-none tracking-[.08em] text-pf-primary">
      {"★".repeat(Math.max(0, Math.min(5, n)))}
      <span className="text-pf-faint">{"★".repeat(Math.max(0, 5 - n))}</span>
    </span>
  );
}

/**
 * Fetches its own feed, and that is deliberate.
 *
 * `LandingScreen` stopped fetching anything on purpose — its note says so and
 * names this as the section a future "recent builds" would be. Handing the
 * items down from there would put a loading state back on a page that has none
 * and make the gallery wait on a corner card. This asks once, quietly, after
 * the page is already readable, and renders nothing until it has an answer.
 */
export function ProofToast() {
  const [items, setItems] = useState<ProofItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    /* AFTER the page, not with it. The feed is decoration and must not compete
       with the hero's own images for the first connections. */
    const t = setTimeout(() => {
      fetch("/api/showcase")
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { proof?: ProofItem[] } | null) => {
          if (!cancelled && Array.isArray(d?.proof)) setItems(d.proof);
        })
        .catch(() => {
          /* The corner stays empty, which is what it looks like anyway. */
        });
    }, 4_000);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);

  return <ProofToastView items={items} />;
}

function ProofToastView({ items }: { items: ProofItem[] }) {
  /* `at` walks the list rather than picking at random each time: random
     repeats, and a visitor shown the same store twice in a minute reads the
     whole thing as fabricated. The ORDER is shuffled once, so two visitors do
     not see the same sequence. */
  const order = useRef<number[]>([]);
  const [at, setAt] = useState(0);
  const [item, setItem] = useState<ProofItem | null>(null);
  const [inView, setInView] = useState(false);
  const [done, setDone] = useState(false);

  const close = useCallback(() => {
    setInView(false);
    setDone(true);
  }, []);

  useEffect(() => {
    if (done || items.length === 0) return;

    /* SHUFFLED HERE, NOT IN THE RENDER. A shuffle is `Math.random` and a
       render must be able to run twice with the same answer; done there, React
       is free to re-run it and the order changes under a card already on
       screen. Done once, when the feed arrives, it is a decision this component
       makes rather than a side effect of being drawn. */
    if (order.current.length !== items.length) {
      const ix = items.map((_, i) => i);
      for (let i = ix.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [ix[i], ix[j]] = [ix[j], ix[i]];
      }
      order.current = ix;
    }

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const after = (ms: number, fn: () => void) => {
      timers.push(setTimeout(() => !cancelled && fn(), ms));
    };

    const show = () => {
      /* A CARD NOBODY IS LOOKING AT IS SPENT, NOT SHOWN. Switching tabs
         freezes nothing by itself, so without this a visitor returns to a
         corner that has already run through half the list at nobody. */
      if (document.hidden) {
        after(GAP_MS, show);
        return;
      }
      const next = items[order.current[at % items.length]];
      setItem(next);
      setAt((n) => n + 1);
      /* Mounted first, moved on the next frame: a transition from a state the
         browser never painted does not run, and the card would appear rather
         than arrive. */
      requestAnimationFrame(() => requestAnimationFrame(() => !cancelled && setInView(true)));
      after(SHOW_MS, () => {
        setInView(false);
        after(SLIDE_MS + GAP_MS, show);
      });
    };

    after(at === 0 ? FIRST_DELAY_MS : GAP_MS, show);
    return () => {
      cancelled = true;
      for (const t of timers) clearTimeout(t);
    };
    /* `at` is read inside and advanced there; re-running on it would restart
       the wait every time a card is shown. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, done]);

  if (items.length === 0 || item === null) return null;

  return (
    <div
      /* `aria-live` polite and not a dialog: it is read after whatever the
         visitor is doing, and it never takes focus. */
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 left-4 z-40 hidden max-w-[calc(100vw-2rem)] sm:block"
    >
      <div
        style={{
          transform: inView ? "translateX(0)" : "translateX(calc(-100% - 1.5rem))",
          opacity: inView ? 1 : 0,
          transition: `transform ${SLIDE_MS}ms cubic-bezier(.22,1,.36,1), opacity ${SLIDE_MS}ms ease`,
        }}
        /* A GROUND OF ITS OWN, and `pf-card` is not one: it is
           `rgba(255,255,255,.035)` — a wash meant to lift a panel off the page
           it sits ON. This floats over whatever happens to be scrolled behind
           it, including a photograph, and a card at three per cent of white
           over a photograph is a rectangle of blur with text in it. The page's
           own raised surface, opaque, is what a thing that covers something
           else needs. */
        className="pointer-events-auto flex w-[330px] items-start gap-3 rounded-2xl border border-pf-border-hi bg-pf-bg-alt p-3.5 shadow-[0_18px_48px_-24px_rgba(0,0,0,.85)] motion-reduce:transition-none"
      >
        <div className="grid size-9 shrink-0 place-items-center rounded-full bg-pf-card-hi text-[13px] font-semibold uppercase text-pf-muted">
          {item.who.slice(0, 2)}
        </div>

        <div className="min-w-0 flex-1">
          {item.kind === "review" ? (
            <>
              <div className="flex items-center gap-2">
                <span className="truncate text-[13px] font-semibold text-pf-text">{item.who}</span>
                <Stars n={item.stars} />
              </div>
              <p className="mt-1 text-[13px] leading-snug text-pf-muted">“{item.said}”</p>
            </>
          ) : (
            <>
              <span className="truncate text-[13px] font-semibold text-pf-text">{item.who}</span>
              <p className="mt-1 text-[13px] leading-snug text-pf-muted">
                built{" "}
                <span className="font-semibold tabular-nums text-pf-text">
                  {item.pages} {item.pages === 1 ? "page" : "pages"}
                </span>{" "}
                with PageFly Design
              </p>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={close}
          aria-label="Hide these"
          className="-m-1 shrink-0 rounded-full p-1 text-pf-faint transition-colors hover:text-pf-text"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
