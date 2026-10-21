/* ==========================================================================
   The security fixes that need no database or server.

       npx tsx scripts/test-security.ts
   ========================================================================== */

import { createRequire } from "node:module";
import Module from "node:module";
import { strToU8, zipSync } from "fflate";

const require_ = createRequire(import.meta.url);
const resolve_ = (Module as unknown as { _resolveFilename: (r: string, ...a: unknown[]) => string })._resolveFilename;
(Module as unknown as { _resolveFilename: unknown })._resolveFilename = function (this: unknown, request: string, ...args: unknown[]) {
  if (request === "server-only") return require_.resolve("./server-only.cjs");
  return resolve_.call(this, request, ...args);
} as never;

let failures = 0;
function check(ok: boolean, label: string, detail: unknown = null): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${!ok && detail !== null ? ` — ${JSON.stringify(detail)}` : ""}`);
  if (!ok) failures++;
}

(async () => {
  console.log("zip bombs");
  {
    const { rejectFile } = await import("../lib/collectionPagesServer");
    const page = zipSync({ "page.json": strToU8(JSON.stringify({ type: "page", items: [] })) });
    check(rejectFile("pagefly", page) === null, "a real export passes");
    /* 210 MB of zeros, a few hundred KB zipped. */
    const bomb = zipSync({ "page.json": strToU8("{}"), "pad.bin": new Uint8Array(210 * 1024 * 1024) }, { level: 9 });
    const t = Date.now();
    const why = rejectFile("pagefly", bomb);
    check(bomb.length < 2_000_000 && typeof why === "string" && /larger unpacked/.test(why), `a ${(bomb.length / 1024).toFixed(0)} KB bomb is refused`, why);
    check(Date.now() - t < 1500, "…without being unpacked (fast)", Date.now() - t);
    const many: Record<string, Uint8Array> = { "page.json": strToU8("{}") };
    for (let i = 0; i < 600; i++) many[`f${i}.txt`] = strToU8("x");
    check(typeof rejectFile("pagefly", zipSync(many)) === "string", "600 entries are refused");
  }

  console.log("client address and limits");
  {
    const { clientIp, rateLimited, isRateLimited, clearRateLimit } = await import("../lib/rateLimit");
    const req = (h: Record<string, string>) => new Request("https://x/", { headers: h });
    check(clientIp(req({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" })) === "203.0.113.9", "the last X-Forwarded-For hop (nginx's), not the client-written first");
    check(clientIp(req({ "x-real-ip": "198.51.100.4", "x-forwarded-for": "6.6.6.6" })) === "198.51.100.4", "X-Real-IP wins");
    const k = `t:${Math.random()}`;
    for (let i = 0; i < 3; i++) rateLimited(k, 3, 60_000);
    check(isRateLimited(k, 3, 60_000), "three failures reach a limit of three");
    check(!isRateLimited(`${k}x`, 3, 60_000), "an unseen key is not limited, and checking it records nothing");
    clearRateLimit(k);
    check(!isRateLimited(k, 3, 60_000), "a success clears it");
  }

  console.log("owner sign-in");
  {
    const { checkAdminCredentials } = await import("../lib/session");
    const env = process.env as Record<string, string | undefined>;
    const keep = { u: env.ADMIN_USERNAME, p: env.ADMIN_PASSWORD, n: env.NODE_ENV };
    delete env.ADMIN_USERNAME;
    delete env.ADMIN_PASSWORD;
    env.NODE_ENV = "production";
    check(!checkAdminCredentials("admin", "pf123456"), "production without ADMIN_* refuses the old defaults");
    env.ADMIN_USERNAME = "owner";
    env.ADMIN_PASSWORD = "a-long-test-password";
    check(checkAdminCredentials("owner", "a-long-test-password") && !checkAdminCredentials("admin", "pf123456"), "production with ADMIN_* signs in with them only");
    env.ADMIN_USERNAME = keep.u;
    env.ADMIN_PASSWORD = keep.p;
    env.NODE_ENV = keep.n;
    if (keep.u === undefined) delete env.ADMIN_USERNAME;
    if (keep.p === undefined) delete env.ADMIN_PASSWORD;
  }

  console.log("storeExists stays out of private networks");
  {
    const { storeExists } = await import("../lib/storeExists");
    for (const host of ["127.0.0.1", "10.0.0.5", "169.254.169.254", "localhost", "internal-host", "2130706433", "0x7f000001", "printer.local", "localtest.me"]) {
      const r = await storeExists(host);
      check(r.status === "no", `${host}: refused (${r.reason})`, r);
    }
  }

  console.log(failures ? `\n${failures} failed` : "\nall passed");
  process.exit(failures ? 1 : 0);
})();
