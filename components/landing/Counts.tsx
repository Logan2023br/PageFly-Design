/* ==========================================================================
   What it has actually done.

   Every tile here is read from the database, and a tile whose number does not
   exist is NOT RENDERED. There is no zero state and no placeholder: a landing
   page claiming a review score before anyone has reviewed anything is the one
   thing on it that cannot be undone once a visitor notices, and "0 reviews" is
   a worse advertisement than no line at all.

   So an empty database shows nothing here, and the section disappears. That is
   correct on a fresh deploy rather than something to paper over.
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
      value: `${counts.rating.toFixed(1)}`,
      label: `from ${fmt.format(counts.reviews)} review${counts.reviews === 1 ? "" : "s"}`,
    });

  if (tiles.length === 0) return null;

  return (
    <section className="mx-auto max-w-4xl px-5 py-14 sm:py-20">
      <dl className="grid gap-4 sm:grid-cols-3">
        {tiles.map((t) => (
          <div
            key={t.label}
            className="rounded-pf-card border border-pf-border bg-pf-bg-deep px-5 py-6 text-center"
          >
            <dt className="sr-only">{t.label}</dt>
            <dd>
              <span className="block font-display text-[34px] font-semibold tabular-nums text-pf-text">
                {t.value}
              </span>
              <span className="mt-1 block text-[13px] text-pf-muted">{t.label}</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
