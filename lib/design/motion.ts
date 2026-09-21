import type { Anim } from "./schema";

/* ==========================================================================
   Motion, defined once.

   The mockup and the exported page have to move identically, and the only way
   to guarantee that is for both to read the same strings. The class names, the
   keyframes and the observer below are shipped verbatim into the .pagefly
   file's custom CSS and custom JS, and the preview injects the same CSS and
   runs the same observer. Not "equivalent" — the same source.

   NAMES ARE LONG ON PURPOSE. These were `pfa-r`, `pfa-in`, `pfa-h-float` —
   short, tidy, and straight into PageFly's own namespace: `pfa-` is its icon
   font (`pfa-arrow`, `pfa-plus`, `pfa-minus`, see fields.md on the accordion
   icon), and every class in it carries a `:before{content}` glyph. `.pfa-r`
   turned out to exist and to render `\52`, so every revealing section in the
   editor grew a small letter R above it.

   Nothing warned about that, and nothing could have: the collision only shows
   up inside PageFly's own stylesheet, which is not in the reference and not in
   this repo. So the defence is not cleverness but length — `pfd-reveal` and
   `pfd-motion-ready` are hard to collide with by accident in a way that
   `pfa-r` was not. Do not shorten them.
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
  return a?.hover ? `pfd-hover-${a.hover}` : null;
}

export function revealClass(a: Anim): string | null {
  return a?.reveal ? `pfd-reveal-${a.reveal}` : null;
}

/** Every class this node needs, ready to join with a space. */
export function motionClasses(a: Anim): string[] {
  const out: string[] = [];
  const h = hoverClass(a);
  const r = revealClass(a);
  if (h) out.push(h);
  if (r) {
    out.push("pfd-reveal", r);
    if (a?.delay) out.push(`pfd-delay-${a.delay}`);
  }
  return out;
}

/**
 * Does the design state the motion's own numbers?
 *
 * `fade-up` says WHAT; these say how far, how long, and on what curve. A
 * mockup states all of them and this file used to decide all of them.
 */
export function hasExactMotion(a: Anim): boolean {
  return Boolean(
    a &&
      (a.ms !== undefined ||
        a.delayMs !== undefined ||
        a.distance !== undefined ||
        a.easing ||
        a.hoverCss),
  );
}

/**
 * Does the design state the hover itself, rather than name one of the six?
 *
 * When it does, the element takes a rule of its own and PageFly's
 * `animationHover` is left alone — both at once stack two transforms and the
 * thing travels twice as far.
 */
export function hasExactHover(a: Anim): boolean {
  return Boolean(a?.hoverCss);
}

/** A class naming this exact motion, so two nodes with the same one share a rule. */
export function exactClass(a: Anim): string {
  const key =
    `${a?.ms ?? ""}-${a?.delayMs ?? ""}-${a?.distance ?? ""}-${a?.easing ?? ""}` +
    /* The hover belongs in the key too, or two elements that share a duration
       and differ in what they do on hover would share one rule and one of them
       would get the other's motion. */
    `-${a?.hoverCss ? JSON.stringify(a.hoverCss) : ""}`;
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `pfd-m-${key.replace(/[^a-zA-Z0-9]+/g, "").slice(0, 18) || "0"}${a?.hoverCss ? h.toString(36) : ""}`;
}

/**
 * The override rules for one exact motion.
 *
 * WRITTEN AGAINST THE NODE'S OWN CLASS so it outranks the shared one, and the
 * transform carries `:not(.pfd-revealed)`. Without that the start position and
 * the reset that clears it are both three classes deep, order decides, and the
 * later rule — this one — wins even after the element has arrived: it would
 * animate to its own start position and stop there.
 */
export function exactCss(cls: string, a: Anim): string {
  if (!a) return "";
  const timing: string[] = [];
  if (a.ms !== undefined) timing.push(`transition-duration:${a.ms}ms`);
  if (a.easing) timing.push(`transition-timing-function:${a.easing}`);
  if (a.delayMs !== undefined) timing.push(`transition-delay:${a.delayMs}ms`);

  const out: string[] = [];
  if (timing.length) out.push(`.pfd-motion-ready .${cls}{${timing.join(";")};}`);

  /* Only the reveal the design actually stated — a distance written onto every
     kind would put a pixel value inside a `scale()`. */
  const d = a.distance;
  if (d !== undefined && a.reveal) {
    const shape: Record<string, string> = {
      "fade-up": `translateY(${d}px)`,
      "slide-left": `translateX(-${d}px)`,
      "slide-right": `translateX(${d}px)`,
    };
    const t = shape[a.reveal];
    if (t) {
      out.push(
        `.pfd-motion-ready .${cls}.pfd-reveal-${a.reveal}:not(.pfd-revealed){transform:${t};}`,
      );
    }
  }
  /* ======================================================================
     THE HOVER THE MOCKUP ACTUALLY DRAWS.

     `animationHover` gives PageFly's float, on PageFly's curve, over PageFly's
     distance, and the merchant can edit it in the panel — the right trade
     until a mockup states its own, at which point the canned one is the wrong
     motion. Written here, the transition covers `transform` and `box-shadow`
     because those are what a hover changes; anything else the design declared
     rides along on `all` being absent by simply being set on both states.
     ====================================================================== */
  if (a.hoverCss) {
    const ms = a.ms ?? 250;
    const ease = a.easing ?? "ease";
    out.push(`.${cls}{transition:transform ${ms}ms ${ease},box-shadow ${ms}ms ${ease};}`);
    out.push(`.${cls}:hover{${declarationsOf(a.hoverCss)}}`);
    out.push(
      `@media (prefers-reduced-motion: reduce){.${cls}{transition:none;}.${cls}:hover{transform:none;}}`,
    );
  }

  return out.join("\n");
}

/** `{boxShadow: "…"}` → `box-shadow: …;` — the same shape `toPagefly` writes. */
function declarationsOf(css: Record<string, string | number>): string {
  return Object.entries(css)
    .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}:${v};`)
    .join("");
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
  `.pfd-hover-float,.pfd-hover-shadow,.pfd-hover-grow,.pfd-hover-glow,.pfd-hover-float-shadow,.pfd-hover-grow-shadow{transition:transform .25s ease,box-shadow .25s ease;}`,
  ...PAGEFLY_HOVERS.map((h) => `.pfd-hover-${h}:hover{${HOVER_CSS[h]}}`),

  /* reveal — EVERY rule below is gated behind `.pfd-motion-ready` on <html>, which the
     script adds as its first act.

     Ungated, `.pfd-reveal{opacity:0}` is a promise that some JavaScript will arrive
     to undo it. PageFly's editor does not run custom JS — its own animation
     panel says as much — so in the editor that promise is never kept and the
     section is simply gone: present in the layer tree, invisible on the canvas,
     with nothing to suggest why. The merchant sees a hole in the page they
     just built.

     Gated, the failure mode inverts. No script, no `.pfd-motion-ready`, no hiding:
     the page renders complete and still. Motion becomes something the page
     gains when the script runs rather than something it needs the script to
     survive. */
  `.pfd-motion-ready .pfd-reveal{opacity:0;transition:opacity .7s cubic-bezier(.22,.61,.36,1),transform .7s cubic-bezier(.22,.61,.36,1);will-change:opacity,transform;}`,
  `.pfd-motion-ready .pfd-reveal-fade-up{transform:translateY(28px);}`,
  `.pfd-motion-ready .pfd-reveal-slide-left{transform:translateX(-32px);}`,
  `.pfd-motion-ready .pfd-reveal-slide-right{transform:translateX(32px);}`,
  `.pfd-motion-ready .pfd-reveal-zoom{transform:scale(.94);}`,
  `.pfd-motion-ready .pfd-reveal.pfd-revealed{opacity:1;transform:none;}`,

  /* stagger — 80ms a step, six steps at most. Past about half a second a
     visitor stops reading it as one group arriving and starts waiting. */
  ...[1, 2, 3, 4, 5, 6].map((i) => `.pfd-delay-${i}{transition-delay:${i * 80}ms;}`),

  `@media (prefers-reduced-motion: reduce){.pfd-motion-ready .pfd-reveal,.pfd-motion-ready .pfd-reveal.pfd-revealed{opacity:1;transform:none;transition:none;}` +
    `.pfd-hover-float,.pfd-hover-shadow,.pfd-hover-grow,.pfd-hover-glow,.pfd-hover-float-shadow,.pfd-hover-grow-shadow{transition:none;}}`,
].join("\n");

/**
 * The observer, as it ships inside the page.
 *
 * Guards, in the order they matter:
 *
 * - runs once per page even if the snippet is injected twice (PageFly custom JS
 *   can re-run on editor preview refresh)
 * - arms the CSS by adding `.pfd-motion-ready`, and only once it is certain it can
 *   also disarm it — so the page is never left hidden by a stylesheet whose
 *   script did not arrive
 * - if IntersectionObserver is missing, nothing is armed at all: the page
 *   renders complete and still rather than blank
 * - a MutationObserver picks up elements PageFly renders late — product grids
 *   and anything inside a slideshow arrive after first paint
 * - unobserves on reveal, so a long page does not keep hundreds of live entries
 */
export const MOTION_JS = `(function(){
  if (window.__pfdMotion) return;
  window.__pfdMotion = 1;
  var show = function(el){ el.classList.add('pfd-revealed'); };
  /* Bail BEFORE arming. Adding .pfd-motion-ready and then finding no way to reveal
     anything is the one outcome worse than no animation at all. */
  if (!('IntersectionObserver' in window)) return;
  document.documentElement.classList.add('pfd-motion-ready');
  var io = new IntersectionObserver(function(entries){
    entries.forEach(function(e){
      if (!e.isIntersecting) return;
      show(e.target);
      io.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
  var scan = function(){
    document.querySelectorAll('.pfd-reveal:not(.pfd-revealed)').forEach(function(el){ io.observe(el); });
  };
  scan();
  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
})();`;
