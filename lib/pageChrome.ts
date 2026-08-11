/* ==========================================================================
   Site chrome — the header band at the top of a page and the footer at the
   bottom.

   Off, for now.

   A merchant importing into PageFly already has a header and a footer: their
   Shopify theme draws both on every page, above and below whatever PageFly
   renders. A mockup that includes its own is showing them a page they cannot
   have — and if they import it anyway, the store ends up with two navigations
   stacked on each other.

   One flag rather than a rule spread across the generator and the prompt,
   because this is a decision that may well be reversed. Flip it and both
   paths carry chrome again; nothing else has to change.
   ========================================================================== */

export const INCLUDE_CHROME = false;

/** Block kinds that ARE the chrome. */
export const CHROME_KINDS = new Set(["nav", "footer"]);
