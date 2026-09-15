/* ==========================================================================
   Reading a .pagefly back, against a real one.

       npx tsx scripts/test-pagefly-read.ts

   The collections are hand-made in PageFly's own editor, not produced by
   `lib/pagefly/builder.ts` — so they use elements and fields this codebase has
   never emitted, and a renderer written against the builder's output would be
   written against the wrong thing. This runs on the actual file in
   `public/collections`, which is the only honest way to test it.

   Two kinds of assertion here. The structural ones say the file was understood
   — the tree has one root, the copy is where fields.md says it is. The drawing
   ones say the output is a document a browser can be trusted with: escaped
   where it must be, scoped where `customCSS` expects to find itself.
   ========================================================================== */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

let failures = 0;
function check(ok: boolean, label: string, detail: string | null = null): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const DIR = join(process.cwd(), "public/collections/glowry");
/* The manifest's order, which is the order a merchant meets them in. */
const FILES = [
  "home",
  "collection-page",
  "product-page",
  "black-friday",
  "about-us",
  "blog-article",
  "contact",
].map((n) => join(DIR, `${n}.pagefly`));

async function main(): Promise<void> {
  const { readPageflyPage, readPageflySet, combinePagefly, pageToHtml, labelFromEntry } =
    await import("@/lib/collections/pagefly");

  console.log("\nentry names become page labels");

  check(
    labelFromEntry("7 - 1 _ GLOWRY Home _ 2026_09_10 1.json") === "GLOWRY Home",
    "the export's numbering and its date are not the title",
    labelFromEntry("7 - 1 _ GLOWRY Home _ 2026_09_10 1.json"),
  );
  check(
    labelFromEntry("3 - 1 _ GLOWRY About Us _ 2026_09_.json") === "GLOWRY About Us",
    "and neither is a truncated one",
    labelFromEntry("3 - 1 _ GLOWRY About Us _ 2026_09_.json"),
  );

  const missing = FILES.filter((f) => !existsSync(f));
  if (missing.length) {
    console.log(`\n  ! missing: ${missing.join(", ")}\n`);
    process.exit(1);
  }

  const raw = FILES.map((f) => new Uint8Array(readFileSync(f)));
  const set = raw.map(readPageflyPage);

  console.log("\nthe set");

  check(set.length === 7, "seven pages", String(set.length));
  check(
    set[0].label.includes("Home") && set[6].label.includes("Contact"),
    "in the manifest's order, not a zip's key order",
    `${set[0].label} … ${set[6].label}`,
  );

  const home = set.find((p) => p.label.includes("Home"))!;
  check(home.items.length > 100, "the home page has its elements", String(home.items.length));
  check(home.customCSS.length > 10_000, "and its stylesheet", `${home.customCSS.length}b`);

  console.log("\nthe tree");

  const kids = new Set(home.items.flatMap((i) => i.children ?? []));
  const roots = home.items.filter((i) => !kids.has(i.id));
  check(roots.length === 1, "exactly one root", String(roots.length));
  check(roots[0].type === "Body", "and it is the Body", roots[0].type);

  console.log("\nthe copy is where fields.md says it is");

  const heading = home.items.find((i) => i.type === "Heading2");
  check(typeof heading?.data?.value === "string", "Heading2 carries `value`");
  /* A floor rather than a figure. It was 300 and the set lost its header,
     footer and announcement bar in an edit, which took the count to 296 — a
     test that fails when the design changes is testing the design. What it is
     here to catch is `styles` coming back empty, which is what a change to the
     format would look like. */
  check(
    Object.keys(home.styles).length > 100,
    "and the styles parsed",
    String(Object.keys(home.styles).length),
  );

  console.log("\ndrawing it");

  const html = pageToHtml(home);

  check(html.startsWith("<!doctype html>"), "a whole document, for an iframe");
  /* Every rule in customCSS begins `#__pf`. Without the wrapper the whole
     stylesheet applies to nothing and the page draws as unstyled boxes — which
     still LOOKS like a render, which is why this is asserted. */
  check(html.includes('<div id="__pf">'), "wrapped in the id customCSS is written against");
  check(html.includes(home.customCSS), "with the page's own stylesheet inlined");

  check(/<h1[^>]*>/.test(html), "a heading is an h1, not a div", "customCSS styles #__pf h1");
  check(/<p [^>]*>/.test(html), "and a paragraph is a p");
  check(html.includes("<img src=\"data:image"), "images are the file's own data URIs");

  /* The look lives in these class names — the per-item styles are only layout
     primitives. A render that drops them is a skeleton. */
  check(html.includes("gl-"), "the customCSS class names reach the markup");

  console.log("\nand not trusting the file more than it deserves");

  const nasty = {
    label: "x",
    customCSS: "",
    styles: {},
    items: [
      {
        id: "a",
        type: "Heading2",
        children: [],
        data: {
          value: 'Glass skin, <em>American</em> <script>alert(1)</script> <img src=x onerror=y>',
          tag: "h1",
        },
      },
    ],
  };
  const out = pageToHtml(nasty as never);
  check(out.includes("<em>American</em>"), "the inline formatting a merchant typed survives");
  check(!out.includes("<script>"), "a script tag does not");
  check(!/onerror=/.test(out.replace(/&lt;[^&]*&gt;/g, "")), "and neither does an event handler");

  const evil = {
    label: "x",
    customCSS: "",
    styles: {},
    items: [
      { id: "a", type: "Image5", children: [], data: { src: 'x" onerror="alert(1)', alt: '"' } },
    ],
  };
  check(
    !pageToHtml(evil as never).includes('onerror="alert(1)"'),
    "an attribute cannot be broken out of",
  );

  /* A file whose children point in a circle must not take the tab with it. */
  const loop = {
    label: "x",
    customCSS: "",
    styles: {},
    items: [
      { id: "a", type: "FlexBlock", children: ["b"], data: {} },
      { id: "b", type: "FlexBlock", children: ["a"], data: {} },
    ],
  };
  let survived = true;
  try {
    pageToHtml(loop as never);
  } catch {
    survived = false;
  }
  check(survived, "a tree that points at itself is cut off rather than hanging");

  console.log("\nevery page in the set draws");

  for (const page of set) {
    const drawn = pageToHtml(page);
    check(
      drawn.includes('<div id="__pf">') && drawn.length > 5000,
      page.label,
      `${Math.round(drawn.length / 1024)}kb`,
    );
  }

  console.log("\nlabels, shortened for a list already headed by the set name");

  const { shortenLabels } = await import("@/lib/collections");
  const short = shortenLabels(set.map((p) => p.label));
  check(
    short.includes("Home") && short.includes("Product Page"),
    "the set's own name is dropped from every row",
    short.join(", "),
  );
  check(
    shortenLabels(["GLOWRY Home", "ACME Product"]).join("|") === "GLOWRY Home|ACME Product",
    "a prefix only some rows share is a coincidence, not a label",
  );
  check(
    shortenLabels(["GLOWRY", "GLOWRY Home"]).join("|") === "GLOWRY|GLOWRY Home",
    "and a page whose whole name is the prefix does not come out blank",
  );

  console.log("\nseven files, put back into one for Export all");

  /* PageFly's multi-page export is a zip of numbered entries. A set exported
     page by page is seven zips of one entry each; this is the shape that makes
     `Export all` a single import rather than seven. */
  const combined = combinePagefly(raw);
  const back = readPageflySet(combined);
  check(back.length === 7, "seven entries come back out", String(back.length));
  check(
    back.map((p) => p.label).join("|") === set.map((p) => p.label).join("|"),
    "in the same order they went in",
    back.map((p) => p.label).join(", "),
  );
  check(
    JSON.stringify(back[0].items) === JSON.stringify(set[0].items),
    "and the page itself is untouched — only the entry's number changed",
  );

  console.log(failures === 0 ? "\nall good\n" : `\n${failures} failure(s)\n`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();

export {};
