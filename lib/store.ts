"use client";

import { useMemo } from "react";
import { create } from "zustand";
import {
  MAX_BRAND_COLORS,
  MAX_IMAGES,
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
import { rewritePageCopy } from "./ai/rewritePage";
import { DEVICES } from "./generate/types";
import type { DeviceId, GenerateFailure, PageMockup } from "./generate/types";
import type { CategoryId } from "./pageCatalog";

/* ==========================================================================
   One store for the brief and the results. Deliberately small: everything that
   is genuinely local (hover state, accordion open/closed) stays in components.
   ========================================================================== */

export type Screen = "brief" | "generating" | "results";

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

  plan: PlanEntry[];
  pages: PageMockup[];
  failures: GenerateFailure[];
  variants: Record<string, number>;
  /** true when the deck on screen was reopened from the Library, so the recorder
      knows there is nothing new to save */
  reopened: boolean;
  /** model tokens spent on the current build. 0 when no model is configured. */
  tokens: number;
  /** page ids currently being rebuilt, so their card can show the morph again */
  rebuilding: string[];

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
  setSell: (v: string) => void;
  setStyle: (v: VisualStyleId) => void;
  setStoreType: (v: StoreTypeId) => void;
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
  cancel: () => void;
  editBrief: () => void;
  regenerateAll: () => Promise<void>;
  regenerateOne: (pageId: string) => void;
  retryFailed: () => Promise<void>;

  /** Rebuild a run saved in the Library. Uses the same generator, instantly. */
  loadSavedRun: (brief: Brief, variants: Record<string, number>) => Promise<void>;
  /** Rebuild EVERY saved run into one deck — what the Library shows. */
  loadLibrary: (
    runs: { id: string; brief: Brief; variants: Record<string, number> }[],
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

  plan: [],
  pages: [],
  failures: [],
  variants: {},
  reopened: false,
  tokens: 0,
  rebuilding: [],

  filter: "all",

  previewIndex: null,
  device: "desktop",
  prevDeviceWidth: 1440,
  zoom: null,
  hasSeenShortcuts: false,
  failFirstN: 0,

  /* ---- brief fields --------------------------------------------------- */

  setSell: (v) => set((s) => ({ draft: { ...s.draft, whatYouSell: v } })),
  setStyle: (v) => set((s) => ({ draft: { ...s.draft, visualStyle: v } })),
  setStoreType: (v) => set((s) => ({ draft: { ...s.draft, storeType: v } })),
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
    const { draft, failFirstN } = get();
    const parsed = validateBrief(draft);
    if (!parsed.success) return;

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
      plan,
      pages: [],
      failures: [],
      variants: {},
      reopened: false,
      tokens: 0,
      filter: "all",
      previewIndex: null,
    });

    try {
      await generatePages(
        brief,
        (page) => {
          /* The page is shown the moment it is generated, then improved in
             place. Waiting for the model before showing anything would trade a
             deck that fills in card by card for a blank screen and a spinner —
             and the deterministic page is already a complete, correct page. */
          set((s) => ({ pages: [...s.pages, page] }));

          void rewritePageCopy(page, brief, controller?.signal).then((result) => {
            set((s) => ({
              tokens: s.tokens + result.tokens,
              pages: result.used
                ? s.pages.map((p) => (p.id === page.id ? result.page : p))
                : s.pages,
            }));
          });
        },
        controller.signal,
        {
          onPageFailed: (f) =>
            set((s) => ({ failures: [...s.failures, f] })),
          failFirstN: failFirstN || undefined,
        },
      );
      set({ screen: "results" });
    } catch (err) {
      if (!isAbortError(err)) throw err;
      // cancel() has already returned the user to the brief.
    }
  },

  cancel: () => {
    controller?.abort();
    controller = null;
    set({ screen: "brief", pages: [], failures: [], plan: [] });
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
      rebuilding: s.rebuilding.filter((id) => id !== pageId),
    }));
  },

  retryFailed: async () => {
    const { brief, failures } = get();
    if (!brief || failures.length === 0) return;

    const ids = failures.map((f) => f.pageId);
    controller?.abort();
    controller = new AbortController();

    set({ failures: [], screen: "generating" });

    try {
      await generatePages(
        brief,
        (page) =>
          set((s) => ({
            pages: [...s.pages, page].sort((a, b) => a.index - b.index),
          })),
        controller.signal,
        {
          onlyPageIds: ids,
          onPageFailed: (f) => set((s) => ({ failures: [...s.failures, f] })),
        },
      );
      set({ screen: "results" });
    } catch (err) {
      if (!isAbortError(err)) throw err;
    }
  },

  /* ---- library --------------------------------------------------------- */

  /**
   * Reopen a saved run.
   *
   * No fake thinking time: the merchant already waited for this deck once, and
   * the generating screen would be theatre. Because generation is deterministic,
   * replaying the brief and the variant numbers rebuilds exactly the pages that
   * were saved — nothing about buildPage changes here.
   */
  loadSavedRun: async (brief, variants) => {
    controller?.abort();
    controller = new AbortController();

    const plan: PlanEntry[] = expandSelection(brief.pages).map((p) => ({
      pageId: p.pageId,
      pageType: p.pageType,
      label: p.pageType,
      copyIndex: p.copyIndex,
      copyTotal: p.copyTotal,
    }));

    set({
      screen: "generating",
      draft: briefToDraft(brief),
      brief,
      plan,
      pages: [],
      failures: [],
      variants,
      reopened: true,
      filter: "all",
      previewIndex: null,
    });

    try {
      await generatePages(
        brief,
        (page) => set((s) => ({ pages: [...s.pages, page] })),
        controller.signal,
        { variants, instant: true },
      );
      set({ screen: "results" });
    } catch (err) {
      if (!isAbortError(err)) throw err;
    }
  },

  /**
   * Every saved build, as one deck.
   *
   * The Library shows the pages themselves rather than a list of builds: two
   * builds of three and two pages are five pages, and that is what a merchant is
   * looking for. Each run is replayed through the same generator, so every page
   * is identical to the one that was saved.
   *
   * Page ids are namespaced with the run id. Two builds both contain a page whose
   * id is "home", and duplicate React keys make the grid reuse the wrong DOM and
   * the preview step to the wrong page. The page is BUILT with its original id so
   * its seed — and therefore its content — is unchanged; only the identity used by
   * the deck is rewritten.
   */
  loadLibrary: async (runs) => {
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;

    set({
      screen: "generating",
      brief: runs.at(-1)?.brief ?? null,
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
        await generatePages(
          run.brief,
          (page) =>
            set((s) => ({
              pages: [...s.pages, { ...page, id: `${run.id}::${page.id}` }],
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

/** Reopening a run has to refill the form as well as the deck, or "Edit brief"
    lands on an empty form and the merchant loses the run. */
function briefToDraft(brief: Brief): BriefDraft {
  return {
    whatYouSell: brief.whatYouSell,
    visualStyle: brief.visualStyle,
    storeType: brief.storeType,
    prompt: brief.prompt,
    brandColors: [...brief.brandColors],
    referenceImages: brief.referenceImages,
    pages: { ...brief.pages },
  };
}

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
