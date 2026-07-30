# Generation contract

This document pins the boundary between **the app** and **whatever produces the
mockups**. Today that producer is a local mock generator. Tomorrow it is a Claude
skill. Swapping them should be a one-file change.

If you change anything in this document, you are changing a public contract —
update `lib/generate/types.ts` and `app/api/generate/route.ts` in the same commit.

---

## 1. Where the seam is

```
lib/generate/
├── index.ts     ← THE SEAM. generatePages() lives here. Do not bypass it.
├── mock.ts      ← the current implementation. This is the file that gets replaced.
├── recipes.ts   ← pageRecipes: which blocks make up each page type
├── content.ts   ← copy engine: turns the brief into plausible strings
├── seed.ts      ← deterministic PRNG
└── types.ts     ← the wire types. Changing these is a breaking change.
```

Nothing outside `lib/generate/` may import `mock.ts`. The UI imports only
`lib/generate/index.ts`. One grep enforces this:

```sh
grep -rn "generate/mock" --include="*.tsx" components app   # must return nothing
```

## 2. The function

```ts
export async function generatePages(
  brief: Brief,
  onPageReady: (page: PageMockup) => void,
  signal?: AbortSignal,
  options?: GenerateOptions,
): Promise<PageMockup[]>;
```

| Parameter | Contract |
|---|---|
| `brief` | Already validated by `briefSchema`. The generator may assume it is well-formed. |
| `onPageReady` | Called **once per finished page, in catalog order**. This is what makes the generating screen fill card by card. A generator that resolves everything and calls this in a loop at the end is technically conforming but destroys the interaction — stream properly. |
| `signal` | Abort must stop work promptly and reject with an `AbortError`. Pages already delivered through `onPageReady` stay delivered. |
| `options.onPageFailed` | Per-page failure. **Do not throw for a single bad page** — report it and keep going, so 6 of 8 pages still reach the user. |
| `options.onlyPageIds` | Regenerate a subset. Used by "Retry those two". |
| `options.variants` | `pageId -> variant`. Bumped by "Regenerate this page". |

Return value is every page that succeeded.

### Failure semantics

There are exactly two failure modes, and they are not interchangeable:

- **Whole-run failure** — throw. The brief was unusable or the service is down.
- **Per-page failure** — call `onPageFailed` and continue. The UI shows
  "Couldn't build 2 of 8 pages" with a retry scoped to those two.

## 3. The types

`PageMockup` is the unit of exchange:

```ts
type PageMockup = {
  id: string;            // unique per requested mockup: "product-1", "lp-bfcm-3"
  pageType: string;      // catalog id: "product", "lp-bfcm"
  label: string;         // "Product"
  category: CategoryId;  // "core" | "trust" | "content" | "conversion" | "account" | "landing"
  categoryLabel: string; // the tag shown on the card: "Core", "Landing page"
  index: number;         // 1-based position in the run
  copyIndex?: number;    // "2" in "Product 2 of 3" — omitted when there is only one
  copyTotal?: number;
  tokens: MockupTokens;  // the resolved design system for this page
  vertical: Vertical;    // detected product category; picks drawn silhouettes
  refHints: RefHints;    // what was taken from the reference screenshots
  blocks: MockupBlock[]; // ordered, breakpoint-aware
  variant: number;       // 0 on first build, +1 per regenerate
  seed: string;
};
```

### Blocks, not markup

`MockupBlock` is a **discriminated union of 34 content shapes** — see
`BlockContent` in `types.ts`. A block carries data only:

```ts
{ id: "home-hero-1", kind: "hero", band: "base", content: { headline, sub, ... } }
```

It never carries HTML, CSS, class names or a rendered string. The renderer
(`components/mockup/MockupPage.tsx`) owns all presentation, and its `switch` is
exhaustive — **adding a kind to `BlockContent` without handling it there is a
compile error**, which is the intended pressure.

This is why the product can promise "no code is ever exposed": there is no
markup in the pipeline to expose.

### Reference images are DESIGN references

A reference image is a screenshot of a page whose **structure** the merchant
wants. It is not stock for the mockup. An early version pasted the upload into
every product slot and produced eight copies of the same screenshot — that is
the failure mode to avoid.

So the split is:

| | Comes from |
|---|---|
| Page structure, palette, spacing | the reference image |
| Product and lifestyle imagery | **drawn from scratch**, per detected vertical |

Each upload arrives already analysed by the client (`lib/imageAnalysis.ts`,
canvas, no network):

| Field | Meaning |
|---|---|
| `palette` | dominant colours, most prominent first (weighted histogram) |
| `layout` | a `LayoutFingerprint`: section bands with height, lightness, column count and kind, plus page density and whether it alternates light/dark |
| `dataUrl` | bounded copy. **Not rendered.** Kept so a vision-capable generator has the image to send. |
| `url` | object URL — the form thumbnail only |

`lib/refLayout.ts` turns fingerprints into `RefHints`, and the generator applies
them at these five points. A replacement generator should honour the same ones
or an upload stops visibly changing the output:

| Hint | Applied to |
|---|---|
| `heroLayout` | `hero.layout` — the single most recognisable structural choice on a page |
| `gridColumns` | `productGrid.columns`, `featureRow.columns` |
| `density` | `tokens.density`, overriding the style's own default |
| `sectionCount` | `fitRecipeToSections` trims **supporting** blocks only |
| `alternating` | `assignBands` switches to strict light/dark banding |

Colour precedence is fixed and must not be reordered — a swatch the merchant
added deliberately always outranks a colour inferred from a photo:

```
brandColors  >  hex codes typed in the prompt  >  palettes extracted from images
```

**What the analyser cannot do**, written out so nobody assumes otherwise: read
words, identify a typeface, tell a testimonial band from an FAQ band, or
understand hierarchy. It is signal processing on a screenshot — row variance for
section rhythm, column variance for grids, adjacent-pixel change to separate
text from photography. Real semantic layout understanding is the clearest thing
the Claude skill should add, and `RefHints` is where it should land.

### Breakpoint awareness

Blocks do not contain per-device variants. Each block renders at any of the four
widths (1440 / 1280 / 834 / 390) from the same content, because the block
components read the width from context. A generator must not attempt to emit
per-device content.

## 4. Determinism

Non-negotiable, and currently verified:

- Same `(brief, pageId, variant)` → byte-identical `blocks`. A device switch,
  zoom, remount or re-render must never reshuffle a page.
- `variant + 1` → a **different but equally reproducible** page. Both the
  headline and the hero layout must change, not only the product names — a
  regenerate that leaves the most visible element identical reads as a broken
  button.
- Repeated pages in one run (3 × BFCM) must differ from each other. The mock
  achieves this by seeding copy-rotation on `pageType + variant` (shared across
  copies) and separating with `copyIndex`.

`Math.random()` and `Date.now()` are banned inside the generator. Use
`makeRng(seed)` from `seed.ts`.

## 5. The HTTP route

`POST /api/generate` exists so the real generator has a server-side home the
moment it needs an API key.

```ts
// request
{ brief: Brief, onlyPageIds?: string[], variants?: Record<string, number> }

// 200
{ pages: PageMockup[], failures: GenerateFailure[] }

// 400 — body was not JSON
// 422 — { error: "Invalid brief", issues: ZodIssue[] }
```

The client currently calls `generatePages` directly rather than this route,
because streaming pages into the UI one at a time needs no server round-trip
while generation is local. When the Claude skill lands, the client switches to
this route (add SSE or chunked JSON to preserve streaming) and nothing else
changes.

## 6. Swapping in the real generator

1. Write the new producer with the same signature as `generatePages`.
2. Keep `onPageReady` streaming — do not batch.
3. Route per-page errors to `onPageFailed`.
4. Keep determinism per `(brief, pageId, variant)`, or the results gallery,
   PNG export and preview will disagree with each other.
5. Set `MOCK_MODE = false` in `mock.ts` and delete `options.failFirstN`
   (a mock-only test hook, reachable at `/design?pfd-fail=2`).
6. Move the call into `app/api/generate/route.ts` at the line marked
   `// TODO: call Claude skill here`, and switch the client to the route.

## 7. What the generator must never do

- Return HTML, CSS, JSX, class names or any renderable markup.
- Emit `lorem ipsum` or grey placeholder boxes as final content. Strings come
  from the brief; images are CSS-gradient compositions seeded per block.
- Throw because one page failed.
- Use unseeded randomness.
- Highlight more than one word per headline (`highlight` is a single index).
