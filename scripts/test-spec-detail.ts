/* ==========================================================================
   The design stage can now say more. This checks that it survives the trip.

       npx tsx scripts/test-spec-detail.ts

   THREE FIELDS AND ONE SILENCE. `mobile` on a node and `band` on a section are
   new vocabulary; `anim` is old vocabulary that nothing ever compared. They are
   tested together because they fail the same way — a value the design model
   wrote, accepted without complaint, and absent from the page — and that
   failure is invisible by construction: the page still builds, the schema still
   validates, and the audit still reports zero elements missing.

   A measured page is the reason for each one. The build that prompted this
   carried four of its design's forty-six motion instructions, and had forty-one
   mobile overrides the design stage never saw, because it had no way to write
   one. Both were found by counting, not by looking.
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
function check(ok: boolean, label: string, detail: string | null = null): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function main(): Promise<void> {
  const { vetSpec, vetBand, specProblems } = await import("../lib/design/specCheck.js");
  const { audit } = await import("../lib/design/audit.js");
  const { designTreeSchema } = await import("../lib/design/schema.js");
  const { __orderLinesForTest } = await import("../lib/ai/designServer.js");

  console.log("\na node keeps what the phone needs");

  const spec = vetSpec({
    nodes: [
      {
        el: "row",
        gap: 72,
        css: { maxWidth: "1240px" },
        mobile: { flexDirection: "column", gap: 32 },
        children: [
          {
            el: "heading",
            scale: "oversized",
            css: { fontSize: "64px" },
            mobile: { fontSize: "38px" },
            anim: { reveal: "fade-up", delay: 1 },
          },
          { el: "button", css: { padding: "16px 26px" }, anim: { hover: "float-shadow" } },
        ],
      },
    ],
  });
  const row = spec?.nodes[0] as any;
  check(row?.mobile?.flexDirection === "column", "a row's mobile direction survives vetting");
  check(row?.children?.[0]?.mobile?.fontSize === "38px", "and a heading's mobile type size");
  check(row?.css?.maxWidth === "1240px", "without disturbing the desktop block");

  /* The ban list is about what the PAGE can carry, and a phone is the same
     page. A property refused at 1440px refused at 390px too, or the spec would
     promise something the export drops. */
  const banned = vetSpec({ nodes: [{ el: "text", mobile: { position: "absolute", fontSize: "12px" } }] });
  const t = banned?.nodes[0] as any;
  check(t?.mobile?.position === undefined, "a banned property is refused in mobile as well as css");
  check(t?.mobile?.fontSize === "12px", "and the rest of the block is kept");

  console.log("\na band can describe its own surface");

  const band = vetBand({
    css: { backgroundImage: "linear-gradient(180deg,#FFF,#FBF3F5)", padding: "72px 24px 96px" },
    mobile: { padding: "48px 20px 56px" },
    bg: { kind: "video", query: "slow linen curtain morning light", scrim: "strong" },
  });
  check(String(band?.css?.backgroundImage ?? "").startsWith("linear-gradient"), "a gradient ground");
  check(band?.mobile?.padding === "48px 20px 56px", "a padding that closes up on a phone");
  check(band?.bg?.kind === "video", "and a moving background, which the old boolean could not say");
  check(band?.bg?.scrim === "strong", "with the scrim it asked for");

  /* A background with no subject is a scrim over a flat colour — the exact
     shape `bg:WRITE ONE` exists to stop. */
  check(vetBand({ bg: { kind: "photo", scrim: "soft" } }) === undefined, "a background naming nothing is not a background");
  check(vetBand({ bg: { query: "x" } })?.bg?.kind === "photo", "and kind defaults to a photograph");
  check(vetBand({}) === undefined, "an empty band block is undefined, not an empty object");

  console.log("\nand the build model is told about both");

  const order = {
    vertical: "free",
    archetype: "A",
    motionIds: [],
    patternIds: ["gl-hero"],
    sections: [
      {
        role: "hero",
        pattern: "gl-hero",
        signature: true,
        dark: false,
        padding: "statement",
        motion: null,
        mayHaveBg: true,
        brief: "the opening",
        spec,
        band,
      },
    ],
  } as any;

  const lines = __orderLinesForTest(order, "#FFFFFF", "#111114").join("\n");
  check(lines.includes("mobile {flexDirection:column"), "the row's phone block reaches the skeleton");
  check(lines.includes("mobile {fontSize:38px}"), "and the heading's");
  check(lines.includes("band {backgroundImage:linear-gradient"), "the band's own ground");
  check(lines.includes("band mobile {padding:48px 20px 56px}"), "and its phone padding");
  check(
    lines.includes(`bg:video "slow linen curtain morning light" scrim:strong`),
    "the background says what of, and that it moves",
  );
  /* The preamble still explains `bg:WRITE ONE`, because bands that write no
     `band.bg` still get it. What must not happen is BOTH on one band line —
     a permission slip beside an instruction that already grants it. */
  const bandLine = lines.split("\n").find((l) => l.includes("gl-hero") && l.includes("bg:")) ?? "";
  check(
    bandLine.includes("bg:video") && !bandLine.includes("WRITE ONE"),
    "and the band line carries the instruction instead of the permission slip",
    bandLine.slice(0, 110),
  );

  console.log("\nwhat happens when the build drops it anyway");

  /* Everything the spec asked for, built as the spec asked — except that every
     `anim` and every `mobile` has been left off. This is the page that used to
     audit clean. */
  const stripped = designTreeSchema.parse({
    sections: [
      {
        type: "section",
        pattern: "gl-hero",
        children: [
          {
            type: "row",
            css: { maxWidth: "1240px" },
            children: [
              { type: "heading", text: "Glass skin", css: { fontSize: "64px" } },
              { type: "button", text: "Shop now", css: { padding: "16px 26px" } },
            ],
          },
        ],
      },
    ],
  });

  const said = specProblems(stripped.sections[0] as any, spec!, false);
  const motion = said.filter((p) => p.includes("motion instruction"));
  const values = said.filter((p) => p.includes("drops") && p.includes("value"));
  check(motion.length === 1, "the dropped motion is reported", String(motion.length));
  check(
    Boolean(motion[0]?.includes("reveal:fade-up") && motion[0]?.includes("hover:float-shadow")),
    "naming both kinds",
    motion[0]?.slice(0, 96),
  );
  check(
    Boolean(values[0]?.includes("mobile fontSize:38px")),
    "and the dropped phone values are named as phone values",
    values[0]?.slice(0, 110),
  );

  /* The same section with the motion and the phone blocks present must say
     nothing, or the repair call would chase a problem that is not there. */
  const whole = designTreeSchema.parse({
    sections: [
      {
        type: "section",
        pattern: "gl-hero",
        children: [
          {
            type: "row",
            css: { maxWidth: "1240px" },
            mobile: { flexDirection: "column", gap: 32 },
            children: [
              {
                type: "heading",
                text: "Glass skin",
                css: { fontSize: "64px" },
                mobile: { fontSize: "38px" },
                anim: { reveal: "fade-up", delay: 1 },
              },
              {
                type: "button",
                text: "Shop now",
                css: { padding: "16px 26px" },
                anim: { hover: "float-shadow" },
              },
            ],
          },
        ],
      },
    ],
  });
  check(specProblems(whole.sections[0] as any, spec!, false).length === 0, "a faithful build is left alone");

  console.log("\nand the rule that used to delete buy boxes");

  /* A commerce band under a name the design model invented. The old rule read
     the name, failed to match "product-detail", and demanded a product GRID. */
  const freeOrder = {
    vertical: "free",
    archetype: "A",
    motionIds: [],
    patternIds: ["supreme-buy-box"],
    sections: [{ role: "commerce", pattern: "supreme-buy-box" }],
  } as any;
  const buyBox = designTreeSchema.parse({
    sections: [
      {
        type: "section",
        pattern: "supreme-buy-box",
        children: [{ type: "product", gallery: true, children: [{ type: "text", text: "Free shipping" }] }],
      },
    ],
  });
  const onFree = audit(buyBox, freeOrder, "#FFFFFF", "product");
  check(
    onFree.filter((p) => p.includes(`no "productList"`)).length === 0,
    "a free-form band name is no longer read as a product grid",
    onFree.filter((p) => p.includes("productList")).join(" | ") || "nothing said",
  );

  /* The catalogue path still works: a planned product-detail band with no buy
     box in it is still the failure it always was. */
  const planned = {
    vertical: "beauty",
    archetype: "A",
    motionIds: [],
    patternIds: ["product-detail-gallery"],
    sections: [{ role: "commerce", pattern: "product-detail-gallery" }],
  } as any;
  const noBox = designTreeSchema.parse({
    sections: [{ type: "section", pattern: "product-detail-gallery", children: [{ type: "text", text: "A pillow" }] }],
  });
  check(
    audit(noBox, planned, "#FFFFFF", "product").some((p) => p.includes(`contains no "product" node`)),
    "and a catalogue band that lost its buy box is still caught",
  );

  console.log(failures === 0 ? "\nall good\n" : `\n${failures} failure(s)\n`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();

export {};
