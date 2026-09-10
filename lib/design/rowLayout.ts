/* ==========================================================================
   A row is a flex container, and an unconstrained one squashes.

   Give a `row` several children, no width on any of them and no `flexWrap`,
   and the browser fits them all onto one line at whatever widths their content
   happens to want. That is the collection page whose filter chips, three
   collapsed facets and a shortcut card shared a single band, and the product
   page whose gallery, second photograph and buy column did the same.

   Measured on a real Home page build: 23 of 25 rows were flex, exactly ONE
   carried `flexWrap`, and half the multi-child rows had children with no size
   at all. The two rows that read correctly were the two written as
   `display:grid` with `gridTemplateColumns`.

   WHY NOTHING CAUGHT IT. `specCheck`'s BUILDER_OWNS list deliberately excludes
   `flex` and `flexBasis` from the spec-versus-tree comparison: stage 2 says
   `basis 5` as a hint and the real value belongs to stage 3. That division is
   right — and it left nobody checking that stage 3 wrote anything at all.

   THE PHONE IS THE HARSHER CASE. A row of three columns that merely looks
   cramped at 1440px is unreadable at 390px, so a layout row has to say what it
   does when the screen narrows. `mobile` is where that is said, and a row that
   never mentions `flexDirection` stays a row all the way down.

   Deliberately quiet about small rows. A row is also how an icon sits beside a
   line of text, and the repair call reads every problem in one pass — a false
   one costs a real one. Only rows carrying `col` children are judged, because
   a column is how someone says "this side of the layout".
   ========================================================================== */

type Node = Record<string, unknown>;

/** Anything that gives a flex child a width of its own. */
const SIZERS = ["flex", "flexBasis", "width", "maxWidth", "minWidth"] as const;

function css(node: Node): Record<string, unknown> {
  const c = node.css;
  return c && typeof c === "object" ? (c as Record<string, unknown>) : {};
}

function childrenOf(node: Node): Node[] {
  const kids = node.children;
  return Array.isArray(kids) ? (kids.filter((k) => k && typeof k === "object") as Node[]) : [];
}

function isSized(node: Node): boolean {
  const c = css(node);
  return SIZERS.some((k) => c[k] !== undefined && c[k] !== "");
}

/**
 * What is wrong with this one row's geometry, as sentences.
 *
 * Sentences because `audit` returns sentences and hands them straight to the
 * repair call — a problem it cannot read is a problem it cannot fix.
 */
export function rowLayoutProblems(node: Node): string[] {
  if (node.type !== "row") return [];

  const kids = childrenOf(node);
  /* A layout row is one that divides the page. Two words beside each other are
     also a row, and nothing here is about them. */
  const columns = kids.filter((k) => k.type === "col");
  if (kids.length < 2 || columns.length === 0) return [];

  const own = css(node);
  const isGrid = own.display === "grid" && Boolean(own.gridTemplateColumns);
  const wraps = Boolean(own.flexWrap);

  const problems: string[] = [];

  if (!isGrid && !wraps) {
    const unsized = kids.filter((k) => !isSized(k));
    if (unsized.length > 0)
      problems.push(
        `A row of ${kids.length} holds ${unsized.length} child` +
          `${unsized.length === 1 ? "" : "ren"} with no width. A flex row with nothing to ` +
          `divide by puts them all on one line at whatever width their contents want. ` +
          `Give every child a "flex" or a "width", or write the row as ` +
          `"display":"grid" with "gridTemplateColumns".`,
      );
  }

  const mobile = node.mobile;
  const stacks =
    mobile && typeof mobile === "object"
      ? (mobile as Record<string, unknown>).flexDirection === "column" ||
        Boolean((mobile as Record<string, unknown>).gridTemplateColumns)
      : false;

  if (!stacks)
    problems.push(
      `A row of ${kids.length} columns says nothing about a phone. Put ` +
        `"mobile":{"flexDirection":"column"} on it — at 390px these sit side by side ` +
        `at a third of the width each.`,
    );

  return problems;
}
