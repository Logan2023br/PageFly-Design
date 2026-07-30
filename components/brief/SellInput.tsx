"use client";

import { MAX_SELL_CHARS, SELL_EXAMPLES } from "@/lib/briefOptions";
import { useStore } from "@/lib/store";
import { Chip, Counter, SectionCard } from "../ui";

export function SellInput() {
  const value = useStore((s) => s.draft.whatYouSell);
  const setSell = useStore((s) => s.setSell);

  return (
    <SectionCard
      id="pfd-sell"
      eyebrow="Step 1"
      title="What do you sell?"
      help="Drives the headings, product names and prices."
      aside={<Counter value={value.length} max={MAX_SELL_CHARS} />}
    >
      <div className="grid gap-3.5">
        <input
          type="text"
          value={value}
          maxLength={MAX_SELL_CHARS}
          onChange={(e) => setSell(e.target.value)}
          placeholder="e.g. handmade ceramic mugs, running shoes, skincare for men"
          aria-label="What do you sell"
          className="h-12 w-full rounded-pf-md border border-pf-border bg-pf-bg-deep px-4 text-[15px] text-pf-text transition-colors placeholder:text-pf-faint hover:border-pf-border-hi focus:border-pf-primary-hi focus:outline-none"
        />
        <div className="flex flex-wrap gap-2">
          {SELL_EXAMPLES.map((ex) => (
            <Chip
              key={ex}
              selected={value === ex}
              onClick={() => setSell(ex)}
            >
              {ex}
            </Chip>
          ))}
        </div>
      </div>
    </SectionCard>
  );
}
