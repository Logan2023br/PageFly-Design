import "server-only";
import { withMeter } from "../ai/meter";

import { getRepo } from "../db";
import { keyForHtml } from "./prepared";
import { pageflyFromHtmlLive } from "./htmlToTree";
import type { PageMockup } from "../generate/types";

/* ==========================================================================
   THE FILE IS BUILT ONCE, WHEN THE PAGE LANDS IN THE LIBRARY.

   WHAT THIS REPLACES, and it is worth writing down because the old shape cost
   real money quietly. `ResultsScreen` called `prepare(allPages)` in an effect,
   which started a conversion for every page in the deck the moment the screen
   mounted — in the browser, into a variable at module scope. That variable dies
   with the tab. Reloading the results screen, or coming back to it tomorrow,
   converted the whole deck again: about two minutes and twenty cents A PAGE,
   every time, for a file most merchants download once and many never download
   at all.

   Here it runs once, on the server, at the moment the deck is saved, and the
   answer is kept. A page converted today is not converted again — not on
   reload, not next week, not after the server restarts.

   DETACHED, AND THE BUILD DOES NOT WAIT. A merchant watching their pages
   arrive should not also be waiting on a file they have not asked for. The
   promise is deliberately unawaited by the caller; every failure inside is
   swallowed and logged, because there is a working fallback — the export click
   still converts on demand when no file is there, which is exactly what it did
   before this existed.

   SO A CRASH COSTS NOTHING BUT A RETRY. If the process dies mid-conversion the
   row is simply absent, and the next export click builds it and stores it. No
   state to repair, no queue to drain.
   ========================================================================== */

/** What a page's file is filed under, or null when the page has no mockup. */
export function fileKeyFor(page: PageMockup): string | null {
  const html = page.design?.html;
  if (typeof html !== "string" || html.trim() === "") return null;
  return keyForHtml(page.id, html);
}

/** `Home.pagefly`, `Product page.pagefly` — the name the merchant sees. */
function fileStem(page: PageMockup): string {
  const stem = (page.label || page.pageType || "page").trim().replace(/[\\/:*?"<>|]+/g, "-");
  return stem === "" ? "page" : stem;
}

/**
 * Build and store the .pagefly for every page of a deck that has no file yet.
 *
 * ONE AT A TIME, not all at once. A page is ten model calls already running in
 * parallel; seven pages at once is seventy concurrent requests at the vendor,
 * which is a rate limit rather than a speed-up — and nothing is waiting on the
 * result, so the only thing haste would buy is a worse chance of finishing.
 */
export async function prebuildFiles(domain: string, pages: PageMockup[]): Promise<void> {
  const repo = getRepo();

  const wanted = pages.flatMap((page) => {
    const key = fileKeyFor(page);
    return key ? [{ page, key }] : [];
  });
  if (wanted.length === 0) return;

  let present: string[];
  try {
    present = await repo.pageFilesPresent(domain, wanted.map((w) => w.key));
  } catch (err) {
    console.log(`[prebuild] ${domain} · could not read what is already built: ${(err as Error).message}`);
    return;
  }
  const have = new Set(present);
  const todo = wanted.filter((w) => !have.has(w.key));
  if (todo.length === 0) return;

  console.log(
    `[prebuild] ${domain} · ${todo.length} of ${wanted.length} page(s) need a file`,
  );

  for (const { page, key } of todo) {
    const started = Date.now();
    try {
      const t = page.tokens;
      const built = await withMeter({ domain, stage: "export" }, () =>
        pageflyFromHtmlLive(page.design!.html!, fileStem(page), {
        bg: t.bg,
        ink: t.ink,
        fontBody: t.fontBody,
        accent: t.accent,
        border: t.border,
        radius: t.radius,
        band: t.surfaceAlt,
        }),
      );
      const bytes = new Uint8Array(await built.blob.arrayBuffer());
      await repo.savePageFile({
        domain,
        key,
        bytes,
        filename: built.filename,
        createdAt: new Date().toISOString(),
      });
      const usage = built.usage as { input: number; output: number; cached?: number };
      console.log(
        `[prebuild] ${domain} · ${page.label} · ${built.built}/${built.sections} bands · ` +
          `${bytes.length.toLocaleString()} bytes · ${Math.round((Date.now() - started) / 1000)}s · ` +
          `in ${usage.input} out ${usage.output}`,
      );
    } catch (err) {
      /* Logged and dropped. The export click converts on demand when no file is
         here, so a page that fails now costs a merchant nothing but the wait
         they would have had anyway. */
      console.log(`[prebuild] ${domain} · ${page.label} FAILED: ${(err as Error).message}`);
    }
  }
}
