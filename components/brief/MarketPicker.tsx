"use client";

import { MARKETS, marketById } from "@/lib/briefOptions";
import { useStore } from "@/lib/store";
import { SectionCard } from "../ui";

/**
 * Where the merchant sells.
 *
 * A select rather than chips, because there are fifty of these and a wrapped
 * grid of fifty pills is a wall to read rather than a list to pick from.
 *
 * ONE LIST, not two tiers. Every market here changes what the page says — the
 * model builds for shoppers there. A dozen of them additionally have exact
 * wording written down in `60-markets.md`, which is worth nothing to a merchant
 * choosing and so is not shown: they would read a second group as "the ones
 * that work", and all of them work.
 */
export function MarketPicker() {
  const selected = useStore((s) => s.draft.market);
  const setMarket = useStore((s) => s.setMarket);

  const chosen = selected ? marketById(selected) : null;

  return (
    <SectionCard
      id="pfd-market"
      eyebrow="Market · optional"
      title="Where are you selling?"
      help="Sets the language, the payment methods and what the page has to promise."
    >
      <div className="grid gap-2.5">
        <select
          aria-label="Market"
          value={selected ?? ""}
          onChange={(e) => setMarket(e.target.value)}
          className="h-12 w-full rounded-pf-md border border-pf-border bg-pf-bg-deep px-4 text-[15px] text-pf-text transition-colors hover:border-pf-border-hi focus:border-pf-primary-hi focus:outline-none"
        >
          <option value="">Not set — the page takes the language of your brief</option>
          {MARKETS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label} · {m.language}
            </option>
          ))}
        </select>

        {/* What the choice buys, in the merchant's own terms and before the
            build rather than after it. */}
        {chosen && (
          <p className="text-[13px] text-pf-muted">
            Pages in <span className="text-pf-text">{chosen.language}</span>, prices as{" "}
            <span className="text-pf-text">{chosen.price}</span> — with the payment methods,
            delivery and returns a shopper in {chosen.label} looks for.
          </p>
        )}
      </div>
    </SectionCard>
  );
}
