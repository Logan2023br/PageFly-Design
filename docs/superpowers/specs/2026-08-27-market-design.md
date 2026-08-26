# Market — the page is built for somewhere

## The problem this solves

A merchant tells this generator what they sell, how it should look, and what
kind of store they run. It never asks who is buying. So every page it builds is
built for the same shopper: one who pays by card, expects free shipping and
thirty-day returns, reads English, and needs no tax line.

That shopper is American. A merchant selling in Mumbai gets a page with no cash
on delivery, no EMI, no GST line and no seven-day return window — the four
things an Indian shopper looks for before they trust a store. A merchant selling
in Shanghai gets no Alipay, no WeChat Pay, no 7天无理由退货. The page is not
wrong so much as addressed to the wrong person.

The language rule has the same shape. `skills/50-copy.md` says today:

> Write in the language the merchant wrote their brief in.

Which is right when a Vietnamese merchant sells to Vietnam, and exactly wrong
when a Vietnamese merchant sells to the United States — the case where they most
need the page in English, and the reason they would have picked a market at all.

## The principle

**Visual style owns the look. Market owns the language, and what must be said to
sell.**

This is the whole design, and everything below follows from it.

An Indian page ends up denser than an American one, but not because a rule says
"India is dense". It is denser because it has more to carry: cash on delivery,
EMI at three months, GST included, a seven-day return window, sizing in
centimetres. An American page carries `free shipping over $50` and
`30-day returns` and is done. Density is a *consequence* of the facts a market
requires, never an instruction.

That distinction is what keeps a merchant's own choice intact. `minimal` plus
India is still minimal — a restrained page carrying more facts. It is also what
keeps this feature out of caricature: nothing in it says "use saturated colour
for India", because that is a stereotype rather than a commercial fact, and a
model given stereotypes returns them with interest.

## Architecture

### `skills/60-markets.md`

A new sliced skill, one block per market, marked `<!--#in-->` … `<!--/-->` —
the same mechanism `20-patterns.md` and `30-verticals.md` already use, read
through the same `sliceSkill` / `sliceIds` helpers. `SliceFile` gains
`"markets"`.

Each block is hand-written and states only things that are commercially true:

- the language the page is written in
- currency, and how a price is written (`₹2,499` · `$68.00` · `¥498`)
- payment methods a shopper expects to see named
- delivery expectation, in the terms that market uses
- the returns norm, with its window
- which trust signals carry weight there
- any line the law expects (GST included, VAT included, MRP)
- review culture — what a review looks like and how many is credible
- one or two sentences on how much a page is expected to say

No block describes colour, typography or layout. Those belong to the style the
merchant picked.

### The twelve

```
us · uk · in · cn · jp · de · fr · vn · id · br · gulf · au
```

Twelve rather than a long list, because a market is only worth offering when
there is a written block behind it. A picker with a hundred countries and no
knowledge behind ninety of them invites the model to invent the commercial
customs of Latvia, and an invented custom is worse than an absent one — the
merchant cannot tell which they got. Adding a market later is one block in one
file and one row in one array; no code changes.

### `market` on the brief

Optional, defaulting to `null`, exactly as `verticalSlug` is:

```ts
market: z
  .string()
  .nullable()
  .default(null)
  .refine((v) => v === null || isKnownMarket(v), "Unknown market"),
```

`null` means the merchant did not choose, and then every prompt is
byte-identical to what it is today. No second code path, and every brief saved
before this exists still validates.

### Where it is read

Three stages, because each decides something different:

| Stage | What market changes |
|---|---|
| 2a `deckPlan` | which **bands** a page has — a market may need one the default arc has no reason to include |
| 2b `sectionSpec` | what is **inside** them, and inside the buy box in particular |
| 3 `designServer` | the **words**, and which language they are in |

Each receives the market's own block, sliced — not the whole file.

### `components/brief/MarketPicker.tsx`

The same shape as `StoreTypePicker`: a list from `lib/briefOptions.ts`, one
selected value, nothing new invented.

## The language rule, rewritten

`skills/50-copy.md` currently says the page takes the language of the brief.
That becomes:

> The page is written in the market's language. A brief is the language the
> merchant speaks to us in; a market is the language they speak to their buyer
> in, and those are different jobs. With no market chosen, the brief's own
> language decides, as before.

The reason is recorded in the file, because a future reader finding two rules in
the git history deserves to know which case each was serving.

## Failure

An unrecognised market, or a market whose block is missing from the file,
resolves to `null` and the build proceeds exactly as it does without one. A
missing skill block must never cost a page.

## Testing

`scripts/test-market.ts`, modelled on `scripts/test-deckplan.ts`: no model
calls, assertions only.

- every id in `MARKET_IDS` has a block in `60-markets.md`, and every block has an
  id in `MARKET_IDS` — the two lists cannot drift apart silently
- an unknown market id slices to the empty string
- `isKnownMarket` accepts every listed id and rejects anything else
- **with `market: null`, the deck-plan and section-spec prompts are
  byte-identical to the same ask without the field** — the negative property,
  and the one that proves nothing existing moved
- the brief schema accepts a brief with no `market` key at all

## Out of scope

Palette, `20-patterns.md`, the element vocabulary, and the pattern skeletons are
untouched. Market changes which sections are chosen and what they say. It does
not add a pattern, remove one, or alter one.

Currency conversion, tax calculation and shipping rates are the merchant's
storefront's job. This feature writes what a page *says* about them, not what
Shopify charges.
