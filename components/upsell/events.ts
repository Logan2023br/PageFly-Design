"use client";

/* One beacon to /api/upsell/events. Fire and forget: a page that cannot count
   a click must never stop the click. `sendBeacon` survives the tab navigating
   away (the CTA opens the Shopify admin); keepalive fetch is its fallback. */

export type UpsellEvent = {
  id: string;
  type: "view" | "preview_open" | "device_toggle" | "download" | "cta_click" | "feedback";
  page_slot?: number | null;
  rating?: number | null;
  comment?: string | null;
  detail?: Record<string, string | number | boolean>;
};

export function sendEvent(e: UpsellEvent): void {
  const body = JSON.stringify(e);
  try {
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const ok = navigator.sendBeacon("/api/upsell/events", new Blob([body], { type: "application/json" }));
      if (ok) return;
    }
  } catch {
    // fall through to fetch
  }
  void fetch("/api/upsell/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
    credentials: "same-origin",
  }).catch(() => undefined);
}

/** For the feedback form, which wants to know it landed. */
export async function postEvent(e: UpsellEvent): Promise<boolean> {
  try {
    const res = await fetch("/api/upsell/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(e),
      credentials: "same-origin",
    });
    return res.ok;
  } catch {
    return false;
  }
}
