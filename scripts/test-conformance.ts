/* ==========================================================================
   Does our file look like a file the editor made?

       npx tsx scripts/test-conformance.ts          # the rules that are fixed
       REPORT=1 npx tsx scripts/test-conformance.ts # every divergence, ranked

   `reference/all-elements.pagefly` is a product page built by hand in PageFly
   carrying 99 element types, and it imports clean. Every other check in this
   repository compares our output against a DESCRIPTION — `fields.md`, which
   lists what a field is. This one compares it against an ARTEFACT, which is the
   only thing that settles a question the description gets wrong.

   It got one wrong, and it is the reason this file exists. `fields.md` says of
   `Tabs3`: "single block — emit the type alone, no child nodes; the renderer
   owns the tab structure". The editor's own export has `Tabs3` holding a
   `TabsMenu3`, a `TabContentWrapper3`, a `DropdownButton` and two loose
   `TabHeader3`s, with rich content inside every panel. Three days were spent
   deciding whether to follow the note; the file answers it in a second.

   TWO MODES, AND THE SPLIT IS THE POINT. The checks below are the divergences
   somebody has decided about — each one is a rule, and breaking it fails. The
   report is everything else, ranked, for deciding the next one. A test that
   failed on all fifty divergences at once would be a test nobody could run.
   ========================================================================== */

import { readFileSync } from "node:fs";
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

let failures = 0;
function check(ok: boolean, label: string, detail = ""): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

/* A page that reaches for as much of the vocabulary as one tree can, so the
   comparison has something to compare. Not every element — a page carrying all
   ninety-nine would be a page nobody would build. */
const TREE = {
  sections: [
    {
      type: "section",
      pattern: "product-detail-gallery",
      role: "commerce",
      css: { padding: "80px 48px" },
      children: [
        {
          type: "product",
          gallery: true,
          qty: true,
          stock: true,
          express: true,
          extras: [
            { type: "text", text: "Free delivery over €75" },
            { type: "text", text: "30 day returns" },
          ],
        },
      ],
    },
    {
      type: "section",
      pattern: "spec-table",
      role: "content",
      css: { padding: "80px 48px" },
      /* MOTION IS IN THE FIXTURE ON PURPOSE. Classes reach an element by two
         separate paths — the builder's `cls` argument and `motionClasses` in
         `toPagefly`. The first was moved to `classGlobalStyling` and the second
         was not, so a heading with a reveal kept its animation on the dead key
         while the block around it had it on the live one, and a tree with no
         `anim` on it could not tell. */
      anim: { reveal: "fade-up" },
      children: [
        { type: "heading", level: 2, text: "Specification", anim: { reveal: "fade-up" } },
        { type: "table", rows: [["Size", "34", "36"], ["Chest", "82", "86"]] },
        {
          type: "tabs",
          open: 0,
          items: [
            { label: "Size chart", children: [{ type: "text", text: "Measured flat." }] },
            { label: "Fit", children: [{ type: "text", text: "True to size." }] },
          ],
        },
        {
          type: "accordion",
          items: [
            { q: "Delivery?", a: "Next day." },
            { q: "Returns?", a: "Thirty days." },
          ],
        },
        { type: "button", text: "Shop the look", href: "/collections/all" },
        { type: "divider" },
        {
          type: "form",
          intent: "signup",
          submit: "Join",
          fields: [{ label: "Email", kind: "email", required: true }],
        },
      ],
    },
  ],
};

async function main(): Promise<void> {
  const { shapesOf, diff } = await import("../lib/pagefly/conformance");
  const { pageflyFromTree } = await import("../lib/design/toPagefly");

  const theirs = shapesOf(new Uint8Array(readFileSync("reference/all-elements.pagefly")));
  console.log(
    `\nreference: ${theirs.items} items · ${Object.keys(theirs.shapes).length} types · PageFly ${theirs.version}`,
  );

  const { blob } = pageflyFromTree(
    TREE as never,
    { name: "conformance", bg: "#FFFFFF", ink: "#12100C", fontBody: "Inter" },
    1180,
    { images: {}, videos: {} },
  );
  const ours = shapesOf(new Uint8Array(await blob.arrayBuffer()));
  console.log(
    `ours     : ${ours.items} items · ${Object.keys(ours.shapes).length} types\n`,
  );

  const divergences = diff(ours, theirs);
  const of = (type: string) => divergences.find((d) => d.type === type);

  /* ======================================================================
     THE ONE THAT MATTERS MOST, and it was invisible until this file arrived.

     `className` is written on thirty-nine elements of a real export. PageFly
     writes it on NONE of four hundred and eighty — it uses `classGlobalStyling`,
     and its own custom CSS targets those classes (`#__pf .pu-eyebrow { … }`).
     Forty-two of its values carry several classes separated by spaces, so it is
     a drop-in for what `className` was trying to be.

     What rode on `className`: `pf-design-export`, which every page-level rule
     was scoped to; `pfd-reveal`, which every scroll animation needs; the
     marquee and sticky classes; and `pfd-count-N`, which the counter's own
     script looks itself up by. All of it landing on a key the editor does not
     read means all of it silently did nothing.
     ====================================================================== */
  console.log("the key that carries a class");

  const withClassName = Object.entries(ours.shapes).filter(([, s]) => s.keys.className);
  check(
    withClassName.length === 0,
    "nothing is emitted with `className` — the editor never reads it",
    withClassName.map(([t, s]) => `${t}×${s.keys.className}`).join(" ") || "(none)",
  );

  const withCgs = Object.entries(ours.shapes).filter(
    ([, s]) => s.keys.classGlobalStyling,
  );
  check(
    withCgs.length > 0,
    "and classes ride on `classGlobalStyling`, which it does",
    `${withCgs.length} type(s)`,
  );

  /* ======================================================================
     AND THE SCOPE THE PAGE CSS HANGS OFF.

     Every rule in `pageCss` was written `.pf-design-export …`, a class put on
     the content block through `className`. The editor wraps the whole page in
     `#__pf` and scopes its own CSS to that — ninety-two times in the reference —
     and `customJS` finds the page with `getElementById('__pf')`. A selector
     that is always there beats one we have to attach.
     ====================================================================== */
  console.log("\nand the scope the page CSS hangs off");

  const { blob: cssBlob } = pageflyFromTree(
    TREE as never,
    { name: "css", bg: "#FFFFFF", ink: "#12100C", fontBody: "Inter" },
    1180,
    { images: {}, videos: {} },
  );
  const { unzipSync, strFromU8 } = await import("fflate");
  const cssFiles = unzipSync(new Uint8Array(await cssBlob.arrayBuffer()));
  const cssPage = JSON.parse(strFromU8(cssFiles[Object.keys(cssFiles)[0]])) as {
    customCSS: string;
  };

  check(
    !cssPage.customCSS.includes(".pf-design-export"),
    "no rule hangs off a class we have to attach",
    (cssPage.customCSS.match(/[^\n]*\.pf-design-export[^\n]*/) ?? ["(none)"])[0].trim(),
  );

  /* ======================================================================
     ICONS THAT ARE ALWAYS THERE.

     Four elements can show an icon, and the editor gives every one of them an
     `Icon2` child whether the icon is shown or not — `showIcon: false` and the
     child is still there. `fields.md` calls it "config, shown by showIcon",
     which reads as optional and is not: the component renders its child, and a
     child that is absent is not a hidden icon, it is a missing node.
     ====================================================================== */
  console.log("\nthe icon child that is always there");

  for (const type of ["TabHeader3", "Button2", "Accordion3.Header", "Form2.Button2"]) {
    const d = of(type);
    if (!ours.shapes[type]) continue;
    check(
      !d?.missingChildren.includes("Icon2"),
      `${type} carries its Icon2`,
      d?.missingChildren.join(", ") || "ok",
    );
  }

  /* ====================================================================== */
  console.log("\nthe rest, for deciding what is next");

  const ranked = divergences
    .map((d) => ({
      ...d,
      weight: (ours.shapes[d.type]?.count ?? 0) *
        (d.missing.length + d.unknown.length + d.missingChildren.length * 3),
    }))
    .sort((a, b) => b.weight - a.weight);

  if (process.env.REPORT === "1") {
    for (const d of ranked) {
      console.log(`\n  ${d.type}  ×${ours.shapes[d.type]?.count ?? 0}`);
      if (d.missing.length) console.log(`     missing : ${d.missing.join(", ")}`);
      if (d.unknown.length) console.log(`     unknown : ${d.unknown.join(", ")}`);
      if (d.missingChildren.length)
        console.log(`     children: ${d.missingChildren.join(", ")}`);
    }
  } else {
    console.log(
      `  ${divergences.length} type(s) still diverge. Top: ` +
        ranked.slice(0, 6).map((d) => d.type).join(", "),
    );
    console.log("  REPORT=1 for the full list.");
  }

  console.log(failures === 0 ? "\nall good\n" : `\n${failures} failure(s)\n`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();

export {};
