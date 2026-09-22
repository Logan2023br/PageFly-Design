/* ==========================================================================
   THE LANDING PAGE IS MEASURED SECTION BY SECTION.

       npx tsx scripts/test-landing-analytics.ts

   The old landing fired two events: it was viewed, and somebody pressed a CTA.
   That answers "how many arrived" and "how many left for the brief" and
   nothing in between — a page that loses people can only be read as a single
   number, and every argument about which section to cut is then an argument
   about taste.

   The rebuilt page has nine sections. Each one reports that it was reached, so
   the funnel is readable: arrived → saw the proof → read what they get →
   compared → pressed. A section nobody scrolls to is a section to cut, and
   that is a fact rather than an opinion.

   TWO THINGS ROT IN SILENCE HERE, which is why they are tested:

   · An event name outside the app's vocabulary is DROPPED by the endpoint —
     `/^design_[a-z0-9_]+$/` — and a dropped event does not error. The count is
     simply zero, which looks exactly like nobody did the thing.
   · A section that fires no event, or two sections that fire the same one,
     read as a working funnel with a hole in it.
   ========================================================================== */
import { EV, LANDING_SECTIONS } from "../lib/analytics";

let bad = 0;
function check(ok: boolean, label: string, detail = ""): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) bad += 1;
}

/* The endpoint's own rule, copied so a change there fails here. */
const NAME = /^design_[a-z0-9_]+$/;

console.log("\nevery name the endpoint will accept");

for (const [key, name] of Object.entries(EV)) {
  check(NAME.test(name), `${key} → ${name}`);
}

console.log("\nthe landing's own funnel");

check(LANDING_SECTIONS.length >= 8, "the page reports more than a view and a click", String(LANDING_SECTIONS.length));
check(
  new Set(LANDING_SECTIONS).size === LANDING_SECTIONS.length,
  "no two sections report as the same one",
  LANDING_SECTIONS.join(" "),
);
check(
  LANDING_SECTIONS.every((s) => /^[a-z][a-z_]*$/.test(s)),
  "each is a plain name a chart can group by",
  LANDING_SECTIONS.join(" "),
);
/* The order is the page's order, so a funnel drawn from it reads top to
   bottom without anybody having to know the layout. */
check(LANDING_SECTIONS[0] === "hero", "it starts at the hero", LANDING_SECTIONS[0]);
check(
  LANDING_SECTIONS[LANDING_SECTIONS.length - 1] === "final_cta",
  "and ends at the last ask",
  LANDING_SECTIONS[LANDING_SECTIONS.length - 1],
);
const passes: readonly string[] = LANDING_SECTIONS;
for (const want of ["proof", "showcase", "get", "comparison", "how", "live", "faq"]) {
  check(passes.includes(want), `and passes through ${want}`);
}

console.log("\nevents the new sections need");

for (const key of ["landingSection", "faqOpened", "landingNav"] as const) {
  check(key in EV, `EV.${key} exists`);
}

console.log(bad === 0 ? "\nPASS" : `\nFAIL — ${bad} problems`);
if (bad > 0) process.exitCode = 1;
