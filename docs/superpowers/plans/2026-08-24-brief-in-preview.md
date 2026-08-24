# Brief in Preview — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A merchant viewing one page in the preview overlay can press **Brief** and read the brief that produced *that* page, including in the Library where a deck mixes pages from many runs.

**Architecture:** A pure resolver (`briefForPage`) answers "which brief made this page" from a page's optional `runId` plus a run-id → brief map held in the store. `loadLibrary` fills that map at the two lines where it already namespaces page ids. A presentational `BriefPanel` renders a `Brief` it is handed. `PreviewOverlay` toggles the stage between the mockup and the panel.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, zustand, framer-motion, Tailwind. Tests are node programs run with `npx tsx`.

**Spec:** `docs/superpowers/specs/2026-08-24-brief-in-preview-design.md`

## Global Constraints

- This is NOT the Next.js in your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing framework code. (`AGENTS.md`)
- All user-facing copy is English.
- There is no React test harness in this repo. Every file in `scripts/` is a node program run with `npx tsx scripts/<name>.ts` that prints `PASS` or `FAIL — N problems` and sets a non-zero exit code on failure. Pure logic is tested there; UI is verified by running the app.
- `lib/store.ts` is `"use client"` and imports React and zustand. Nothing a node test imports may import it.
- Never fall back to a different run's brief. Showing the wrong brief confidently is the defect this feature is built around.
- Verification commands for every task: `npx tsc --noEmit` and `npx eslint <changed files>` must both be clean.

---

### Task 1: The resolver, and the bug it exists to prevent

**Files:**
- Create: `lib/briefForPage.ts`
- Test: `scripts/test-brief.ts` (modify — append a block inside `main()` before the final `console.log()` summary)

**Interfaces:**
- Consumes: `Brief` from `lib/validation`
- Produces: `briefForPage(page: BriefOwner, current: Brief | null, byRun: Record<string, Brief>): Brief | null` and `type BriefOwner = { runId?: string }`

Why its own module rather than a function inside `lib/store.ts`: the store is `"use client"` and pulls in React and zustand, so a node test importing it would drag a renderer into a test about a lookup. The resolver is a fact about pages and briefs, and it is kept where it can be read and run on its own.

- [ ] **Step 1: Write the failing test**

Add to `scripts/test-brief.ts`, inside `main()`, immediately before the `console.log()` that prints the PASS/FAIL summary:

```ts
  /* ---- which brief made this page --------------------------------------- */

  /* `loadLibrary` merges every saved run into ONE deck and keeps only the last
     run's brief in `brief`. A panel that reads that field shows run Z's brief on
     a page built by run A — correct-looking and wrong. Case 2 below is that
     exact bug. */

  console.log("\nwhich brief made this page");

  const { briefForPage } = await import("../lib/briefForPage");

  /* `validateBrief` returns a zod safeParse union, so `.data` only exists on
     the success arm — narrowing here rather than `!` keeps this compiling under
     the repo's strict TS, and turns a broken fixture into a clear failure. */
  const parseOk = (over: Record<string, unknown>) => {
    const r = validateBrief(draft(over) as never);
    if (!r.success) throw new Error("test fixture is not a valid brief");
    return r.data;
  };

  const briefA = parseOk({ whatYouSell: "Run A cookware" });
  const briefZ = parseOk({ whatYouSell: "Run Z candles" });
  const byRun = { "run-a": briefA, "run-z": briefZ };

  check(
    briefForPage({}, briefZ, {}) === briefZ,
    "a normal build: a page with no runId gets the brief in state",
  );

  check(
    briefForPage({ runId: "run-a" }, briefZ, byRun) === briefA,
    "a Library page gets ITS run's brief, not the last run's",
    briefForPage({ runId: "run-a" }, briefZ, byRun)?.whatYouSell,
  );

  check(
    briefForPage({ runId: "run-z" }, briefZ, byRun) === briefZ,
    "and a page from the last run still gets its own",
  );

  check(
    briefForPage({ runId: "run-missing" }, briefZ, byRun) === null,
    "a runId with no brief resolves to null rather than the wrong brief",
    String(briefForPage({ runId: "run-missing" }, briefZ, byRun)?.whatYouSell),
  );
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx tsx scripts/test-brief.ts`

Expected: FAIL — the run throws `Cannot find module '../lib/briefForPage'`. That is the correct red for a module that does not exist yet.

- [ ] **Step 3: Write the implementation**

Create `lib/briefForPage.ts`:

```ts
import type { Brief } from "./validation";

/* ==========================================================================
   Which brief made this page?

   For one build the question is trivial — there is one brief and every page
   came from it. The Library is where it stops being trivial: `loadLibrary`
   rebuilds EVERY saved run into a single deck, each run has its own brief, and
   the store keeps one:

       brief: runs.at(-1)?.brief ?? null

   So a merchant reading page 3, built by run A, is looking at a store whose
   `brief` is run Z's. Anything that renders that field answers this question
   wrongly for every page outside the last run, and looks right doing it.

   A page carries `runId` only when it came from the Library. Absent means "the
   brief in state", which is exactly right when there is only one.

   A `runId` with no entry returns NULL, deliberately. Falling back to `current`
   would put run Z's brief under run A's page — the precise failure this
   function exists to prevent, reintroduced as a convenience.
   ========================================================================== */

/** A page, as far as this question is concerned. */
export type BriefOwner = { runId?: string };

export function briefForPage(
  page: BriefOwner,
  current: Brief | null,
  byRun: Record<string, Brief>,
): Brief | null {
  if (page.runId === undefined) return current;
  return byRun[page.runId] ?? null;
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx tsx scripts/test-brief.ts`

Expected: PASS, with the four new lines all showing `✓`.

- [ ] **Step 5: Check types and lint**

Run: `npx tsc --noEmit && npx eslint lib/briefForPage.ts scripts/test-brief.ts`

Expected: both silent.

- [ ] **Step 6: Commit**

```bash
git add lib/briefForPage.ts scripts/test-brief.ts
git commit -m "The brief a page came from, when the deck holds several"
```

---

### Task 2: Carry each run's brief through the store

**Files:**
- Modify: `lib/generate/types.ts` (the `PageMockup` type, after `seed: string;`)
- Modify: `lib/store.ts:55-96` (the `State` type), `lib/store.ts:159-185` (initial state), `lib/store.ts:327` (`start()`), `lib/store.ts:582-615` (`loadLibrary()`)

**Interfaces:**
- Consumes: nothing from Task 1 at runtime; this task produces the values Task 4 feeds to `briefForPage`.
- Produces: `PageMockup.runId?: string`, and `State.briefs: Record<string, Brief>`

There is no store test harness — zustand plus React cannot be exercised from a node script here. This task's gate is `tsc`, `eslint`, and the existing suites continuing to pass.

- [ ] **Step 1: Add `runId` to `PageMockup`**

In `lib/generate/types.ts`, inside the `PageMockup` type, after the line `seed: string;`:

```ts
  /**
   * The saved run this page was rebuilt from, when it came from the Library.
   *
   * Absent on a normal build, where the deck has one brief and `brief` in the
   * store is it. Present, it names which of several briefs made this page —
   * see `briefForPage`.
   *
   * Optional and last, so a deck snapshotted before this existed still reopens.
   */
  runId?: string;
```

- [ ] **Step 2: Add `briefs` to the store's `State`**

In `lib/store.ts`, in the `State` type, directly under the existing `brief` field (`lib/store.ts:59`):

```ts
  /** run id → the brief that run was built from. Only the Library fills this;
      a normal build has one brief and `brief` above is it. */
  briefs: Record<string, Brief>;
```

- [ ] **Step 3: Initialise it**

In `lib/store.ts`, in the object passed to `create(...)`, directly under `brief: null,`:

```ts
  briefs: {},
```

- [ ] **Step 4: Reset it when a fresh build starts**

In `start()`, in the `set({ ... })` block at `lib/store.ts:327`, add directly under `brief,`:

```ts
      /* A build of its own. Left behind, a Library's map would answer for pages
         that are not from any of those runs. */
      briefs: {},
```

- [ ] **Step 5: Fill it, and stamp the pages, in `loadLibrary`**

In `loadLibrary`, in the opening `set({ ... })` (`lib/store.ts:582`), add under the existing `brief:` line:

```ts
      briefs: Object.fromEntries(runs.map((r) => [r.id, r.brief])),
```

Then, in the same function, add `runId` at both places that namespace a page id. The snapshot branch becomes:

```ts
        if (run.snapshot && run.snapshot.length > 0) {
          const saved = run.snapshot.map((page) => ({
            ...page,
            id: `${run.id}::${page.id}`,
            runId: run.id,
          }));
          set((s) => ({ pages: [...s.pages, ...saved] }));
          continue;
        }
```

and the rebuild branch becomes:

```ts
        await generatePages(
          run.brief,
          (page) =>
            set((s) => ({
              pages: [...s.pages, { ...page, id: `${run.id}::${page.id}`, runId: run.id }],
            })),
          signal,
          { variants: run.variants, instant: true },
        );
```

Write `runId` rather than splitting `id` on `"::"` later. Grep finds two writers of that convention and no readers: it exists so ids do not collide across runs, not as an encoding. The first reader would make a string format load-bearing and would break the day a run id contains `::`.

- [ ] **Step 6: Check types, lint, and the existing suites**

Run:

```bash
npx tsc --noEmit
npx eslint lib/store.ts lib/generate/types.ts
for t in test-export test-schema test-structure test-plan test-surface test-brief; do
  printf "%-16s " "$t"; npx tsx scripts/$t.ts 2>&1 | tail -1
done
```

Expected: `tsc` and `eslint` silent; all six suites print `PASS`.

- [ ] **Step 7: Commit**

```bash
git add lib/store.ts lib/generate/types.ts
git commit -m "A Library deck remembers which brief built which page"
```

---

### Task 3: The panel

**Files:**
- Create: `components/preview/BriefPanel.tsx`

**Interfaces:**
- Consumes: `Brief` from `lib/validation`; `STORE_TYPES` from `lib/briefOptions`; `VISUAL_STYLES` from `lib/styleTokens`; `describeSelection` from `lib/pageCatalog`; `Icon` from `../ui`
- Produces: `<BriefPanel brief={brief} />` where `brief: Brief | null`

Presentational only — it reads no store, so it can be handed a brief from anywhere and is not tied to the preview.

- [ ] **Step 1: Write the component**

Create `components/preview/BriefPanel.tsx`:

```tsx
"use client";

import type { Brief } from "@/lib/validation";
import { STORE_TYPES } from "@/lib/briefOptions";
import { VISUAL_STYLES } from "@/lib/styleTokens";
import { describeSelection } from "@/lib/pageCatalog";
import { Icon } from "../ui";

/* ==========================================================================
   The brief, read back beside the page it produced.

   Takes a brief and renders it. It resolves nothing: which brief belongs to
   which page is `briefForPage`'s question, answered before this is called, and
   a component that reached into the store for `brief` would answer it wrongly
   in the Library — see that module.
   ========================================================================== */

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[92px_1fr] items-start gap-4 py-2.5">
      <dt className="pt-px text-[12px] font-semibold uppercase tracking-wide text-pf-faint">
        {label}
      </dt>
      <dd className="min-w-0 text-[14px] leading-relaxed text-pf-body">{children}</dd>
    </div>
  );
}

export function BriefPanel({ brief }: { brief: Brief | null }) {
  /* Not an error and not empty: the page is real, the brief that made it was
     not kept. Saying so is better than a blank panel, which reads as broken. */
  if (!brief) {
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <p className="max-w-[42ch] text-[14px] text-pf-muted">
          The brief for this page was not saved with it.
        </p>
      </div>
    );
  }

  const style = VISUAL_STYLES.find((s) => s.id === brief.visualStyle);
  const storeType = STORE_TYPES.find((t) => t.id === brief.storeType);

  return (
    <div className="pfd-scroll-none h-full w-full overflow-y-auto px-5 py-6 sm:px-8">
      <div className="mx-auto max-w-[720px]">
        <h2 className="text-[15px] font-semibold text-pf-text">Brief</h2>
        <p className="mt-1 text-[12.5px] text-pf-faint">
          What this page was built from.
        </p>

        <dl className="mt-5 divide-y divide-pf-border border-y border-pf-border">
          <Row label="Sells">
            {brief.whatYouSell}
            {brief.verticalSlug && (
              <span className="text-pf-faint"> · {brief.verticalSlug}</span>
            )}
          </Row>

          <Row label="Store">{storeType?.label ?? brief.storeType}</Row>

          <Row label="Style">{style?.label ?? brief.visualStyle}</Row>

          <Row label="Pages">{describeSelection(brief.pages)}</Row>

          {brief.brandColors.length > 0 && (
            <Row label="Colors">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                {brief.brandColors.map((hex) => (
                  <span key={hex} className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="size-4 shrink-0 rounded-full border border-pf-border"
                      style={{ background: hex }}
                    />
                    <span className="font-mono-pf text-[12.5px] text-pf-muted">
                      {hex}
                    </span>
                  </span>
                ))}
              </div>
            </Row>
          )}

          {brief.prompt.trim() !== "" && (
            <Row label="Prompt">
              <p className="whitespace-pre-wrap">{brief.prompt}</p>
            </Row>
          )}

          {brief.referenceImages.length > 0 && (
            <Row label="References">
              <ReferenceImages images={brief.referenceImages} />
            </Row>
          )}
        </dl>
      </div>
    </div>
  );
}

/* ==========================================================================
   A saved run keeps the NAMES of the reference images and not the pixels.

   `runPayload.ts` blanks `url` and clears `dataUrl` before a run is stored, so
   a deck reopened from the Library has the list and no thumbnails. Rendering an
   <img> with an empty src would give the merchant a row of broken-image icons
   and imply the upload was lost; showing nothing would imply there never was
   one. Neither is true, so the names are shown as names.
   ========================================================================== */

function ReferenceImages({
  images,
}: {
  images: Brief["referenceImages"];
}) {
  return (
    <ul className="flex flex-wrap gap-3">
      {images.map((img) => {
        const src = img.dataUrl || img.url;
        return (
          <li key={img.id}>
            {src ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={src}
                alt={img.name}
                className="size-16 rounded-pf-sm border border-pf-border object-cover"
              />
            ) : (
              <span className="flex items-center gap-1.5 rounded-pf-sm border border-pf-border px-2 py-1.5 text-[12.5px] text-pf-muted">
                <Icon name="Images" size={13} />
                {img.name}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 2: Confirm every import exists**

Run:

```bash
grep -n "export const STORE_TYPES" lib/briefOptions.ts
grep -n "export const VISUAL_STYLES" lib/styleTokens.ts
grep -n "export function describeSelection" lib/pageCatalog.ts
grep -n "^  Images,"  lib/icons.ts
```

Expected: each prints a line. `Images` is the icon that exists in this repo — `Image` (singular) does not. Do not add one.

- [ ] **Step 3: Check types and lint**

Run: `npx tsc --noEmit && npx eslint components/preview/BriefPanel.tsx`

Expected: both silent.

- [ ] **Step 4: Commit**

```bash
git add components/preview/BriefPanel.tsx
git commit -m "The brief, laid out to be read"
```

---

### Task 4: Wire it into the preview overlay

**Files:**
- Modify: `components/preview/PreviewOverlay.tsx` — `SHORTCUTS` (line 30), the store reads (~line 141), local state (~line 158), the key handler (line 204), the toolbar (~line 430), the stage (~line 474)

**Interfaces:**
- Consumes: `briefForPage` (Task 1), `State.briefs` and `PageMockup.runId` (Task 2), `BriefPanel` (Task 3)
- Produces: nothing further

- [ ] **Step 1: Add the imports**

At the top of `components/preview/PreviewOverlay.tsx`, alongside the existing component imports:

```tsx
import { briefForPage } from "@/lib/briefForPage";
import { BriefPanel } from "./BriefPanel";
```

- [ ] **Step 2: Add the shortcut line**

Change the `SHORTCUTS` array (line 30) to include the new key. The panel that advertises the keys has to know about this one:

```tsx
const SHORTCUTS = [
  ["Esc", "Close"],
  ["← →", "Previous / next page"],
  ["1 – 4", "Device size"],
  ["+ −", "Zoom"],
  ["0", "Fit"],
  ["B", "Brief"],
] as const;
```

- [ ] **Step 3: Read the brief, and add the toggle's state**

In `PreviewOverlay`, beside the other `useStore` reads (after `const close = useStore((s) => s.closePreview);`):

```tsx
  const brief = useStore((s) => s.brief);
  const briefs = useStore((s) => s.briefs);
```

and beside the other `useState` calls (after `const [scrub, setScrub] = useState(false);`):

```tsx
  const [showBrief, setShowBrief] = useState(false);
```

Then, directly after the existing `const spec = ...` line:

```tsx
  /* Resolved per page, so stepping through a Library deck shows each page's own
     brief rather than the last run's — see `briefForPage`. */
  const pageBrief = page ? briefForPage(page, brief, briefs) : null;
```

Note: `page` may be undefined here — the `if (!page) return null;` guard sits further down — so the conditional is required.

- [ ] **Step 4: Make Esc close the brief first**

In the key handler (line 204), replace the `Escape` case:

```tsx
        case "Escape":
          e.preventDefault();
          /* One key, the nearest thing first. Closing the whole overlay from
             under an open brief loses the merchant's page as well as the panel
             they meant to dismiss. */
          if (showBrief) setShowBrief(false);
          else close();
          break;
```

and add the new key, after the `case "0":` block:

```tsx
        case "b":
        case "B":
          e.preventDefault();
          setShowBrief((v) => !v);
          break;
```

- [ ] **Step 5: Add `showBrief` to the handler's dependencies**

The effect closes over `showBrief`, so the dependency array at the end of that `useEffect` must include it:

```tsx
  }, [close, step, setDevice, setZoom, nudgeZoom, showBrief]);
```

Without this the handler keeps the first render's `showBrief` and Esc closes the overlay even with the panel open — the exact bug Step 4 is preventing.

- [ ] **Step 6: Add the toolbar button**

In the toolbar, directly before the existing Scrub `<Button>` (~line 419):

```tsx
            <Button
              size="sm"
              variant={showBrief ? "primary" : "ghost"}
              icon="ClipboardList"
              aria-pressed={showBrief}
              onClick={() => setShowBrief((v) => !v)}
              title="What this page was built from (B)"
            >
              <span className="hidden lg:inline">Brief</span>
            </Button>
```

- [ ] **Step 7: Swap the stage contents**

In the stage, the `<div ref={stageRef} …>` currently holds the zoom wrapper directly. Wrap what is there so the mockup is HIDDEN rather than unmounted, and put the panel beside it. Replace the opening of that div and its zoom-wrapper child with:

```tsx
        <div
          ref={stageRef}
          className="grid min-h-0 flex-1 place-items-center overflow-hidden"
        >
          {showBrief && (
            <div className="h-full w-full max-w-[860px]">
              <BriefPanel brief={pageBrief} />
            </div>
          )}

          {/* Hidden, not unmounted: remounting resets scroll position, and the
              device spring would replay on every return. `hidden` also takes it
              out of the accessibility tree, so a screen reader is not offered a
              page that is not on screen. */}
          <div className={showBrief ? "hidden" : "contents"}>
            {/* … the existing zoom wrapper, unchanged, from
                `<div style={{ transform: `scale(${scale})` }}` down to its
                closing `</div>` … */}
          </div>
        </div>
```

Keep the existing zoom wrapper and everything inside it exactly as it is; only the wrapper above it is new.

- [ ] **Step 8: Check types and lint**

Run: `npx tsc --noEmit && npx eslint components/preview/PreviewOverlay.tsx`

Expected: both silent.

- [ ] **Step 9: Verify in the running app**

Run `npm run dev`, build a deck, open a page preview, and confirm each of these by looking at it:

1. **Brief** button toggles the panel; the mockup is replaced, the toolbar stays put
2. `B` does the same from the keyboard
3. With the panel open, `Esc` closes the panel and leaves the preview open; `Esc` again closes the preview
4. With the panel open, `←` / `→` step pages and the panel stays open, showing the new page's brief
5. Closing the panel returns the mockup at the same scroll position, zoom and device size
6. A brief with no prompt, no colours and no reference images shows those rows omitted rather than blank

Then open the **Library** (a deck rebuilt from more than one saved run) and confirm the point of the whole feature:

7. Pages from different runs show **different** briefs — specifically, a page that is not from the most recent run does not show the most recent run's brief
8. Reference images on a Library page appear as file names, not broken images

- [ ] **Step 10: Commit**

```bash
git add components/preview/PreviewOverlay.tsx
git commit -m "The brief is one key away from the page it produced"
```

---

## Self-review notes

**Spec coverage.** Resolver and its "never fall back" rule → Task 1. `briefs` map, `runId`, both `loadLibrary` sites, `start()` reset → Task 2. Panel rows, `describeSelection` reuse, the reference-image degradation, the null-brief message → Task 3. Toolbar button, `b` key, `SHORTCUTS` line, Esc precedence, arrow-key behaviour, hidden-not-unmounted → Task 4. The spec's "out of scope" items appear in no task, correctly.

**Type consistency.** `briefForPage(page, current, byRun)` is defined in Task 1 and called with that argument order in Task 4. `State.briefs` (Task 2) is the third argument. `PageMockup.runId` (Task 2) satisfies `BriefOwner` (Task 1) structurally — `PageMockup` is not imported by `lib/briefForPage.ts`, so that module stays free of the generator's types.

**Known gap, stated rather than hidden.** Task 2 has no automated test, because a `"use client"` zustand store cannot be exercised by the node scripts this repo tests with. Its correctness rests on `tsc`, on the six existing suites, and on checks 7 and 8 of Task 4 Step 9 — which are manual. If those two checks are skipped, the feature's central defect is untested.
