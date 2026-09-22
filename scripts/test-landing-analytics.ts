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
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
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

for (const key of [
  "landingSection",
  "landingNav",
  "landingLinkClicked",
  "showcaseFilter",
  "howStepOpened",
] as const) {
  check(key in EV, `EV.${key} exists`);
}
/* And the one that was removed stays removed. `test-analytics.ts` fails any
   name here that nothing fires; this is the other half of that rule, so the
   constant cannot creep back without a call site. */
check(!("faqOpened" in EV), "EV.faqOpened is gone with the accordion");

/* ==========================================================================
   AND EVERY NAME IN THE LIST IS ACTUALLY WIRED TO A SECTION.

   The checks above prove the vocabulary is well formed. They cannot tell you
   that anybody says any of it — which is the failure that actually happened:
   the page was rebuilt to match a new mockup, a section was rewritten from
   scratch, and its `useSeen(...)` did not come back with it. `LANDING_SECTIONS`
   still listed the name, the funnel chart still had the step, and the step read
   zero forever.

   So this reads the source. Crude on purpose: a regex over the landing folder
   beats importing React components into a script that has no DOM, and the thing
   being asserted — "the string appears in a useSeen call" — is exactly what the
   regex can see.
   ========================================================================== */
console.log("\nevery section is wired to something that can fire it");

const DIR = join(import.meta.dirname, "..", "components", "landing");
const source = readdirSync(DIR)
  .filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"))
  .map((f) => readFileSync(join(DIR, f), "utf8"))
  .join("\n");

/* `useSeen<HTMLElement>("hero")` and `useSeen<HTMLDivElement>("proof")` — the
   type argument varies, the string does not. */
const wired = new Set(
  [...source.matchAll(/useSeen<[^>]*>\(\s*"([a-z_]+)"\s*\)/g)].map((m) => m[1]),
);

for (const section of LANDING_SECTIONS) {
  check(wired.has(section), `${section} is observed by a component`);
}
for (const seen of wired) {
  const known: readonly string[] = LANDING_SECTIONS;
  check(known.includes(seen), `${seen} is a name the funnel knows about`);
}

console.log(bad === 0 ? "\nPASS" : `\nFAIL — ${bad} problems`);
if (bad > 0) process.exitCode = 1;
