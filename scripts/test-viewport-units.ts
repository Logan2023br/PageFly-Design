/* ==========================================================================
   `100vh` IN A FRAME THAT IS AS TALL AS THE WHOLE PAGE.

       npx tsx scripts/test-viewport-units.ts

   A mockup came into the Library dark and empty. The document was fine — the
   same file opened in a browser rendered perfectly — and the cause was the
   frame it was put in.

   `HtmlMockup` measures the document and sets the iframe to its full height so
   everything outside can scroll it as one tall picture. That frame IS the
   viewport for what it contains. A page whose hero says `min-height:100vh`
   therefore gets a hero 9,801 pixels tall, and because that hero aligns its
   content to the bottom, every word of it sits 8,900 pixels below the window.
   What is left on screen is the hero's background: dark, and empty.

   It is also a loop — a taller frame makes a taller hero makes a taller
   document makes a taller frame.

   So the units are pinned to the DEVICE the mockup was drawn for, which is
   what `100vh` means when a designer writes it: one screen. The two ways to
   get that wrong:

     NOT REWRITING ENOUGH — `svh`, `dvh` and `lvh` are the same unit with
     different keyboards, and this very page uses `100svh` on mobile.

     REWRITING TOO MUCH — the substring `vh` appears in prose and in class
     names, and a rewrite that reaches into the page's text changes what the
     page SAYS. Only `<style>` blocks and `style` attributes are touched.
   ========================================================================== */

import { deviceHeightFor, pinViewportUnits } from "../components/mockup/viewportUnits";

let bad = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) bad++;
};
const head = (t: string) => console.log(`\n— ${t}`);

head("the device a width belongs to");
ok("1440 is 900 tall", deviceHeightFor(1440) === 900, String(deviceHeightFor(1440)));
ok("1280 is 800", deviceHeightFor(1280) === 800);
ok("834 is 1112", deviceHeightFor(834) === 1112);
ok("390 is 844", deviceHeightFor(390) === 844);
ok("an unknown width falls back to the desktop", deviceHeightFor(1600) === 900, String(deviceHeightFor(1600)));

const style = (css: string) => `<style>${css}</style>`;
const cssOf = (html: string) => /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? "";

head("THE UNIT THAT BROKE THE PAGE");
ok(
  "100vh becomes the device height",
  cssOf(pinViewportUnits(style(".hero{min-height:100vh}"), 1440)) === ".hero{min-height:900px}",
  cssOf(pinViewportUnits(style(".hero{min-height:100vh}"), 1440)),
);
ok(
  "88vh is 88% of it",
  cssOf(pinViewportUnits(style(".final{min-height:88vh}"), 1440)) === ".final{min-height:792px}",
  cssOf(pinViewportUnits(style(".final{min-height:88vh}"), 1440)),
);
ok(
  "a decimal survives",
  cssOf(pinViewportUnits(style("p{top:50.5vh}"), 1440)) === "p{top:454.5px}",
  cssOf(pinViewportUnits(style("p{top:50.5vh}"), 1440)),
);

head("AND ITS THREE OTHER SPELLINGS");
for (const u of ["svh", "dvh", "lvh"] as const)
  ok(
    `100${u}`,
    cssOf(pinViewportUnits(style(`.h{min-height:100${u}}`), 1440)) === ".h{min-height:900px}",
    `this page uses 100svh on mobile — ${cssOf(pinViewportUnits(style(`.h{min-height:100${u}}`), 1440))}`,
  );

head("vmin and vmax need both sides");
ok(
  "vmin on desktop is the height",
  cssOf(pinViewportUnits(style(".a{width:10vmin}"), 1440)) === ".a{width:90px}",
  cssOf(pinViewportUnits(style(".a{width:10vmin}"), 1440)),
);
ok(
  "vmax on desktop is the width",
  cssOf(pinViewportUnits(style(".a{width:10vmax}"), 1440)) === ".a{width:144px}",
  cssOf(pinViewportUnits(style(".a{width:10vmax}"), 1440)),
);

head("vw IS ALREADY RIGHT AND IS LEFT ALONE");
ok(
  "the frame is the device width, so vw already resolves",
  cssOf(pinViewportUnits(style("h1{font-size:7.4vw}"), 1440)) === "h1{font-size:7.4vw}",
  cssOf(pinViewportUnits(style("h1{font-size:7.4vw}"), 1440)),
);

head("a style attribute counts too");
const attr = pinViewportUnits(`<div style="height:100vh">x</div>`, 1440);
ok("rewritten", attr === `<div style="height:900px">x</div>`, attr);

head("BUT THE PAGE'S OWN WORDS ARE NOT TOUCHED");
for (const [name, html] of [
  ["prose", "<p>Our 100vh hero is the tallest in Vietnam</p>"],
  ["a class name", '<div class="vh-block h-100vh">x</div>'],
  ["a heading", "<h1>100vh</h1>"],
] as const)
  ok(
    name,
    pinViewportUnits(html, 1440) === html,
    `${pinViewportUnits(html, 1440)} — a rewrite that reaches the text changes what the page says`,
  );

head("and the real document still parses as one");
const doc = `<!DOCTYPE html><html><head><style>.hero{min-height:100vh}
@media (max-width:767px){.hero{min-height:100svh}}</style></head>
<body><section class="hero">100vh of sauna</section></body></html>`;
const out = pinViewportUnits(doc, 390);
ok("both rules pinned to the phone", out.includes("min-height:844px") && !out.includes("vh}"), cssOf(out).replace(/\n/g, " "));
ok("and the sentence is intact", out.includes("100vh of sauna"));

console.log(bad === 0 ? "\nall good" : `\n${bad} failed`);
process.exit(bad === 0 ? 0 : 1);
