# START HERE — automated rebuild of the PageFly Design pipeline

**You are Claude Code. This file is your work order. Execute it end to end.**

The human who handed you this package will not intervene until you are finished.
When you are done, write `VERIFY.md` at the repo root listing the one thing only
they can do (§9) and stop.

---

## What this changes, in one sentence

Move every design DECISION out of the model and into code, and leave the model
only the work it is good at: writing this store's words and choosing this
store's pictures.

That is why generated pages currently all look the same. The prompt hard-codes a
page skeleton and the model obeys it. The fix is not a better prompt — it is a
resolver in TypeScript that decides the structure, and a validator that checks
the model built what it was told to build.

## Ground rules

1. **Work on a new branch.** `git checkout -b design-v2`. Never push.
2. **Do not touch**: auth, `lib/db/`, the library screen, the admin screens, the
   PageFly export mechanics beyond the five nodes in §5.
3. **Do not change the models.** DeepSeek v4-flash stays the page designer and
   Haiku stays the vision reader. `lib/ai/provider.ts` is not part of this work.
   The entire premise is that DeepSeek does not need to be smarter — it needs to
   be asked less. If Phase 3 shows the reasoning saving is not there, report it;
   do not respond by swapping the model.
4. **Do not lower `maxTokens`** in `designServer.ts`. The comment there records
   why; a lower ceiling makes pages fail more often and a failed page burns the
   whole ceiling and returns nothing.
5. **Commit after every phase**, with the phase number in the message. If a
   phase's checkpoint fails, fix it before the next phase — do not carry a
   broken phase forward.
6. **Read `docs/SPEC-rebuild.md`** before writing any code. It is the design
   document; this file is the running order.

---

## Phase 0 · Baseline

Write `scripts/baseline.ts`. Read every stored design tree from the DB (find the
table in `lib/db/`) and, per page, compute:

- distinct section padding values
- distinct fontSize values
- share of sections with `textAlign:center`
- does the page contain an `accordion` node
- does it have at least one dark-background section
- how many sections are full-bleed (no container cap)
- distinct image aspect ratios
- section count, node count

Print a summary table: median, min, max, and the share of pages meeting each
threshold. Read-only — write nothing back.

```bash
npx tsx scripts/baseline.ts > baseline-v1.txt
```

**Checkpoint:** `baseline-v1.txt` exists and covers ≥100 pages. Commit it. This
is evidence, not a temp file — everything after this is measured against it.

If the DB is unreachable, write the script anyway, commit it, note the failure
in `VERIFY.md`, and continue.

---

## Phase 1 · Install the skill set

```bash
git rm skills/design-rulebook.md skills/animation-mechanics.md \
       skills/pagefly-template-builder.md skills/rulebook2.md \
       skills/selling-page.md

cp <package>/skills/*.md              skills/
mkdir -p skills/_sliced
cp <package>/skills/_sliced/*.md      skills/_sliced/
cp <package>/docs/SPEC-rebuild.md     docs/   # or repo root
cp <package>/docs/RUNBOOK.md          docs/
```

`selling-page.md` is the single largest cause of the sameness. It hard-codes
trust row under the hero, a three-number stat strip, a review band, exactly one
dark section, and the CTA three times. **Do not port any of it.** Its figures
`92% / 88% / 4.8` appear verbatim in shipped mockups because they are copied out
of §2 of that file.

The three files in `_sliced/` carry `scope: slice`, which the current loader does
not understand — it would treat them as `all` and send 12,400 tokens on every
call. They live in a subdirectory so `readdirSync` (which reads one level only)
cannot see them until Phase 2 lands.

**Checkpoint:** `/api/health` reports exactly
`["00-contract","10-composition","50-copy"]`. If `20-patterns` appears, a file
is in the wrong directory.

---

## Phase 2 · Slicing and the vertical id

Implement `docs/SPEC-rebuild.md` §1 and §8.1.

**§1 — `lib/ai/skills.ts`**
- Remove scope `export` entirely. Add scope `slice`.
- A `scope: slice` file is never returned by `loadSkills()`.
- Add `sliceSkill(file: "patterns"|"verticals"|"motion", ids: string[]): string`.
  Reads from `skills/_sliced/`, returns only the blocks between `<!--#id-->` and
  `<!--/-->`, in the order the ids were given. Unknown id → dropped, logged once.
  Empty result → `""`, never the whole file.

**§8.1 — `lib/briefOptions.ts` + `lib/verticals.ts`**

Every Step 1 chip must carry a slug matching a block id in
`skills/_sliced/30-verticals.md`. Change `SELL_EXAMPLES` to `{label, slug}[]`.
Store the label in `brief.whatYouSell` (free text still allowed) and the slug in
a new `brief.verticalSlug`. Leave `detectVertical` in place for free text only.

The current keyword matcher collapses 66 chips into 12 verticals and sends 27 of
them to `general`. `Footwear` resolves to `general` even though a `footwear`
vertical exists, because the keyword list holds `shoe` and `sneaker` but not
`footwear`. `Team sports & racket` resolves to `food` because `"Team"` contains
`"tea"`.

**Tests to write:**
- `sliceSkill("verticals",["personal-care-devices"])` returns one block containing
  `spec-grid-4x2`
- `sliceSkill("patterns",["does-not-exist"])` returns `""`
- every chip slug resolves to an existing block in `30-verticals.md`

**Checkpoint:** tests green, and all 66 chips map to a real block.

---

## Phase 3 · Measure the real output cost

Implement `docs/SPEC-rebuild.md` §7b before writing the resolver.

Hand-assemble three prompts in the §7 shape — `home`, `product`, `collection`,
one vertical — and call DeepSeek directly. `provider.complete()` already returns
`completion.reasoning`. Record input, output, reasoning, JSON for each and write
the table into `VERIFY.md`.

The whole plan rests on one claim: a model told which pattern to build does not
reason about which pattern to build. v1 measured ~14,000 reasoning tokens per
page. **If these three come back near 14,000, the claim is wrong** — say so
plainly in `VERIFY.md`. The pages will still be better; the saving will not be
there.

Half an hour, and it replaces three estimates with one number. Do not skip it to
save time.

---

## Phase 4 · The resolver and the validator — same commit

These two ship together. An order the model may ignore is worse than no order.

**`lib/design/plan.ts`** — `docs/SPEC-rebuild.md` §2. Deterministic, no model,
no network. `planPage(brief, pageType, seed)` returns a complete `Order`.

Two things that are easy to get wrong:

- **The seed is what makes two stores in the same vertical differ.**
  `sha256(domain | pageType | visualStyle)`, used to pick among the valid
  candidates for each slot. Same store rebuilding the same page must get the
  same plan; a different page type on the same store must get a different roll.
- **The resolver must not read `brief.prompt` or the reference images.** A
  merchant who filled in only Step 1 and Step 2 still gets a complete order.
  That is the guarantee that an empty brief cannot produce a basic page.

**Test (§2.4, mandatory):** `planPage()` with an empty brief, across all 66
verticals × 8 page types — 528 combinations. None may throw, none may return an
order without a signature slot, and every pattern id returned must exist in
`20-patterns.md`.

**`lib/design/audit.ts`** — §5. `audit(tree, order): string[]`, each entry one
line a model can act on. Check the list in §5, plus: every section's `pattern`
field equals the id it was ordered to build.

Wire into `designServer.ts`: after zod passes, run `audit()`. If it returns
anything, make **one** repair call — same system prompt, previous tree, the
failure list, nothing else. Never a second repair. Log the first-pass failure
count on the run record.

Put the whole path behind `USE_PLAN` (default true, env can disable). It is the
rollback.

**`designServer.ts` prompt assembly** — §7. Concatenate in this order and no
other:

```
[ 00-contract + 10-composition ]     stable prefix, cached for ever
[ sliceSkill patterns/vertical/motion ]  varies by page type
[ order + store facts ]              never cached
```

DeepSeek caches by prefix. Putting a slice before `00-contract` throws away the
entire cached prefix — it will look like it works and the bill will be several
times what it should be.

Then delete from the prompt every sentence that asks the model to weigh
something: `"vary it only with reason"`, `"when unsure, add space"`,
`"asymmetry beats symmetry"`. Each is reasoning tokens spent re-deciding what
the resolver already decided.

**Checkpoint:** 528-combination test green. Print the orders for three different
domains in vertical `skincare` — they must differ in at least 40% of slots. If
identical, the seed is not wired in.

---

## Phase 5 · The five new nodes

`docs/SPEC-rebuild.md` §3 and §4. Add to `lib/design/schema.ts`:
`overlay`, `sticky`, `beforeAfter`, `marquee`, `counter`, plus `pattern?: string`
on `section`.

Keep the global ban on `position`/`transform` in plain `css`. These five own
their positioning inside the builder, where it is tested once instead of
invented per page.

`overlay` is the important one. Today `position` and `transform` are banned
globally, so there is no way to put text on a photograph — which is why every
generated hero is *text column beside image column* and none of them resemble
the reference pages the merchant uploads.

Build them in `render.tsx` (mockup) and `toPagefly.ts` (export). `beforeAfter`
maps to the native `ImageComparison` element; `sticky` to FlexSection's
`isStickyBar` / `stickyPosition`. Check `MD Json PageFly/fields.md` for both.

**You cannot verify the export end-to-end** — that needs a human importing into
a real store. So: implement the native mapping, and where a fallback exists
(`Custom.HTML`), leave it behind a constant with a comment naming the condition
under which to switch. List all five in `VERIFY.md` §9.

---

## Phase 6 · The reference style read

`docs/SPEC-rebuild.md` §6. Keep the existing section list in `refVision.ts`; add
an eight-field STYLE block from the same Haiku call. Feed `heroKind` into
`planPage` as an override on the hero slot; the other seven go into the user
message as facts.

This is what makes a page *look like* the reference rather than merely follow
its running order.

---

## Phase 7 · Re-measure

```bash
npx tsx scripts/baseline.ts > baseline-v2.txt
```

Build twenty pages across several verticals first. Put both tables side by side
in `VERIFY.md` against these thresholds:

| metric | pass |
| --- | --- |
| ≥3 distinct section paddings | 95% of pages |
| ≥5 distinct font sizes | 95% |
| pages containing an accordion | **≤55%** — a choice, not a habit |
| pages with ≥1 dark band | ≥90% |
| pages with ≥2 full-bleed sections | ≥90% |
| slot overlap between two stores, same vertical | ≤60% |
| output tokens per page | ≤12,000 (v1 ≈ 20,400) |
| pages failing `audit()` on first pass | report it |

The last row is the one that matters after launch. Every repeated `audit()`
failure names a sentence in `skills/` that a model could not act on. Report the
top five failures in `VERIFY.md` — they are the next edit, and the edit belongs
in the skill file, not in code.

---

## §9 · What to write in `VERIFY.md`

Finish by writing `VERIFY.md` at the repo root containing:

1. **The one manual step.** `probe/node-probe.pagefly` must be imported into a
   real store and published. It contains one section per new node, each labelled
   on screen with what it tests and what "pass" looks like. The human checks five
   rows: overlay · sticky · beforeAfter · marquee · counter. Include the table
   from `docs/RUNBOOK.md` Phase 3 and say which fallback you left in place for
   each.
   Also ask them to note whether PageFly took the background image from
   `data.src` or from the CSS `backgroundImage` — the probe sets both on purpose
   — and whether it can be changed in the editor afterwards.
2. **The Phase 3 token table**, and whether the reasoning claim held.
3. **baseline-v1 vs baseline-v2**, against the thresholds above.
4. **The top five `audit()` failures**, with the skill file each one points at.
5. **Anything you could not do**, and why.

Do not push. Do not merge. Stop after `VERIFY.md`.
