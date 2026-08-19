"use client";

import { useState } from "react";
import {
  MAX_SELL_CHARS,
  SELL_EXAMPLES,
  SELL_EXAMPLES_VISIBLE,
} from "@/lib/briefOptions";
import { useStore } from "@/lib/store";
import { Chip, Counter, SectionCard } from "../ui";

export function SellInput() {
  const value = useStore((s) => s.draft.whatYouSell);
  const setSell = useStore((s) => s.setSell);

  /* Sixty-six industries is a wall on first sight, and the first thirty already
     cover most of what a Shopify store is. The rest are one press away and stay
     open once opened — a merchant who had to look for their trade should not
     have to find it twice. */
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? SELL_EXAMPLES : SELL_EXAMPLES.slice(0, SELL_EXAMPLES_VISIBLE);
  const hidden = SELL_EXAMPLES.length - SELL_EXAMPLES_VISIBLE;

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
          {shown.map((ex) => (
            <Chip
              key={ex.slug}
              selected={value === ex.label}
              onClick={() => setSell(ex.label, ex.slug)}
            >
              {ex.label}
            </Chip>
          ))}

          {hidden > 0 && !expanded && (
            <Chip onClick={() => setExpanded(true)} title="Show every industry">
              +{hidden}
            </Chip>
          )}

          {expanded && (
            <Chip onClick={() => setExpanded(false)} title="Show fewer">
              Show less
            </Chip>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
