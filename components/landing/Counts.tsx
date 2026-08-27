import { GradientWord } from "../ui";

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

   Every figure here is read from the database, and a figure that does not exist
   is NOT RENDERED. There is no zero state and no placeholder: a landing page
   claiming a review score before anyone has reviewed anything is the one thing
   on it that cannot be undone once a visitor notices, and "0 reviews" is a
   worse advertisement than no line at all.
   ========================================================================== */

export type Counts = {
  stores?: number;
  pages?: number;
  reviews?: number;
  rating?: number;
};

const fmt = new Intl.NumberFormat("en-US");

export function Counts({ counts }: { counts: Counts }) {
  const tiles: { value: string; label: string }[] = [];

  if (counts.stores) tiles.push({ value: fmt.format(counts.stores), label: "stores" });
  if (counts.pages) tiles.push({ value: fmt.format(counts.pages), label: "pages built" });
  if (counts.reviews && counts.rating)
    tiles.push({
      value: counts.rating.toFixed(1),
      label: `from ${fmt.format(counts.reviews)} review${counts.reviews === 1 ? "" : "s"}`,
    });

  if (tiles.length === 0) return null;

  return (
    <dl className="mx-auto flex max-w-3xl flex-wrap items-start justify-center gap-y-8">
      {tiles.map((t) => (
        <div key={t.label} className="flex-1 basis-40 px-6 text-center">
          <dd>
            <span className="block font-display text-[clamp(2.75rem,6vw,4rem)] font-semibold leading-none tracking-[-0.03em] tabular-nums">
              <GradientWord>{t.value}</GradientWord>
            </span>
            <span className="mt-3 block text-[13px] text-pf-muted">{t.label}</span>
          </dd>
          <dt className="sr-only">{t.label}</dt>
        </div>
      ))}
    </dl>
  );
}
