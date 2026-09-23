/* ==========================================================================
   THE FIVE THINGS THAT MUST NOT ARRIVE AS BOXES.

   A transcriber that reads a tab bar as four stacked blocks produces a page
   that LOOKS right — the first panel is showing, the tab strip is drawn, every
   colour is correct — and does nothing when a shopper clicks. The merchant
   finds out on their storefront, and there is no way to fix it in the editor
   short of rebuilding the section, because what they were given is not a broken
   tab bar but a picture of one.

   That failure cannot throw. The tree is valid, the export is valid, the page
   imports. So it is caught here, by comparing two things that are both already
   in hand: what the BAND'S MARKUP plainly is, and what the TREE came back as.

   THE THRESHOLD IS "PLAINLY". Every detector below wants a structural signal —
   a `role="tablist"`, a `<details><summary>`, a `<form>`, a `data-countdown`,
   two or more slides under one track. A guess is worse than nothing here: a
   false positive spends a second model call on a band that was already right,
   and does it on every export of that page for ever.

   ONE RETRY, NOT A LOOP. The retry says the one thing that was missed, in a
   sentence, and takes whichever answer comes back — a model that misses tabs
   twice is not going to find them on the third pass, and a merchant waiting on
   an export should not pay for the discovery.
   ========================================================================== */


/** The node type each feature must come back as. */
export const NATIVE_FEATURES = ["tabs", "accordion", "slideshow", "countdown", "form"] as const;
export type NativeFeature = (typeof NATIVE_FEATURES)[number];

/** What to say about each, when one goes missing. */
const SAY: Record<NativeFeature, string> = {
  tabs: "a tab bar — a strip of labels where clicking one swaps the panel below",
  accordion: "an accordion — rows that open and close, usually a FAQ",
  slideshow: "a slideshow — several slides sharing one frame, with arrows or dots",
  countdown: "a countdown — a clock running down to a date",
  form: "a form — real inputs a shopper submits",
};

const has = (html: string, re: RegExp): boolean => re.test(html);
const count = (html: string, re: RegExp): number => (html.match(re) || []).length;

/**
 * What this band's markup plainly contains.
 *
 * Reads the markup, not the stylesheet: a `.tabs` class in the head means
 * nothing about whether THIS band has a tab bar in it.
 */
export function featuresInHtml(html: string): NativeFeature[] {
  const found: NativeFeature[] = [];

  /* A tablist by ARIA, or two or more elements whose own class or data
     attribute names them tabs. `class="table"` does not match: the word is
     bounded. */
  if (
    has(html, /role\s*=\s*["']tab(list)?["']/i) ||
    count(html, /\bdata-tab\b/gi) >= 2 ||
    count(html, /class\s*=\s*["'][^"']*\btabs?\b[^"']*["']/gi) >= 2
  )
    found.push("tabs");

  /* `<details><summary>` is an accordion with no script at all, which is how
     most mockups write one. `aria-expanded` is how the rest write it. */
  if (
    (has(html, /<details\b/i) && has(html, /<summary\b/i)) ||
    count(html, /aria-expanded\s*=/gi) >= 2 ||
    count(html, /class\s*=\s*["'][^"']*\b(accordion|faq-item)\b[^"']*["']/gi) >= 2
  )
    found.push("accordion");

  /* Two or more slides under one track. One element called `.slide` is a
     styling name, not a slideshow. */
  if (
    count(html, /class\s*=\s*["'][^"']*\b(slide|swiper-slide|carousel-item)\b[^"']*["']/gi) >= 2 ||
    count(html, /\bdata-slide\b/gi) >= 2 ||
    has(html, /class\s*=\s*["'][^"']*\b(carousel|slideshow|swiper)\b[^"']*["']/i)
  )
    found.push("slideshow");

  /* A clock, named as one — by attribute, by class, or by the four labels a
     countdown always carries together. */
  if (
    has(html, /\bdata-(countdown|deadline|end(s|-at|time)?)\b/i) ||
    has(html, /class\s*=\s*["'][^"']*\bcountdown\b[^"']*["']/i) ||
    (has(html, /\b(days?|dd)\b/i) &&
      has(html, /\b(hours?|hrs?|hh)\b/i) &&
      has(html, /\b(min(ute)?s?|mm)\b/i) &&
      has(html, /\b(sec(ond)?s?|ss)\b/i))
  )
    found.push("countdown");

  /* A real `<form>`, or an input beside a button, which is what a newsletter
     signup is whether or not the mockup wrapped it. */
  if (has(html, /<form\b/i) || (has(html, /<input\b/i) && has(html, /<(button|a)\b/i)))
    found.push("form");

  return found;
}

/** Walk anything, collecting `type` values. */
function types(value: unknown, into: Set<string>): void {
  if (Array.isArray(value)) {
    for (const v of value) types(v, into);
    return;
  }
  if (!value || typeof value !== "object") return;
  const o = value as Record<string, unknown>;
  if (typeof o.type === "string") into.add(o.type);
  for (const v of Object.values(o)) types(v, into);
}

/** Which of the five the transcribed band actually came back as. */
export function featuresInTree(section: unknown): Set<string> {
  const found = new Set<string>();
  types(section, found);
  return found;
}

/**
 * The features the markup has and the tree does not.
 *
 * `product` counts as a slideshow: a buy box with `gallery: true` IS PageFly's
 * own media slider, so a product band that came back as a bound product has not
 * lost its carousel — it has gained the native one.
 */
export function missingFeatures(html: string, section: unknown): NativeFeature[] {
  const inTree = featuresInTree(section);
  return featuresInHtml(html).filter((f) => {
    if (inTree.has(f)) return false;
    if (f === "slideshow" && (inTree.has("product") || inTree.has("productList"))) return false;
    if (f === "form" && inTree.has("product")) return false;
    return true;
  });
}

/** The sentence added to a retry, naming what was missed. */
export function retryNote(missing: NativeFeature[]): string {
  return [
    "",
    "YOU MISSED SOMETHING THIS BAND HAS.",
    "",
    ...missing.map((f) => `· The markup contains ${SAY[f]}. Return it as a \`${f}\` node.`),
    "",
    "It is a PageFly element, not a picture of one. Built out of boxes it looks",
    "right and does nothing when a shopper touches it, and the merchant cannot",
    "repair that in the editor. Everything else about your answer was fine —",
    "return the whole band again with this part as the node it is.",
  ].join("\n");
}
