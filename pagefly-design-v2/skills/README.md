# Skills — v2

Six files. Two go into every prompt; three are sliced at runtime; one is for the
copy call only.

| file | scope | how it is loaded | tokens sent per page |
| --- | --- | --- | --- |
| `00-contract.md` | `design` | whole, always | ~1,180 |
| `10-composition.md` | `design` | whole, always | ~1,810 |
| `20-patterns.md` | `slice: pattern` | **only the 4–7 blocks the order names** | ~920 |
| `30-verticals.md` | `slice: vertical` | **exactly 1 block** | ~95 |
| `40-motion.md` | `slice: motion` | **2–4 blocks** | ~420 |
| `50-copy.md` | `copy` | whole, copy call only | — |

Measured on a real order (home page, `personal-care-devices`, 8 sections):

| | v1 | v2 |
| --- | --- | --- |
| total input | 5,852 | 5,184 |
| of which describes THIS store | 265 · **4.5%** | 760 · **14.7%** |
| rulebook reaching a model | 0 of 41,000 | all of it, 1,435 at a time |

Input barely moves. That is fine — input is 99% cached and nearly free. The
number that matters is the second row, and the one that pays is output: the
model is no longer choosing a structure, so it is no longer reasoning about one.

Whatever is mechanically checkable was moved OUT of the prompt and into
`audit()`. Nineteen of the twenty-seven ban-list rules are now code. Only the
eight a validator cannot see are still words.

## The slicing contract

A sliced file is a set of blocks, each delimited by an HTML comment carrying its
id:

```
<!--#hero-full-bleed-scrim-->
…the block…
<!--/-->
```

The loader (`lib/ai/skills.ts`) must expose `sliceSkill(name, ids[])`. Anything
outside a block — the front matter, the `<!-- … -->` preamble, the `##` group
headings — is never sent. An id that does not exist is dropped silently, and a
request that ends up empty falls back to the file's documented default rather
than sending nothing.

Ids are stable. Renaming one breaks the resolver in `lib/design/plan.ts`, so
rename in both places or not at all.

## Why nothing has `scope: export` any more

In v1 the three biggest files — the 61-vertical rulebook, the 162-pattern
animation reference and the template builder — all carried `scope: export`,
which in `skills.ts` means *reaches no model at all*. Forty-one thousand tokens
of design knowledge were written, committed, and never read by anything.

There is no `export` scope in v2. If a file is here, a model receives some of
it. Knowledge that belongs to the TypeScript exporter belongs in the exporter,
not in `skills/`.

## Adding a vertical

Add a block to `30-verticals.md` with an id matching the Step 1 chip slug, and
add the chip to `lib/briefOptions.ts`. Nothing else. The resolver reads the id
straight from the brief — there is no keyword matching to update, and no
`detectVertical` to fool.

## Adding a pattern

Add a block to `20-patterns.md`, then reference the id from at least one
vertical row or one page-type arc in `lib/design/plan.ts`. A pattern nothing
references is a pattern that is never sent.

Every pattern block states, in this order: what it is · the tree with real
numbers · the one rule that makes it work · what it fails at. If you cannot
write the failure mode, the pattern is not understood well enough to ship.

## Adding an effect

Add a block to `40-motion.md` **with working code**, and confirm two things
before committing:

1. It renders correctly in the PageFly editor canvas, where custom JS does not
   run. Anything JS-driven must be visible in its resting state.
2. It respects `prefers-reduced-motion`.

v1 held 162 documented effects and shipped none of them. Sixteen that work beat
a hundred and sixty-two that were researched.
