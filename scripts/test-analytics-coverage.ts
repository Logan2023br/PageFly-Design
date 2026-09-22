/* ==========================================================================
   EVERY CONTROL IN THE APP HAS A TILE ON THE ANALYTICS SCREEN.

       npx tsx scripts/test-analytics-coverage.ts

   THE FAILURE THIS EXISTS FOR, which has now happened twice.

   The landing page was rebuilt. Three new links to /design appeared — one in
   the masthead, one under the gallery, one as a pill — and four new events with
   them. Nothing errored. The admin screen kept drawing the four locations it
   had always known, a fifth tile appeared labelled `header` because an unnamed
   key renders as itself, and the three new events were recorded into the
   database every day and read by nobody.

   That is the shape of every analytics bug: the measurement does not break, it
   goes quiet, and a quiet number looks exactly like a number that is genuinely
   zero. `test-analytics.ts` catches the other half of it — a name declared in
   the vocabulary that no call site fires. This catches the half that costs more:
   a call site firing a value the SCREEN has never heard of.

   HOW IT WORKS, and why it is a text scan rather than an import.

   The route is a server module that opens a database connection on import, so
   it cannot be loaded here. What is being asserted is not behaviour, it is that
   two lists agree — the literal values at the call sites, and the literal keys
   in the route's lookup tables — and both of those are visible in the source.
   A regex over the source is the honest tool for that and fails loudly when
   either side is edited.
   ========================================================================== */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { EV, LANDING_SECTIONS } from "../lib/analytics";
import { DETAIL_OF } from "../lib/analytics/detail";

let bad = 0;
function check(ok: boolean, label: string, detail = ""): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) bad += 1;
}

const ROOT = join(import.meta.dirname, "..");

/** Every `.ts`/`.tsx` under a directory, skipping what is not ours. */
function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sources(full));
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

/* The app's own code, minus the admin screen that READS these events — it
   mentions every value by definition and would make the scan tautological. */
const APP = [join(ROOT, "app"), join(ROOT, "components"), join(ROOT, "lib")]
  .flatMap(sources)
  .filter((f) => !f.includes(join("api", "admin")) && !f.includes(join("components", "admin")))
  .map((f) => ({ file: f.slice(ROOT.length + 1), text: readFileSync(f, "utf8") }));

const ROUTE = readFileSync(join(ROOT, "app/api/admin/analytics/route.ts"), "utf8");

/* ==========================================================================
   ONE NAMED TABLE AT A TIME, NOT THE WHOLE FILE.

   The first cut of this searched the route for `faq: "` anywhere and passed.
   Then `faq: "8 · FAQ"` was deleted from the sections table to prove the check
   could fail — and it still passed, because `faq: "FAQ"` exists in the NAV
   table, a different question about a different control. A check that any
   table anywhere mentions the key is a check that cannot fail.

   So each lookup is read out of the route by name and its keys are compared
   against the right list. The route hoists them to module-level consts for
   exactly this: a table inlined inside a call has no name to ask for.
   ========================================================================== */
function tableKeys(name: string): Set<string> {
  const at = ROUTE.indexOf(`const ${name}: Record<string, string> = {`);
  if (at === -1) return new Set();
  const open = ROUTE.indexOf("{", at);
  /* The close of a module-level object literal: a newline, then `};` at
     column zero. Indentation would mean the table is inside a function, where
     it has no name this scan can reach — the route hoists them for that. */
  const close = ROUTE.indexOf("\n};", open);
  if (close === -1) return new Set();
  const body = ROUTE.slice(open, close);
  return new Set([...body.matchAll(/^\s*"?([A-Za-z0-9_]+)"?:\s*"/gm)].map((m) => m[1]));
}

/* ==========================================================================
   1 · EVERY EVENT IN THE VOCABULARY IS DRAWN SOMEWHERE ON THE SCREEN.
   ========================================================================== */
console.log("\nevery event reaches the analytics screen");

for (const [key, name] of Object.entries(EV)) {
  /* The route names events as `EV.something`, never as the string, so that is
     what is looked for — a raw string in the route would be its own bug. */
  check(new RegExp(`EV\\.${key}\\b`).test(ROUTE), `${name} has a tile`, `EV.${key}`);
}

/* ==========================================================================
   2 · EVERY VALUE A CALL SITE PASSES HAS A LABEL.

   The three parameters that name a CONTROL rather than an outcome: which link
   to /design, which nav anchor, which placement of the install button. An
   unlabelled value is not dropped — it renders as its own key, which is how a
   tile called `header` got onto the screen.
   ========================================================================== */
console.log("\nevery control a call site names is labelled on the screen");

/** The literal values passed for one prop, across the whole app. */
function passed(prop: string): { value: string; file: string }[] {
  const found: { value: string; file: string }[] = [];
  /* `location: "hero"` and `surface="topbar_landing"` — the two spellings a
     prop is written in, as a JSX attribute and as an object key. */
  const re = new RegExp(`${prop}\\s*[:=]\\s*"([a-z0-9_]+)"`, "g");
  for (const { file, text } of APP) {
    for (const m of text.matchAll(re)) found.push({ value: m[1], file });
  }
  return found;
}

for (const [prop, label, table] of [
  ["location", "links to /design", "CTA_LOCATIONS"],
  ["surface", "install-button placements", "SURFACES"],
] as const) {
  const seen = new Map<string, string>();
  for (const { value, file } of passed(prop)) if (!seen.has(value)) seen.set(value, file);

  check(seen.size > 0, `${label}: found call sites to check`, `${seen.size} values`);
  const keys = tableKeys(table);
  check(keys.size > 0, `${table} was found in the route`, `${keys.size} keys`);
  for (const [value, file] of seen) {
    check(keys.has(value), `${prop} "${value}" is named in ${table}`, file);
  }
}

/* ==========================================================================
   3 · THE LANDING PAGE'S OWN SECTIONS.

   `LANDING_SECTIONS` is the funnel's order and `test-landing-analytics.ts`
   already proves each one is wired to a component. This proves the other end:
   that the screen can draw it. A section reported by the page and unnamed here
   is a step of the funnel labelled with a variable name.
   ========================================================================== */
console.log("\nevery landing section is named on the screen");

const sectionKeys = tableKeys("LANDING_SECTIONS_LABELS");
check(sectionKeys.size > 0, "LANDING_SECTIONS_LABELS was found", `${sectionKeys.size} keys`);
for (const section of LANDING_SECTIONS) {
  check(sectionKeys.has(section), `section "${section}" is named`);
}
/* And nothing extra in it: a label for a section the page no longer has is a
   row on a funnel chart that can only ever read zero. */
for (const key of sectionKeys) {
  const known: readonly string[] = LANDING_SECTIONS;
  check(known.includes(key), `"${key}" is still a section of the page`);
}

/* ==========================================================================
   4 · WHICH TILES OPEN INTO "WHO PRESSED THIS, AND WHEN".

   Not every event needs a drill-down — a server-fired build outcome is a row in
   `runs` and better read there. But the ones somebody presses should open, and
   until this was written the entire landing page did not: every tile on the
   busiest screen in the product was a dead end.
   ========================================================================== */
console.log("\nthe tiles people press open into the presses");

const MUST_OPEN = [
  "landingViewed",
  "landingSection",
  "ctaClicked",
  "landingNav",
  "landingLinkClicked",
  "showcaseFilter",
  "howStepOpened",
  "galleryOpened",
  "pageflyInstallClicked",
  "signinViewed",
  "signinSubmitted",
  "registerViewed",
  "registerSubmitted",
  "pageExported",
  "pagePreview",
] as const;

for (const key of MUST_OPEN) {
  const name = EV[key];
  check(Boolean(name && DETAIL_OF[name]), `EV.${key} opens`, name);
}

/* Every drillable event must name a real event, or the route refuses a tile the
   screen has drawn as openable — a press that answers "no detail is kept". */
const NAMES = new Set<string>(Object.values(EV));
for (const name of Object.keys(DETAIL_OF)) {
  check(NAMES.has(name), `${name} is still in the vocabulary`);
}

console.log(bad === 0 ? "\nPASS" : `\nFAIL — ${bad} problems`);
if (bad > 0) process.exitCode = 1;
