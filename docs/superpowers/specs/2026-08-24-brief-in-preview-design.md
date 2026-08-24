# The brief, readable from the page it produced

## What this is

A merchant looking at one page in the preview overlay can press **Brief** and
read the brief that produced *that* page. The mockup is replaced by the brief
in the same area; pressing again brings the page back exactly as it was.

Read only. Editing a brief is what `editBrief()` already does.

## Why it is not just "show the brief"

`loadLibrary` merges **every saved run** into one deck, and each run has its own
brief. It keeps only one:

```ts
// lib/store.ts:584
brief: runs.at(-1)?.brief ?? null,
```

So in the Library a merchant reading page 3 — built from run A — is looking at a
store whose `brief` is run Z's. Any panel that renders `useStore(s => s.brief)`
would confidently show the wrong brief for every page outside the last run, and
would look right while doing it. That is the failure this design exists to
prevent, and it is why the association has to be carried rather than assumed.

The data is already there. `LibraryScreen.tsx:78` builds

```ts
decks = [{ id, brief, variants, snapshot }]
```

one entry per run, and hands it to `loadLibrary`, which uses `brief` only for
that one line above. Nothing needs fetching; something needs keeping.

## The association

Two additions, both written at the two lines in `loadLibrary` that already
namespace a page id per run:

```ts
// State
briefs: Record<string, Brief>   // run id → the brief that run was built from.
                                // Empty for a normal build.

// PageMockup
runId?: string                  // set only when the page came from the Library
```

and one resolver, exported beside them:

```ts
briefForPage(page) => page.runId ? briefs[page.runId] : brief
```

`runId` is optional, so a deck saved before this exists and a normal build both
keep working — absent means "the brief in state", which is exactly right when
there is only one.

### Why not parse the id

`loadLibrary` already writes `` `${run.id}::${page.id}` ``, so the run is
recoverable by splitting on `::`. It is not done, for one reason: nothing in the
codebase reads that convention back. Grep finds two writers and no readers — the
namespacing exists so ids do not collide across runs, not as an encoding. Adding
the first reader would make a string format load-bearing, and it breaks silently
the day a run id contains `::`. Writing `runId` costs the same line and says what
it means.

### Why not put the whole brief on the page

`PageMockup` is serialised into every run's snapshot. A brief carries the prompt,
the colours and the reference-image list; copying it onto each of a deck's pages
would repeat it N times in storage to answer a question one map already answers.

## The panel

`components/preview/BriefPanel.tsx`. Presentational: takes `brief: Brief`, reads
no store, so it can be rendered anywhere a brief is in hand and tested by being
handed one.

| Row | Source | Note |
|---|---|---|
| Sells | `whatYouSell`, plus `verticalSlug` when set | the slug is the trade the resolver actually used |
| Store | `storeType` → `STORE_TYPES` label | |
| Style | `visualStyle` → `VISUAL_STYLES` label (`lib/styleTokens.ts:156`) | |
| Pages | `describeSelection(pages)` (`lib/pageCatalog.ts:458`) | already drops zero counts, already folds landing pages, already says "No pages selected yet" — reused, not rewritten |
| Colors | `brandColors` | swatch + hex, so the value is copyable and not only visible |
| Prompt | `prompt` | line breaks preserved; the row is omitted when empty |
| References | `referenceImages` | see below |

### Reference images degrade, and the panel says so rather than pretending

`runPayload.ts:39-43` strips reference images when a run is saved:

```ts
referenceImages: brief.referenceImages.map((img) => ({
  ...img, url: "", dataUrl: undefined,
})),
```

`id` and `name` survive; the pixels do not. So:

- a build from this session → thumbnails
- a page reopened from the Library → the file names, as plain text

The panel renders whichever it has. It never shows a broken image element, and
it does not claim there were no references when there were.

## Wiring into PreviewOverlay

- A **Brief** button in the toolbar beside Scrub and Regenerate, `aria-pressed`,
  label hidden below `lg` like its neighbours.
- Keyboard **`b`**, and a matching line in `SHORTCUTS` — the panel that
  advertises the keys has to know about this one.
- Toggling swaps what fills the stage area. The toolbar does not move.
- **Esc closes the brief first**, and only closes the overlay when the brief is
  already shut. Today `Escape` calls `close()` unconditionally; leaving that
  would make one key do two jobs and lose the merchant's place.
- **← →** while the brief is open keeps it open and shows the next page's brief.
  In the Library, stepping through pages while watching the brief change is the
  whole point.
- The mockup is **hidden, not unmounted**, so scroll position, zoom and device
  survive the round trip. Remounting it would silently reset all three — the
  overlay already relies on remount-to-reset elsewhere, deliberately, and this is
  the case where that behaviour is wrong.

## Failure and absence

- No brief resolvable for a page (a `runId` with no entry, a deck restored oddly)
  → the panel says the brief for this page was not saved. It does not fall back
  to a different run's brief: showing the wrong brief confidently is the bug this
  design is built around.
- Empty optional fields (no prompt, no colours, no references) → those rows are
  omitted, not rendered blank.

## Verification

There is no React test harness in this repo — every script under `scripts/` is a
node program run with `tsx`. So the split is:

**Tested in `scripts/test-brief.ts`** (it already exists and covers the brief):
`briefForPage` is a pure function and gets the cases that matter —

1. a normal build: a page with no `runId` resolves to the brief in state
2. a Library deck: two pages carrying different `runId`s resolve to their own
   run's brief, and specifically **not** to the last run's
3. a `runId` with no entry in `briefs` resolves to null rather than throwing or
   falling through to the wrong brief

Case 2 is the regression test for the bug this whole design is about, and it must
fail against the current code.

**Verified by running the app:** the toggle, the Esc precedence, that stepping
pages keeps the panel open, and that zoom/scroll/device survive the round trip.

## Out of scope

Editing the brief from the preview. Showing which sections or patterns a page
used — that is a different question ("why does this page look like this") and a
different panel.
