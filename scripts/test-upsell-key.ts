/* ==========================================================================
   The X-API-Key check of /api/upsell/*, both ways — no database needed.

       npx tsx scripts/test-upsell-key.ts

   - UPSELL_API_KEY set: the key itself, compared as before.
   - UPSELL_API_KEY unset: the SHA-256 (hex) of the header against the
     fallback hash. The real fallback's key is not in the repo, so the "right
     key" case runs `keyMatches` with a hash this test knows the key of.
   ========================================================================== */

import { createRequire } from "node:module";
import Module from "node:module";
import { createHash } from "node:crypto";

const require_ = createRequire(import.meta.url);
const resolve_ = (Module as unknown as { _resolveFilename: (r: string, ...a: unknown[]) => string })._resolveFilename;
(Module as unknown as { _resolveFilename: unknown })._resolveFilename = function (this: unknown, request: string, ...args: unknown[]) {
  if (request === "server-only") return require_.resolve("./server-only.cjs");
  return resolve_.call(this, request, ...args);
} as never;

let failures = 0;
function check(ok: boolean, label: string): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}`);
  if (!ok) failures++;
}

(async () => {
  const api = await import("../lib/upsell/api");
  const req = (key?: string) => new Request("https://x/api", { headers: key ? { "x-api-key": key } : {} });
  const sha = (s: string) => createHash("sha256").update(s).digest("hex");

  console.log("UPSELL_API_KEY set");
  process.env.UPSELL_API_KEY = "test-key-0123456789abcdef";
  check(api.apiKeyOk(req("test-key-0123456789abcdef")), "right key accepted");
  check(!api.apiKeyOk(req("wrong")) && !api.apiKeyOk(req()), "wrong or missing key refused");
  check(api.requireKey(req("wrong"))?.status === 401, "wrong key is 401");
  check(
    !api.keyMatches("other-key-0123456789", "test-key-0123456789abcdef", sha("other-key-0123456789")),
    "a set key wins: the fallback hash is not consulted",
  );
  process.env.UPSELL_API_KEY = "short";
  check(!api.apiKeyOk(req("short")), "a set key under 16 characters accepts nothing");

  console.log("UPSELL_API_KEY unset — SHA-256 fallback");
  delete process.env.UPSELL_API_KEY;
  check(/^[0-9a-f]{64}$/.test(api.UPSELL_API_KEY_SHA256_FALLBACK), "fallback is a SHA-256 hex digest");
  check(api.keyMatches("fallback-test-key", "", sha("fallback-test-key")), "key whose SHA-256 matches is accepted");
  check(!api.keyMatches("not-it", "", sha("fallback-test-key")), "key whose SHA-256 differs is refused");
  check(!api.keyMatches("", "", sha("")), "missing key refused, even against the hash of nothing");
  check(!api.apiKeyOk(req("wrong")) && !api.apiKeyOk(req()), "apiKeyOk: wrong or missing key refused");
  check(api.requireKey(req("wrong"))?.status === 401, "apiKeyOk: wrong key is 401");
  process.env.UPSELL_API_KEY = "";
  check(!api.apiKeyOk(req("")) && !api.apiKeyOk(req("wrong")), "empty UPSELL_API_KEY counts as unset");

  console.log(failures ? `\n${failures} failed` : "\nall passed");
  process.exit(failures ? 1 : 0);
})();
