import "server-only";

import { marketById } from "../briefOptions";
import { sliceSkill } from "../ai/skills";

/* ==========================================================================
   ONE MARKET, AS THE MODEL READS IT.

   Two tiers, and the difference is what this file exists to keep honest.

   Twelve markets have a hand-written block in `60-markets.md` — payment
   methods, delivery expectation, returns norm, the line the law expects. Those
   get the block.

   The rest get what can be stated truthfully without inventing anything: the
   language and how a price is written. That is worth having on its own — a
   Portuguese store gets a Portuguese page with prices as `58,00 €` — and it
   stops exactly where knowledge stops.

   The alternative, and the reason this is not one tier: a picker of fifty
   countries all claiming full treatment would have the model inventing the
   trade practices of the thirty-eight nobody wrote up. An invented custom is
   worse than an absent one, because a merchant cannot tell which they got.
   ========================================================================== */

export function marketLines(id: string | null): string[] {
  if (!id) return [];

  const market = marketById(id);
  if (!market) return [];

  const block = market.detailed ? sliceSkill("markets", [id]) : "";
  if (block.trim())
    return [
      `THE MARKET THIS SELLS INTO — ${market.label}. Everything below is a`,
      `commercial fact about the people buying, not a style. It changes what the`,
      `page has to say and never how it looks.`,
      ``,
      block,
    ];

  /* No block. Say the two things that are true and stop — a shorter honest
     brief beats a longer invented one, and the model fills the rest from the
     store's own words rather than from a stereotype. */
  return [
    `THE MARKET THIS SELLS INTO — ${market.label}.`,
    `  language   ${market.language}`,
    `  price      written as ${market.price}`,
    ``,
    `Write the page in that language and that number format. Beyond those two`,
    `facts nothing about this market is stated here, so do not invent local`,
    `payment methods, delivery windows or legal lines — say what the merchant's`,
    `own brief supports and no more.`,
  ];
}
