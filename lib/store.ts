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
  buildVariant,
  expandSelection,
  generatePages,
  isAbortError,
  regeneratePage,
} from "./generate";
import {
  listHistory,
  removeRun,
  saveRun,
  clearHistory,
  openRun,
  type HistoryEntry,
} from "./history";
import { shareUrl, SAFE_URL_LENGTH, type SharedRun } from "./shareLink";
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
  /** pageId -> the instruction that page was last regenerated with */
  notes: Record<string, string>;
  /** page ids currently being rebuilt, so their card can show the morph again */
  rebuilding: string[];

  /* ---- workflow ---- */
  /** recent runs, read from localStorage on demand (never during render) */
  history: HistoryEntry[];
  historyOpen: boolean;
  /** page id whose variants are being compared, or null */
  compareId: string | null;
  /** result of the last Share press, so the button can report honestly */
  share: { url: string; tooLong: boolean } | null;

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
  regenerateOne: (pageId: string, note?: string) => void;
  retryFailed: () => Promise<void>;

  /* ---- workflow ---- */
  makeShareLink: () => void;
  clearShareLink: () => void;
  loadHistory: () => void;
  openHistory: () => void;
  closeHistory: () => void;
  restoreRun: (run: SharedRun) => Promise<void>;
  openHistoryEntry: (id: string) => Promise<void>;
  deleteHistoryEntry: (id: string) => void;
  clearAllHistory: () => void;
  openCompare: (pageId: string) => void;
  closeCompare: () => void;
  useVariant: (pageId: string, variant: number) => void;

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
  notes: {},
  rebuilding: [],

  history: [],
  historyOpen: false,
  compareId: null,
  share: null,

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
      notes: {},
      filter: "all",
      previewIndex: null,
      compareId: null,
      share: null,
    });

    try {
      await generatePages(
        brief,
        (page) => set((s) => ({ pages: [...s.pages, page] })),
        controller.signal,
        {
          onPageFailed: (f) =>
            set((s) => ({ failures: [...s.failures, f] })),
          failFirstN: failFirstN || undefined,
        },
      );
      /* Saved on success only. A cancelled or wholly failed run is not something
         the merchant wants to find in their history. `new Date()` is read here,
         outside lib/generate, so the generator stays free of clock reads. */
      set({
        screen: "results",
        history: saveRun(
          { brief, variants: {}, notes: {} },
          new Date(),
        ),
      });
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

  regenerateOne: (pageId, note) => {
    const { brief, pages } = get();
    if (!brief) return;
    const existing = pages.find((p) => p.id === pageId);
    if (!existing) return;

    set((s) => ({ rebuilding: [...s.rebuilding, pageId] }));

    const next = regeneratePage(brief, existing, note);
    set((s) => {
      const notes = { ...s.notes };
      if (next.note) notes[pageId] = next.note;
      else delete notes[pageId];
      return {
        pages: s.pages.map((p) => (p.id === pageId ? next : p)),
        variants: { ...s.variants, [pageId]: next.variant },
        notes,
        rebuilding: s.rebuilding.filter((id) => id !== pageId),
        /* The link no longer describes what is on screen. Better to make the
           user press Share again than to hand out a stale link. */
        share: null,
      };
    });
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

  /* ---- workflow -------------------------------------------------------- */

  /* A link carries the brief, not the pages — see lib/shareLink.ts. Built on
     press rather than kept in sync, so it always matches what is on screen. */
  makeShareLink: () => {
    const { brief, variants, notes } = get();
    if (!brief || typeof window === "undefined") return;
    const url = shareUrl(
      { brief, variants, notes },
      window.location.origin,
      window.location.pathname,
    );
    set({ share: { url, tooLong: url.length > SAFE_URL_LENGTH } });
  },

  clearShareLink: () => set({ share: null }),

  /* localStorage is read here and never during render — a component that read
     it directly would give the server and the client different markup. */
  loadHistory: () => set({ history: listHistory() }),
  openHistory: () => set({ history: listHistory(), historyOpen: true }),
  closeHistory: () => set({ historyOpen: false }),

  /**
   * Rebuild a run from a link or a history entry.
   *
   * No fake thinking time: the merchant is reopening work they already waited
   * for once, and the generating screen would be theatre. The pages come out
   * identical to the ones the run originally produced.
   */
  restoreRun: async (run) => {
    controller?.abort();
    controller = new AbortController();

    const plan: PlanEntry[] = expandSelection(run.brief.pages).map((p) => ({
      pageId: p.pageId,
      pageType: p.pageType,
      label: p.pageType,
      copyIndex: p.copyIndex,
      copyTotal: p.copyTotal,
    }));

    set({
      screen: "generating",
      draft: briefToDraft(run.brief),
      brief: run.brief,
      plan,
      pages: [],
      failures: [],
      variants: run.variants,
      notes: run.notes,
      filter: "all",
      previewIndex: null,
      historyOpen: false,
      compareId: null,
      share: null,
    });

    try {
      await generatePages(
        run.brief,
        (page) => set((s) => ({ pages: [...s.pages, page] })),
        controller.signal,
        {
          variants: run.variants,
          notes: run.notes,
          instant: true,
          onPageFailed: (f) => set((s) => ({ failures: [...s.failures, f] })),
        },
      );
      set({ screen: "results" });
    } catch (err) {
      if (!isAbortError(err)) throw err;
    }
  },

  openHistoryEntry: async (id) => {
    const entry = listHistory().find((e) => e.id === id);
    if (!entry) return;
    const decoded = openRun(entry);
    if (!decoded.ok) {
      // Unreadable entry — drop it rather than leave a dead row in the list.
      set({ history: removeRun(id) });
      return;
    }
    await get().restoreRun(decoded.run);
  },

  deleteHistoryEntry: (id) => set({ history: removeRun(id) }),
  clearAllHistory: () => set({ history: clearHistory() }),

  openCompare: (pageId) => set({ compareId: pageId, previewIndex: null }),
  closeCompare: () => set({ compareId: null }),

  /* Compare renders alternatives without touching state, so picking one is the
     only place it writes — and it goes through the same path as Regenerate so
     the note and the variant stay consistent. */
  useVariant: (pageId, variant) => {
    const { brief, pages } = get();
    if (!brief) return;
    const existing = pages.find((p) => p.id === pageId);
    if (!existing || existing.variant === variant) {
      set({ compareId: null });
      return;
    }
    const next = buildVariant(brief, existing, variant);
    set((s) => ({
      pages: s.pages.map((p) => (p.id === pageId ? next : p)),
      variants: { ...s.variants, [pageId]: variant },
      compareId: null,
      share: null,
    }));
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

/** A restored run has to refill the form as well as the deck, otherwise Edit
    brief opens on an empty form and the merchant loses the run. */
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
