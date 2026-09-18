"use client";

import { flattenComputedStyles } from "./flatten";
import { pageFromBreakpoints, setVerbatimStyles, type Rendered } from "./fromDom";
import type { PageMockup } from "../generate/types";
import type { DeviceKey } from "./builder";

/* ==========================================================================
   One HTML document → one .pagefly.

   The page the build model writes in HTML mockup mode is a document, not a
   component tree, so the export cannot read it off the staged React render the
   way `ExportProvider` reads everything else — there is nothing there but an
   iframe. It is laid out here instead, at the four widths PageFly publishes at,
   and each layout is flattened and handed to the same converter.

   EVERY NUMBER BELOW WAS MEASURED, and each one is a defect it was written to
   avoid.

   THE FRAME IS A REAL VIEWPORT, at a real device height. `vh` resolves against
   the frame, and a frame stretched to the document's full height turned a
   `min-height:94vh` hero into 15,717px — taller than the whole mockup, with
   every section after it pushed down by that much.

   IMAGES FIRST. The flattened style is what the file carries for ever, so an
   image measured before it arrives is wrong for ever. At 390px the wrong box
   was enormous: two sections came out 2,191px and 2,574px too tall.

   TRANSITIONS OFF, THEN REVEALED. The page hides its own content behind
   `[data-reveal]{opacity:0}` and shows it on scroll, which never happens inside
   a frame. Adding the class without stopping the 420ms transition catches every
   element mid-fade — the hero headline exported at about half strength.
   ========================================================================== */

/** The widths each breakpoint is measured at, and a real device height for
    each — see the note above on `vh`. */
const LAYOUTS: { key: DeviceKey; width: number; height: number }[] = [
  { key: "all", width: 1440, height: 900 },
  { key: "laptop", width: 1100, height: 800 },
  { key: "tablet", width: 860, height: 1024 },
  { key: "mobile", width: 390, height: 844 },
];

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Off-screen rather than hidden: a `display:none` frame lays nothing out, and
    layout is the whole point. */
function frame(width: number, height: number): HTMLIFrameElement {
  const el = document.createElement("iframe");
  el.setAttribute("aria-hidden", "true");
  el.style.cssText =
    `position:fixed;left:-20000px;top:0;border:0;` +
    `width:${width}px;height:${height}px;visibility:hidden;`;
  return el;
}

async function settle(doc: Document): Promise<void> {
  await Promise.all(
    Array.from(doc.images).map((img) =>
      img.complete && img.naturalWidth
        ? Promise.resolve()
        : new Promise<void>((done) => {
            const end = () => done();
            img.addEventListener("load", end);
            img.addEventListener("error", end);
            setTimeout(end, 12_000);
          }),
    ),
  );
  try {
    await doc.fonts.ready;
  } catch {
    /* A document with no font faces has no `fonts`; nothing to wait for. */
  }

  const stop = doc.createElement("style");
  stop.textContent =
    "*,*::before,*::after{transition:none!important;animation:none!important}";
  doc.head.appendChild(stop);
  for (const el of Array.from(doc.querySelectorAll("[data-reveal]")))
    el.classList.add("in");

  await wait(200);
}

/**
 * Lay the document out four times, flatten each, and build the file.
 *
 * `page.tokens` is not consulted for the page's own colours and face: the
 * document carries its own, and the wrapper reads them off its body. Passing
 * PageFly Design's palette here would repaint the whole export.
 */
export async function pageflyFromHtml(
  html: string,
  page: PageMockup,
  width = 1440,
): Promise<{ blob: Blob; filename: string }> {
  const frames: HTMLIFrameElement[] = [];

  try {
    /* ALL FOUR AT ONCE. They are four layouts of one document and nothing
       passes between them, so running them in turn spends four times the wall
       clock for no reason — and the slow part is waiting on the network, which
       four frames share: the first to ask for an image warms the cache for the
       other three.

       This is the whole of the export's cost. There is no work here that can be
       skipped, only overlapped: the measuring IS the fidelity. */
    const laid = await Promise.all(
      LAYOUTS.map(async ({ key, width: w, height: h }) => {
        const el = frame(w, h);
        document.body.appendChild(el);
        frames.push(el);

        el.srcdoc = html;
        await new Promise<void>((done) => {
          el.addEventListener("load", () => done(), { once: true });
          setTimeout(done, 8_000);
        });

        const doc = el.contentDocument;
        if (!doc?.body) return null;
        await settle(doc);
        flattenComputedStyles(doc.body);
        return { key, root: doc.body } as Rendered;
      }),
    );

    /* In the order `LAYOUTS` declares, which is the order the converter reads:
       desktop first, because it is the base every other breakpoint overrides. */
    const renders = laid.filter((r): r is Rendered => r !== null);

    if (renders.length === 0) throw new Error("The document did not lay out");

    const body = renders[0].root;
    const own = body.ownerDocument.defaultView!.getComputedStyle(body);

    setVerbatimStyles(true);
    try {
      return pageFromBreakpoints(
        renders,
        {
          ...page,
          tokens: {
            ...page.tokens,
            bg: own.backgroundColor,
            ink: own.color,
            fontBody: own.fontFamily,
          },
        },
        width,
      );
    } finally {
      /* Always, including on the way out of a throw: the flag is module state
         and a build that leaves it on changes how the React path exports. */
      setVerbatimStyles(false);
    }
  } finally {
    for (const el of frames) el.remove();
  }
}
