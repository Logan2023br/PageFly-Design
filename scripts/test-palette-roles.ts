/* ==========================================================================
   A COLOUR NAMED IN THE PROMPT REACHES THE ROLE IT IS FOR.

       npx tsx scripts/test-palette-roles.ts

   THE BUG THIS EXISTS FOR, reported as "why is the build grey". A real brief
   said:

       PALETTE #0A0A0F void, #12121A panel, #1A1A25 card,
               #FF6B00 orange, #8B5CF6 violet, #B6FF3B acid

   and the deck came back in greys. Nothing errored, nothing was logged, and the
   brief was perfectly good — grounds first then the colours that sit on them is
   how anybody writes a palette.

   `BRAND_COLOR_ROLES` is positional: first is the accent, second tints the
   alternating band, third draws the borders. Hexes lifted from the prompt were
   appended to that list in the order they appeared in the SENTENCE, so #0A0A0F
   became the accent — every button, price and badge told to be the same
   near-black as the page — and the three actual colours fell off the end of a
   three-element list.

   THE SHAPE OF THE FAILURE IS WHY THIS IS TESTED RATHER THAN WATCHED. It cannot
   throw. A palette is valid whatever is in it, the build succeeds, and the only
   symptom arrives fifteen minutes later as a deck that looks wrong for a reason
   nobody can point at.
   ========================================================================== */
import {
  BRAND_COLOR_ROLES,
  STYLE_BY_ID,
  orderHexesForRoles,
  styleToTokens,
} from "../lib/styleTokens";

let bad = 0;
function check(ok: boolean, label: string, detail = ""): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) bad += 1;
}

/** The hexes, in the order a prompt writes them. */
const from = (prompt: string): string[] =>
  Array.from(prompt.matchAll(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi)).map((m) => m[0]);

const DARK = STYLE_BY_ID.dark.tokens.bg;
const LIGHT = STYLE_BY_ID.minimal.tokens.bg;

console.log("\nthe brief that was reported");

const REPORTED =
  "PALETTE #0A0A0F void, #12121A panel, #1A1A25 card, #FF6B00 orange, #8B5CF6 violet, #B6FF3B acid.";
const hexes = from(REPORTED);
const ranked = orderHexesForRoles(hexes, DARK);

check(hexes.length === 6, "six colours are read out of it", hexes.join(" "));
check(
  ranked[0].toLowerCase() === "#ff6b00",
  "the accent is the orange, not the background",
  ranked[0],
);

/* THE WHOLE POINT OF THE NARROW FIX. An earlier version promoted every usable
   colour and handed the acid green the background of every other section. */
check(
  ranked[1].toLowerCase() === "#0a0a0f" && ranked[2].toLowerCase() === "#12121a",
  "band and borders keep the dark values the brief named for them",
  `${ranked[1]} ${ranked[2]}`,
);

check(
  new Set(ranked.map((h) => h.toLowerCase())).size === 6,
  "nothing is dropped or duplicated — only reordered",
);

const before = styleToTokens("dark", hexes);
const after = styleToTokens("dark", ranked);
check(
  before.accent !== after.accent,
  "and the resolved palette actually changes",
  `${before.accent} → ${after.accent}`,
);

console.log("\nit does not fire when there is nothing to fix");

/* A deliberately monochrome brief. Five greys, no accent intended: shuffling
   them would be the rule inventing a decision nobody made. */
const GREYS = from("Palette #111111, #333333, #555555, #777777, #999999.");
check(
  orderHexesForRoles(GREYS, LIGHT).join(" ") === GREYS.map((h) => h.toLowerCase()).join(" "),
  "an all-grey palette comes through exactly as written",
);

/* Already in the right order: the accent is first, so nothing should move. */
const ALREADY = from("Colours #E63946 primary, #F1FAEE paper, #1D3557 ink.");
check(
  orderHexesForRoles(ALREADY, LIGHT)[0].toLowerCase() === "#e63946",
  "a brief that already leads with its accent is left alone",
);

console.log("\nthe ground it is judged against matters");

/* THE REASON `ground` IS A PARAMETER. Near-black is a fine accent on white and
   an invisible one on near-black, and the same list must resolve differently. */
const MIXED = from("#0A0A0F and #FF6B00");
check(
  orderHexesForRoles(MIXED, DARK)[0].toLowerCase() === "#ff6b00",
  "on a dark page the near-black cannot be the accent",
);
check(
  orderHexesForRoles(MIXED, LIGHT)[0].toLowerCase() === "#0a0a0f",
  "on a light page it can, and is left where it was written",
);

console.log("\nthe roles it is ordering for still number three");

/* If a fourth role is ever added, the note in `orderHexesForRoles` about which
   roles need a colour has to be re-read rather than inherited. */
check(
  BRAND_COLOR_ROLES.length === 3,
  "accent, alt band, borders",
  BRAND_COLOR_ROLES.map((r) => r.label).join(" · "),
);

console.log(bad === 0 ? "\nPASS" : `\nFAIL — ${bad} problems`);
if (bad > 0) process.exitCode = 1;
