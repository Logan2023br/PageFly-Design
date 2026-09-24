/* ==========================================================================
   WHAT EVERY MODEL CALL COST, RECORDED AT THE ONE DOOR THEY ALL GO THROUGH.

   The admin screen used to show one number — `sum(runs.tokens)` — built by the
   build runner adding `input + output` into a local variable and throwing the
   model's name away. Two things were wrong with it and neither could throw:

     IT COULD NOT BE ASKED WHICH MODEL. Opus designing a page and DeepSeek
     transcribing one differ by a factor of twenty in price, so a single total
     says nothing about where the money goes.

     IT WAS MISSING THE BIGGEST SPENDER. The export path calls DeepSeek once
     per band and wrote its usage to `console.log`. Nothing persisted it, so
     the largest line of the bill was not in the total at all — and a total
     that is too small looks exactly like a total that is right.

   SO THE METER WRAPS `getProvider`, NOT THE CALL SITES. Every call in the
   product asks that function for a provider; wrapping there means a call site
   added next month is measured without anybody remembering to measure it.
   Wrapping each caller is the design that produced the bug above.

   AND IT IS BEST-EFFORT, ALWAYS. This code runs inside the call it measures. A
   throw here would fail a merchant's build to protect a number on a screen
   nobody is looking at, so every path out of `record` swallows.
   ========================================================================== */

import { AsyncLocalStorage } from "node:async_hooks";
import { costOf } from "./pricing";
import type { Completion, Provider } from "./provider";

/** Who the call was for, and which part of the pipeline made it. */
export type MeterContext = {
  /** the store the work was done for, where there is one */
  domain?: string | null;
  /** "design", "page", "export", "structure" … free text, grouped on read */
  stage?: string;
  /**
   * The build this call belongs to.
   *
   * Written into the row id as a prefix, which is how `stats()` tells a run
   * that has per-call rows from one that predates them — the older run's
   * `tokens` integer is all that is known about it, and counting both would
   * double the history.
   */
  runId?: string | null;
};

const ctx = new AsyncLocalStorage<MeterContext>();

/** Runs `fn` with a context every model call underneath it will be tagged by. */
export function withMeter<T>(context: MeterContext, fn: () => T): T {
  return ctx.run(context, fn);
}

/** The context in force, for code that wants to read it without re-entering. */
export function meterContext(): MeterContext {
  return ctx.getStore() ?? {};
}

let seq = 0;

/* IN FLIGHT, AND WAITABLE. The write is deliberately not awaited by the caller
   — an answer must not wait on a statistics table — but "not awaited" and
   "unobservable" are different things. A host that freezes the process when a
   response returns would drop a detached promise silently, and so would a test
   reading the row one line after the call. Holding them here gives both a way
   to settle without putting a database round trip on the response path. */
const inFlight = new Set<Promise<unknown>>();

/** Waits for every recording started so far. Never throws. */
export async function flushMeter(): Promise<void> {
  await Promise.allSettled([...inFlight]);
}

function record(vendor: string, model: string, usage: Completion): void {
  try {
    const c = ctx.getStore() ?? {};
    const input = Number(usage.usage.input) || 0;
    const output = Number(usage.usage.output) || 0;
    const cached = Number(usage.usage.cached ?? 0) || 0;

    /* The run id first, so a `like '<run>%'` match finds it. `seq` keeps two
       calls in the same millisecond apart. */
    const id = `${c.runId ?? `x${Date.now().toString(36)}`}:${(seq++).toString(36)}`;

    const call = {
      id,
      createdAt: new Date().toISOString(),
      domain: typeof c.domain === "string" ? c.domain : null,
      stage: typeof c.stage === "string" ? c.stage : "",
      vendor,
      model,
      input,
      output,
      cached,
      reasoning: Number(usage.reasoning ?? 0) || 0,
      costUsd: costOf(model, { input, output, cached }),
    };

    /* Imported here rather than at module load: this file is reached from
       scripts and from the build, and the database module pulls a driver in
       with it. Fire and forget — the answer is already on its way back to the
       caller and must not wait on a write to a statistics table. */
    const wrote = import("../db")
      .then((m) => m.getRepo().recordModelCall(call))
      .catch(() => {})
      .finally(() => inFlight.delete(wrote));
    inFlight.add(wrote);
  } catch {
    /* A measurement is never worth a failed build. */
  }
}

/**
 * Wraps a provider so every completion it returns is recorded.
 *
 * Returns null for null, so `metered(getProvider(role))` reads the same as the
 * unwrapped call at every site that already handles "no model configured".
 */
export function metered(provider: Provider | null): Provider | null {
  if (!provider) return null;
  return {
    ...provider,
    async complete(args) {
      const answer = await provider.complete(args);
      record(provider.name, provider.model, answer);
      return answer;
    },
  };
}
