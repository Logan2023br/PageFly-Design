/* ==========================================================================
   The ?login= link, decided without a browser.

       npx tsx scripts/test-auto-signin.ts

   A link we send a merchant — /?login=their-store.myshopify.com — signs them
   in and drops them on the brief instead of showing a form that asks for the
   domain we already put in the URL.

   This file tests the one decision the CLIENT makes: does this URL carry a
   sign-in attempt at all. It deliberately does NOT normalise or validate the
   domain — `/api/auth/store` already does both, and it is the only place
   allowed to say yes. A second copy of `normalizeDomain` on the client would
   be a second answer to a question that already has one, and the client's
   copy would be the one nobody updates.
   ========================================================================== */

let failures = 0;
function check(ok: boolean, label: string, detail: string | null = null): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function main(): Promise<void> {
  const { loginParam, cleanedUrl } = await import("@/lib/autoSignIn");

  console.log("\na link that carries a store");

  check(
    loginParam("?login=c27297-32.myshopify.com") === "c27297-32.myshopify.com",
    "the plain case",
  );
  check(
    loginParam("?login=https%3A%2F%2Fshop.myshopify.com%2F") ===
      "https://shop.myshopify.com/",
    "percent-encoding is decoded, and handed on as typed",
    "the server normalises it",
  );
  check(
    loginParam("?utm_source=mail&login=shop.myshopify.com&x=1") === "shop.myshopify.com",
    "found among other parameters",
  );
  check(loginParam("?login=  shop.myshopify.com  ") === "shop.myshopify.com", "trimmed");

  console.log("\na link that does not");

  check(loginParam("") === null, "no query string at all");
  check(loginParam("?") === null, "an empty query string");
  check(loginParam("?utm_source=mail") === null, "other parameters only");
  check(loginParam("?login=") === null, "the parameter present but empty");
  check(loginParam("?login=%20%20") === null, "whitespace only");

  console.log("\ntwo of them is not two sign-ins");

  /* A URL cannot mean two stores. Taking the first is the only reading that is
     not a guess, and it is what URLSearchParams already does. */
  check(
    loginParam("?login=a.myshopify.com&login=b.myshopify.com") === "a.myshopify.com",
    "the first wins",
  );

  console.log("\nthe parameter is removed from the address bar");

  /* It is a credential in a URL for as long as it sits there: browser history,
     the Referer header on the next request, CDN logs, analytics. Nothing can
     unsend those, so the window is closed as early as possible. */
  check(
    cleanedUrl("https://pagefly-design.pagefly.io/?login=shop.myshopify.com") ===
      "https://pagefly-design.pagefly.io/",
    "on its own it leaves a bare path",
  );
  check(
    cleanedUrl("https://x.io/?utm_source=mail&login=shop.myshopify.com") ===
      "https://x.io/?utm_source=mail",
    "the other parameters are kept",
  );
  check(
    cleanedUrl("https://x.io/?login=a&login=b") === "https://x.io/",
    "every copy of it goes, not just the first",
  );
  check(
    cleanedUrl("https://x.io/#pages") === "https://x.io/#pages",
    "a URL without it is returned unchanged, fragment and all",
  );
  check(
    cleanedUrl("https://x.io/?login=a#pages") === "https://x.io/#pages",
    "and the fragment survives the removal",
  );

  console.log(failures === 0 ? "\nall good\n" : `\n${failures} failure(s)\n`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();

export {};
