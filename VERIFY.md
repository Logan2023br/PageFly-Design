# VERIFY — four changes on `design-v2`

Written after the fact, from what was actually run. Where something was not
verified it says so by name; a claim with no way to check it is worse than a gap.

| | commit | build |
|---|---|---|
| 1 | `b96b8e4` The empty CTA button was a container that lost its child | green |
| 2 | `93e62b9` The buy box is allowed to be dense | green |
| 3 | `bdf06ba` A filing reaches the trade it was filed for | green |
| 4 | `7f60efd` A filed reading also reaches the merchant who uploaded | green |

Nothing pushed, nothing merged. `design-v2` is four commits ahead of its remote.

---

## 1 · The real cause of the empty button

**It was not the model, and it was not the exporter. It was the schema deleting
the evidence and the builder keeping the paint.**

The order of investigation was: is `button.text` empty in the tree → if it is
not, a render or export bug → if it is, the model. The answer turned out to be
none of the three, and the reason no one had found it is that by the time you can
look at the tree, the thing that went wrong is gone.

What happens, in order:

1. The model writes a CTA band whose button has a label the schema will not take
   — empty, whitespace, or one of the placeholder strings `saying()` refuses.
2. `saying()` refuses it. Correct: a button with nothing on it is not a button.
3. `list()` drops the refused child. Also correct, and this is the rule at the
   top of `schema.ts` working as designed — coerce, clamp, truncate, drop, never
   reject. A page is not thrown away over one bad leaf.
4. **The button's parent survives, with its `background`, its `padding` and its
   `radius` intact and nothing inside it.** That is the small accent rectangle in
   the screenshot. It is not a broken button; it is a correctly-emptied container
   still carrying the paint that was only ever there to frame a button.

So the tree that reaches the exporter is internally consistent and the exporter
is right to render it. `renderer` and `toPagefly.ts` both faithfully draw an
orange box, because that is what the tree says.

**The fix — `kids()` in `lib/design/schema.ts`.** A container that was given
children and ended up with none is refused, and the parent's own `list()` then
drops the container:

```ts
if (asked > 0 && got.length === 0) {
  ctx.addIssue({ code: "custom", message: "every child was dropped; the container is paint around nothing" });
  return z.NEVER;
}
```

Applied to `row` and `col`. **Empty-in stays empty-out** — a container the model
wrote with `children: []` is a rail, a spacer, a coloured band, and all three are
real. The distinguishing fact is not "is it empty", it is "was it asked for and
then lost". `scripts/test-schema.ts` covers both halves: the exact CTA band from
the screenshot loses its `col` and keeps its heading; a deliberate 2px rail with
`children: []` survives.

**The audit rule was added regardless**, as instructed, because a schema fix only
covers the shape that was found. Three rules, all counts:

```
button labels with < 2 characters, and with > 40
containers with paint and no children  (belt and braces to kids())
```

Nothing in them names a value. `> 40` is a length, not a label.

**Not verified:** whether the model would still write a labelless button if asked
again. The change makes the case harmless rather than impossible, which is the
right order — the model is not under our control and the schema is.

---

## 2 · The buy box is allowed to be dense

The `product-detail-gallery` block of `20-patterns.md` carried a prohibition
broad enough to forbid the thing it was trying to protect. Replaced with the
supplied text, verbatim, including the line that is the whole point:

> Do not fix a shape. What goes in `extras` comes from the vertical and from the
> filed reference for this element, never from this file.

`gallery true` guidance kept. The fails-when line now reads: *a display heading
is added above the product and the price lands at 900px* — a measurable failure
rather than a banned ingredient.

**One audit rule, and it counts:**

```
a section whose planned pattern starts with "product-detail"
must have >= 2 rows in product.extras
```

Two, not four, and no opinion about what is in them. The rule blocks a buy box
that is a price and a button; it has nothing to say about whether a store shows
a size chart, a shipping line, a stock indicator or a bundle picker. That choice
belongs to the vertical, to Training Design and to the model, which is exactly
what the replaced text says.

---

## 3 · Migration status, and how many rows moved

**The migration has not run against Postgres. Not once.**

Local development has no `DATABASE_URL` and no `.env.local` entry for one, so
`getRepo()` returns the file-backed driver every time. Everything asserted about
Task 3 was asserted against `lib/db/memoryRepo.ts`.

**Rows set to `vertical = null`: zero, and the count is zero because there is
nothing to count.** `.pfd-dev-db.json` has no `trainingSections` key at all —
the feature shipped to `main` days ago and no filing has been saved on this
machine since. Training *templates* is also 0. So the local run is not evidence
that the migration preserves data; it is evidence that it runs on an empty
table.

What *is* verified:

- The DDL is idempotent by construction — `add column if not exists`,
  `create unique index if not exists`, and a `drop index if exists` for the old
  single-column one. It is safe to run repeatedly, which is how it will run,
  since it executes on connect.
- `coalesce(vertical, '')` in the unique index, because Postgres treats NULLs as
  distinct and two shared filings for one element would otherwise both be
  allowed. This is the single most likely thing to have been got wrong and it is
  the reason the index is not simply `(lower(element), vertical)`.
- The preference order, in `scripts/test-training.ts`: exact trade wins, absent
  trade falls back to the shared filing, no trade named still finds the shared
  filing, an element with no filing at all returns null, and element matching is
  case-insensitive so the two drivers agree with the `lower(element)` index.
- Old rows read as shared rather than as broken. `memoryRepo` maps
  `vertical: t.vertical ?? null` on load, and `test-training.ts` asserts a row
  written without the field comes back `null`, not `undefined`. In Postgres the
  new column is nullable with no default, so an existing row is `NULL` the
  moment the column is added — the migration is the whole of the data change,
  and there is no `UPDATE`.

**What to do on the VPS, before trusting any of it:** with `DATABASE_URL` set,
count `training_sections` before and after the first request, and confirm the
count is unchanged and every pre-existing row has `vertical IS NULL`. Until that
is done, this section is a design argument, not a verification.

Also in Task 3: the analysis is capped on the way into the prompt at
`MAX_PROMPT_CHARS = 1440`, about 400 tokens, cut on a line boundary. The stored
reading stays at 3,000 characters — that cap is for the operator reading a card,
and shortening it to save prompt tokens would be paying for the analysis and then
throwing away the part worth having.

---

## 4 · MAX_TRAINING is 3

**Raised from 2, and the raise is a consequence of the change rather than a
separate tuning decision.**

Before this commit a filing was only ever read for a merchant who uploaded
nothing. Two slots were enough for that population: the signature band and the
commerce band, the one the page spends its room on and the one that sells
something. The other six sections already have a resolved pattern.

Now that a filing also reaches the merchant who *did* upload, the same two slots
have to share with a section list that names four to eight bands. Three adds the
slot after the first two — on most page types the proof band — which is also the
third thing an operator actually bothers to file.

Three and not more, for a reason that is measured rather than felt. Each filing
enters at ~400 tokens in the part of the prompt that is **not** cached, and the
input is not even the main cost: Phase 3 measured that a more precise spec buys
*more* reasoning, not less. The slots are ordered by how much a band needs help,
so the fourth filing is by definition the least useful one, bought at the same
price as the first.

**The behaviour change itself.** Line ~448 was:

```ts
...(input.refSections?.length ? [] : await trainingLines(order)),
```

and is now unconditional. The two sources answer questions at different scales —
the reference decides which sections and in what order, a filing decides how one
element is built inside one band — so they were never two answers to one
question. A screenshot cannot show the inside of a buy box, which means the old
line lost detail and gained nothing, and lost it for the merchant who had gone to
the most trouble.

When they *do* disagree, the prompt now says who wins, and only when there is
something to rank:

> The merchant's reference decides WHICH sections and in what ORDER. These
> filings decide how the individual elements are BUILT. When they disagree, the
> reference wins on sequence, the filing wins on detail.

`scripts/test-prompt.ts` (new) asserts this against a stubbed provider — no key,
no network, no bill. It checks that the filing is in the prompt with and without
a reference, that the ranking line appears only with one, that the merchant's own
section list is present at the same time, and that the ranking is stated before
the filings it applies to. Worth writing because **none of this is visible to the
type checker**: a spread of an empty array typechecks perfectly, which is how the
behaviour stayed wrong for as long as it did.

---

## Not done, and why

- **Postgres migration unexercised.** No database available locally. Detailed
  above with the two queries to run on the VPS.
- **The Training Section save path is still only typechecked end-to-end.** The
  route, the DDL and the UI agree about the `vertical` column by inspection and
  by unit test. Nobody has clicked Add, picked an industry, and watched Haiku
  write a reading into a real database.
- **No page has been generated with a filing present.** `test-prompt.ts` proves
  the filing reaches the prompt; it stubs the model, so it cannot say whether the
  model builds a better buy box for having read it. That needs one real run with
  one real filing, and it is the only thing that answers "did this work".
- **`MAX_TRAINING = 3` is not measured.** The reasoning is Phase 3's measurement
  applied to a new case, not a new measurement. If the first real run with a
  reference comes back truncated, this is the first number to look at.
- **A broken build was committed and then amended.** `bdf06ba` originally landed
  with a type error in `scripts/test-training.ts` — a nullable database column
  passed to a `string | undefined` parameter. `npx tsc --noEmit` catches it in
  one second; I had run the build in the same command chain as the commit and
  read only the tail of the output. The commit was amended rather than followed
  by a fixup, so the branch has no red commit in it, but the mistake was mine and
  it is recorded here rather than hidden by the amend.

## How to re-run everything

```
npx tsc --noEmit -p tsconfig.json     # covers scripts/ — the build's check does too
npm run build
npx tsx scripts/test-schema.ts        # task 1 — the emptied container
npx tsx scripts/test-training.ts      # task 3 — the preference order
npx tsx scripts/test-prompt.ts        # task 4 — what reaches the prompt
npx tsx scripts/test-plan.ts          # 2,970 orders
npx tsx scripts/test-export.ts        # 101 checks against a real .pagefly
npx tsx scripts/test-surface.ts
```

All seven pass as of `7f60efd`.
