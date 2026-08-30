/* ==========================================================================
   What the MOCKUP draws by hand — and whether it matches the export.

       npx tsx scripts/test-render.tsx

   Most of this app's pixels come from `css` the design wrote, so the mockup
   renders them and there is nothing to test. A few composites are drawn by
   `render.tsx` itself — the buy box's controls, the form's field and button —
   and those are the ones that can quietly disagree with what `toPagefly`
   exports. A preview that is a picture of a different page is worse than a
   plain one.
   ========================================================================== */
import { createRequire } from "node:module";
import Module from "node:module";

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

let failures = 0;
function check(ok: boolean, label: string, detail: string | null = null): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const DARK_SECTION = {
  type: "section",
  role: "conversion",
  pattern: "newsletter-inline",
  css: { background: "#12100E", color: "#FAF7F2", padding: "96px 0" },
  children: [
    { type: "heading", level: 2, text: "Get the batch alerts" },
    {
      type: "form",
      intent: "newsletter",
      submitText: "→",
      fields: [{ label: "Email", kind: "email", required: true }],
    },
  ],
};

async function main(): Promise<void> {
  const React = (await import("react")).default;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { DesignRender } = await import("../lib/design/render");

  const draw = (palette: unknown): string =>
    renderToStaticMarkup(
      React.createElement(DesignRender, {
        tree: { motionPlan: "none", sections: [DARK_SECTION] },
        device: "all",
        images: {},
        videos: {},
        palette,
      } as never),
    );

  console.log("\na form on an inverted band");

  const dark = draw({ accent: "#B4552C", border: "rgba(250,247,242,.22)", radius: 14 });
  const form = dark.slice(dark.indexOf('data-pf="form"'));

  check(form.includes("rgba(250,247,242,.22)"), "the field takes the page's border");
  check(!form.includes("rgba(0,0,0,.16)"), "and not the black hairline that is not there on a dark band");
  check(form.includes("border-radius:14px"), "the field takes the page's radius");

  const submit = form.slice(form.indexOf('data-pf="form-submit"'));
  check(submit.includes("background:#B4552C"), "the button takes the accent");
  /* `background: currentColor` with a white label blended by `mix-blend-mode:
     difference` renders whatever colour happened to be inherited — which on a
     dark band was the ground itself. The export never did this. */
  check(!submit.includes("currentColor"), "not whatever colour it inherited");
  check(!submit.includes("mix-blend-mode"), "and not by blending against it");
  check(submit.includes("color:#FFFFFF"), "with white on it, as the export writes");

  console.log("\nand with no palette — every page before one arrived");

  const bare = draw(null);
  const bareForm = bare.slice(bare.indexOf('data-pf="form"'));
  check(bareForm.includes("rgba(0,0,0,.16)"), "the field falls back to the black hairline");
  check(
    bareForm.slice(bareForm.indexOf('data-pf="form-submit"')).includes("background:#111114"),
    "and the button to near-black — correct on the white page it came from",
  );

  console.log();
  console.log(failures === 0 ? "PASS" : `FAIL — ${failures} problem${failures === 1 ? "" : "s"}`);
  if (failures) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

export {};
