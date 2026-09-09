/* ==========================================================================
   Which host a link we mint should point at.

       npx tsx scripts/test-public-origin.ts

   Two endpoints build URLs a merchant is expected to open — the invite link
   and the feedback link in the morning review mail — and both were reading the
   origin off the request. Behind a reverse proxy that is the address the PROXY
   used to reach this process, not the one a browser can open: on the VPS it
   came out as `https://localhost:3000`, which is a link nobody outside that
   machine can follow.

   So the order is: what an operator configured, then what the proxy says the
   client asked for, then the request itself. The last is right for a process
   that is not behind anything, which is how it looks in development.
   ========================================================================== */

let failures = 0;
function check(ok: boolean, label: string, detail: string | null = null): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function main(): Promise<void> {
  const { publicOrigin } = await import("@/lib/publicOrigin");

  const req = (url: string, headers: Record<string, string> = {}) =>
    new Request(url, { headers });

  const clearEnv = () => {
    delete process.env.PFD_PUBLIC_URL;
  };

  console.log("\nbehind a proxy, the proxy is believed over the socket");

  clearEnv();
  check(
    publicOrigin(
      req("http://localhost:3000/api/admin/invite-link", {
        "x-forwarded-host": "pagefly-design.pagefly.io",
        "x-forwarded-proto": "https",
      }),
    ) === "https://pagefly-design.pagefly.io",
    "nginx's forwarded host and scheme win",
    "this is the VPS case that produced localhost:3000",
  );

  check(
    publicOrigin(
      req("http://localhost:3000/x", { "x-forwarded-host": "pagefly-design.pagefly.io" }),
    ) === "https://pagefly-design.pagefly.io",
    "a forwarded host with no scheme assumes https",
    "a proxy that terminates TLS is the only reason this header exists",
  );

  /* Proxies chain, and each appends. The first entry is the client's. */
  check(
    publicOrigin(
      req("http://localhost:3000/x", {
        "x-forwarded-host": "pagefly-design.pagefly.io, internal.lb",
        "x-forwarded-proto": "https, http",
      }),
    ) === "https://pagefly-design.pagefly.io",
    "a chain of proxies uses the first entry, which is the client's",
  );

  console.log("\nwith no proxy headers, the Host the client addressed");

  clearEnv();
  check(
    publicOrigin(req("http://localhost:3000/x", { host: "pagefly-design.pagefly.io" })) ===
      "https://pagefly-design.pagefly.io",
    "the Host header is used when the proxy set only that",
  );

  console.log("\nand with nothing at all, the request itself");

  clearEnv();
  check(
    publicOrigin(req("http://localhost:3000/api/x")) === "http://localhost:3000",
    "a bare development server points at itself",
    "http, not https — localhost has no certificate",
  );

  console.log("\nan operator's setting beats every guess");

  process.env.PFD_PUBLIC_URL = "https://design.example.com";
  check(
    publicOrigin(
      req("http://localhost:3000/x", { "x-forwarded-host": "wrong.example.com" }),
    ) === "https://design.example.com",
    "PFD_PUBLIC_URL wins over a forwarded host",
  );

  process.env.PFD_PUBLIC_URL = "https://design.example.com/";
  check(
    publicOrigin(req("http://localhost:3000/x")) === "https://design.example.com",
    "a trailing slash is trimmed, so links never come out doubled",
  );

  process.env.PFD_PUBLIC_URL = "   ";
  check(
    publicOrigin(req("http://localhost:3000/x", { host: "real.example.com" })) ===
      "https://real.example.com",
    "a blank setting is not a setting",
  );

  clearEnv();
  console.log(failures === 0 ? "\nall good\n" : `\n${failures} failure(s)\n`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();

export {};
