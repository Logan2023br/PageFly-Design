"use client";

import { useEffect, useMemo } from "react";
import { create } from "zustand";
import {
  MAX_BRAND_COLORS,
  MAX_IMAGES,
  type MarketId,
  type StoreTypeId,
} from "./briefOptions";
import {
  MAX_PER_PAGE,
  MAX_TOTAL_PAGES,
  isRepeatable,
  totalSelected,
} from "./pageCatalog";
import { normalizeHex, type VisualStyleId } from "./styleTokens";
import {
  EMPTY_DRAFT,
  validateBrief,
  type Brief,
  type BriefDraft,
  type ReferenceImage,
} from "./validation";
import {
  expandSelection,
  generatePages,
  isAbortError,
  regeneratePage,
} from "./generate";
import { improvePage } from "./ai/improvePage";
import { cancelJob, fetchJob, startJob, watchJob } from "./build/watch";
import { decodeRunPayload } from "./runPayload";
import type { JobView } from "@/app/api/build/route";
import { DEVICES } from "./generate/types";
import type { DeviceId, GenerateFailure, PageMockup } from "./generate/types";
import type { CategoryId } from "./pageCatalog";

/* ==========================================================================
   One store for the brief and the results. Deliberately small: everything that
   is genuinely local (hover state, accordion open/closed) stays in components.
   ========================================================================== */

export type Screen = "brief" | "generating" | "results";

type JobViewLike = JobView;

type PlanEntry = {
  pageId: string;
  pageType: string;
  label: string;
  copyIndex: number;
  copyTotal: number;
};

type State = {
  screen: Screen;
  draft: BriefDraft;
  /** validated snapshot the current results were generated from */
  brief: Brief | null;
  /** run id → the brief that run was built from. Only the Library fills this;
      a normal build has one brief and `brief` above is it. */
  briefs: Record<string, Brief>;

  plan: PlanEntry[];
  pages: PageMockup[];
  failures: GenerateFailure[];
  variants: Record<string, number>;
  /** true when the deck on screen was reopened from the Library, so the recorder
      knows there is nothing new to save */
  reopened: boolean;
  /** model tokens spent on the current build. 0 when no model is configured. */
  tokens: number;
  /** rewrites still in flight. The recorder waits for zero before saving, or the
      snapshot captures the deterministic copy the merchant never saw. */
  rewriting: number;
  /** page ids currently being rebuilt, so their card can show the morph again */
  rebuilding: string[];

  /** the server-side build being watched, or null when nothing is running */
  jobId: string | null;
  /** why the last build could not start or did not finish */
  buildError: string | null;
  /** when the current build was asked for, so the wait can show a real clock
      rather than a guess */
  startedAt: number | null;

  filter: CategoryId | "all";

  previewIndex: number | null;
  device: DeviceId;
  /** width of the device we switched away from; drives the frame spring */
  prevDeviceWidth: number;
  /** null means "fit to frame" */
  zoom: number | null;
  hasSeenShortcuts: boolean;

  /** mock-only: force the first N pages to fail, via ?pfd-fail=N */
  failFirstN: number;
};

type Actions = {
  /**
   * The trade, and its slug when the merchant clicked a chip rather than typed.
   *
   * Two values because they answer different questions: the label is what the
   * copywriter reads, the slug is what the resolver looks up in
   * `30-verticals.md`. Typing free text clears the slug — a merchant who edits
   * "Footwear" into "Footwear for nurses" has stopped being on the chip.
   */
  setSell: (v: string, verticalSlug?: string) => void;
  setStyle: (v: VisualStyleId) => void;
  setStoreType: (v: StoreTypeId) => void;
  setMarket: (v: MarketId) => void;
  setPrompt: (v: string) => void;
  appendPrompt: (snippet: string) => void;

  addColor: (hex: string) => boolean;
  removeColor: (hex: string) => void;

  addImages: (images: ReferenceImage[]) => void;
  removeImage: (id: string) => void;

  togglePage: (pageId: string) => void;
  setPageCount: (pageId: string, count: number) => void;
  selectAllInGroup: (pageIds: string[], on: boolean) => void;

  start: () => Promise<void>;
  /** watch a build already running on the server */
  followBuild: (jobId: string) => Promise<void>;
  /** on a fresh load, rejoin this store's build if it has one */
  resumeBuild: () => Promise<void>;
  cancel: () => void;
  editBrief: () => void;
  regenerateAll: () => Promise<void>;
  regenerateOne: (pageId: string) => void;
  retryFailed: () => Promise<void>;

  /** Rebuild EVERY saved run into one deck — what the Library shows. */
  loadLibrary: (
    runs: {
      id: string;
      brief: Brief;
      variants: Record<string, number>;
      /** the pages as built; used as-is when present */
      snapshot?: PageMockup[] | null;
    }[],
  ) => Promise<void>;

  setFilter: (f: CategoryId | "all") => void;
  openPreview: (index: number) => void;
  closePreview: () => void;
  stepPreview: (delta: number) => void;
  setDevice: (d: DeviceId) => void;
  setZoom: (z: number | null) => void;
  nudgeZoom: (delta: number) => void;
  markShortcutsSeen: () => void;
  setFailFirstN: (n: number) => void;
};

let controller: AbortController | null = null;


export const useStore = create<State & Actions>((set, get) => ({
  screen: "brief",
  draft: EMPTY_DRAFT,
  brief: null,
  briefs: {},

  plan: [],
  pages: [],
  failures: [],
  variants: {},
  reopened: false,
  tokens: 0,
  rewriting: 0,
  rebuilding: [],

  jobId: null,
  buildError: null,
  startedAt: null,

  filter: "all",

  previewIndex: null,
  device: "desktop",
  prevDeviceWidth: 1440,
  zoom: null,
  hasSeenShortcuts: false,
  failFirstN: 0,

  /* ---- brief fields --------------------------------------------------- */

  setSell: (v, verticalSlug) =>
    set((s) => ({
      draft: { ...s.draft, whatYouSell: v, verticalSlug: verticalSlug ?? null },
    })),
  setStyle: (v) => set((s) => ({ draft: { ...s.draft, visualStyle: v } })),
  setStoreType: (v) => set((s) => ({ draft: { ...s.draft, storeType: v } })),
  setMarket: (v) => set((s) => ({ draft: { ...s.draft, market: v } })),
  setPrompt: (v) => set((s) => ({ draft: { ...s.draft, prompt: v } })),

  appendPrompt: (snippet) =>
    set((s) => {
      const current = s.draft.prompt.trimEnd();
      if (current.includes(snippet)) return s;
      const next = current ? `${current}\n${snippet}` : snippet;
      return { draft: { ...s.draft, prompt: next.slice(0, 1500) } };
    }),

  addColor: (hex) => {
    const normalized = normalizeHex(hex);
    if (!normalized) return false;
    const { draft } = get();
    if (draft.brandColors.length >= MAX_BRAND_COLORS) return false;
    if (draft.brandColors.includes(normalized)) return false;
    set({ draft: { ...draft, brandColors: [...draft.brandColors, normalized] } });
    return true;
  },

  removeColor: (hex) =>
    set((s) => ({
      draft: {
        ...s.draft,
        brandColors: s.draft.brandColors.filter((c) => c !== hex),
      },
    })),

  addImages: (images) =>
    set((s) => ({
      draft: {
        ...s.draft,
        referenceImages: [...s.draft.referenceImages, ...images].slice(
          0,
          MAX_IMAGES,
        ),
      },
    })),

  removeImage: (id) =>
    set((s) => {
      const target = s.draft.referenceImages.find((i) => i.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return {
        draft: {
          ...s.draft,
          referenceImages: s.draft.referenceImages.filter((i) => i.id !== id),
        },
      };
    }),

  /* ---- page selection ------------------------------------------------- */

  togglePage: (pageId) =>
    set((s) => {
      const current = s.draft.pages[pageId] ?? 0;
      if (current > 0) {
        const next = { ...s.draft.pages };
        delete next[pageId];
        return { draft: { ...s.draft, pages: next } };
      }
      if (totalSelected(s.draft.pages) >= MAX_TOTAL_PAGES) return s;
      return { draft: { ...s.draft, pages: { ...s.draft.pages, [pageId]: 1 } } };
    }),

  setPageCount: (pageId, count) =>
    set((s) => {
      const clamped = Math.max(
        0,
        Math.min(isRepeatable(pageId) ? MAX_PER_PAGE : 1, count),
      );
      const others = totalSelected(s.draft.pages) - (s.draft.pages[pageId] ?? 0);
      const allowed = Math.min(clamped, MAX_TOTAL_PAGES - others);

      const next = { ...s.draft.pages };
      if (allowed <= 0) delete next[pageId];
      else next[pageId] = allowed;
      return { draft: { ...s.draft, pages: next } };
    }),

  selectAllInGroup: (pageIds, on) =>
    set((s) => {
      const next = { ...s.draft.pages };
      if (!on) {
        for (const id of pageIds) delete next[id];
        return { draft: { ...s.draft, pages: next } };
      }
      for (const id of pageIds) {
        if (next[id]) continue;
        if (totalSelected(next) >= MAX_TOTAL_PAGES) break;
        next[id] = 1;
      }
      return { draft: { ...s.draft, pages: next } };
    }),

  /* ---- generation ----------------------------------------------------- */

  start: async () => {
    const { draft } = get();
    const parsed = validateBrief(draft);
    if (!parsed.success) {
      /* IT USED TO RETURN IN SILENCE, and that is the whole bug report: the
         button said "Checking…", went back to "Create pages", and nothing
         happened — no screen, no message, nothing in the console.

         The reason it can happen at all is that readiness is decided twice by
         two different rules. `firstMissing()` enables the button on four fields;
         `briefSchema` validates the whole brief. Anything the schema refuses that
         `firstMissing` does not check is a button that looks ready and a start
         that refuses, for ever, with no way for the merchant to find out which
         field it was. Naming the field is the least this can do. */
      const issue = parsed.error.issues[0];
      const where = issue?.path?.join(".");
      set({
        buildError: where
          ? `That brief could not be used — ${where}: ${issue.message}`
          : (issue?.message ?? "That brief could not be used."),
      });
      return;
    }

    const brief = parsed.data;
    const plan: PlanEntry[] = expandSelection(brief.pages).map((p) => ({
      pageId: p.pageId,
      pageType: p.pageType,
      label: p.pageType,
      copyIndex: p.copyIndex,
      copyTotal: p.copyTotal,
    }));

    controller?.abort();
    controller = new AbortController();

    set({
      screen: "generating",
      brief,
      /* A build of its own. Left behind, a Library's map would answer for pages
         that are not from any of those runs. */
      briefs: {},
      plan,
      pages: [],
      failures: [],
      variants: {},
      reopened: false,
      tokens: 0,
      rewriting: 0,
      buildError: null,
      startedAt: Date.now(),
      filter: "all",
      previewIndex: null,
    });

    /* The build runs on the SERVER now. All this does is ask for one and then
       watch it, which is what makes closing the tab harmless: the work is not
       here to lose. */
    const started = await startJob(brief, {});
    if (!started.ok || !started.job) {
      set({
        screen: "brief",
        buildError: started.ok ? "Couldn't start the build." : started.error,
      });
      return;
    }

    await get().followBuild(started.job.id);
  },

  /**
   * Follow a build that is already running, wherever it was started.
   *
   * Called both by `start` and on a fresh page load, which is the whole point:
   * a merchant who reloads mid-build, or signs in on another machine, rejoins
   * the same job rather than losing it or starting a second one.
   */
  followBuild: async (jobId) => {
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;

    set({ screen: "generating", jobId, buildError: null });

    const apply = (job: JobViewLike) => {
      set((prev) => ({
        /* A rejoined build did not start when this tab opened. Taking the
           clock from the job means the elapsed time is the build's, not the
           browser's, which is the number the merchant is actually waiting on. */
        startedAt: prev.startedAt ?? (Date.parse(job.createdAt) || Date.now()),
        plan: job.plan.length ? (job.plan as PlanEntry[]) : prev.plan,
        pages: job.pages as PageMockup[],
        failures: job.failures,
        tokens: job.tokens,
      }));
    };

    const final = await watchJob(apply, signal);
    if (signal.aborted || !final) return;

    if (final.status === "done") {
      set({
        screen: "results",
        pages: final.pages as PageMockup[],
        failures: final.failures,
        tokens: final.tokens,
        /* The server saved this run when it finished the last page. Marking it
           reopened is how the recorder is told there is nothing left to write —
           without it the deck would be saved twice, once from each side. */
        reopened: true,
        jobId: null,
      });
      return;
    }

    /* Cancelled, or failed outright. Whatever pages did land are still worth
       showing — a build that produced four of five pages should not throw the
       four away. */
    if (final.pages.length > 0) {
      set({
        screen: "results",
        pages: final.pages as PageMockup[],
        failures: final.failures,
        tokens: final.tokens,
        reopened: true,
        jobId: null,
      });
      return;
    }

    set({
      screen: "brief",
      jobId: null,
      buildError:
        final.status === "cancelled" ? null : (final.error ?? "That build didn't finish."),
    });
  },

  /**
   * On a fresh load, rejoin whatever this store has running.
   *
   * Silent when there is nothing: the answer "no build" is the common case and
   * must not disturb a merchant who just opened the brief.
   */
  resumeBuild: async () => {
    const body = await fetchJob();
    if (!body.ok || !body.job || body.job.status !== "running") return;

    const decoded = decodeRunPayload(body.job.payload);
    if (decoded.ok) set({ brief: decoded.payload.brief, draft: decoded.payload.brief });

    set({ plan: body.job.plan as PlanEntry[] });
    await get().followBuild(body.job.id);
  },

  cancel: () => {
    controller?.abort();
    controller = null;
    /* The build lives on the server, so stopping the poller is not stopping
       the build — without this the merchant goes back to the brief while the
       model keeps designing pages they will never see, and keeps billing for
       them. Not awaited: the screen should change now. */
    void cancelJob();
    set({
      screen: "brief",
      pages: [],
      failures: [],
      plan: [],
      jobId: null,
      startedAt: null,
    });
  },

  editBrief: () => set({ screen: "brief", previewIndex: null }),

  regenerateAll: async () => {
    await get().start();
  },

  regenerateOne: (pageId) => {
    const { brief, pages } = get();
    if (!brief) return;
    const existing = pages.find((p) => p.id === pageId);
    if (!existing) return;

    set((s) => ({ rebuilding: [...s.rebuilding, pageId] }));

    const next = regeneratePage(brief, existing);
    set((s) => ({
      pages: s.pages.map((p) => (p.id === pageId ? next : p)),
      variants: { ...s.variants, [pageId]: next.variant },
      /* The deck on screen is no longer the one the server saved, so the
         recorder has something to write again. Without this a regenerated page
         never reached the Library — it stayed marked as already-saved. */
      reopened: false,
      /* The recorder waits on this. Without it the run saves the moment the
         deterministic page lands and the Library keeps a page the merchant
         watched get replaced. */
      rewriting: s.rewriting + 1,
    }));

    /* Regenerate goes down the same road a build does — generator first, then
       the model. It did not, and the effect was worse than it sounds: a page
       the model had designed reverted to a generator page, silently, which
       reads as the model having produced something worse.

       `rebuilding` stays set until the model answers, so the card holds its
       morph for the whole call rather than flashing the plain page and
       swapping it a minute later.

       No abort signal: the build's controller belongs to the build, and if the
       merchant cancelled that one it is already aborted — passing it here
       would kill the regenerate before it started. */
    void improvePage(next, brief).then((result) => {
      set((s) => {
        const stale = !s.pages.some(
          (p) => p.id === pageId && p.variant === next.variant,
        );
        /* A new build started while this was in flight. Its pages and its token
           count are not ours to touch — but the spinner is, or the card spins
           for ever. */
        if (stale)
          return {
            rewriting: Math.max(0, s.rewriting - 1),
            rebuilding: s.rebuilding.filter((id) => id !== pageId),
          };

        return {
          tokens: s.tokens + result.tokens,
          rewriting: Math.max(0, s.rewriting - 1),
          rebuilding: s.rebuilding.filter((id) => id !== pageId),
          pages:
            result.via === "none"
              ? s.pages
              : s.pages.map((p) => (p.id === pageId ? result.page : p)),
        };
      });
    });
  },

  retryFailed: async () => {
    const { brief, failures } = get();
    if (!brief || failures.length === 0) return;

    const ids = failures.map((f) => f.pageId);
    controller?.abort();
    controller = new AbortController();

    set({
      failures: [],
      screen: "generating",
      /* The deck is about to differ from the one the server saved. */
      reopened: false,
    });

    /* Retried pages went down the deterministic path and stopped there, so a
       page that failed once came back as a generator page sitting in a deck of
       designed ones — visibly worse than its neighbours, with nothing to say
       why. Same road as a build: generator first, then the model. */
    const settling: Promise<void>[] = [];

    try {
      await generatePages(
        brief,
        (page) => {
          settling.push(
            improvePage(page, brief, controller?.signal).then((result) => {
              set((s) => ({
                tokens: s.tokens + result.tokens,
                pages: [...s.pages, result.page].sort((a, b) => a.index - b.index),
              }));
            }),
          );
        },
        controller.signal,
        {
          onlyPageIds: ids,
          onPageFailed: (f) => set((s) => ({ failures: [...s.failures, f] })),
        },
      );

      await Promise.all(settling);
      if (controller?.signal.aborted) return;
      set({ screen: "results" });
    } catch (err) {
      if (!isAbortError(err)) throw err;
    }
  },

  loadLibrary: async (runs) => {
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;

    set({
      screen: "generating",
      brief: runs.at(-1)?.brief ?? null,
      /* THE POINT OF THIS MAP. The line above keeps ONE brief for a deck built
         from many runs, so anything reading `brief` shows the last run's brief
         on every page — including the ones run A built. Kept per run here, and
         resolved per page by `briefForPage`. */
      briefs: Object.fromEntries(runs.map((r) => [r.id, r.brief])),
      plan: [],
      pages: [],
      failures: [],
      variants: {},
      reopened: true,
      filter: "all",
      previewIndex: null,
    });

    try {
      for (const run of runs) {
        if (signal.aborted) return;

        if (run.snapshot && run.snapshot.length > 0) {
          /* `runId` rather than splitting the id on `::` later. That convention
             has two writers and no readers — it exists so ids do not collide
             across runs, not as an encoding — and the first reader would break
             the day a run id contains `::`. */
          const saved = run.snapshot.map((page) => ({
            ...page,
            id: `${run.id}::${page.id}`,
            runId: run.id,
          }));
          set((s) => ({ pages: [...s.pages, ...saved] }));
          continue;
        }

        await generatePages(
          run.brief,
          (page) =>
            set((s) => ({
              pages: [...s.pages, { ...page, id: `${run.id}::${page.id}`, runId: run.id }],
            })),
          signal,
          { variants: run.variants, instant: true },
        );
      }
      set({ screen: "results" });
    } catch (err) {
      if (!isAbortError(err)) throw err;
    }
  },

  /* ---- results / preview ---------------------------------------------- */

  setFilter: (f) => set({ filter: f }),

  openPreview: (index) => set({ previewIndex: index, zoom: null }),
  closePreview: () => set({ previewIndex: null }),

  stepPreview: (delta) =>
    set((s) => {
      if (s.previewIndex === null) return s;
      const visible = visiblePages(s);
      if (visible.length === 0) return s;
      const next =
        (s.previewIndex + delta + visible.length) % visible.length;
      return { previewIndex: next, zoom: null };
    }),

  /* Remembers the width we came from so the preview can spring the frame from
     the old size to the new one without a layout animation — the mockup stays
     laid out at its true width the whole time. */
  setDevice: (device) =>
    set((s) => ({
      device,
      prevDeviceWidth:
        DEVICES.find((d) => d.id === s.device)?.width ?? DEVICES[0].width,
      zoom: null,
    })),
  setZoom: (zoom) => set({ zoom }),

  nudgeZoom: (delta) =>
    set((s) => {
      const base = s.zoom ?? 1;
      const next = Math.min(2, Math.max(0.5, base + delta));
      return { zoom: Math.round(next * 100) / 100 };
    }),

  markShortcutsSeen: () => set({ hasSeenShortcuts: true }),
  setFailFirstN: (n) => set({ failFirstN: n }),
}));

/* ---- brief <-> draft ---------------------------------------------------- */


/* ---- selectors ---------------------------------------------------------- */

export function visiblePages(s: Pick<State, "pages" | "filter">): PageMockup[] {
  if (s.filter === "all") return s.pages;
  return s.pages.filter((p) => p.category === s.filter);
}

/* Selector returns a fresh array, so it must not be passed to useStore
   directly — zustand compares with Object.is and would re-render forever. */
export function useVisiblePages() {
  const pages = useStore((s) => s.pages);
  const filter = useStore((s) => s.filter);
  return useMemo(
    () => (filter === "all" ? pages : pages.filter((p) => p.category === filter)),
    [pages, filter],
  );
}

/**
 * Preview default for a hand rather than a desk.
 *
 * The device only. A 1440px desktop frame cannot be read on a 390px screen at
 * any Fit — 390/1440 is about 25%, which puts the body text at three pixels
 * tall — so every control looked broken because nothing it changed was visible.
 * A 390px frame on a 390px screen fits at roughly 95% and reads immediately.
 *
 * NOT the zoom. That was tried and was wrong: 50% was measured against the
 * desktop frame, and against the phone frame it halves something already the
 * right size.
 *
 * A hook, and shared, because two separate routes open a preview — the Design
 * app and the Library. A default, not a lock: the device buttons still win.
 */
export function usePreviewDefaults(): void {
  const setDevice = useStore((s) => s.setDevice);

  useEffect(() => {
    if (window.innerWidth >= 640) return;
    setDevice("mobile");
  }, [setDevice]);
}
