/* ==========================================================================
   Can Build Quickly produce a brief the server will refuse?

       npx tsx scripts/test-brief-mode.ts

   Build Quickly asks for three things — where you sell, one prompt describing
   what you want built, and which pages — and has a model derive the three the
   form used to demand: what you sell, the visual style, the store type. That
   splits readiness in two, which is exactly the shape of the bug
   `scripts/test-brief.ts` was written for: `firstMissing` enables the Create
   button, `briefSchema` decides whether the build may start, and when they
   disagree the merchant gets a button that works and a build that never begins,
   with nothing said.

   So the guarantee under test is one sentence: whatever Build Quickly leaves
   empty, the resolver fills with a value `briefSchema` accepts — even with no
   model configured, even when the model answers nonsense.
   ========================================================================== */

let failures = 0;
function check(ok: boolean, label: string, detail: string | null = null): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function main(): Promise<void> {
  const { validateBrief, firstMissing, QUICK_RESOLVED_FIELDS } = await import(
    "../lib/validation"
  );
  const {
    coerceQuickChoice,
    FALLBACK_STORE_TYPE,
    FALLBACK_STYLE,
  } = await import("../lib/quickBrief");
  const { VISUAL_STYLE_IDS } = await import("../lib/styleTokens");
  const { MAX_SELL_CHARS, STORE_TYPE_IDS } = await import("../lib/briefOptions");

  const PROMPT =
    "Hand-thrown stoneware mugs in small batches. Main colours #2F3B2F and #EFE7D8. I want a reviews section and a size guide.";

  /* What the Build Quickly form is capable of producing: the three fields it
     shows, and empty in the three it does not. */
  const quickDraft = (over: Record<string, unknown> = {}) => ({
    whatYouSell: "",
    verticalSlug: null,
    visualStyle: null,
    storeType: null,
    market: "vn",
    prompt: PROMPT,
    brandColors: [],
    referenceImages: [],
    pages: { home: 1 },
    ...over,
  });

  console.log("\nfirstMissing knows which mode it is being asked about");

  check(
    firstMissing(quickDraft() as never, "quick") === null,
    "a quick brief with only a prompt is ready to build",
  );
  check(
    firstMissing(quickDraft() as never, "detail") === "Tell us what you sell",
    "the same brief in detail mode is not",
  );
  /* Back-compat, and the reason mode is the second argument rather than the
     first: every existing caller that passes one argument must keep the
     behaviour it had before this existed. */
  check(
    firstMissing(quickDraft() as never) === "Tell us what you sell",
    "and with no mode given at all it still asks what you sell",
  );

  console.log("\nquick mode asks for the prompt instead, and means it");

  check(
    firstMissing(quickDraft({ prompt: "" }) as never, "quick") ===
      "Tell us what to build",
    "an empty prompt is the one thing quick mode refuses",
  );
  check(
    firstMissing(quickDraft({ prompt: "   \n  " }) as never, "quick") ===
      "Tell us what to build",
    "and whitespace is not a brief",
  );
  /* The prompt is OPTIONAL in detail mode and always was. Quick mode requiring
     it must not leak into the other form. */
  check(
    firstMissing(
      quickDraft({ prompt: "", whatYouSell: "ceramic mugs", visualStyle: "minimal", storeType: "d2c" }) as never,
      "detail",
    ) === null,
    "while detail mode is still happy with no prompt at all",
  );
  check(
    firstMissing(quickDraft({ pages: {} }) as never, "quick") ===
      "Pick at least one page",
    "quick mode still asks which pages",
  );
  check(
    firstMissing(quickDraft({ pages: { home: 0 } }) as never, "quick") ===
      "Pick at least one page",
    "and a zero count is not a page",
  );

  console.log("\nquick mode drops the three resolved fields and nothing else");

  check(
    QUICK_RESOLVED_FIELDS.length === 3 &&
      QUICK_RESOLVED_FIELDS.includes("whatYouSell") &&
      QUICK_RESOLVED_FIELDS.includes("visualStyle") &&
      QUICK_RESOLVED_FIELDS.includes("storeType"),
    "the resolved fields are whatYouSell, visualStyle and storeType",
    QUICK_RESOLVED_FIELDS.join(", "),
  );

  /* The drift guard. Each field named as resolved must be one detail mode
     demands and quick mode tolerates — a field added to that list without
     being handled by the resolver would silently stop being asked for. */
  for (const field of QUICK_RESOLVED_FIELDS) {
    const blank = field === "whatYouSell" ? "" : null;
    check(
      firstMissing(
        {
          ...quickDraft({ whatYouSell: "ceramic mugs", visualStyle: "minimal", storeType: "d2c" }),
          [field]: blank,
        } as never,
        "detail",
      ) !== null,
      `detail mode still demands ${field}`,
    );
  }

  /* Answers a merchant DID give in detail mode, kept when they switch to quick.
     Quick mode means "you need not answer", never "your answer is discarded". */
  check(
    firstMissing(
      quickDraft({
        whatYouSell: "ceramic mugs",
        visualStyle: "editorial",
        storeType: "b2b",
      }) as never,
      "quick",
    ) === null,
    "answers given before switching to quick mode are still ready",
  );

  console.log("\nthe resolver cannot return a value the schema refuses");

  const valid = coerceQuickChoice(
    { sell: "hand-thrown stoneware mugs", visualStyle: "editorial", storeType: "b2b" },
    PROMPT,
  );
  check(
    valid.sell === "hand-thrown stoneware mugs" &&
      valid.visualStyle === "editorial" &&
      valid.storeType === "b2b",
    "a good answer is carried through unchanged",
  );
  check(valid.used === true, "and is reported as the model's own choice");

  /* Models return ids with the casing and padding of the list they read them
     from. Refusing " Bold " would throw away a correct answer. */
  const messy = coerceQuickChoice(
    { sell: "  ceramic\n  mugs  ", visualStyle: " Bold ", storeType: "SINGLE-PRODUCT" },
    PROMPT,
  );
  check(
    messy.visualStyle === "bold" && messy.storeType === "single-product",
    "case and padding are the model's habit, not a wrong answer",
    `${messy.visualStyle} / ${messy.storeType}`,
  );
  check(
    messy.sell === "ceramic mugs",
    "and a sell phrase comes back on one line",
    JSON.stringify(messy.sell),
  );

  const invented = coerceQuickChoice(
    { sell: "mugs", visualStyle: "brutalist-maximalism", storeType: "shop" },
    PROMPT,
  );
  check(
    invented.visualStyle === FALLBACK_STYLE &&
      invented.storeType === FALLBACK_STORE_TYPE,
    "an invented id falls back rather than reaching the generator",
  );
  check(
    invented.sell === "mugs",
    "without discarding the sell phrase, which was fine",
  );
  check(
    invented.used === false,
    "and says so, because an unused answer is worth logging",
  );

  console.log("\nand what you sell is derived from the prompt when it has to be");

  for (const [label, value] of [
    ["null", null],
    ["a string", "minimal"],
    ["an array", []],
    ["an empty object", {}],
    ["undefined", undefined],
  ] as [string, unknown][]) {
    const out = coerceQuickChoice(value, PROMPT);
    check(
      out.visualStyle === FALLBACK_STYLE &&
        out.storeType === FALLBACK_STORE_TYPE &&
        out.sell.length >= 2,
      `${label} still resolves to a usable brief`,
      JSON.stringify(out.sell),
    );
  }

  /* The cap is the form's, not a number invented here: `whatYouSell` is a
     120-character field and a 3,000-character prompt cannot be poured into it. */
  const long = coerceQuickChoice(null, "x".repeat(400));
  check(
    long.sell.length <= MAX_SELL_CHARS,
    "a long prompt is cut to what the field holds",
    `${long.sell.length} / ${MAX_SELL_CHARS}`,
  );

  const wordy = coerceQuickChoice(null, `${"word ".repeat(60)}end`);
  check(
    wordy.sell.length <= MAX_SELL_CHARS && !wordy.sell.endsWith("wor"),
    "and cut between words rather than through one",
    JSON.stringify(wordy.sell.slice(-16)),
  );

  /* A prompt too short to derive anything from still has to produce a sell the
     schema accepts — it wants two characters, and "hi" is a brief a merchant
     can type. */
  const tiny = coerceQuickChoice(null, "mugs");
  check(tiny.sell === "mugs", "a short prompt is used as it stands");

  console.log("\nand the resolved brief passes the gate the server uses");

  /* The whole point, end to end: the emptiest brief Build Quickly can produce,
     plus whatever the resolver says about the worst answer a model can give,
     must validate through the SAME schema `/api/build` runs. */
  const worst = coerceQuickChoice({ visualStyle: "???", storeType: null }, PROMPT);
  const resolved = validateBrief(
    quickDraft({
      whatYouSell: worst.sell,
      visualStyle: worst.visualStyle,
      storeType: worst.storeType,
    }) as never,
  );
  check(
    resolved.success,
    "a quick brief resolved from a nonsense answer still validates",
    resolved.success ? null : JSON.stringify(resolved.error.issues[0]),
  );

  /* And unresolved it does not — so the test above is testing the resolver
     rather than a schema that stopped caring. */
  const unresolved = validateBrief(quickDraft() as never);
  check(
    !unresolved.success,
    "while the same brief with the fields still empty is refused",
  );

  /* The fallbacks are ids, not strings that look like ids. Renaming a style and
     forgetting this constant would break every quick build with no model
     configured — which is every local dev. */
  check(
    (VISUAL_STYLE_IDS as readonly string[]).includes(FALLBACK_STYLE),
    "the fallback style is a real style",
    FALLBACK_STYLE,
  );
  check(
    (STORE_TYPE_IDS as readonly string[]).includes(FALLBACK_STORE_TYPE),
    "the fallback store type is a real store type",
    FALLBACK_STORE_TYPE,
  );

  console.log();
  console.log(failures === 0 ? "PASS" : `FAIL — ${failures} problem${failures === 1 ? "" : "s"}`);
  if (failures) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
