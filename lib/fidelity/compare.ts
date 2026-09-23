import "server-only";

import { decodePng, ssim } from "./png";
import type { Session } from "./chrome";

/* ==========================================================================
   TWO RENDERINGS OF ONE PAGE, COMPARED.

   WHAT THIS MEASURES, AND WHAT IT CANNOT.

   It was built to gate an export on per-band pixel similarity, and the first
   thing it was pointed at settled that question the other way. Rendering
   `public/showcase/hexwood/home.pagefly` through `scripts/preview-pagefly.ts`
   and comparing it band by band against `home.html` — which is PAGEFLY'S OWN
   RENDER OF THAT SAME FILE — scores:

       with a photograph in the band   mean SSIM 0.51
       without                          mean SSIM 0.69
       worst band                             0.16

   Same input. Same design. Two renderers. To a reader the two pages are the
   same page; the hero differs only in how far the background photo is cropped
   and whether the buttons carry an arrow. SSIM does not see that: a two per
   cent shift in `background-size` moves every pixel under it, and the score
   collapses while the design is untouched.

   So a pixel threshold anywhere near 1.0 does not measure whether a band was
   transcribed faithfully. It measures how closely two renderers agree, and the
   answer to that is: not closely.

   THE DOM DIFF DOES WORK. On the same pair: 202 of 213 text nodes matched by
   content, 4 font sizes different, 3 families, 2 colours — and each one named,
   with both values. That is a list a model can act on, which is what the repair
   round needs; `SSIM 0.34` is not.

   Hence the shape here: the DOM diff is the finding, and SSIM rides along as a
   coarse second opinion. Neither is a gate on its own.
   ========================================================================== */

/* ==========================================================================
   WHAT NEITHER SIDE CAN BE HELD TO.

   `scripts/preview-pagefly.ts` says so in its own header: the widgets PageFly
   draws with its own runtime — sliders, tabs, countdowns, product lists bound to
   a live store — come out of it as static boxes. So every digit of a countdown,
   every card of a product grid and every slide past the first is "missing" from
   our render of a file that is perfectly correct.

   Measured across the seven Hexwood pages, that is most of the noise: 352
   missing text nodes and 59 missing images, against 4 colour differences. A
   diff that reports those is a diff nobody can act on.

   So anything inside one of these is compared on its BOX and nothing else, and
   counted as unverified rather than as agreeing. Point six of the brief, and
   the measurement agrees with it.
   ========================================================================== */
const RUNTIME_DRAWN =
  /\b(Tabs|TabHeader|TabsMenu|TabsContent|TabContent|Slideshow|SlideshowSlide|Slider|CountDown|Countdown|CountdownNumber|CountdownLabel|ProductList|ProductBox|ProductMedia|MediaList|MediaMain|ProductPrice|ProductATC|ProductBadge|ProductVendor|ProductTitle|Quantity|Form2|Accordion3|Article|Collection|Blog)/;

export type TextBox = {
  text: string;
  tag: string;
  x: number;
  y: number;
  w: number;
  h: number;
  size: string;
  weight: string;
  family: string;
  color: string;
  background: string;
  radius: string;
  /**
   * EVERY `data-pf-type` from this node up to the body, space-joined.
   *
   * The nearest one is not enough and the first version used it: a heading
   * inside a slideshow slide has `Heading2` directly on it, so the slideshow
   * two levels up was never seen and 106 layout differences that belong to a
   * widget were reported as the transcription's fault.
   */
  widget: string;
};

export type ImageBox = { src: string; x: number; y: number; w: number; h: number; widget: string };
export type BandBox = { y: number; h: number; photo: boolean };

export type Shot = { bands: BandBox[]; text: TextBox[]; images: ImageBox[] };

/* Read off the page in one evaluate rather than several: every round trip is a
   chance for a lazy image to arrive between two measurements and put half the
   page 200px further down than the other half described it. */
const PROBE = `(function(){
  var bands = Array.prototype.map.call(
    document.querySelectorAll('[data-pf-type="FlexSection"], body > main > section, body > section'),
    function(el){
      var r = el.getBoundingClientRect();
      var cs = getComputedStyle(el);
      return { y: Math.round(r.y + window.scrollY), h: Math.round(r.height),
               photo: !!el.querySelector('img') || /url\\(/.test(cs.backgroundImage) };
    });

  var text = [];
  var walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  var n;
  while ((n = walk.nextNode())) {
    var t = (n.textContent || '').replace(/\\s+/g, ' ').trim();
    if (!t) continue;
    var el = n.parentElement; if (!el) continue;
    var r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    var cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    var chain = []; var up = el;
    while (up && up !== document.body) {
      var ty = up.getAttribute && up.getAttribute('data-pf-type');
      if (ty) chain.push(ty);
      up = up.parentElement;
    }
    var widget = chain.join(' ');
    text.push({ widget: widget, text: t.slice(0,80), tag: el.tagName,
      x: Math.round(r.x), y: Math.round(r.y + window.scrollY),
      w: Math.round(r.width), h: Math.round(r.height),
      size: cs.fontSize, weight: cs.fontWeight,
      family: cs.fontFamily.split(',')[0].replace(/["']/g,'').trim(),
      color: cs.color, background: cs.backgroundColor, radius: cs.borderRadius });
  }

  var images = [];
  Array.prototype.forEach.call(document.querySelectorAll('img'), function(el){
    var r = el.getBoundingClientRect();
    var ch = []; var a = el.parentElement;
    while (a && a !== document.body) {
      var t2 = a.getAttribute && a.getAttribute('data-pf-type');
      if (t2) ch.push(t2);
      a = a.parentElement;
    }
    var w = ch.join(' ');
    images.push({ widget: w, src: (el.currentSrc || el.src || '').slice(-48),
      x: Math.round(r.x), y: Math.round(r.y + window.scrollY),
      w: Math.round(r.width), h: Math.round(r.height) });
  });

  return JSON.stringify({ bands: bands, text: text, images: images });
})()`;

/**
 * Load a page, settle it, and read it.
 *
 * SETTLED MEANS THREE THINGS, and each was a source of a difference that was
 * not a difference: webfonts arriving after first paint (every measurement
 * taken in the fallback face), scroll reveals still at `opacity: 0` (a band
 * that is genuinely there measured as blank), and lazy images not yet fetched.
 */
export async function readPage(session: Session, url: string, width: number): Promise<Shot> {
  await session.open(url);
  await session.resize(width, 1200);
  /* Reveals to their end state, and lazy images asked for eagerly — both by
     class and by attribute, since a page carries whichever its renderer used. */
  await session.evaluate(`(function(){
    document.documentElement.classList.remove('pfd-motion-ready');
    Array.prototype.forEach.call(document.querySelectorAll('.pfd-reveal'), function(el){ el.classList.add('pfd-revealed') });
    Array.prototype.forEach.call(document.querySelectorAll('img[loading="lazy"]'), function(el){ el.loading = 'eager' });
    return 1;
  })()`);
  await session.evaluate(`document.fonts ? document.fonts.ready.then(function(){return 1}) : 1`);
  await session.evaluate(`new Promise(function(r){ setTimeout(r, 800) })`);
  return JSON.parse(await session.evaluate<string>(PROBE)) as Shot;
}

export type Mismatch = {
  band: number | null;
  kind: "missing-text" | "missing-image" | "font-size" | "font-family" | "weight" | "colour" | "background" | "radius" | "box";
  /** one line, naming both values — this is what goes back to the transcriber */
  say: string;
};

/** Which band a y-coordinate falls in, or null above the first / below the last. */
function bandOf(bands: BandBox[], y: number): number | null {
  for (let i = 0; i < bands.length; i++)
    if (y >= bands[i].y && y < bands[i].y + bands[i].h) return i;
  return null;
}

/**
 * What the second rendering has that the first does not.
 *
 * MATCHED BY TEXT, NOT BY POSITION. Two renderings of one page do not agree on
 * the order of their DOM — one wraps a heading in an extra block, the other
 * does not — and an index-matched diff reports every element after the first
 * insertion as wrong. The words are the stable identity: they are the one thing
 * transcription is forbidden to change.
 */
export type Report = {
  bad: Mismatch[];
  /** nodes inside a widget the preview renderer draws as a static box */
  unverified: number;
};

export function compare(want: Shot, got: Shot): Report {
  const out: Mismatch[] = [];
  let unverified = 0;
  const byText = new Map<string, TextBox>();
  for (const t of got.text) if (!byText.has(t.text)) byText.set(t.text, t);

  for (const t of want.text) {
    const band = bandOf(want.bands, t.y);
    if (RUNTIME_DRAWN.test(t.widget)) {
      unverified++;
      continue;
    }
    const m = byText.get(t.text);
    if (!m) {
      out.push({ band, kind: "missing-text", say: `${t.tag} "${t.text.slice(0, 40)}" is not on the page` });
      continue;
    }
    const name = `${t.tag} "${t.text.slice(0, 28)}"`;
    if (t.size !== m.size) out.push({ band, kind: "font-size", say: `${name}: font-size ${m.size} should be ${t.size}` });
    if (t.family !== m.family) out.push({ band, kind: "font-family", say: `${name}: font ${m.family} should be ${t.family}` });
    if (t.weight !== m.weight) out.push({ band, kind: "weight", say: `${name}: weight ${m.weight} should be ${t.weight}` });
    if (t.color !== m.color) out.push({ band, kind: "colour", say: `${name}: colour ${m.color} should be ${t.color}` });
    if (t.background !== m.background)
      out.push({ band, kind: "background", say: `${name}: background ${m.background} should be ${t.background}` });
    if (t.radius !== m.radius) out.push({ band, kind: "radius", say: `${name}: radius ${m.radius} should be ${t.radius}` });
    /* Generous on purpose. A four-pixel difference in where a word starts is
       two renderers rounding a percentage; a hundred is a column that became a
       row, and only the second is worth a model call. */
    if (Math.abs(t.x - m.x) > 24 || Math.abs(t.w - m.w) > 40)
      out.push({ band, kind: "box", say: `${name}: box ${m.x},${m.w} should be near ${t.x},${t.w}` });
  }

  /* Images are matched on the tail of their URL — the same photograph, whatever
     the CDN prefix did to it. */
  const gotSrc = new Set(got.images.map((i) => i.src));
  for (const img of want.images) {
    if (RUNTIME_DRAWN.test(img.widget)) {
      unverified++;
      continue;
    }
    if (!gotSrc.has(img.src))
      out.push({ band: bandOf(want.bands, img.y), kind: "missing-image", say: `image …${img.src} is not on the page` });
  }

  return { bad: out, unverified };
}

/** Per-band SSIM at one width. Bands are matched by order, as they are built. */
export async function bandScores(
  session: Session,
  width: number,
  a: { url: string; bands: BandBox[] },
  b: { url: string; bands: BandBox[] },
): Promise<number[]> {
  const count = Math.min(a.bands.length, b.bands.length);
  const shots: Uint8Array[][] = [];
  for (const side of [a, b]) {
    await session.open(side.url);
    await session.resize(width, 1200);
    await session.evaluate(`new Promise(function(r){ setTimeout(r, 400) })`);
    const mine: Uint8Array[] = [];
    for (let i = 0; i < count; i++) {
      const box = side.bands[i];
      mine.push(
        box.h > 8
          ? await session.shoot({ x: 0, y: box.y, width, height: Math.min(box.h, 2400) })
          : new Uint8Array(0),
      );
    }
    shots.push(mine);
  }
  return shots[0].map((png, i) =>
    png.length && shots[1][i].length ? ssim(decodePng(png), decodePng(shots[1][i])) : 0,
  );
}
