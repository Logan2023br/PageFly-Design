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
    const { clientIp, createLimiter, rateLimited, signInLimits } = await import("../lib/rateLimit");
    const req = (h: Record<string, string>) => new Request("https://x/", { headers: h });
    check(clientIp(req({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" })) === "203.0.113.9", "the last X-Forwarded-For hop (nginx's), not the client-written first");
    check(clientIp(req({ "x-real-ip": "6.6.6.6", "x-forwarded-for": "203.0.113.9" })) === "203.0.113.9", "a client-written X-Real-IP is ignored by default");
    process.env.TRUSTED_IP_HEADER = "x-real-ip";
    check(clientIp(req({ "x-real-ip": "198.51.100.4", "x-forwarded-for": "6.6.6.6" })) === "198.51.100.4", "TRUSTED_IP_HEADER names the one header to read");
    delete process.env.TRUSTED_IP_HEADER;
    const lim = createLimiter(100, 60_000);
    const k = `t:${Math.random()}`;
    for (let i = 0; i < 3; i++) lim.hit(k, 3, 60_000);
    check(lim.isLimited(k, 3, 60_000), "three failures reach a limit of three");
    check(!lim.isLimited(`${k}x`, 3, 60_000), "an unseen key is not limited, and checking it records nothing");
    lim.clear(k);
    check(!lim.isLimited(k, 3, 60_000), "a success clears it");
    /* The eviction attack: a flood of fresh keys in the general limiter must
       not touch sign-in failures. */
    for (let i = 0; i < 10; i++) signInLimits.hit("admin-login:user:victim", 30, 60_000);
    for (let i = 0; i < 30_000; i++) rateLimited(`ev:${i}`, 30);
    check(signInLimits.isLimited("admin-login:user:victim", 10, 60_000), "30k anonymous keys do not evict a sign-in failure count");
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

  console.log("custom block markup (shared with the export)");
  {
    const { cleanHtml } = await import("../lib/design/customBlock");
    const bad = [
      '<img src="x"/onerror=alert(1)>',
      '<img src="a"onerror=alert(1)>',
      "<svg/onload=alert(1)>",
      "<img src=x onerror=alert(1)>",
      '<a href="jav&#x61;script:alert(1)">x</a>',
      '<a href="&#106;avascript:alert(1)">x</a>',
      '<a href="java\tscript:alert(1)">x</a>',
      "<a href=javascript:alert(1)>x</a>",
      '<a xlink:href="data:text/html,x">x</a>',
      '<ifr<iframe>ame srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;"></iframe>',
      '<obj<object>ect data="javascript:alert(1)">',
      '<svg><animate attributeName=href values="javascript:alert(1)"/></svg>',
      '<svg><set attributeName=href to="javascript:alert(1)"/></svg>',
      '<button formaction="javascript:alert(1)">x</button>',
      "<scr<script>ipt>alert(1)</script>",
    ];
    for (const h of bad) {
      const out = cleanHtml(h);
      const unsafe = /(^|[\s/"'])on[a-z]+\s*=|javascript:|jav&#|&#106;|java\t|<\s*(iframe|object|script|animate|set)\b|srcdoc|data:text\/html/i.test(out);
      check(!unsafe, `${h.slice(0, 48)} → ${out.slice(0, 48)}`, out);
    }
    const good = '<div class="wave"><a href="https://example.com/p?a=1">ok</a><img src="https://cdn.shopify.com/a.png" alt="x"></div>';
    check(cleanHtml(good) === good, "ordinary markup is left exactly as it was");
  }

  console.log("hostile HTML costs one pass (from-html)");
  {
    const { splitSections, headOf, bodyOf } = await import("../lib/pagefly/fromHtmlSkill");
    const cases: Record<string, string> = {
      "<body> x80k, never closed": "<body>".repeat(80_000),
      "<head> x80k, never closed": "<head>".repeat(80_000),
      "<section> x200k, never closed": "<section>".repeat(200_000),
      "<section without > x200k": "<section ".repeat(200_000),
      "<main> unclosed around 50k sections": "<main>" + "<section>x</section>".repeat(50_000),
    };
    for (const [label, html] of Object.entries(cases)) {
      const t = Date.now();
      splitSections(html);
      headOf(html);
      bodyOf(html);
      const ms = Date.now() - t;
      check(ms < 1500, `${label}: ${ms} ms`, ms);
    }
    const ok =
      "<html><head><style>a{}</style></head><body><header>h</header><section>1<section>in</section></section><section>2</section><footer>f</footer></body></html>";
    check(
      JSON.stringify(splitSections(ok)) === JSON.stringify(["<section>1<section>in</section></section>", "<section>2</section>"]) &&
        headOf(ok) === "<style>a{}</style>",
      "a normal page still splits into its sections, nested ones kept whole",
      splitSections(ok),
    );
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
