/* ==========================================================================
   Rows that squash everything onto one line.

       npx tsx scripts/test-row-layout.ts

   A `row` is a flex container. Give it several children, no width on any of
   them and no `flexWrap`, and the browser fits them all on one line at
   whatever widths their content happens to want. That is the collection page
   whose filter chips, three collapsed facets and a shortcut card all ended up
   in a single band, and the product page whose gallery, second photograph and
   buy column shared one row.

   Measured on a real Home page build: 23 of 25 rows were flex, ONE carried
   `flexWrap`, and half of the multi-child rows had children with no size at
   all. The two rows that read correctly were the two using
   `display:grid` with `gridTemplateColumns`.

   NOBODY WAS CHECKING. `specCheck`'s BUILDER_OWNS list deliberately excludes
   `flex` and `flexBasis` from the spec-versus-tree comparison — stage 2 says
   `basis 5` as a hint and the real value is stage 3's to write. Which is a
   fair division, except nothing then verified that stage 3 wrote anything.

   Pure function, no model: the geometry is decidable from the tree alone.
   ========================================================================== */

let failures = 0;
function check(ok: boolean, label: string, detail: string | null = null): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

type N = Record<string, unknown>;
const row = (css: N, ...children: N[]): N => ({ type: "row", css, children });
const col = (css: N = {}): N => ({ type: "col", css, children: [] });
const text = (): N => ({ type: "text", css: {} });

async function main(): Promise<void> {
  const { rowLayoutProblems } = await import("@/lib/design/rowLayout");

  console.log("\nthe shape that squashes");

  check(
    rowLayoutProblems(row({}, col(), col(), col())).length > 0,
    "three columns, none sized, no wrap",
    "the collection page's filter band",
  );
  check(
    rowLayoutProblems(row({}, col(), col(), col()))[0].includes("width"),
    "and the problem names what to add",
  );

  console.log("\nshapes that answer the width question");

  /* These still owe an answer about the phone — that is the next block. What is
     asserted here is only that nothing complains about WIDTH. */
  const widthProblems = (n: N) =>
    rowLayoutProblems(n).filter((p) => p.includes("no width"));

  check(
    widthProblems(row({}, col({ flex: "1 1 0" }), col({ flex: "2 1 0" }))).length === 0,
    "every column carries a flex",
  );
  check(
    widthProblems(row({}, col({ width: "320px" }), col({ flex: "1" }))).length === 0,
    "a fixed width counts as sized",
  );
  check(
    widthProblems(
      row({ display: "grid", gridTemplateColumns: "1fr 1fr 1fr" }, col(), col(), col()),
    ).length === 0,
    "a grid with columns needs no per-child size",
    "the two rows that read correctly on the measured page",
  );
  check(
    widthProblems(row({ flexWrap: "wrap" }, col(), col(), col())).length === 0,
    "a row allowed to wrap can carry unsized children",
  );

  console.log("\nrows this must not nag about");

  /* An icon beside a line of text is a row, and asking it to size both halves
     would fill the repair call with noise — the repair reads every problem in
     one pass, so a false one costs a real one. */
  check(rowLayoutProblems(row({}, text(), text())).length === 0, "text beside text");
  check(rowLayoutProblems(row({}, col())).length === 0, "a row with one child");
  check(rowLayoutProblems(row({})).length === 0, "an empty row");

  console.log("\nand the phone, where a squashed row is worse");

  check(
    rowLayoutProblems(row({}, col({ flex: "1" }), col({ flex: "1" }))).some((p) =>
      p.includes("mobile"),
    ),
    "two sized columns still have to stack on a phone",
  );
  check(
    rowLayoutProblems(
      row({ display: "grid", gridTemplateColumns: "1fr 1fr" }, col(), col()),
    ).some((p) => p.includes("mobile")),
    "and so does a grid",
  );
  check(
    rowLayoutProblems({
      type: "row",
      css: {},
      mobile: { flexDirection: "column" },
      children: [col({ flex: "1" }), col({ flex: "1" })],
    }).length === 0,
    "a row that already stacks is left alone",
  );

  console.log(failures === 0 ? "\nall good\n" : `\n${failures} failure(s)\n`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();

export {};
