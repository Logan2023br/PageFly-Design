/**
 * EVERY FIELD A MOCKUP VARIES BY MUST BE NAMED IN BOTH PROMPTS.
 *
 * A field exists so the design can state something this exporter must not
 * decide — an arrow's shape, where a caption hangs, whether a gallery has
 * controls at all. A field the model is never told about is a constant with
 * extra steps: the schema's default applies to every page, which is the
 * hardcoding the field was added to remove.
 *
 * THERE ARE TWO PROMPTS AND THEY REACH DIFFERENT PATHS. `pageflyFromHtmlLive`
 * sends the skills plus `ASK`; the live design stage sends the skills plus
 * `systemPrompt`. Neither sends the other. Six fields were documented in one
 * file only and were invisible on the path that actually runs — the model could
 * not have written them if it wanted to, and every page took the default.
 *
 * This test is the thing that notices. It knows nothing about what the guidance
 * SAYS; it only asks whether the field is named where the model can read it.
 */
import { createRequire } from "node:module";
import Module from "node:module";

/* `htmlToTree` is server-only; the same shim every other suite here uses. */
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

let bad = 0;
function check(ok: boolean, label: string, detail = ""): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) bad += 1;
}

/** Field → the decision it takes away from this codebase. */
const STATED: [string, string][] = [
  ["separator", "the `:` between a countdown's units"],
  ["mediaControls", "whether a gallery's controls sit over the frame or below"],
  ["mediaArrow", "a chevron or a long arrow"],
  ["caption", "the line a gallery writes over the photograph"],
  ["mediaThumbs", "how many thumbnails the strip shows"],
  ["mediaHover", "whether the main photograph zooms under the cursor"],
  ["anim", "reveal on scroll, its delay, and the hover — the whole motion layer"],
  ["fade-up", "the reveal names, without which `anim` cannot be written"],
  ["float-shadow", "the hover names, same"],
  ["custom", "the escape hatch for anything the platform does not have"],
  ["delayMs", "the mockup's own delay, to the millisecond"],
  ["easing", "the mockup's own timing function"],
  ["hoverCss", "the mockup's own :hover declarations, when the six names miss"],
  ["showCompareAt", "the struck-through was-price on a card"],
  ["atcLabel", "the card's own button"],
  ["compareLabelAt", "corner or handle for a comparison's captions"],
  ["cardStyle", "how the card's photo, title, price, button and badge look"],
  ["cardRatio", "the shape of the card's photograph"],
  ["cardArrow", "whether the card's photograph pages at all"],
  ["cardGap", "the gap the mockup's grid sets between cards"],
  ["cardNote", "the line the mockup writes under the price"],
  ["atcAt", "over the photograph or under the price"],
  ["atcReveal", "always, or only when the card is pointed at"],
  ["tablet", "the breakpoint between 768 and 1024, which the design could not reach"],
  ["columnsTablet", "how many cards stand side by side at 768-1024"],
  ["columnsPhone", "and below 768"],
  ["cardGapPhone", "the gap the mockup narrows to on a phone"],
  ["galleryPhone", "whether the thumbnail strip survives on a phone"],
  ["tabBar", "wrap or scroll when the tab bar runs out of room"],
  ["compareStyle", "how those captions and the grip look"],
  ["knobGlyph", "the character inside the grip"],
  ["markTwo", "the grip's mark COPIED as a shape, for the mockups that draw one"],
  ["accordionStyle", "how an accordion's rows, answers and mark look"],
  ["tabStyle", "how a tab bar and its panels look"],
  ["swatchStyle", "how the variant chips and size tiles look"],
  ["mediaStyle", "how the gallery's own controls look"],
];

async function main(): Promise<void> {
  const { ASK } = await import("../lib/pagefly/htmlToTree");
  const { __specPromptsForTest } = await import("../lib/design/sectionSpec");
  const ask = ASK;
  const { system } = __specPromptsForTest({
    sell: "silk dresses",
    storeType: "single product",
    styleLabel: "Warm",
    styleBlurb: "soft light",
    prompt: "a product page",
    order: null,
    market: null,
    tokens: { bg: "#ffffff", ink: "#111111", accent: "#cc3333", band: "#eeeeee" },
  } as never);

  console.log("\nfields the html path can be told about");
  for (const [field, why] of STATED) {
    check(ask.includes(field), `ASK names \`${field}\``, ask.includes(field) ? "" : why);
  }

  /* ---- AND ONE LIST THAT IS HONESTLY HTML-ONLY -----------------------

     The two paths do not ask for the same thing. The html path TRANSCRIBES: it
     writes the custom block's own markup, stylesheet and script, because the
     mockup already contains them. The design path DESCRIBES: it names `custom`
     and says what the thing does, and a later stage builds it. So the keys a
     custom block is written with belong in one prompt and not the other, and
     demanding them in both would be demanding the design path do a job it does
     not have. */
  console.log("\nkeys only the transcribing path writes");
  for (const [field, why] of [
    ["stylesheet", "a custom block's own CSS"],
    ["root", "the element its script is handed"],
  ] as [string, string][]) {
    check(ask.includes(field), `ASK names \`${field}\``, ask.includes(field) ? "" : why);
  }

  console.log("\nfields the live design path can be told about");
  for (const [field, why] of STATED) {
    check(system.includes(field), `the spec names \`${field}\``, system.includes(field) ? "" : why);
  }

  /* ---- AND ONE LIST FOR GUIDANCE THAT STOPS SHORT --------------------

     Naming a field is not the same as telling the model it applies. The grip's
     mark arrived as `knobGlyph`, "the character inside the grip" — and the
     mockup that prompted it draws that grip as two inline `<svg>` triangles,
     not as a character at all. Worse, the arrow guidance a few lines up said to
     leave `mediaArrow` out for "arrows drawn as an SVG you cannot name", so the
     model had already been taught that an SVG shape is something to give up on.
     It read the markup, found no character, and wrote nothing; the grip shipped
     empty.

     A field the model is told to skip is as dead as a field it was never told
     about. So wherever a mark can be drawn rather than typed, the guidance has
     to say so where the model is reading. */
  console.log("\nguidance that must reach past the field's name");
  for (const [field, near, why] of [
    ["markTwo", /svg/i, "the mark is usually drawn as an svg shape, not typed"],
    ["markTwo", /polygon/i, "and a straight-sided path becomes a clip-path polygon"],
  ] as [string, RegExp, string][]) {
    for (const [label, text] of [
      ["ASK", ask],
      ["the spec", system],
    ] as [string, string][]) {
      /* EVERY mention, not the first. A field named in two places — the one
         that explains it and a later one that refers back — made this pass or
         fail on which paragraph happened to come first in the file. */
      let ok = false;
      for (let at = text.indexOf(field); at >= 0; at = text.indexOf(field, at + 1)) {
        if (near.test(text.slice(Math.max(0, at - 700), at + 700))) {
          ok = true;
          break;
        }
      }
      check(ok, `${label} tells \`${field}\` what a drawn mark is`, why);
    }
  }

  console.log(bad === 0 ? "\nPASS" : `\nFAIL — ${bad} problems`);
  if (bad > 0) process.exitCode = 1;
}

void main();
