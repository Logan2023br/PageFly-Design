import "server-only";

import type { Css, PageStyle, Scale, SectionSpec, SpecNode } from "./plan";
import { childrenOf, type DesignNode, type DesignSection } from "./schema";

/* ==========================================================================
   THE SPEC, CHECKED — no model, no I/O, no surprises.

   Two jobs that look alike and are not. `vetSpec` cleans what the design model
   said before anything relies on it; `specProblems` compares what the build
   model made against the cleaned version. The first protects the pipeline from
   an invented id, the second is the entire reason for having a spec.

   EVERYTHING UNRECOGNISED IS DROPPED, never corrected. A plausible-looking
   wrong id is worse than a missing one: the missing one costs a band some
   polish, the wrong one produces a page nobody can explain. This is the same
   treatment invented motion ids already get in `deckPlan.vet()`, and it was
   arrived at the same way — by shipping the other behaviour first.
   ========================================================================== */

/**
 * Element types the tree schema will accept, plus the two layout boxes.
 *
 * Written out rather than derived from the zod schema because the schema's
 * literals live inside twenty separate object definitions with no union to
 * read. If an element type is ever added there, this set is the second edit —
 * and a spec naming a type this set has not heard of loses that node, which is
 * a visible, cheap failure rather than a silent one.
 */
const ELEMENTS = new Set([
  "heading",
  "text",
  "button",
  "image",
  "divider",
  "icon",
  "product",
  "productList",
  "form",
  "custom",
  "overlay",
  "sticky",
  "beforeAfter",
  "counter",
  "accordion",
  "table",
  "slideshow",
  "marquee",
  "row",
  "col",
  /* A marker for a bound part of a buy box. It is in the element set because
     the design pass places it like an element; the tree schema treats it the
     same way, and the exporter turns it into the real bound element. */
  "bound",
]);

/** The seven parts of a buy box that cannot be drawn — mirrors `schema.ts`. */
const SLOTS = new Set(["title", "price", "swatches", "qty", "stock", "atc", "express"]);

/** PageFly's canned button motion — mirrors `HOVERS` in `schema.ts`. */
const HOVERS = new Set(["float", "shadow", "grow", "glow", "float-shadow", "grow-shadow"]);

/** Ours, played once on scroll into view — mirrors `REVEALS` in `schema.ts`. */
const REVEALS = new Set(["fade", "fade-up", "slide-left", "slide-right", "zoom"]);

const SCALES = new Set<string>(["oversized", "large", "body", "caption", "eyebrow"]);

/**
 * Declarations a spec may not ask for — the same list `schema.ts` enforces on
 * the tree, repeated here so the spec cannot promise what the page will drop.
 *
 * Catching it at the spec is worth the duplication: dropped at the tree, the
 * build model has already spent output tokens writing it and the audit reports
 * a section that "ignored the spec". Dropped here, the instruction is simply
 * never issued.
 */
const BANNED_CSS = new Set([
  "position",
  "inset",
  "top",
  "right",
  "bottom",
  "left",
  "zIndex",
  "float",
  "transform",
]);

/**
 * A style object from the design model, kept to what the tree will accept.
 *
 * Bounded at 24 declarations per node. Not a taste limit: a node carrying forty
 * properties is a node that has stopped deciding and started dumping a
 * stylesheet, and every one of them is billed twice — once as stage 2b output
 * and again as stage 3 input.
 */
function vetCss(raw: unknown, drops?: Map<string, number>): Css | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: Css = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    /* Counted, not just skipped. A silently dropped declaration is a decision
       the design model made and nobody can see it was refused — which is the
       whole failure mode this pipeline keeps producing in other places. The
       count reaches the build log, so "Opus asked for it and we threw it away"
       stops being invisible. */
    if (BANNED_CSS.has(k)) {
      drops?.set(k, (drops.get(k) ?? 0) + 1);
      continue;
    }
    if (Object.keys(out).length >= 24) {
      drops?.set("(over 24)", (drops.get("(over 24)") ?? 0) + 1);
      continue;
    }
    if (typeof v === "string" && v.trim() !== "") out[k] = v.trim();
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * What the last `vetSpec` / `vetPageStyle` pass refused, by property name.
 *
 * Module-level rather than threaded through every signature: `vetNode` recurses
 * and `vetSpec` is called once per band, so a return value would have to be
 * merged at four call sites for a number that is only ever read once, for a log
 * line. Reset by `beginDropTally`, read by `dropTally`.
 */
let drops = new Map<string, number>();

export function beginDropTally(): void {
  drops = new Map();
}

export function dropTally(): Record<string, number> {
  return Object.fromEntries([...drops.entries()].sort((a, b) => b[1] - a[1]));
}

/**
 * The page-level block, cleaned.
 *
 * Same treatment as a node's css, applied to every entry — a banned property is
 * no more allowed because it was written once at the top than it would be on a
 * node. Names are bounded so a model cannot invent a hundred treatments and
 * turn the shared block into the repetition it exists to prevent.
 */
export function vetPageStyle(raw: unknown): PageStyle | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;

  const bag = (v: unknown, max: number): Record<string, Css> | undefined => {
    if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
    const out: Record<string, Css> = {};
    for (const [k, raw2] of Object.entries(v as Record<string, unknown>)) {
      if (Object.keys(out).length >= max) break;
      const css = vetCss(raw2, drops);
      const name = str(k).slice(0, 40);
      if (css && name) out[name] = css;
    }
    return Object.keys(out).length ? out : undefined;
  };

  /* Five type roles exist; a sixth would be a role no node can name. */
  const type = bag(o.type, 8);
  const treatments = bag(o.treatments, 12);
  const motion = str(o.motion).slice(0, 400) || undefined;
  const note = str(o.note).slice(0, 400) || undefined;

  if (!type && !treatments && !motion && !note) return undefined;
  return {
    ...(type ? { type } : {}),
    ...(treatments ? { treatments } : {}),
    ...(motion ? { motion } : {}),
    ...(note ? { note } : {}),
  };
}

/**
 * Is the spec binding?
 *
 * Soft is the default on evidence rather than on taste. Stage 2a already
 * omitted a required commerce band from a nine-row answer and needed a code
 * repair; at element scale, with fifteen to twenty nodes a section, omissions
 * get likelier rather than rarer — and a build model forbidden to compensate
 * turns each one into a hole in the page. The design model also specifies
 * without having seen the copy, so a store whose story wants an eyebrow line
 * should be able to get one.
 *
 * The soft mode's required list is exactly what the strict mode checks, so
 * tightening later is this flag and nothing else.
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

  /* Clamped rather than dropped, because `schema.ts` clamps the same field the
     same way. A spec that disagreed with the schema about a legal value would
     report a problem the build model has no way to fix. */
  const d = num(o.delay);
  const delay = d === undefined ? undefined : Math.min(6, Math.max(0, Math.round(d)));

  if (!hover && !reveal && delay === undefined) return undefined;
  return { hover, reveal, delay };
}

/**
 * A node's children, from either place a model puts them.
 *
 * A buy box's column is `children` now, but `extras` was its name for as long
 * as the column was fixed and only the rows under the cart button were free —
 * and a model that learned the older shape still reaches for it. Reading both
 * costs one line; reading only `children` threw away an entire designed buy box
 * the first time it happened.
 */
function kidsOf(o: Record<string, unknown>): unknown[] {
  const a = Array.isArray(o.children) ? o.children : [];
  const b = Array.isArray(o.extras) ? o.extras : [];
  return [...a, ...b];
}

function vetNode(raw: unknown): SpecNode | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;

  const el = str(o.el);
  if (!ELEMENTS.has(el)) return null;

  /* A marker naming no slot, or a slot nobody has, is not a marker. Dropping
     it beats emitting a `bound` the exporter will silently resolve to nothing —
     a buy box quietly missing its price is the failure this catches. */
  if (el === "bound" && !SLOTS.has(str(o.slot))) return null;
  const slot = el === "bound" ? str(o.slot) : undefined;

  const scale = SCALES.has(str(o.scale)) ? (str(o.scale) as Scale) : undefined;
  const basis = /^\d{1,3}%$/.test(str(o.basis)) ? str(o.basis) : undefined;
  const gap = num(o.gap);
  const ratio = num(o.ratio);
  const anim = vetAnim(o.anim);
  /* The sentence saying what this element is FOR, which is the difference
     between "a text node here" and a design. Free text on purpose: it is read
     by a model, not matched by code, and the first run produced 58 of them. */
  /* Raised from 200. The cap was doing two jobs: bounding cost, and stopping
     the note becoming a stylesheet in prose. `css` now carries the values, so
     the note is back to being what it was named for — what the element is FOR —
     and 320 characters is a sentence with a reason in it rather than a
     truncated one. */
  const note = str(o.note).slice(0, 320) || undefined;
  const css = vetCss(o.css, drops);
  const use = str(o.use).slice(0, 40) || undefined;

  const kids = kidsOf(o)
    .map(vetNode)
    .filter((n): n is SpecNode => n !== null);

  return {
    el,
    ...(slot ? { slot } : {}),
    ...(scale ? { scale } : {}),
    ...(note ? { note } : {}),
    ...(basis ? { basis } : {}),
    ...(gap !== undefined ? { gap: Math.max(0, Math.round(gap)) } : {}),
    ...(ratio !== undefined ? { ratio } : {}),
    ...(anim ? { anim } : {}),
    ...(use ? { use } : {}),
    ...(css ? { css } : {}),
    ...(o.optional === true ? { optional: true } : {}),
    ...(kids.length ? { children: kids } : {}),
  };
}

/**
 * One band's raw answer, cleaned — or null if nothing survived.
 *
 * Null rather than `{ nodes: [] }` on purpose. An empty spec would flow
 * downstream and render as an empty block, which reads to the build model as
 * "this band contains nothing". Null is the value every other path already uses
 * for "nothing upstream knew", and the prompt omits it entirely.
 */
export function vetSpec(raw: unknown): SectionSpec | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const list = (raw as Record<string, unknown>).nodes;
  if (!Array.isArray(list)) return null;

  /* ONE LEVEL OF `section` IS UNWRAPPED, NOT REFUSED.

     The band already IS a section — that is what a band is — so a spec that
     opens with one is a correct instinct expressed a level too high. The first
     real run refused it and lost ten bands out of ten: every one of them was
     wrapped, every one held a complete design underneath, and 9,161 output
     tokens went in the bin over the name of a box.

     Unwrapping recovers all of it, and a model that keeps reaching for the word
     keeps being understood. Refusing would be defensible only if `section`
     meant something else here, and it does not. */
  const unwrapped = list.flatMap((n) => {
    const o = n && typeof n === "object" && !Array.isArray(n) ? (n as Record<string, unknown>) : null;
    return o && str(o.el) === "section" ? kidsOf(o) : [n];
  });

  const nodes = unwrapped.map(vetNode).filter((n): n is SpecNode => n !== null);
  return nodes.length ? { nodes } : null;
}

/* ---- comparing a built section against its spec -------------------------- */

function flatten(node: SpecNode, out: SpecNode[] = []): SpecNode[] {
  out.push(node);
  for (const c of node.children ?? []) flatten(c, out);
  return out;
}

/**
 * Every node under this one — including a product's `extras`.
 *
 * `childrenOf` deliberately does not descend into `extras`, and the rest of the
 * codebase is right to leave it that way: those rows are a property of the buy
 * box rather than free children, and the exporter treats them as such. Here it
 * matters, because the spec side now counts them. Walking one side and not the
 * other would report every buy-box row as missing on a page that has them all.
 */
function walk(node: DesignNode | DesignSection, out: DesignNode[] = []): DesignNode[] {
  const extras = (node as { extras?: DesignNode[] }).extras;
  const kids = [...childrenOf(node), ...(Array.isArray(extras) ? extras : [])];
  for (const c of kids) {
    out.push(c);
    walk(c, out);
  }
  return out;
}

/**
 * What the build did with the spec, as two lists of element types.
 *
 * COUNTED, not merely present: a spec asking for two images and a section
 * holding one has lost an image, and a presence check calls that a match.
 *
 * `row` and `col` are excluded from both sides. They are how a layout is
 * expressed rather than something a visitor sees, and a build that reaches the
 * same arrangement with one fewer wrapper has disobeyed nothing. Counting them
 * would fill the log with differences that are not differences.
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

  const made = new Map<string, number>();
  for (const node of walk(section)) {
    if (node.type === "row" || node.type === "col") continue;
    made.set(node.type, (made.get(node.type) ?? 0) + 1);
  }

  const missing: string[] = [];
  for (const [el, n] of wanted) {
    const short = n - (made.get(el) ?? 0);
    for (let i = 0; i < short; i++) missing.push(el);
  }

  const added: string[] = [];
  for (const [el, n] of made) {
    const over = n - (wanted.get(el) ?? 0);
    for (let i = 0; i < over; i++) added.push(el);
  }

  return { missing, added };
}

/**
 * Declarations the design named and the built page does not carry.
 *
 * `specDelta` above compares WHICH ELEMENTS exist and stops there, and for as
 * long as a spec only named element types that was the whole of it. A spec now
 * carries measured values — a padding, a glow, a hairline — and nothing was
 * checking them, so the build model could write its own numbers over every one
 * of them and the audit still passed. Measured on a nine-band page: of 114
 * declarations the design specified, 37 never reached the tree, including the
 * button glow the merchant's own brief had asked for.
 *
 * MATCHED BY VALUE, NOT BY NODE. Pairing spec nodes to built nodes is a tree
 * diff with no stable ids to diff on — the build model reorders, wraps and
 * splits, and a positional match reports twenty false problems on a page that
 * honoured everything. Asking instead "does this exact declaration appear
 * anywhere in this band" is weaker and it is sound: a `boxShadow` the design
 * named and the band does not contain anywhere is missing however the tree
 * moved underneath it.
 *
 * Properties whose value the build model is expected to choose are skipped —
 * it writes the copy, so it owns what the copy needs.
 */
const BUILDER_OWNS = new Set([
  /* Sized against words nobody had written when the spec was made. */
  "width",
  "height",
  "minHeight",
  "flexBasis",
  "flex",
  /* Set per node from the palette by the exporter and the audit both. */
  "textAlign",
  "objectFit",
  "overflow",
]);

function valueProblems(section: DesignSection, spec: SectionSpec): string[] {
  const want = new Map<string, string>();
  for (const node of spec.nodes.flatMap((n) => flatten(n)))
    for (const [k, v] of Object.entries(node.css ?? {}))
      if (!BUILDER_OWNS.has(k)) want.set(`${k}:${String(v).trim()}`, k);

  if (want.size === 0) return [];

  const have = new Set<string>();
  for (const node of walk(section))
    for (const [k, v] of Object.entries(
      (node as { css?: Record<string, unknown> }).css ?? {},
    ))
      have.add(`${k}:${String(v).trim()}`);

  const missing = [...want.keys()].filter((d) => !have.has(d));
  if (missing.length === 0) return [];

  /* Eight at a time. The repair call has to read every problem and fix it in
     one pass; forty declarations in one sentence is a sentence it skims. The
     rest come back on the next build rather than being crammed into this one. */
  const shown = missing.slice(0, 8);
  return [
    `Section "${section.pattern}" drops ${missing.length} value${missing.length === 1 ? "" : "s"} ` +
      `the design specified. Put ${shown.length === 1 ? "it" : "them"} back, on the element ` +
      `the design put ${shown.length === 1 ? "it" : "them"} on: ` +
      shown.map((d) => `{${d}}`).join(" · ") +
      (missing.length > shown.length ? ` … and ${missing.length - shown.length} more` : "") +
      `. These are measured, not suggestions — do not substitute your own.`,
  ];
}

/**
 * The spec's failures, phrased for the model that has to fix them.
 *
 * Sentences rather than a structure, because `audit()` returns sentences and
 * its repair call hands them straight back to the build model. A problem it
 * cannot read is a problem it cannot fix.
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

  problems.push(...valueProblems(section, spec));

  if (binding && added.length)
    problems.push(
      `Section "${section.pattern}" has ${added.length} element` +
        `${added.length === 1 ? "" : "s"} the design did not ask for: ${added.join(", ")}. ` +
        `Remove ${added.length === 1 ? "it" : "them"}.`,
    );

  return problems;
}
