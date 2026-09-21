import "server-only";

import { designTreeSchema, type DesignTree } from "../design/schema";
import { pageflyFromTree } from "../design/toPagefly";
import { loadSkills } from "../ai/skills";
import { getProvider } from "../ai/provider";
import { splitSections } from "./fromHtmlSkill";

/* ==========================================================================
   HTML → design tree → .pagefly, on the live path's own rails.

   THREE WAYS TO GET FROM AN HTML MOCKUP TO A FILE, and this is the third.

     measure   `fromHtml.ts` lays the document out and copies what the browser
               computed. Exact about pixels, ignorant about PageFly: everything
               becomes a FlexBlock because a DOM walk cannot tell a buy box from
               a div.
     skill     `fromHtmlSkill.ts` hands the `pagefly-builder` reference to the
               model and takes back PageFly JSON. It picks real elements — a
               Table2, a Tabs3, a MailChimpBox — and it has to be repaired
               afterwards, because a model writing that JSON gets the required
               slots wrong in the same four places every time.
     live      this file. The model writes the LIVE VOCABULARY — the 24 node
               types of `lib/design/schema.ts` — and `toPagefly.ts` turns that
               into PageFly.

   WHY THE THIRD IS WORTH HAVING. `toPagefly.ts` and `builder.ts` are 4,400
   lines of PageFly knowledge bought one import bug at a time: Tabs3's five
   slots, `TabsContent3.name = "TAB_CONTENT"`, the Icon2 that is always there,
   the min-width floor that stops a line breaking per character, classes on
   `classGlobalStyling` rather than `className`. Asking a model to write PageFly
   JSON throws all of that away and then re-learns it in a repair pass. Asking
   it for a design tree keeps every line of it — and the tree is a vocabulary of
   24 words, which is a far smaller thing to get right than 99 element types
   with their fields.

   So the model does what only a model can do — look at a page and say what each
   part IS — and the deterministic exporter does the rest.

   THE INPUT IS A PAGE, NOT A BRIEF. This is transcription, not design: the
   layout, the copy, the colours and the spacing are all decided and present in
   the markup. The skills still go in the prompt because they define the
   vocabulary, but the instruction below is explicit that nothing is to be
   invented.
   ========================================================================== */

export const ASK = [
  "TRANSCRIBE, DO NOT DESIGN.",
  "",
  "The page below is finished. Every layout decision, every word, every colour",
  "and every measurement is already in it. Your job is to say what each part IS",
  "in the node vocabulary above, and to carry its CSS across unchanged.",
  "",
  "Return ONE JSON object and nothing else:",
  "",
  '  { "section": { "type": "section", … } }',
  "",
  "· One `section` node, shaped exactly as the vocabulary defines it.",
  "· `css` and `mobile` hold the declarations the markup already states. Read",
  "  them off the stylesheet; do not re-decide any of them.",
  "· Copy is copied. Not rewritten, not improved, not shortened.",
  "· Where a run of markup is really a PageFly element — a table, a tab bar, an",
  "  accordion, a form, a slideshow, a countdown — use that node type. That",
  "  choice is the whole reason you are reading this and not a DOM walker.",
  "",
  "· `::before` AND `::after` ARE NOT NODES. A band whose photograph lives in",
  "  `.hero::before{background:#12100C url(…) center/cover}` has no element",
  "  carrying that image, and there is nowhere in this vocabulary to put a",
  "  pseudo-element. Hoist it: the image and any gradient over it belong in the",
  "  band's own `css.backgroundImage`, which takes both in one declaration —",
  "  `linear-gradient(…), url(…)`, gradient first. Read every `::before` and",
  "  `::after` rule in the stylesheet and place what it paints on the node it",
  "  painted for. A page that loses this loses its photographs.",
  "",
  "· A row is a `row` and a column is a `col`. `display:flex` with",
  "  `flex-direction:row` is a `row` node however the markup nests it — a header",
  "  whose logo, navigation and icons sit side by side is one `row` of three",
  "  children, not three stacked blocks.",
  "",
  "· A ROW OF DIFFERENT THINGS PUTS A WIDTH IN EACH CHILD\'S `css`. Three or",
  "  more children of one type, none of which states `css.flexBasis` or",
  "  `css.width`, reads as a grid of repeating cards and is exported as one — a",
  "  card grid stacks its cards, which is right for four product tiles and wrong",
  "  for a header. A logo, a menu and a row of icons are three different things",
  "  that happen to sit side by side, so give each one the width the stylesheet",
  "  gives it: `\"css\": { \"flexBasis\": \"auto\" }` where it hugs its content,",
  "  a percentage or a pixel value where the stylesheet states one. It must be",
  "  inside `css`; a `basis` field on the node itself does not say this.",
  "",
  "· THE OPTION CONTROLS TAKE THEIR LOOK FROM THE MOCKUP. A `product` node",
  "  carries `swatchStyle`, six named parts each holding plain declarations:",
  "",
  '    "swatchStyle": {',
  '      "dot":          { "width": 54, "height": 54, "borderRadius": 2 },',
  '      "dotSelected":  { "boxShadow": "0 0 0 1px #8A1C1C" },',
  '      "tile":         { "minWidth": 78, "padding": "18px 0", "fontSize": 17 },',
  '      "tileSelected": { "background": "#12100C", "color": "#FBFAF7" },',
  '      "label":        { "letterSpacing": ".26em", "color": "#8A1C1C", "opacity": 1 },',
  '      "dropdown":     { "borderRadius": 2 }',
  "    }",
  "",
  "  `dot` is a colour swatch, round or square; `tile` is a size button. Read",
  "  the numbers off the stylesheet — a 54px square swatch imports as a 28px",
  "  circle unless this says otherwise, because that is the exporter's default.",
  "  State only what the mockup states: the border, the cursor and the",
  "  transition are already there and a part you leave out keeps them.",
  "",
  "  The COLOURS of the dots are not yours to set. PageFly reads those from the",
  "  merchant's own product, and no field in the file carries them.",
  "",
  "· A `tabs` node carries `tabStyle` the same way, with four parts — `bar`,",
  "  `label`, `labelActive`, `panel`. `labelActive` is the chosen tab: an",
  "  underline, a weight, a colour. State what the mockup draws.",
  "",
  "· A `product` node carries `mediaStyle` for the gallery's own controls —",
  "  `nav` is the arrow over the photograph, `dot` and `dotActive` the",
  "  pagination under it. A mockup paging with thin dashes says so here; the",
  "  platform's two canned looks are round dots or nothing.",
  "",
  "  WRITING THESE IS WHAT TURNS THE CONTROLS ON. A gallery whose mockup draws",
  "  no arrows and no dots — a still photograph with crops under it, say — gets",
  "  neither, and that is right: build what the markup has, not what a product",
  "  gallery usually has. So write `nav` only when the mockup draws an arrow,",
  "  and `dot`/`dotActive` only when it draws pagination. Look before writing.",
  "",
  "  Two more parts are the thumbnail strip: `thumb` is one tile — its",
  "  `aspectRatio` above all, because the default is a square and a mockup",
  "  with landscape thumbnails arrives cropped without it — and `thumbSelected`",
  "  is the border drawn on the one being shown.",
  "",
  "  `mediaArrow` is the SHAPE drawn inside the arrow buttons. PageFly draws",
  "  one — a chevron, two short bars meeting at a point. Write `arrow` when the",
  "  mockup draws a long arrow with a shaft, the `\u2190` and `\u2192`",
  "  characters. Leave it out for a chevron, or for arrows drawn as an SVG you",
  "  cannot name.",
  "",
  "  `mediaControls` is WHERE those controls sit, and it changes the whole",
  "  composition. The platform's own arrangement, `over`, pins both arrows",
  "  halfway down the photograph and floats the dots over its lower edge. Write",
  "  `below` when the mockup puts them in a strip UNDER the frame instead —",
  "  prev at the far left, dots centred, next at the far right. LOOK: a bar of",
  "  its own beneath the photograph is `below`; arrows sitting on the picture",
  "  are `over`. Leave it out and the page gets `over`.",
  "",
  "  `mediaThumbs` is a NUMBER on the product node, not a part: how many",
  "  thumbnails are visible at once. COUNT THEM IN THE MOCKUP and write it",
  "  only when they are countable. Leave it out and the platform shows five,",
  "  which is right whenever the mockup does not say otherwise.",
  "",
  "  `caption` is the other thing a gallery writes over the photograph — a",
  "  line low in a corner naming the shot, `04 — Strap and hem detail`. Write",
  "  the part when the mockup draws one; the number is counted for you and the",
  "  words come from each photo's own alt text, so do NOT put the mockup's",
  "  wording anywhere — it belongs to that mockup's photographs, not the",
  "  shop's. It is not the counter's rival: a gallery can have both.",
  "",
  "  A fourth part, `counter`, is the `01 / 06` badge some galleries put in a",
  "  corner of the photograph INSTEAD of dots. The platform has no such",
  "  setting, so writing this part is what has one built — and it switches the",
  "  dots off, because they are two answers to the same question. A mockup",
  "  that pages by number MUST say so here; stay silent and the number is lost",
  "  and dashes appear under the photograph in its place.",
  "",
  "· WHEN TWO COLUMNS BECOME ONE ELEMENT, THE ELEMENT IS AS WIDE AS THE ROW.",
  "  A gallery beside a buy box is one `productBox` here, because PageFly draws",
  "  both halves from one element. So the node takes the width of the row that",
  "  held them — never the `flex-basis`, `width` or `max-width` the stylesheet",
  "  gives to one of the two columns. Carrying the buy column's `max-width:",
  "  560px` onto it squeezes the gallery and the buy box together into half the",
  "  page, and every measurement inside them is then wrong. The same holds for",
  "  any element that swallows a row: a table, a slideshow, an accordion.",
  "",
  "· AN IMAGE ALREADY HAS ITS PHOTOGRAPH, so `query` is not a search phrase",
  "  here. Copy the `src` of the `<img>` verbatim into `query` — the whole URL,",
  "  query string included. Same for `beforeQuery` / `afterQuery` on a",
  "  comparison, for a band's `bg.query`, and for a `<video>`, whose `query` is",
  "  the `<source>` URL. A phrase instead of a URL loses the photograph: there",
  "  is no stock search on this path, and a node whose query is not a URL is",
  "  exported with no image at all.",
  "",
  "· MOTION IS PART OF THE PAGE, and it is transcribed like everything else.",
  "  Any node takes `anim`: `{\"reveal\":\"fade-up\",\"delay\":2}` and",
  "  `{\"hover\":\"float-shadow\"}`. Read it off the stylesheet the same way you",
  "  read a colour — these are the shapes it is written in:",
  "",
  "    a class that starts at `opacity:0` with a `transform`, and a second rule",
  "    that clears both — that is a `reveal`. `translateY` is `fade-up`,",
  "    `translateX` is `slide-left` or `slide-right` by its sign, `scale` is",
  "    `zoom`, opacity alone is `fade`.",
  "",
  "    a `transition-delay` in steps — 90ms, 180ms, 270ms — is `delay` 1, 2, 3.",
  "",
  "  AND COPY THE NUMBERS. The name says WHAT the motion is; four more keys say",
  "  how far, how long and on what curve, and every one of them is written in",
  "  the stylesheet you were given. Copy them exactly:",
  "",
  "    `ms`       the transition duration in milliseconds — `520` from",
  "               `transition:opacity 520ms ...`",
  "    `delayMs`  the `transition-delay` in milliseconds — `90` from `.d1`",
  "    `distance` how far it travels, in pixels — `18` from `translateY(18px)`",
  "    `easing`   the timing function verbatim — `cubic-bezier(.16,1,.3,1)`",
  "",
  "  So `.reveal{opacity:0;transform:translateY(18px);transition:opacity 520ms",
  "  cubic-bezier(.16,1,.3,1)}` with `.d1{transition-delay:90ms}` on the element",
  "  is `{\"reveal\":\"fade-up\",\"delay\":1,\"ms\":520,\"delayMs\":90,",
  "  \"distance\":18,\"easing\":\"cubic-bezier(.16,1,.3,1)\"}` — the name AND the",
  "  numbers, every time. Omitted, the page falls back to this builder's own",
  "  28px over .7s, which is the same family of motion and a visibly different",
  "  page. Read the four values off the stylesheet the same way you read a",
  "  colour: they are stated, so do not re-decide them.",
  "",
  "  A HOVER THE SIX NAMES DO NOT COVER IS COPIED, NOT APPROXIMATED. Put the",
  "  mockup's own `:hover` declarations in `hoverCss`, verbatim:",
  "",
  "    `.hover-float-shadow{transition:transform 240ms ease-out,box-shadow",
  "    240ms ease-out}` with `.hover-float-shadow:hover{transform:",
  "    translateY(-2px);box-shadow:0 26px 60px rgba(18,16,12,.55)}` is",
  "    `{\"hover\":\"float-shadow\",\"ms\":240,\"easing\":\"ease-out\",\"hoverCss\":",
  "    {\"transform\":\"translateY(-2px)\",\"boxShadow\":",
  "    \"0 26px 60px rgba(18,16,12,.55)\"}}`",
  "",
  "  `transform` is allowed HERE and nowhere else — a hover puts the element",
  "  back the moment the cursor leaves, so it escapes nothing. Keep writing the",
  "  `hover` name beside it: it is what the merchant sees in the panel, and it",
  "  is what the page falls back to if the declarations are dropped.",
  "",
  "  A hover one of the six DOES cover — a plain lift, a plain shadow, a plain",
  "  scale on the platform's own curve — needs no `hoverCss`. The name alone",
  "  leaves the merchant an editable setting, which the copied rule does not.",
  "",
  "  EVERY RULE WRITTEN THIS WAY IS KEYED TO A CLASS ON THE ELEMENT ITSELF —",
  "  the builder puts it in that node's HTML class attribute, the same field",
  "  the editor shows under Attributes, so a merchant can see which elements",
  "  carry which motion and a later edit can find them. You do not write the",
  "  class; you write the values and the builder mints and attaches it.",
  "",
  "    a `:hover` rule that lifts (`translateY(-2px)`) is `float`; one that adds",
  "    a `box-shadow` is `shadow`; both together is `float-shadow`; a `scale()`",
  "    is `grow`, with a shadow `grow-shadow`; a ring or glow is `glow`. A",
  "    `:hover` on a PARENT that scales a child image is `grow` ON THE PARENT.",
  "",
  "  Those eleven words are the whole vocabulary — `fade`, `fade-up`,",
  "  `slide-left`, `slide-right`, `zoom`, and `float`, `shadow`, `grow`,",
  "  `glow`, `float-shadow`, `grow-shadow`. Do not approximate a different",
  "  motion with the nearest of these — a marquee is not a `slide-left`.",
  "",
  "  A MOTION OUTSIDE THEM IS WRITTEN, NOT DROPPED. The `custom` node is the",
  "  route: `{\"el\":\"custom\",\"label\":\"three words\",\"html\":\"…\",",
  "  \"stylesheet\":\"…\",\"js\":\"…\"}`. The stylesheet is scoped to that node",
  "  for you — write `.wave`, not a page-wide selector — and the script runs",
  "  once with `root` already bound to the node's element, so it needs no",
  "  lookup and no DOMContentLoaded.",
  "",
  "  TWO RULES ON THE SCRIPT. It must contain NO `<` character at all: the",
  "  platform refuses the entire page's script for one, and it decodes",
  "  percent-encoding before it looks, so `&lt;` and `%3C` do not help. Write",
  "  `for (var i = 0; i !== n; i++)`, or count down with `i--`, or use",
  "  `.forEach`. And keep it to the motion — a block that rebuilds a section",
  "  in markup is a section the merchant cannot edit.",
  "",
  "  PREFER THE VOCABULARY. A `custom` block does not run in the PageFly",
  "  editor, only on preview and live, so a fade written as one is invisible",
  "  to the merchant while they work. Reach for it when the mockup draws",
  "  something the eleven names genuinely do not cover — a marquee, a",
  "  scroll-linked parallax, a drawn SVG line, a staggered letter reveal — and",
  "  not for a fade that `fade-up` already says.",
  "",
  "  WRITE IT WHEREVER THE MOCKUP HAS IT. A page transcribed without `anim` is",
  "  a page that arrives completely still while its mockup fades, lifts and",
  "  grows — the markup says so on every element that carries one of these",
  "  classes, and each one is a line you are dropping.",
  "",
  "· An `accordion` carries `accordionStyle`: `row` is the clickable question,",
  "  `body` the answer, `icon` the +/- mark. Read them off the stylesheet — a",
  "  serif row, a 17px question, a mark painted in the page's accent are all",
  "  things a mockup states and this exporter will otherwise guess.",
  "",
  "· `mediaHover` is what the MAIN photograph does under the cursor, and the",
  "  default is nothing. Write `\"magnifier\"` only when the mockup really does",
  "  zoom the main image — a lens, a scale on the plate itself. A scale on the",
  "  small crops under it is not that. Left out, the photograph sits still,",
  "  which is what a mockup that draws no zoom looks like.",
  "",
  "· A COUNTDOWN HAS TWO INDEPENDENT PARTS. `labels` is the unit names under",
  "  the figures; `separator` is the `:` between the columns. Read the markup:",
  "  a `<span>` carrying `:` between the units means `\"separator\": true`, and",
  "  no such element means false. Most mockups draw both, some draw neither.",
  "",
  "· A `productList` repeats ONE card over the shop's real products, so the",
  "  card is described once. Read what the mockup's card holds: `atcLabel` is",
  "  its button in the mockup's own words — `Quick add — $58.00` — and leaving",
  "  it out means the card draws no button. `showCompareAt` is true only when",
  "  the card draws a struck-through was-price beside the price. A star rating",
  "  or a review count on a card has no field: those come from a reviews app",
  "  this page cannot read.",
  "",
  "· A `beforeAfter`'s two captions are `beforeLabel` and `afterLabel`, and",
  "  `compareLabelAt` is WHERE THEY HANG. READ THE MARKUP, because both",
  "  arrangements are common: a caption that is a child of the drag handle",
  "  travels with it and is `\"handle\"`; one that is a child of the frame and",
  "  pinned to a corner is `\"corner\"`. You cannot say this in `css` — the",
  "  positioning properties are stripped from a node's css.",
  "  `compareStyle` carries their look: `label` is one caption chip and `knob`",
  "  is the grip in the middle of the bar, which the platform draws as a plain",
  "  round dot and a mockup draws as whatever it draws — a square plate, a",
  "  bordered circle. `knobGlyph` is the character inside the grip, usually the",
  "  two-headed arrow the mockup puts there.",
].join("\n");

function firstObject(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const body = (fenced ? fenced[1] : text).trim();
  const start = body.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let i = start; i < body.length; i++) {
    const ch = body[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      quoted = !quoted;
      continue;
    }
    if (quoted) continue;
    if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) {
      try {
        return JSON.parse(body.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

/* ==========================================================================
   Two things the transcript carries that the live path never had to.

   CUSTOM PROPERTIES. A mockup declares its faces and its palette once, in
   `:root{--serif: Gelasio, Georgia, serif}`, and every rule after that says
   `font-family: var(--serif)`. The model copies the declaration across exactly
   as instructed — and `--serif` is not defined anywhere in a PageFly page, so
   the storefront falls back to the theme's font and the export renders in the
   wrong typeface while every value in it is literally correct. The variables
   have to be resolved here, against the document they were declared in,
   because this is the last place both halves are in the same room.

   THE PHOTOGRAPHS. `image.query` is a stock-search phrase on the live path,
   resolved to a URL by a stage that runs before the export. Transcription has
   no such stage: the photograph is already chosen and its URL is in the markup.
   So a query that IS a URL resolves to itself, which is what `assetsOf` builds
   below — without it every `opts.images` lookup misses and the page exports
   with placeholder rectangles where its pictures were.
   ========================================================================== */

/** `--name: value` declarations, first definition winning — the base value.
    Exported, like `splitSections`, so the three repairs below can be tested
    without spending a model call on each. */
export function customProps(head: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /--([A-Za-z0-9_-]+)\s*:\s*([^;}]+)[;}]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(head)) !== null) {
    const name = `--${m[1]}`;
    if (!(name in out)) out[name] = m[2].trim();
  }
  return out;
}

/** `var(--x)` → its declared value, or its own fallback, or left alone. */
function fillVars(value: string, props: Record<string, string>, depth = 0): string {
  if (depth > 4 || !value.includes("var(")) return value;
  const next = value.replace(
    /var\(\s*(--[A-Za-z0-9_-]+)\s*(?:,\s*([^()]*))?\)/g,
    (whole, name: string, fallback?: string) =>
      props[name] ?? (fallback?.trim() ? fallback.trim() : whole),
  );
  /* Custom properties reference custom properties; stop when it settles. */
  return next === value ? value : fillVars(next, props, depth + 1);
}

/** The same tree with every `var()` in every string resolved. */
export function resolveVars<T>(value: T, props: Record<string, string>): T {
  if (typeof value === "string") return fillVars(value, props) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => resolveVars(v, props)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>))
      out[k] = resolveVars(v, props);
    return out as unknown as T;
  }
  return value;
}

const VIDEO_FILE = /\.(mp4|webm|ogv|mov|m4v)(\?|#|$)/i;
const ASSET_KEYS = new Set(["query", "beforeQuery", "afterQuery"]);

/**
 * Every URL the tree names, mapped to itself.
 *
 * Split by extension because the exporter reads the two maps for different
 * jobs: a `.mp4` reaching `images` would be handed to `background-image`, which
 * paints nothing and hides the fact that it painted nothing.
 */
export function assetsOf(value: unknown, into: { images: Record<string, string>; videos: Record<string, string> }) {
  if (Array.isArray(value)) {
    for (const v of value) assetsOf(v, into);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (ASSET_KEYS.has(k) && typeof v === "string" && /^(https?:)?\/\//.test(v.trim())) {
      const url = v.trim();
      (VIDEO_FILE.test(url) ? into.videos : into.images)[url] = url;
    }
    assetsOf(v, into);
  }
}

/** Everything in `<head>`: the model reads declared values off the stylesheet. */
function headOf(html: string): string {
  return /<head[^>]*>([\s\S]*?)<\/head>/i.exec(html)?.[1]?.trim() ?? "";
}

export type LiveBuild = {
  blob: Blob;
  filename: string;
  sections: number;
  built: number;
  usage: { input: number; output: number };
  failures: { index: number; reason: string }[];
};

/**
 * Transcribe a document into the live design tree, then export it.
 *
 * One call per band, in parallel. The skills are the same 33 KB on every call,
 * so the vendor's prompt cache is warm from the first one onward — and it is
 * the same prefix the live design stage sends, which is what makes this path
 * "the live rules" rather than a second set that has to be kept in step.
 */
export async function pageflyFromHtmlLive(
  html: string,
  name: string,
  tokens: { bg: string; ink: string; fontBody: string; accent?: string; border?: string; radius?: number; band?: string },
  signal?: AbortSignal,
): Promise<LiveBuild> {
  const provider = getProvider();
  if (!provider) throw new Error("no model configured");

  const skills = loadSkills("design");
  const system = skills
    ? `${skills}\n\n---\n\n${ASK}`
    : ASK;

  const head = headOf(html);
  const props = customProps(head);
  const bands = splitSections(html);

  const usage = { input: 0, output: 0 };
  const failures: { index: number; reason: string }[] = [];

  const results = await Promise.all(
    bands.map(async (band, index) => {
      const user = [
        `Band ${index + 1} of ${bands.length} of one finished page.`,
        "",
        "THE PAGE'S STYLESHEET — every class the markup uses is defined here:",
        "",
        head,
        "",
        "THE BAND:",
        "",
        band,
      ].join("\n");

      try {
        const answer = await provider.complete({
          system,
          user,
          /* The same ceiling the live design stage uses, for the same reason:
             DeepSeek bills its own reasoning against it, and a band that needs
             20,000 is billed 20,000 whatever number sits above it. */
          maxTokens: 96_000,
          signal,
        });
        usage.input += answer.usage.input;
        usage.output += answer.usage.output;

        const parsed = firstObject(answer.text) as { section?: unknown } | null;
        /* Before validation, so the schema sees the value the mockup states
           rather than the `var()` that stands for it. */
        const raw = resolveVars(parsed?.section ?? parsed, props);

        /* Validated through the LIVE schema, which coerces rather than rejects —
           a malformed value costs itself and nothing else. A band that survives
           here is one `toPagefly.ts` is already known to handle. */
        const checked = designTreeSchema.safeParse({ motionPlan: "", sections: [raw] });
        if (!checked.success) {
          failures.push({
            index,
            reason: answer.truncated
              ? `ran out of output budget at ${answer.usage.output} tokens`
              : `not a section: ${checked.error.issues[0]?.message ?? "unknown"}`,
          });
          return null;
        }
        return checked.data.sections[0];
      } catch (err) {
        failures.push({ index, reason: (err as Error).message.slice(0, 160) });
        return null;
      }
    }),
  );

  const sections = results.filter((s): s is DesignTree["sections"][number] => s !== null);
  if (sections.length === 0)
    throw new Error(
      `no band transcribed — ${failures[0]?.reason ?? "the model returned nothing usable"}`,
    );

  const tree: DesignTree = { motionPlan: "", sections };

  /* The photographs the markup already chose. */
  const assets = { images: {} as Record<string, string>, videos: {} as Record<string, string> };
  assetsOf(sections, assets);

  const built = pageflyFromTree(
    tree,
    { name, bg: tokens.bg, ink: tokens.ink, fontBody: tokens.fontBody },
    1440,
    {
      images: assets.images,
      videos: assets.videos,
      accent: tokens.accent,
      border: tokens.border,
      radius: tokens.radius,
      band: tokens.band,
    },
  );

  return {
    blob: built.blob,
    filename: built.filename,
    sections: bands.length,
    built: sections.length,
    usage,
    failures,
  };
}
