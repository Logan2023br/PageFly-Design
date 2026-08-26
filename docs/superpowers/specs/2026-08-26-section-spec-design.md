# Section spec — the design model names the elements

## The problem this solves

Today the design model decides a page's *bands* and stops. For each band it
emits a pattern id, a rhythm (dark, padding, motion) and one sentence of brief.
Everything inside the band — which elements exist, how they nest, what moves —
comes from two other places: a static skeleton in `20-patterns.md`, and
DeepSeek's own judgement while it writes the page.

That split has a measurable consequence. The design call spends 3,274 output
tokens for two pages; the build call spends 47,108 for one of them. Roughly 93%
of the decisions that determine what a page looks like are made by the model
that was never asked to design anything. Two stores in the same trade come out
structurally near-identical, because the part that would differ is not the part
the design model controls.

Element-level motion shows the gap most plainly. The tree schema has supported
`anim: { hover, reveal, delay }` on every element from the start. Nobody fills
it deliberately: the deck plan names one motion id for a whole band, the pattern
file says nothing about motion, and DeepSeek rarely volunteers any. "A button
that lifts on press, beside an image that grows on hover" is expressible today
and never gets expressed.

## What changes

The design model also says, for every band, which elements are in it, how they
nest, how the space divides, and what each one does on hover and on scroll. The
build model receives that and fills in what only it can know: the words, the
type sizes those words need, and the photographs.

Text and images stay out of the spec deliberately. The design model writes
blind — it has not seen the copy — so a `font-size` chosen there is a guess, and
a headline of fourteen words under a size picked for four is a new class of
broken page. Layout does not have this problem: 44/56 is 44/56 whatever the
words turn out to be.

## Architecture

Four stages where there were three.

| | Module | Model | Calls | Decides |
|---|---|---|---|---|
| 2a | `lib/design/deckPlan.ts` *(unchanged)* | design role | 1 per build | which bands each page has, their order, signature, dark, padding, motion, brief |
| 2b | `lib/design/sectionSpec.ts` *(new)* | design role | 1 per page, concurrent | the elements inside each band, their nesting, layout and per-element motion |
| 3 | `lib/ai/designServer.ts` | default role | 1 per page | copy, type sizes, image queries |
| 4 | `lib/design/toPagefly.ts` *(unchanged)* | none | 0 | PageFly elements, zip |

**Why 2b is per page and 2a is per deck.** Stage 2a exists to make two page
types differ, which requires seeing them together in one answer; it is cheap
enough to keep whole. Stage 2b is the expensive half, and once 2a has fixed the
bands there is nothing left that needs cross-page awareness. Splitting it per
page makes cost grow linearly with deck size instead of racing the output
ceiling, lets the pages run concurrently, and confines a failure to one page.

## The seam

`OrderSection` already carries `brief`, a field the two older deciders leave
null and `deckPlan` fills. The spec follows that precedent exactly:

```ts
export type OrderSection = {
  role: SectionRole;
  pattern: string;
  brief?: string | null;
  signature: boolean;
  dark: boolean;
  padding: Padding;
  motion: string | null;
  mayHaveBg: boolean;
  /** the elements inside this band, when stage 2b ran and survived */
  spec?: SectionSpec | null;
};
```

Null means "nothing upstream knew", which is what every path other than 2b
produces. The prompt omits the block and the build behaves as it does today.
No existing decider changes.

## The spec's shape

```ts
/** What a text-bearing element is for, in type terms. Not a pixel size. */
export type Scale = "oversized" | "large" | "body" | "caption" | "eyebrow";

export type SpecNode = {
  /** an element type from the tree schema, or "row" / "col" */
  el: string;
  /** text-bearing elements only */
  scale?: Scale;
  /** layout: this child's share of the row, e.g. "44%" */
  basis?: string;
  /** layout: space between children, px */
  gap?: number;
  /** images: height ÷ width */
  ratio?: number;
  anim?: { hover?: string; reveal?: string; delay?: number };
  /** default false — a required node missing from the built tree is an error */
  optional?: boolean;
  children?: SpecNode[];
};

export type SectionSpec = { nodes: SpecNode[] };
```

Three closed vocabularies police it, all of them already defined in
`lib/design/schema.ts` and none of them new:

- `el` — the 20 element types plus `row` and `col`
- `anim.hover` — `float`, `shadow`, `grow`, `glow`, `float-shadow`, `grow-shadow`
- `anim.reveal` — `fade`, `fade-up`, `slide-left`, `slide-right`, `zoom`

An unrecognised value is dropped, not repaired — the same treatment invented
motion ids already get in `deckPlan.vet()`, and for the same reason: a
plausible-looking wrong id is worse than no id.

## What stage 2b is given

For one page: its bands from stage 2a, and **the pattern skeletons of exactly
the patterns those bands use** — sliced out of `20-patterns.md` by its
`<!--#id-->` markers, so 9 to 11 blocks rather than all 41.

This is what makes "review the skeleton, see whether it needs anything" real
rather than rhetorical. The model sees what the pattern already prescribes:

```
row gap 72 align center
  col basis 44% → eyebrow · section-head · body-lead · ×3 label+caption pairs
  image basis 56% ratio 0.82
```

and keeps it, adjusts it, or adds to it to suit that band's brief. The pattern
file becomes a starting point instead of the final word, without being edited.

## Binding vs. advisory

`enforceSpec()` — one function, two modes, read from `PLAN_BINDING`:

- **`false` (default)** — every non-optional node in the spec must appear in the
  built section. Missing is an error. Extra is allowed.
- **`true`** — extra is also an error.

Soft is the default on evidence from this branch: stage 2a already omitted a
required commerce band on a nine-row answer and needed a code repair. At
element scale, with fifteen to twenty nodes per section, omissions are more
likely, not less — and a build model forbidden to compensate turns each one into
a hole in the page. The design model also specifies without having seen the
copy, so a store whose story wants an eyebrow line should be able to get one.

The soft mode's required-list is exactly what the strict mode checks, so
tightening later is a change of flag, not of design.

Every section logs its delta regardless of mode, so the choice can eventually be
made on numbers:

```
section 5 · spec 5 · built 7 · added: divider, icon
```

## Failure

Stage 2b failing for a page — a call error, a truncated answer, unparseable
JSON, or an answer that does not survive vetting — sets `spec = null` for that
page's sections. That page builds exactly as it does today. Other pages are
unaffected, and the build does not die. This is the property that argued for one
call per page.

## Testing

`scripts/test-sectionspec.ts`, modelled on `scripts/test-deckplan.ts`: no model
calls, assertions only.

- an unknown `el` is dropped, and the surrounding node survives
- an unknown `anim.hover` and an unknown `anim.reveal` are dropped
- `delay` outside 0–6 is clamped, matching the tree schema
- a spec with no recognisable nodes yields null rather than an empty spec
- `enforceSpec` in soft mode: missing required → error; extra → pass
- `enforceSpec` in strict mode: extra → error
- `optional: true` nodes never produce a missing-node error
- the delta line counts additions correctly, in both modes

## Out of scope

`toPagefly.ts`, the renderer, the element vocabulary, and `20-patterns.md` are
all untouched. No new element types. Work continues on `struct-v2`.

## Cost

Stage 2b adds roughly 15,000–25,000 Opus output tokens for a two-page build —
about **+$0.45 per build**. A built section serialises to ~807 tokens with its
copy and CSS; a spec without either is estimated near 350, times 20 sections,
plus the model's own reasoning. Stage 3 should get slightly cheaper as it has
less to invent, but DeepSeek is cheap enough that the offset is small.
