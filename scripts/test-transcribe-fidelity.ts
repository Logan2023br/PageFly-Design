/* ==========================================================================
   WHAT A TRANSCRIBED PAGE IS NOW ALLOWED TO KEEP.

       npx tsx scripts/test-transcribe-fidelity.ts

   Four things reached the transcriber intact and had nowhere to land, so all
   four were lost in silence — the export was valid, imported, rendered, and was
   wrong. Measured on one real page: a newsletter input carrying PageFly's own
   "This is your placeholder text" where the mockup said `you@email.com`; nine
   of nine headings cut into two or three blocks to colour one word; three of
   six declared `@keyframes` playing nothing; and every class name the page's
   own script selects by, gone.

   THE FIXTURE IS DELIBERATELY NOT THE PAGE THAT FOUND THESE. Every name,
   colour and animation below is invented for this file: a `ripple` animation on
   a `.badge`, a `#0F7B6C` emphasis, a `.promo-strip` band. If any of this were
   fixed by naming what one real mockup happens to use, these cases would fail —
   which is the whole point of writing them in another vocabulary.

   No model is called and nothing is spent: every input here is a hand-written
   answer of the shape a transcriber returns.
   ========================================================================== */

import { createRequire } from "node:module";
import Module from "node:module";
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
  return resolve_.call(this, request, ...args);
} as never;

const { designTreeSchema } = require_("../lib/design/schema") as typeof import("../lib/design/schema");
const { pageflyFromTree } = require_("../lib/design/toPagefly") as typeof import("../lib/design/toPagefly");

let failures = 0;
function check(ok: boolean, label: string, detail = ""): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}
const head = (s: string) => console.log(`\n${s}`);

async function open(tree: unknown) {
  const { blob } = pageflyFromTree(
    designTreeSchema.parse(tree) as never,
    { name: "probe", bg: "#FFFFFF", ink: "#1A1A1A", fontBody: "Inter" },
    1200,
  );
  const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  const page = JSON.parse(strFromU8(files[Object.keys(files)[0]])) as {
    items: { id: string; type: string; data?: Record<string, unknown> }[];
    styles: { id: string; styles: string }[];
    customCSS?: string;
    customJS?: string;
  };
  const classes = page.items
    .map((i) => (typeof i.data?.classGlobalStyling === "string" ? i.data.classGlobalStyling : ""))
    .join(" ");
  return { ...page, classes };
}

const band = (children: unknown[], extra: Record<string, unknown> = {}) => ({
  motionPlan: "",
  sections: [{ type: "section", role: "promo", children, ...extra }],
});

async function main(): Promise<void> {
  /* ── one word set apart ───────────────────────────────────────────────── */
  head("a word set apart stays inside its line");
  {
    const parsed = designTreeSchema.parse(
      band([
        {
          type: "heading",
          level: 2,
          text: "Order by <em>Friday</em>",
          emphasisCss: { color: "#0F7B6C", letterSpacing: ".02em" },
        },
      ]),
    );
    const h = parsed.sections[0].children[0] as { text: string; emphasisCss?: unknown };
    check(h.text === "Order by <em>Friday</em>", "the tag survives the schema", h.text);
    check(h.emphasisCss !== undefined, "and so do its declarations");

    const page = await open(band([
      { type: "heading", level: 2, text: "Order by <em>Friday</em>",
        emphasisCss: { color: "#0F7B6C", letterSpacing: ".02em" } },
    ]));
    const headings = page.items.filter((i) => i.type === "Heading2");
    check(headings.length === 1, "ONE heading, not two", `${headings.length}`);
    check(
      String(headings[0]?.data?.value).includes("<em>Friday</em>"),
      "with the emphasis inline in its value",
      String(headings[0]?.data?.value),
    );
    check(
      /\.pfd-em-[a-z0-9]+ em[^{]*\{[^}]*color:\s*#0F7B6C/i.test(page.customCSS ?? ""),
      "and a rule scoped to this node alone",
    );
    check(
      !(page.customCSS ?? "").includes("\nem{") && !(page.customCSS ?? "").startsWith("em{"),
      "NOT a global `em` rule, which would restyle the merchant's whole store",
    );
  }

  /* ── markup that must never ship ──────────────────────────────────────── */
  head("and what may not ride along with it");
  {
    const parsed = designTreeSchema.parse(
      band([
        { type: "heading", level: 2,
          text: 'Buy <em onclick="steal()">now</em><script>steal()</script><a href="x">go</a>' },
      ]),
    );
    const t = (parsed.sections[0].children[0] as { text: string }).text;
    check(!t.includes("onclick"), "an event attribute is stripped", t);
    /* THE CONTENTS, NOT ONLY THE TAG. The general tag-stripper below removes
       `<script>` on its own, so asserting the tag alone passes with the
       dedicated rule deleted — and `steal()` is then left sitting in the
       heading as copy the designer never wrote. Found by breaking the rule to
       see whether anything noticed. */
    check(!t.includes("<script"), "a script tag is stripped");
    check(!t.includes("steal()"), "AND its contents go with it, not left behind as text", t);
    check(!t.includes("<a"), "a link is stripped — a heading that navigates is a button");
    check(t.includes("<em>now</em>"), "and the emphasis itself is kept", t);
  }

  /* ── an animation nobody enumerated ───────────────────────────────────── */
  head("an animation the motion names do not cover");
  {
    const KF = "@keyframes ripple{0%{opacity:.4}100%{opacity:1}}";
    const page = await open(band([
      { type: "heading", level: 3, text: "New",
        classes: "badge",
        anim: { keyframes: KF, animation: "ripple 2s infinite" } },
    ]));
    const css = page.customCSS ?? "";
    check(css.includes("@keyframes ripple"), "the mockup's own keyframes ship, verbatim");
    check(/animation:\s*ripple 2s infinite/.test(css), "and the shorthand that plays them");
    check(
      !/pfd-motion-ready[^{]*animation:\s*ripple/.test(css),
      "NOT gated behind the reveal class — a still element is a page, a hidden one is a hole",
    );
  }
  {
    /* Half a pair is not motion. */
    const only = designTreeSchema.parse(band([
      { type: "heading", level: 3, text: "New", anim: { animation: "ripple 2s infinite" } },
    ]));
    const a = (only.sections[0].children[0] as { anim?: Record<string, unknown> }).anim;
    check(a?.animation === undefined, "an `animation` with no keyframes is refused");

    const mismatched = designTreeSchema.parse(band([
      { type: "heading", level: 3, text: "New",
        anim: { keyframes: "@keyframes ripple{0%{opacity:.4}100%{opacity:1}}",
                animation: "somethingElse 2s infinite" } },
    ]));
    const b = (mismatched.sections[0].children[0] as { anim?: Record<string, unknown> }).anim;
    check(b?.animation === undefined, "and so is a pair whose names do not match");

    const injected = designTreeSchema.parse(band([
      { type: "heading", level: 3, text: "New",
        anim: { keyframes: "@keyframes ripple{0%{opacity:.4}100%{opacity:1}}",
                animation: "ripple 2s infinite;position:fixed;top:0" } },
    ]));
    const c = (injected.sections[0].children[0] as { anim?: Record<string, unknown> }).anim;
    check(c?.animation === undefined, "a shorthand smuggling a second declaration is refused");

    const imported = designTreeSchema.parse(band([
      { type: "heading", level: 3, text: "New",
        anim: { keyframes: '@import url("//evil/x.css");@keyframes ripple{0%{opacity:.4}100%{opacity:1}}',
                animation: "ripple 2s infinite" } },
    ]));
    const d = (imported.sections[0].children[0] as { anim?: Record<string, unknown> }).anim;
    check(d?.keyframes === undefined, "and so is a block carrying an @import");
  }

  /* ── the form ─────────────────────────────────────────────────────────── */
  head("a form field keeps its placeholder and says whether its label shows");
  {
    const page = await open(band([
      { type: "form", intent: "signup", submitText: "Join",
        fields: [{ label: "Email", kind: "email", required: true,
                   placeholder: "you@shop.com", labelOn: false }] },
    ]));
    const input = page.items.find((i) => i.type === "FormInput");
    const field = page.items.find((i) => i.type === "Form2.Field");
    check(input?.data?.placeholder === "you@shop.com", "the placeholder reaches the input",
      String(input?.data?.placeholder));
    check(
      (field?.data?.label as { on?: boolean } | undefined)?.on === false,
      "and the label is off where the design draws none",
    );
  }
  {
    /* The default must be what it always was. */
    const page = await open(band([
      { type: "form", intent: "contact", submitText: "Send",
        fields: [{ label: "Name", kind: "text", required: true }] },
    ]));
    const field = page.items.find((i) => i.type === "Form2.Field");
    const input = page.items.find((i) => i.type === "FormInput");
    check(
      (field?.data?.label as { on?: boolean } | undefined)?.on === true,
      "a field that says nothing still shows its label, as before",
    );
    check(!("placeholder" in (input?.data ?? {})), "and sends no placeholder, as before");
  }

  /* ── the names the page's own script selects by ───────────────────────── */
  head("the mockup's class names survive");
  {
    const page = await open(
      band(
        [
          { type: "heading", level: 2, text: "Deals", classes: "promo-title" },
          { type: "text", text: "Ends Friday", classes: "promo-sub tiny" },
        ],
        { classes: "promo-strip" },
      ),
    );
    check(/\bpromo-strip\b/.test(page.classes), "the band's own class");
    check(/\bpromo-title\b/.test(page.classes), "a heading's");
    check(/\bpromo-sub\b/.test(page.classes) && /\btiny\b/.test(page.classes), "and every name in a list");
    check(
      /\bpf-design-export\b/.test(page.classes),
      "appended to what the exporter already put there, not replacing it",
    );
  }
  {
    const parsed = designTreeSchema.parse(
      band([{ type: "heading", level: 2, text: "x", classes: 'a b" onload="steal()' }]),
    );
    const c = (parsed.sections[0].children[0] as { classes?: string }).classes;
    /* `b"` is not a class name, so it goes with the rest of the injection. What
       has to hold is that NOTHING but bare names survives — not that a
       particular salvage was attempted. */
    check(
      c !== undefined && /^[A-Za-z_][\w-]*( [A-Za-z_][\w-]*)*$/.test(c) && !c.includes("onload"),
      "and anything that is not a class name is dropped",
      String(c),
    );
  }

  /* ── the tile in a product grid ───────────────────────────────────────── */
  head("a product card looks like the mockup's card");
  {
    /* Again in another vocabulary: a teal `.sku-tile` that lifts 9px and zooms
       its photograph 1.04, none of which is what the page that found this
       uses. A fix that named one mockup's values would not pass here. */
    const page = await open(
      band([
        {
          type: "productList",
          columns: 3,
          limit: 6,
          source: "store",
          badge: "Fresh",
          badgeCorner: "TOP_RIGHT",
          cardStyle: {
            card: {
              background: "#0E3B34",
              border: "1px solid #145147",
              borderRadius: "22px",
              overflow: "hidden",
              transition: "transform .4s ease, box-shadow .4s ease",
            },
            cardHover: { transform: "translateY(-9px)", boxShadow: "0 0 44px rgba(20,81,71,.5)" },
            imageHover: { transform: "scale(1.04)" },
            badge: { margin: "14px", background: "#7FE7C4", color: "#04201B" },
          },
        },
      ]),
    );
    const boxStyle = (() => {
      const box = page.items.find((i) => i.type === "ProductBox")!;
      const e = page.styles.find((s) => s.id === box.id)!;
      return JSON.parse(e.styles).all as Record<string, string>;
    })();

    const form = boxStyle["& > form"] ?? "";
    check(/border-radius:\s*22px/.test(form), "the tile's radius reaches the card", form.slice(0, 90));
    check(/background:\s*#0E3B34/i.test(form), "and its background");
    check(/overflow:\s*hidden/.test(form), "AND ITS overflow, which is what clips the photograph");
    check(
      /display:\s*flex/.test(form) && /flex-direction:\s*column/.test(form),
      "without losing the layout the form needs",
    );

    check(
      /translateY\(-9px\)/.test(boxStyle["&:hover"] ?? ""),
      "the card lifts on hover",
      boxStyle["&:hover"] ?? "(none)",
    );
    check(
      /scale\(1\.04\)/.test(boxStyle["&:hover img"] ?? ""),
      "and its photograph zooms — a rule on a child no selector on that child can write",
      boxStyle["&:hover img"] ?? "(none)",
    );

    const badge = page.items.find((i) => i.type === "ProductBadge");
    const bcss = badge ? (JSON.parse(page.styles.find((s) => s.id === badge.id)!.styles).all?.["&"] ?? "") : "";
    check(/margin:\s*14px/.test(bcss), "the badge is inset by its own margin", bcss.slice(-70));
    /* WHAT MATTERS IS THE ORDER, not the property name. The default writes
       `background-color` and the mockup here writes the `background`
       shorthand; both are in the block, and the design's wins because it comes
       last. Asserting the property name instead reported a failure on correct
       output — the colour was there, under the other spelling. */
    const mine = bcss.indexOf("#7FE7C4");
    const dflt = bcss.search(/background-color:/);
    check(
      mine >= 0 && (dflt === -1 || mine > dflt),
      "and the mockup's colour is written AFTER the default, so it wins",
      bcss.slice(0, 90),
    );
  }
  {
    /* Silence must still mean the default, or every page built before this
       changes shape. */
    const page = await open(band([{ type: "productList", columns: 3, limit: 6, source: "store" }]));
    const box = page.items.find((i) => i.type === "ProductBox")!;
    const all = JSON.parse(page.styles.find((s) => s.id === box.id)!.styles).all as Record<string, string>;
    check(!("&:hover" in all), "a card that states no hover gets none");
    check(
      !/border-radius|overflow/.test(all["& > form"] ?? ""),
      "and one that states no look is left alone",
    );
  }

  console.log(failures === 0 ? "\nall good" : `\n${failures} failed`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
