"use client";

import { useEffect, useRef } from "react";

/* ==========================================================================
   The context every /collection-pages event carries: where a visitor came
   from, and on what size of screen. Read by Admin → Collection pages →
   Analytics.

   `entry` CANNOT BE READ OFF `document.referrer` ALONE. Moving between these
   screens is a client-side navigation, and the referrer keeps saying whatever
   brought the visitor to the site in the first place — so a click from the
   list to a set would read as "came from Google". The last screen of this
   section is remembered here for that; the referrer answers only for the
   first screen of a visit.
   ========================================================================== */

type Screen = "list" | "set" | "checkout";
let last: Screen | null = null;

/** The referring host, or "" for none. Host only — never the path or query. */
export function refHost(): string {
  try {
    if (!document.referrer) return "";
    const host = new URL(document.referrer).hostname.replace(/^www\./, "");
    return host === window.location.hostname.replace(/^www\./, "") ? "" : host.slice(0, 80);
  } catch {
    return "";
  }
}

export function screenBucket(): "mobile" | "tablet" | "desktop" {
  try {
    const w = window.innerWidth;
    return w < 640 ? "mobile" : w < 1024 ? "tablet" : "desktop";
  } catch {
    return "desktop";
  }
}

/**
 * How this screen was reached, and remember it as the last one.
 *
 * list / set / checkout — from that screen of this section.
 * site     — from another page of this app (the landing page, the brief).
 * external — from another site; `refHost()` says which.
 * direct   — typed, bookmarked, or a link with no referrer.
 */
export function entryFor(screen: Screen): string {
  let entry: string;
  if (last) entry = last;
  else {
    try {
      if (!document.referrer) entry = "direct";
      else if (refHost()) entry = "external";
      else entry = "site";
    } catch {
      entry = "direct";
    }
  }
  last = screen;
  return entry;
}

/** Calls `onSeen` once, the first time a third of the element is on screen. */
export function useSeenOnce<T extends Element>(onSeen: () => void) {
  const ref = useRef<T>(null);
  const done = useRef(false);
  const cb = useRef(onSeen);
  useEffect(() => {
    cb.current = onSeen;
  });
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!done.current && entries.some((e) => e.isIntersecting)) {
          done.current = true;
          cb.current();
          io.disconnect();
        }
      },
      { threshold: 0.33 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);
  return ref;
}

/**
 * Fire `send` once per `key` for this mounted screen.
 *
 * AN EFFECT IS NOT "ONCE". React may run a mount effect twice for the same
 * screen — Strict Mode does it on purpose in development, and it did here:
 * every set view arrived twice, a second apart, the second one with the wrong
 * `entry` because the first had already moved `last` on. A ref survives that
 * re-run and a real remount (coming back to the page) starts a fresh one, so
 * it is exactly one event per time somebody actually arrives.
 */
export function useTrackOnce(key: string, send: () => void) {
  const sent = useRef<string | null>(null);
  const cb = useRef(send);
  useEffect(() => {
    cb.current = send;
  });
  useEffect(() => {
    if (sent.current === key) return;
    sent.current = key;
    cb.current();
  }, [key]);
}
