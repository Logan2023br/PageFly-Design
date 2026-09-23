/* ==========================================================================
   THE BEHAVIOUR AN EXPORTED PAGE KEEPS.

       npx tsx scripts/test-page-behaviour.ts

   Four repairs, and every one of them fixes a failure that CANNOT THROW. That
   is the whole reason this file exists: a page whose script was dropped, whose
   class names were renamed, or whose tab bar came back as four stacked boxes is
   a page that exports cleanly, imports cleanly, renders cleanly and does
   nothing. Nothing in the pipeline had a way to notice.

     SCRIPT     `outsideScripts` — the `<script>` after `</main>`, which is
                where a mockup puts its countdown, its carousel and its tab
                controller, and which reached the transcriber in no band at all.
                Measured on the seven Hexwood pages: the same 9.1 KB missing
                from every one.
     HOOKS      the mockup's class, id and `data-*`, carried to the export so
                the selectors in that script still address something.
     NATIVE     tabs, countdowns, accordions, slideshows and forms come back as
                PageFly elements or the band is asked again.
     PAGE JS    what is left, rewritten and checked — above all for the one `<`
                that makes PageFly refuse the whole file.

   EVERY CHECK HERE WAS RUN AGAINST A DELIBERATELY BROKEN VERSION of the thing
   it guards before it was committed. A guard that cannot fail is not a guard.
   ========================================================================== */

import { createRequire } from "node:module";
import Module from "node:module";
import { readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";

const require_ = createRequire(import.meta.url);
const resolve_ = (Module as unknown as { _resolveFilename: (r: string, ...a: unknown[]) => string })
  ._resolveFilename;
(Module as unknown as { _resolveFilename: unknown })._resolveFilename = function (
  this: unknown,
  request: string,
  ...args: unknown[]
) {
  if (request === "server-only") return require_.resolve("./server-only.cjs");
  const hit = resolve_.call(this, request, ...args);
  return /lib[/\\]ai[/\\]provider\.ts$/.test(hit) ? require_.resolve("./provider-stub.cjs") : hit;
} as never;

const { splitSections, outsideScripts } = require_(
  "../lib/pagefly/fromHtmlSkill",
) as typeof import("../lib/pagefly/fromHtmlSkill");
const { featuresInHtml, missingFeatures, retryNote } = require_(
  "../lib/pagefly/nativeFeatures",
) as typeof import("../lib/pagefly/nativeFeatures");
const { pageScriptFor } = require_(
  "../lib/pagefly/pageScript",
) as typeof import("../lib/pagefly/pageScript");
const { pageflyFromHtmlLive } = require_(
  "../lib/pagefly/htmlToTree",
) as typeof import("../lib/pagefly/htmlToTree");
const { pageflyFromTree } = require_(
  "../lib/design/toPagefly",
) as typeof import("../lib/design/toPagefly");
const { designTreeSchema } = require_(
  "../lib/design/schema",
) as typeof import("../lib/design/schema");

let failures = 0;
function check(ok: boolean, label: string, detail = ""): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}
function head(label: string): void {
  console.log(`\n${label}`);
}

/* Everything below is one function because `require_` puts this file in CJS,
   where a top-level await is a syntax error. */
async function main(): Promise<void> {

/* ── the script the bands do not carry ─────────────────────────────────── */

head("the page's script reaches the export");

const mockup = `<!doctype html><html><head>
<style>:root{--ink:#111}.hero{color:var(--ink)}</style>
</head><body>
<main>
<section class="hero" id="top" data-panel="care"><h1>Hi</h1></section>
<section class="two"><p>Two</p></section>
</main>
<script>/* PAGE-LEVEL */ document.querySelectorAll('.hero')</script>
</body></html>`;

{
  const got = outsideScripts(mockup);
  check(got.length === 1, "the script after </main> is collected", `${got.length} found`);
  check(got[0]?.includes("PAGE-LEVEL") === true, "and it is the right one");

  /* A band's OWN script stays in the band. Collected here as well it would ship
     twice and run twice, which for a countdown means a clock ticking double. */
  const inBand = `<!doctype html><html><head></head><body><main>
<section class="a"><script>/* IN-BAND */ 1</script></section>
</main></body></html>`;
  check(
    splitSections(inBand)[0].includes("IN-BAND") && outsideScripts(inBand).length === 0,
    "a script inside a band is not collected twice",
  );

  /* `<head>` is already sent whole on every band call. */
  const headJs = `<!doctype html><html><head><script>/* HEAD */ 1</script></head><body><main>
<section class="a"><p>x</p></section></main></body></html>`;
  check(outsideScripts(headJs).length === 0, "a script in <head> is not collected");

  /* An external script has no source to rewrite. */
  const ext = `<!doctype html><html><head></head><body><main><section class="a"><p>x</p></section></main>
<script src="https://cdn.example/x.js"></script></body></html>`;
  check(outsideScripts(ext).length === 0, "a <script src> is skipped");
}

/* THE REAL PAGES, which is where the number came from. */
head("every script in a real page is accounted for");
for (const slug of ["home", "product-page", "collection-page", "contact"]) {
  const html = readFileSync(`public/showcase/hexwood/${slug}.html`, "utf8");
  const inFile = (html.match(/<script\b/gi) || []).length;
  const inHead = ((/<head[^>]*>([\s\S]*?)<\/head>/i.exec(html)?.[1] ?? "").match(/<script\b/gi) || [])
    .length;
  const inBands = (splitSections(html).join("\n").match(/<script\b/gi) || []).length;
  const collected = outsideScripts(html).length;
  check(
    inHead + inBands + collected === inFile,
    `${slug}: ${inFile} script(s) = ${inHead} head + ${inBands} band + ${collected} collected`,
  );
}

/* ── the mockup's own names ────────────────────────────────────────────── */

head("the mockup's class, id and data-* survive the export");

const hooked = {
  motionPlan: "",
  sections: [
    {
      type: "section",
      role: "hero",
      hook: { class: "hx-hero dark", id: "top" },
      children: [
        {
          type: "heading",
          level: 1,
          text: "Get spooked",
          hook: { class: "hx-title", data: { panel: "care" } },
        },
        { type: "text", text: "no hook here" },
      ],
    },
  ],
};

{
  const parsed = designTreeSchema.safeParse(hooked);
  check(parsed.success, "a tree with hooks parses");

  const { blob } = pageflyFromTree(
    parsed.success ? parsed.data : (hooked as never),
    { name: "probe", bg: "#0A0A0A", ink: "#F6F6F4", fontBody: "Inter" },
    1180,
  );
  const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  const page = JSON.parse(strFromU8(files[Object.keys(files)[0]])) as {
    items: { data?: Record<string, unknown> }[];
    customJS?: string;
  };
  const classes = page.items
    .map((i) => (typeof i.data?.classGlobalStyling === "string" ? i.data.classGlobalStyling : ""))
    .join(" ");

  check(/\bhx-hero\b/.test(classes), "the band's own class is on the page");
  check(/\bhx-title\b/.test(classes), "a leaf's class is on the page");
  check(
    /\bpf-design-export\b/.test(classes),
    "and the exporter's own class was appended to, not replaced",
  );

  /* PageFly has no field for either, so they ride on a marker class and a table
     in the page's script — see lib/design/hook.ts. */
  const js = page.customJS ?? "";
  check(/\bpfd-h-\d+\b/.test(classes), "a node with an id gets a marker class");
  check(js.includes('"id","top"'), "the id is in the boot table", js.slice(0, 0));
  check(js.includes('"data-panel","care"'), "and so is the data attribute");
  check(!js.includes("<"), "the boot table contains no `<`");

  /* The table is keyed per node, which is the whole reason for the marker: two
     elements sharing a class and differing by attribute must not collide. */
  const twoTabs = {
    motionPlan: "",
    sections: [
      {
        type: "section",
        role: "hero",
        children: [
          { type: "text", text: "A", hook: { class: "tab", data: { tab: "one" } } },
          { type: "text", text: "B", hook: { class: "tab", data: { tab: "two" } } },
        ],
      },
    ],
  };
  const second = pageflyFromTree(
    designTreeSchema.parse(twoTabs),
    { name: "probe", bg: "#fff", ink: "#111", fontBody: "Inter" },
    1180,
  );
  const f2 = unzipSync(new Uint8Array(await second.blob.arrayBuffer()));
  const p2 = JSON.parse(strFromU8(f2[Object.keys(f2)[0]])) as { customJS?: string };
  const table = p2.customJS ?? "";
  check(
    table.includes('"data-tab","one"') && table.includes('"data-tab","two"'),
    "two nodes sharing a class keep their own attributes",
  );
  check(
    (table.match(/pfd-h-\d+/g) || []).length === 2,
    "each got its own marker",
    `${(table.match(/pfd-h-\d+/g) || []).join(",")}`,
  );

  /* A page with no ids and no data attributes carries no table at all. */
  const plain = pageflyFromTree(
    designTreeSchema.parse({
      motionPlan: "",
      sections: [
        { type: "section", role: "hero", children: [{ type: "text", text: "x", hook: { class: "a" } }] },
      ],
    }),
    { name: "probe", bg: "#fff", ink: "#111", fontBody: "Inter" },
    1180,
  );
  const f3 = unzipSync(new Uint8Array(await plain.blob.arrayBuffer()));
  const p3 = JSON.parse(strFromU8(f3[Object.keys(f3)[0]])) as { customJS?: string };
  check(!(p3.customJS ?? "").includes("pfd-h-"), "a page with no ids ships no boot table");
}

/* ── the five that must not arrive as boxes ────────────────────────────── */

head("a widget transcribed as boxes is caught");

const TABS_HTML = `<section class="faq"><div role="tablist"><button role="tab">Care</button>
<button role="tab">Sizing</button></div><div class="panel">…</div></section>`;
const FAQ_HTML = `<section class="faq"><details><summary>Q1</summary><p>A1</p></details>
<details><summary>Q2</summary><p>A2</p></details></section>`;
const CLOCK_HTML = `<section class="sale"><div class="countdown" data-deadline="2026-10-31">
<span>02</span><small>Days</small><span>11</span><small>Hrs</small></div></section>`;
const SLIDES_HTML = `<section class="q"><div class="carousel"><figure class="slide">A</figure>
<figure class="slide">B</figure></div></section>`;
const FORM_HTML = `<section class="n"><form><input type="email"><button>Join</button></form></section>`;
const PLAIN_HTML = `<section class="about"><h2>Our story</h2><p>We started in a garage.</p>
<table><tr><td>Size</td><td>Chest</td></tr></table></section>`;

check(featuresInHtml(TABS_HTML).includes("tabs"), "a tablist is seen");
check(featuresInHtml(FAQ_HTML).includes("accordion"), "a <details> FAQ is seen");
check(featuresInHtml(CLOCK_HTML).includes("countdown"), "a countdown is seen");
check(featuresInHtml(SLIDES_HTML).includes("slideshow"), "a carousel is seen");
check(featuresInHtml(FORM_HTML).includes("form"), "a form is seen");
check(
  featuresInHtml(PLAIN_HTML).length === 0,
  "and plain prose is not",
  featuresInHtml(PLAIN_HTML).join(","),
);

{
  const boxes = { type: "section", role: "faq", children: [{ type: "text", text: "Care" }] };
  const native = {
    type: "section",
    role: "faq",
    children: [{ type: "tabs", tabs: [{ label: "Care", children: [] }] }],
  };
  check(missingFeatures(TABS_HTML, boxes).includes("tabs"), "boxes where a tab bar was: caught");
  check(missingFeatures(TABS_HTML, native).length === 0, "a real tabs node: passed");
  check(
    retryNote(["tabs"]).includes("`tabs`"),
    "the retry names the node type it wants",
  );

  /* A buy box IS PageFly's media slider, so a product band that came back bound
     has not lost its carousel. Without this every product page pays for a retry
     it cannot win. */
  const product = { type: "section", role: "buy", children: [{ type: "product", gallery: true }] };
  check(
    missingFeatures(SLIDES_HTML, product).length === 0,
    "a bound product is not asked for a slideshow",
  );
}

/* ── the page's script, rewritten ──────────────────────────────────────── */

head("what the rewritten script is allowed to be");

const reply = (text: string) => {
  (globalThis as { __PFD_REPLY?: unknown }).__PFD_REPLY = text;
};
const asked = () =>
  (globalThis as { __PFD_ASKED?: { user: string; system: string }[] }).__PFD_ASKED ?? [];

{
  reply("");
  const none = await pageScriptFor([], { native: [], classes: [] });
  check(none.js === "" && asked().length === 0, "no script in, no call made");
}
{
  asked().length = 0;
  reply("document.querySelectorAll('.hx-hero').forEach(function(el){el.classList.add('on')});");
  const got = await pageScriptFor(["x"], { native: ["tabs"], classes: ["hx-hero"] });
  check(got.js.includes("__pfdPage"), "a clean answer ships, wrapped once per page");
  check(got.js.includes("try{"), "and guarded");
  check(!got.js.includes("<"), "with no `<`");
  check(asked()[0]?.user.includes("· tabs") === true, "the call names what is already native");
  check(asked()[0]?.user.includes(".hx-hero") === true, "and the classes it may select");
}
{
  /* The one every model breaks by habit: a loop. One `<` and PageFly refuses
     the whole customJS — the reveal observer and every block's script with it. */
  asked().length = 0;
  let turn = 0;
  (globalThis as { __PFD_REPLY?: unknown }).__PFD_REPLY = () =>
    turn++ === 0
      ? "for (var i = 0; i < n; i++) { go(i) }"
      : "for (var i = 0; i !== n; i++) { go(i) }";
  const got = await pageScriptFor(["x"], { native: [], classes: [] });
  check(asked().length === 2, "an answer with `<` is asked again", `${asked().length} calls`);
  check(got.js.includes("i !== n"), "and the rewrite ships");
  check(!got.js.includes("<"), "with no `<`");
}
{
  reply("for (var i = 0; i < n; i++) {}");
  const got = await pageScriptFor(["x"], { native: [], classes: [] });
  check(got.js === "", "an answer that still has `<` ships nothing", got.reason ?? "");
}
{
  reply("fetch('https://example.com/track?id=' + shop)");
  const got = await pageScriptFor(["x"], { native: [], classes: [] });
  check(got.js === "", "a script that reaches the network is refused", got.reason ?? "");
}
{
  reply("document.querySelector('.panel').style.display = 'none'");
  const got = await pageScriptFor(["x"], { native: [], classes: [] });
  check(got.js === "", "a script that hides part of the page is refused", got.reason ?? "");
}
{
  reply("```js\ndocument.body.classList.add('ready')\n```");
  const got = await pageScriptFor(["x"], { native: [], classes: [] });
  check(got.js.includes("classList.add('ready')"), "a fenced answer is unfenced");
}

/* ── the whole path, on the stub ───────────────────────────────────────── */

head("end to end, with no bill");

{
  (globalThis as { __PFD_REPLY?: unknown }).__PFD_REPLY = (args: { system: string }) =>
    /TRANSCRIBE/.test(args.system)
      ? JSON.stringify({
          section: {
            type: "section",
            role: "hero",
            hook: { class: "hero", id: "top" },
            children: [{ type: "heading", level: 1, text: "Hi", hook: { class: "hx-title" } }],
          },
        })
      : "document.querySelectorAll('.hero').forEach(function(el){el.classList.add('seen')});";

  const built = await pageflyFromHtmlLive(mockup, "probe", {
    bg: "#0A0A0A",
    ink: "#F6F6F4",
    fontBody: "Inter",
  });
  const files = unzipSync(new Uint8Array(await built.blob.arrayBuffer()));
  const page = JSON.parse(strFromU8(files[Object.keys(files)[0]])) as {
    customJS?: string;
    items: { data?: Record<string, unknown> }[];
  };
  const js = page.customJS ?? "";
  const classes = page.items
    .map((i) => (typeof i.data?.classGlobalStyling === "string" ? i.data.classGlobalStyling : ""))
    .join(" ");

  check(built.built === built.sections, "every band transcribed", `${built.built}/${built.sections}`);
  check(/\bhero\b/.test(classes) && /\bhx-title\b/.test(classes), "the mockup's classes shipped");
  check(js.includes('"id","top"'), "the id boot table shipped");
  check(js.includes("classList.add('seen')"), "the page's own script shipped");
  check(js.indexOf('"id","top"') < js.indexOf("classList.add('seen')"), "the table runs first");
  check(!js.includes("<"), "and the whole customJS holds no `<`");
  /* It has to be runnable, not merely `<`-free: a wrapper that does not close
     is a syntax error that takes the page's whole script down and shows up
     nowhere until a shopper opens the page. */
  let parses = true;
  try {
    new Function(js);
  } catch {
    parses = false;
  }
  check(parses, "and it parses as JavaScript");
}

/* ── and it does what it says, not merely parse ────────────────────────── */

head("the shipped script actually applies the ids");
{
  /* A DOM SMALL ENOUGH TO READ, not a browser. `new Function(js)` above proves
     the file is syntactically whole; this proves the boot table does the one
     thing it exists to do — because an id written into a table nobody applies
     looks exactly like an id that works, right up until a merchant's shopper
     clicks something. Class selectors and `setAttribute` are all the table
     uses, so they are all this has to answer. */
  type El = {
    cls: string[];
    attrs: Record<string, string>;
    classList: { add: (c: string) => void; contains: (c: string) => boolean };
    hasAttribute: (k: string) => boolean;
    setAttribute: (k: string, v: string) => void;
    getAttribute: (k: string) => string | null;
  };
  const make = (cls: string[]): El => {
    const el: El = {
      cls,
      attrs: {},
      classList: { add: (c) => void el.cls.push(c), contains: (c) => el.cls.includes(c) },
      hasAttribute: (k) => k in el.attrs,
      setAttribute: (k, v) => void (el.attrs[k] = v),
      getAttribute: (k) => el.attrs[k] ?? null,
    };
    return el;
  };

  const band = make(["pf-design-export", "hero", "pfd-h-1"]);
  const doc = {
    querySelectorAll: (sel: string) =>
      [band].filter((el) => el.cls.includes(sel.replace(/^\./, ""))),
    getElementById: (id: string) => [band].find((el) => el.attrs.id === id) ?? null,
    documentElement: { classList: { add: () => {} } },
  };

  (globalThis as { __PFD_REPLY?: unknown }).__PFD_REPLY = (args: { system: string }) =>
    /TRANSCRIBE/.test(args.system)
      ? JSON.stringify({
          section: {
            type: "section",
            role: "hero",
            hook: { class: "hero", id: "top", data: { panel: "care" } },
            children: [{ type: "heading", level: 1, text: "Hi" }],
          },
        })
      : "Array.prototype.forEach.call(document.querySelectorAll('.hero'),function(e){e.classList.add('seen')});";

  const built = await pageflyFromHtmlLive(mockup, "probe", {
    bg: "#fff",
    ink: "#111",
    fontBody: "Inter",
  });
  const files = unzipSync(new Uint8Array(await built.blob.arrayBuffer()));
  const page = JSON.parse(strFromU8(files[Object.keys(files)[0]])) as { customJS?: string };

  const run = new Function("window", "document", page.customJS ?? "");
  run({ IntersectionObserver: undefined, ResizeObserver: undefined, MutationObserver: undefined, setTimeout, setInterval, requestAnimationFrame: undefined }, doc);

  check(band.getAttribute("id") === "top", "the id is on the element after boot", String(band.getAttribute("id")));
  check(band.getAttribute("data-panel") === "care", "and the data attribute is too");
  check(band.classList.contains("seen"), "and the page's own script ran against the class it kept");
}

/* THE RETRY, ON THE PATH THAT ACTUALLY RUNS IT.

   `missingFeatures` is checked above in isolation, and that check passes with
   the wiring in `pageflyFromHtmlLive` deleted — which is the same vacuous guard
   this repository has already shipped once. So the band is asked for here, by
   the exporter, with a stub that gets it wrong the first time. */
head("the band really is asked again");
{
  const tabbed = `<!doctype html><html><head></head><body><main>
<section class="faq"><div role="tablist"><button role="tab">Care</button>
<button role="tab">Sizing</button></div><div class="panel">Wash cold</div></section>
</main></body></html>`;

  const boxes = JSON.stringify({
    section: { type: "section", role: "faq", children: [{ type: "text", text: "Care" }] },
  });
  const tabs = JSON.stringify({
    section: {
      type: "section",
      role: "faq",
      children: [
        {
          type: "tabs",
          open: 0,
          items: [
            { label: "Care", children: [{ type: "text", text: "Wash cold" }] },
            { label: "Sizing", children: [{ type: "text", text: "Runs small" }] },
          ],
        },
      ],
    },
  });

  let turn = 0;
  (globalThis as { __PFD_REPLY?: unknown }).__PFD_REPLY = (args: { system: string }) =>
    /TRANSCRIBE/.test(args.system) ? (turn++ === 0 ? boxes : tabs) : "";

  asked().length = 0;
  const built = await pageflyFromHtmlLive(tabbed, "probe", {
    bg: "#fff",
    ink: "#111",
    fontBody: "Inter",
  });
  const transcriptions = asked().filter((a) => /TRANSCRIBE/.test(a.system));
  check(transcriptions.length === 2, "one band, two calls", `${transcriptions.length}`);
  check(
    transcriptions[1]?.user.includes("YOU MISSED SOMETHING"),
    "and the second one says what was missed",
  );

  const files = unzipSync(new Uint8Array(await built.blob.arrayBuffer()));
  const page = JSON.parse(strFromU8(files[Object.keys(files)[0]])) as { items: { type: string }[] };
  check(
    page.items.some((i) => /Tabs/i.test(i.type)),
    "and the page shipped with PageFly's own tab element",
    page.items.map((i) => i.type).join(","),
  );

  /* A retry that misses AGAIN keeps the first answer rather than paying for a
     third, and rather than taking a second transcription that is different
     everywhere and better nowhere. */
  turn = 0;
  (globalThis as { __PFD_REPLY?: unknown }).__PFD_REPLY = (args: { system: string }) =>
    /TRANSCRIBE/.test(args.system) ? boxes : "";
  asked().length = 0;
  await pageflyFromHtmlLive(tabbed, "probe", { bg: "#fff", ink: "#111", fontBody: "Inter" });
  check(
    asked().filter((a) => /TRANSCRIBE/.test(a.system)).length === 2,
    "a band that misses twice is not asked a third time",
  );
}

console.log(failures === 0 ? "\nall good" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
}

void main();
