"use client";

import { MARKETS } from "@/lib/briefOptions";
import { useStore } from "@/lib/store";
import { Chip, SectionCard } from "../ui";

export function MarketPicker() {
  const selected = useStore((s) => s.draft.market);
  const setMarket = useStore((s) => s.setMarket);

  return (
    <SectionCard
      id="pfd-market"
      eyebrow="Step 4"
      title="Where are you selling?"
      help="Sets the language, the payment methods and what the page has to promise."
    >
      <div className="flex flex-wrap gap-2">
        {MARKETS.map((m) => (
          <Chip key={m.id} selected={selected === m.id} onClick={() => setMarket(m.id)}>
            {m.label}
          </Chip>
        ))}
      </div>
    </SectionCard>
  );
}
