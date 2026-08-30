import "server-only";

import { getProvider, isAiEnabled, modelName, type Usage } from "../ai/provider";
import { sliceIds, sliceSkill } from "../ai/skills";
import { marketLines } from "./marketLines";
import { PAGE_BY_ID } from "../pageCatalog";
import { parseObject } from "../ai/json";
import { elementForPattern } from "./elementFor";
import { sectionBounds } from "./sectionPlan";
import { THE_STANDARD } from "./standard";
import {
  arcIndexOf,
  pageHasOneProduct,
  patternsByRole,
  isAdvisoryPin,
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

/** Every id `40-motion.md` actually defines. Read once — the file does not change. */
const MOTION_IDS = new Set(sliceIds("motion"));

export type DeckAsk = {
  sell: string;
  storeType: string;
  /**
   * Who the page is being sold TO, or null when the merchant did not say.
   *
   * It reaches this stage because a market changes WHICH bands a page needs —
   * somewhere to say cash on delivery is available, somewhere to carry an
   * instalment plan — and that is a decision made here, not downstream.
   */
  market: string | null;
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

/**
 * One line per page type saying what a visitor came to it for.
 *
 * Taken from the page picker rather than restated here, so the model reads the
 * sentence the merchant read when they ticked the box. A type the catalogue
 * does not know — a retired id, a landing page built from a custom slug — is
 * skipped rather than described as "a page", because a placeholder tells the
 * model less than silence and costs the same.
 */
function pageJobs(pageTypes: string[]): string[] {
  const out: string[] = [];
  for (const t of pageTypes) {
    const def = PAGE_BY_ID[t];
    if (!def) continue;
    out.push(`     ${t} — ${def.blurb}`);
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
    ...THE_STANDARD,
    ``,
    `THE VOCABULARY. Use these pattern ids and no others. Inventing one loses the`,
    `section. The group each sits in is the role it fills.`,
    ...vocabulary().map((l) => `  ${l}`),
    ``,
    /* Measured, not guessed: across seven real builds this block's named hero
       was chosen six times. The model was not deciding, it was reading a table
       — and one table entry per trade is how every apparel store in the world
       gets the same opening. What follows is now the trade's DEFAULT rather
       than its answer, and the merchant's own words outrank it. */
    `THIS TRADE, from the design system. Read it as where a store of this kind`,
    `STARTS, not where it lands:`,
    sliceSkill("verticals", [ask.vertical]) || `  ${ask.vertical}`,
    ``,
    `The hero and signature named there are the safe pick for a trade — what to`,
    `build when the brief says nothing to contradict them. THE BRIEF OUTRANKS`,
    `THEM. A merchant who says they shoot video, or that they are launching one`,
    `product, or that their photography is inconsistent, has told you more about`,
    `their opening than a trade default can know, and the default should lose.`,
    ``,
    `The BAN LIST is different and it is not a preference. Those patterns are`,
    `wrong for this trade whatever the brief says.`,
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
    `  bg         true where this band's design wants a photograph or a video`,
    `             behind it. Decide it band by band — there is no quota.`,
    `             It was capped at two a page and the cap was doing the`,
    `             deciding: every page came back with exactly two, whatever the`,
    `             page was about.`,
    `             THE HERO IS ALWAYS TRUE. A hero without one spends the page's`,
    `             first impression on a flat colour — measured across 59 shipped`,
    `             sections, one had a background photograph.`,
    `             Not on a commerce, proof or utility band unless you have a`,
    `             reason: cards, tables, spec rows and forms sitting on a`,
    `             photograph are unreadable. That is the judgement to make, not`,
    `             a rule to count against — and the failure it guards is a page`,
    `             where every band shouts and none of it reads.`,
    /* THE IDS, not the register. The register is a SENTENCE — "editorial —
       slow clip reveals, image-swap on card hover · no counters" — and asking
       for "an id from the register" got exactly what it deserved: the model
       kebab-cased the prose into `slow-clip-reveal` and `image-swap-on-card-
       hover`, neither of which exists, so `sliceSkill` logged two misses and
       the design call was handed motion names it had never seen. The register
       says which of these fit the trade; this says what they are called. */
    `  motion     one of these ids, or null — and nothing else:`,
    `             ${sliceIds("motion").join(", ")}`,
    `             The register above says which of them suit this trade, in`,
    `             prose. Read it for the choice, take the id from this line.`,
    `  brief      ONE sentence: what this band actually contains on this store's`,
    `             page. Not a description of the pattern — the pattern is`,
    `             already named. What goes in it.`,
    ``,
    /* The band a visitor decides on before they have read a word. It came back
       as a photograph with a headline over it every time, on every store,
       because nothing here suggested otherwise and the trade block names one
       hero. */
    `THE OPENING. Nine heroes, and they are not interchangeable — pick for what`,
    `this store actually has:`,
    `  hero-video-bleed    the product MOVES. Fabric, liquid, a machine running,`,
    `                      a room being used. The strongest opening there is, and`,
    `                      worthless over a slow pan of a still object.`,
    `  hero-slideshow      more than one thing to lead with — a collection, a`,
    `                      season, two audiences. Each slide its own headline AND`,
    `                      its own photograph.`,
    `  hero-split-media    words on a flat surface beside the media, nothing read`,
    `                      through a scrim. The safest opening for a store whose`,
    `                      photography is uneven.`,
    `  hero-full-bleed-scrim, hero-split-asymmetric, hero-centered-statement,`,
    `  hero-editorial-stack, hero-type-only, hero-product-lead`,
    ``,
    `A store with real motion footage and a static hero has left its best asset`,
    `unused. A store with one good photograph and a slideshow is padding.`,
    ``,
    `Give the opening a motion id. It is the one band where movement is the point`,
    `rather than the punctuation.`,
    ``,
    `RULES, in the order they matter.`,
    ``,
    /* HALF THIS RULE STOPPED BEING TRUE and the sentence had to follow. The
       buy box is still inserted when it is missing; the closing form is not.
       Leaving "will be corrected" over both would have been the prompt
       describing an enforcement that no longer runs. */
    `1. A page that sells one product opens with its buy box. That is not a`,
    `   matter of taste and an answer that breaks it will be corrected.`,
    `   A page whose whole purpose is to take an enquiry should end by taking`,
    `   it, and a page that has earned the right to ask for an email may ask.`,
    `   Both are yours to judge, WHETHER and WHICH — nothing is added for you`,
    `   and no band is named for you. A page you end without a form is built`,
    `   without one; a deck whose every page closes the same way is one ending`,
    `   chosen once and reused.`,
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
    /* SAID PER PAGE TYPE, because said as a principle it was misread. The rule
       was "open with a hero on any page that is not selling one product", and
       with `Store type: Single-product store` the model concluded that every
       page sells one product — three runs in a row opened `home` on a row of
       spec bars. The store's type is not the page's job. */
    `3. WHICH PAGES OPEN WITH A HERO. The store type does not change this — a`,
    `   single-product store still has a home page, and it still opens with a`,
    `   hero band.`,
    ...ask.pageTypes.map((t) =>
      pageHasOneProduct(t)
        ? `     ${t} — opens with its buy box, NOT a hero`
        : `     ${t} — band 1 MUST have role "hero"`,
    ),
    /* WHAT THE PAGE TYPE IS FOR — added because nothing here said it.

       Rules 2 and 3 tell the model how LONG each page type is and whether it
       opens with a hero, and that was the whole of what it knew about the
       difference between an About page and a sizing guide.

       WHAT THE RULE ACTUALLY BOUGHT, measured on the same five-page deck run
       either side of this edit rather than assumed. It did NOT fix the arcs:
       without the rule the model already picked `size-fit-guide` to carry the
       sizing page and `lead-form-split` to close the contact page. What it
       fixed was the filler. `guarantee-row` appeared on four of the five pages
       — it is the band that fits anywhere, which is exactly why it kept being
       reached for — and afterwards on two, both times for a reason: above the
       fold on the FAQ, where the rule's own example puts the answer a visitor
       came for. The About page stopped closing on a shipping promise and
       closed on a quiet newsletter line instead; the sizing page swapped a
       generic accordion for a comparison table. One run each of a model that
       does not repeat itself, so read it as a direction, not a delta.

       The descriptions are the merchant's own: the same sentence they read on
       the page picker before they ticked it, rather than a second table written
       here. One description of what a page is for, and the model reads the one
       the merchant did. A type with no catalogue entry — a retired id, a
       landing page on a custom slug — contributes no line rather than a
       placeholder, because "a page" tells the model less than silence.

       The RULE is unconditional even when the list is empty. It was written
       the other way first, dropped whole when no type was known, and left the
       numbering reading 1, 2, 3, 5 — a hole that says a rule was removed and
       does not say which. The principle holds for a page type nobody has
       described; only the descriptions are missing. */
    `4. WHAT EACH PAGE TYPE IS FOR, and what would make this one worth`,
    ...(pageJobs(ask.pageTypes).length
      ? [
          `   looking at. A visitor arrives at a page having already decided what`,
          `   they came for:`,
          ...pageJobs(ask.pageTypes),
          `   That is the FLOOR, not the design. It describes what every store's`,
          `   version of this page already does, and a page that only clears it is`,
        ]
      : [
          `   looking at. Every page type answers a question the visitor already`,
          `   had when they clicked, and answering it is the FLOOR, not the`,
          `   design — a page that only clears it is`,
        ]),
    `   a page nobody remembers. For each one, ask what this page type can do`,
    `   better than the store doing the minimum, and build the structure`,
    `   around THAT rather than around a shape that would fit any page: the`,
    `   workshop at full bleed on an About page, the table built big enough`,
    `   to actually settle the question on a sizing page, the answer a`,
    `   visitor came for sitting above the fold on an FAQ instead of behind`,
    `   an accordion. Make it the signature band, and say in that band's`,
    `   brief why it is that band and not the safe one.`,
    `   The arc that answers one page type does not answer another. If two`,
    `   pages in this deck could swap their section lists without anyone`,
    `   noticing, you designed one page and copied it.`,
    `5. Do not use a buy-box pattern on a page that has no product of its own.`,
    `6. Two pages in this deck may share patterns where the page genuinely needs`,
    `   them. They may not share a sequence.`,
    `7. The trade's hero and signature are a starting point the brief may`,
    `   overrule. Its ban list may not.`,
    `8. Two stores in the same trade should not open the same way. If the only`,
    `   reason for this hero is that the trade block names it, you have not`,
    `   chosen one — say what about THIS store makes it right, in the brief.`,
    ``,
    /* Spliced only when the merchant chose one. Absent, the spread contributes
       NOTHING — not an empty string — so a build with no market produces the
       prompt it produced before markets existed, to the byte. No `.filter` is
       added here on purpose: the empty strings in this array are deliberate
       blank lines, and filtering them would rewrite the very prompt this guard
       exists to leave alone. */
    ...(marketLines(ask.market).length ? [``, ...marketLines(ask.market)] : []),
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
    `Pages in this build, and the sections each one is REQUIRED to contain:`,
    /* Enforcement without instruction is how a product page came back with no
       product box. `vet` has always inserted a missing pin, and the model was
       never told the pin existed — so it designed eleven bands, had a twelfth
       bolted on at position 1, and went over the cap. Saying it here costs a
       line per page and buys a page designed AROUND its buy box rather than one
       repaired into having one.

       ONLY THE PINS THAT ARE STILL ENFORCED. The closing forms were printed
       here too, first as "must include" and then as "usually ends on", and both
       were the same mistake in different words: the line named the PATTERN.
       That is why every contact page in every build came back on exactly
       `lead-form-split` and every letter page on exactly `newsletter-inline` —
       the choice had already been made and the designer was reading it back.

       Rule 1 still says a page whose purpose is to take an enquiry should end
       with the form. That is the JOB, and choosing the band that does it is
       what this call is for. The table still exists for the deterministic
       planner, which runs when this model fails and has no judgement to use. */
    ...ask.pageTypes.map((t) => {
      const must = pinnedFor(t).filter((p) => !isAdvisoryPin(p));
      return must.length ? `  ${t} — must include ${must.join(", ")}` : `  ${t}`;
    }),
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
  /** the trade's own hero pattern, used only when the model chose none */
  fallbackHero: string | null = null,
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

    /* An invented motion id is worse than none. `sliceSkill` finds no block, so
       the design call gets no instructions for it AND is told to apply a name
       it has never seen — it then has to invent the behaviour, which is the
       expensive kind of guessing. Dropped rather than repaired: there is no way
       to know which real effect "slow-clip-reveal" meant. */
    const motion = str(b.motion) || null;
    const knownMotion = motion && MOTION_IDS.has(motion) ? motion : null;
    if (motion && !knownMotion) {
      notes.push(`${pageType}: dropped motion "${motion}" — not a motion id`);
    }

    bands.push({
      role,
      pattern,
      signature: bool(b.signature),
      dark: bool(b.dark),
      padding: PADDINGS.includes(padding) ? padding : "standard",
      motion: knownMotion,
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
    /* A FORM THE DESIGNER LEFT OUT STAYS OUT. Sixteen page types pin one, so
       this loop was bolting the same closing form to the foot of nearly every
       page in a deck — including pages that had already been given a better
       ending. The prompt still names it as the ending this page type usually
       earns; declining it is now a decision the designer is allowed to make,
       and silence here is what makes it one. */
    if (isAdvisoryPin(pin)) continue;
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

  enforceHero(pageType, bands, fallbackHero, cap, notes);
  /* `enforceHero` empties the page when it cannot open it — a page with no
     first screen is not a page, and the older decider will do better. */
  if (bands.length < MIN_SECTIONS) return null;

  enforceSignature(pageType, bands, notes);
  enforceDark(pageType, bands, notes);
  enforcePadding(pageType, bands, notes);
  enforceBackgrounds(pageType, bands, notes);

  return bands;
}

/**
 * A page that is not selling one product opens with a hero.
 *
 * Rule 3 of the prompt says so and the first real answer ignored it: a `home`
 * page for a fashion store opened on `spec-bars` — a row of labelled bars where
 * the first screen should be. Every arc in `plan.ts` starts with `hero` except
 * `product`, which opens with its buy box on purpose; this is that guarantee,
 * kept for the path where a model chose the sections instead of the arc.
 *
 * Moved rather than inserted. A hero further down the page is a hero the model
 * did choose, so the page keeps its length and its bands; only the order is
 * corrected. With no hero anywhere there is nothing to move and the page is
 * left alone — inventing one would mean picking a hero pattern the model never
 * asked for, which is overruling rather than repairing.
 */
function enforceHero(
  pageType: string,
  bands: OrderSection[],
  fallbackHero: string | null,
  cap: number,
  notes: string[],
): void {
  if (pageHasOneProduct(pageType)) return;
  if (bands[0]?.role === "hero") return;

  const at = bands.findIndex((b) => b.role === "hero");
  if (at !== -1) {
    const [hero] = bands.splice(at, 1);
    bands.unshift(hero);
    notes.push(`${pageType}: the hero was at band ${at + 1} — moved it to the front`);
    return;
  }

  /* No hero anywhere, three runs out of three. The trade's OWN hero goes in —
     `30-verticals.md` names one per vertical, so this is reading an answer that
     was already written down rather than inventing one. Without it the page
     opens on whatever came first, and a home page opening on a row of spec bars
     is what made the design call return an empty answer twice. */
  if (!fallbackHero || roleFor(fallbackHero) !== "hero") {
    notes.push(`${pageType}: no hero, and this trade names none — page refused`);
    bands.length = 0;
    return;
  }

  bands.unshift({
    role: "hero",
    pattern: fallbackHero,
    signature: false,
    dark: false,
    padding: "statement",
    motion: null,
    mayHaveBg: true,
    brief: null,
  });
  notes.push(`${pageType}: no hero anywhere — opened the page with "${fallbackHero}"`);

  /* The insert can push a page one past its cap, the same way a pin can. */
  if (bands.length > cap) {
    const dropped = bands.pop();
    notes.push(`${pageType}: over the cap after the hero — dropped "${dropped?.pattern}"`);
  }
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

/**
 * The two prompts, without making the call.
 *
 * For inspection: what a model is actually asked is the least visible part of
 * this pipeline and the part most often wrong — three of the defects on this
 * branch (invented motion ids, no hero, ten sections) were prompt bugs, and
 * each was found by reading the answer rather than the question. Being able to
 * read the question costs nothing and would have found them sooner.
 */
export function __promptsForTest(ask: DeckAsk): { system: string; user: string } {
  return { system: systemPrompt(ask), user: userPrompt(ask) };
}

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

    const bands = vet(pageType, answered, banned, repairs, row.hero);
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
