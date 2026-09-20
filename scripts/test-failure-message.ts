/* ==========================================================================
   What a merchant is told when a build fails.

       npx tsx scripts/test-failure-message.ts

   ONE SENTENCE, AND IT NAMES NOBODY. This file used to assert the opposite —
   that a vendor's own words were passed straight through, because "out of
   credit" and "rate limited" name something someone can go and fix, and
   hiding them behind "contact support" would send a merchant to us with a
   question their billing page answers.

   The premise was wrong about WHOSE billing page. The key is ours: `keyFor`
   in `lib/ai/provider.ts` reads it from this server's own environment, and a
   merchant has no account with the model vendor, no page to top up, and no
   way to act on a 402. What actually reached them was our stack's name and an
   HTTP status in red across the brief:

       DeepSeek is having an outage — nothing here is wrong. Try again
       shortly. (503) Nothing was built, and none of your page allowance was
       used.

   That message has an audience — it is the operator, reading the log or the
   job row, where it still is. It was being shown to the one person who can do
   nothing with it, and it told them which model we run.

   So every failure becomes the same sentence, and the per-page reasons are
   blanked on the way to the browser rather than at each screen that prints
   them — three of them did, and a fourth would have.
   ========================================================================== */

let failures = 0;
function check(ok: boolean, label: string, detail: string | null = null): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function main(): Promise<void> {
  const { merchantMessage, merchantFailures, BUILD_FAILED } = await import(
    "../lib/build/failureMessage"
  );

  console.log("\nevery failure says the same thing");

  const vendor = [
    "DeepSeek refused the request: the account is out of credit. Top it up and build again. (402)",
    "Anthropic rejected the API key. Check it is set and still valid. (401)",
    "DeepSeek is rate limiting this key. Wait a minute and build again. (429)",
    "DeepSeek is having an outage — nothing here is wrong. Try again shortly. (503)",
  ];
  for (const reason of vendor)
    check(
      merchantMessage({ reason, vendorFault: true }) === BUILD_FAILED,
      `a vendor fault is not repeated at the merchant — ${reason.slice(0, 22)}…`,
      merchantMessage({ reason, vendorFault: true }),
    );

  check(
    merchantMessage({
      reason:
        'model did not return JSON — 37983 output tokens, answer began: "{\\"plan\\":\\"1 · commerce"',
    }) === BUILD_FAILED,
    "and neither is an answer we could not parse",
  );
  check(
    merchantMessage({ reason: "tree rejected: sections.0.type Invalid input" }) === BUILD_FAILED,
    "nor a tree that failed validation",
  );
  check(merchantMessage(undefined) === BUILD_FAILED, "nor a build with no recorded failure");
  check(merchantMessage({ reason: "  " }) === BUILD_FAILED, "nor one whose reason is blank");

  console.log("\nand it leaks nothing");

  /* Asserted against the sentence itself rather than against one call, so a
     reworded message cannot quietly reintroduce any of these. */
  for (const word of ["DeepSeek", "Anthropic", "model", "token", "JSON", "API key", "402", "503"])
    check(
      !BUILD_FAILED.toLowerCase().includes(word.toLowerCase()),
      `the sentence never says "${word}"`,
      BUILD_FAILED,
    );

  check(/try again/i.test(BUILD_FAILED), "it does say to try again", BUILD_FAILED);

  console.log("\nthe per-page reasons are blanked before they reach a browser");

  /* THE FUNNEL, NOT EACH SCREEN. `StickyBar`, `ResultsScreen` and
     `GeneratingScreen` all printed `reason` directly; fixing three call sites
     leaves the fourth to be written. */
  const kept = merchantFailures([
    { pageId: "p1", label: "home", reason: "model did not return JSON — 37983 output tokens" },
    { pageId: "p2", label: "collection", reason: "DeepSeek is having an outage (503)" },
  ]);
  check(kept.length === 2, "every failed page is still listed", `${kept.length}`);
  check(
    kept.every((f) => f.reason === ""),
    "with nothing left in the reason to print",
    JSON.stringify(kept.map((f) => f.reason)),
  );
  check(
    kept[0].pageId === "p1" && kept[0].label === "home",
    "and the page it belongs to is untouched",
  );
  check(
    merchantFailures(undefined).length === 0 && merchantFailures("nonsense").length === 0,
    "a column written by an older deploy is not a crash",
  );

  console.log(failures === 0 ? "\nall good\n" : `\n${failures} failure(s)\n`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();

export {};
