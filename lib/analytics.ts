/* ==========================================================================
   Measuring what people do, without getting in their way.

   THE RULE THIS FILE IS BUILT AROUND: nothing here may ever break anything
   else. Every path is wrapped, every failure is swallowed, and no caller ever
   waits for it. Analytics that can take a sign-in down with it is worse than
   no analytics at all — it turns a question about conversion into an outage.

   BATCHED, because a landing page fires three events in the first second and
   three requests to answer three questions nobody is watching in real time is
   three requests competing with the page. They go out together a moment later,
   or immediately on the way out of the page, whichever comes first.

   NO PERSONAL DATA. The visitor id is a random value this browser generated
   for itself. It exists so a landing view and the sign-in that followed can be
   recognised as one visit — which is the whole of "where does traffic drop" —
   and it says nothing about who the person is.
   ========================================================================== */

const VISITOR_KEY = "pfd.visitor";
const FLUSH_MS = 1200;

type Queued = {
  id: string;
  name: string;
  props: Record<string, unknown>;
  visitorId: string;
  at: string;
};

let queue: Queued[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let listening = false;

function uid(): string {
  try {
    if (crypto?.randomUUID) return crypto.randomUUID();
  } catch {
    // fall through
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * This browser's id, made up on first use.
 *
 * A FAILURE HERE IS NOT A FAILURE. Private mode and blocked storage both throw,
 * and the answer is a per-page id rather than nothing: the events still count
 * toward totals, they just cannot be joined into one visit. A funnel that
 * undercounts returning visitors is worth having; a `track` that throws is not.
 */
let fallbackId: string | null = null;

function visitorId(): string {
  try {
    const stored = window.localStorage.getItem(VISITOR_KEY);
    if (stored) return stored;
    const made = uid();
    window.localStorage.setItem(VISITOR_KEY, made);
    return made;
  } catch {
    /* A REAL ID, not the string "anon", and this was both things wrong at
       once. A constant would have merged every private-mode visitor into one
       person, so a step counted in distinct visitors would read as one visit
       however many there were. And it is four characters, which the endpoint's
       own minimum of eight rejects — so those events were not merged, they
       were dropped, and the count they belonged in was silently short.

       Held for the page's lifetime so the events of one visit still join up,
       which is as much as a browser that will not remember anything can give. */
    fallbackId ??= uid();
    return fallbackId;
  }
}

/**
 * Things that are not people.
 *
 * `design_landing_viewed` is the denominator of every ratio on the analytics
 * screen, and the landing page is public — so crawlers land in it and quietly
 * make every conversion rate look worse than it is. This catches the ones that
 * announce themselves. It does NOT catch the ones that do not, and the screen
 * says so rather than pretending the number is clean.
 */
function looksAutomated(): boolean {
  try {
    if (navigator.webdriver) return true;
    return /bot|crawler|spider|crawling|headless|lighthouse|pagespeed/i.test(
      navigator.userAgent,
    );
  } catch {
    return false;
  }
}

function send(events: Queued[]): void {
  if (events.length === 0) return;
  const body = JSON.stringify({ events });

  try {
    /* `sendBeacon` survives the page being closed, which is exactly when the
       most interesting event of a visit tends to fire — the CTA click that
       navigates away. `fetch` with `keepalive` is the fallback and does the
       same thing; a plain fetch would be cancelled mid-flight. */
    if (navigator.sendBeacon?.(EVENTS_URL, new Blob([body], { type: "application/json" })))
      return;
  } catch {
    // fall through to fetch
  }

  try {
    void fetch(EVENTS_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Nothing left to try, and nothing that should be said about it.
  }
}

const EVENTS_URL = "/api/events";

function flush(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const batch = queue;
  queue = [];
  send(batch);
}

/**
 * Record one thing that happened.
 *
 * Fire and forget: it returns nothing, waits for nothing, and throws nothing.
 * A caller should be able to put this on a line of its own next to the thing
 * it is measuring and never think about it again.
 */
export function track(name: string, props: Record<string, unknown> = {}): void {
  if (typeof window === "undefined") return;

  try {
    if (looksAutomated()) return;

    queue.push({
      id: uid(),
      name,
      props,
      visitorId: visitorId(),
      at: new Date().toISOString(),
    });

    /* Sent on the way out as well as on a timer. Without this the CTA click
       that leaves the page is the one event that never arrives — and it is the
       one the funnel is about. */
    if (!listening) {
      listening = true;
      window.addEventListener("pagehide", flush);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") flush();
      });
    }

    /* A batch big enough to be worth a request goes now rather than waiting
       out the timer. */
    if (queue.length >= 20) {
      flush();
      return;
    }
    if (!timer) timer = setTimeout(flush, FLUSH_MS);
  } catch {
    // See the note at the top of this file.
  }
}

/* ---- the vocabulary ------------------------------------------------------

   Named constants rather than strings at the call sites. A typo in a string is
   an event that silently never appears on the analytics screen — it does not
   error, it does not warn, the count is simply zero and looks like nobody did
   the thing. These are also the list `app/api/events/route.ts` validates the
   shape of, and the list the admin screen reads.
   ------------------------------------------------------------------------ */

export const EV = {
  landingViewed: "design_landing_viewed",
  ctaClicked: "design_cta_clicked",
  galleryOpened: "design_gallery_opened",

  signinViewed: "design_signin_viewed",
  signinSubmitted: "design_signin_submitted",
  registerLinkClicked: "design_register_link_clicked",

  registerViewed: "design_register_viewed",
  shopifySignupClicked: "design_shopify_signup_clicked",
  registerSubmitted: "design_register_submitted",

  registeredViewed: "design_registered_viewed",
  signinReturnClicked: "design_signin_return_clicked",

  briefViewed: "design_brief_viewed",
  briefModeSelected: "design_brief_mode_selected",
  briefExampleClicked: "design_brief_example_clicked",
  generateStarted: "design_generate_started",

  generateCompleted: "design_generate_completed",
  generateFailed: "design_generate_failed",
  generateCancel: "design_generate_cancel",

  pageExported: "design_page_exported",
  pageRegenerate: "design_page_regenerate",
  briefEdit: "design_brief_edit",
  pagePreview: "design_page_preview",
  pagePngDownload: "design_page_png_download",

  /* ---- things that exist on more than one page ------------------------

     THESE CARRY A `surface`, AND THAT IS THE WHOLE POINT OF THEM. The install
     button is on the landing page, inside the collections section, under the
     export controls and in the popup after a download — four places, one
     action. Counted under one name with no parameter, the total would be the
     only number available and "which placement works" would be unanswerable.

     `surface` names the SCREEN, not the component, because the collections
     section itself appears on two of them: on the landing page a visitor is
     browsing, on the build screen a merchant is waiting fifteen minutes. The
     same click means different things there and the component cannot know
     which it is, so whoever mounts it says. */
  pageflyInstallClicked: "design_pagefly_install_clicked",
  collectionExported: "design_collection_exported",
} as const;

/** Where a shared element was mounted. One list, so a typo at a call site is a
    type error rather than a value that quietly never groups with its siblings. */
export type Surface =
  | "landing"
  | "landing_collections"
  | "building_collections"
  | "results"
  | "export_popup"
  /* THE TOP BAR, ONE VALUE PER SCREEN. It is the same button in the same place
     on six screens, and lumping them into one `topbar` would be the mistake
     the collection exports already made: a number that adds up correctly and
     cannot say whether it works on the landing page or only for people already
     signed in. */
  | "topbar_landing"
  | "topbar_login"
  | "topbar_register"
  | "topbar_design"
  | "topbar_library"
  | "topbar_feedback";
