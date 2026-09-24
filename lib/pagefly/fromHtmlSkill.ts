import "server-only";

import { pageflyBuilderSkill } from "./builderSkill";
import { getProvider } from "../ai/provider";
import { Page, type PFNode, type StyleData } from "./builder";

/* ==========================================================================
   HTML → .pagefly, built by the model against the `pagefly-builder` skill.

   THE OTHER PATH STILL EXISTS. `fromHtml.ts` lays the document out and measures
   it, which is exact about pixels and ignorant about PageFly. This one hands
   the skill's 99 verified element shapes to a model that can see both the
   design and the vocabulary. Neither is deleted; which one runs is a flag.

   SECTION BY SECTION, AND THAT IS NOT A COMPROMISE. The page just measured came
   to 470 elements; written out as PageFly JSON that is about 350 KB, roughly
   100,000 tokens, against a 96,000 ceiling the same model has truncated at
   38,000. One call for a whole page does not fit and would fail at the end,
   after paying for all of it.

   A section does fit, and the split is honest: `items[]` is a FLAT array joined
   by id, so a page is not a thing that has to be authored at once. What the
   model decides is the only part that needs judgement — which element, which
   fields, what nests where. Ids, the root chain and the zip are bookkeeping,
   and bookkeeping belongs in code where it cannot be got wrong.
   ========================================================================== */

/** What the model is asked to return, per section. */
type ModelNode = {
  type: string;
  data?: Record<string, unknown>;
  styles?: Record<string, Record<string, string>> | null;
  children?: ModelNode[];
};

const ASK = [
  "Return ONE JSON object and nothing else:",
  "",
  '  { "node": { "type": "FlexSection", "data": {…}, "styles": {…}, "children": [ … ] } }',
  "",
  "· `type` is a PageFly element type from the shapes above.",
  "· `data` is that element's own fields, copied in shape from the examples.",
  "· `styles` is the styleData object — `{all|laptop|tablet|mobile: {selector: css}}`",
  "  — as an OBJECT here, not the JSON string the export format stores. The",
  "  packaging turns it into one; you never write the escaping.",
  "· `children` nests literally. No ids anywhere — they are assigned afterwards.",
  "",
  "The root of every answer is exactly one FlexSection.",
  "",
  "The CSS you write must reproduce the HTML you were given. It arrives with",
  "every value already resolved at four widths, so this is a translation, not a",
  "design: read the declarations off the markup and put them where PageFly reads",
  "them — in `styles`, never in customCSS.",
].join("\n");

/* ==========================================================================
   Splitting the document.

   ON `<section>`, because that is what the page is made of and what the model
   that wrote it was told to make. A `<div>` band is the fallback, and the whole
   body the last resort — one oversized call is still better than no answer.

   THE HEADER AND THE FOOTER ARE NOT BANDS, and this is the one rule here worth
   the paragraph. An earlier version took them, on the reasoning that a page
   that opens on its masthead should keep it. That reasoning was wrong about
   where the page ends up: a PageFly page is rendered INSIDE a Shopify theme
   that has already drawn its own header and its own footer. Transcribing the
   mockup's chrome puts a second masthead directly under the theme's — two
   logos, two menus, two carts — which is exactly the duplication the merchant
   sees in the editor and reports as a broken import.

   So the scope is `<main>` where the document has one, and the body with its
   chrome cut away where it does not. Dropping it here rather than only in the
   mockup prompt is deliberate: it makes the rule hold for every mockup already
   written, not only the ones written after the prompt changed.
   ========================================================================== */
export function splitSections(html: string): string[] {
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html;

  /* `<main>` is the page's own content by definition — everything the theme
     does not already provide. Where the mockup marks one, nothing outside it is
     ever a band. */
  const main = outermost(body, ["main"])[0];
  const scope = main
    ? main.replace(/^<main\b[^>]*>/i, "").replace(/<\/main>\s*$/i, "")
    : stripChrome(body);

  /* `div` is not in the first list on purpose: a wrapper div holding every
     section would come back as one band far past the model's ceiling. It is
     tried only when the document turns out not to use sections at all. */
  let bands = outermost(scope, ["section", "article"]);
  if (bands.length === 0) bands = outermost(scope, ["div"]);

  return bands.length > 0 ? bands : [scope];
}

/* ==========================================================================
   THE SCRIPT THE BANDS DO NOT CARRY.

   A mockup is one self-contained document, and the model that writes it puts
   its behaviour where any hand-written page puts it: one `<script>` after
   `</main>`, holding the countdown, the carousel, the reveal observer and the
   tab bar all at once. `splitSections` scopes to `<main>` — so that script sat
   outside every band and reached the transcriber in none of them. Measured on
   the seven Hexwood pages it is the same 9.1 KB missing from each: every page's
   entire behaviour, dropped in silence, with the export reporting every band
   built.

   COLLECTED SEPARATELY RATHER THAN FOLDED INTO A BAND. Band 1 is not where the
   page's script belongs — it is one section's markup, and a transcriber asked
   to read a section is not being asked to read the page's JavaScript. What this
   returns goes to a call of its own; see `lib/pagefly/pageScript.ts`.

   WHAT COUNTS AS OUTSIDE. Anything `splitSections` did not hand over: script
   after `</main>`, script in a `<header>` or `<footer>` the scope cut away, and
   script in `<body>` between the bands. Script inside `<head>` is excluded — it
   is in the head block, which every band call already carries in full, so
   collecting it here would send it twice and ask the page-script pass to
   re-emit what the bands have already seen.
   ========================================================================== */
/** `<script>…</script>` with its contents, anywhere in a document. */
const SCRIPT_TAG = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;

/**
 * EVERY inline script in the document, in order.
 *
 * ONE OWNER FOR A PAGE'S BEHAVIOUR, and that is the whole point of this
 * function. Script used to be collected from the body alone and with the bands
 * subtracted, which left two gaps that lost bytes in silence:
 *
 *   · a mockup that arms its own reveals from the `<head>` — one line before
 *     any markup — lost that line before anything could weigh whether it
 *     mattered;
 *   · script INSIDE a section was left for the band call to carry as a
 *     `custom` node, capped at 1500 characters and only if the model chose to.
 *
 * Both reach the page call now, and `bandMarkup` takes the script back out of
 * the band before the band is transcribed — so nothing is lost and nothing is
 * registered twice. A byte that never arrives cannot be in the answer, so no
 * check downstream saves it and no log mentions it: the page just sits still.
 *
 * `src=` is skipped. There is nothing to carry and nothing to rewrite.
 */
export function pageScripts(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(SCRIPT_TAG)) {
    if (/\ssrc\s*=/i.test(m[1])) continue;
    const js = m[2].trim();
    if (js) out.push(js);
  }
  return out;
}

/**
 * One band, as the transcriber should see it: markup, no script.
 *
 * The page call owns every line of JavaScript on the page. Leaving a copy in
 * the band would register the same listener twice — and two listeners on one
 * hover is not twice the animation, it is a flicker.
 */
export function bandMarkup(band: string): string {
  return band.replace(SCRIPT_TAG, "");
}

/** The body with its top-level `<header>` and `<footer>` removed. */
function stripChrome(html: string): string {
  let out = html;
  for (const band of outermost(html, ["header", "footer"])) out = out.replace(band, "");
  return out;
}

/**
 * The outermost elements of the given tags, in document order.
 *
 * Depth-counted rather than regex-matched: `<section>…<section>…</section>…
 * </section>` is legal and a non-greedy match closes it at the wrong place,
 * which would cut a band in half and hand the model an unbalanced fragment.
 */
function outermost(html: string, tags: string[]): string[] {
  const open = new RegExp(`<(${tags.join("|")})\\b[^>]*>`, "gi");
  const found: string[] = [];
  let m: RegExpExecArray | null;

  while ((m = open.exec(html)) !== null) {
    const tag = m[1].toLowerCase();
    const step = new RegExp(`<${tag}\\b[^>]*>|</${tag}>`, "gi");
    step.lastIndex = m.index;
    let depth = 0;
    let end = -1;
    let s: RegExpExecArray | null;
    while ((s = step.exec(html)) !== null) {
      if (s[0].startsWith("</")) {
        if (--depth === 0) {
          end = s.index + s[0].length;
          break;
        }
      } else depth++;
    }
    if (end < 0) continue;
    found.push(html.slice(m.index, end));
    /* Past the whole band, so nothing inside it is picked up again. */
    open.lastIndex = end;
  }
  return found;
}

/** Everything in `<head>`: the model needs the stylesheet to read values off. */
function headOf(html: string): string {
  return /<head[^>]*>([\s\S]*?)<\/head>/i.exec(html)?.[1]?.trim() ?? "";
}

/* ==========================================================================
   Model answer → builder nodes.

   COERCE, NEVER REJECT — the same rule `lib/design/schema.ts` arrived at after
   three pages were thrown away over one leaf each. A node with no type is
   dropped; a node with a type we have never heard of becomes a FlexBlock rather
   than a failure, because a page missing one box beats no page at all.
   ========================================================================== */
/* ==========================================================================
   WHAT THE MODEL GETS WRONG THE SAME WAY EVERY TIME.

   `conformance.ts` compares what we emit against a page the PageFly editor
   exported itself, per element type. Run on the first skill-built page it found
   six divergences, and they sort into two kinds.

   One kind is not a fault: `buttonType` is a real `Button2` field — it is in
   `fields.md` with three allowed values — and the reference page simply never
   set it. A field the editor does not happen to use is not a field the importer
   rejects.

   The other kind is a fault, and it repeats because it is a natural mistake:

     · `--pf-flex-layout-*` written into `data`. They are CSS custom properties
       and belong in the style string, where the Flex engine reads them. In
       `data` they are inert and the editor shows the wrong sizing mode.
     · `Button2` with an icon and no `showIcon`, or `showIcon` and no `Icon2`
       child. The reference carries an `Icon2` on EVERY button, shown or not.
     · `SlideshowSlide` holding its content directly. Every slide in the
       reference wraps its content in one `FlexBlock`.

   Fixed here rather than asked for again: the model has already answered, a
   second call costs another 40,000 tokens, and none of this needs judgement.
   ========================================================================== */

/** Move CSS custom properties out of `data` and into the element's own style. */
function moveCustomProps(node: PFNode): void {
  const data = node.data as Record<string, unknown>;
  const moved: string[] = [];
  for (const key of Object.keys(data)) {
    if (!key.startsWith("--")) continue;
    const value = data[key];
    if (typeof value === "string" || typeof value === "number")
      moved.push(`${key}: ${value};`);
    delete data[key];
  }
  if (moved.length === 0) return;

  const style = (node.styleData ?? {}) as Record<string, Record<string, string>>;
  const all = style.all ?? {};
  all["&"] = `${all["&"] ?? ""} ${moved.join(" ")}`.trim();
  style.all = all;
  (node as { styleData: StyleData }).styleData = style;
}

function normalise(node: PFNode): PFNode {
  const kids = ((node as unknown as { _kids?: PFNode[] })._kids ?? []).map(normalise);
  (node as unknown as { _kids: PFNode[] })._kids = kids;

  moveCustomProps(node);
  const data = node.data as Record<string, unknown>;

  if (node.type === "Button2" || node.type === "Form2.Button2") {
    const hasIcon = kids.some((k) => k.type === "Icon2");
    if (hasIcon && data.showIcon === undefined) data.showIcon = true;
    if (data.showIcon === undefined) data.showIcon = false;
    if (data.iconPos === undefined) data.iconPos = "right";
    /* Present whether it is shown or not — the editor renders the child, and a
       child that is absent is a missing node rather than a hidden icon. */
    if (!hasIcon)
      kids.push({ type: "Icon2", data: {}, styleData: null, _kids: [] } as unknown as PFNode);
  }

  if (node.type === "Slideshow") {
    if (data.autoPlay === undefined) data.autoPlay = false;
    if (data.loop === undefined) data.loop = true;
    if (data.pauseOnHover === undefined) data.pauseOnHover = true;
    if (data.slidesToScroll === undefined) data.slidesToScroll = 1;
  }

  /* TABS3 HAS FIVE SLOTS, AND THE MODEL BUILT TWO.

     `fields.md` says Tabs3 is "a single block — emit the type alone"; the
     editor's own export gives it a menu, a content wrapper, a DropdownButton
     and TWO loose TabHeader3s carrying `isNavButton: "start"` and `"end"`.
     `builder.ts` learned that the hard way and now refuses anything else, which
     is why the first full page came back as a 502 instead of a broken tab bar.

     The three missing slots carry no content — they are the collapsed-menu
     control and the two scroll arrows — so they can be supplied here exactly.
     What the model actually had to decide, the tabs and their panels, it got
     right. */
  if (node.type === "Tabs3") {
    const has = (t: string) => kids.some((k) => k.type === t);
    if (!has("DropdownButton"))
      kids.push({ type: "DropdownButton", data: {}, styleData: null, _kids: [] } as unknown as PFNode);
    const navs = kids.filter(
      (k) => k.type === "TabHeader3" && typeof (k.data as { isNavButton?: unknown }).isNavButton === "string",
    );
    for (const side of ["start", "end"] as const) {
      if (navs.some((n) => (n.data as { isNavButton?: unknown }).isNavButton === side)) continue;
      kids.push({
        type: "TabHeader3",
        /* No children: a scroll arrow draws its own glyph, and both reference
           exports give the pair zero. */
        data: { activeTab: 0, showIcon: false, iconPos: "left", isNavButton: side },
        styleData: null,
        _kids: [],
      } as unknown as PFNode);
    }
    /* The order the slots must arrive in — menu, wrapper, dropdown, then the
       two arrows — which is how the editor's export writes them. */
    const rank = (k: PFNode): number =>
      k.type === "TabsMenu3" ? 0
      : k.type === "TabContentWrapper3" ? 1
      : k.type === "DropdownButton" ? 2
      : 3;
    kids.sort((a, b) => rank(a) - rank(b));
  }

  /* TABLE2 HAS FOUR SLOTS AND TWO OF THEM HOLD NOTHING.

     `Table2.RowHeader` and `Table2.ColumnHeader` are structural — the editor's
     own export marks both `isDisabledInOutline: true` and leaves them empty
     unless the table actually shows headers. A model reading the shape sees two
     empty nodes and skips them, which is reasonable and which `validate()`
     refuses, because the renderer indexes the slots by position.

     Same fault as Tabs3, same answer: supply what carries no content. */
  if (node.type === "Table2") {
    const want: [string, Record<string, unknown>][] = [
      ["Table2.RowHeader", { name: "Row header", isDisabledInOutline: true }],
      ["Table2.ColumnHeader", { name: "Column header", isDisabledInOutline: true }],
    ];
    for (const [type, data] of want.reverse()) {
      if (kids.some((k) => k.type === type)) continue;
      kids.unshift({ type, data, styleData: null, _kids: [] } as unknown as PFNode);
    }
    const order = ["Table2.RowHeader", "Table2.ColumnHeader", "Table2.ColumnBody", "Table2.Body"];
    kids.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
  }

  if (node.type === "SlideshowSlide" && !(kids.length === 1 && kids[0].type === "FlexBlock")) {
    (node as unknown as { _kids: PFNode[] })._kids = [
      { type: "FlexBlock", data: {}, styleData: null, _kids: kids } as unknown as PFNode,
    ];
  }

  return node;
}

function toNode(raw: unknown): PFNode | null {
  if (!raw || typeof raw !== "object") return null;
  const n = raw as ModelNode;
  const type = typeof n.type === "string" ? n.type.trim() : "";
  if (!type) return null;

  const kids = Array.isArray(n.children)
    ? n.children.map(toNode).filter((k): k is PFNode => k !== null)
    : [];

  /* `styles` arrives as an object and the file wants a string; `Page.build`
     does that encoding, so it is handed over as-is. An empty object is not a
     style and would add a row pointing at nothing. */
  const styleData: StyleData =
    n.styles && typeof n.styles === "object" && Object.keys(n.styles).length > 0
      ? (n.styles as Record<string, Record<string, string>>)
      : null;

  return {
    type,
    data: (n.data && typeof n.data === "object" ? n.data : {}) as Record<string, unknown>,
    styleData,
    _kids: kids,
  } as unknown as PFNode;
}

/**
 * The first complete JSON object in a reply, found by matching braces.
 *
 * First-brace-to-last-brace is the obvious version and it is wrong: a model
 * that writes one sentence after the object — or a second object — moves the
 * last brace past the end of the first, and the parse fails on an answer that
 * was perfectly good. Measured on the first real section: valid JSON, rejected.
 *
 * Depth is counted outside strings only, so a `}` inside a CSS value or a piece
 * of copy cannot close the object early.
 */
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

export type SkillBuild = {
  blob: Blob;
  filename: string;
  sections: number;
  built: number;
  usage: { input: number; output: number };
  failures: { index: number; reason: string }[];
};

/**
 * Convert one HTML document into a .pagefly, one section per model call.
 *
 * Sections are converted in parallel: they share nothing, and the skill prefix
 * is identical on every call, so the vendor's prompt cache is warm from the
 * first one onward.
 */
export async function pageflyFromHtmlSkill(
  html: string,
  name: string,
  signal?: AbortSignal,
): Promise<SkillBuild> {
  const provider = getProvider();
  if (!provider) throw new Error("no model configured");

  const system = pageflyBuilderSkill();
  const head = headOf(html);
  const sections = splitSections(html);

  const usage = { input: 0, output: 0 };
  const failures: { index: number; reason: string }[] = [];

  const results = await Promise.all(
    sections.map(async (section, index) => {
      const user = [
        `You are converting section ${index + 1} of ${sections.length} of one page.`,
        "",
        "THE PAGE'S OWN STYLESHEET — every class the markup below uses is defined",
        "here. Read the values off it; do not invent any.",
        "",
        head,
        "",
        "THE SECTION:",
        "",
        section,
        "",
        ASK,
      ].join("\n");

      try {
        const answer = await provider.complete({
          system,
          user,
          /* MEASURED, not chosen. At 32,000 the two largest sections of the
             first real page ran out — and the ceiling prices failures, not
             successes: a section that needs 20,000 is billed 20,000 whichever
             number sits above it. DeepSeek bills its own reasoning against this
             same budget, and on the trial section that was 15,000 of it for
             1,465 characters of markup. */
          maxTokens: 96_000,
          signal,
        });
        usage.input += answer.usage.input;
        usage.output += answer.usage.output;

        const parsed = firstObject(answer.text) as { node?: unknown } | null;
        const raw = toNode(parsed?.node ?? parsed);
        const node = raw ? normalise(raw) : null;
        if (!node) {
          failures.push({
            index,
            reason: answer.truncated
              ? `ran out of output budget at ${answer.usage.output} tokens`
              : `no usable JSON — answer began ${JSON.stringify(answer.text.trim().slice(0, 80))}`,
          });
          return null;
        }
        return node;
      } catch (err) {
        failures.push({ index, reason: (err as Error).message.slice(0, 160) });
        return null;
      }
    }),
  );

  const built = results.filter((n): n is PFNode => n !== null);
  if (built.length === 0)
    throw new Error(
      `no section converted — ${failures[0]?.reason ?? "the model returned nothing usable"}`,
    );

  /* VALIDATED ONE SECTION AT A TIME.

     `Page.toBlob` validates the whole document, so a single malformed section
     threw and took nine good ones with it — a 502 after two and a half minutes
     of model calls, with nothing to show. Each section is offered to a throwaway
     page first; one that cannot be packaged is reported and left out, and the
     merchant gets the rest. */
  const doc = new Page({ name });
  for (const [i, node] of built.entries()) {
    /* A section must be a FlexSection to be a section. One that came back as
       something else is wrapped rather than refused — it still holds a page. */
    const section =
      node.type === "FlexSection"
        ? node
        : ({ type: "FlexSection", data: {}, styleData: null, _kids: [node] } as unknown as PFNode);
    try {
      const trial = new Page({ name });
      trial.addSection(section);
      trial.build();
    } catch (err) {
      failures.push({ index: i, reason: `section rejected: ${(err as Error).message.slice(0, 140)}` });
      continue;
    }
    doc.addSection(section);
  }

  if (doc.sectionCount() === 0)
    throw new Error(`every section was rejected — ${failures[0]?.reason ?? "unknown"}`);

  return {
    blob: doc.toBlob(),
    filename: `${name}.pagefly`,
    sections: sections.length,
    built: doc.sectionCount(),
    usage,
    failures,
  };
}
