/* ==========================================================================
   What a merchant is told when a build fails.

       npx tsx scripts/test-failure-message.ts

   Two kinds of failure reach this decision and they are not the same message.

   One is about the ACCOUNT: out of credit, a rejected key, rate limiting, a
   vendor outage. Those have an audience who can act on them, and hiding them
   behind "contact support" sends a merchant to us with a question their
   billing page answers — which is the mistake `StickyBar` was written to fix.

   The other is our page designer answering in a shape we cannot use. There is
   nothing there a merchant can do anything with: "model did not return JSON —
   37983 output tokens, answer began …" tells them only that we are broken in a
   language they did not ask to learn. That one becomes a sentence and a way to
   reach us, while the detail stays in the job row and the log for whoever
   picks it up.
   ========================================================================== */

let failures = 0;
function check(ok: boolean, label: string, detail: string | null = null): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function main(): Promise<void> {
  const { merchantMessage, SUPPORT_MESSAGE, UNREACHABLE_MESSAGE } = await import(
    "../lib/build/failureMessage"
  );

  console.log("\nfailures the merchant can act on are passed through");

  const credit =
    "DeepSeek refused the request: the account is out of credit. Top it up and build again. (402)";
  check(
    merchantMessage({ reason: credit, vendorFault: true }) === credit,
    "an account out of credit says so",
  );
  check(
    merchantMessage({
      reason: "Anthropic rejected the API key. Check it is set and still valid. (401)",
      vendorFault: true,
    }).includes("API key"),
    "a rejected key says so",
  );

  console.log("\nfailures only we can act on become one sentence");

  check(
    merchantMessage({
      reason:
        'model did not return JSON — 37983 output tokens, answer began: "{\\"plan\\":\\"1 · commerce"',
    }) === SUPPORT_MESSAGE,
    "an answer we could not parse",
  );
  check(
    merchantMessage({ reason: "model returned NOTHING — 9120 output tokens, and an empty answer" }) ===
      SUPPORT_MESSAGE,
    "an empty answer",
  );
  check(
    merchantMessage({ reason: "tree rejected: sections.0.type Invalid input" }) === SUPPORT_MESSAGE,
    "a tree that failed validation",
  );
  check(
    !merchantMessage({ reason: "model did not return JSON — 37983 output tokens" }).includes("JSON"),
    "and the merchant is never shown the word JSON",
  );
  check(
    !merchantMessage({ reason: "ran out of output budget at 96000 tokens" }).includes("96000"),
    "nor a token count",
  );

  console.log("\nnothing to report at all");

  check(
    merchantMessage(undefined) === UNREACHABLE_MESSAGE,
    "a build with no recorded failure still says something",
  );
  check(
    merchantMessage({ reason: "  " }) === UNREACHABLE_MESSAGE,
    "and so does one whose reason is blank",
  );

  console.log("\nthe vendor flag is what decides, not the words");

  /* The reason text is written by a vendor and may say anything. Matching on
     its prose would break the day a message is reworded. */
  check(
    merchantMessage({ reason: "Anything at all", vendorFault: true }) === "Anything at all",
    "a flagged failure is passed through whatever it says",
  );
  check(
    merchantMessage({ reason: "DeepSeek is having an outage" }) === SUPPORT_MESSAGE,
    "an unflagged one is not, however much it sounds like a vendor",
  );

  console.log(failures === 0 ? "\nall good\n" : `\n${failures} failure(s)\n`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();

export {};
