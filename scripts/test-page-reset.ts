/* ==========================================================================
   THE PAGE RESET IS A DEFAULT, NOT A RULE.

       npx tsx scripts/test-page-reset.ts

   `pageCss` ships a handful of base declarations so the host theme's styles do
   not reach the imported tree. They were written `#__pf a { … }`, and an id
   plus an element is specificity (1,0,1) while the styleData PageFly compiles
   for one element is a class, (0,1,0). The id wins.

   So `color: inherit` was applied to every Button2 on every page this
   application has ever exported, discarding the colour the mockup stated. A
   ghost button drawn in near-white took the colour of whatever block it sat in
   — dark text on a dark band — on a page whose own file said `color: #EEF1F6`
   all along. Nothing was wrong with the export, which is why reading the
   .pagefly found nothing: it was thrown away at render time by a line of ours.

   ASSERTED BY SPECIFICITY, NOT BY TEXT. A test that greps for `:where(` passes
   on a rule that has it and still loses, and fails on a correct rewrite that
   reaches the same place another way. What has to hold is the ORDER: every
   base rule must sit under a single class, because a single class is what an
   element's own style gets.
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

const { designTreeSchema } = require_("../lib/design/schema") as typeof import("../lib/design/schema");
const { pageflyFromTree } = require_("../lib/design/toPagefly") as typeof import("../lib/design/toPagefly");

let failures = 0;
function check(ok: boolean, label: string, detail = ""): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

/**
 * CSS specificity of one selector, as [id, class, element].
 *
 * `:where()` contributes nothing, which is the whole point of the change this
 * guards; `:is()` contributes its most specific argument. Enough of the real
 * algorithm for the selectors this file ships, and no more.
 */
function specificity(selector: string): [number, number, number] {
  let s = selector.trim();
  /* `:where(...)` — the contents count for zero. */
  s = s.replace(/:where\([^()]*\)/g, " ");
  /* `:is(a, b)` — take the most specific argument. Every argument this file
     writes is a bare element, so counting one element is exact here. */
  let fromIs = 0;
  s = s.replace(/:is\(([^()]*)\)/g, (_m, inner: string) => {
    const args = inner.split(",").map((a) => a.trim());
    fromIs += Math.max(...args.map((a) => (a.startsWith("#") ? 100 : a.startsWith(".") ? 10 : 1)));
    return " ";
  });
  const ids = (s.match(/#[\w-]+/g) || []).length;
  const classes = (s.match(/(?:\.[\w-]+|\[[^\]]+\]|:[a-z-]+\([^)]*\)|:(?!:)[a-z-]+)/g) || []).length;
  const elements = (s.match(/(?:^|[\s>+~])\*?[a-z][\w-]*/gi) || []).length + (fromIs % 10);
  return [ids, classes, elements];
}

const beats = (a: [number, number, number], b: [number, number, number]) =>
  a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] > b[2];

/** What PageFly compiles one element's own styleData into: a single class. */
const OWN_STYLE: [number, number, number] = [0, 1, 0];

async function main(): Promise<void> {
  const { blob } = pageflyFromTree(
    designTreeSchema.parse({
      motionPlan: "",
      sections: [
        {
          type: "section",
          role: "hero",
          children: [
            {
              type: "button",
              text: "Ghost",
              css: { color: "#EEF1F6", background: "transparent", border: "1px solid #444" },
            },
          ],
        },
      ],
    }) as never,
    { name: "probe", bg: "#0B0C0F", ink: "#EEF1F6", fontBody: "Inter" },
    1200,
  );
  const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  const page = JSON.parse(strFromU8(files[Object.keys(files)[0]])) as {
    items: { id: string; type: string; data?: Record<string, unknown> }[];
    styles: { id: string; styles: string }[];
    customCSS?: string;
  };

  console.log("\nthe button's own colour reaches the file");
  const btn = page.items.find((i) => i.type === "Button2")!;
  const own = page.styles.find((s) => s.id === btn.id);
  const css = own ? (JSON.parse(own.styles).all?.["&"] ?? "") : "";
  check(/color:\s*#EEF1F6/i.test(css), "styleData carries the colour the design stated", css.slice(0, 80));

  console.log("\nand nothing in the page reset outranks it");
  /* Every selector the reset ships, checked one at a time. */
  const sheet = page.customCSS ?? "";
  const rules = [...sheet.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/(?:^|\n|\})\s*([^@\n{}][^{}]*?)\s*\{/g)]
    .map((m) => m[1].trim());
  const base = rules.filter((r) => r.includes("__pf") && !r.includes("data-pf-type"));
  check(base.length > 0, `the reset is in the sheet — ${base.length} selector group(s)`);

  /* AT THE TOP LEVEL ONLY. A plain `split(",")` cuts `:is(p, h1, h2)` into
     pieces that are not selectors, and then measures those — which is how the
     first run of this file reported `h6)` as a selector and passed on it. */
  const commas = (group: string): string[] => {
    const out: string[] = [];
    let depth = 0;
    let at = 0;
    for (let i = 0; i < group.length; i++) {
      if (group[i] === "(") depth++;
      else if (group[i] === ")") depth--;
      else if (group[i] === "," && depth === 0) {
        out.push(group.slice(at, i));
        at = i + 1;
      }
    }
    out.push(group.slice(at));
    return out.map((x) => x.trim()).filter(Boolean);
  };

  for (const group of base) {
    for (const one of commas(group)) {
      const spec = specificity(one);
      check(
        !beats(spec, OWN_STYLE),
        `${one}  (${spec.join(",")}) does not outrank an element's own style (0,1,0)`,
      );
    }
  }

  console.log("\nand the reset still applies where the element says nothing");
  check(/a\s*\{[^}]*color:\s*inherit/.test(sheet.replace(/\s+/g, " ")), "a bare link still inherits");
  check(/box-sizing:\s*border-box/.test(sheet), "box-sizing is still set");
  check(/margin:\s*0/.test(sheet), "the margin reset is still there");

  console.log(failures === 0 ? "\nall good" : `\n${failures} failed`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
