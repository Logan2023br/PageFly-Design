import "server-only";

import { getProvider, isAiEnabled, modelName, type Usage } from "../ai/provider";
import { sliceSkill } from "../ai/skills";
import { elementForPattern } from "./elementFor";
import { sectionBounds } from "./sectionPlan";
import {
  arcIndexOf,
  pageHasOneProduct,
  patternsByRole,
  pinnedFor,
  roleFor,
  verticalRow,
  type Order,
  type OrderSection,
  type Padding,
  type SectionRole,
} from "./plan";

/* ==========================================================================
   THE WHOLE DECK, DESIGNED IN ONE CALL.

   `structure.ts` asks a model which sections a page has. This asks it the rest
   as well: how many, in what order, which band is the signature, which bands
   invert, how much room each gets, which may carry a photograph, what moves,
   and — in a sentence per band — what goes inside it.

   WHY THIS EXISTS. `finish()` decides the rhythm today, and for two of its four
   decisions it is not deciding, it is rolling dice:

       const first = draw(seed, 41, Math.max(1, middle.length));   // dark
       s.padding = i % 3 === 2 ? "dense" : "standard";             // padding

   Neither looks at what the band contains. A six-row spec table and a one-line
   quote are the same thing to `draw()`. A model that has just chosen the
   section knows which one it chose, and that is the whole bet here.

   WHAT THIS IS NOT. It is not a saving. `scripts/phase3-cost.ts` measured a
   page built to a fully-specified order, and the result recorded in
   `structure.ts` is that a precise spec costs MORE reasoning than a free
   choice. Budget for the same per-page cost or higher; the reason to run this
   is the page, not the bill.

   WHY BAND-LEVEL AND NOT ELEMENT-LEVEL. A page's design tree measured 26,726
   tokens against a 48,000 ceiling. Ten pages of element detail does not fit in
   one completion and never will — the detail does not compress by being asked
   for all at once. So this emits a plan: pattern, rhythm, and a brief per band.
   Ten pages of that is a few thousand tokens.

   THE OUTPUT IS AN `Order`, deliberately. `orderFromSlots` and `planPage`
   already produce that shape, so `orderLines`, the skill slicing, the audit,
   the exporter and the mockup renderer cannot tell which of the three ran.
   Three deciders, one seam.
   ========================================================================== */

/** Off unless asked for. Unset, a build runs exactly as it did before. */
export function deckPlanEnabled(): boolean {
  return process.env.USE_DECK_PLAN === "true";
}

/**
 * Room for a deck plus the thinking that produced it.
 *
 * Ten pages at eight bands, each a line of fields plus a sentence, is roughly
 * 6,000 tokens of answer. The rest is reasoning, which is billed against the
 * same ceiling — the design call needs 48,000 for ONE page because 26,000 of it
 * was thinking, and this call is being asked to think about ten.
 */
const MAX_TOKENS = 32_000;

const TIMEOUT_MS = 180_000;

/**
 * Floor and ceiling per page type come from `sectionPlan.ts`, not from here.
 *
 * struct-v2 shipped with a flat 3-to-12 of its own and the first real build
 * proved why that was wrong: the model gave `home` TEN sections — two product
 * grids, a stat strip, spec bars, an ingredient list, a proof wall — and the
 * page call spent all 48,000 of its output tokens thinking, returning no JSON
 * at all. The table says `home` is 7-9, cap 9, and the table was right.
 *
 * `MIN_SECTIONS` stays local because it is a different question: the table's
 * `min` is what a page SHOULD have, and this is the point below which an answer
 * is not a page at all and is thrown away.
 */
const MIN_SECTIONS = 3;

/** At most this many bands on one page may carry a photograph — see `vet`. */
const MAX_BACKGROUNDS = 2;

const PADDINGS: Padding[] = ["statement", "standard", "dense", "utility"];

/** Roles that carry detail, and detail on a photograph is unreadable. */
const NO_BG_ROLES = new Set<SectionRole>(["commerce", "proof", "utility"]);

/** Patterns whose whole design is that there is nothing behind the words. */
const NO_BG_PATTERNS = new Set(["hero-type-only", "hero-product-lead"]);

export type DeckAsk = {
  sell: string;
  storeType: string;
  /** the resolved vertical slug */
  vertical: string;
  /** every page type in the deck, deduped, in the order the merchant chose */
  pageTypes: string[];

  /* ---- the four inputs `decideStructure` never received --------------------
     Not an oversight being copied forward. This call is deciding tone — which
     band inverts, which gets the room, which carries a photograph — and every
     one of these is evidence about tone that the old call was choosing without.
     A merchant who wrote "quiet, clinical, no shouting" and a merchant who
     wrote "loud launch energy" want different rhythms from the same sections. */

  /** the merchant's own words, verbatim */
  prompt: string;
  /** the style they picked, and its one-line blurb */
  styleLabel: string;
  styleBlurb: string;
  /** airy | normal | tight */
  density: string;
  /** the palette the page will be built in */
  tokens: { bg: string; ink: string; accent: string; band: string };

  /** the merchant's reference read, when they uploaded one */
  refSections: string[] | null;
  /** the eight-field style read from the same vision pass */
  refStyle: import("../ai/refVision").RefStyle | null;
};

export type DeckOutcome = {
  /** page type → the finished order, only where it survived checking */
  plans: Map<string, Order>;
  usage: Usage;
  /** every page type that could not be used, and why */
  fallbacks: { pageType: string; reason: string }[];
  /** every repair applied to an answer that was otherwise kept */
  repairs: string[];
  /** null when the model was not asked at all */
  reason: string | null;
  /** which model actually answered, for the log */
  model: string | null;
};

const NOTHING: Usage = { input: 0, output: 0 };

function empty(reason: string): DeckOutcome {
  return { plans: new Map(), usage: NOTHING, fallbacks: [], repairs: [], reason, model: null };
}

/* ---- the prompt ---------------------------------------------------------- */

function vocabulary(): string[] {
  const out: string[] = [];
  for (const [role, ids] of patternsByRole()) {
    if (ids.length === 0) continue;
    out.push(`${role}: ${ids.join(", ")}`);
  }
  return out;
}

function systemPrompt(ask: DeckAsk): string {
  const row = verticalRow(ask.vertical);

  return [
    `You design a whole deck of pages for ONE store, in one answer.`,
    ``,
    `You decide, for every page: how many sections it has, which sections and in`,
    `what order, which one is the signature, which invert to a dark band, how`,
    `much room each gets, which may carry a photograph behind it, what moves, and`,
    `in one sentence what goes inside each band.`,
    ``,
    `THE VOCABULARY. Use these pattern ids and no others. Inventing one loses the`,
    `section. The group each sits in is the role it fills.`,
    ...vocabulary().map((l) => `  ${l}`),
    ``,
    `THIS TRADE, from the design system:`,
    sliceSkill("verticals", [ask.vertical]) || `  ${ask.vertical}`,
    ``,
    `THE FIELDS, per band.`,
    ``,
    `  pattern    one id from the vocabulary above`,
    `  role       the group that id came from`,
    `  signature  exactly ONE band per page. The most room and the best`,
    `             photograph. Never the hero — a page whose only investment is`,
    `             its first screen has nothing below the fold.`,
    `  dark       inverted: background ${ask.tokens.ink}, text ${ask.tokens.bg}.`,
    `             At least one per page of four bands or more. NEVER two`,
    `             touching — two dark bands adjacent read as one tall dark band.`,
    `  padding    statement | standard | dense | utility. Use at least three`,
    `             different values down a page. One value throughout is the`,
    `             fastest way a correct page still reads machine-made.`,
    `  bg         true if this band may carry a photograph behind it. At most`,
    `             TWO per page. Never on a commerce, proof or utility band —`,
    `             cards, tables, spec rows and forms on a photograph are`,
    `             unreadable. The failure mode is not subtlety, it is a page`,
    `             where every band shouts and none of it reads.`,
    `  motion    an id from the trade's motion register above, or null`,
    `  brief      ONE sentence: what this band actually contains on this store's`,
    `             page. Not a description of the pattern — the pattern is`,
    `             already named. What goes in it.`,
    ``,
    `RULES, in the order they matter.`,
    ``,
    `1. A page that sells one product opens with its buy box. A page that takes`,
    `   an enquiry ends with the form. These are not matters of taste and an`,
    `   answer that breaks them will be corrected.`,
    /* The lengths, per page type, resolved from the same table `vet` enforces.
       Told rather than trimmed to: a page cut from ten bands to nine loses its
       last band, which is the close — and a page that was PLANNED as nine has
       its close where it belongs. */
    `2. HOW LONG EACH PAGE IS. These are not suggestions; anything past the cap`,
    `   is cut, and the band that gets cut is your last one.`,
    ...ask.pageTypes.map((t) => {
      const b = sectionBounds(t);
      return `     ${t} — aim for ${b.target}, never more than ${b.cap}`;
    }),
    `   A six-section page of real content beats an eight-section page carrying`,
    `   two filler bands. Every band must earn its place: a band of grids or`,
    `   cards is expensive to build, and a page of nothing but grids is a page`,
    `   that cannot be built at all.`,
    `3. Open with a hero on any page that is not selling one product.`,
    `4. Do not use a buy-box pattern on a page that has no product of its own.`,
    `5. Two pages in this deck may share patterns where the page genuinely needs`,
    `   them. They may not share a sequence.`,
    `6. This trade's own signature and hero are strong preferences. Its ban list`,
    `   is not a preference.`,
    ``,
    `Answer with JSON and nothing else:`,
    `{"pages":{"<page type>":[{"pattern":"…","role":"…","signature":false,`,
    `"dark":false,"padding":"standard","bg":false,"motion":null,"brief":"…"}]}}`,
    ...(row.ban.length > 0 ? [``, `Never use: ${row.ban.join(", ")}`] : []),
  ].join("\n");
}

function userPrompt(ask: DeckAsk): string {
  const r = ask.refStyle;

  return [
    `Store sells: ${ask.sell}`,
    ask.storeType && `Store type: ${ask.storeType}`,
    ``,
    ask.prompt && `The merchant's own words: ${ask.prompt}`,
    ask.prompt && ``,
    `Visual style: ${ask.styleLabel}${ask.styleBlurb ? ` — ${ask.styleBlurb}` : ""}`,
    `Spacing pressure: ${ask.density}`,
    ``,
    `The palette these pages are built in:`,
    `  background  ${ask.tokens.bg}`,
    `  text        ${ask.tokens.ink}`,
    `  accent      ${ask.tokens.accent}`,
    `  band        ${ask.tokens.band}`,
    ``,
    `Pages in this build:`,
    ...ask.pageTypes.map((t) => `  ${t}`),
    ``,
    ...(r
      ? [
          `How the merchant's reference LOOKS, read from their upload:`,
          r.displayScale && `  display type is ${r.displayScale}`,
          r.fontMood && `  the faces are ${r.fontMood}`,
          r.accentUse && `  the accent is used ${r.accentUse.replace(/-/g, " ")}`,
          r.imageMood && `  the photography is ${r.imageMood}`,
          r.surface && `  the surface is ${r.surface}`,
          r.density && `  the spacing is ${r.density}`,
          r.corner && `  corners are ${r.corner}`,
          ``,
        ].filter(Boolean)
      : []),
    ...(ask.refSections?.length
      ? [
          `The merchant uploaded pages they want theirs to resemble. Read top to`,
          `bottom, those pages are:`,
          ...ask.refSections.map((s) => `  ${s}`),
          ``,
          `That is one or more pages of somebody else's site. Take the shape they`,
          `are pointing at and put it on the pages in this build where it belongs`,
          `— do not copy the sequence onto a page type it was not a picture of.`,
          ``,
        ]
      : []),
    `Return the JSON object now.`,
  ]
    .filter(Boolean)
    .join("\n");
}

/* ---- reading the answer -------------------------------------------------- */

function parseObject(text: string): unknown | null {
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

type RawBand = {
  pattern?: unknown;
  role?: unknown;
  signature?: unknown;
  dark?: unknown;
  padding?: unknown;
  bg?: unknown;
  motion?: unknown;
  brief?: unknown;
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function bool(v: unknown): boolean {
  return v === true || v === "true";
}

/**
 * Check one page's bands, and repair what can be repaired.
 *
 * THE REPAIRS ARE NOT SECOND-GUESSING. Every one of them is a thing that cannot
 * be true of a page rather than a thing we would have done differently: a page
 * has one signature, two dark bands cannot touch, a photograph cannot go behind
 * a spec table. Reordering a page because we would have ordered it differently
 * is not a repair, it is overruling the thing we just asked.
 *
 * Every repair is named in `notes` so it can be COUNTED. That is the number the
 * whole experiment turns on: if the model needs the rhythm fixed on most pages,
 * it was not ready to own the rhythm, and the count says so before anyone's
 * taste has to.
 */
function vet(
  pageType: string,
  raw: unknown,
  banned: (id: string) => boolean,
  notes: string[],
): OrderSection[] | null {
  if (!Array.isArray(raw)) return null;

  const { cap } = sectionBounds(pageType);
  const seen = new Set<string>();
  const bands: OrderSection[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const b = item as RawBand;

    const pattern = str(b.pattern);
    const role = roleFor(pattern);

    if (!role) {
      notes.push(`${pageType}: dropped "${pattern}" — not a pattern id`);
      continue;
    }
    if (banned(pattern)) {
      notes.push(`${pageType}: dropped "${pattern}" — this trade bans it`);
      continue;
    }
    if (!pageHasOneProduct(pageType) && elementForPattern(pattern) === "ProductBox") {
      notes.push(`${pageType}: dropped "${pattern}" — a buy box on a page with no product`);
      continue;
    }
    if (seen.has(pattern)) {
      notes.push(`${pageType}: dropped a second "${pattern}"`);
      continue;
    }
    seen.add(pattern);

    const padding = str(b.padding) as Padding;

    bands.push({
      role,
      pattern,
      signature: bool(b.signature),
      dark: bool(b.dark),
      padding: PADDINGS.includes(padding) ? padding : "standard",
      motion: str(b.motion) || null,
      mayHaveBg: bool(b.bg),
      brief: str(b.brief) || null,
    });

    if (bands.length >= cap) {
      notes.push(`${pageType}: cut to ${cap} sections — the cap for this page type`);
      break;
    }
  }

  /* THE PINS. Correctness, not taste — a product page without a buy box, a
     wholesale page that does not take the enquiry. Inserted at the position the
     arc says the role belongs at, because index 0 is right for `product` and
     wrong for `home`, whose commerce pin is a row in the middle of a page about
     something else. */
  for (const pin of pinnedFor(pageType)) {
    if (seen.has(pin) || banned(pin)) continue;
    const role = roleFor(pin);
    if (!role) continue;
    seen.add(pin);

    const at = arcIndexOf(pageType, role);
    const where =
      role === "conversion" || at === -1 ? bands.length : Math.min(at, bands.length);

    bands.splice(where, 0, {
      role,
      pattern: pin,
      signature: false,
      dark: false,
      padding: "standard",
      motion: null,
      mayHaveBg: false,
      brief: null,
    });
    notes.push(`${pageType}: inserted "${pin}" at ${where + 1} — this page type requires it`);
  }

  /* The pins go in AFTER the cap, so inserting one can push a page past it —
     a collection capped at seven came out at eight. The pin is correctness and
     the cap is a budget, so the pin stays and something else goes: the last
     band that was not pinned, which is the cheapest thing on the page to lose. */
  if (bands.length > cap) {
    const pins = new Set(pinnedFor(pageType));
    for (let i = bands.length - 1; i >= 0 && bands.length > cap; i--) {
      if (pins.has(bands[i].pattern)) continue;
      notes.push(`${pageType}: over the cap of ${cap} after a pin — dropped "${bands[i].pattern}"`);
      bands.splice(i, 1);
    }
  }

  if (bands.length < MIN_SECTIONS) return null;

  enforceSignature(pageType, bands, notes);
  enforceDark(pageType, bands, notes);
  enforcePadding(pageType, bands, notes);
  enforceBackgrounds(pageType, bands, notes);

  return bands;
}

/** Exactly one, and never the hero. */
function enforceSignature(pageType: string, bands: OrderSection[], notes: string[]): void {
  const marked = bands.map((b, i) => (b.signature ? i : -1)).filter((i) => i !== -1);
  const legal = marked.filter((i) => bands[i].role !== "hero");

  let chosen = legal[0];

  if (chosen === undefined) {
    /* Nothing usable was marked. Fall back the way `finish()` does: the first
       non-hero band, which is where the page's argument starts. */
    chosen = bands.findIndex((b, i) => i > 0 && b.role !== "hero");
    if (chosen === -1) chosen = bands.length > 1 ? 1 : 0;
    notes.push(`${pageType}: no usable signature — took band ${chosen + 1}`);
  } else if (marked.length !== 1) {
    notes.push(`${pageType}: ${marked.length} signatures — kept band ${chosen + 1}`);
  } else if (legal.length !== marked.length) {
    notes.push(`${pageType}: signature was the hero — moved to band ${chosen + 1}`);
  }

  bands.forEach((b, i) => {
    b.signature = i === chosen;
  });
}

/** At least one on a page long enough to need it, and never two touching. */
function enforceDark(pageType: string, bands: OrderSection[], notes: string[]): void {
  for (let i = 1; i < bands.length; i++) {
    if (bands[i].dark && bands[i - 1].dark) {
      bands[i].dark = false;
      notes.push(`${pageType}: bands ${i} and ${i + 1} were both dark — lightened ${i + 1}`);
    }
  }

  if (bands.length >= 4 && !bands.some((b) => b.dark)) {
    /* The closing band. A dark closing CTA is the most common good answer, and
       it cannot be adjacent to anything that is already dark because nothing is. */
    bands[bands.length - 1].dark = true;
    notes.push(`${pageType}: no dark band — inverted the closing band`);
  }
}

/** Three distinct values at least, and the signature keeps the largest. */
function enforcePadding(pageType: string, bands: OrderSection[], notes: string[]): void {
  const signature = bands.findIndex((b) => b.signature);
  if (signature !== -1 && bands[signature].padding !== "statement") {
    bands[signature].padding = "statement";
    notes.push(`${pageType}: the signature was not statement padding — made it so`);
  }

  if (bands.length < 3) return;

  const distinct = () => new Set(bands.map((b) => b.padding)).size;
  if (distinct() >= 3) return;

  /* Take a value from somewhere it costs least: not the signature, not the
     hero, working from the end of the page back toward the top. */
  for (const want of PADDINGS) {
    if (distinct() >= 3) break;
    if (bands.some((b) => b.padding === want)) continue;

    for (let i = bands.length - 1; i > 0; i--) {
      if (bands[i].signature || bands[i].role === "hero") continue;
      bands[i].padding = want;
      break;
    }
  }

  notes.push(`${pageType}: fewer than three paddings — forced to ${distinct()}`);
}

/** At most two, and never behind detail. */
function enforceBackgrounds(pageType: string, bands: OrderSection[], notes: string[]): void {
  for (const b of bands) {
    if (!b.mayHaveBg) continue;
    if (NO_BG_ROLES.has(b.role) || NO_BG_PATTERNS.has(b.pattern)) {
      b.mayHaveBg = false;
      notes.push(`${pageType}: no photograph behind "${b.pattern}" — it carries detail`);
    }
  }

  const withBg = bands.map((b, i) => (b.mayHaveBg ? i : -1)).filter((i) => i !== -1);
  if (withBg.length <= MAX_BACKGROUNDS) return;

  /* Keep the first — usually the hero, the band whose job is atmosphere before
     information — and the one furthest from it, which is the statement band. */
  const keep = new Set([withBg[0], withBg[withBg.length - 1]]);
  for (const i of withBg) if (!keep.has(i)) bands[i].mayHaveBg = false;

  notes.push(
    `${pageType}: ${withBg.length} bands wanted a photograph — kept ${keep.size}`,
  );
}

/**
 * `vet`, reachable from `scripts/test-deckplan.ts`.
 *
 * Exported rather than the test reaching into the module, because the repairs
 * are the whole experiment's instrumentation and untested instrumentation is
 * worse than none — it reports a number nobody has checked.
 */
export const __vetForTest = vet;

/* ---- the call ------------------------------------------------------------ */

export async function planDeck(ask: DeckAsk, signal?: AbortSignal): Promise<DeckOutcome> {
  if (!deckPlanEnabled()) return empty("USE_DECK_PLAN is not true");
  if (!isAiEnabled("design")) return empty("no design model configured");
  if (ask.pageTypes.length === 0) return empty("no pages");

  const provider = getProvider("design");
  if (!provider) return empty("no design model configured");

  /* INSIDE the try, all of it. This is awaited before the first page is
     designed, and anything it throws takes the whole build with it. There is no
     failure here worth more than the path that already works. */
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
    if (completion.truncated) {
      return { ...empty("ran out of output budget"), usage, model: provider.model };
    }
    text = completion.text;
  } catch (err) {
    return { ...empty(`the call failed: ${(err as Error).message}`), usage, model: provider.model };
  }

  const parsed = parseObject(text) as { pages?: Record<string, unknown> } | null;
  if (!parsed?.pages || typeof parsed.pages !== "object") {
    return { ...empty("no usable JSON in the answer"), usage, model: provider.model };
  }

  const row = verticalRow(ask.vertical);
  const banned = (id: string) => row.ban.some((b) => id === b || id.startsWith(`${b}-`));

  const plans = new Map<string, Order>();
  const fallbacks: { pageType: string; reason: string }[] = [];
  const repairs: string[] = [];

  for (const pageType of ask.pageTypes) {
    const answered = (parsed.pages as Record<string, unknown>)[pageType];
    if (answered === undefined) {
      fallbacks.push({ pageType, reason: "the model did not answer for it" });
      continue;
    }

    const bands = vet(pageType, answered, banned, repairs);
    if (!bands) {
      fallbacks.push({ pageType, reason: "the answer did not survive checking" });
      continue;
    }

    plans.set(pageType, {
      vertical: ask.vertical,
      archetype: row.archetype,
      sections: bands,
      motionIds: [...new Set(bands.map((b) => b.motion).filter(Boolean))] as string[],
      patternIds: [...new Set(bands.map((b) => b.pattern).filter(Boolean))],
    });
  }

  /* v1's whole problem was one skeleton for every page, so two page types
     answering with the same sequence is not a coincidence to tolerate. */
  const bySequence = new Map<string, string>();
  for (const pageType of ask.pageTypes) {
    const order = plans.get(pageType);
    if (!order) continue;
    const key = order.sections.map((s) => s.pattern).join(">");
    const first = bySequence.get(key);
    if (first) {
      plans.delete(pageType);
      fallbacks.push({ pageType, reason: `identical sequence to ${first}` });
      continue;
    }
    bySequence.set(key, pageType);
  }

  return { plans, usage, fallbacks, repairs, reason: null, model: modelName("design") };
}
