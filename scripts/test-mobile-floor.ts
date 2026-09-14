/* ==========================================================================
   The phone, for designs that never mentioned one.

       npx tsx scripts/test-mobile-floor.ts

   `floorFor` in `lib/design/derive.ts` is the only thing standing between a
   design that wrote no `mobile` block and a desktop page shown small. It is
   also the single piece of responsive behaviour the mockup and the .pagefly
   share — the preview asks `styleAt` what a node looks like at 390px and the
   exporter asks the same function the same question — so everything asserted
   here is asserted about both at once. That is the whole reason it is worth a
   file of its own: a hole in the floor is a hole in two products.

   Written after a real page came back with its text column sitting over the
   photograph above it and the whole band running off the right edge of the
   screen. Three separate holes, all in this function, all invisible to the
   existing tests because nothing tested this function.
   ========================================================================== */

let failures = 0;
function check(ok: boolean, label: string, detail: string | null = null): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

type N = Record<string, unknown>;
const kids = (n: number): N[] => Array.from({ length: n }, () => ({ type: "col", css: {} }));

async function main(): Promise<void> {
  const { styleAt } = await import("@/lib/design/derive");
  const at = (node: N, device: "all" | "laptop" | "tablet" | "mobile" = "mobile") =>
    styleAt(node as never, device) as Record<string, string>;

  console.log("\na flex row stacks — the case that already worked");

  const flexRow: N = { type: "row", css: { gap: "72px" }, children: kids(2) };
  check(at(flexRow).flexDirection === "column", "two columns become one");
  check(at(flexRow).alignItems === "stretch", "and they stretch rather than hug");
  check(
    at({ type: "row", css: {}, children: kids(1) }).flexDirection === undefined,
    "a row of one has nothing to stack",
  );

  /* ---- hole 1 ----------------------------------------------------------

     A GRID DOES NOT HEAR `flex-direction`. The floor wrote `flexDirection:
     column` onto every row of two or more, which is exactly right for a flex
     row and completely inert on `display: grid` — the three columns stayed
     three columns on a 390px screen, about 105px each once the gap is taken
     out, and the words came down one or two per line.

     `rowLayoutProblems` has flagged this shape from the beginning ("and so
     does a grid"), so the audit knew and the floor did not. */

  console.log("\na grid row stacks too, and `flex-direction` cannot do it");

  const gridRow: N = {
    type: "row",
    css: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "40px" },
    children: kids(3),
  };
  check(
    at(gridRow).gridTemplateColumns === "1fr",
    "three tracks become one",
    at(gridRow).gridTemplateColumns,
  );
  check(
    at(gridRow, "all").gridTemplateColumns === "1fr 1fr 1fr",
    "and the desktop keeps all three",
    at(gridRow, "all").gridTemplateColumns,
  );

  /* Explicit rows were written for a grid that had three columns. With one
     column the item count per row just changed, so a fixed row list squashes
     six items into two bands. */
  const gridRows: N = {
    type: "row",
    css: { display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "260px 260px" },
    children: kids(4),
  };
  check(
    at(gridRows).gridTemplateRows === "auto",
    "and explicit rows give way, because the row count changed with them",
    at(gridRows).gridTemplateRows,
  );

  /* ---- hole 2 ----------------------------------------------------------

     A WIDTH IN PIXELS DOES NOT SHRINK. The floor converted `flexBasis: 56%`
     and `width: 44%` to full width and left `width: 520px` exactly as written
     — on a 390px screen that is 130px of page hanging off the right edge, a
     horizontal scrollbar, and every band on the page inheriting the overflow.

     350px is the room a phone actually has: `DEVICE_WIDTH.mobile` is 390 and
     the floor caps a section's horizontal padding at 20px a side. Anything
     narrower than that fits and is left alone — a 320px card is a deliberate
     size, not an accident. */

  console.log("\na pixel width wider than the phone gives way");

  check(at({ type: "image", css: { width: "520px" } }).width === "100%", "520px fills instead");
  check(
    at({ type: "col", css: { width: "640px" }, children: kids(1) }).width === "100%",
    "and so does a 640px column",
  );
  check(
    at({ type: "image", css: { width: "320px" } }).width === "320px",
    "320px fits on a phone and is left exactly as the design wrote it",
  );
  check(
    at({ type: "image", css: { width: "520px" } }, "all").width === "520px",
    "the desktop is untouched",
  );

  /* A minimum is the one width that cannot be talked down by its container,
     so a large one overflows even when everything around it is willing to
     shrink. */
  check(
    at({ type: "col", css: { minWidth: "480px" }, children: kids(1) }).minWidth === "0",
    "a 480px minimum stops being a minimum",
  );
  check(
    at({ type: "col", css: { minWidth: "200px" }, children: kids(1) }).minWidth === "200px",
    "a small one is left alone",
  );

  /* ---- the model always wins ------------------------------------------

     This is a floor, not a policy. Everything above fills a silence; a design
     that actually decided something about phones keeps its decision. */

  console.log("\nthe design's own phone values still win");

  check(
    at({
      type: "row",
      css: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr" },
      mobile: { gridTemplateColumns: "1fr 1fr" },
      children: kids(3),
    }).gridTemplateColumns === "1fr 1fr",
    "a design that asked for two-up on the phone gets two-up",
  );
  check(
    at({ type: "image", css: { width: "520px" }, mobile: { width: "300px" } }).width === "300px",
    "and one that sized its own image keeps that size",
  );

  console.log(failures === 0 ? "\nall good\n" : `\n${failures} failure(s)\n`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();

export {};
