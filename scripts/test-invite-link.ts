/* ==========================================================================
   The signature that says a link came from us.

       npx tsx scripts/test-invite-link.ts

   An invite link creates a store and signs somebody in, so the one thing it
   must not be is guessable. The property that matters is not "the token is
   valid" — it is that a token issued for one domain is worthless on another.
   Without that, one leaked link is a key to every store name a person can
   think of.

   No network and no model: this is HMAC over a string, and it should be
   testable in a second.
   ========================================================================== */

import { createRequire } from "node:module";
import Module from "node:module";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

const DB_FILE = join(tmpdir(), "pfd-test-invite.json");
rmSync(DB_FILE, { force: true });
process.env.PFD_DB_FILE = DB_FILE;
process.env.SESSION_SECRET = "invite-test-secret-value-long-enough";

let failures = 0;
function check(ok: boolean, label: string, detail: string | null = null): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const A = "shop-a.myshopify.com";
const B = "shop-b.myshopify.com";

async function main(): Promise<void> {
  const { signInvite, verifyInvite, INVITE_MAX_AGE } = await import("@/lib/session");

  console.log("\na link we issued opens the store it names");

  const token = signInvite(A);
  check(typeof token === "string" && token.length > 20, "signing produces a token");
  check(verifyInvite(token, A), "and it verifies for that domain");

  console.log("\nand is worthless on any other");

  /* THE PROPERTY THE WHOLE SCHEME EXISTS FOR. Editing `login=` in a link we
     sent must not admit a different store — otherwise one invite is an invite
     to every domain somebody can type. */
  check(!verifyInvite(token, B), "the same token is refused for another domain");
  check(
    !verifyInvite(signInvite(B), A),
    "and the swap fails in the other direction too",
  );

  console.log("\na token nobody signed");

  check(!verifyInvite("", A), "an empty token");
  check(!verifyInvite("not-a-token", A), "a token with no signature at all");
  check(!verifyInvite("bm90aGluZw.badsignature", A), "a made-up signature");

  console.log("\na token somebody edited");

  const [payload, sig] = token.split(".");
  check(Boolean(payload && sig), "the token is payload.signature", token.slice(0, 12) + "…");
  /* Re-pointing the payload at another domain while keeping our signature is
     the obvious forgery, and the one an attacker reaches for first. */
  const forgedPayload = Buffer.from(JSON.stringify({ d: B, iat: Date.now() })).toString(
    "base64url",
  );
  check(!verifyInvite(`${forgedPayload}.${sig}`, B), "a re-pointed payload is refused");
  check(
    !verifyInvite(`${payload}.${sig.slice(0, -1)}x`, A),
    "one changed character in the signature is refused",
  );

  console.log("\nand a token that has been sitting in a mailbox too long");

  check(verifyInvite(token, A, 60), "sixty seconds accepts a fresh one");

  /* A real wait, not a maxAge of zero. `unseal` asks whether the elapsed
     seconds are GREATER than the limit, so a token minted in the same
     millisecond as the check is not yet expired at zero — correct behaviour,
     and an assertion that only passed when the clock happened to tick between
     two statements. This one is true regardless of timing. */
  const aged = signInvite(A);
  await new Promise((r) => setTimeout(r, 1100));
  check(!verifyInvite(aged, A, 1), "a token older than the limit is refused");
  check(verifyInvite(aged, A, 3600), "and the same token is fine under a longer one");
  check(
    INVITE_MAX_AGE === 30 * 24 * 60 * 60,
    "the shipped limit is thirty days",
    `${INVITE_MAX_AGE}s`,
  );

  console.log("\nthe domain is compared after normalising, not as typed");

  /* A link may come back with the scheme, a trailing slash or different case —
     mail clients rewrite URLs. The signature is over the normalised domain, so
     all of those still open the store they name. */
  check(verifyInvite(token, "HTTPS://WWW.Shop-A.myshopify.com/"), "a rewritten URL still verifies");

  console.log(failures === 0 ? "\nall good\n" : `\n${failures} failure(s)\n`);
  rmSync(DB_FILE, { force: true });
  process.exit(failures === 0 ? 0 : 1);
}

void main();

export {};
