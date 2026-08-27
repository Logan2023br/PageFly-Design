/* ==========================================================================
   Can Build Quickly produce a brief the server will refuse?

       npx tsx scripts/test-brief-mode.ts

   Build Quickly asks for three things — market, what you sell, which pages —
   and lets the model choose the two the form used to demand: visual style and
   store type. That splits readiness in two, which is exactly the shape of the
   bug `scripts/test-brief.ts` was written for: `firstMissing` enables the
   Create button, `briefSchema` decides whether the build may start, and when
   they disagree the merchant gets a button that works and a build that never
   begins, with nothing said.

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
    coerceStyleChoice,
    FALLBACK_STORE_TYPE,
    FALLBACK_STYLE,
  } = await import("../lib/briefStyle");
  const { VISUAL_STYLE_IDS } = await import("../lib/styleTokens");
  const { STORE_TYPE_IDS } = await import("../lib/briefOptions");

  /* What the Build Quickly form is capable of producing: the three fields it
     shows, and null in the two it does not. */
  const quickDraft = (over: Record<string, unknown> = {}) => ({
    whatYouSell: "hand-thrown stoneware mugs",
    verticalSlug: null,
    visualStyle: null,
    storeType: null,
    market: "vn",
    prompt: "",
    brandColors: [],
    referenceImages: [],
    pages: { home: 1 },
    ...over,
  });

  console.log("\nfirstMissing knows which mode it is being asked about");

  check(
    firstMissing(quickDraft() as never, "quick") === null,
    "a quick brief with no style and no store type is ready to build",
  );
  check(
    firstMissing(quickDraft() as never, "detail") === "Pick a visual style",
    "the same brief in detail mode is not",
  );
  /* Back-compat, and the reason mode is the second argument rather than the
     first: every existing caller that passes one argument must keep the
     behaviour it had before this existed. */
  check(
    firstMissing(quickDraft() as never) === "Pick a visual style",
    "and with no mode given at all it still asks for the style",
  );

  console.log("\nquick mode drops the two resolved fields and nothing else");

  check(
    QUICK_RESOLVED_FIELDS.length === 2 &&
      QUICK_RESOLVED_FIELDS.includes("visualStyle") &&
      QUICK_RESOLVED_FIELDS.includes("storeType"),
    "the resolved fields are visualStyle and storeType",
    QUICK_RESOLVED_FIELDS.join(", "),
  );

  /* The drift guard. Each field named as resolved must be one detail mode
     demands and quick mode tolerates — a field added to that list without
     being handled by the resolver would silently stop being asked for. */
  for (const field of QUICK_RESOLVED_FIELDS) {
    check(
      firstMissing(quickDraft({ [field]: null }) as never, "detail") !== null,
      `detail mode still demands ${field}`,
    );
  }

  /* Everything quick mode DOES ask for is still required in quick mode. A
     resolver that filled these in would be guessing at the merchant. */
  check(
    firstMissing(quickDraft({ whatYouSell: "" }) as never, "quick") ===
      "Tell us what you sell",
    "quick mode still asks what you sell",
  );
  check(
    firstMissing(quickDraft({ whatYouSell: "x" }) as never, "quick") ===
      "Tell us what you sell",
    "one character is not an answer",
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

  /* A style the merchant DID pick in detail mode, kept when they switch to
     quick. Quick mode means "you need not choose", never "your choice is
     discarded". */
  check(
    firstMissing(
      quickDraft({ visualStyle: "editorial", storeType: "b2b" }) as never,
      "quick",
    ) === null,
    "a style chosen before switching to quick mode is still ready",
  );

  console.log("\nthe resolver cannot return a value the schema refuses");

  const valid = coerceStyleChoice({ visualStyle: "editorial", storeType: "b2b" });
  check(
    valid.visualStyle === "editorial" && valid.storeType === "b2b",
    "a good answer is carried through unchanged",
  );
  check(valid.used === true, "and is reported as the model's own choice");

  /* Models return ids with the casing and padding of the list they read them
     from. Refusing " Bold " would throw away a correct answer. */
  const messy = coerceStyleChoice({
    visualStyle: " Bold ",
    storeType: "SINGLE-PRODUCT",
  });
  check(
    messy.visualStyle === "bold" && messy.storeType === "single-product",
    "case and padding are the model's habit, not a wrong answer",
    `${messy.visualStyle} / ${messy.storeType}`,
  );

  const invented = coerceStyleChoice({
    visualStyle: "brutalist-maximalism",
    storeType: "shop",
  });
  check(
    invented.visualStyle === FALLBACK_STYLE &&
      invented.storeType === FALLBACK_STORE_TYPE,
    "an invented id falls back rather than reaching the generator",
  );
  check(
    invented.used === false,
    "and says so, because an unused answer is worth logging",
  );

  const half = coerceStyleChoice({ visualStyle: "luxury", storeType: 7 });
  check(
    half.visualStyle === "luxury" && half.storeType === FALLBACK_STORE_TYPE,
    "one bad field does not throw away the other",
  );

  for (const [label, value] of [
    ["null", null],
    ["a string", "minimal"],
    ["an array", []],
    ["an empty object", {}],
    ["undefined", undefined],
  ] as [string, unknown][]) {
    const out = coerceStyleChoice(value);
    check(
      out.visualStyle === FALLBACK_STYLE && out.storeType === FALLBACK_STORE_TYPE,
      `${label} resolves to the fallback pair`,
    );
  }

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

  console.log("\nand the resolved brief passes the gate the server uses");

  /* The whole point, end to end: the emptiest brief Build Quickly can produce,
     plus whatever the resolver says about the worst answer a model can give,
     must validate through the SAME schema `/api/build` runs. */
  const worst = coerceStyleChoice({ visualStyle: "???", storeType: null });
  const resolved = validateBrief(
    quickDraft({
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

  console.log();
  console.log(failures === 0 ? "PASS" : `FAIL — ${failures} problem${failures === 1 ? "" : "s"}`);
  if (failures) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
