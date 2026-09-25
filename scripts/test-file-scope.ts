/* ==========================================================================
   WHOSE FILE IS THIS, AND WHO IS ALLOWED TO ASK FOR IT.

       npx tsx scripts/test-file-scope.ts

   A built `.pagefly` is stored under `(domain, key)` and the key is a hash of
   the document. Not guessable is not an access rule, so the domain is decided
   here rather than taken from whoever asked.

   Two failures, and they are opposite in kind:

     AN ADMIN COULD NOT ASK AT ALL. The lookup used the signed-in MERCHANT's
     domain, and an operator looking at a store has no merchant session — so
     every export from the admin fell through to a fresh conversion: two
     minutes and about twenty cents of model time, every single click, and the
     result thrown away again.

     A MERCHANT MUST NOT BE ABLE TO ASK FOR SOMEBODY ELSE'S. The moment a
     domain can be named in a request, the naming has to be ignored for anyone
     who is not an operator — and that is a rule that only ever fails silently,
     because the file downloads either way.
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

const { ownerFor } = require_("../lib/pagefly/fileScope") as
  typeof import("../lib/pagefly/fileScope");

let bad = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) bad++;
};
const head = (t: string) => console.log(`\n— ${t}`);

head("a signed-in merchant gets their own store");
ok(
  "and only their own",
  ownerFor({ session: "mine.myshopify.com", admin: false, asked: null }) === "mine.myshopify.com",
);
ok(
  "NAMING ANOTHER STORE CHANGES NOTHING",
  ownerFor({ session: "mine.myshopify.com", admin: false, asked: "theirs.myshopify.com" }) ===
    "mine.myshopify.com",
  `${ownerFor({ session: "mine.myshopify.com", admin: false, asked: "theirs.myshopify.com" })} — this rule can only ever fail silently: the file downloads either way`,
);

head("an operator asks for the store they are looking at");
ok(
  "the named store",
  ownerFor({ session: null, admin: true, asked: "theirs.myshopify.com" }) === "theirs.myshopify.com",
);
ok(
  "with nothing named there is nothing to look up",
  ownerFor({ session: null, admin: true, asked: null }) === null,
);

head("nobody signed in gets nothing");
ok("no session, no admin", ownerFor({ session: null, admin: false, asked: null }) === null);
ok(
  "AND NAMING A STORE DOES NOT HELP",
  ownerFor({ session: null, admin: false, asked: "theirs.myshopify.com" }) === null,
  "the key is unguessable, which is not the same as private",
);

head("an operator who is also signed in as a merchant");
/* Both at once is a real state — an operator testing with their own store. The
   merchant session is the narrower claim and wins, so a slip in the admin UI
   cannot read somebody else's file through a session that is already scoped. */
ok(
  "the merchant session wins",
  ownerFor({ session: "mine.myshopify.com", admin: true, asked: "theirs.myshopify.com" }) ===
    "mine.myshopify.com",
  ownerFor({ session: "mine.myshopify.com", admin: true, asked: "theirs.myshopify.com" }) ?? "null",
);

head("a domain is normalised before it decides anything");
ok(
  "case and spacing",
  ownerFor({ session: null, admin: true, asked: "  Theirs.MyShopify.com " }) ===
    "theirs.myshopify.com",
  ownerFor({ session: null, admin: true, asked: "  Theirs.MyShopify.com " }) ?? "null",
);
ok("an empty name is no name", ownerFor({ session: null, admin: true, asked: "   " }) === null);

console.log(bad === 0 ? "\nall good" : `\n${bad} failed`);
process.exit(bad === 0 ? 0 : 1);
