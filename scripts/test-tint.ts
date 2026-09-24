/* ==========================================================================
   THE COLOUR A MERCHANT GETS, AND WHY IT MUST NOT BE THE SAME ONE.

       npx tsx scripts/test-tint.ts

   The corner card tints itself from the merchant's name. That tint is the only
   colour on the card, so it carries the whole look — and it is the kind of
   thing that fails without failing. Two ways:

     1. The hash reads something every masked name shares. Every name arrives
        here as four characters and three asterisks, so a hash over the LENGTH
        returns one answer for all of them: every avatar the same violet,
        forever, looking exactly like a deliberate design choice.

     2. The hash wanders outside the ramp. A tint picked by arithmetic rather
        than from a list is one bad modulo away from lime green on a violet
        page, and it only appears for the merchants whose names happen to land
        there — never on the one being looked at while the work is being done.

   Neither throws. Both are asserted below.
   ========================================================================== */

import { TINTS, tintFor } from "../lib/tint";

let bad = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) bad++;
};

/* Real shapes: `mask()` gives four characters and a tail, always. */
const NAMES = [
  "Drea***", "Quie***", "Brig***", "Hexw***", "Nort***",
  "Sunl***", "Mapl***", "Cedа***", "Alde***", "Fern***",
];

/* ---- 1. the same merchant is the same colour every time ----------------- */
const a = tintFor("Drea***");
const b = tintFor("Drea***");
ok("same name gives the same tint", a.from === b.from && a.to === b.to, a.from);

/* ---- 2. names of EQUAL LENGTH still spread ------------------------------ */
const lens = new Set(NAMES.map((n) => n.length));
ok("the fixture is the hard case (one length)", lens.size === 1, `lengths: ${[...lens]}`);

const spread = new Set(NAMES.map((n) => tintFor(n).from));
ok(
  "equal-length names reach at least 3 tints",
  spread.size >= 3,
  `${spread.size} of ${TINTS.length} — ${[...spread].join(" ")}`,
);

/* ---- 3. nothing is invented --------------------------------------------- */
const palette = new Set(TINTS.map((t) => t.from));
const strays = NAMES.map(tintFor).filter((t) => !palette.has(t.from));
ok("every tint comes from the ramp", strays.length === 0, strays.map((t) => t.from).join(" "));

/* ---- 4. the ramp itself stays in the brand's arc ------------------------ */
/* Violet through blue and orchid. A hue outside 230-320 is not a PageFly
   colour, and the page has exactly one accent family. */
const hueOf = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, bl] = [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  const max = Math.max(r, g, bl), min = Math.min(r, g, bl), d = max - min;
  if (d === 0) return 0;
  const h = max === r ? ((g - bl) / d) % 6 : max === g ? (bl - r) / d + 2 : (r - g) / d + 4;
  return ((h * 60) + 360) % 360;
};
const outside = TINTS.flatMap((t) => [t.from, t.to]).filter((c) => {
  const h = hueOf(c);
  return h < 230 || h > 325;
});
ok("the whole ramp is violet-to-orchid", outside.length === 0, outside.join(" "));

/* ---- 5. the stops are far enough apart TO BE SEEN apart ----------------- */
/* Found by looking, not by the test above: a palette of five can pass "three
   distinct hexes" while four of them read as the same violet on screen. Two
   stops 3 degrees apart are two rows in an array and one colour to a visitor,
   and the whole point of a per-merchant tint is that consecutive cards look
   like different merchants. */
const hues = TINTS.map((t) => hueOf(t.from)).sort((a, b) => a - b);
const gaps = hues.slice(1).map((h, i) => h - hues[i]);
ok(
  "no two stops are within 15 degrees",
  Math.min(...gaps) >= 15,
  `hues ${hues.map((h) => Math.round(h)).join(" ")} · tightest gap ${Math.round(Math.min(...gaps))}\u00b0`,
);

/* ---- 5. an empty or odd name still answers ------------------------------ */
ok("empty name still gets a tint", palette.has(tintFor("").from));
ok("bare mask still gets a tint", palette.has(tintFor("***").from));

console.log(bad === 0 ? "\nall good" : `\n${bad} failed`);
process.exit(bad === 0 ? 0 : 1);
