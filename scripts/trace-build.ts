/* ==========================================================================
   Every word that crosses the wire, for one page.

       BRIEF=/tmp/brief.json OUT=/tmp/trace.json npx tsx scripts/trace-build.ts

   WHY THIS EXISTS. The database keeps the brief and the finished page and
   nothing in between — no prompt, no model reply, no intermediate plan. So the
   only two questions anyone actually wants answered about a build ("is the
   design Opus thought up any good" and "did DeepSeek build the thing Opus
   described") cannot be answered from a run that has already happened. They can
   only be answered by running it again with something listening.

   THE TAP IS ON `fetch`, WHICH IS AS LOW AS IT GOES. Not on the callers and
   not on `getProvider` — an ES module namespace is read-only, and the wrapper
   that would have gone there could only ever record the arguments this script
   knew to look for. At the socket there is no such choice: what is written down
   is the JSON body the vendor was actually sent and the JSON it actually
   returned, including every field no stage here mentions. No prompt is rebuilt
   anywhere in this file, so none can drift from the one production sends.

   A STREAMING REPLY IS TEED, NOT READ. Stage 3 streams, because that is what
   moves the build's progress bar, and a reply that this script consumed to look
   at would never reach the parser. `body.tee()` makes two independent readers:
   the pipeline drinks from one and is not slowed or altered, and the transcript
   is assembled from the other.

   IT MIRRORS THE RUNNER'S FREE-DESIGN PATH and says so where it does: stage 1
   is skipped whole (see `freeDesignEnabled` in sectionSpec.ts), stage 2 is one
   Opus call per page with a null order — which makes the SECTIONS its answer
   too, not just their contents — and stage 3 is one DeepSeek call per page.
   The structure stage never runs, because free design fills `deck.plans` and
   the runner only asks for the page types that are still missing.

   READS AND WRITES NOTHING. No repo, no job record, no run saved. The page it
   builds is thrown away; what is kept is the transcript.
   ========================================================================== */

import { createRequire } from "node:module";
import Module from "node:module";
import { readFileSync, writeFileSync } from "node:fs";

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

/* The same keys and the same flags the server runs with. Read rather than
   required on the command line: a trace taken with a different DESIGN_MODEL
   than production uses is a trace of a pipeline nobody is running. */
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const BRIEF = process.env.BRIEF ?? "/tmp/brief.json";
const OUT = process.env.OUT ?? "/tmp/trace.json";

type Call = {
  seq: number;
  url: string;
  /** the request body verbatim, parsed — model, messages, ceilings and all */
  request: unknown;
  /** the reply verbatim: the parsed object, or the assembled SSE stream */
  response: unknown;
  status: number;
  ms: number;
  streamed: boolean;
};

const calls: Call[] = [];

/* A tee is read on its own timeline, and the pipeline can finish a call — or
   the whole build — while the transcript copy is still arriving. Awaited before
   anything is written, or the file would be missing whichever replies happened
   to be last. */
const pending: Promise<void>[] = [];

/** Assemble an SSE stream into the `data:` payloads it carried, in order. */
async function readEvents(stream: ReadableStream<Uint8Array>): Promise<unknown[]> {
  const out: unknown[] = [];
  const decoder = new TextDecoder();
  let buffer = "";
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let cut: number;
    while ((cut = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      for (const line of block.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") continue;
        try {
          out.push(JSON.parse(payload));
        } catch {
          out.push(payload);
        }
      }
    }
  }
  return out;
}

function tapFetch(): void {
  const real = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    /* Only the model vendors. The reference reader and anything else that
       reaches the network is left exactly as it was. */
    if (!/anthropic\.com|deepseek\.com/.test(url)) return real(input, init);

    const seq = calls.length + 1;
    let request: unknown = null;
    try {
      request = JSON.parse(String(init?.body ?? ""));
    } catch {
      request = String(init?.body ?? "");
    }
    const model = (request as { model?: string } | null)?.model ?? "?";
    process.stdout.write(`  \u2192 call ${seq} \u00b7 ${model} \u00b7 ${String(init?.body ?? "").length} body chars \u2026 `);

    const started = Date.now();
    const res = await real(input, init);
    const streamed = Boolean((request as { stream?: boolean } | null)?.stream);

    if (!res.body) {
      calls.push({ seq, url, request, response: null, status: res.status, ms: Date.now() - started, streamed });
      return res;
    }

    /* One copy each. The pipeline is handed `mine` untouched; `theirs` is read
       to the end here, which is also what makes `ms` the full time on the wire
       rather than the time to the first byte. */
    const [theirs, mine] = res.body.tee();
    const passed = new Response(mine, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    });

    pending.push((async () => {
      try {
        if (streamed) {
          const events = await readEvents(theirs);
          calls.push({ seq, url, request, response: events, status: res.status, ms: Date.now() - started, streamed });
        } else {
          const text = await new Response(theirs).text();
          let body: unknown;
          try {
            body = JSON.parse(text);
          } catch {
            body = text;
          }
          calls.push({ seq, url, request, response: body, status: res.status, ms: Date.now() - started, streamed });
        }
        const c = calls[calls.length - 1];
        console.log(`${(c.ms / 1000).toFixed(1)}s \u00b7 HTTP ${c.status}${c.streamed ? " \u00b7 streamed" : ""}`);
      } catch (err) {
        calls.push({ seq, url, request, response: `tap failed: ${String(err)}`, status: res.status, ms: Date.now() - started, streamed });
      }
    })());

    return passed;
  };
}

async function main(): Promise<void> {
  const brief = JSON.parse(readFileSync(BRIEF, "utf8"));
  tapFetch();

  const provider = await import("../lib/ai/provider");
  const { planFor } = await import("../lib/build/runner");
  const { buildPage } = await import("../lib/generate/mock");
  const { VISUAL_STYLES } = await import("../lib/styleTokens");
  const { freeDesignEnabled, planSpecs } = await import("../lib/design/sectionSpec");
  const { designPageTree } = await import("../lib/ai/designServer");
  const { readReferences } = await import("../lib/ai/refVision");

  const styleDef = (id: string) => VISUAL_STYLES.find((x) => x.id === id);
  const plan = planFor(brief);
  const entry = plan[0];
  if (!entry) throw new Error("the brief asks for no pages");

  const out: Record<string, unknown> = {
    takenAt: new Date().toISOString(),
    freeDesign: freeDesignEnabled(),
    models: { design: provider.modelName("design"), build: provider.modelName() },
  };

  /* ---- STEP 1 · what the merchant gave, and what is derived from it -------
     Nothing here is a model call. The palette, the type scale and the section
     rhythm hints are computed from the brief by the deterministic generator,
     and they are the floor both models design on top of. */
  const base = buildPage({
    brief,
    pageType: entry.pageType,
    pageId: entry.pageId,
    index: 1,
    copyIndex: entry.copyIndex,
    copyTotal: entry.copyTotal,
    variant: 0,
  });

  const reading = await readReferences(brief);

  out.step1 = {
    brief,
    plan,
    page: { pageType: base.pageType, label: base.label, seed: base.seed },
    tokens: base.tokens,
    refHints: base.refHints,
    reference: reading
      ? { sections: reading.sections, style: reading.style, usage: reading.usage }
      : null,
    deterministicBlocks: base.blocks.map((b: { kind: string }) => b.kind),
  };
  console.log(`step 1 · ${entry.pageType} · palette ${base.tokens.bg}/${base.tokens.ink}/${base.tokens.accent}`);

  /* ---- STEP 2 · Opus decides the whole design ---------------------------- */
  console.log("step 2 · Opus…");
  const ask = {
    pageType: entry.pageType,
    order: null,
    sell: brief.whatYouSell,
    storeType: brief.storeType,
    market: brief.market ?? null,
    styleLabel: styleDef(brief.visualStyle)?.label ?? brief.visualStyle,
    styleBlurb: styleDef(brief.visualStyle)?.blurb ?? "",
    prompt: brief.prompt,
    tokens: {
      bg: base.tokens.bg,
      ink: base.tokens.ink,
      accent: base.tokens.accent,
      band: base.tokens.surfaceAlt,
    },
  };
  const specOut = await planSpecs(ask as never);
  out.step2 = {
    ask,
    result: {
      model: specOut.model,
      usage: specOut.usage,
      reason: specOut.reason,
      dropped: specOut.dropped,
      refused: specOut.refused ?? null,
      pageStyle: specOut.pageStyle ?? null,
      order: specOut.order,
      specs: [...specOut.specs.entries()].map(([band, spec]) => ({ band, spec })),
    },
  };

  if (!specOut.order) {
    await Promise.all(pending);
    writeFileSync(OUT, JSON.stringify({ ...out, calls }, null, 2));
    console.log(`step 2 produced no design — ${specOut.reason}\n→ ${OUT}`);
    return;
  }

  /* ---- STEP 3 · DeepSeek builds it --------------------------------------- */
  console.log("step 3 · DeepSeek…");
  const designInput = {
    sell: brief.whatYouSell,
    prompt: brief.prompt,
    storeType: brief.storeType,
    market: brief.market ?? null,
    style: brief.visualStyle,
    styleLabel: ask.styleLabel,
    styleBlurb: ask.styleBlurb,
    density: base.tokens.density,
    reference: base.refHints,
    refSections: reading?.sections ?? null,
    refStyle: reading?.style ?? null,
    structure: null,
    order: specOut.order,
    deckSize: plan.length,
    storeDomain: process.env.TRACE_DOMAIN ?? "trace.myshopify.com",
    verticalSlug: brief.verticalSlug ?? null,
    pageLabel: base.label,
    pageType: base.pageType,
    tokens: {
      bg: base.tokens.bg,
      ink: base.tokens.ink,
      accent: base.tokens.accent,
      band: base.tokens.surfaceAlt,
      border: base.tokens.border,
      fontHeading: base.tokens.fontDisplay,
      fontBody: base.tokens.fontBody,
      radius: base.tokens.radius,
    },
  };

  /* Streamed, because production streams this one — that is what moves the
     build's progress bar, and a request with `stream:false` is not the request
     the merchant's build makes. The callback is a sink: this script has no
     progress bar, it just needs the flag set the way the server sets it. */
  const built = await designPageTree(designInput as never, undefined, () => {});
  out.step3 = { input: { ...designInput, order: "(step2.result.order)" }, result: built };

  await Promise.all(pending);
  calls.sort((a, b) => a.seq - b.seq);
  writeFileSync(OUT, JSON.stringify({ ...out, calls }, null, 2));
  console.log(`\n${calls.length} model call(s) recorded\n→ ${OUT}`);
}

main().catch((err) => {
  writeFileSync(OUT, JSON.stringify({ error: String(err), calls }, null, 2));
  console.error(err);
  process.exitCode = 1;
});

export {};
