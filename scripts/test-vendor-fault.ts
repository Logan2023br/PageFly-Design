/* ==========================================================================
   Which failures are the vendor's, and which merely reached the vendor.

       npx tsx scripts/test-vendor-fault.ts

   A merchant pressed Create pages and their brief came back saying
   "terminated". That is undici's word for a connection cut mid-stream, and it
   reached them because `designPageTree` marked EVERY error from the provider
   as the vendor's — reasoning that `fromStatus` had already turned it into a
   sentence.

   It has only done that when there was an HTTP status. `provider.ts` is
   explicit: a status becomes "the account is out of credit… (402)", and
   anything else is rethrown raw. A dropped socket has no status, so the raw
   word travelled all the way to the screen.

   Reproduced on this machine: a network blip mid-build produced
   `the call failed: terminated` from stage 2 and `fetch failed` from stage 3,
   zero tokens spent, and a job whose error read `fetch failed`.
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

let failures = 0;
function check(ok: boolean, label: string, detail: string | null = null): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function main(): Promise<void> {
  const { fromVendor } = await import("@/lib/ai/provider");

  console.log("\nsentences fromStatus wrote are the vendor's, and reach the merchant");

  const { fromStatus, vendorError } = await import("@/lib/ai/provider");
  for (const code of [402, 401, 429, 503]) {
    const msg = fromStatus(code, "DeepSeek", "");
    check(fromVendor(vendorError(msg)), `a ${code} refusal is recognised`, msg.slice(0, 44) + "…");
    /* The message itself carries no tag: it is shown to a merchant verbatim,
       and a marker hidden in their sentence would be a wart they could paste. */
    check(!/[\u200b-\u200f]/.test(msg), `and the ${code} message is clean text`);
  }

  console.log("\nnetwork noise is not");

  /* These are what a dropped connection looks like. None of them says anything
     a merchant can act on, and every one of them used to be shown to them. */
  check(!fromVendor(new TypeError("terminated")), "undici's terminated");
  check(!fromVendor(new TypeError("fetch failed")), "fetch failed");
  check(!fromVendor(new Error("The operation was aborted due to timeout")), "a timeout");
  check(!fromVendor(new Error("socket hang up")), "socket hang up");
  check(!fromVendor(new Error("read ECONNRESET")), "ECONNRESET");

  console.log("\nand neither is anything else");

  check(!fromVendor(new Error("Cannot read properties of undefined")), "a programming mistake");
  check(!fromVendor(undefined), "nothing at all");
  check(!fromVendor(new Error("")), "an empty message");

  console.log(failures === 0 ? "\nall good\n" : `\n${failures} failure(s)\n`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();

export {};
