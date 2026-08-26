import "server-only";

import { getProvider, isAiEnabled, type Usage } from "../ai/provider";
import { parseObject } from "../ai/json";
import { sliceSkill } from "../ai/skills";
import { elementForPattern } from "./elementFor";
import {
  arcIndexOf,
  arcLength,
  pageHasOneProduct,
  patternsByRole,
  pinnedFor,
  roleFor,
  verticalRow,
  type Slot,
} from "./plan";

/* ==========================================================================
   THE SECTION LIST, DECIDED BY THE MODEL.

   The alternative to `planPage`'s arc, and it exists because the arc answered
   one question with one answer. Measured: 66 verticals, the same store, the home
   page — ONE role sequence for all of them. `arcFor` takes a page type and
   nothing else, so a skincare home page and a tools-hardware home page differed
   in which patterns filled the slots and not in what the slots were. The
   `archetype` letter the vertical file gives every trade was parsed, carried in
   the Order, and read by nothing.

   THE HONEST HISTORY, because it belongs next to this and not in a commit
   message. v1 asked the model for the structure and every page came back with
   the same skeleton — a prompt describing a good page IS a template. That is why
   the arc exists. This is not a return to v1, and the differences are the whole
   design:

     v1                              here
     ──                              ────
     asked per page                  asked ONCE per deck, so the model can see
                                     that home and product are for one store and
                                     must not be the same page
     described a good page in prose  hands over a CLOSED VOCABULARY of pattern
                                     ids and asks only for an ordering of them
     free-form                       validated against the same correctness pins
                                     the arc obeys, and repaired where it breaks
     no way back                     falls back to the arc, per page type, on any
                                     failure — and every fallback is reported

   WHAT IS STILL NOT ASKED. The rhythm: which band is the signature, which are
   dark, which get the room, which may carry a photograph, which move. All of it
   stays in `finish()`. Phase 3 measured that a precise spec costs MORE reasoning
   than a free choice, so every judgement moved into the prompt is paid for on
   every page — and these are the judgements a model asked eight times gets
   wrong by saying yes too often.

   COST. One extra completion per BUILD, not per page. A ten-page deck pays it
   once. It is the same provider as the design call, which is a reasoning model,
   so the output ceiling has to carry the thinking as well as the answer.
   ========================================================================== */

/** Turn it off without a deploy, the same way `USE_PLAN` can be. */
export function modelStructureEnabled(): boolean {
  return process.env.USE_MODEL_STRUCTURE !== "false";
}

/**
 * Room for the answer AND the thinking.
 *
 * The answer is small — ten page types at eight ids each is under 1,500 tokens.
 * The thinking is not, and it is billed against the same ceiling: the design
 * call needs 48,000 for one page because 26,000 of it was reasoning. This is a
 * far smaller question, and 20,000 is set to be wrong in the safe direction —
 * truncation here costs the arc as a fallback, not the build.
 */
const MAX_TOKENS = 20_000;

const TIMEOUT_MS = 90_000;

/** Fewer sections than this is a thin page whatever the model's reasoning was. */
const MIN_SECTIONS = 5;
/** More is a page nobody scrolls, and a deck nobody can pay for. */
const MAX_SECTIONS = 10;

export type StructureAsk = {
  sell: string;
  storeType: string;
  /** the resolved vertical slug — the same one the Order will carry */
  vertical: string;
  /** every page type in the deck, deduped, in the order the merchant chose */
  pageTypes: string[];
  /** the merchant's reference read, when they uploaded one */
  refSections: string[] | null;
};

export type StructureOutcome = {
  /** page type → the slots the model chose, only where they survived checking */
  plans: Map<string, Slot[]>;
  usage: Usage;
  /** every page type that fell back to its arc, and why */
  fallbacks: { pageType: string; reason: string }[];
  /** every repair applied to an answer that was otherwise kept */
  repairs: string[];
  /** null when the model was not asked at all */
  reason: string | null;
};

const NOTHING: Usage = { input: 0, output: 0 };

function empty(reason: string): StructureOutcome {
  return { plans: new Map(), usage: NOTHING, fallbacks: [], repairs: [], reason };
}

/* ---- the prompt ---------------------------------------------------------- */

/**
 * The vocabulary, grouped.
 *
 * Ids only, no descriptions. The descriptions are in `20-patterns.md` and the
 * design call slices in the ones it needs — sending forty-one of them here would
 * be most of a skill file spent on a question that is only about sequence, and
 * Phase 3 says the model would then reason about all forty-one.
 */
function vocabulary(): string[] {
  const out: string[] = [];
  for (const [role, ids] of patternsByRole()) {
    if (ids.length === 0) continue;
    out.push(`${role}: ${ids.join(", ")}`);
  }
  return out;
}

function systemPrompt(ask: StructureAsk): string {
  const row = verticalRow(ask.vertical);

  return [
    `You decide which sections a page has, and in what order. Nothing else.`,
    ``,
    `You are given every page in one build for ONE store. Decide all of them`,
    `together: they are the same store's pages and a merchant looking at the deck`,
    `must not see the same page twice with a different title.`,
    ``,
    `THE VOCABULARY. Use these pattern ids and no others. Inventing one loses the`,
    `section. The group each sits in is the role it fills.`,
    ...vocabulary().map((l) => `  ${l}`),
    ``,
    `THIS TRADE, from the design system:`,
    sliceSkill("verticals", [ask.vertical]) || `  ${ask.vertical}`,
    ``,
    `RULES, in the order they matter.`,
    ``,
    `1. A page that sells one product opens with its buy box. A page that takes`,
    `   an enquiry ends with the form. These are not matters of taste and an`,
    `   answer that breaks them will be corrected.`,
    `2. ${MIN_SECTIONS} to ${MAX_SECTIONS} sections per page. Aim for the length the page needs, not`,
    `   the maximum.`,
    `3. Open with a hero on any page that is not selling one product.`,
    `4. Do not use a buy-box pattern on a page that has no product of its own —`,
    `   it is bound to the page's product and there is none to bind.`,
    `5. Two pages in this deck may share patterns where the page genuinely needs`,
    `   them. They may not share a sequence.`,
    `6. This trade's own signature and hero, above, are strong preferences. Its`,
    `   ban list is not a preference.`,
    ``,
    `THE POINT OF ASKING YOU. A fixed table gave every trade the same order:`,
    `hero, reassurance, image, products, proof, story, proof, close — for a`,
    `skincare shop and a hardware shop alike. Skincare earns its sale with`,
    `evidence and should reach proof before it reaches the products. Fashion earns`,
    `it with pictures. Order the page the way THIS trade actually persuades.`,
    ``,
    `Answer with JSON and nothing else:`,
    `{"pages":{"<page type>":["<pattern id>", ...], ...}}`,
    ...(row.ban.length > 0 ? [``, `Never use: ${row.ban.join(", ")}`] : []),
  ].join("\n");
}

function userPrompt(ask: StructureAsk): string {
  return [
    `Store sells: ${ask.sell}`,
    ask.storeType && `Store type: ${ask.storeType}`,
    ``,
    `Pages in this build, and how many sections each one's slot count suggests:`,
    ...ask.pageTypes.map((t) => `  ${t} — about ${arcLength(t)} sections`),
    ``,
    ...(ask.refSections?.length
      ? [
          /* The reference used to be handed to every page with "follow that
             ORDER", which is how a merchant who uploaded a product page got a
             home page opening with a buy box: one read of one page, applied as a
             sequence to every page type in the deck. It belongs HERE, where
             something is deciding sequence per page type and can tell which of
             these sections is even relevant to which page. */
          `The merchant uploaded pages they want theirs to resemble. Read top to bottom,`,
          `those pages are:`,
          ...ask.refSections.map((s) => `  ${s}`),
          ``,
          `That is one or more pages of somebody else's site. Take the shape they are`,
          `pointing at and put it on the pages in this build where it belongs — do not`,
          `copy the sequence onto a page type it was not a picture of.`,
          ``,
        ]
      : []),
    `Return the JSON object now.`,
  ]
    .filter(Boolean)
    .join("\n");
}

/* ---- reading the answer -------------------------------------------------- */


/**
 * Check one page's list, and repair what can be repaired.
 *
 * Returns null when the answer cannot be saved, and the caller falls back to the
 * arc for that page type alone — one bad page does not cost the other nine.
 *
 * The repairs are deliberately narrow. Dropping an id the model invented is
 * obvious; reordering a page because we would have ordered it differently is not
 * a repair, it is overruling the thing we just asked. Everything that IS
 * overruled here is named in the returned notes so it can be counted rather
 * than discovered.
 */
function vet(
  pageType: string,
  ids: unknown,
  banned: (id: string) => boolean,
  notes: string[],
): Slot[] | null {
  if (!Array.isArray(ids)) return null;

  const seen = new Set<string>();
  const slots: Slot[] = [];

  for (const raw of ids) {
    if (typeof raw !== "string") continue;
    const id = raw.trim();
    const role = roleFor(id);

    if (!role) {
      notes.push(`${pageType}: dropped "${id}" — not a pattern id`);
      continue;
    }
    if (banned(id)) {
      notes.push(`${pageType}: dropped "${id}" — this trade bans it`);
      continue;
    }
    /* The rule that produced the bug this whole thread started from. A ProductBox
       takes its product from the page's context and only a product page has one,
       so on any other page it arrives empty. */
    if (!pageHasOneProduct(pageType) && requiresAProduct(id)) {
      notes.push(`${pageType}: dropped "${id}" — a buy box on a page with no product`);
      continue;
    }
    if (seen.has(id)) {
      notes.push(`${pageType}: dropped a second "${id}"`);
      continue;
    }

    seen.add(id);
    slots.push({ role, pattern: id });
    if (slots.length >= MAX_SECTIONS) break;
  }

  /* THE PINS. Correctness, not taste — see `pinnedFor`.

     WHERE a missing pin goes is its own question, and the first answer was
     wrong. Everything that was not a conversion pin went to index 0, on the
     reasoning that a page selling one product opens with its buy box. True for
     `product`, and false for `home`, whose commerce pin is a products ROW in the
     middle of a page about something else — so the first real answer from the
     model came back with a home page opening on `collection-featured-row`
     instead of a hero. The exact complaint this whole change set started from,
     reintroduced by the repair meant to protect it.

     The arc already knows where each role belongs on each page type. Ask it. */
  for (const pin of pinnedFor(pageType)) {
    if (seen.has(pin) || banned(pin)) continue;
    const role = roleFor(pin);
    if (!role) continue;
    seen.add(pin);

    const at = arcIndexOf(pageType, role);
    const where =
      role === "conversion" || at === -1
        ? slots.length /* the close, or a role this arc has no opinion about */
        : Math.min(at, slots.length);

    slots.splice(where, 0, { role, pattern: pin });
    notes.push(`${pageType}: inserted "${pin}" at ${where + 1} — this page type requires it`);
  }

  if (slots.length < MIN_SECTIONS) return null;
  return slots.slice(0, MAX_SECTIONS);
}

/** A pattern whose element is a live buy box. Mirrors `isBanned` in plan.ts. */
function requiresAProduct(id: string): boolean {
  return elementForPattern(id) === "ProductBox";
}

/* ---- the call ------------------------------------------------------------ */

export async function decideStructure(
  ask: StructureAsk,
  signal?: AbortSignal,
): Promise<StructureOutcome> {
  if (!modelStructureEnabled()) return empty("USE_MODEL_STRUCTURE=false");
  if (!isAiEnabled()) return empty("no model configured");
  if (ask.pageTypes.length === 0) return empty("no pages");

  const provider = getProvider();
  if (!provider) return empty("no model configured");

  /* INSIDE the try, all of it. `AbortSignal.any` needs Node 20 and the package
     only asks for >=20.9, but that is not the point: this function is awaited
     before the first page is designed, and anything it throws takes the whole
     build with it. There is no failure here worth more than an arc. */
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
      return { ...empty("ran out of output budget"), usage };
    }
    text = completion.text;
  } catch (err) {
    return { ...empty(`the call failed: ${(err as Error).message}`), usage };
  }

  const parsed = parseObject(text) as { pages?: Record<string, unknown> } | null;
  if (!parsed?.pages || typeof parsed.pages !== "object") {
    return { ...empty("no usable JSON in the answer"), usage };
  }

  const row = verticalRow(ask.vertical);
  const banned = (id: string) =>
    row.ban.some((b) => id === b || id.startsWith(`${b}-`));

  const plans = new Map<string, Slot[]>();
  const fallbacks: { pageType: string; reason: string }[] = [];
  const repairs: string[] = [];

  for (const pageType of ask.pageTypes) {
    const answered = (parsed.pages as Record<string, unknown>)[pageType];
    if (answered === undefined) {
      fallbacks.push({ pageType, reason: "the model did not answer for it" });
      continue;
    }

    const slots = vet(pageType, answered, banned, repairs);
    if (!slots) {
      fallbacks.push({ pageType, reason: "the answer did not survive checking" });
      continue;
    }
    plans.set(pageType, slots);
  }

  /* THE FAILURE THIS FEATURE IS MOST LIKELY TO HAVE. v1's whole problem was one
     skeleton for every page, so two page types answering with the same sequence
     is not a coincidence to tolerate — it is the old bug wearing new clothes.
     The later page falls back to its arc, which is guaranteed to differ. */
  const bySequence = new Map<string, string>();
  for (const pageType of ask.pageTypes) {
    const slots = plans.get(pageType);
    if (!slots) continue;
    const key = slots.map((s) => s.pattern).join(">");
    const first = bySequence.get(key);
    if (first) {
      plans.delete(pageType);
      fallbacks.push({ pageType, reason: `identical sequence to ${first}` });
      continue;
    }
    bySequence.set(key, pageType);
  }

  return { plans, usage, fallbacks, repairs, reason: null };
}
