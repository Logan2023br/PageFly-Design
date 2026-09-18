/* ==========================================================================
   Does an answer that is not JSON still ask DeepSeek for JSON?

       npx tsx scripts/test-response-format.ts

   It did, and the build failed at the vendor with a 400 nobody could have
   predicted from reading either file:

     Prompt must contain the word 'json' in some form to use 'response_format'
     of type 'json_object'.

   `response_format: { type: "json_object" }` was hard-coded into the DeepSeek
   provider, because for the whole life of that provider there was one caller
   and it wanted JSON. HTML mockup mode is the second caller. It removed the
   word "json" from the prompt — the closing line now asks for a document — and
   DeepSeek refuses the combination outright.

   So the flag has to travel with the request. `fetch` is tapped rather than the
   provider stubbed, because the thing under test IS the request body: a stub
   would prove that this file's idea of the body matches itself.
   ========================================================================== */

import { createRequire } from "node:module";
import Module from "node:module";

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

process.env.AI_PROVIDER = "deepseek";
process.env.DEEPSEEK_API_KEY = "test-key-not-used";

let failures = 0;
function check(ok: boolean, label: string, detail: string | null = null): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

type Body = { response_format?: { type: string }; messages: { role: string; content: string }[] };
const sent: Body[] = [];

const real = globalThis.fetch;
globalThis.fetch = (async (url: string, init: { body: string }) => {
  sent.push(JSON.parse(init.body) as Body);
  /* Enough of a completion to get back out of the provider without a network. */
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: "{}" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}) as never;

async function main(): Promise<void> {
  const { getProvider } = await import("../lib/ai/provider");
  const provider = getProvider()!;

  await provider.complete({ system: "s", user: "return json", maxTokens: 100 });
  check(
    sent.at(-1)?.response_format?.type === "json_object",
    "the default call still asks for a JSON object",
    JSON.stringify(sent.at(-1)?.response_format) ?? "absent",
  );

  await provider.complete({ system: "s", user: "return html", maxTokens: 100, json: false });
  check(
    sent.at(-1)?.response_format === undefined,
    "and `json: false` sends no response_format at all",
    JSON.stringify(sent.at(-1)?.response_format) ?? "absent",
  );

  globalThis.fetch = real;
  console.log(failures === 0 ? "\nall good\n" : `\n${failures} failure(s)\n`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();

export {};
