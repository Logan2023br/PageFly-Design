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

/** Luminance rather than a list of names: dark is `#0A0A0A`, `#111` and `rgb(12,12,14)`. */
function isDark(css: Record<string, unknown> | undefined): boolean {
  if (!css) return false;
  const raw = String(css.background ?? css.backgroundColor ?? "").trim();
  if (!raw) return false;

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
  } else return false;

  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.35;
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
export function audit(tree: DesignTree, order: Order): string[] {
  const problems: string[] = [];
  const sections = tree.sections ?? [];

  if (sections.length === 0) return ["The page has no sections. Build the order."];

  const all = sections.flatMap((s) => walk(s));

  /* ---- the order was an order ------------------------------------------- */

  if (sections.length !== order.sections.length)
    problems.push(
      `The order has ${order.sections.length} sections and you built ${sections.length}. ` +
        `Build one section per order line, in that order.`,
    );

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

  const darkIndexes = sections.map((s, i) => (isDark(s.css) ? i : -1)).filter((i) => i >= 0);
  if (sections.length >= 3 && darkIndexes.length === 0)
    problems.push(
      `No dark section. A page in one tone reads flat. The order line marks which sections ` +
        `are dark — give those a near-black background and light text.`,
    );
  const adjacentDark = darkIndexes.some((i) => darkIndexes.includes(i + 1));
  if (adjacentDark)
    problems.push(
      `Two dark sections are adjacent, which reads as one tall dark band. Make the second one light.`,
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

  /* The substitution test, as much of it as code can do. A heading of a few
     words with no number, no unit and no capitalised noun says nothing that
     could not be said about a different product in the same trade. Deliberately
     narrow: it is better to miss a vague heading than to flag a good short one
     and send the model to rewrite something that was right. */
  const vague = texts.filter((t) => {
    if (t.type !== "heading") return false;
    const words = t.text.trim().split(/\s+/);
    if (words.length >= 6) return false;
    if (CARRIES_SUBSTANCE.test(t.text)) return false;
    /* A capitalised word that is not the first is a proper noun — a place, a
       material with a brand name, a person. */
    return !words.slice(1).some((w) => /^[A-Z][a-z]/.test(w));
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
