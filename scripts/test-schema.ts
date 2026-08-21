/* ==========================================================================
   Can a bad leaf still cost a page?

       npx tsx scripts/test-schema.ts

   Three finished pages have now been thrown away over one malformed value —
   a long search phrase, a fractional `perView`, a form field called `textarea`.
   Each was fixed after it happened, which is a poor way to find the fourth.

   So this asks the question the other way round: here is every kind of wrong a
   model could plausibly write, all of it at once, in one page. If the page
   still comes out with its sections intact, the class of bug is closed rather
   than the three instances of it.

   The rule being tested is the one at the top of `schema.ts`: coerce, clamp,
   truncate, drop — and never reject. The single exception is a document with no
   usable sections, which SHOULD fail, and the last case checks that it still
   does. A schema that accepts everything including nothing is not lenient, it
   is broken, and the failure it hides would be the one worth seeing.
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
};

let failures = 0;
function check(ok: boolean, label: string, detail = ""): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function main(): Promise<void> {
  const { designTreeSchema, walk } = await import("../lib/design/schema");

  /* ---- one page carrying every mistake at once -------------------------- */

  const nasty = {
    motionPlan: 42,
    sections: [
      {
        type: "section",
        role: "hero",
        pattern: "hero-full-bleed-scrim",
        css: {
          padding: "140px 56px",
          position: "absolute" /* banned */,
          color: null /* not a value */,
          margin: { top: 4 } /* not a value either */,
          gap: 24,
        },
        children: [
          {
            type: "overlay",
            query: "x".repeat(900) /* far over the limit */,
            ratio: "0.62" /* a string */,
            scrim: "diagonal" /* not in the enum */,
            align: "middle" /* nor this */,
            children: [
              { type: "heading", level: 0.4, text: "Skin that behaves" },
              { type: "heading", level: 99, text: "y".repeat(500) /* over 300 */ },
              { type: "heading", text: "   " /* nothing to say */ },
              { type: "button", text: "Shop the range", anim: { hover: "wobble" } },
              { type: "video", src: "nope.mp4" /* invented node type */ },
            ],
          },
        ],
      },
      {
        type: "section",
        role: "proof",
        children: [
          {
            type: "slideshow",
            perView: 2.5 /* the one that cost 34,961 tokens */,
            autoplay: "true" /* a string */,
            slides: [
              { type: "counter", value: "92", suffix: "%", label: "saw less redness" },
              { type: "counter", value: "" /* nothing to count */ },
              { type: "image", query: "clinical lab glassware", ratio: 99 },
            ],
          },
        ],
      },
      {
        type: "section",
        role: "conversion",
        children: [
          {
            type: "form",
            intent: "subscribe" /* not in the enum */,
            fields: [
              { label: "Name", kind: "text" },
              { label: "Email", kind: "email", required: "yes" },
              { label: "Message", kind: "textarea" /* the one that cost 30,268 */ },
              { label: "", kind: "text" /* no label */ },
            ],
            submitText: "",
          },
          {
            type: "accordion",
            items: [{ q: "Is it for sensitive skin?", a: "Yes — tested at pH 5.5." }],
          },
        ],
      },
      "not even an object",
      { type: "section", role: "empty", children: [{ type: "unknown" }] },
    ],
  };

  console.log("a page carrying every mistake at once");
  const parsed = designTreeSchema.safeParse(nasty);
  check(parsed.success, "parses at all", parsed.success ? "" : JSON.stringify(parsed.error.issues[0]));
  if (!parsed.success) {
    process.exitCode = 1;
    return;
  }

  const tree = parsed.data;
  const nodes = walk(tree);
  const find = (t: string) => nodes.filter((n) => n.type === t);

  check(tree.sections.length === 4, "the string section dropped, the rest kept", `${tree.sections.length} sections`);

  const ov = find("overlay")[0] as { query: string; ratio: number; scrim: string; align: string } | undefined;
  check(ov?.query.length === 160, "over-long query trimmed", `${ov?.query.length} chars`);
  check(ov?.ratio === 0.62, "numeric string read as a number", String(ov?.ratio));
  check(ov?.scrim === "left", "unknown scrim fell back", ov?.scrim);
  check(ov?.align === "bottom-left", "unknown align fell back", ov?.align);

  const heads = find("heading") as { level: number; text: string }[];
  check(heads.length === 2, "the wordless heading dropped, the other two kept", `${heads.length}`);
  check(heads[0]?.level === 1, "level 0.4 clamped up to 1", String(heads[0]?.level));
  check(heads[1]?.level === 6, "level 99 clamped down to 6", String(heads[1]?.level));
  check((heads[1]?.text.length ?? 0) <= 300, "run-on heading truncated", `${heads[1]?.text.length}`);

  check(find("video").length === 0, "invented node type dropped");
  check(find("unknown").length === 0, "unknown node dropped");
  check(find("button").length === 1, "the button beside the invented node survived");

  const heroCss = tree.sections[0].css ?? {};
  check(!("position" in heroCss), "banned property stripped");
  check(!("color" in heroCss), "null value stripped");
  check(!("margin" in heroCss), "object value stripped");
  check(heroCss.padding === "140px 56px" && heroCss.gap === 24, "good declarations kept");

  const show = find("slideshow")[0] as { perView: number; autoplay: boolean; slides: unknown[] } | undefined;
  check(show?.perView === 3, "fractional perView rounded", String(show?.perView));
  check(show?.autoplay === true, '"true" read as true', String(show?.autoplay));
  check(show?.slides.length === 2, "valueless counter dropped, other two slides kept", `${show?.slides.length}`);

  const img = find("image")[0] as { ratio: number } | undefined;
  check(img?.ratio === 4, "out-of-range ratio clamped", String(img?.ratio));

  const f = find("form")[0] as
    | { intent: string; fields: { label: string; kind: string; required: boolean }[]; submitText: string }
    | undefined;
  check(f?.intent === "contact", "unknown intent fell back", f?.intent);
  check(f?.fields.length === 3, "unlabelled field dropped, the rest kept", `${f?.fields.length}`);
  check(f?.fields[2]?.kind === "message", '"textarea" understood as "message"', f?.fields[2]?.kind);
  check(f?.fields[1]?.required === true, '"yes" read as required', String(f?.fields[1]?.required));
  check(f?.submitText === "Send", "empty submit label took the fallback", f?.submitText);

  /* ---- a container that lost every child ------------------------------- */

  console.log("\na painted box whose only child was refused");

  /* The exact page that prompted this: a CTA band ending in a small orange
     rectangle with no words. The button had no label, `saying()` refused it,
     `list` dropped it — correctly — and its parent kept its background. */
  const hollow = designTreeSchema.safeParse({
    sections: [
      {
        type: "section",
        pattern: "cta-band-full",
        css: { padding: "140px 56px" },
        children: [
          { type: "heading", level: 2, text: "Ready when you are" },
          {
            type: "col",
            css: { background: "#FF6A1F", padding: "16px 32px" },
            children: [{ type: "button", text: "" }],
          },
        ],
      },
    ],
  });
  check(hollow.success, "the page still parses");
  if (hollow.success) {
    const kinds = hollow.data.sections[0].children.map((c) => c.type);
    check(
      !kinds.includes("col"),
      "the emptied container is gone, not left as paint around nothing",
      kinds.join(", "),
    );
    check(kinds.includes("heading"), "and the heading beside it survived");
  }

  /* A container the model wrote EMPTY is different — a rail, a spacer, a
     coloured band are all real, and the exporter has a path for them. The
     difference is whether children were asked for. */
  const rail = designTreeSchema.safeParse({
    sections: [
      {
        type: "section",
        children: [
          { type: "heading", level: 2, text: "The math" },
          { type: "col", css: { background: "#FF6A1F", height: "2px" }, children: [] },
        ],
      },
    ],
  });
  check(
    rail.success && rail.data.sections[0].children.some((c) => c.type === "col"),
    "a container written empty on purpose is kept",
  );

  /* ---- and the one thing that must still fail --------------------------- */

  console.log("\nwhat should still be refused");
  for (const [label, doc] of [
    ["no sections at all", { sections: [] }],
    ["sections is not a list", { sections: "a home page" }],
    ["not a page at all", { sorry: "I cannot help with that" }],
    ["every section unusable", { sections: [1, 2, "three"] }],
  ] as [string, unknown][]) {
    check(!designTreeSchema.safeParse(doc).success, label);
  }

  /* A page whose sections are all empty is still a page — thin, and the audit
     will say so, but not a failure. Failing it here would throw away the words
     the model did write. */
  const bare = designTreeSchema.safeParse({ sections: [{ type: "section", children: [] }] });
  check(bare.success, "a section with no children still parses");

  console.log();
  console.log(failures === 0 ? "PASS" : `FAIL — ${failures} problem${failures === 1 ? "" : "s"}`);
  if (failures) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
