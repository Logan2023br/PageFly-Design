import "server-only";

import type { DesignNode, DesignSection, DesignTree } from "./schema";
import type { Order } from "./plan";

/* ==========================================================================
   The loop that was missing.

   v1 checked `sections >= 2 && nodes >= 12` — enough to block an empty page and
   nothing else. Everything a page could get wrong, it got wrong silently, and
   the merchant was the validator.

   Every check here returns ONE LINE A MODEL CAN ACT ON. Not "composition is
   poor" but "3 sections all use padding 96px 56px; give the signature 140px and
   one band 72px". A failure message that names the fix is the difference
   between a repair call that works and one that produces a differently wrong
   page.

   Deterministic and free — no model, no network. It runs on every returned
   tree, and what it returns feeds exactly one repair call. Never two: a second
   repair on a page the first could not fix is spending tokens on a model that
   has already shown it does not understand the instruction, and the instruction
   is what should change.

   The failures are also a work list. Every repeated failure names a sentence in
   `skills/` that a model could not act on — which file to edit, not which line
   of TypeScript.
   ========================================================================== */

/** Words the copy file bans outright unless the merchant used them first. */
const BANNED_ADJECTIVES = [
  "premium",
  "high-quality",
  "high quality",
  "innovative",
  "cutting-edge",
  "revolutionary",
  "game-changing",
  "elevate",
  "unleash",
  "seamless",
  "state-of-the-art",
  "world-class",
  "best-in-class",
  "top-notch",
  "unparalleled",
];

/** What a sentence must carry at least one of, per `50-copy.md`. */
const CARRIES_SUBSTANCE =
  /\d|%|\b(cm|mm|kg|g|ml|l|oz|lb|in|ft|hour|hours|day|days|week|weeks|month|months|year|years|minute|minutes|second|seconds)\b/i;

function walk(node: DesignNode | DesignSection, out: DesignNode[] = []): DesignNode[] {
  out.push(node as DesignNode);
  const kids =
    "children" in node && Array.isArray(node.children)
      ? node.children
      : "slides" in node && Array.isArray((node as { slides?: DesignNode[] }).slides)
        ? ((node as { slides: DesignNode[] }).slides)
        : [];
  for (const kid of kids) walk(kid, out);
  return out;
}

function paddingTop(css: Record<string, unknown> | undefined): string | null {
  if (!css) return null;
  const raw = css.paddingTop ?? css.padding;
  if (raw === undefined || raw === null) return null;
  return String(raw).trim().split(/\s+/)[0] || null;
}

/** Perceptual lightness of a CSS colour, or null when there is no colour. */
function lightnessOf(value: unknown): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  let r = 0;
  let g = 0;
  let b = 0;
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})\b/i.exec(raw);
  const rgb = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(raw);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].replace(/./g, (c) => c + c) : hex[1];
    [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  } else if (rgb) {
    [r, g, b] = [+rgb[1], +rgb[2], +rgb[3]];
  } else return null;

  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/**
 * Does this section step away from the page in tone?
 *
 * This used to ask a simpler question — "is the background dark" — and the
 * simpler question is wrong on a page whose own background is dark. A merchant's
 * reference on near-black now sets the page background (see `styleToTokens`), and
 * on such a page BOTH tonal checks below misfired: sections that inherit the page
 * ground set no background at all, so "no dark section" fired; sections that did
 * paint themselves dark were adjacent, so "two dark bands in a row" fired. Every
 * dark page would have failed the audit and bought a repair call that had nothing
 * to repair.
 *
 * What the checks were ever about is CONTRAST — a page in one tone reads flat,
 * whichever tone that is. So the question is asked against the page's own ground,
 * and a band is a band when it is far enough from it to be seen as one.
 *
 * The 0.25 threshold keeps the old behaviour where the old behaviour was right:
 * white against near-black is 0.95 and counts; white against a #F4F1EC tint is
 * 0.07 and does not, which is correct — a barely-tinted band is not the tonal
 * relief the check exists to require.
 */
function isBand(
  css: Record<string, unknown> | undefined,
  pageLightness: number,
): boolean {
  const own = lightnessOf(css?.background ?? css?.backgroundColor);
  if (own === null) return false;
  return Math.abs(own - pageLightness) >= 0.25;
}

function isFullBleed(section: DesignSection): boolean {
  const painted = Boolean(section.css?.background ?? section.css?.backgroundColor);
  if (!painted) return false;
  return !(section.children ?? []).some((c) => c.css?.maxWidth !== undefined);
}

/**
 * Every problem with this tree, as instructions.
 *
 * Empty means the page is buildable — not that it is beautiful, which is not
 * something code can tell.
 */
export function audit(
  tree: DesignTree,
  order: Order,
  /**
   * The page's own background.
   *
   * Defaults to white, which is what every caller meant before a reference
   * screenshot could set it: the tonal checks below compare against this, and
   * comparing against white on a near-black page is how a correct page gets
   * told it is wrong.
   */
  pageBg = "#FFFFFF",
): string[] {
  const problems: string[] = [];
  const sections = tree.sections ?? [];
  const pageLightness = lightnessOf(pageBg) ?? 1;

  if (sections.length === 0) return ["The page has no sections. Build the order."];

  const all = sections.flatMap((s) => walk(s));

  /* ---- the order was an order ------------------------------------------- */

  if (sections.length !== order.sections.length)
    problems.push(
      `The order has ${order.sections.length} sections and you built ${sections.length}. ` +
        `Build one section per order line, in that order.`,
    );

  /* ==========================================================================
     A COMMERCE SECTION HAS TO CONTAIN THE THING IT SELLS.

     The pattern field can say `product-detail-gallery` while the section is a
     heading, a paragraph and an image — the id was copied back and the buy box
     was never built. That is the one place where matching the order is not
     enough to know the page is right, because these two nodes are not styling:
     `product` expands to a ProductBox with its required slot order, and
     `productList` to a ProductList2 bound to real products. Drawn by hand out
     of image + heading + text they are dead pictures with invented names, and
     they look almost right in the mockup and are worthless on the storefront.

     Checked against the ORDER rather than the page type, like every other check
     here: the order is what was asked for.
     ========================================================================== */
  order.sections.forEach((want, i) => {
    if (want.role !== "commerce" || !want.pattern) return;
    const got = sections[i];
    if (!got) return;

    const inside = walk(got).map((n) => n.type);
    const wantsBuyBox = want.pattern.startsWith("product-detail");
    const needed = wantsBuyBox ? "product" : "productList";

    if (!inside.includes(needed))
      problems.push(
        `Section ${i + 1} was ordered as "${want.pattern}" and contains no "${needed}" node. ` +
          (wantsBuyBox
            ? `A product page's buy box is ONE product node — layout, gallery, swatches, ` +
              `compareAt and atcText are its fields. Do not draw it out of an image and a heading.`
            : `The products in a grid are ONE productList node with columns, limit and source. ` +
              `A hand-built row of image + heading cards shows invented names and cannot be bought from.`),
      );
  });

  order.sections.forEach((want, i) => {
    const got = sections[i] as (DesignSection & { pattern?: string }) | undefined;
    if (!got) return;
    if (!want.pattern) return;
    if (got.pattern !== want.pattern)
      problems.push(
        `Section ${i + 1} was ordered as "${want.pattern}" but its pattern field says ` +
          `"${got.pattern ?? "nothing"}". Build that pattern and copy the id back exactly.`,
      );
  });

  /* ---- composition ------------------------------------------------------- */

  const roles = new Set(sections.map((s) => s.role).filter(Boolean));
  if (sections.length >= 5 && roles.size < 4)
    problems.push(
      `Only ${roles.size} distinct section roles across ${sections.length} sections. ` +
        `A page that makes the same move repeatedly reads as one long section.`,
    );

  const paddings = new Set(sections.map((s) => paddingTop(s.css)).filter(Boolean));
  if (sections.length >= 3 && paddings.size < 3)
    problems.push(
      `Only ${paddings.size} distinct section padding value${paddings.size === 1 ? "" : "s"} ` +
        `(${[...paddings].join(", ")}). Give the signature section 140px, a dense band 72px, ` +
        `a utility row 56px — the order line says which is which.`,
    );

  const bleed = sections.filter(isFullBleed).length;
  if (sections.length >= 5 && bleed < 2)
    problems.push(
      `${bleed} full-bleed section${bleed === 1 ? "" : "s"}. At least two bands must reach both ` +
        `edges: put the background on the section and the maxWidth on a col inside it, not both ` +
        `on the same node.`,
    );

  const bandIndexes = sections
    .map((s, i) => (isBand(s.css, pageLightness) ? i : -1))
    .filter((i) => i >= 0);
  if (sections.length >= 3 && bandIndexes.length === 0)
    problems.push(
      `No section steps away from the page background in tone. A page in one tone reads ` +
        `flat. The order line gives each section its background colour — build the ones ` +
        `that differ from the page.`,
    );
  const adjacentBands = bandIndexes.some((i) => bandIndexes.includes(i + 1));
  if (adjacentBands)
    problems.push(
      `Two inverted bands are adjacent, which reads as one tall band. Give the second one ` +
        `the page background.`,
    );

  const ratios = new Set(
    all
      .filter((n): n is Extract<DesignNode, { type: "image" }> => n.type === "image")
      .map((n) => n.ratio.toFixed(1)),
  );
  if (ratios.size > 0 && ratios.size < 3 && all.filter((n) => n.type === "image").length >= 4)
    problems.push(
      `Every image is the same shape (${[...ratios].join(", ")}). Vary the ratios — a wide ` +
        `0.5 band, a portrait 1.2 in a column, a square 1.0 in a grid.`,
    );

  const centred = sections.filter((s) => {
    if (s.css?.textAlign === "center") return true;
    /* A centred heading inside a left-aligned band is a choice; a centred
       CONTAINER is the alignment nobody picked. So the child has to be a
       container with more than one thing in it. */
    return (s.children ?? []).some((c) => {
      if (c.css?.textAlign !== "center") return false;
      const kids = "children" in c && Array.isArray(c.children) ? c.children : [];
      return kids.length > 1;
    });
  }).length;
  if (centred > 2)
    problems.push(
      `${centred} sections are centred. Centre at most two — everything centred is the ` +
        `alignment nobody chose.`,
    );

  sections.forEach((s, i) => {
    const next = sections[i + 1];
    if (next && s.role && s.role === next.role)
      problems.push(
        `Sections ${i + 1} and ${i + 2} are both "${s.role}". Two sections making the same move ` +
          `in a row is a catalogue, not a page.`,
      );
  });

  /* ---- the signature ----------------------------------------------------- */

  const signatureOrder = order.sections.findIndex((s) => s.signature);
  if (signatureOrder >= 0 && sections[signatureOrder]) {
    const sig = sections[signatureOrder];
    const sigPad = Number.parseInt(paddingTop(sig.css) ?? "0", 10);
    const biggest = Math.max(
      ...sections.map((s) => Number.parseInt(paddingTop(s.css) ?? "0", 10)),
    );
    if (sigPad > 0 && sigPad < biggest)
      problems.push(
        `Section ${signatureOrder + 1} is the signature but another section has more vertical ` +
          `space (${biggest}px vs ${sigPad}px). The signature gets the most room on the page.`,
      );
  }

  /* ---- copy -------------------------------------------------------------- */

  const texts = all
    .filter(
      (n): n is Extract<DesignNode, { type: "heading" | "text" }> =>
        n.type === "heading" || n.type === "text",
    )
    .map((n) => ({ type: n.type, text: n.text }));

  const offenders = new Set<string>();
  for (const t of texts)
    for (const word of BANNED_ADJECTIVES)
      if (new RegExp(`\\b${word.replace(/[-\s]/g, "[-\\s]")}\\b`, "i").test(t.text))
        offenders.add(word);
  if (offenders.size > 0)
    problems.push(
      `Copy uses banned adjectives: ${[...offenders].join(", ")}. Replace each with a number, ` +
        `a material, a duration, a place, a person or a named process.`,
    );

  /* The substitution test, as much of it as code can honestly do.

     The heuristic in the SPEC — under six words, no digit, no proper noun —
     was implemented first and flagged real output that was right:
     "fragrance-reactive skin" and "Ceramide science, not spam." are exactly
     what `50-copy.md` asks for, and both were reported as substitutable. One
     had a technical compound instead of a number; the other's proper noun was
     the first word, where a capital means nothing.

     A false positive here is not free — it triggers a paid repair call and asks
     a model to rewrite a heading that was already good. So this is inverted:
     rather than guess whether a heading is specific, flag only headings made
     ENTIRELY of words that could introduce anything. High precision, low
     recall, which is the right trade for a check that spends money.

     What it cannot do is the real test — swap the product and see if the
     sentence survives. That is semantic, and a regex is not going to do it. */
  const GENERIC_WORDS = new Set([
    "our", "your", "the", "a", "an", "and", "or", "for", "with", "of", "to", "in",
    "why", "how", "what", "us", "you", "we", "it", "is", "are", "that", "this",
    "quality", "results", "benefits", "features", "advantages", "solutions",
    "story", "mission", "values", "promise", "difference", "experience",
    "choose", "choice", "better", "best", "more", "great", "good", "perfect",
    "designed", "crafted", "made", "built", "created", "care", "love",
    "products", "product", "collection", "range", "selection", "everything",
    "customers", "people", "everyone", "anyone", "life", "lifestyle",
    "get", "started", "learn", "discover", "explore", "shop", "now", "today",
    "can", "trust", "trusted", "know", "need", "want", "make", "makes", "made",
    "simply", "truly", "really", "always", "every", "all", "new", "modern",
  ]);

  const vague = texts.filter((t) => {
    if (t.type !== "heading") return false;
    const words = t.text
      .toLowerCase()
      .replace(/[^a-z\s-]/g, " ")
      .split(/\s+/)
      .filter(Boolean);
    if (words.length === 0 || words.length > 8) return false;
    if (CARRIES_SUBSTANCE.test(t.text)) return false;
    /* A hyphenated compound is technical vocabulary — "fragrance-reactive",
       "cold-pressed", "double-stitched". Nothing generic is written that way. */
    if (words.some((w) => w.includes("-"))) return false;
    return words.every((w) => GENERIC_WORDS.has(w));
  });
  if (vague.length >= 2)
    problems.push(
      `${vague.length} headings would work for any product in this trade — ` +
        `${vague.slice(0, 2).map((v) => `"${v.text}"`).join(", ")}. Each heading needs a number, ` +
        `a material, a duration, a place, a person or a named process.`,
    );

  /* A stat with no unit is a number floating free: "92" means nothing, "92%"
     and "92 hours" mean something. Only checked inside `counter` nodes, where
     the schema knows a value is a stat. */
  /* `counter` lands in Phase 5. Read structurally rather than by type so this
     check is correct before the node exists and stays correct after — a node
     with a `value` and no unit is a bare number whatever it is called. */
  const unitless = all.filter((n) => {
    const c = n as { type?: string; value?: unknown; suffix?: unknown; prefix?: unknown };
    if (c.type !== "counter") return false;
    return !c.suffix && !c.prefix && /^\d+$/.test(String(c.value ?? ""));
  });
  if (unitless.length > 0)
    problems.push(
      `${unitless.length} counter${unitless.length === 1 ? " has" : "s have"} a bare number and ` +
        `no unit. Give each a suffix or prefix — %, ×, hrs, days, or a currency.`,
    );

  return problems;
}
