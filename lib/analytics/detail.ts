import type { EventByStore } from "../db/types";
import { EV } from "../analytics";

/* ==========================================================================
   WHICH TILES OPEN, AND INTO WHAT.

   A tile reads "28 exports · 4 stores" and the next question is never a
   different number, it is always the same one: WHICH four, which pages, how
   many times each. This table is the answer to "which tiles can answer that",
   and the answer is decided by one thing — whether the event knows a store.

   THREE KINDS OF EVENT, and only two of them belong here.

   1. BEHIND THE GATE. `/api/events` stamps the domain off the session cookie,
      so everything fired while signed in already carries it. These open by the
      column and need nothing but a row in this table.

   2. AT THE GATE. A sign-in or a registration happens BEFORE there is a
      session, so the column is null for every one of them — but the merchant
      typed a domain into the form, and it rides on the event's own props. These
      open by `groupProp` instead. This is the tile people actually want: "Not
      registered · 31" becomes thirty-one named stores that were turned away.

   3. IN FRONT OF THE GATE. The landing page, the CTA, the moving strip. There
      is no store and there never was one — the visitor has not told us who they
      are and has no reason to have. THESE ARE DELIBERATELY ABSENT. A drill-down
      there could only show a column of anonymous browser ids, which reads as
      detail and carries none, and the parameter breakdown those tiles do have
      is already drawn on the screen as a split. An empty table would be worse
      than no table: it would look like a bug rather than an honest limit.

   ADDING ONE IS A ROW HERE AND NOTHING ELSE. The route reads this table to
   decide what it will serve, so an event absent from it is refused rather than
   turned into a query — the `props->>` key must never come from a query string.
   ========================================================================== */

export type DetailSpec = {
  /**
   * The parameter to break each store's presses down by, or null when the
   * event carries nothing worth splitting.
   */
  propKey: string | null;
  /**
   * A parameter holding the store domain, for events that fire before there is
   * a session. Null means the domain column is the row key.
   */
  groupProp?: string | null;
  /** What one row is, in the reader's words. */
  unit: string;
  /** What `propKey` measures, for the column heading. */
  partLabel: string;
};

export const DETAIL_OF: Record<string, DetailSpec> = {
  /* ---- at the gate: the store is on the props, not the column ---------- */

  /* The most-opened tile on the screen, and the reason `groupProp` exists.
     `result` splits one store's attempts into refused / admitted / malformed,
     which is how a merchant who mistyped once and got in second time reads
     differently from one who never got in at all. */
  [EV.signinSubmitted]: {
    propKey: "result",
    groupProp: "domain",
    unit: "store",
    partLabel: "outcome",
  },
  [EV.registerSubmitted]: {
    propKey: "result",
    groupProp: "domain",
    unit: "store",
    partLabel: "outcome",
  },

  /* ---- behind the gate: the column already holds the store ------------- */

  [EV.briefViewed]: { propKey: null, unit: "store", partLabel: "" },
  [EV.briefModeSelected]: { propKey: "mode", unit: "store", partLabel: "mode" },
  [EV.briefExampleClicked]: { propKey: null, unit: "store", partLabel: "" },
  [EV.briefEdit]: { propKey: null, unit: "store", partLabel: "" },

  [EV.generateStarted]: { propKey: null, unit: "store", partLabel: "" },
  /* `pages` rather than `duration_seconds`: a deck size repeats across stores
     and groups usefully, a duration in seconds is unique to every build and
     would produce one part per row. The duration is on the tile above. */
  [EV.generateCompleted]: { propKey: "pages", unit: "store", partLabel: "deck size" },
  /* The one drill-down that is a bug report. A store appearing here twice with
     the same reason is a store that cannot use the product at all. */
  [EV.generateFailed]: { propKey: "reason", unit: "store", partLabel: "reason" },
  [EV.generateCancel]: { propKey: null, unit: "store", partLabel: "" },

  /* Which pages a merchant thought were worth taking — the question that
     decides which page types are worth making more of. */
  [EV.pageExported]: { propKey: "page_type", unit: "store", partLabel: "page" },
  [EV.pagePreview]: { propKey: "page_type", unit: "store", partLabel: "page" },
  [EV.pageRegenerate]: { propKey: null, unit: "store", partLabel: "" },
  [EV.pagePngDownload]: { propKey: null, unit: "store", partLabel: "" },

  [EV.collectionExported]: { propKey: "collection", unit: "store", partLabel: "collection" },

  /* Fired from five placements, and signed-out on three of them — so some rows
     come back with no store. That is the finding rather than a gap: presses
     from people who never built anything are the ones worth knowing about. */
  [EV.pageflyInstallClicked]: { propKey: "surface", unit: "store", partLabel: "placement" },
};

export type DetailRow = EventByStore;

export type DetailResponse =
  | {
      ok: true;
      event: string;
      unit: string;
      partLabel: string;
      rows: DetailRow[];
    }
  | { ok: false; error: string };
