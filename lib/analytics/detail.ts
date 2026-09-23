import type { EventByStore, EventHit } from "../db/types";
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

   3. IN FRONT OF THE GATE. The landing page, the CTA, the gallery. There is
      usually no store — a stranger has not told us who they are and has no
      reason to. These WERE left out on the reasoning that a column of anonymous
      browser ids reads as detail and carries none.

      THAT REASONING WAS ABOUT THE WRONG TABLE. It is true of the per-store
      fold, which for a signed-out event collapses every press in the window
      into one row saying "no store · 85" — that really is a screen that looks
      broken. It is not true of the feed beside it, which is a list of presses
      in time order, and time order is most of what anyone wants from the front
      door: which button, in what order, in one sitting.

      And they are not all anonymous. `/api/events` stamps the domain off the
      session cookie, so a merchant who is already signed in and comes back to
      the front door IS named. A feed where most rows say signed out and a few
      name a store is not a gap — it is the answer to "is this traffic strangers
      or our own testers", which nobody could ask before.

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

  /* A store that got in without the register form. Fired from the server, which
     stamps the domain on the event itself — so unlike the two above this one
     needs no `groupProp`, and the row key is the column. `verified` says whether
     Shopify confirmed the store or was unreachable at the time, which is the one
     thing worth checking a row against afterwards. */
  [EV.loginNoRegister]: { propKey: "verified", unit: "store", partLabel: "verified" },

  /* ---- behind the gate: the column already holds the store ------------- */

  [EV.briefViewed]: { propKey: null, unit: "store", partLabel: "" },
  [EV.briefModeSelected]: { propKey: "mode", unit: "store", partLabel: "mode" },
  [EV.briefExampleClicked]: { propKey: "which", unit: "store", partLabel: "example" },
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

  /* ---- in front of the gate: mostly anonymous, and the feed is the point --

     `unit` still reads "store" because the fold still groups by store where one
     is known; on these events most of it lands in the single signed-out row and
     the list of presses underneath is what is being opened for.

     One row per CONTROL, so each `propKey` is the thing that tells the buttons
     apart — `location` for the five links to /design, `to` for a nav anchor or
     a footer link, `section` for which band was reached, `from` for the two
     places a page preview opens from. */
  [EV.landingViewed]: { propKey: null, unit: "store", partLabel: "" },
  [EV.landingSection]: { propKey: "section", unit: "store", partLabel: "section" },
  [EV.ctaClicked]: { propKey: "location", unit: "store", partLabel: "control" },
  [EV.landingNav]: { propKey: "to", unit: "store", partLabel: "anchor" },
  [EV.landingLinkClicked]: { propKey: "to", unit: "store", partLabel: "link" },
  [EV.showcaseFilter]: { propKey: "set", unit: "store", partLabel: "store" },
  [EV.howStepOpened]: { propKey: "step", unit: "store", partLabel: "step" },
  [EV.galleryOpened]: { propKey: "from", unit: "store", partLabel: "where from" },
  [EV.showcaseFileDownloaded]: { propKey: "page_type", unit: "store", partLabel: "page" },
  [EV.showcaseFrameChanged]: { propKey: "frame", unit: "store", partLabel: "width" },

  /* The gate's own two page views, which had no drill-down either — so "who
     reached the form today" was unanswerable while "who submitted it" was not. */
  [EV.signinViewed]: { propKey: null, unit: "store", partLabel: "" },
  [EV.registerViewed]: { propKey: null, unit: "store", partLabel: "" },
  [EV.registerLinkClicked]: { propKey: null, unit: "store", partLabel: "" },
  [EV.shopifySignupClicked]: { propKey: null, unit: "store", partLabel: "" },
  [EV.registeredViewed]: { propKey: null, unit: "store", partLabel: "" },
  [EV.signinReturnClicked]: { propKey: null, unit: "store", partLabel: "" },
};

export type DetailRow = EventByStore;

export type DetailResponse =
  | {
      ok: true;
      event: string;
      unit: string;
      partLabel: string;
      rows: DetailRow[];
      /**
       * The individual presses, newest first.
       *
       * Beside `rows` rather than instead of them: the fold answers "which
       * stores and how often", the feed answers "who, and when". On a
       * signed-in event both are worth having; on a signed-out one the fold is
       * a single row and the feed is the whole of the detail.
       */
      hits: EventHit[];
    }
  | { ok: false; error: string };
