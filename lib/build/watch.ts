"use client";

import type { JobView } from "@/app/api/build/route";

/* ==========================================================================
   Watching a build the server is running.

   Polling, not a socket. A build takes about a minute and reports progress a
   handful of times, so a request every few seconds is a rounding error against
   what the build itself costs — and it survives a laptop lid, a proxy that
   drops idle connections, and a merchant opening the page on their phone
   instead, none of which a socket does for free.
   ========================================================================== */

export type BuildBody =
  | { ok: true; job: JobView | null }
  | { ok: false; error: string };

/** Fast enough that a page landing feels immediate, slow enough that a minute
    of building is twenty requests rather than a thousand. */
const EVERY_MS = 2500;

export async function fetchJob(signal?: AbortSignal): Promise<BuildBody> {
  try {
    const res = await fetch("/api/build", { signal, cache: "no-store" });
    return (await res.json()) as BuildBody;
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return { ok: false, error: aborted ? "aborted" : "Couldn't reach the server." };
  }
}

export async function startJob(
  brief: unknown,
  variants: Record<string, number>,
): Promise<BuildBody> {
  try {
    const res = await fetch("/api/build", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ brief, variants }),
    });
    return (await res.json()) as BuildBody;
  } catch {
    return { ok: false, error: "Couldn't reach the server." };
  }
}

export async function cancelJob(): Promise<void> {
  try {
    await fetch("/api/build", { method: "DELETE" });
  } catch {
    /* The runner also stops on its own when the process is asked to; a failed
       cancel leaves a build running, which is recoverable, and throwing here
       would strand the merchant on a screen with no way back. */
  }
}

/**
 * Poll until the job stops running.
 *
 * `onTick` fires for every answer, including ones where nothing changed, so a
 * caller can drive both the pages and the elapsed clock from one place.
 * Transport failures are not terminal: a laptop that just woke up gets a
 * couple of refused requests before the network comes back, and giving up on
 * the first one would abandon a build that is still going.
 */
export async function watchJob(
  onTick: (job: JobView) => void,
  signal: AbortSignal,
): Promise<JobView | null> {
  let misses = 0;

  for (;;) {
    if (signal.aborted) return null;

    const body = await fetchJob(signal);

    if (body.ok && body.job) {
      misses = 0;
      onTick(body.job);
      if (body.job.status !== "running") return body.job;
    } else if (!body.ok) {
      if (body.error === "aborted") return null;
      /* Roughly a minute of failures before calling it lost. */
      if (++misses > 24) return null;
    } else {
      /* ok, but no job at all — it was cancelled and cleared elsewhere. */
      return null;
    }

    await sleep(EVERY_MS, signal);
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });
}
