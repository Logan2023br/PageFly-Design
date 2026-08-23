import { walk, type DesignTree } from "./schema";

/* ==========================================================================
   Every photograph a tree asks for, in one place.

   This was three filters inline in `designServer`, immediately above the
   `resolvePhotos` call, and being inline is how it went wrong: the list of node
   types that carry a `query` lives in `schema.ts` and grew, while the list of
   node types anyone LOOKED for stayed at the three it was written with. An
   `overlay` — the node the whole schema change exists for, text on a
   photograph — asked for a picture that nothing ever requested, so `src` came
   back empty on every overlay on every page ever generated. What imported was
   a scrim gradient painted over nothing: a dark box with the words at the
   bottom, and no photograph behind them.

   So the join is written down here, next to `walk`, where the next node type
   with a `query` is one line away from the traversal that would have missed it.

   `ratio` is passed through because the stock library picks orientation from
   it: `<= 1.05` is searched as landscape. It is the SHAPE of the box, which is
   the same number the exporter uses, and nothing here should second-guess it.
   ========================================================================== */

export type ImageWant = { query: string; ratio: number };

export function imageWants(tree: DesignTree): ImageWant[] {
  const nodes = walk(tree);
  const out: ImageWant[] = [];

  for (const n of nodes) {
    switch (n.type) {
      case "image":
        out.push({ query: n.query, ratio: n.ratio });
        break;

      /* A product shot is square — the grid it lands in is square, and a
         landscape crop of a bottle is a bottle with the label cut off. */
      case "product":
        out.push({ query: n.query, ratio: 1 });
        break;

      case "overlay":
        out.push({ query: n.query, ratio: n.ratio });
        break;

      /* Two photographs and a handle, and the handle is useless without both. */
      case "beforeAfter":
        out.push({ query: n.beforeQuery, ratio: 1 });
        out.push({ query: n.afterQuery, ratio: 1 });
        break;
    }
  }

  /* A band's background photograph is resolved with the rest — it is the same
     library and the same cache, and it is landscape by nature. */
  for (const s of tree.sections) {
    if (s.bg?.kind === "photo" && s.bg.query) out.push({ query: s.bg.query, ratio: 0.5 });
  }

  return out.filter((w) => w.query.trim() !== "");
}
