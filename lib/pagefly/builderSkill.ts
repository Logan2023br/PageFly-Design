import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";

/* ==========================================================================
   The `pagefly-builder` skill, assembled for a model that answers in JSON.

   WHY IT IS HERE AT ALL. The deterministic converter reads a laid-out document
   and writes PageFly nodes from what the browser measured. It gets the pixels
   right and it knows nothing about PageFly beyond what `builder.ts` was taught
   one bug at a time — so a table stays a table only because somebody found out
   the hard way that it must, and a tab bar needs five slots only because a
   reference export was diffed field by field.

   This skill is the opposite kind of knowledge: 99 element types with their
   real shapes, every field, every legal nesting, verified against real imports.
   Handing it to the model that already wrote the page means the conversion is
   made by something that can see BOTH the design and the element vocabulary,
   rather than by a walk that can see only the DOM.

   WHAT IS SENT, and what is not:

     SKILL.md            whole — the rules, the hard-won ones especially
     export-format.md    whole — the container, items[], styles[], roomId
     kitchen-sink trees  shapes only, STYLE lines removed

   The `STYLE=` lines are two thirds of those trees (71 KB of 136 KB) and they
   describe the CSS of a page nobody is building. The CSS for THIS page is in
   the HTML it is converting, measured and complete. What the trees are needed
   for is the SHAPE — which types exist, what `data` they carry, what may sit
   inside what — and that survives the cut.

   `fields.md` (120 KB) and `nesting.md` (184 KB) stay on disk. They document
   the same 99 types the trees already show by example, and an example the model
   can copy beats a table it has to read.
   ========================================================================== */

const DIR = join(process.cwd(), "skills", "pagefly-builder");

function read(...parts: string[]): string {
  try {
    return readFileSync(join(DIR, ...parts), "utf8").trim();
  } catch {
    return "";
  }
}

/** Drop the per-element CSS from a kitchen-sink tree, keeping the shapes. */
function shapesOnly(tree: string): string {
  return tree
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("STYLE="))
    .join("\n");
}

let cached: string | null = null;

/**
 * The system prompt for the HTML → .pagefly stage.
 *
 * Cached, because it is byte-identical on every page and every section of every
 * page — which is also what makes it cacheable at the vendor. It is the prefix
 * of every request this stage makes, so it must not vary.
 */
export function pageflyBuilderSkill(): string {
  if (cached !== null) return cached;

  const parts = [
    read("SKILL.md"),
    read("references", "export-format.md"),
    "# Real element shapes\n\n" +
      "Copy `data` payloads from here rather than inventing them. These are two\n" +
      "pages the PageFly editor exported itself, so every shape below is one that\n" +
      "imports. Per-element CSS has been removed: the CSS for the page you are\n" +
      "building is in the HTML you were given.\n\n```\n" +
      shapesOnly(read("references", "kitchen-sink-1-tree.txt")) +
      "\n" +
      shapesOnly(read("references", "kitchen-sink-2-tree.txt")) +
      "\n```",
  ].filter(Boolean);

  cached = parts.join("\n\n---\n\n");
  return cached;
}

/** For a test that wants to see what is sent without paying for a completion. */
export function __skillSizeForTest(): {
  total: number;
  skill: number;
  format: number;
  shapes: number;
} {
  const skill = read("SKILL.md").length;
  const format = read("references", "export-format.md").length;
  const shapes =
    shapesOnly(read("references", "kitchen-sink-1-tree.txt")).length +
    shapesOnly(read("references", "kitchen-sink-2-tree.txt")).length;
  return { total: pageflyBuilderSkill().length, skill, format, shapes };
}
