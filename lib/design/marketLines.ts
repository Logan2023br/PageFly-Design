import "server-only";

import { marketById } from "../briefOptions";
import { sliceSkill } from "../ai/skills";

/* ==========================================================================
   ONE MARKET, AS THE MODEL READS IT.

   THE FIRST VERSION OF THIS FILE HAD IT BACKWARDS. It split markets in two: a
   dozen with a hand-written block that were "known", and the rest that got
   their language and a warning not to invent anything. The reasoning was that a
   made-up commercial custom is worse than an absent one, which is true, and
   that anything not written here would BE made up, which is not.

   The model knows more about trade in Poland, Thailand and Portugal than the
   person who wrote the blocks. Withholding the question — "build this for
   Portugal" — did not prevent invention. It prevented knowledge, and left the
   page addressed to nobody while looking like it had been addressed to someone.

   So every market now gets the same instruction, and the blocks are what they
   were always actually good for: ANCHORS. They pin the handful of things where
   the exact words matter and a near-miss reads as foreign — `7天无理由退货` is
   a specific phrase a Chinese shopper looks for, `GST included` belongs in a
   specific place on an Indian price, Pix carries a discount worth naming. A
   market with a block gets the block on top of the instruction, not instead of
   it.

   The guard that remains is the one that was worth keeping: name what you are
   sure of, and where you are not sure, say less. A page is copy the merchant
   edits, not a compliance filing — but a payment method that does not exist in
   a country is the kind of wrong that costs trust immediately, and the model is
   told to leave it out rather than guess at it.
   ========================================================================== */

export function marketLines(id: string | null): string[] {
  if (!id) return [];

  const market = marketById(id);
  if (!market) return [];

  const lines = [
    `THE MARKET THIS SELLS INTO — ${market.label}.`,
    `  language   ${market.language}`,
    `  price      written as ${market.price}`,
    ``,
    `Build the page for shoppers THERE. Write it in that language and that`,
    `number format, and carry what someone buying in ${market.label} looks for`,
    `before they trust a store: how people pay, how long delivery takes and what`,
    `it costs, what the returns window is, which line the law expects beside a`,
    `price, and which proof carries weight. Use what you know about that market.`,
    ``,
    `None of this changes how the page LOOKS — the visual style already decided`,
    `that. It changes what the page has to say, and a market with more to say`,
    `ends up with a longer page for that reason and no other.`,
    ``,
    `Name only what you are confident is true there. A payment method that does`,
    `not exist in ${market.label}, or a returns window that is not the norm, is`,
    `worse than saying nothing — so where you are unsure, say less.`,
  ];

  /* The specifics worth getting exactly right, where someone wrote them down.
     Additive: the instruction above stands whether or not this exists. */
  const block = market.detailed ? sliceSkill("markets", [id]) : "";
  if (block.trim())
    lines.push(
      ``,
      `Some of it has been written down, because the exact wording matters and a`,
      `near-miss reads as foreign. Where this and your own knowledge disagree,`,
      `this wins — it was checked.`,
      ``,
      block,
    );

  return lines;
}
