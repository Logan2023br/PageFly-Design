import "server-only";

import { designPageTree } from "../ai/designServer";
import { readReferences } from "../ai/refVision";
import { getRepo } from "../db";
import type { JobRecord, RunPageRecord, RunRecord } from "../db/types";
import { buildPage, expandSelection } from "../generate/mock";
import { CHROME_KINDS, INCLUDE_CHROME } from "../pageChrome";
import { VISUAL_STYLES } from "../styleTokens";
import type { GenerateFailure, PageMockup } from "../generate/types";
import { PAGE_BY_ID } from "../pageCatalog";
import { encodeRunPayload } from "../runPayload";
import type { Brief } from "../validation";

/* ==========================================================================
   A build, run on the server.

   Generation lived in the browser while it was instant, and that was the right
   place for it: pages streamed in as they were made, with no server round trip
   per page. A model designing every page turned it into a minute of waiting,
   and a minute is long enough that people reload, switch tabs, or shut the
   laptop. Everything was lost when they did — including the tokens already
   spent on calls that had finished and had nowhere to land.

   So the server owns the build. The browser asks for one, polls it, and is
   free to go away. Pages are written into the job as they finish, the run is
   saved when the last one does, and coming back — same tab, new tab, or a new
   sign-in tomorrow — picks up whatever state the row is in.

   WHAT THIS DOES NOT SURVIVE: the process. A job is an async function in this
   Node process, not an entry in a durable queue, so `pm2 restart` or a crash
   loses whatever was still running. Rather than leave those rows claiming to
   run for ever — which would have a browser polling a job that no longer
   exists — every job still marked running at startup is failed on sight.
   Surviving a restart needs a real queue, and that is a different piece of
   infrastructure than this beta needs.
   ========================================================================== */

/** How many pages the model works on at once.

    The browser fired all of them at once, which was fine for three and would
    be thirty concurrent calls for a full allowance — enough to hit rate limits
    on the model and to hold thirty page trees in memory at the same moment.
    Four keeps a five-page deck about as fast as it was while bounding the
    worst case. */
const CONCURRENCY = 4;

/** The card the merchant actually clicked, by id. */
const styleDef = (id: string) => VISUAL_STYLES.find((s) => s.id === id);

/** Jobs running in THIS process, so cancel has something to signal. */
const live = new Map<string, AbortController>();

let orphansChecked = false;

/** Fail anything left running by a process that no longer exists. Runs once. */
async function checkOrphans(): Promise<void> {
  if (orphansChecked) return;
  orphansChecked = true;
  try {
    await getRepo().failOrphanedJobs();
  } catch {
    /* No database yet. The next call will try again, because a failure here
       leaves nothing worse than the rows that were already stale. */
    orphansChecked = false;
  }
}

export type PlanEntry = {
  pageId: string;
  pageType: string;
  label: string;
  copyIndex: number;
  copyTotal: number;
};

/** The deck the brief asks for, named. Computed here rather than accepted from
    the client: the plan decides how much of the merchant's allowance is spent. */
export function planFor(brief: Brief): PlanEntry[] {
  return expandSelection(brief.pages).map((entry) => ({
    pageId: entry.pageId,
    pageType: entry.pageType,
    label: PAGE_BY_ID[entry.pageType]?.label ?? entry.pageType,
    copyIndex: entry.copyIndex,
    copyTotal: entry.copyTotal,
  }));
}

/** Strip the header and footer when chrome is off — same rule the client path
    applies, applied on the way out of the generator rather than inside it. */
function withoutChrome(page: PageMockup): PageMockup {
  if (INCLUDE_CHROME) return page;
  return { ...page, blocks: page.blocks.filter((b) => !CHROME_KINDS.has(b.kind)) };
}

export type StartResult =
  | { ok: true; jobId: string }
  | { ok: false; error: string };

export async function startBuild(
  domain: string,
  brief: Brief,
  variants: Record<string, number>,
  jobId: string,
): Promise<StartResult> {
  await checkOrphans();

  const plan = planFor(brief);
  if (plan.length === 0) return { ok: false, error: "Nothing to build." };

  const now = new Date().toISOString();
  const job: JobRecord = {
    id: jobId,
    domain,
    createdAt: now,
    updatedAt: now,
    status: "running",
    payload: encodeRunPayload(brief, variants),
    plan,
    pages: [],
    failures: [],
    tokens: 0,
    error: null,
  };

  /* The id is derived from the brief, so rebuilding the same brief lands on
     the same row. Reset it rather than insert: a primary key collision here
     would surface as a 500 on a merchant pressing Create a second time. */
  const existing = await getRepo().getJob(jobId).catch(() => null);
  if (existing)
    await getRepo().updateJob(jobId, {
      status: "running",
      pages: [],
      failures: [],
      tokens: 0,
      error: null,
    });
  else await getRepo().createJob(job);

  const controller = new AbortController();
  live.set(jobId, controller);

  /* Deliberately not awaited. The request that asked for the build returns as
     soon as the row exists; the work outlives it. */
  void run(job, brief, variants, plan, controller.signal).finally(() =>
    live.delete(jobId),
  );

  return { ok: true, jobId };
}

export function cancelBuild(jobId: string): boolean {
  const controller = live.get(jobId);
  if (!controller) return false;
  controller.abort();
  return true;
}

async function run(
  job: JobRecord,
  brief: Brief,
  variants: Record<string, number>,
  plan: PlanEntry[],
  signal: AbortSignal,
): Promise<void> {
  const repo = getRepo();
  const pages: PageMockup[] = [];
  const failures: GenerateFailure[] = [];
  let tokens = 0;

  /* Read the merchant's reference screenshots ONCE, before any page is designed.
     Once per build rather than once per page for two reasons: it is the same
     answer every time, and every page seeing the same reading is part of what
     makes four pages of one build look like one site.

     Awaited rather than raced with the first page. It costs a second or two and
     the whole point is that the designer has it — starting page one without it
     would produce exactly the page this feature exists to replace. */
  const reading = await readReferences(brief, signal);
  if (reading) tokens += reading.usage.input + reading.usage.output;

  /* A simple index cursor rather than a queue library: every worker takes the
     next unclaimed entry, so a page that takes ninety seconds does not hold up
     three others behind it. */
  let next = 0;

  const worker = async () => {
    for (;;) {
      if (signal.aborted) return;
      const i = next++;
      if (i >= plan.length) return;
      const entry = plan[i];

      try {
        const base = withoutChrome(
          buildPage({
            brief,
            pageType: entry.pageType,
            pageId: entry.pageId,
            index: i + 1,
            copyIndex: entry.copyIndex,
            copyTotal: entry.copyTotal,
            variant: variants[entry.pageId] ?? 0,
          }),
        );

        const outcome = await designPageTree(
          {
            sell: brief.whatYouSell,
            prompt: brief.prompt,
            storeType: brief.storeType,
            style: brief.visualStyle,
            styleLabel: styleDef(brief.visualStyle)?.label ?? brief.visualStyle,
            styleBlurb: styleDef(brief.visualStyle)?.blurb ?? "",
            density: base.tokens.density,
            /* Measured from the merchant's uploads. It was already on the page
               and went no further than the deterministic generator. */
            reference: base.refHints,
            /* What a model that can see actually found in those screenshots. */
            refSections: reading?.sections ?? null,
            refStyle: reading?.style ?? null,
            /* The whole deck, so a page can pace itself against its siblings
               rather than each one deciding in isolation. */
            deckSize: plan.length,
            /* The seed's material. Two stores in one vertical must roll
               different patterns, and the domain is the one thing that reliably
               differs — without it every store in a trade gets one page. */
            storeDomain: job.domain,
            verticalSlug: brief.verticalSlug ?? null,
            pageLabel: base.label,
            pageType: base.pageType,
            tokens: {
              bg: base.tokens.bg,
              ink: base.tokens.ink,
              accent: base.tokens.accent,
              band: base.tokens.surfaceAlt,
              border: base.tokens.border,
              fontHeading: base.tokens.fontDisplay,
              fontBody: base.tokens.fontBody,
              radius: base.tokens.radius,
            },
          },
          signal,
        );

        tokens += outcome.usage.input + outcome.usage.output;

        /* A page the model did not design is not a page. It used to fall back
           to the deterministic layout, which shipped a visibly poorer page
           under the same label, spent a slot of the merchant's allowance on it,
           and said nothing — so the merchant compared four pages, found one
           obviously worse, and had no way to know it was a fallback rather than
           the model's best attempt.

           `buildPage` still runs: it resolves the palette, the label and the
           reference measurements the designer needs. What stops here is that
           layout ever BECOMING the delivered page. Reconnecting it is deleting
           this branch. */
        if (!outcome.used) {
          /* Logged as well as recorded. The reason reaches the browser through
             the job row, but a page that failed at three in the morning is
             diagnosed from the log — and without this line the log showed
             nothing but successful polls. */
          console.warn(
            `[build] ${entry.label} (${entry.pageType}) failed: ${outcome.reason}` +
              ` · in ${outcome.usage.input} out ${outcome.usage.output}`,
          );
          failures.push({
            pageId: entry.pageId,
            label: entry.label,
            reason: outcome.reason,
          });
          continue;
        }

        console.log(
          `[build] ${entry.label} ok · ${outcome.tree.sections.length} sections · ` +
            `audit ${outcome.auditFailures} · in ${outcome.usage.input} out ${outcome.usage.output}`,
        );

        pages.push({
          ...base,
          design: {
            tree: outcome.tree,
            images: outcome.images,
            credits: outcome.credits,
          },
        });
      } catch (err) {
        failures.push({
          pageId: entry.pageId,
          label: entry.label,
          reason: err instanceof Error ? err.message : "Unknown error",
        });
      }

      /* Written after every page, not at the end. The whole point is that a
         browser arriving mid-build sees what has landed. */
      if (!signal.aborted)
        await repo
          .updateJob(job.id, { pages: inOrder(pages), failures, tokens })
          .catch(() => {});
    }
  };

  try {
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, plan.length) }, worker),
    );

    const ordered = inOrder(pages);

    if (signal.aborted) {
      /* Cancelling stops the build; it does not throw away what the build
         already produced. Five of eleven pages cost five pages' worth of model
         time and the merchant waited for them — dropping them on the floor is
         the one outcome nobody asked for. They go to the Library exactly as a
         finished build's would, and the allowance is charged for them, because
         they are pages the merchant can use. */
      if (ordered.length > 0) await saveRun(job, brief, variants, ordered, tokens);
      await repo.updateJob(job.id, {
        status: "cancelled",
        pages: ordered,
        failures,
        tokens,
      });
      return;
    }

    /* Nothing designed at all is a failed build, not a finished one with an
       empty deck. Now that the deterministic layout no longer stands in, this
       is what a model outage looks like from here — and reporting it as "done"
       would send the merchant to a Library page that shows nothing and explains
       nothing. Marked failed, so the screen can say so and support has
       something to look for. */
    if (ordered.length === 0) {
      await repo.updateJob(job.id, {
        status: "failed",
        pages: [],
        failures,
        tokens,
        error:
          failures[0]?.reason ??
          "The page designer could not be reached. No pages were built.",
      });
      return;
    }

    /* The run is saved HERE, not by the browser. A merchant who closed the tab
       still finds the deck in their Library, which is the reason any of this
       moved to the server. */
    await saveRun(job, brief, variants, ordered, tokens);

    await repo.updateJob(job.id, {
      status: "done",
      pages: ordered,
      failures,
      tokens,
    });
  } catch (err) {
    await repo
      .updateJob(job.id, {
        status: "failed",
        error: err instanceof Error ? err.message.slice(0, 300) : "Unknown error",
        pages: inOrder(pages),
        failures,
        tokens,
      })
      .catch(() => {});
  }
}

/** Plan order, not completion order — the model does not finish a one-section
    page and a nine-section page in the order they were started. */
function inOrder(pages: PageMockup[]): PageMockup[] {
  return [...pages].sort(
    (a, b) => a.index - b.index || (a.copyIndex ?? 0) - (b.copyIndex ?? 0),
  );
}

/**
 * Stable id for a run: same store, same brief, same pages → same id.
 *
 * Duplicated from the runs route rather than shared, because the two must
 * agree exactly: a build saved by the server and the same build re-posted by
 * a browser have to collapse onto one row, or one deck becomes two.
 */
function runId(domain: string, payload: string): string {
  /* The BRIEF alone, not the pages delivered.

     Including the delivered list meant a build cancelled at five pages and the
     same brief rebuilt to eleven were two different rows — so the Library
     showed the five twice and the allowance was charged sixteen for eleven
     pages. Keyed on the brief, the finished build lands on the same row and
     replaces the partial one, and run_pages adds only what was missing. */
  const material = `${domain}|${payload}`;

  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (const ch of material) {
    const code = ch.charCodeAt(0);
    a = Math.imul(a ^ code, 0x01000193);
    b = Math.imul(b + code, 0x85ebca6b) ^ (b >>> 13);
  }
  return `${(a >>> 0).toString(36)}${(b >>> 0).toString(36)}`;
}

async function saveRun(
  job: JobRecord,
  brief: Brief,
  variants: Record<string, number>,
  pages: PageMockup[],
  tokens: number,
): Promise<void> {
  const payload = encodeRunPayload(brief, variants);
  const rows = pages.map((p) => ({
    pageId: p.id,
    pageType: p.pageType,
    label: p.label,
    index: p.index,
  }));

  const id = runId(job.domain, payload);

  const run: RunRecord = {
    id,
    domain: job.domain,
    createdAt: new Date().toISOString(),
    payload,
    snapshot: pages,
    pageCount: pages.length,
    tokens,
    sell: brief.whatYouSell,
    styleLabel: brief.visualStyle,
  };

  const runPages: RunPageRecord[] = rows.map((r) => ({ runId: id, ...r }));

  await getRepo().saveRun(run, runPages).catch(() => {});
}
