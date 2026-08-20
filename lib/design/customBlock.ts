/* ==========================================================================
   Custom blocks: markup, style and script the model writes itself.

   PageFly's element model does not have a wave divider, an SVG progress ring, a
   marquee or a count-up, and real pages have all of them. Rather than
   approximate with a box or drop the section, the designer can write one — and
   this module is the part that decides what is allowed through.

   THE THREAT MODEL IS NOT A MALICIOUS MODEL. It is an ordinary one, writing
   plausible code, on behalf of a merchant who will import the result into a live
   storefront that takes payments. Neither the model nor the merchant is in a
   position to audit what comes out, so the audit happens here.

   Everything is STRIPPED rather than rejected. A page that loses a decoration is
   better than a page that fails to build — the merchant asked for a page, not
   for a lecture about their reference.
   ========================================================================== */

/** One block's cleaned parts, ready for the renderer and the exporter. */
export type CleanBlock = {
  /** stable per page, e.g. `pfd-c-2` — the scope for css and the hook for js */
  className: string;
  html: string;
  /** every rule prefixed with `.pfd-c-N`, so it cannot reach the rest of the page */
  css: string;
  /** wrapped in an IIFE with `root` bound to this block's element */
  js: string;
};

/* Tags that execute, navigate, or embed something from elsewhere. `form` is
   here because one written by hand posts nowhere — the `form` node exports a
   real Shopify Form2, and a decorative lookalike collecting nothing is worse
   than no form at all. */
const BANNED_TAGS =
  /<\s*\/?\s*(script|iframe|object|embed|form|link|meta|base|applet|frame|frameset|noscript)\b[^>]*>/gi;

/** `<script>alert(1)</script>` — the contents go too, not just the tags. */
const SCRIPT_BLOCK = /<script\b[\s\S]*?<\/\s*script\s*>/gi;

/* `onclick=`, `onerror=`, `onload=`. Quoted, unquoted, spaced — all of them.
   `onerror` on an `<img>` is the oldest accident in the book. */
const EVENT_ATTR = /\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;

/** `href="javascript:…"`, `src="data:text/html,…"` */
const DANGEROUS_URL = /\s(?:href|src|xlink:href)\s*=\s*(?:"|')?\s*(?:javascript|vbscript|data:text\/html)[^"'\s>]*(?:"|')?/gi;

export function cleanHtml(raw: string): string {
  return raw
    .replace(SCRIPT_BLOCK, "")
    .replace(BANNED_TAGS, "")
    .replace(EVENT_ATTR, "")
    .replace(DANGEROUS_URL, "")
    .trim();
}

/**
 * Scope every selector to this block.
 *
 * The model writes `.wave { … }` because that is what its block calls it. Two
 * sections that both chose `.wave` would fight, and either could reach into the
 * merchant's theme and restyle something it has never seen. Prefixed, a block
 * can only style itself.
 */
export function scopeCss(raw: string, className: string): string {
  if (!raw.trim()) return "";
  /* `@import` can pull a whole stylesheet from another origin into a live
     storefront. Keyframes and media queries stay. */
  return scopeRules(raw.replace(/@import[^;]+;/gi, ""), className);
}

/**
 * Prefix every selector in a block of rules.
 *
 * Recursive because at-rules nest: `@media` holds ordinary rules that DO need
 * prefixing, `@keyframes` holds steps (`from`, `0%`) that must not be touched.
 * The first version prefixed the top level and passed anything inside braces
 * through untouched — so `@media (max-width:600px){.wave{…}}` escaped scoping
 * entirely and would have restyled every `.wave` on the merchant's storefront.
 */
function scopeRules(css: string, className: string): string {
  let out = "";
  let i = 0;

  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open === -1) break;

    const prelude = css.slice(i, open).trim();
    const close = matchBrace(css, open);
    if (close === -1) break;

    const body = css.slice(open + 1, close);

    if (/^@(-webkit-)?keyframes\b/i.test(prelude)) {
      /* Steps are not selectors. Whole block, untouched. */
      out += `${prelude}{${body}}`;
    } else if (prelude.startsWith("@")) {
      /* @media, @supports, @layer — the rules inside are ordinary rules. */
      out += `${prelude}{${scopeRules(body, className)}}`;
    } else {
      out += `${scopeSelector(prelude, className)}{${body}}`;
    }
    i = close + 1;
  }

  return out.trim();
}

/** The index of the `}` matching the `{` at `open`, or -1. */
function matchBrace(css: string, open: number): number {
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** `.wave, & > p` -> `.pfd-c-1 .wave,.pfd-c-1 > p` */
function scopeSelector(selector: string, className: string): string {
  return selector
    .split(",")
    .map((s) => {
      const t = s.trim();
      if (!t) return "";
      /* `&` is how the model refers to the block itself. */
      return t.startsWith("&") ? `.${className}${t.slice(1)}` : `.${className} ${t}`;
    })
    .filter(Boolean)
    .join(",");
}

/**
 * Wrap the block's script so it cannot run twice or reach the wrong element.
 *
 * `root` is bound to this block's own node and the whole thing runs inside a
 * function, so a `const` in one block cannot collide with a `const` in another —
 * which it would, because two blocks written by the same model in the same call
 * tend to use the same variable names.
 *
 * try/catch because this runs on the merchant's live storefront. A decoration
 * that throws must not take the rest of the page's scripts down with it.
 */
/**
 * A try/catch around the setup guards the SETUP. It does not guard the
 * callbacks.
 *
 * That gap was live in both readers of a custom block, and the comment above
 * described a protection the code did not provide. A decoration whose JS
 * registered an IntersectionObserver and read `.style` off a null query threw
 * from inside the observer — asynchronously, long after the try/catch had
 * returned — and kept throwing on every scroll. In the preview that was a
 * permanent error badge; on a merchant's storefront it is an uncaught exception
 * on their live page, every time a shopper scrolls past a wave divider.
 *
 * So the callback-registering globals are shadowed for the length of the block
 * with versions that wrap what they are handed. `var` inside the wrapper
 * function shadows the global for that function only — nothing outside the block
 * is touched, which is the property that makes this safe to ship.
 *
 * Element listeners are NOT covered: shimming `addEventListener` means patching
 * `EventTarget.prototype`, which is a global mutation on someone else's
 * storefront and not a trade worth making. Observers and timers are where the
 * failures have actually been.
 */
function guardPrelude(report: string): string {
  return [
    `var __g=function(f){return typeof f!=="function"?f:function(){try{return f.apply(this,arguments)}catch(e){${report}}}};`,
    `var __w=function(N){return N?function(a,b){return new N(__g(a),b)}:N};`,
    `var IntersectionObserver=__w(window.IntersectionObserver);`,
    `var ResizeObserver=__w(window.ResizeObserver);`,
    `var MutationObserver=__w(window.MutationObserver);`,
    `var setTimeout=function(f,t){return window.setTimeout(__g(f),t)};`,
    `var setInterval=function(f,t){return window.setInterval(__g(f),t)};`,
    `var requestAnimationFrame=function(f){return window.requestAnimationFrame(__g(f))};`,
  ].join("");
}

/**
 * The block's JS as it ships to the storefront.
 *
 * Silent on failure. This runs on a page the merchant is selling from, and a
 * console full of warnings from a wave divider is noise they cannot act on.
 */
export function wrapJs(raw: string, className: string): string {
  if (!raw.trim()) return "";
  return [
    `(function(){try{`,
    guardPrelude(""),
    `var root=document.querySelector(".${className}");`,
    `if(!root)return;`,
    raw.trim(),
    `}catch(e){}})();`,
  ].join("\n");
}

/**
 * The same JS, for the preview, where a failure IS worth saying out loud.
 *
 * `root` is passed in rather than queried: four device frames render the same
 * page at once, and a document-wide lookup finds the desktop one from inside the
 * phone.
 */
export function previewJs(raw: string): string {
  return [
    guardPrelude(`console.warn("[custom block] callback failed:",e)`),
    raw.trim(),
  ].join("\n");
}

/** Everything one block needs, cleaned and scoped. */
export function cleanBlock(
  block: { html: string; stylesheet?: string; js?: string },
  index: number,
): CleanBlock {
  const className = `pfd-c-${index}`;
  return {
    className,
    html: cleanHtml(block.html),
    css: scopeCss(block.stylesheet ?? "", className),
    js: wrapJs(block.js ?? "", className),
  };
}
