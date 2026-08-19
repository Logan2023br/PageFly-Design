# PageFly Design — rebuild order

Read this whole file before touching anything. It replaces the design pipeline;
it does not touch auth, the DB, the library screen or the exporter's PageFly
mechanics.

The one sentence: **move every design DECISION out of the model and into code,
and leave the model only the work it is actually good at — writing this store's
words and choosing this store's pictures.**

That is how DeepSeek reaches the quality an expensive model reaches. Not by
being told more; by being asked less.

---

## 0 · Delete

```
skills/design-rulebook.md            → content lives on in 20/30, delete the file
skills/animation-mechanics.md        → content lives on in 40, delete the file
skills/pagefly-template-builder.md   → belongs to the exporter, not to a model
skills/rulebook2.md                  → replaced by 10-composition + 40-motion
skills/selling-page.md               → DELETE AND DO NOT PORT (see below)
```

`selling-page.md` is the single biggest cause of every page looking the same. It
hard-codes a page: trust row under the hero, a three-number stat strip, a
review band, exactly one dark section, the CTA three times. Every generated page
obeyed it, which is why every generated page has the same skeleton — and why the
figures `92% / 88% / 4.8` appear literally in shipped mockups: they are copied
out of §2 of that file.

Its useful content — proof matters, `compareAt`, review-writing — is now split
between `20-patterns.md` (as optional patterns the resolver may or may not
choose) and `50-copy.md` (as voice, not as structure).

Then drop in the six files of `skills/` v2.

---

## 1 · `lib/ai/skills.ts` — add slicing

Keep `loadSkills(scope)`. Add:

```ts
export function sliceSkill(file: "patterns"|"verticals"|"motion", ids: string[]): string
```

- reads `20-patterns.md` / `30-verticals.md` / `40-motion.md`
- returns only the blocks between `<!--#id-->` and `<!--/-->`, in the order the
  ids were given
- unknown id → dropped, and logged once
- empty result → return `""`, never the whole file

Remove the `export` scope entirely. Add `slice`. A file whose front matter says
`scope: slice` is never returned by `loadSkills()`.

---

## 2 · `lib/design/plan.ts` — NEW, and the heart of this

Deterministic. No model, no network, no tokens. Takes the brief and the page
type, returns a complete build order.

```ts
export type Order = {
  vertical: string;            // id straight from the Step 1 chip
  archetype: "A"|"B"|"C"|"D"|"E"|"F"|"G";
  sections: {
    role: string;              // hero | proof | media | content | conversion | utility
    pattern: string;           // id in 20-patterns.md
    signature: boolean;        // exactly one true
    dark: boolean;
    padding: "statement"|"standard"|"dense"|"utility";
    motion: string | null;     // id in 40-motion.md
  }[];
  motionIds: string[];         // union of the above, for sliceSkill
  patternIds: string[];
};

export function planPage(brief: Brief, pageType: string, seed: string): Order
```

### 2.1 Resolution order

1. **vertical** — `brief.whatYouSell` when it is a known chip slug. Free text
   falls back to a keyword match, but the chip path must be exact. *Delete
   `detectVertical` from the design path entirely.*
2. **archetype** — from the vertical row, unless the reference reading says
   otherwise.
3. **arc** — a page-type table of slot ROLES (below), not patterns.
4. **pattern per slot** — for each slot, take the candidate list for that role,
   remove anything in the vertical's `ban`, put the vertical's `signature` and
   `hero` first, and pick with `seed`.
5. **signature slot** — the vertical's signature pattern if the arc has a slot
   for it, otherwise the first `media` slot.
6. **padding + dark** — walk the sections and assign so the result satisfies
   composition: ≥3 distinct paddings, ≥1 dark, no two dark adjacent, the
   signature gets `statement`.
7. **motion** — one signature effect (from the vertical's register), plus reveal
   and hover. Never more than three ids.

### 2.2 The seed — this is where per-store difference comes from

```ts
seed = sha256(`${storeDomain}|${pageType}|${brief.visualStyle}`)
```

Two stores in the same vertical, same style, same page type get **different**
pattern choices because the domain differs — but both choices are from the
validated candidate list, so both are good. This is the mechanism that answers
*"mỗi store trong cùng ngành phải khác nhau"* without asking a model to be
randomly creative, which is how v1 got randomly bad instead.

Rotation must be stable: the same store rebuilding the same page gets the same
plan. A different page type on the same store gets a different roll, so a
10-page deck is varied inside itself and coherent as a set.

### 2.3 Page-type arcs

Roles only. Patterns are resolved per role.

```
home        hero · utility(trust) · media · proof · content · media · proof · conversion
product     hero(product) · utility(trust) · proof(spec) · media · content · proof(reviews) · content(faq) · conversion
collection  hero(header) · utility(filter) · content(grid) · media · content(guide) · conversion
about       hero · content(story) · media · proof · content · conversion
lp-*        hero · utility(trust) · content(problem) · media · proof · conversion(offer) · proof(reviews) · content(faq) · conversion
faq         hero(compact) · content(faq) · conversion
contact     hero(compact) · conversion(form) · utility
```

Counts stay as `sectionPlan.ts` has them today — that table is correct and
should be kept, minus the `detectVertical` call.

### 2.4 The zero-input guarantee

**The order is always complete.** A merchant who filled in only Step 1 and Step 2
still has: vertical → archetype, signature, hero pattern, ban list, motion
register, proof vocabulary; style → tokens; seed → pattern rotation. Nothing in
the resolver reads `brief.prompt` or the reference images.

Step 4 and Step 5 only *narrow* an order that is already complete:

| the merchant gave | what changes |
| --- | --- |
| nothing | the plan above, verbatim |
| prompt text | copy angle, and the model may swap ONE slot's pattern |
| reference images | section ORDER comes from the reading; patterns still come from the resolver |
| reference + prompt | both |

So an empty brief cannot produce a basic page, because the page's structure was
never the model's job. This must be enforced by a test: `planPage()` with an
empty brief for all 66 verticals × 8 page types must produce an order that
passes the validator in §5.

---

## 3 · `lib/design/schema.ts` — five new nodes

The current schema makes the pages in the reference screenshots impossible to
build. `position` and `transform` are banned globally, so there is no way to put
text on a photograph — which is why every generated hero is *text column beside
image column*, and why none of them look like the pages the merchant pointed at.

Add:

```ts
overlay      { query, ratio, scrim: "left"|"bottom"|"full"|"none",
               align: "bottom-left"|"center"|"top-left", children[] }
sticky       { edge: "bottom"|"top", mobileOnly?: boolean, children[] }
beforeAfter  { beforeQuery, afterQuery, beforeLabel, afterLabel }
marquee      { speed, children[] }
counter      { value, suffix, prefix, label }
```

Keep the global ban on `position`/`transform` in plain `css`. These five nodes
own their positioning inside the builder, where it is tested once instead of
invented per page.

Also add `pattern?: string` to `section`, so the validator can check a section
against the pattern it was ordered to be.

---

## 4 · `lib/design/toPagefly.ts` + `render.tsx` — build the five

| node | mockup | .pagefly |
| --- | --- | --- |
| `overlay` | absolutely-positioned col over an img, gradient scrim | FlexSection with `backgroundImage` + `filterColor`, content in the flex container |
| `sticky` | `position:sticky` | FlexSection `isStickyBar:true`, `stickyPosition` |
| `beforeAfter` | two imgs + range input | `ImageComparison` / `BeforeAfter` element — it exists in the element model |
| `marquee` | duplicated track, CSS keyframes | Custom.HTML + page stylesheet, track duplicated at build time |
| `counter` | number, animates on reveal | text node + one line in the page's custom JS, next to the reveal observer already there |

`beforeAfter` and `sticky` map to real PageFly elements — check
`MD Json PageFly/fields.md` for `ImageComparison`, `initialPosition`, and
FlexSection's `isStickyBar` / `stickyPosition` / `triggerSectionId`.

**Verify each of the five by importing a hand-written .pagefly into a real store
before wiring the model to emit it.** This is half a day and it removes the
biggest risk in the plan.

---

## 5 · `lib/design/audit.ts` — NEW. The loop that was missing

Runs on the returned tree. Deterministic, zero tokens.

```ts
export function audit(tree: DesignTree, order: Order): string[]
```

Checks, each returning a one-line message the model can act on:

```
type roles used < 4                            → B5
distinct section paddings < 3                  → B19
full-bleed sections < 2                        → B25
dark sections == 0, or two adjacent            → B3
distinct image ratios < 3                      → B6
centred sections > 2                           → B2
signature section missing or not the largest   → §6
a repeated group with non-identical slots      → B4
a stat-value with no unit                      → B16
two adjacent sections with the same role       → rhythm
a section whose `pattern` is not the ordered id
copy containing a banned adjective             → B11
any heading that would survive substitution    → heuristic: <6 words and no digit,
                                                  material noun or proper noun
```

If `audit()` returns anything, send **one** repair call: the same system prompt,
the previous tree, and the failure list. Nothing else. Input is cached, so a
repair costs roughly the output of the fixes.

Today `designServer.ts` only checks `sections >= 2 && nodes >= 12` — it blocks
an empty page and nothing else. This is the single change that most improves
average quality, and it is the one thing an expensive model was doing by hand
in the comparison build: it was told what was wrong and asked to fix it.

---

## 6 · `lib/ai/refVision.ts` — add a style read

Keep the section list. Add a second, tiny read and send both.

```
STYLE: {"heroKind":"full-bleed-overlay|split|centered|product-lead|type-only",
        "displayScale":"very-large|large|medium",
        "fontMood":"grotesk|serif-display|mono|rounded",
        "accentUse":"one-word-in-headline|buttons-only|widespread",
        "imageMood":"lifestyle|studio-white|macro|documentary",
        "surface":"light|dark|alternating",
        "density":"airy|normal|tight",
        "corner":"square|soft|pill"}
```

Eight fields, ~80 tokens in the prompt, one Haiku call per build. This is what
makes a page *look like* the reference rather than merely follow its running
order — and it is the gap the merchant is describing when they say the output
does not resemble the page they uploaded.

Feed `heroKind` into the resolver as an override on the hero slot. Feed the rest
into the user message as facts.

---

## 7 · `lib/ai/designServer.ts` — assemble the new prompt

**The order of concatenation is not cosmetic — it decides the cache bill.**

DeepSeek caches by prefix. In v1 the system prompt was byte-identical on every
page ever built, so 5,282 of 5,852 input tokens were cached and only the ~570
of user message were paid at full rate. In v2 the slices change with the page
type, so the cached prefix ends where the slices begin. Uncached input per page
goes from 570 to ~1,760 — three times more — and cached input is roughly a
tenth the price.

Concatenate in this order, longest-lived first:

```
[ 00-contract + 10-composition ]   2,993   identical for every page, for ever
[ sliced patterns/vertical/motion ] ~1,400  identical when page type + vertical repeat
[ order + store facts ]              ~400   never cached
```

Putting a slice before `00-contract` throws away the whole prefix. It will look
like it works, and the bill will be four times what it should be.

```
system  = 00-contract + 10-composition                    // stable prefix
        + sliceSkill("patterns",  order.patternIds)       // varies by page type
        + sliceSkill("verticals", [order.vertical])
        + sliceSkill("motion",    order.motionIds)

user    = store facts (sell, prompt, store type)
        + palette and faces
        + THE ORDER — one line per section:
            "3 · proof · spec-grid-4x2 · dark · standard · signature:no · motion:spec-bar-fill"
        + reference style read, when there is one
        + "Return the JSON object now."
```

Delete from the prompt: every sentence that asks the model to weigh something.
`"vary it only with reason"`, `"when unsure, add space"`, `"asymmetry beats
symmetry"`. Each of those is a paragraph of reasoning tokens, billed against the
output ceiling, producing a judgement the resolver has already made.

Expect output tokens to fall. The measured cause of 25–48k output was ~70%
reasoning; a model choosing between eight patterns thinks, a model told which
pattern to build writes. Re-measure and lower `maxTokens` only after three
clean builds, never before.

---

## 7b · Measure the real output cost BEFORE writing `plan.ts`

Half an hour, and it replaces three guesses with one number.

Hand-assemble three prompts in the §7 shape — `home`, `product`, `collection`,
one vertical — and call DeepSeek directly. `provider.complete()` already returns
`completion.reasoning`, so read it.

```
page        input   output   of which reasoning   JSON
home
product
collection
```

The whole plan rests on one claim: a model told which pattern to build does not
reason about which pattern to build. v1 measured ~14,000 reasoning tokens per
page. If these three come back near 14,000 as well, the claim is wrong and the
saving is not there — the pages will still be better, but budget for the same
spend, not less.

Do this after §1 and §2 land and before the day goes into §2's resolver.

## 8 · `/design` — four UI changes

**8.1 Step 1 chips must BE the vertical.** Today 66 chips collapse to 12
verticals through substring matching, and 27 of them land on `general` —
including `Footwear`, which has its own vertical the matcher never reaches
because the keyword list holds `shoe` and `sneaker` but not `footwear`. `Team
sports & racket` resolves to `food` because `"Team"` contains `"tea"`. Give each
chip a slug, store the slug, and let free text be the only thing that needs
guessing.

**8.2 Split Step 5 into two intents.** A merchant uploading a screenshot means
one of two different things and the app treats them as one:

```
[ ] Match the layout    — which sections, in what order
[ ] Match the style     — type scale, colour weight, photography, hero shape
```

Both by default. This is a checkbox pair, not a new step.

**8.3 Give Step 3 a job or remove it.** `storeType` is twelve options that
produce one line of prompt text and pick nav links for a static mockup. Either
route it into the resolver — dropshipping weights trust and guarantee slots,
B2B swaps the buy box for a quote form, single-product drops the collection arc
— or delete the step and save the merchant a click.

**8.4 Add one optional field: the product URL.** The store domain is already
known and nothing fetches from it. One Storefront API call returning five
products — real titles, real prices, real images — would do more for
personalisation than anything else on this list, and it *reduces* tokens because
the model stops inventing names. Optional, one line, under Step 1.

Not changing: Step 2. Fifteen styles, and the style name and blurb already reach
the prompt correctly.

---

## 9 · Order of work

| # | task | why first |
| --- | --- | --- |
| 1 | **Baseline script**: score the 121 existing pages — distinct paddings, distinct font sizes, % centred sections, % pages with an accordion, % with a dark band | without a before-number, nothing after this is measurable |
| 2 | Chip → vertical slug (8.1) | one afternoon, and it unblocks the resolver |
| 3 | Hand-import test of the five new nodes (§4) | if `overlay` will not import, the plan changes |
| 4 | `sliceSkill` + drop in the six skill files | prompt shrinks, rulebook finally reaches a model |
| 5 | `plan.ts` resolver + arcs | the structural fix |
| 6 | `audit.ts` + one repair call | the quality fix |
| 7 | `refVision` style read | the "looks like my reference" fix |
| 8 | Re-measure against step 1 | |

Steps 1–4 are independently shippable and already worth having. Step 5 is the
one that cannot be half-done: an order the model may ignore is worse than no
order, so `pattern` must be validated in `audit()` the same day the resolver
lands.

## 10 · How to know it worked

Re-run the baseline script from step 1 on twenty new pages.

| metric | v1 baseline | target |
| --- | --- | --- |
| distinct section paddings per page | measure it | ≥3 on 95% of pages |
| distinct font sizes per page | measure it | ≥5 |
| pages containing an accordion | measure it | ≤55% — it should be a choice, not a habit |
| pages with ≥1 dark band | measure it | ≥90% |
| pages with ≥2 full-bleed sections | measure it | ≥90% |
| pattern overlap between two stores in the same vertical | measure it | ≤60% of slots identical |
| output tokens per page | ~20,400 | ≤12,000 |
| pages failing `audit()` on the first pass | n/a | track it — this is the number that tells you which skill file is unclear |

The last row is the one to watch after launch. Every repeated `audit()` failure
is a sentence in `skills/` that a model could not act on, and it names the file
to fix.
