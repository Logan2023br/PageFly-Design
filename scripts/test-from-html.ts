/* ==========================================================================
   The three repairs the HTML → .pagefly path needed, each with a test.

       npx tsx scripts/test-from-html.ts

   All three were reported the same way — the merchant imported the file and
   looked at it — and all three are invisible in the JSON: the export was
   well-formed, imported without an error, and was wrong on the screen.

     CHROME    the mockup's own header and footer were transcribed into the
               page, and a PageFly page renders inside a theme that has already
               drawn both. Two logos, two menus, two carts.
     VAR       `font-family: var(--serif)` was copied across faithfully and
               `--serif` is not defined in a storefront, so the page rendered in
               the theme's font while every value in it was literally correct.
     ASSETS    `image.query` is a stock-search phrase on the live path, resolved
               before the export by a stage transcription does not have. The
               URL was already in the markup and went nowhere.
   ========================================================================== */

import { createRequire } from "node:module";
import Module from "node:module";

const require_ = createRequire(import.meta.url);
const resolve_ = (Module as unknown as { _resolveFilename: (r: string, ...a: unknown[]) => string })
  ._resolveFilename;
(Module as unknown as { _resolveFilename: unknown })._resolveFilename = function (
  this: unknown,
  request: string,
  ...args: unknown[]
) {
  if (request === "server-only") return require_.resolve("./server-only.cjs");
  return resolve_.call(this, request, ...args);
} as never;

const { splitSections } = require_("../lib/pagefly/fromHtmlSkill") as typeof import("../lib/pagefly/fromHtmlSkill");
const { customProps, resolveVars, assetsOf } = require_(
  "../lib/pagefly/htmlToTree",
) as typeof import("../lib/pagefly/htmlToTree");

let failures = 0;
function check(ok: boolean, label: string, detail = ""): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

/* ── chrome ────────────────────────────────────────────────────────────── */

const withMain = `<!doctype html><html><head><style>:root{--serif:Gelasio, Georgia, serif}</style></head><body>
<header class="site"><a class="logo">AURENNE</a><nav><a>Shop</a></nav></header>
<main id="top">
  <section class="s1"><h1>The Cordelia Coat</h1></section>
  <section class="s2"><p>780 gsm</p></section>
  <section class="s3"><p>Reviews</p></section>
</main>
<footer class="site"><p>© Aurenne</p></footer>
</body></html>`;

const bands = splitSections(withMain);
console.log("the header and the footer");
check(bands.length === 3, "one band per section", `${bands.length}`);
check(!bands.some((b) => /<header\b/i.test(b)), "no header band");
check(!bands.some((b) => /<footer\b/i.test(b)), "no footer band");
check(!bands.some((b) => /AURENNE/.test(b)), "the masthead is not in the page");

/* A document with no `<main>` is the older mockup, and the rule has to hold
   for it too — the fix has to reach files already written. */
const noMain = withMain.replace(/<\/?main[^>]*>/gi, "");
const flat = splitSections(noMain);
check(flat.length === 3, "no <main>: still one band per section", `${flat.length}`);
check(!flat.some((b) => /AURENNE|© Aurenne/.test(b)), "no <main>: chrome still dropped");

/* And a document with neither, which falls back to the body: the fallback has
   to cut the chrome out rather than hand the whole thing over. */
const divs = `<body><header><a>AURENNE</a></header><div class="wrap"><p>body copy</p></div><footer>©</footer></body>`;
const fell = splitSections(divs);
check(!fell.some((b) => /AURENNE/.test(b)), "fallback: chrome cut from the body");

/* ── custom properties ─────────────────────────────────────────────────── */

console.log("\nthe variables a mockup declares once");
const props = customProps(
  `<style>:root{--serif:Gelasio, Georgia, serif;--ink:#12100C;--rule:rgba(18,16,12,.14);--band:var(--ink)}
   @media(max-width:700px){:root{--serif:Georgia}}</style>`,
);
check(props["--serif"] === "Gelasio, Georgia, serif", "the base value wins over the media override", props["--serif"]);
check(props["--ink"] === "#12100C", "a colour");

const resolved = resolveVars(
  {
    type: "heading",
    css: { fontFamily: "var(--serif)", color: "var(--ink)", borderTop: "1px solid var(--rule)" },
    mobile: { color: "var(--nope, #333)" },
    kept: "var(--unknown)",
  },
  props,
) as { css: Record<string, string>; mobile: Record<string, string>; kept: string };

check(resolved.css.fontFamily === "Gelasio, Georgia, serif", "font-family resolves", resolved.css.fontFamily);
check(resolved.css.color === "#12100C", "colour resolves");
check(resolved.css.borderTop === "1px solid rgba(18,16,12,.14)", "resolves inside a shorthand", resolved.css.borderTop);
check(resolved.mobile.color === "#333", "an undeclared variable takes its own fallback", resolved.mobile.color);
check(resolved.kept === "var(--unknown)", "and is left alone when it has none");

const chained = resolveVars({ css: { background: "var(--band)" } }, props) as {
  css: Record<string, string>;
};
check(chained.css.background === "#12100C", "a variable pointing at a variable", chained.css.background);

/* ── the photographs ───────────────────────────────────────────────────── */

console.log("\nthe photographs the markup already chose");
const assets = { images: {} as Record<string, string>, videos: {} as Record<string, string> };
assetsOf(
  [
    { type: "image", query: "https://images.unsplash.com/photo-1539109136881?w=1400&q=80" },
    {
      type: "beforeAfter",
      beforeQuery: "https://images.unsplash.com/photo-1520975954732?w=1400",
      afterQuery: "//cdn.example.com/open.jpg",
    },
    { type: "section", bg: { kind: "video", query: "https://videos.pexels.com/3184291-uhd.mp4" } },
    { type: "image", query: "a phrase, not a url" },
  ],
  assets,
);

check(Object.keys(assets.images).length === 3, "every image URL is carried", `${Object.keys(assets.images).length}`);
check(
  assets.images["https://images.unsplash.com/photo-1539109136881?w=1400&q=80"] ===
    "https://images.unsplash.com/photo-1539109136881?w=1400&q=80",
  "a URL resolves to itself",
);
check(assets.images["//cdn.example.com/open.jpg"] !== undefined, "protocol-relative counts");
check(Object.keys(assets.videos).length === 1, "the video goes to the video map");
check(assets.images["https://videos.pexels.com/3184291-uhd.mp4"] === undefined, "and never to the image map");
check(assets.images["a phrase, not a url"] === undefined, "a phrase is not an asset");

/* And the whole wiring, without spending a model call on it: a tree whose
   queries are URLs, through the map `assetsOf` builds, into a real file. This
   is the check that would have caught the bug — every unit above passed while
   the export shipped placeholder rectangles, because nothing joined them. */

console.log("\nand the same URLs, through the exporter into a file");

const { pageflyFromTree } = require_("../lib/design/toPagefly") as typeof import("../lib/design/toPagefly");
const { unzipSync, strFromU8 } = require_("fflate") as typeof import("fflate");

const PHOTO = "https://images.unsplash.com/photo-1539109136881?w=1400";
const BEFORE = "https://images.unsplash.com/photo-1520975954732?w=1400";
const AFTER = "https://images.unsplash.com/photo-1487412720507?w=1400";

const tree = {
  motionPlan: "",
  sections: [
    {
      kind: "editorial",
      band: false,
      children: [
        { type: "image", query: PHOTO, ratio: 1.2, css: {}, mobile: {} },
        {
          type: "beforeAfter",
          beforeQuery: BEFORE,
          afterQuery: AFTER,
          beforeLabel: "Belted",
          afterLabel: "Worn open",
          css: {},
          mobile: {},
        },
      ],
    },
  ],
} as unknown as Parameters<typeof pageflyFromTree>[0];

const wired = { images: {} as Record<string, string>, videos: {} as Record<string, string> };
assetsOf(tree.sections, wired);

const file = pageflyFromTree(
  tree,
  { name: "assets", bg: "#FBFAF7", ink: "#12100C", fontBody: "Inter" },
  1440,
  { images: wired.images, videos: wired.videos },
);

file.blob.arrayBuffer().then((buf) => {
  const json = strFromU8(Object.values(unzipSync(new Uint8Array(buf)))[0]);

  check(json.includes(PHOTO), "the image's photograph reaches the file");
  check(json.includes(BEFORE) && json.includes(AFTER), "both halves of the comparison do");

  console.log(failures === 0 ? "\nall good" : `\n${failures} failed`);
  process.exit(failures === 0 ? 0 : 1);
});
