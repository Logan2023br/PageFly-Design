import { unzipSync, strFromU8 } from "fflate";

/* ==========================================================================
   What a PageFly element looks like when PageFly made it.

   `reference/all-elements.pagefly` is a product page built in the editor by
   hand, carrying 99 element types and importing without a complaint. It is the
   only artefact in this repository that shows the shape of a correct file
   rather than describing it: `fields.md` lists what a field IS, and this shows
   what the editor actually writes.

   THE TWO DISAGREE, AND THE FILE WINS. `fields.md` says of `Tabs3` — "single
   block, emit the type alone, no child nodes, the renderer owns the tab
   structure". The editor's own export has `Tabs3` holding `TabsMenu3`,
   `TabContentWrapper3`, a `DropdownButton` and two loose `TabHeader3`s. One of
   those is a description of an authoring path; the other is a file that opens.

   WHAT THIS MODULE IS. A reader, not a rule. It turns the reference into a
   table of shapes — which data keys each type carries, which of them appear on
   every instance, which children it holds — so a test can compare what we emit
   against what the editor emits. The comparison and the judgement live in
   `scripts/test-conformance.ts`; this file only reads.
   ========================================================================== */

export type ElementShape = {
  type: string;
  /** how many of this type the reference contains */
  count: number;
  /** every data key seen, with how many instances carried it */
  keys: Record<string, number>;
  /** keys present on EVERY instance — the ones an element is never without */
  always: string[];
  /** child types seen under it, with how many times */
  children: Record<string, number>;
};

export type Reference = {
  /** the editor build that produced it, for when a later export disagrees */
  version: string;
  items: number;
  shapes: Record<string, ElementShape>;
};

type RawItem = {
  id: string;
  type: string;
  data?: Record<string, unknown>;
  children?: string[];
};

/**
 * Read a `.pagefly` into a table of element shapes.
 *
 * Takes the bytes rather than a path: the caller knows where the file is, and a
 * reader that opens files cannot be used on the export a test has just built —
 * which is half of what it is for.
 */
export function shapesOf(bytes: Uint8Array): Reference {
  const files = unzipSync(bytes);
  const entry = Object.keys(files)[0];
  const page = JSON.parse(strFromU8(files[entry])) as {
    items: RawItem[];
    pageflyVersion?: string;
  };

  const byId = new Map(page.items.map((i) => [i.id, i]));
  const shapes: Record<string, ElementShape> = {};

  for (const item of page.items) {
    const shape = (shapes[item.type] ??= {
      type: item.type,
      count: 0,
      keys: {},
      always: [],
      children: {},
    });
    shape.count++;
    for (const key of Object.keys(item.data ?? {}))
      shape.keys[key] = (shape.keys[key] ?? 0) + 1;
    for (const childId of item.children ?? []) {
      const child = byId.get(childId);
      if (child) shape.children[child.type] = (shape.children[child.type] ?? 0) + 1;
    }
  }

  for (const shape of Object.values(shapes))
    shape.always = Object.keys(shape.keys)
      .filter((k) => shape.keys[k] === shape.count)
      .sort();

  return {
    version: page.pageflyVersion ?? "unknown",
    items: page.items.length,
    shapes,
  };
}

export type Divergence = {
  type: string;
  /** on every instance of theirs, on none of ours */
  missing: string[];
  /** on ours, on none of theirs — the shape of a key that does nothing */
  unknown: string[];
  /** child types theirs always has and ours never does */
  missingChildren: string[];
};

/**
 * Where our export differs from the editor's.
 *
 * Only types BOTH files contain: a reference that happens not to use an element
 * says nothing about it, and reporting every element we emit and it does not
 * would bury the rows that matter under a list of absences.
 *
 * `missing` is deliberately strict — a key on every one of theirs — and
 * `unknown` deliberately loose: a key on ours and on none of theirs. Between
 * them sits the large middle ground of optional settings, which is not a
 * divergence and is not reported.
 */
export function diff(ours: Reference, theirs: Reference): Divergence[] {
  const out: Divergence[] = [];

  for (const type of Object.keys(ours.shapes).sort()) {
    const mine = ours.shapes[type];
    const yours = theirs.shapes[type];
    if (!yours) continue;

    const missing = yours.always.filter((k) => !mine.keys[k]);
    const unknown = Object.keys(mine.keys)
      .filter((k) => !yours.keys[k])
      .sort();
    const missingChildren = Object.keys(yours.children)
      .filter((c) => yours.children[c] >= yours.count && !mine.children[c])
      .sort();

    if (missing.length || unknown.length || missingChildren.length)
      out.push({ type, missing, unknown, missingChildren });
  }

  return out;
}
