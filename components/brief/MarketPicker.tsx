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
 * The two groups are not decoration. The first twelve have a written block
 * behind them in `60-markets.md` and genuinely change what the page says; the
 * rest carry their language and currency and nothing more. Saying so in the
 * group label is the difference between a merchant knowing what they chose and
 * a merchant assuming.
 */
export function MarketPicker() {
  const selected = useStore((s) => s.draft.market);
  const setMarket = useStore((s) => s.setMarket);

  const full = MARKETS.filter((m) => m.detailed);
  const rest = MARKETS.filter((m) => !m.detailed);
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
          <optgroup label="Fully written up — payment, delivery, returns, tax">
            {full.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} · {m.language}
              </option>
            ))}
          </optgroup>
          <optgroup label="Language and currency only">
            {rest.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} · {m.language}
              </option>
            ))}
          </optgroup>
        </select>

        {/* What the choice actually buys, in the merchant's own terms. A market
            that only sets a language should say so before the build, not be
            discovered afterwards. */}
        {chosen && (
          <p className="text-[13px] text-pf-muted">
            Pages in <span className="text-pf-text">{chosen.language}</span>, prices as{" "}
            <span className="text-pf-text">{chosen.price}</span>
            {chosen.detailed
              ? " — plus the payment methods, delivery and returns a shopper there expects."
              : " — language and currency only; nothing local is assumed beyond them."}
          </p>
        )}
      </div>
    </SectionCard>
  );
}
