import type { Anim } from "./schema";

/* ==========================================================================
   Motion, defined once.

   The mockup and the exported page have to move identically, and the only way
   to guarantee that is for both to read the same strings. The class names, the
   keyframes and the observer below are shipped verbatim into the .pagefly
   file's custom CSS and custom JS, and the preview injects the same CSS and
   runs the same observer. Not "equivalent" — the same source.

   Everything is namespaced `pfa-` so nothing here can collide with the
   merchant's theme, with PageFly's own classes, or with the `pf-` prefix the
   platform uses.
   ========================================================================== */

/** Six values, and they are PageFly's, not ours — see fields.md → Button2. */
export const PAGEFLY_HOVERS = [
  "float",
  "shadow",
  "grow",
  "glow",
  "float-shadow",
  "grow-shadow",
] as const;

/** Elements whose `animationHover` field PageFly actually reads. Anywhere else
    the same motion has to be written as a `&:hover` rule by hand. */
export const HOVER_NATIVE_TYPES = new Set([
  "Button2",
  "ContentListItem",
  "Form2.Button2",
  "ProductATC2",
]);

export function hoverClass(a: Anim): string | null {
  return a?.hover ? `pfa-h-${a.hover}` : null;
}

export function revealClass(a: Anim): string | null {
  return a?.reveal ? `pfa-r-${a.reveal}` : null;
}

/** Every class this node needs, ready to join with a space. */
export function motionClasses(a: Anim): string[] {
  const out: string[] = [];
  const h = hoverClass(a);
  const r = revealClass(a);
  if (h) out.push(h);
  if (r) {
    out.push("pfa-r", r);
    if (a?.delay) out.push(`pfa-d-${a.delay}`);
  }
  return out;
}

export function hasMotion(a: Anim): boolean {
  return Boolean(a?.hover || a?.reveal);
}

/**
 * The hand-written equivalent of one `animationHover` value.
 *
 * Needed because only four PageFly element types carry the field. A hover on a
 * card, an image or a whole row has to be written out, and it must land on the
 * same pixels as the canned version or a page would animate one way in the
 * mockup and another after import.
 */
export const HOVER_CSS: Record<string, string> = {
  float: "transform: translateY(-4px);",
  shadow: "box-shadow: 0 12px 28px rgba(0,0,0,.16);",
  grow: "transform: scale(1.03);",
  glow: "box-shadow: 0 0 0 4px rgba(0,0,0,.06), 0 8px 24px rgba(0,0,0,.12);",
  "float-shadow": "transform: translateY(-4px); box-shadow: 0 12px 28px rgba(0,0,0,.16);",
  "grow-shadow": "transform: scale(1.03); box-shadow: 0 12px 28px rgba(0,0,0,.16);",
};

/**
 * The whole motion stylesheet.
 *
 * Written flat, without nesting or custom properties, because it is read by
 * PageFly's custom-CSS field and by the storefront theme's own pipeline as well
 * as by the preview, and the oldest of those is the one that decides what is
 * safe to use.
 *
 * `prefers-reduced-motion` is not a nicety here. A page that slides six
 * sections into view is unusable for someone who set that flag, and the
 * merchant importing this page never gets asked about it.
 */
export const MOTION_CSS = [
  /* hover — every element gets a transition, the six variants set the target */
  `.pfa-h-float,.pfa-h-shadow,.pfa-h-grow,.pfa-h-glow,.pfa-h-float-shadow,.pfa-h-grow-shadow{transition:transform .25s ease,box-shadow .25s ease;}`,
  ...PAGEFLY_HOVERS.map((h) => `.pfa-h-${h}:hover{${HOVER_CSS[h]}}`),

  /* reveal — the resting state is the animated-out state, and `.pfa-in` is what
     the observer adds. Elements start invisible, so the JS below is not
     optional: if it never runs, nothing on the page is readable. The
     `no-js` guard at the end of MOTION_JS is what covers that. */
  `.pfa-r{opacity:0;transition:opacity .7s cubic-bezier(.22,.61,.36,1),transform .7s cubic-bezier(.22,.61,.36,1);will-change:opacity,transform;}`,
  `.pfa-r-fade-up{transform:translateY(28px);}`,
  `.pfa-r-slide-left{transform:translateX(-32px);}`,
  `.pfa-r-slide-right{transform:translateX(32px);}`,
  `.pfa-r-zoom{transform:scale(.94);}`,
  `.pfa-r.pfa-in{opacity:1;transform:none;}`,

  /* stagger — 80ms a step, six steps at most. Past about half a second a
     visitor stops reading it as one group arriving and starts waiting. */
  ...[1, 2, 3, 4, 5, 6].map((i) => `.pfa-d-${i}{transition-delay:${i * 80}ms;}`),

  `@media (prefers-reduced-motion: reduce){.pfa-r,.pfa-r.pfa-in{opacity:1;transform:none;transition:none;}` +
    `.pfa-h-float,.pfa-h-shadow,.pfa-h-grow,.pfa-h-glow,.pfa-h-float-shadow,.pfa-h-grow-shadow{transition:none;}}`,
].join("\n");

/**
 * The observer, as it ships inside the page.
 *
 * Guards, in the order they matter:
 *
 * - runs once per page even if the snippet is injected twice (PageFly custom JS
 *   can re-run on editor preview refresh)
 * - if IntersectionObserver is missing, everything is revealed immediately
 *   rather than left at `opacity: 0` forever
 * - a MutationObserver picks up elements PageFly renders late — product grids
 *   and anything inside a slideshow arrive after first paint
 * - unobserves on reveal, so a long page does not keep hundreds of live entries
 */
export const MOTION_JS = `(function(){
  if (window.__pfaRevealed) return;
  window.__pfaRevealed = 1;
  var show = function(el){ el.classList.add('pfa-in'); };
  if (!('IntersectionObserver' in window)) {
    document.querySelectorAll('.pfa-r').forEach(show);
    return;
  }
  var io = new IntersectionObserver(function(entries){
    entries.forEach(function(e){
      if (!e.isIntersecting) return;
      show(e.target);
      io.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
  var scan = function(){
    document.querySelectorAll('.pfa-r:not(.pfa-in)').forEach(function(el){ io.observe(el); });
  };
  scan();
  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
})();`;
