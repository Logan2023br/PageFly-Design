/* ==========================================================================
   EVERY LINE OF A MOCKUP'S JAVASCRIPT REACHES THE MODEL, AND LANDS IN THE FILE.

       npx tsx scripts/test-page-js.ts

   A page's behaviour is written once, in `<script>` tags, and it has to survive
   four steps to reach a merchant: collection, the rewrite call, three safety
   checks, and assembly into `customJS`. A byte lost at any of them is lost in
   silence — the file is valid, every element is there, and the page simply sits
   still.

   The chain had three leaks, and this file is the account of them:

     THE HEAD WAS NOT READ. Collection scoped itself to `<body>`, so a mockup
     that arms its own reveals one line before any markup lost that line before
     anything could weigh it.

     A BAND'S SCRIPT HAD NO OWNER. Script inside a section was left for the band
     call to carry as a `custom` node — capped at 1500 characters, and only if
     the model chose to. There is one owner now: the page call gets every
     script in the document, and bands are sent with theirs removed so nothing
     runs twice.

     A REWRITE THAT RAN OUT OF BUDGET SHIPPED AS HALF A SCRIPT, which is a
     syntax error, which takes the whole `customJS` file down with it — the
     reveal observer and every custom block's script included.

   And one check was refusing ordinary code: `classList.remove` ends in
   `.remove(`, so a hover that drops a class read as "hides part of the page"
   and cost the page its entire script.
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

let bad = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) bad++;
};
const head = (t: string) => console.log(`\n— ${t}`);

/* A document with script in all three places a mockup puts it. */
const HEAD_JS = "document.documentElement.classList.add('js-reveal');";
const BAND_JS = "var band = 1; console.log('band own');";
const PAGE_JS =
  "(function(){ var r = document.documentElement; r.classList.add('hr-motion'); })();";

const DOC = [
  "<!DOCTYPE html><html><head>",
  `<script>${HEAD_JS}</script>`,
  "<style>.a{color:red}</style>",
  "</head><body>",
  "<main>",
  `<section class="a"><h1>x</h1><script>${BAND_JS}</script></section>`,
  '<section class="b"><p>y</p></section>',
  "</main>",
  '<button class="to-top">up</button>',
  `<script>${PAGE_JS}</script>`,
  "</body></html>",
].join("\n");

async function main(): Promise<void> {
  const { pageScripts, splitSections, bandMarkup } = await import("../lib/pagefly/fromHtmlSkill");

  head("100% OF THE DOCUMENT'S SCRIPT REACHES THE MODEL");
  const got = pageScripts(DOC);
  const joined = got.join("\n");
  for (const [where, js] of [
    ["the head", HEAD_JS],
    ["inside a band", BAND_JS],
    ["after </main>", PAGE_JS],
  ] as const)
    ok(`${where} is carried`, joined.includes(js), js.slice(0, 40));

  const all = HEAD_JS.length + BAND_JS.length + PAGE_JS.length;
  const carried = got.reduce((n, s) => n + s.length, 0);
  ok(
    "and the byte count adds up",
    carried >= all,
    `${carried} of ${all} bytes — a chain that loses some loses them silently`,
  );

  head("AND NOTHING RUNS TWICE");
  /* The band call must not be handed a script the page call already owns: two
     copies of a listener is two listeners. */
  const bands = splitSections(DOC).map(bandMarkup);
  ok("bands still split", bands.length === 2, String(bands.length));
  ok(
    "a band goes to the model with no script in it",
    bands.every((b) => !/<script/i.test(b)),
    bands.find((b) => /<script/i.test(b))?.slice(0, 60) ?? "",
  );
  ok(
    "but keeps its markup",
    bands[0].includes("<h1>x</h1>"),
    "stripping the script must not cost the band its content",
  );

  head("an external script is not inlined");
  ok(
    "src is skipped",
    pageScripts('<body><script src="https://x/y.js"></script></body>').length === 0,
    "there is nothing to carry and nothing to rewrite",
  );

  head("THE CHECKS DO NOT REFUSE ORDINARY CODE");
  const { rejectReason } = await import("../lib/pagefly/pageScript");
  const hover =
    "row.addEventListener('mouseleave', function(){ row.classList.remove('is-hot'); });";
  ok("a hover that drops a class survives", rejectReason(hover) === null, rejectReason(hover) ?? "");
  ok(
    "a back-to-top survives",
    rejectReason("if (window.pageYOffset > 800) { t.classList.add('on'); } else { t.classList.remove('on'); }") === null,
  );
  ok("but el.remove() is still refused", rejectReason("el.remove();") !== null);
  ok("and removeChild", rejectReason("p.removeChild(c);") !== null);
  ok("and hiding", rejectReason("el.style.display = 'none';") !== null);
  ok("and reaching out", rejectReason("fetch('/x');") !== null);

  head("A CUT-OFF REWRITE IS REFUSED, NOT SHIPPED");
  process.env.AI_PROVIDER = "deepseek";
  process.env.DEEPSEEK_API_KEY = "test-key";
  const realFetch = globalThis.fetch;
  const reply = (finish: string, content: string) =>
    new Response(
      JSON.stringify({
        choices: [{ message: { content }, finish_reason: finish }],
        usage: { prompt_tokens: 100, completion_tokens: 16000 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );

  const { pageScriptFor } = await import("../lib/pagefly/pageScript");

  globalThis.fetch = (async () =>
    reply("length", "(function(){ var a = 1; document.querySelectorAll('.x').forEach(function(")) as typeof fetch;
  const cut = await pageScriptFor([PAGE_JS], { native: [], classes: [] });
  ok(
    "half a script ships nothing",
    cut.js === "" && /budget/.test(cut.reason ?? ""),
    cut.js ? `shipped ${cut.js.length} bytes of half a script` : (cut.reason ?? ""),
  );

  const WHOLE =
    "(function(){ document.querySelectorAll('.dir-row').forEach(function(r){ r.addEventListener('mouseleave', function(){ r.classList.remove('is-hot'); }); }); })();";
  globalThis.fetch = (async () => reply("stop", WHOLE)) as typeof fetch;
  const whole = await pageScriptFor([PAGE_JS], { native: [], classes: [] });
  ok("a complete answer ships", whole.js.length > 0, whole.reason ?? `${whole.js.length} bytes`);

  head("AND IT LANDS IN THE .PAGEFLY");
  const { pageflyFromTree } = await import("../lib/design/toPagefly");
  const tree = {
    tokens: { bg: "#fff", ink: "#111", fontHeading: "Inter", fontBody: "Inter" },
    sections: [
      {
        type: "section",
        pattern: "hero",
        role: "commerce",
        css: { padding: "48px" },
        /* WITH A REVEAL ON IT, so the file has JS of its own to be added to.
           Without one there is no observer to sit beside and the assertion
           below passes on an empty premise. */
        children: [{ type: "heading", level: 1, text: "x", anim: { reveal: "fade-up" } }],
      },
    ],
  } as never;
  const built = pageflyFromTree(
    tree,
    { name: "p", bg: "#fff", ink: "#111", fontBody: "Inter" },
    1440,
    { pageJs: whole.js },
  );
  const { unzipSync, strFromU8 } = await import("fflate");
  const files = unzipSync(new Uint8Array(await built.blob.arrayBuffer()));
  const doc = JSON.parse(strFromU8(files[Object.keys(files)[0]])) as { customJS: string };

  ok(
    "the rewritten script is in customJS",
    doc.customJS.includes("dir-row"),
    `${doc.customJS.length} bytes of customJS`,
  );
  ok(
    "and the reveal observer is still there beside it",
    doc.customJS.includes("pfd-revealed"),
    "the page script must be added to the file's JS, never replace it",
  );
  ok(
    "NOT ONE `<` IN THE WHOLE FILE'S JS",
    !doc.customJS.includes("<"),
    "PageFly refuses the entire customJS over a single one",
  );

  globalThis.fetch = realFetch;
  console.log(bad === 0 ? "\nall good" : `\n${bad} failed`);
  process.exit(bad === 0 ? 0 : 1);
}

void main().catch((e) => {
  console.error("threw:", e);
  process.exit(1);
});
