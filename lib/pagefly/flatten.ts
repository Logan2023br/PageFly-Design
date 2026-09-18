"use client";

/* ==========================================================================
   Computed styles, written back as inline styles.

   WHY THIS EXISTS. `fromDom.ts` copies `getAttribute("style")` verbatim, and
   that is the right thing to do for the React mockup: it renders with inline
   styles exclusively, so the attribute already holds the exact CSS that drew
   the picture and there is nothing to infer.

   A page the build model wrote as HTML is the opposite. Measured on the first
   one: 373 `class=` against 60 `style=`, one `<style>` block, three `@media`
   queries. Read through the inline attribute that page exports as a handful of
   empty boxes — 21 elements and 5,449 characters of CSS for a ten-section page.

   So this module flattens: it asks the browser what each element ACTUALLY
   resolved to and writes that back into the inline attribute, after which the
   existing converter runs unchanged and sees the page it expects. The whole
   media-query cascade collapses into concrete values at the width it was
   measured at, which is also why it is run once per breakpoint.

   TWO THINGS MAKE IT USABLE RATHER THAN ENORMOUS.

   A PROBE, not a default table. `getComputedStyle` answers for all ~340
   properties whether they were set or not, and most of the answers are
   inherited or initial. So each element is compared against a bare element of
   the same tag inserted as its sibling: same parent, same inherited context, no
   classes. Anything that matches the probe was not this element's doing and is
   dropped. Inherited font and colour fall away by themselves, and the ones the
   element genuinely sets survive — which is the distinction a fixed default
   table cannot make, because "the default" depends on where the element sits.

   A LIST, not everything. Even against a probe, some properties differ for
   reasons that are not design — `perspective-origin` is half the element's own
   box, so it differs whenever the sizes do. `VISUAL` below is the set that
   decides what a page looks like; anything outside it is noise this file is not
   going to carry into a .pagefly.

   MEASURE EVERYTHING FIRST, THEN WRITE. Writing an inline style changes layout,
   and a layout change moves every element measured after it. So the walk
   collects into a list and the list is applied afterwards, in one pass.
   ========================================================================== */

/**
 * The properties that decide what a page looks like.
 *
 * `width` and `height` are deliberately absent. Computed values for those are
 * resolved pixels, and pinning every box to the pixel it happened to occupy
 * makes a page that cannot reflow and cannot be edited — PageFly's Flex engine
 * wants `fill` / `hug` / `fixed`, which `fromDom`'s `widthMode` already works
 * out from the laid-out geometry. `max-width`, `min-height` and `aspect-ratio`
 * stay because they are constraints the author wrote rather than results.
 */
const VISUAL = [
  // box and flow
  "display", "position", "top", "right", "bottom", "left", "z-index", "float",
  "overflow-x", "overflow-y", "visibility", "box-sizing",
  // flex
  "flex-direction", "flex-wrap", "justify-content", "align-items", "align-content",
  "align-self", "flex-grow", "flex-shrink", "flex-basis", "order",
  "row-gap", "column-gap",
  // grid, kept so the converter can see and drop it deliberately
  "grid-template-columns", "grid-template-rows", "grid-auto-flow",
  "grid-column", "grid-row",
  /* `width` IS IN THE LIST, and the probe is what makes that safe.

     It was left out on the reasoning that a computed width is a result rather
     than a decision — pin it and the page stops reflowing. True of a block that
     simply fills its parent, and the probe drops exactly those: a bare div in
     the same parent computes the same width, so the two match and nothing is
     written. What survives is width the element actually decided — a `<table>`
     set to 100%, which shrinks to its content without it. Measured, the size
     charts came out 119px narrow and 407px left of where they belong. */
  "width",
  // size constraints, not results
  "max-width", "min-width", "min-height", "max-height", "aspect-ratio",
  // spacing
  "margin-top", "margin-right", "margin-bottom", "margin-left",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  // type
  "color", "font-family", "font-size", "font-weight", "font-style",
  "line-height", "letter-spacing", "word-spacing", "text-align",
  "text-transform", "text-decoration-line", "text-decoration-color",
  "white-space", "word-break", "overflow-wrap", "text-indent", "text-shadow",
  "font-variant-numeric", "font-feature-settings",
  // paint
  "background-color", "background-image", "background-size",
  "background-position", "background-repeat", "background-attachment",
  "opacity", "box-shadow", "mix-blend-mode", "filter", "backdrop-filter",
  // border
  "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
  "border-top-style", "border-right-style", "border-bottom-style", "border-left-style",
  "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
  "border-top-left-radius", "border-top-right-radius",
  "border-bottom-right-radius", "border-bottom-left-radius",
  // the rest
  "transform", "transform-origin", "transition", "object-fit", "object-position",
  "list-style-type", "cursor", "writing-mode", "text-orientation",
] as const;

/* Measured separately and written as a FLOOR, not a size.

   `height` was left out of `VISUAL` on the reasoning that a computed height is
   a result rather than a decision, and pinning results makes a page that cannot
   reflow. True of width. Not true of height: a band that states `height:520px`
   or `min-height:94vh` is stating a decision, and dropping it let the band
   collapse to its content — which is why elements came out the right height
   individually (146 of 198 within 2px) while their positions drifted by up to
   270px, each collapsed container moving everything below it.

   Written as `min-height` rather than `height` so content that needs more room
   still gets it, which is what keeps the page editable afterwards. */


/* ==========================================================================
   THE PROBE IS FOR INHERITANCE, AND ONLY FOR INHERITANCE.

   It answers one question well: did this element SET this value, or did it
   receive it from an ancestor? That question only exists for inherited
   properties. For every other one the answer is already known — an element that
   sets nothing has the initial value, and `isNothing` drops those.

   Used on a non-inherited property the probe does not merely add nothing, it
   subtracts: a probe is a bare element of the same tag in the same parent, so
   any selector that reaches it by tag reaches the probe too. `.menu-toggle
   .bars i{background:var(--ink)}` matched both, the background was called
   "inherited" and dropped, and the mobile menu's three hairlines rendered
   transparent — present, positioned to the pixel, invisible.
   ========================================================================== */
const INHERITED = new Set([
  "color", "font-family", "font-size", "font-style", "font-weight",
  "font-variant-numeric", "font-feature-settings", "letter-spacing",
  "line-height", "word-spacing", "text-align", "text-indent", "text-transform",
  "text-shadow", "white-space", "word-break", "overflow-wrap", "visibility",
  "cursor", "list-style-type", "writing-mode", "text-orientation",
]);

/** Properties a probe must never cancel.

    A probe cancels what an element merely inherited, which is right for values
    that describe the element alone. `z-index` does not: it describes where the
    element sits RELATIVE to its siblings, and cancelling it on one side of a
    relationship breaks the relationship. `.hero > *{z-index:2}` matches the
    probe as readily as the content, so the content's z-index was dropped as
    "not this element's doing" — and the background layer, which kept its own
    z-index because it is a pseudo-element no child selector can reach, painted
    over the headline. `display` and `position` are here for the same reason:
    silence in the export means PageFly's default, not the browser's. */
const ALWAYS_COMPARE = new Set([
  "display", "flex-direction", "position", "z-index",
  /* TYPOGRAPHY, BECAUSE THE TAG HAS AN OPINION. Inheritance is not the only
     thing that sets these — the user agent does too, and differently per tag.
     An `<h2>` defaults to bold at 1.5em, so a heading the page sets back to 400
     matches its parent exactly, is cancelled as "inherited", and comes out bold
     in the export where the tag's default takes over again. Stating them costs
     one declaration and removes a whole class of silent difference. */
  "font-weight", "font-size", "font-style", "font-family", "line-height",
]);

const OFFSETS = new Set(["top", "right", "bottom", "left"]);

/** A value that says "nothing here" and is not worth a declaration. */
function isNothing(prop: string, value: string): boolean {
  /* `z-index: 0` is a decision — it puts the element in the positioned layer at
     the bottom of it, which is exactly where a background pseudo-element wants
     to be. Dropped as "zero", the hero's photograph painted over its own
     headline. */
  if (prop === "z-index") return value === "" || value === "auto";
  /* `inset: 0` computes to four zeroes, and a zero offset is a POSITION, not an
     absence — it pins the edge. Dropped as "nothing", an absolutely positioned
     layer falls back to its static position: the hero's scrim, which should
     cover the band, landed at the bottom of it because it is the last child. */
  if (OFFSETS.has(prop)) return value === "" || value === "auto";
  /* `opacity: 0` is how a page hides something it intends to show later — the
     mobile menu's scrim, a reveal before its class lands. Dropped as "zero", a
     `position: fixed` scrim at `rgba(18,16,12,.45)` came back fully opaque and
     laid a grey sheet over every section below the fold. */
  if (prop === "opacity") return value === "";
  /* `overflow: auto` is a scroller, not an absence. The initial value is
     `visible`, so that is the only one worth dropping — and dropping `auto` is
     what turned the product carousel into a row of cards spilling out of a
     31px box and made the page 610px wide at a 390px viewport. */
  if (prop === "overflow-x" || prop === "overflow-y")
    return value === "" || value === "visible";
  if (value === "" || value === "none" || value === "normal" || value === "auto")
    return prop !== "display";
  if (/^0(px)?$/.test(value)) return true;
  if (value === "rgba(0, 0, 0, 0)" || value === "transparent") return true;
  return false;
}

/** Tags a probe must not be built from — replaced elements measure their own
    intrinsic size and a bare one of the same tag answers about nothing.
    
    Matched on the UPPERCASED name, because SVG and MathML elements keep the
    case they were written in: `tagName` is "svg", not "SVG", and a set of
    upper-case names silently misses every one of them. */
const REPLACED_TAGS = new Set(["IMG", "VIDEO", "IFRAME", "CANVAS", "SVG", "OBJECT", "EMBED"]);
const isReplaced = (el: Element): boolean => REPLACED_TAGS.has(el.tagName.toUpperCase());

/* ==========================================================================
   PSEUDO-ELEMENTS, MADE REAL.

   `::before` and `::after` paint, take up space, and are invisible to every
   walk of the DOM — there is no node to visit and no attribute to copy. On the
   first real page the hero's photograph was one: `.hero::before{content:"";
   position:absolute;inset:0;background:#12100C url(…) center 22%/cover}`. The
   export came back with the band and without the picture, and nothing in the
   converter could have known.

   So they are materialised into real children before anything is measured: a
   div carrying the pseudo-element's own computed style, inserted first for
   `::before` and last for `::after`. Layout does not move, because the styles
   that placed the pseudo-element place the div the same way.

   Only when there is something to make real. A pseudo-element with no `content`
   does not exist, and one that is `display:none` was switched off on purpose.
   `content` itself is dropped from the copy — a div renders its children, not
   its `content` — and text content is carried over as the div's own text.
   ========================================================================== */
function materialisePseudos(root: HTMLElement, view: Window): number {
  let made = 0;
  const doc = root.ownerDocument;
  /* Collected before any insertion: the list must not grow while it is walked,
     or a materialised div gets asked about its own pseudo-elements for ever. */
  const targets = [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))].filter(
    (el) => !SKIP.has(el.tagName) && !isReplaced(el),
  );

  for (const el of targets) {
    for (const which of ["::before", "::after"] as const) {
      const cs = view.getComputedStyle(el, which);
      const content = cs.getPropertyValue("content");
      if (!content || content === "none" || content === "normal") continue;
      if (cs.getPropertyValue("display") === "none") continue;

      const div = doc.createElement("div");
      div.setAttribute("data-pf-pseudo", which.slice(2));
      /* A quoted string is text the pseudo-element shows; `""` and anything
         else (counters, attr(), an image) leaves the div empty. */
      const quoted = /^"(.*)"$/.exec(content);
      if (quoted && quoted[1]) div.textContent = quoted[1];

      const out: string[] = [];
      for (const prop of VISUAL) {
        const value = cs.getPropertyValue(prop);
        if (!value || isNothing(prop, value)) continue;
        out.push(`${prop}: ${value}`);
      }
      /* The box itself, which VISUAL leaves out everywhere else on purpose —
         here there is no element to measure, so the used size IS the size. */
      for (const prop of ["width", "height"]) {
        const value = cs.getPropertyValue(prop);
        if (value && value !== "auto" && value !== "0px") out.push(`${prop}: ${value}`);
      }
      div.setAttribute("style", out.join("; ") + ";");

      if (which === "::before") el.insertBefore(div, el.firstChild);
      else el.appendChild(div);
      made++;
    }
  }
  return made;
}

type Pending = { el: HTMLElement; css: string };

/**
 * Flatten one laid-out document so `fromDom` can read it.
 *
 * Call it on the body of a frame that has finished laying out, once per
 * breakpoint, before converting. It rewrites inline `style` attributes and
 * returns how many elements it touched.
 */
export function flattenComputedStyles(root: HTMLElement): number {
  const view = root.ownerDocument?.defaultView;
  if (!view?.getComputedStyle) return 0;

  /* First, because a pseudo-element that becomes a div must be measured like
     every other div — and because inserting one after the measuring pass would
     invalidate every number it produced. */
  materialisePseudos(root, view);

  /* A materialised pseudo-element already carries the exact style the browser
     computed FOR THE PSEUDO, and re-reading it as an ordinary element gets a
     different answer: selectors that never matched a pseudo-element match a div
     the moment it becomes one. `.hero > *{z-index:2}` is the case that showed
     it — in the source that rule cannot reach `::before`, and the photograph
     sits behind the headline because of it. Made real and re-measured, the div
     inherited z-index 2 and painted over the words. */
  const all = [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))].filter(
    (el) => !SKIP.has(el.tagName) && !el.hasAttribute("data-pf-pseudo"),
  );

  /* WHAT THE PARENT ALREADY SAYS.

     An inherited property needs one question answered: did this element set it,
     or receive it? That is exactly "does it differ from the parent's computed
     value", and asking the parent answers it with no room for error.

     The earlier version asked a PROBE — a bare element of the same tag inserted
     as a sibling — which is a good approximation and fails on the one case that
     matters: a selector that reaches the element by tag reaches the probe too.
     `.menu-toggle .bars i{background:var(--ink)}` matched both and the mobile
     menu's hairlines came out transparent; `.main-nav a{text-transform:
     uppercase}` matched both and the navigation lost its capitals. The parent
     cannot be matched by a selector meant for the child, so it cannot lie.

     Non-inherited properties are not asked at all: an element that sets nothing
     has the initial value, and `isNothing` drops those already. */
  const inheritedFrom = new Map<Element, CSSStyleDeclaration>();
  const parentStyle = (el: HTMLElement): CSSStyleDeclaration | null => {
    const parent = el.parentElement;
    if (!parent || el === root) return null;
    let cs = inheritedFrom.get(parent);
    if (!cs) {
      cs = view.getComputedStyle(parent);
      inheritedFrom.set(parent, cs);
    }
    return cs;
  };

  const pending: Pending[] = [];
  for (const el of all) {
    const computed = view.getComputedStyle(el);
    const inherited = parentStyle(el);
    const out: string[] = [];

    for (const prop of VISUAL) {
      const value = computed.getPropertyValue(prop);
      if (!value) continue;
      if (
        inherited &&
        INHERITED.has(prop) &&
        value === inherited.getPropertyValue(prop) &&
        !ALWAYS_COMPARE.has(prop)
      )
        continue;
      if (isNothing(prop, value)) continue;
      out.push(`${prop}: ${value}`);
    }

    /* THE BOX, for the two cases where a computed size is a decision.

       A REPLACED ELEMENT sizes itself. An `<svg>` with a viewBox and no width
       scales to whatever box it is given, and the box it was given came from
       CSS that is no longer there — measured, the trust strip's 48px icons came
       out 230px tall and pushed everything below them 267px down the page. So
       replaced elements keep both dimensions exactly.

       EVERYTHING ELSE keeps its height as a FLOOR. A band that states a height
       is stating a decision and dropping it let the band collapse to its
       content; writing it as `min-height` honours the decision while leaving
       room for content that needs more. Width stays out — that one really is a
       result, and pinning it is what stops a page reflowing. */
    if (isReplaced(el)) {
      for (const prop of ["width", "height"] as const) {
        const v = computed.getPropertyValue(prop);
        if (v && v !== "auto" && !/^0(\.0+)?px$/.test(v)) out.push(`${prop}: ${v}`);
      }
    } else {
      /* A height, written as a floor. Measured per breakpoint, so each width
         carries its own — a band that states `min-height:94vh` is stating a
         decision, and dropping it let the band collapse to its content. */
      const h = computed.getPropertyValue("height");
      if (h && h !== "auto" && !/^0(\.0+)?px$/.test(h)) out.push(`min-height: ${h}`);
    }

    /* The element's own inline declarations win: they were written by the
       author with intent, and a computed value is only ever a restatement of
       one. Appended last so they are the last word in the same string. */
    const own = el.getAttribute("style");
    if (own && own.trim()) out.push(own.trim().replace(/;\s*$/, ""));

    /* THE FULL SET, KEPT ASIDE. The probe cancels whatever the element merely
       inherited, which is right — the export mirrors the source tree, so the
       same inheritance reaches the same elements. It is right only if it
       cancels the SAME properties at every width, and it does not: a media
       query that restyles a bare tag restyles the probe too, so at 390px the
       hero headline's `font-size` matched its probe and was dropped, while at
       1440px it did not and was kept. The breakpoints then disagree about which
       properties exist, and a property stated at one width and silent at
       another keeps the first width's value at both — the headline stayed at
       95px on a 390px screen and ran off the side of it.
       
       `fromDom` fills those gaps from here, where nothing has been cancelled. */
    const full: string[] = [];
    for (const prop of VISUAL) {
      const value = computed.getPropertyValue(prop);
      /* ZEROES INCLUDED. This set exists so `fromDom` can fill a property one
         breakpoint states and another does not, and the value that usually has
         to be filled IS a zero: a block centred by `margin: 0 auto` computes
         130px of margin at 1440 and 0 at 390, the zero is dropped as "nothing",
         and the desktop margin then shifts the block 102px right on a phone.
         Filtering here would leave exactly the hole it is meant to close. */
      if (value) full.push(`${prop}: ${value}`);
    }
    el.setAttribute("data-pf-full", full.join("; "));

    if (out.length) pending.push({ el, css: `${out.join("; ")};` });
  }

  for (const { el, css } of pending) el.setAttribute("style", css);
  return pending.length;
}

const SKIP = new Set(["SCRIPT", "STYLE", "LINK", "META", "TITLE", "HEAD", "NOSCRIPT"]);

