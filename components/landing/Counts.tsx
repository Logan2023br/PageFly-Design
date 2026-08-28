"use client";

import { CountUp, GradientWord } from "../ui";

/* ==========================================================================
   What it has actually done.

   A ROW, NOTHING ELSE. No boxes and no rules between — both were tried and
   both did the same thing: a number is the loudest mark you can put on a
   screen, and every line drawn near one competes with it. Space separates
   three figures perfectly well.

   The first attempt boxed them. Boxed, the tiles were dark rectangles sitting on a
   lighter wash — inverted contrast, so they read as three holes punched in the
   page rather than three facts. A number is the loudest thing you can put on a
   screen; putting a border round it makes it quieter, not louder.

   THESE THREE FIGURES ARE SET BY HAND, NOT READ FROM THE DATABASE.

   They used to be, and the note that stood here said why that mattered. It is
   worth keeping the record straight rather than deleting it: at the time of
   writing the database holds 6 stores, 41 pages and one review. `50+` and `350+`
   are therefore not roundings of those numbers, and anyone editing this file
   should know that before they reason about it.

   `FIGURES` below is the whole of it. The `Counts` TYPE stays — `/api/showcase`
   still computes these numbers and the admin screens still read them — but the
   prop is gone rather than accepted and ignored: a component that takes live
   figures and displays hand-written ones is a trap for whoever reads the call
   site next. To go back to the database, take `counts: Counts` as a prop again
   and build the tiles from it.
   ========================================================================== */

export type Counts = {
  stores?: number;
  pages?: number;
  reviews?: number;
  rating?: number;
};

/**
 * What the landing page claims.
 *
 * Broken into parts rather than written as the strings "50+" and "4.9", because
 * the numbers count up when the row scrolls into view and a counter cannot ease
 * toward a string. `decimals` is what keeps the third one a rating all the way
 * up — without it, 4.9 climbs through 1, 2, 3 and reads as a count of things.
 */
const FIGURES: {
  to: number;
  decimals: number;
  suffix: string;
  label: string;
}[] = [
  { to: 50, decimals: 0, suffix: "+", label: "stores" },
  { to: 350, decimals: 0, suffix: "+", label: "pages built" },
  /* Not "from 1 review". A 4.9 average out of a single review is arithmetically
     impossible, and a visitor who reads the two together learns only that one of
     them is untrue. */
  { to: 4.9, decimals: 1, suffix: "", label: "average rating" },
];

export function Counts() {
  const tiles = FIGURES;

  if (tiles.length === 0) return null;

  return (
    <dl className="mx-auto flex max-w-3xl flex-wrap items-start justify-center gap-y-8">
      {tiles.map((t) => (
        <div key={t.label} className="flex-1 basis-40 px-6 text-center">
          <dd>
            {/* `tabular-nums` matters more here than anywhere else on the page:
                without it every frame of the count re-measures and the three
                figures jitter sideways against each other while they climb. */}
            <span className="block font-display text-[clamp(2.75rem,6vw,4rem)] font-semibold leading-none tracking-[-0.03em] tabular-nums">
              <GradientWord>
                <CountUp to={t.to} decimals={t.decimals} suffix={t.suffix} duration={1100} />
              </GradientWord>
            </span>
            <span className="mt-3 block text-[13px] text-pf-muted">{t.label}</span>
          </dd>
          <dt className="sr-only">{t.label}</dt>
        </div>
      ))}
    </dl>
  );
}
