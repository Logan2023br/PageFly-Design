"use client";

import { encodeRun, decodeRun, type SharedRun } from "./shareLink";
import { totalSelected } from "./pageCatalog";
import { VISUAL_STYLES } from "./styleTokens";

/* ==========================================================================
   Recent runs, in localStorage.

   Same reasoning as shareLink: because generation is deterministic, a history
   entry only has to store the brief, not the pages. So an entry is small enough
   that a browser quota is never a real constraint, and reopening one rebuilds
   the exact deck the merchant saw.

   Stored as the same encoded payload the share link uses. One format, one
   decoder, and an entry that survives a round trip through a link also survives
   a round trip through storage.

   localStorage and not a cookie or the server: this is a private working list,
   it must not travel on every request, and it must not need an account.
   ========================================================================== */

const KEY = "pfd.history.v1";
const LIMIT = 12;

export type HistoryEntry = {
  id: string;
  /** ISO, from the browser at save time — display only, never fed to a seed */
  createdAt: string;
  /** the encoded run, identical in shape to a share link's payload */
  payload: string;
  /* Denormalised for the list, so rendering it never has to inflate 12 payloads. */
  sell: string;
  styleLabel: string;
  pageCount: number;
};

function read(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isEntry).slice(0, LIMIT);
  } catch {
    // Corrupt or unreadable (private mode, disabled storage) — history is a
    // convenience, so it degrades to empty rather than breaking the app.
    return [];
  }
}

function isEntry(value: unknown): value is HistoryEntry {
  if (!value || typeof value !== "object") return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    typeof e.createdAt === "string" &&
    typeof e.payload === "string" &&
    typeof e.sell === "string" &&
    typeof e.styleLabel === "string" &&
    typeof e.pageCount === "number"
  );
}

function write(entries: HistoryEntry[]): HistoryEntry[] {
  const capped = entries.slice(0, LIMIT);
  if (typeof window === "undefined") return capped;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(capped));
  } catch {
    /* Quota or a storage-blocked browser. Dropping the oldest half is worth one
       attempt — beyond that, silently keep working without history rather than
       failing a generation the user asked for. */
    try {
      const half = capped.slice(0, Math.max(1, Math.floor(capped.length / 2)));
      window.localStorage.setItem(KEY, JSON.stringify(half));
      return half;
    } catch {
      return capped;
    }
  }
  return capped;
}

export function listHistory(): HistoryEntry[] {
  return read();
}

/**
 * Save a run. Returns the new list.
 *
 * Re-running the identical brief replaces its entry and moves it to the top
 * instead of stacking duplicates — pressing Create twice is one piece of work,
 * not two.
 */
export function saveRun(run: SharedRun, now: Date): HistoryEntry[] {
  const payload = encodeRun(run);
  const style = VISUAL_STYLES.find((s) => s.id === run.brief.visualStyle);

  const entry: HistoryEntry = {
    id: `${now.getTime().toString(36)}-${payload.length.toString(36)}`,
    createdAt: now.toISOString(),
    payload,
    sell: run.brief.whatYouSell,
    styleLabel: style?.label ?? run.brief.visualStyle,
    pageCount: totalSelected(run.brief.pages),
  };

  return write([entry, ...read().filter((e) => e.payload !== payload)]);
}

export function removeRun(id: string): HistoryEntry[] {
  return write(read().filter((e) => e.id !== id));
}

export function clearHistory(): HistoryEntry[] {
  return write([]);
}

/** Decodes an entry back into a run, using the share-link decoder. */
export function openRun(entry: HistoryEntry) {
  return decodeRun(entry.payload);
}

/** "just now", "12 min ago", "3 days ago" — relative to a caller-supplied
    clock, so nothing here reads the time on its own. */
export function relativeTime(iso: string, now: Date): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.round((now.getTime() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}
