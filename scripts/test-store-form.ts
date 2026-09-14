/* ==========================================================================
   The three rules the browser and the server both apply.

       npx tsx scripts/test-store-form.ts

   `lib/storeForm.ts` exists because the register form runs in the browser and
   the register route runs on the server, and both have to judge the same three
   fields. The moment they hold separate copies of the rule they disagree — a
   form that refuses what the server would take, or waves through what it
   refuses — so there is one implementation and this is its test.

   Pure functions, no database, no network. `test-register.ts` covers what the
   ROUTE does with the verdicts; this covers the verdicts.
   ========================================================================== */

let failures = 0;
function check(ok: boolean, label: string, detail: string | null = null): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function main(): Promise<void> {
  const { normalizeDomain, storeDomainProblem, emailProblem, storeNameProblem } =
    await import("@/lib/storeForm");

  console.log("\none store, however it was typed");

  const same = [
    "shop.myshopify.com",
    "  Shop.myshopify.com  ",
    "HTTPS://Shop.myshopify.com",
    "http://www.shop.myshopify.com/",
    "shop.myshopify.com/admin/products",
    "shop.myshopify.com?utm_source=x",
    "shop.myshopify.com.",
  ];
  for (const spelling of same) {
    check(
      normalizeDomain(spelling) === "shop.myshopify.com",
      `\`${spelling.trim()}\``,
      normalizeDomain(spelling),
    );
  }

  console.log("\ndomains the form takes");

  for (const good of [
    "shop.myshopify.com",
    "good-store.myshopify.com",
    "a1.myshopify.com",
    "1shop.myshopify.com",
    /* Normalisation runs inside the check, so a pasted address bar is not a
       separate case the caller has to remember to handle. */
    "HTTPS://Good-Store.myshopify.com/admin",
  ]) {
    check(storeDomainProblem(good) === null, `\`${good}\``);
  }

  console.log("\nand the ones it does not");

  /* THE ONE THAT MATTERS is the first. A merchant reads "Store domain" and
     types the address their customers see, which is a different string from
     the one every table in this app joins on — so the row would be created
     under a key that can never sign in. */
  const bad: [string, string][] = [
    ["mystore.com", "their own storefront domain"],
    ["www.mystore.co.uk", "and with a country suffix"],
    ["shop.myshopify.io", "a near miss on the suffix"],
    ["shop.myshopify.net", "another"],
    ["myshopify.com", "the suffix with no store in front"],
    ["a.b.myshopify.com", "a subdomain of a store"],
    ["-shop.myshopify.com", "a label starting with a dash"],
    ["shop_name.myshopify.com", "an underscore, which Shopify does not allow"],
    ["notadomain", "no dot at all"],
    ["", "nothing"],
    ["   ", "only space"],
  ];
  for (const [value, label] of bad) {
    check(storeDomainProblem(value) !== null, `${label} — \`${value}\``);
  }

  /* The refusal has to name what they probably typed. "Invalid format" leaves
     a merchant staring at an address that is, to them, obviously their
     store's. */
  const problem = storeDomainProblem("mystore.com");
  check(
    /myshopify\.com/.test(problem?.hint ?? ""),
    "and the hint names the address they should use instead",
    problem?.hint ?? "(none)",
  );

  console.log("\nemail: an @ and something after it");

  for (const good of ["a@b.co", "owner@my-store.myshopify.com", "  a@b.co  "]) {
    check(emailProblem(good) === null, `\`${good.trim()}\``);
  }
  for (const [value, label] of [
    ["abc.com", "a domain in the email box — the mistake this exists for"],
    ["a@b", "no dot after the @"],
    ["@b.co", "nothing before the @"],
    ["a@", "nothing after it"],
    ["a b@c.co", "a space in it"],
    ["", "nothing"],
  ] as [string, string][]) {
    check(emailProblem(value) !== null, `${label} — \`${value}\``);
  }

  console.log("\nname: anything that is not blank");

  check(storeNameProblem("Cloudloft") === null, "a name");
  check(storeNameProblem("  x  ") === null, "one character and some space");
  check(storeNameProblem("") !== null, "empty is refused");
  check(storeNameProblem("   ") !== null, "and so is space alone");

  console.log(failures === 0 ? "\nall good\n" : `\n${failures} failure(s)\n`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();

export {};
