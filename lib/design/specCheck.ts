import "server-only";

import type { Scale, SectionSpec, SpecNode } from "./plan";
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
  "slideshow",
  "marquee",
  "row",
  "col",
]);

/** PageFly's canned button motion — mirrors `HOVERS` in `schema.ts`. */
const HOVERS = new Set(["float", "shadow", "grow", "glow", "float-shadow", "grow-shadow"]);

/** Ours, played once on scroll into view — mirrors `REVEALS` in `schema.ts`. */
const REVEALS = new Set(["fade", "fade-up", "slide-left", "slide-right", "zoom"]);

const SCALES = new Set<string>(["oversized", "large", "body", "caption", "eyebrow"]);

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

function vetNode(raw: unknown): SpecNode | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;

  const el = str(o.el);
  if (!ELEMENTS.has(el)) return null;

  const scale = SCALES.has(str(o.scale)) ? (str(o.scale) as Scale) : undefined;
  const basis = /^\d{1,3}%$/.test(str(o.basis)) ? str(o.basis) : undefined;
  const gap = num(o.gap);
  const ratio = num(o.ratio);
  const anim = vetAnim(o.anim);

  const kids = Array.isArray(o.children)
    ? o.children.map(vetNode).filter((n): n is SpecNode => n !== null)
    : [];

  return {
    el,
    ...(scale ? { scale } : {}),
    ...(basis ? { basis } : {}),
    ...(gap !== undefined ? { gap: Math.max(0, Math.round(gap)) } : {}),
    ...(ratio !== undefined ? { ratio } : {}),
    ...(anim ? { anim } : {}),
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

  if (binding && added.length)
    problems.push(
      `Section "${section.pattern}" has ${added.length} element` +
        `${added.length === 1 ? "" : "s"} the design did not ask for: ${added.join(", ")}. ` +
        `Remove ${added.length === 1 ? "it" : "them"}.`,
    );

  return problems;
}
