/* ==========================================================================
   EVERY MODEL CALL LEAVES A ROW, AND MEASURING MUST NEVER BREAK THE THING
   BEING MEASURED.

       npx tsx scripts/test-meter.ts

   The admin screen is about to claim it knows what each model cost. That claim
   is only as good as the coverage, and coverage fails silently in both
   directions:

     A CALL THAT IS NOT RECORDED is invisible — the screen shows a smaller bill
     and looks fine. This is exactly how the export path came to be missing
     from "24,596,534 tokens": its usage went to `console.log` and nowhere
     else. So the meter wraps `getProvider`, the one door every call goes
     through, rather than each call site — a new call site cannot forget.

     A METER THAT THROWS takes a merchant's build down to protect a statistic.
     Recording is best-effort by construction, and that is asserted here with a
     repo that always fails.
   ========================================================================== */

import { createRequire } from "node:module";
import Module from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "pfd-meter-"));
process.env.PFD_DB_FILE = join(dir, "store.json");

const require_ = createRequire(import.meta.url);
const resolve_ = (Module as unknown as { _resolveFilename: (r: string, ...a: unknown[]) => string })
  ._resolveFilename;
(Module as unknown as { _resolveFilename: unknown })._resolveFilename = function (
  this: unknown,
  request: string,
  ...args: unknown[]
) {
  if (request === "server-only") return require_.resolve("./server-only.cjs");
  return resolve_.call(this, request, ...args);
} as never;

let bad = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) bad++;
};

async function main(): Promise<void> {
  const { metered, withMeter, flushMeter } = await import("../lib/ai/meter");
  const { getRepo } = await import("../lib/db");
  type P = import("../lib/ai/provider").Provider;

  let calls = 0;
  const fake: P = {
    name: "deepseek",
    model: "deepseek-v4-flash",
    async complete() {
      calls++;
      return {
        text: "{}",
        usage: { input: 273_566, output: 135_679, cached: 151_040 },
        truncated: false,
        reasoning: 40_000,
      };
    },
  } as P;

  const wrapped = metered(fake)!;

  /* ---- 1. transparent ---------------------------------------------------- */
  const answer = await withMeter({ domain: "shop.myshopify.com", stage: "export" }, () =>
    wrapped.complete({ system: "s", user: "u", maxTokens: 10 }),
  );
  ok("the completion comes back untouched", answer.text === "{}" && answer.usage.output === 135_679);
  ok("and the underlying provider was called once", calls === 1);

  /* ---- 2. a row, with the model and the money on it ---------------------- */
  await flushMeter();
  const rows = await getRepo().stats({ days: 0 });
  const row = rows.spend.rows[0];
  ok("a row was recorded", rows.spend.rows.length === 1, `${rows.spend.rows.length} row(s)`);
  ok("it names the model", row?.model === "deepseek-v4-flash", row?.model);
  ok("it carries the tokens", row?.tokens === 273_566 + 135_679, String(row?.tokens));
  ok("it separates the cache hits", row?.cached === 151_040, String(row?.cached));
  ok(
    "and it is priced at the measured rate",
    row?.costUsd !== null && Math.abs((row?.costUsd ?? 0) - 0.2005) < 0.0005,
    `$${row?.costUsd?.toFixed(4)}`,
  );

  /* ---- 3. an unpriced model is an unknown, all the way to the total ------ */
  const odd: P = { ...fake, model: "some-unpriced-model" } as P;
  await withMeter({ stage: "design" }, () =>
    metered(odd)!.complete({ system: "s", user: "u", maxTokens: 10 }),
  );
  await flushMeter();
  const after = await getRepo().stats({ days: 0 });
  const oddRow = after.spend.rows.find((r) => r.model === "some-unpriced-model");
  ok("an unpriced model records null, not 0", oddRow?.costUsd === null, String(oddRow?.costUsd));
  ok("AND THE TOTAL REFUSES TO BE A NUMBER", after.spend.totalCostUsd === null,
     "a total that quietly drops an unpriced model under-reports the bill");

  /* ---- 4. the meter cannot break the call -------------------------------- */
  const exploding: P = {
    name: "anthropic",
    model: "claude-opus-5-5",
    async complete() {
      return { text: "ok", usage: { input: 1, output: 1 }, truncated: false, reasoning: null };
    },
  } as P;
  /* A context whose domain is a value the store cannot hold — the record path
     must swallow whatever this does to it. */
  const survived = await withMeter({ domain: { bad: true } as never, stage: "design" }, () =>
    metered(exploding)!.complete({ system: "s", user: "u", maxTokens: 10 }),
  );
  ok("a failing record does not fail the call", survived.text === "ok");

  /* ---- 5. no context is still a row -------------------------------------- */
  await metered(exploding)!.complete({ system: "s", user: "u", maxTokens: 10 });
  await flushMeter();
  const last = await getRepo().stats({ days: 0 });
  ok(
    "a call made outside any context is still counted",
    last.spend.rows.some((r) => r.model === "claude-opus-5-5"),
    "an uninstrumented caller must not be an invisible caller",
  );

  /* ---- 6. THE WIRING, not just the wrapper ------------------------------- */
  /* Every check above calls `metered()` by hand, so all of them stay green if
     somebody unwraps `getProvider` — which is the only place the wrapping
     actually happens, and the whole coverage argument rests on it. This one
     goes through the real door with a stubbed vendor. */
  process.env.AI_PROVIDER = "deepseek";
  process.env.DEEPSEEK_API_KEY = "test-key";
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        choices: [{ message: { content: "{}" }, finish_reason: "stop" }],
        usage: {
          prompt_tokens: 1_000,
          completion_tokens: 200,
          prompt_cache_hit_tokens: 400,
          completion_tokens_details: { reasoning_tokens: 50 },
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as typeof fetch;

  const { getProvider } = await import("../lib/ai/provider");
  const door = getProvider("default");
  ok("a provider is configured for the wiring check", door !== null);
  if (door) {
    /* MEASURED AS A DELTA, because rows group by vendor and model and step 2
       already recorded a deepseek call — looking for an absolute 1,200 finds
       nothing and reads as "the wrap is gone" when the wrap is fine. That is
       how this assertion failed the first time it was run. */
    const of = (s: Awaited<ReturnType<typeof getRepo>["stats"]> extends never ? never : Awaited<ReturnType<ReturnType<typeof getRepo>["stats"]>>) =>
      s.spend.rows.find((r) => r.model === door.model);
    const before = of(await getRepo().stats({ days: 0 }));
    await withMeter({ domain: "wired.example", stage: "wiring" }, () =>
      door.complete({ system: "s", user: "u json", maxTokens: 100 }),
    );
    await flushMeter();
    const after2 = of(await getRepo().stats({ days: 0 }));
    const grewBy = (after2?.tokens ?? 0) - (before?.tokens ?? 0);
    ok(
      "GETPROVIDER ITSELF RETURNS A METERED PROVIDER",
      grewBy === 1_200,
      grewBy === 0 ? "nothing was recorded — the wrap is gone" : `+${grewBy} tokens`,
    );
    ok(
      "and the vendor's cache split survives the trip",
      (after2?.cached ?? 0) - (before?.cached ?? 0) === 400,
      String((after2?.cached ?? 0) - (before?.cached ?? 0)),
    );
  }
  globalThis.fetch = realFetch;

  console.log(bad === 0 ? "\nall good" : `\n${bad} failed`);
  rmSync(dir, { recursive: true, force: true });
  process.exit(bad === 0 ? 0 : 1);
}

void main();
