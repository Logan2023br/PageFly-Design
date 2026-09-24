/* ==========================================================================
   A FORM WITH NO WIDTH OPINION IS HUGGED, AND A NEWSLETTER BOX IS NOT A CHIP.

       npx tsx scripts/test-form-width.ts

   REPORTED FROM A REAL IMPORT. A newsletter block came into the editor about
   390 pixels wide inside a container twice that: the email field and the
   Subscribe button stacked in a narrow column, a long way from the centred
   full-width row the mockup drew.

   Every other node this file emits goes through `filling`, which adds
   `width: 100%` when the node has not said otherwise — and leaves any width
   the mockup DID state exactly where it is. `Form2` was handed its styleData
   raw. A node with no width opinion is sized by whatever PageFly's layout
   engine assumes, and what it assumes is hug.

   The same note is already written twice in this file, for `Form2.Field` and
   for `FormInput`, each after the same symptom. This is the third element in
   the same subtree with the same cause.

   Nothing fails: the form works, the field accepts an address, the button
   submits. It is simply the wrong size, which no test that checks structure
   can see.
   ========================================================================== */

import { createRequire } from "node:module";
import Module from "node:module";
import { unzipSync, strFromU8 } from "fflate";

const require_ = createRequire(import.meta.url);
const resolve_ = (Module as unknown as { _resolveFilename: (r: string, ...a: unknown[]) => string })
  ._resolveFilename;
(Module as unknown as { _resolveFilename: unknown })._resolveFilename = function (
  this: unknown,
  request: string,
  ...args: unknown[]
) {
  if (request === "server-only") return require_.resolve("./server-only.cjs");
  return resolve_.call(this, request, ...args);
} as never;

let bad = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) bad++;
};
const head = (t: string) => console.log(`\n— ${t}`);

type Item = { id: string; type: string; children: string[] };

async function build(formCss: Record<string, string> | undefined) {
  const { pageflyFromTree } = await import("../lib/design/toPagefly");
  const tree = {
    tokens: { bg: "#F8F4EE", ink: "#2A221C", fontHeading: "Inter", fontBody: "Inter" },
    sections: [
      {
        type: "section",
        pattern: "signup",
        role: "commerce",
        css: { padding: "96px 56px" },
        children: [
          {
            type: "form",
            intent: "signup",
            submitText: "Subscribe",
            ...(formCss ? { css: formCss } : {}),
            fields: [
              { label: "Email", kind: "email", required: true, placeholder: "Your email address" },
            ],
          },
        ],
      },
    ],
  } as never;

  const { blob } = pageflyFromTree(
    tree,
    { name: "letter", bg: "#F8F4EE", ink: "#2A221C", fontBody: "Inter" },
    1440,
    { accent: "#B8955A" },
  );
  const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  const page = JSON.parse(strFromU8(files[Object.keys(files)[0]])) as {
    items: Item[];
    styles: { id: string; styles: string }[];
  };
  const form = page.items.find((i) => i.type === "Form2");
  const entry = page.styles.find((s) => s.id === form?.id);
  const all = entry
    ? ((JSON.parse(entry.styles) as Record<string, Record<string, string>>).all ?? {})
    : {};
  /* `&` is the element's own box; the other keys are rules it carries for
     children that cannot be styled on their own. */
  return { form, css: all["&"] ?? "", selectors: Object.keys(all) };
}

async function main(): Promise<void> {
  head("a form the mockup gave no width to fills its parent");
  const plain = await build(undefined);
  ok("the form is emitted", plain.form !== undefined);
  ok("it has a style entry at all", plain.css !== "", "a node with none hands the editor undefined");
  ok(
    "WIDTH 100%",
    /(^|[;\s])width\s*:\s*100%/.test(plain.css),
    plain.css.slice(0, 120) || "(nothing)",
  );
  ok(
    "and it asks the layout engine to fill",
    /--pf-flex-layout-width:\s*fill/.test(plain.css),
    "without this PageFly hugs the content, which is the 390px box that was reported",
  );

  head("but a width the mockup DID state is left alone");
  const fixed = await build({ width: "520px", margin: "0 auto" });
  ok(
    "the stated width survives",
    fixed.css.includes("520px"),
    fixed.css.slice(0, 140),
  );
  ok(
    "AND IS NOT OVERRULED BY A 100%",
    !/(^|[;\s])width\s*:\s*100%/.test(fixed.css),
    "a max-width row centred by the mockup must not be stretched to the band",
  );

  head("the field and the input still fill, as they already did");
  ok(
    "the field",
    plain.selectors.some((k) => k.includes('Form2.Field')),
    "this rule and the one below are on the Form2 because those nodes cannot be styled alone",
  );
  ok("the input", plain.selectors.some((k) => k.includes("FormInput")), plain.selectors.join(" | "));

  console.log(bad === 0 ? "\nall good" : `\n${bad} failed`);
  process.exit(bad === 0 ? 0 : 1);
}

void main().catch((e) => {
  console.error("threw:", e);
  process.exit(1);
});
