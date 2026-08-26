# Section Spec Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A second design pass names the elements inside every band — what they are, how they nest, how the space divides, what each one does on hover and on scroll — so the build model fills in words and photographs rather than inventing the layout.

**Architecture:** Stage 2a (`deckPlan.ts`) keeps deciding bands for the whole deck in one call. A new stage 2b (`sectionSpec.ts`) runs one call per page, concurrently, and attaches a `SectionSpec` to each `OrderSection`. `designServer.ts` renders that spec into the build prompt, and `audit.ts` checks the built tree against it so the existing repair loop fixes what is missing. Every new field is optional and null on the older paths, so nothing that works today changes.

**Tech Stack:** TypeScript strict, zod (`lib/design/schema.ts`), Anthropic + DeepSeek behind `lib/ai/provider.ts`, plain `tsx` assertion scripts for tests.

## Global Constraints

- Branch: `struct-v2`. Do not merge or push.
- `PLAN_BINDING` env var: `"true"` = strict, anything else = soft. Soft is the default.
- `USE_SECTION_SPEC` env var: `"true"` enables stage 2b. Off by default, exactly like `USE_DECK_PLAN`.
- Stage 2b uses the `"design"` provider role — `getProvider("design")`, `isAiEnabled("design")`.
- `el` values must come from the tree schema's element types plus `row` and `col`. No new element types.
- `anim.hover` ∈ `float, shadow, grow, glow, float-shadow, grow-shadow`. `anim.reveal` ∈ `fade, fade-up, slide-left, slide-right, zoom`. `anim.delay` clamped to 0–6.
- `Scale` ∈ `oversized, large, body, caption, eyebrow`.
- An unrecognised value is dropped, never guessed at or repaired.
- A stage 2b failure sets `spec = null` for that page and must never fail the build.
- Do not modify `toPagefly.ts`, `render.tsx`, or `skills/_sliced/20-patterns.md`.
- The repo has 3 pre-existing eslint errors. Check that your changes add none — compare counts, do not assume clean.

---

### Task 1: One `parseObject`, not three

`parseObject` is copy-pasted in `structure.ts`, `deckPlan.ts` and `designServer.ts`. Stage 2b needs it too. Extract before adding a fourth copy.

**Files:**
- Create: `lib/ai/json.ts`
- Modify: `lib/design/structure.ts` (delete local copy, import)
- Modify: `lib/design/deckPlan.ts` (delete local copy, import)
- Modify: `lib/ai/designServer.ts` (delete local copy, import)

**Interfaces:**
- Produces: `parseObject(text: string): unknown | null`

- [ ] **Step 1: Confirm the three copies are identical**

```bash
cd "/Users/bbuser/Documents/PageFly Design/PageFly-Design"
for f in lib/design/structure.ts lib/design/deckPlan.ts lib/ai/designServer.ts; do
  echo "--- $f"; sed -n "/^function parseObject/,/^}/p" "$f"
done
```

Expected: three byte-identical bodies. If one differs, keep the most permissive
and note the difference in the commit message.

- [ ] **Step 2: Create the shared module**

```ts
/* lib/ai/json.ts */

/**
 * The JSON object in a model's answer, however it was wrapped.
 *
 * Models return the object bare, inside a ```json fence, or with a sentence in
 * front of it. All three are the same answer, and a parser that only accepts
 * the first turns a good completion into a failed page. Three call sites had
 * their own copy of this before it lived here.
 */
export function parseObject(text: string): unknown | null {
  const attempts = [text];
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  if (fenced) attempts.push(fenced[1]);
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) attempts.push(text.slice(start, end + 1));

  for (const attempt of attempts) {
    try {
      const parsed = JSON.parse(attempt.trim());
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      /* next */
    }
  }
  return null;
}
```

- [ ] **Step 3: Delete each local copy and import instead**

In `lib/design/structure.ts` and `lib/design/deckPlan.ts` add near the other imports:

```ts
import { parseObject } from "../ai/json";
```

In `lib/ai/designServer.ts`:

```ts
import { parseObject } from "./json";
```

Then delete the `function parseObject(...) { ... }` block from all three.

- [ ] **Step 4: Verify nothing broke**

```bash
npx tsc --noEmit
npx tsx scripts/test-deckplan.ts
```

Expected: tsc clean; `test-deckplan.ts` prints its assertions and exits 0.

- [ ] **Step 5: Commit**

```bash
git add lib/ai/json.ts lib/design/structure.ts lib/design/deckPlan.ts lib/ai/designServer.ts
git commit -m "Three copies of the same JSON parser become one"
```

---

### Task 2: The spec's types, and the seam that carries it

Add the spec's shape and hang it off `OrderSection` as an optional field. No behaviour yet — this task exists so the next three can be written against real types.

**Files:**
- Modify: `lib/design/plan.ts:54-98` (add types above `OrderSection`, add field to it)

**Interfaces:**
- Produces: `Scale`, `SpecNode`, `SectionSpec`, and `OrderSection.spec?: SectionSpec | null`

- [ ] **Step 1: Add the types above `OrderSection`**

```ts
/**
 * What a text-bearing element is FOR, in type terms — not a pixel size.
 *
 * The design pass writes blind: it has not seen the copy. A `font-size` chosen
 * there is a guess, and a headline of fourteen words under a size picked for
 * four is a broken page. Layout has no such problem — 44/56 is 44/56 whatever
 * the words turn out to be — so layout is given as numbers and type as intent,
 * and the build model turns the intent into pixels once it knows the words.
 */
export type Scale = "oversized" | "large" | "body" | "caption" | "eyebrow";

/** One element the design pass wants in a band, and what it does. */
export type SpecNode = {
  /** an element type from `schema.ts`, or "row" / "col" */
  el: string;
  /** text-bearing elements only */
  scale?: Scale;
  /** this child's share of its row, e.g. "44%" */
  basis?: string;
  /** space between this node's children, px */
  gap?: number;
  /** images: height ÷ width */
  ratio?: number;
  anim?: { hover?: string; reveal?: string; delay?: number };
  /**
   * Absent or false means the built section must contain it.
   *
   * The default is "required" rather than "optional" because a spec whose every
   * line is a suggestion is the situation this whole stage exists to end.
   */
  optional?: boolean;
  children?: SpecNode[];
};

export type SectionSpec = { nodes: SpecNode[] };
```

- [ ] **Step 2: Add the field to `OrderSection`**

Insert as the last property of the `OrderSection` type in `lib/design/plan.ts`:

```ts
  /**
   * The elements inside this band, when stage 2b ran and its answer survived.
   *
   * Null on every other path, exactly as `brief` is — the deck plan and the two
   * older deciders name a band and stop. The prompt omits the block when it is
   * null, so nothing downstream has to know which decider ran.
   */
  spec?: SectionSpec | null;
```

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
```

Expected: clean. An optional field added to a type nothing constructs
exhaustively cannot break a caller.

- [ ] **Step 4: Commit**

```bash
git add lib/design/plan.ts
git commit -m "A band can carry the elements inside it, when something knew them"
```

---

### Task 3: `specCheck.ts` — vetting, problems, delta

The pure half. Everything here is a function of its arguments: no model, no env
reads except the one flag, no I/O. This is the file the tests exercise.

**Files:**
- Create: `lib/design/specCheck.ts`
- Create: `scripts/test-sectionspec.ts`

**Interfaces:**
- Consumes: `Scale`, `SpecNode`, `SectionSpec` from `lib/design/plan.ts`; `DesignSection`, `DesignNode`, `childrenOf` from `lib/design/schema.ts`
- Produces:
  - `specBinding(): boolean`
  - `vetSpec(raw: unknown): SectionSpec | null`
  - `specDelta(section: DesignSection, spec: SectionSpec): { missing: string[]; added: string[] }`
  - `specProblems(section: DesignSection, spec: SectionSpec, binding: boolean): string[]`

- [ ] **Step 1: Write the failing test**

Create `scripts/test-sectionspec.ts`:

```ts
/* ==========================================================================
   The spec checker, without a model.

   Every assertion here is a rule the design pass can break and the build pass
   can be told about. They are cheap, deterministic and run in a second — which
   is the point: the expensive failures on this branch (invented motion ids, a
   missing hero) were all shapes a test like this would have caught.
   ========================================================================== */

import { createRequire } from "node:module";
import Module from "node:module";

const require_ = createRequire(import.meta.url);
const resolve_ = (Module as unknown as { _resolveFilename: (r: string, ...a: unknown[]) => string })
  ._resolveFilename;
(Module as unknown as { _resolveFilename: unknown })._resolveFilename = function (
  this: unknown,
  request: string,
  ...args: unknown[]
) {
  if (request === "server-only") return require_.resolve("./server-only.cjs");
  return resolve_.call(this, request, ...args);
} as never;

let failures = 0;
function check(ok: boolean, label: string, detail: string | null = null): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function main(): Promise<void> {
  const { vetSpec, specDelta, specProblems } = await import("@/lib/design/specCheck");

  console.log("\nvetSpec");

  const clean = vetSpec({
    nodes: [
      { el: "heading", scale: "oversized", anim: { reveal: "fade-up" } },
      { el: "image", ratio: 0.82, anim: { hover: "grow" } },
    ],
  });
  check(clean !== null && clean.nodes.length === 2, "keeps two good nodes");
  check(clean?.nodes[0].scale === "oversized", "keeps a known scale");
  check(clean?.nodes[1].anim?.hover === "grow", "keeps a known hover");

  const badEl = vetSpec({ nodes: [{ el: "carousel3000" }, { el: "text" }] });
  check(badEl?.nodes.length === 1, "drops an unknown element type", "carousel3000");
  check(badEl?.nodes[0].el === "text", "keeps the sibling of a dropped node");

  const badAnim = vetSpec({ nodes: [{ el: "button", anim: { hover: "explode", reveal: "fade" } }] });
  check(badAnim?.nodes[0].anim?.hover === undefined, "drops an unknown hover");
  check(badAnim?.nodes[0].anim?.reveal === "fade", "keeps the known reveal beside it");

  const badScale = vetSpec({ nodes: [{ el: "heading", scale: "gigantic" }] });
  check(badScale?.nodes[0].scale === undefined, "drops an unknown scale");

  const delay = vetSpec({ nodes: [{ el: "text", anim: { reveal: "fade", delay: 99 } }] });
  check(delay?.nodes[0].anim?.delay === 6, "clamps delay to 6");

  const nested = vetSpec({
    nodes: [{ el: "row", gap: 72, children: [{ el: "col", basis: "44%", children: [{ el: "text" }] }] }],
  });
  check(nested?.nodes[0].children?.[0].children?.[0].el === "text", "keeps three levels of nesting");

  check(vetSpec({ nodes: [] }) === null, "an empty node list is null, not an empty spec");
  check(vetSpec({ nodes: [{ el: "nope" }] }) === null, "a spec of only bad nodes is null");
  check(vetSpec(null) === null, "null in, null out");
  check(vetSpec({ nodes: "heading" }) === null, "a non-array node list is null");

  console.log("\nspecDelta");

  const spec = vetSpec({
    nodes: [{ el: "heading" }, { el: "text" }, { el: "button" }, { el: "image" }],
  })!;

  const exact = {
    pattern: "x",
    children: [{ type: "heading" }, { type: "text" }, { type: "button" }, { type: "image" }],
  } as never;
  const d1 = specDelta(exact, spec);
  check(d1.missing.length === 0 && d1.added.length === 0, "an exact build has no delta");

  const extra = {
    pattern: "x",
    children: [
      { type: "heading" }, { type: "text" }, { type: "button" },
      { type: "image" }, { type: "divider" }, { type: "icon" },
    ],
  } as never;
  const d2 = specDelta(extra, spec);
  check(d2.missing.length === 0, "extras are not missing");
  check(d2.added.join(",") === "divider,icon", "extras are listed", d2.added.join(","));

  const short = { pattern: "x", children: [{ type: "heading" }, { type: "text" }] } as never;
  const d3 = specDelta(short, spec);
  check(d3.missing.join(",") === "button,image", "shortfalls are listed", d3.missing.join(","));

  const twice = vetSpec({ nodes: [{ el: "image" }, { el: "image" }] })!;
  const once = { pattern: "x", children: [{ type: "image" }] } as never;
  check(specDelta(once, twice).missing.join(",") === "image", "counts, not just presence");

  console.log("\nspecProblems · soft");

  check(specProblems(exact, spec, false).length === 0, "an exact build is clean");
  check(specProblems(extra, spec, false).length === 0, "extras pass in soft mode");
  check(specProblems(short, spec, false).length === 1, "a shortfall is one problem");
  check(
    specProblems(short, spec, false)[0].includes("button"),
    "the problem names the missing element",
    specProblems(short, spec, false)[0],
  );

  console.log("\nspecProblems · binding");

  check(specProblems(exact, spec, true).length === 0, "an exact build is clean when binding");
  check(specProblems(extra, spec, true).length === 1, "extras are a problem when binding");
  check(specProblems(short, spec, true).length === 1, "a shortfall is still a problem");

  console.log("\nspecProblems · optional");

  const opt = vetSpec({ nodes: [{ el: "heading" }, { el: "divider", optional: true }] })!;
  const noDivider = { pattern: "x", children: [{ type: "heading" }] } as never;
  check(specProblems(noDivider, opt, false).length === 0, "an absent optional node is fine");
  check(specProblems(noDivider, opt, true).length === 0, "…in binding mode too");

  console.log(`\n${failures === 0 ? "all passed" : `${failures} FAILED`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx tsx scripts/test-sectionspec.ts
```

Expected: FAIL — `Cannot find module '@/lib/design/specCheck'`.

- [ ] **Step 3: Write the implementation**

Create `lib/design/specCheck.ts`:

```ts
import "server-only";

import type { SectionSpec, Scale, SpecNode } from "./plan";
import { childrenOf, type DesignNode, type DesignSection } from "./schema";

/* ==========================================================================
   The spec, checked — no model, no I/O, no surprises.

   Two jobs that look alike and are not. `vetSpec` cleans what a model said
   before anyone relies on it; `specProblems` compares what another model built
   against the cleaned version. The first protects the pipeline from an invented
   id, the second is the whole point of having a spec at all.

   Everything unrecognised is DROPPED rather than corrected. A plausible-looking
   wrong id is worse than a missing one: the missing one degrades a band, and
   the wrong one produces a page nobody can explain. This is the treatment
   invented motion ids already get in `deckPlan.vet()`.
   ========================================================================== */

/** Element types the tree schema will accept, plus the two layout boxes. */
const ELEMENTS = new Set([
  "heading", "text", "button", "image", "divider", "icon",
  "product", "productList", "form", "custom", "overlay", "sticky",
  "beforeAfter", "counter", "accordion", "slideshow", "marquee",
  "row", "col",
]);

/** PageFly's canned button motion — mirrors `HOVERS` in `schema.ts`. */
const HOVERS = new Set(["float", "shadow", "grow", "glow", "float-shadow", "grow-shadow"]);

/** Ours, played once on scroll into view — mirrors `REVEALS` in `schema.ts`. */
const REVEALS = new Set(["fade", "fade-up", "slide-left", "slide-right", "zoom"]);

const SCALES = new Set<Scale>(["oversized", "large", "body", "caption", "eyebrow"]);

/**
 * Is the spec binding?
 *
 * Soft is the default on evidence: stage 2a already omitted a required commerce
 * band on a nine-row answer. At element scale, with fifteen to twenty nodes a
 * section, omissions get likelier — and a build model forbidden to compensate
 * turns each one into a hole in the page. The strict mode checks exactly the
 * list the soft mode requires, so tightening is this flag and nothing else.
 */
export function specBinding(): boolean {
  return process.env.PLAN_BINDING === "true";
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function num(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

function vetAnim(raw: unknown): SpecNode["anim"] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;

  const hover = HOVERS.has(str(o.hover)) ? str(o.hover) : undefined;
  const reveal = REVEALS.has(str(o.reveal)) ? str(o.reveal) : undefined;

  const d = num(o.delay);
  /* Clamped rather than dropped: `schema.ts` clamps the same field the same
     way, and a spec that disagrees with the schema about a legal value would
     report a problem the build model cannot fix. */
  const delay = d === undefined ? undefined : Math.min(6, Math.max(0, Math.round(d)));

  if (!hover && !reveal && delay === undefined) return undefined;
  return { hover, reveal, delay };
}

function vetNode(raw: unknown): SpecNode | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;

  const el = str(o.el);
  if (!ELEMENTS.has(el)) return null;

  const scale = SCALES.has(str(o.scale) as Scale) ? (str(o.scale) as Scale) : undefined;
  const basis = /^\d{1,3}%$/.test(str(o.basis)) ? str(o.basis) : undefined;
  const gap = num(o.gap);
  const ratio = num(o.ratio);

  const kids = Array.isArray(o.children)
    ? o.children.map(vetNode).filter((n): n is SpecNode => n !== null)
    : [];

  return {
    el,
    ...(scale ? { scale } : {}),
    ...(basis ? { basis } : {}),
    ...(gap !== undefined ? { gap: Math.max(0, Math.round(gap)) } : {}),
    ...(ratio !== undefined ? { ratio } : {}),
    ...(vetAnim(o.anim) ? { anim: vetAnim(o.anim) } : {}),
    ...(o.optional === true ? { optional: true } : {}),
    ...(kids.length ? { children: kids } : {}),
  };
}

/**
 * A model's raw answer for one band, cleaned — or null if nothing survived.
 *
 * Null rather than `{ nodes: [] }` on purpose: an empty spec would flow
 * downstream and be rendered as an empty block, which reads to the build model
 * as "this band has no elements". Null is the value every other path already
 * uses for "nothing upstream knew".
 */
export function vetSpec(raw: unknown): SectionSpec | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const list = (raw as Record<string, unknown>).nodes;
  if (!Array.isArray(list)) return null;

  const nodes = list.map(vetNode).filter((n): n is SpecNode => n !== null);
  return nodes.length ? { nodes } : null;
}

/* ---- comparing a built section against its spec -------------------------- */

function flatten(node: SpecNode, out: SpecNode[] = []): SpecNode[] {
  out.push(node);
  for (const c of node.children ?? []) flatten(c, out);
  return out;
}

function walk(node: DesignNode | DesignSection, out: DesignNode[] = []): DesignNode[] {
  for (const c of childrenOf(node)) {
    out.push(c);
    walk(c, out);
  }
  return out;
}

/**
 * What the build did with the spec, as two lists of element types.
 *
 * Counted, not merely present: a spec asking for two images and a section
 * containing one has lost an image, and a presence check would call that a
 * match. `row` and `col` are excluded — they are how a layout is expressed, and
 * a build that reaches the same arrangement with one fewer wrapper has not
 * disobeyed anything.
 */
export function specDelta(
  section: DesignSection,
  spec: SectionSpec,
): { missing: string[]; added: string[] } {
  const wanted = new Map<string, number>();
  for (const node of spec.nodes.flatMap((n) => flatten(n))) {
    if (node.el === "row" || node.el === "col") continue;
    if (node.optional) continue;
    wanted.set(node.el, (wanted.get(node.el) ?? 0) + 1);
  }

  const built = new Map<string, number>();
  for (const node of walk(section)) {
    if (node.type === "row" || node.type === "col") continue;
    built.set(node.type, (built.get(node.type) ?? 0) + 1);
  }

  const missing: string[] = [];
  for (const [el, n] of wanted) {
    const short = n - (built.get(el) ?? 0);
    for (let i = 0; i < short; i++) missing.push(el);
  }

  const added: string[] = [];
  for (const [el, n] of built) {
    const over = n - (wanted.get(el) ?? 0);
    for (let i = 0; i < over; i++) added.push(el);
  }

  return { missing, added };
}

/**
 * The spec's failures, phrased for the model that has to fix them.
 *
 * Returned as sentences rather than as a structure because `audit()` returns
 * sentences and its repair call feeds them straight back to the build model. A
 * problem it cannot read is a problem it cannot fix.
 */
export function specProblems(
  section: DesignSection,
  spec: SectionSpec,
  binding: boolean,
): string[] {
  const { missing, added } = specDelta(section, spec);
  const problems: string[] = [];

  if (missing.length)
    problems.push(
      `Section "${section.pattern}" is missing ${missing.length} element` +
        `${missing.length === 1 ? "" : "s"} the design asked for: ${missing.join(", ")}. ` +
        `Add ${missing.length === 1 ? "it" : "them"} where the design places ` +
        `${missing.length === 1 ? "it" : "them"}.`,
    );

  if (binding && added.length)
    problems.push(
      `Section "${section.pattern}" has ${added.length} element` +
        `${added.length === 1 ? "" : "s"} the design did not ask for: ${added.join(", ")}. ` +
        `Remove ${added.length === 1 ? "it" : "them"}.`,
    );

  return problems;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx tsx scripts/test-sectionspec.ts
```

Expected: every line prints `✓`, final line `all passed`, exit 0.

If `childrenOf` does not accept a `DesignSection`, check its signature in
`lib/design/schema.ts` and match the call `audit.ts:53` already makes — `walk`
there does the same traversal and is the reference.

- [ ] **Step 5: Verify types and lint**

```bash
npx tsc --noEmit
npx eslint lib/design/specCheck.ts scripts/test-sectionspec.ts; echo "exit=$?"
```

Expected: tsc clean, `exit=0`. Do not pipe eslint through `tail` — that hides
the summary line, and this repo has 3 pre-existing errors elsewhere that make a
truncated read misleading.

- [ ] **Step 6: Commit**

```bash
git add lib/design/specCheck.ts scripts/test-sectionspec.ts
git commit -m "The spec, checked: what survives vetting and what the build owes it"
```

---

### Task 4: `sectionSpec.ts` — the stage 2b call

The model half. One call per page. Everything it can get wrong has already been
made harmless by Task 3.

**Files:**
- Create: `lib/design/sectionSpec.ts`

**Interfaces:**
- Consumes: `vetSpec` from `lib/design/specCheck.ts`; `parseObject` from `lib/ai/json.ts`; `getProvider`, `isAiEnabled`, `modelName`, `type Usage` from `lib/ai/provider.ts`; `sliceSkill` from `lib/ai/skills.ts`; `Order`, `SectionSpec` from `lib/design/plan.ts`
- Produces:
  - `sectionSpecEnabled(): boolean`
  - `type SpecAsk = { pageType: string; order: Order; sell: string; storeType: string; styleLabel: string; styleBlurb: string; prompt: string; tokens: { bg: string; ink: string; accent: string; band: string } }`
  - `type SpecOutcome = { specs: Map<number, SectionSpec>; usage: Usage; reason: string | null; model: string | null; dropped: number }`
  - `planSpecs(ask: SpecAsk, signal?: AbortSignal): Promise<SpecOutcome>`
  - `__specPromptsForTest(ask: SpecAsk): { system: string; user: string }`

- [ ] **Step 1: Write the file**

```ts
import "server-only";

import { parseObject } from "../ai/json";
import { getProvider, isAiEnabled, modelName, type Usage } from "../ai/provider";
import { sliceSkill } from "../ai/skills";
import type { Order, SectionSpec } from "./plan";
import { vetSpec } from "./specCheck";

/* ==========================================================================
   STAGE 2b — the elements inside each band.

   Stage 2a decides which bands a page has and stops. Everything inside a band
   then comes from a static skeleton in `20-patterns.md` and from whatever the
   build model decides while writing. That is 93% of the output tokens of a
   build being spent by the model nobody asked to design anything, and it is why
   two stores in one trade come out structurally identical.

   WHY THIS IS PER PAGE AND STAGE 2a IS PER DECK.

   Stage 2a exists to make two page types differ, which needs both in one
   answer. Once its bands are fixed there is nothing left that needs to see
   across pages, and this half is the expensive one. Per page, the cost grows
   with the deck instead of racing the ceiling, the pages run concurrently, and
   a failure costs one page rather than the build.

   WHAT IT IS NOT ASKED FOR.

   Copy and photographs. This call writes blind — it has not seen a word of the
   page — so a `font-size` decided here is a guess, and a headline of fourteen
   words under a size chosen for four is a new way for a page to break. Layout
   does not have that problem, so layout is numbers and type is intent.
   ========================================================================== */

export function sectionSpecEnabled(): boolean {
  return process.env.USE_SECTION_SPEC === "true";
}

/**
 * Room for one page's elements plus the reasoning behind them.
 *
 * A built section serialises to about 800 tokens WITH its copy and CSS; a spec
 * carrying neither is nearer 350, and a page is nine to eleven of them. The
 * rest is thinking, billed against the same ceiling.
 */
const MAX_TOKENS = 24_000;

const TIMEOUT_MS = 180_000;

export type SpecAsk = {
  pageType: string;
  /** the band plan stage 2a produced for this page */
  order: Order;
  sell: string;
  storeType: string;
  styleLabel: string;
  styleBlurb: string;
  /** the merchant's own words, verbatim */
  prompt: string;
  tokens: { bg: string; ink: string; accent: string; band: string };
};

export type SpecOutcome = {
  /** band index → its spec, only where one survived checking */
  specs: Map<number, SectionSpec>;
  usage: Usage;
  /** null when the call ran and produced something */
  reason: string | null;
  model: string | null;
  /** answers that did not survive `vetSpec` — the number that says "prompt bug" */
  dropped: number;
};

const NOTHING: Usage = { input: 0, output: 0 };

function empty(reason: string): SpecOutcome {
  return { specs: new Map(), usage: NOTHING, reason, model: null, dropped: 0 };
}

/* ---- the prompt ---------------------------------------------------------- */

function systemPrompt(ask: SpecAsk): string {
  return [
    `You decide what is INSIDE each band of one page.`,
    ``,
    `The bands are already chosen and their order is fixed. Your job is the`,
    `contents: which elements sit in each band, how they nest, how the space`,
    `divides between them, and what each one does on hover and on scroll.`,
    ``,
    `YOU DO NOT WRITE COPY AND YOU DO NOT CHOOSE PHOTOGRAPHS. You have not seen`,
    `either. Say a heading is oversized; someone who knows how long the words`,
    `are will turn that into a size.`,
    ``,
    `THE ELEMENTS. Use these and no others — an invented one is dropped and the`,
    `band loses it.`,
    `  text and marks   heading, text, button, icon, divider`,
    `  media            image, slideshow, marquee, overlay, beforeAfter`,
    `  commerce         product, productList, form`,
    `  behaviour        accordion, counter, sticky, custom`,
    `  layout           row, col`,
    ``,
    `SCALE — for elements that carry words. One of:`,
    `  oversized  the one thing read from across the room`,
    `  large      a section head`,
    `  body       running text`,
    `  caption    under a photograph, beside a number`,
    `  eyebrow    the small line above a head`,
    ``,
    `MOTION — per element, and both fields are optional.`,
    `  hover   float, shadow, grow, glow, float-shadow, grow-shadow`,
    `  reveal  fade, fade-up, slide-left, slide-right, zoom`,
    `  delay   0 to 6, for staggering siblings`,
    ``,
    `LAYOUT — "basis" is a percentage string on a row's children ("44%"), "gap"`,
    `is pixels between children, "ratio" is an image's height divided by its`,
    `width (0.82 is landscape, 1.32 is portrait).`,
    ``,
    `THE SKELETONS. Each band's pattern already has a shape, given below. Treat`,
    `it as the starting point, not the answer: keep what serves this store, and`,
    `change or add what the band's brief needs. A band whose brief describes six`,
    `frames and whose skeleton says three should end up with six.`,
    ``,
    sliceSkill("patterns", ask.order.patternIds),
    ``,
    `RULES.`,
    `1. Every band gets a spec. A band you skip is a band built by guesswork.`,
    `2. Vary between bands. Two bands with the same element list is the failure`,
    `   this whole step exists to prevent.`,
    `3. Motion is punctuation. A page where everything moves reads as a page`,
    `   where nothing does — leave most elements still.`,
    `4. Mark a node "optional": true when it would be good but the band works`,
    `   without it. Everything else is required and will be checked for.`,
    ``,
    `ANSWER SHAPE. One object, keyed by band number as given below, no prose:`,
    `{"bands":{"1":{"nodes":[{"el":"row","gap":72,"children":[`,
    `{"el":"col","basis":"44%","children":[`,
    `{"el":"heading","scale":"oversized","anim":{"reveal":"fade-up"}},`,
    `{"el":"button","anim":{"hover":"float-shadow","reveal":"fade-up","delay":1}}]},`,
    `{"el":"image","basis":"56%","ratio":0.82,"anim":{"hover":"grow"}}]}]}}}`,
  ].join("\n");
}

function userPrompt(ask: SpecAsk): string {
  const lines: string[] = [
    `STORE. ${ask.sell} · ${ask.storeType} · ${ask.styleLabel} — ${ask.styleBlurb}`,
  ];
  if (ask.prompt) lines.push(`THE MERCHANT'S OWN WORDS. ${ask.prompt}`);
  lines.push(
    `PALETTE. background ${ask.tokens.bg} · ink ${ask.tokens.ink} · ` +
      `accent ${ask.tokens.accent} · band ${ask.tokens.band}`,
    ``,
    `THE PAGE. ${ask.pageType} — ${ask.order.sections.length} bands.`,
    ``,
  );

  for (const [i, s] of ask.order.sections.entries()) {
    lines.push(
      [
        `${i + 1} · ${s.role} · ${s.pattern}`,
        s.signature ? "SIGNATURE — the most room on the page" : "",
        s.dark ? "inverted" : "",
        s.brief ? `→ ${s.brief}` : "",
      ]
        .filter(Boolean)
        .join(" · "),
    );
  }

  lines.push(``, `Return the JSON object now.`);
  return lines.join("\n");
}

/**
 * Both prompts, without calling anything.
 *
 * The same reason `deckPlan.__promptsForTest` exists: the prompt is the part of
 * this pipeline most often wrong, and every prompt bug on this branch was found
 * by reading the question rather than the answer.
 */
export function __specPromptsForTest(ask: SpecAsk): { system: string; user: string } {
  return { system: systemPrompt(ask), user: userPrompt(ask) };
}

/* ---- the call ------------------------------------------------------------ */

export async function planSpecs(ask: SpecAsk, signal?: AbortSignal): Promise<SpecOutcome> {
  if (!sectionSpecEnabled()) return empty("USE_SECTION_SPEC is not true");
  if (!isAiEnabled("design")) return empty("no design model configured");
  if (ask.order.sections.length === 0) return empty("no bands");

  const provider = getProvider("design");
  if (!provider) return empty("no design model configured");

  let text: string;
  let usage: Usage = NOTHING;
  try {
    const timer = AbortSignal.timeout(TIMEOUT_MS);
    const combined = signal ? AbortSignal.any([signal, timer]) : timer;
    const completion = await provider.complete({
      system: systemPrompt(ask),
      user: userPrompt(ask),
      maxTokens: MAX_TOKENS,
      signal: combined,
    });
    usage = completion.usage;
    if (completion.truncated)
      return { ...empty("ran out of output budget"), usage, model: provider.model };
    text = completion.text;
  } catch (err) {
    return {
      ...empty(`the call failed: ${(err as Error).message}`),
      usage,
      model: provider.model,
    };
  }

  const parsed = parseObject(text) as { bands?: Record<string, unknown> } | null;
  if (!parsed?.bands || typeof parsed.bands !== "object")
    return { ...empty("no usable JSON in the answer"), usage, model: provider.model };

  const specs = new Map<number, SectionSpec>();
  let dropped = 0;

  for (let i = 0; i < ask.order.sections.length; i++) {
    const answered = (parsed.bands as Record<string, unknown>)[String(i + 1)];
    if (answered === undefined) continue;

    const spec = vetSpec(answered);
    if (!spec) {
      dropped++;
      continue;
    }
    specs.set(i, spec);
  }

  return { specs, usage, reason: null, model: modelName("design"), dropped };
}
```

- [ ] **Step 2: Verify it compiles and lints**

```bash
npx tsc --noEmit
npx eslint lib/design/sectionSpec.ts; echo "exit=$?"
```

Expected: tsc clean, `exit=0`.

- [ ] **Step 3: Read the prompt it would send**

Prompts are the part most often wrong. Print one before spending money on it:

```bash
cat > /tmp/read-spec-prompt.ts <<'EOF'
import { createRequire } from "node:module";
import Module from "node:module";
const require_ = createRequire(import.meta.url);
const resolve_ = (Module as unknown as { _resolveFilename: (r: string, ...a: unknown[]) => string })
  ._resolveFilename;
(Module as unknown as { _resolveFilename: unknown })._resolveFilename = function (
  this: unknown, request: string, ...args: unknown[]
) {
  if (request === "server-only") return require_.resolve("./server-only.cjs");
  return resolve_.call(this, request, ...args);
} as never;

const { __specPromptsForTest } = await import("@/lib/design/sectionSpec");
const p = __specPromptsForTest({
  pageType: "home",
  order: {
    vertical: "fashion-apparel",
    archetype: "C",
    patternIds: ["hero-full-bleed-scrim", "lookbook-strip"],
    motionIds: [],
    sections: [
      { role: "hero", pattern: "hero-full-bleed-scrim", brief: "Full-bleed campaign shot.",
        signature: false, dark: false, padding: "statement", motion: "reveal", mayHaveBg: true },
      { role: "media", pattern: "lookbook-strip", brief: "Six frames of the same coat.",
        signature: true, dark: false, padding: "statement", motion: null, mayHaveBg: true },
    ],
  } as never,
  sell: "Fashion & apparel", storeType: "single-product",
  styleLabel: "Bold", styleBlurb: "High contrast, heavy type",
  prompt: "",
  tokens: { bg: "#FFFDF7", ink: "#14110B", accent: "#FF4D2E", band: "#FFF0D9" },
});
console.log("=== SYSTEM ===\n" + p.system);
console.log("\n=== USER ===\n" + p.user);
console.log(`\nsystem ${p.system.length} chars · user ${p.user.length} chars`);
EOF
cp /tmp/read-spec-prompt.ts scripts/read-spec-prompt.ts
npx tsx scripts/read-spec-prompt.ts
rm scripts/read-spec-prompt.ts
```

Expected: the pattern skeletons for `hero-full-bleed-scrim` and
`lookbook-strip` appear inside the system prompt — if that block is empty,
`sliceSkill("patterns", …)` is not finding the ids and Task 4 is not done.

- [ ] **Step 4: Commit**

```bash
git add lib/design/sectionSpec.ts
git commit -m "Stage 2b asks what is inside each band, one call per page"
```

---

### Task 5: Wire stage 2b into the build

**Files:**
- Modify: `lib/build/runner.ts:269-286` (after the deck-plan log block, before `stillWanted`)

**Interfaces:**
- Consumes: `planSpecs`, `sectionSpecEnabled` from `lib/design/sectionSpec.ts`
- Produces: `deck.plans` entries whose `sections[i].spec` is filled where 2b answered

- [ ] **Step 1: Add the import**

At the top of `lib/build/runner.ts`, beside the `deckPlan` import:

```ts
import { planSpecs, sectionSpecEnabled } from "../design/sectionSpec";
```

- [ ] **Step 2: Insert the stage after the deck-plan logging**

Place immediately after the `for (const f of deck.fallbacks) …` line and before
the `const stillWanted = …` line:

```ts
  /* ==========================================================================
     STAGE 2b — what is inside each band.

     Concurrent and per page: the bands are already fixed, so nothing here needs
     to see across pages, and one page's failure must not cost the others. A
     page whose spec does not arrive keeps `spec: null` on every band and builds
     exactly as it did before this stage existed.
     ========================================================================== */
  if (sectionSpecEnabled() && deck.plans.size > 0) {
    const specced = await Promise.all(
      [...deck.plans.entries()].map(async ([pageType, order]) => {
        const outcome = await planSpecs(
          {
            pageType,
            order,
            sell: brief.whatYouSell,
            storeType: brief.storeType,
            styleLabel: styleDef(brief.visualStyle)?.label ?? brief.visualStyle,
            styleBlurb: styleDef(brief.visualStyle)?.blurb ?? "",
            prompt: brief.prompt,
            tokens: {
              bg: palette?.bg ?? "#FFFFFF",
              ink: palette?.ink ?? "#111114",
              accent: palette?.accent ?? "#111114",
              band: palette?.surfaceAlt ?? "#F7F7F8",
            },
          },
          signal,
        );
        return { pageType, order, outcome };
      }),
    );

    for (const { pageType, order, outcome } of specced) {
      tokens += outcome.usage.input + outcome.usage.output;

      if (outcome.reason) {
        console.log(`[build] section spec · ${pageType} → no spec — ${outcome.reason}`);
        continue;
      }

      for (const [i, spec] of outcome.specs) {
        if (order.sections[i]) order.sections[i].spec = spec;
      }

      console.log(
        `[build] section spec · ${pageType} · ${outcome.specs.size}/${order.sections.length} ` +
          `bands by ${outcome.model} · ${outcome.dropped} dropped · ` +
          `in ${outcome.usage.input} out ${outcome.usage.output}`,
      );
    }
  }
```

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
npx eslint lib/build/runner.ts; echo "exit=$?"
```

Expected: tsc clean, `exit=0`.

- [ ] **Step 4: Verify the stage stays off when unset**

```bash
USE_SECTION_SPEC= npx tsx scripts/test-deckplan.ts
```

Expected: passes. `sectionSpecEnabled()` is false, so nothing new runs.

- [ ] **Step 5: Commit**

```bash
git add lib/build/runner.ts
git commit -m "The build asks stage 2b for each page's elements, concurrently"
```

---

### Task 6: The build model reads the spec, and the audit checks it

Two edits that must land together: rendering a spec the audit does not check
would be advice, and checking a spec the build model never saw would be a trap.

**Files:**
- Modify: `lib/ai/designServer.ts:220-255` (`orderLines`)
- Modify: `lib/design/audit.ts:134-150` (add the spec check to `audit`)

**Interfaces:**
- Consumes: `specProblems`, `specBinding` from `lib/design/specCheck.ts`
- Produces: no new exports; `audit()`'s signature is unchanged

- [ ] **Step 1: Render the spec into the order block**

In `lib/ai/designServer.ts`, add above `orderLines`:

```ts
/**
 * One spec node as an indented line, and its children under it.
 *
 * Indented text rather than the JSON it arrived as: the order around it is
 * lines of text, and a block of JSON in the middle of a prose prompt reads as a
 * different kind of instruction. Fields are omitted when absent so a plain
 * element is a short line.
 */
function specLines(node: SpecNode, depth: number): string[] {
  const pad = "  ".repeat(depth + 1);
  const bits = [
    node.el,
    node.scale ?? "",
    node.basis ? `basis ${node.basis}` : "",
    node.gap !== undefined ? `gap ${node.gap}` : "",
    node.ratio !== undefined ? `ratio ${node.ratio}` : "",
    node.anim?.hover ? `hover:${node.anim.hover}` : "",
    node.anim?.reveal ? `reveal:${node.anim.reveal}` : "",
    node.anim?.delay !== undefined ? `delay:${node.anim.delay}` : "",
    node.optional ? "(optional)" : "",
  ].filter(Boolean);

  return [
    `${pad}${bits.join("  ")}`,
    ...(node.children ?? []).flatMap((c) => specLines(c, depth + 1)),
  ];
}
```

and add the import at the top of the same file:

```ts
import type { SpecNode } from "../design/plan";
```

(If `plan.ts` is already imported there for `Order`, extend that import rather
than adding a second one.)

Then, inside `orderLines`, replace the `.filter(Boolean).join(" · ")` tail of
the `order.sections.map(...)` callback so the spec follows the band's line:

```ts
    ...order.sections.flatMap((s, i) => [
      [
        `${i + 1} · ${s.role}`,
        s.pattern || "(no pattern — build the role plainly)",
        s.dark ? `background ${ink}, text ${bg}` : `background ${bg}`,
        PADDING_PX[s.padding] ?? "96px 56px",
        s.signature ? "SIGNATURE — the most room and the best photograph on the page" : "",
        s.brief ? `→ ${s.brief}` : "",
        s.mayHaveBg ? "bg:allowed" : "",
        s.motion ? `motion:${s.motion}` : "",
      ]
        .filter(Boolean)
        .join(" · "),
      /* The elements, when stage 2b named them. Absent on every older path, and
         then this band is described by its pattern id alone, as before. */
      ...(s.spec ? s.spec.nodes.flatMap((n) => specLines(n, 0)) : []),
    ]),
```

Note the callback changed from `map` to `flatMap` and now returns an array.

- [ ] **Step 2: Add the spec check to the audit**

In `lib/design/audit.ts`, add the import:

```ts
import { specBinding, specProblems } from "./specCheck";
```

and add this block just before `audit()` returns `problems`:

```ts
  /* ---- the spec was the spec ---------------------------------------------
     Reported through the audit rather than through a checker of its own,
     because the audit's problems already feed a repair call that hands them
     straight back to the build model. A separate checker would need its own
     repair, and there is nothing about a missing element that the existing one
     cannot fix. */
  for (const [i, s] of order.sections.entries()) {
    const built = sections[i];
    if (!s.spec || !built) continue;
    problems.push(...specProblems(built, s.spec, specBinding()));
  }
```

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
npx tsx scripts/test-sectionspec.ts
npx tsx scripts/test-deckplan.ts
npx eslint lib/ai/designServer.ts lib/design/audit.ts; echo "exit=$?"
```

Expected: tsc clean, both scripts pass, `exit=0`.

- [ ] **Step 4: Confirm the old path is byte-identical**

A spec of null must change nothing. Print the order block for an order with no
specs and confirm it matches what the same order produced before this task:

```bash
git stash
npx tsx scripts/test-deckplan.ts > /tmp/before.txt 2>&1
git stash pop
npx tsx scripts/test-deckplan.ts > /tmp/after.txt 2>&1
diff /tmp/before.txt /tmp/after.txt && echo "IDENTICAL"
```

Expected: `IDENTICAL`.

- [ ] **Step 5: Commit**

```bash
git add lib/ai/designServer.ts lib/design/audit.ts
git commit -m "The build model is told the elements, and held to them"
```

---

### Task 7: Run it against the real models and record what happened

The first six tasks cannot show whether the pages got better. This one does, and
it is the task that decides whether the flag ships on or off.

**Files:**
- Modify: `.env.local` (not tracked — add the two flags)

- [ ] **Step 1: Turn the stage on**

Append to `.env.local`:

```
USE_SECTION_SPEC=true
PLAN_BINDING=false
```

Leave `USE_DECK_PLAN=true`, `DESIGN_PROVIDER=anthropic`, `DESIGN_MODEL=claude-opus-5`
as they are.

- [ ] **Step 2: Build two pages and capture the log**

```bash
npm run dev > /tmp/spec-run.log 2>&1 &
sleep 12
echo "open http://localhost:3000 and build home + product for a fashion store"
```

Build one deck of home + product through the UI, then:

```bash
grep -E "deck plan|section spec|ok ·|failed" /tmp/spec-run.log
```

Expected shape:

```
[build] deck plan · 2/2 page types designed by claude-opus-5 · in … out …
[build] section spec · home · 9/9 bands by claude-opus-5 · 0 dropped · in … out …
[build] section spec · product · 10/10 bands by claude-opus-5 · 0 dropped · in … out …
[build] Home ok · 9 sections · audit N · in … out …
```

- [ ] **Step 3: Read the four numbers that decide the feature**

Record, from that log:

1. **dropped** — bands whose spec did not survive `vetSpec`. Anything above 0 is
   a prompt bug: the model is emitting element or anim names outside the closed
   sets, and the fix is the wording in `systemPrompt`, not the checker.
2. **audit N** — with specs on, this now includes missing-element problems. A
   large jump from the pre-spec baseline (which was 1) means the build model is
   ignoring the spec, and the fix is where the spec sits in the prompt.
3. **stage 2b output tokens** — the spec estimated 15,000–25,000 for two pages.
   Materially above that and `MAX_TOKENS` needs revisiting.
4. **stage 3 output tokens** — expected to fall slightly against the 47,108 /
   64,290 baseline, because there is less to invent.

- [ ] **Step 4: Check the pages actually differ**

The whole point is that two stores in one trade stop matching. Build a second
deck for a different fashion brief and compare:

```bash
npx tsx scripts/baseline.ts 2
```

Expected: the distinct-padding, distinct-font-size and image-ratio counts should
not fall. If they fall, the spec is making pages MORE uniform, which is the
opposite of the goal and is a reason to leave the flag off.

- [ ] **Step 5: Write down what happened**

Append a short section to `docs/superpowers/specs/2026-08-26-section-spec-design.md`
under a `## Measured` heading with the four numbers from Step 3 and the verdict
from Step 4. A feature behind a flag with no measurement is a feature nobody can
decide about later.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/specs/2026-08-26-section-spec-design.md
git commit -m "What stage 2b actually cost, and whether the pages changed"
```

---

## Self-Review

**Spec coverage.** Architecture table → Tasks 4, 5. Seam → Task 2. Spec shape
and the three closed vocabularies → Tasks 2, 3. Stage 2b's input including the
sliced pattern skeletons → Task 4 Step 1 (`sliceSkill("patterns", ask.order.patternIds)`),
verified at Task 4 Step 3. Binding vs advisory and `PLAN_BINDING` → Task 3
(`specBinding`, `specProblems`) and Task 6 Step 2. The delta log → Task 3
(`specDelta`) and Task 5 Step 2 (the `dropped` / `specs.size` line). Failure
behaviour → Task 4's `empty()` returns and Task 5's `continue` on `outcome.reason`.
Testing list → Task 3 Step 1, all eight bullets present. Out of scope respected:
no task touches `toPagefly.ts`, `render.tsx` or `20-patterns.md`. Cost → Task 7
Step 3.

Gap found and closed: the spec's testing list says "a spec with no recognisable
nodes yields null rather than an empty spec" — covered by the `vetSpec({ nodes:
[{ el: "nope" }] })` assertion, which was missing on the first pass and is now
in Task 3 Step 1.

**Placeholder scan.** No TBDs. Every code step carries the code. Task 7's steps
are procedural rather than code because they are a measurement, and each names
the exact command and the exact number to read.

**Type consistency.** `SectionSpec`, `SpecNode`, `Scale` defined in Task 2 and
used with those names in Tasks 3, 4 and 6. `vetSpec` / `specDelta` /
`specProblems` / `specBinding` defined in Task 3, imported in Tasks 4 and 6 with
matching signatures. `SpecAsk` / `SpecOutcome` / `planSpecs` /
`sectionSpecEnabled` defined in Task 4, used in Task 5 with matching fields.
`parseObject` from Task 1 is imported in Task 4. `OrderSection.spec` set in
Task 5 and read in Task 6.
