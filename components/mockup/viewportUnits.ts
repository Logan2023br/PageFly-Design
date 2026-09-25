import { DEVICES } from "@/lib/generate/types";

/* ==========================================================================
   `100vh` IN A FRAME THAT IS AS TALL AS THE WHOLE PAGE.

   `HtmlMockup` measures the document and sets its iframe to the full height,
   so everything outside can scroll one tall picture rather than a short window
   with its own scrollbar. That frame IS the viewport for what it contains —
   and a page whose hero says `min-height:100vh` therefore gets a hero as tall
   as the entire document. This one came out 9,801 pixels tall; the hero aligns
   its content to the bottom, so every word sat 8,900 pixels below the window
   and the Library showed a dark, empty rectangle. The same file opened in a
   browser was perfect.

   It is also a loop: a taller frame makes a taller hero makes a taller
   document makes a taller frame.

   So the units are pinned to the device the mockup was drawn for, which is
   what a designer means by `100vh`: one screen. `vw` is left alone — the frame
   is already the device width, so it resolves correctly by itself.

   ONLY STYLE, NEVER PROSE. The substring `vh` turns up in sentences and in
   class names, and a rewrite that reaches a page's text changes what the page
   SAYS. `<style>` blocks and `style` attributes, and nothing else.
   ========================================================================== */

/** The viewport a mockup of this width was drawn against. */
export function deviceHeightFor(width: number): number {
  return DEVICES.find((d) => d.width === width)?.height ?? DEVICES[0].height;
}

/** The width it was drawn against, for `vmin` and `vmax`. */
function deviceWidthFor(width: number): number {
  return DEVICES.find((d) => d.width === width)?.width ?? width;
}

/** `100vh` → `900px`, and the same for the units that mean the same thing. */
function rewrite(css: string, w: number, h: number): string {
  return css.replace(
    /(-?\d*\.?\d+)(svh|dvh|lvh|vh|vmin|vmax)\b/gi,
    (_m, n: string, unit: string) => {
      const pct = parseFloat(n) / 100;
      const basis =
        unit.toLowerCase() === "vmin"
          ? Math.min(w, h)
          : unit.toLowerCase() === "vmax"
            ? Math.max(w, h)
            : h;
      /* Trailing zeros dropped so `100vh` reads `900px`, not `900.00px`. */
      return `${Number((pct * basis).toFixed(4))}px`;
    },
  );
}

/**
 * The same document, with its viewport heights pinned to a real screen.
 *
 * A page with none of these units comes back unchanged, which is most of them.
 */
export function pinViewportUnits(html: string, width: number): string {
  const h = deviceHeightFor(width);
  const w = deviceWidthFor(width);

  return html
    .replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi, (_m, attrs: string, css: string) =>
      `<style${attrs}>${rewrite(css, w, h)}</style>`,
    )
    .replace(/\sstyle\s*=\s*"([^"]*)"/gi, (_m, css: string) => ` style="${rewrite(css, w, h)}"`)
    .replace(/\sstyle\s*=\s*'([^']*)'/gi, (_m, css: string) => ` style='${rewrite(css, w, h)}'`);
}
