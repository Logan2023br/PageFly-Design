/* ==========================================================================
   Render a .pagefly to a standalone HTML page, the way PageFly publishes it.

       npx tsx scripts/preview-pagefly.ts <file.pagefly> <out.html>

   WHY. Until now the only way to see what an export actually looks like was to
   import it into a real editor and look. That is a minute per attempt, it needs
   a store, and it cannot be put in a test — so every export bug was found by
   reading JSON. The `Tabs3` fault took a reference file and a field-by-field
   diff to find, and it would have been visible in a picture.

   WHAT IT EMULATES, from `docs/pagefly-file-format.md` and the published-page
   pairing that produced it:

     · `pf-N_` numbering, assigned depth-first from the root in tree order —
       the hook every per-element rule hangs off
     · `styles[]` compiled into media queries, `&` rewritten to the element's
       own class, breakpoints to the pixel ranges PageFly publishes at
     · `customCSS` and `customJS` injected the way a published page carries them
     · the `#__pf` wrapper, which is what page CSS is scoped to

   WHAT IT DOES NOT. Widgets that PageFly renders with its own runtime —
   sliders, product lists bound to a live store, popups — draw as static boxes.
   Layout and skin are faithful; behaviour is not.
   ========================================================================== */

import { readFileSync, writeFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";

type Item = {
  id: string;
  type: string;
  data?: Record<string, unknown>;
  children: string[];
};
type Style = { id?: string; styles: string };

/** The ranges a published page uses. Below the pixel, because PageFly's own
    compiled sheet does — see `references/export-format.md`. */
const MEDIA: Record<string, string | null> = {
  all: null,
  laptop: "(min-width:1024.5px) and (max-width:1199.4999px)",
  tablet: "(min-width:767.5px) and (max-width:1024.4999px)",
  mobile: "(max-width:767.4999px)",
};

/** Text lives in different fields on different elements. */
function textOf(item: Item): string {
  const d = item.data ?? {};
  for (const key of ["value", "text", "label", "code"]) {
    const v = d[key];
    if (typeof v === "string" && v !== "") return v;
  }
  return "";
}

/** The tag a type renders as. Only the ones that are not a div matter. */
const TAG: Record<string, string> = {
  Heading2: "h2",
  Paragraph4: "p",
  Button2: "a",
  Image5: "img",
  FlexSection: "section",
  Body: "div",
  Layout: "div",
};

export function previewHtml(bytes: Uint8Array): string {
  const files = unzipSync(bytes);
  const entry = Object.keys(files)[0];
  const doc = JSON.parse(strFromU8(files[entry])) as {
    items: Item[];
    styles: Style[];
    customCSS?: string;
    customJS?: string;
  };

  const byId = new Map(doc.items.map((i) => [i.id, i]));
  const referenced = new Set(doc.items.flatMap((i) => i.children));
  const root = doc.items.find((i) => !referenced.has(i.id));
  if (!root) throw new Error("no root — every item is somebody's child");

  /* Depth-first from the root, which is the order the server numbers in. */
  const num = new Map<string, number>();
  let n = 1;
  const number = (id: string): void => {
    const item = byId.get(id);
    if (!item || num.has(id)) return;
    num.set(id, n++);
    for (const c of item.children) number(c);
  };
  number(root.id);

  /* ---- styles[] → a stylesheet ---------------------------------------- */
  const buckets: Record<string, string[]> = { all: [], laptop: [], tablet: [], mobile: [] };
  let orphans = 0;
  for (const st of doc.styles) {
    if (!st.id) continue;
    const k = num.get(st.id);
    if (k === undefined) {
      orphans++;
      continue;
    }
    let parsed: Record<string, Record<string, string>>;
    try {
      parsed = JSON.parse(st.styles) as Record<string, Record<string, string>>;
    } catch {
      continue;
    }
    for (const [bp, selectors] of Object.entries(parsed)) {
      if (!buckets[bp]) buckets[bp] = [];
      for (const [selector, css] of Object.entries(selectors)) {
        /* `&` is the element itself. Everything else hangs off it. */
        const sel = selector.replace(/&/g, `.__pf .pf-${k}_`);
        buckets[bp].push(`${sel}{${css}}`);
      }
    }
  }

  const sheet = Object.entries(buckets)
    .filter(([, rules]) => rules.length > 0)
    .map(([bp, rules]) =>
      MEDIA[bp] ? `@media ${MEDIA[bp]}{\n${rules.join("\n")}\n}` : rules.join("\n"),
    )
    .join("\n");

  /* Accordion3 `preopen` = the index of the item that starts open. */
  const openWrappers = new Set<string>();
  for (const it of doc.items) {
    const po = it.data?.preopen;
    if (it.type === "Accordion3" && typeof po === "number" && it.children[po]) openWrappers.add(it.children[po]);
  }
  /* options.hideOn* become display:none in that range when published. */
  const HIDE: Record<string, string> = {
    hideOnDesktop: "(min-width:1199.5px)",
    hideOnLaptop: MEDIA.laptop as string,
    hideOnTablet: MEDIA.tablet as string,
    hideOnMobile: MEDIA.mobile as string,
  };
  const hiddenRules: string[] = [];
  for (const it of doc.items as (Item & { options?: Record<string, unknown> })[]) {
    const k = num.get(it.id);
    if (k === undefined || !it.options) continue;
    for (const [flag, mq] of Object.entries(HIDE))
      if (it.options[flag]) hiddenRules.push(`@media ${mq}{.__pf .pf-${k}_{display:none !important}}`);
  }

  /* ---- items[] → markup ------------------------------------------------ */
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

  const render = (id: string): string => {
    const item = byId.get(id);
    if (!item) return "";
    const k = num.get(id);
    const d = item.data ?? {};
    /* Attributes > Class (`data.className`) is published on the element next to
       the Global Styles presets, and Attributes > ID as its id — live pages carry
       both, so customCSS written against them must match here too. */
    const cls = [
      `pf-${k}_`,
      typeof d.classGlobalStyling === "string" ? d.classGlobalStyling : "",
      typeof d.className === "string" ? d.className : "",
    ]
      .filter(Boolean)
      .join(" ");
    const tag = TAG[item.type] ?? "div";
    const idAttr = typeof d.id === "string" && d.id ? ` id="${esc(d.id)}"` : "";
    const attrs = `data-pf-type="${item.type}" class="${cls}"${idAttr}`;

    if (item.type === "Custom.HTML") {
      /* Raw by design — this is the one element whose content IS markup. */
      return `<div ${attrs}>${typeof d.code === "string" ? d.code : ""}</div>`;
    }
    if (tag === "img") {
      const src = typeof d.src === "string" ? d.src : "";
      /* No src is a placeholder in PageFly too; a grey box says so here. */
      return src
        ? `<img ${attrs} src="${esc(src)}" alt="">`
        : `<div ${attrs} style="background:#e6e3dc;min-height:80px"></div>`;
    }

    if (item.type === "Accordion3.Content.Wrapper") {
      /* <details>/<summary>, closed unless preopened — as PageFly publishes it. */
      const [hdrId, contentId] = item.children;
      const hdr = byId.get(hdrId);
      const content = byId.get(contentId);
      const hk = num.get(hdrId);
      const hc = typeof hdr?.data?.className === "string" ? ` ${hdr.data.className}` : "";
      const label = typeof hdr?.data?.label === "string" ? hdr.data.label : "";
      const ck = num.get(contentId);
      const inner = (content?.children ?? []).map(render).join("");
      const open = openWrappers.has(id) ? " open" : "";
      return `<details ${attrs}${open}><summary><div data-pf-type="Accordion3.Header" class="pf-${hk}_ pf-anchor pf-header-item-wrapper${hc}"><span class="pf-accordion-icon"></span><span>${label}</span></div></summary><div data-pf-type="Accordion3.Content" class="pf-${ck}_ pf-accordion-body"><div class="pf-accordion-display-content">${inner}</div></div></details>`;
    }
    if (item.type === "Paragraph4") return `<p ${attrs}><span>${textOf(item)}</span></p>`;

    const text = textOf(item);
    const kids = item.children.map(render).join("");
    /* BOTH, NOT EITHER. A `Button2` carries its label in `data.value` AND an
       `Icon2` child — the editor's own export gives every button one, shown or
       not. Rendering children INSTEAD of the value made every call to action on
       the page an empty pill, and the fault was here rather than in the file.

       PageFly allows inline markup inside a text value, so it is not escaped —
       the same decision `builder.ts` makes when it writes the value. */
    const inner = `${text}${kids}`;

    if (item.type === "FlexSection")
      return `<section ${attrs}><div class="pf-flex-section">${inner}</div></section>`;

    return `<${tag} ${attrs}>${inner}</${tag}>`;
  };

  const body = render(root.id);
  const hidden = hiddenRules.join("\n");

  return [
    `<!doctype html>`,
    `<html lang="en"><head><meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<title>${esc(entry)}</title>`,
    /* PageFly's own baseline: the wrapper is a plain block and every element is
       border-box. Anything beyond that must come from the file itself, or this
       preview would be flattering. */
    `<style>`,
    `*{box-sizing:border-box}body{margin:0}`,
    /* A PASS-THROUGH, not a layout. This wrapper had `display:flex;
       flex-direction:column`, guessed from what FlexSection usually does — and a
       guess in the measuring instrument is indistinguishable from a fault in
       the thing measured. `display:contents` takes it out of the layout
       entirely, so what is compared is the file rather than this file. */
    `.pf-flex-section{display:contents}`,
    `.__pf details>.pf-accordion-body{display:none}.__pf details[open]>.pf-accordion-body{display:block}.__pf summary{list-style:none}.__pf summary::-webkit-details-marker{display:none}`,
    sheet,
    hidden,
    `</style>`,
    doc.customCSS ? `<style>${doc.customCSS}</style>` : "",
    `</head><body>`,
    `<div id="__pf" class="__pf" data-pf-editor-version="gen-2">${body}</div>`,
    doc.customJS ? `<script>${doc.customJS}</script>` : "",
    `</body></html>`,
    orphans ? `<!-- ${orphans} style rows had no matching item -->` : "",
  ].join("\n");
}

function main(): void {
  const [src, out] = process.argv.slice(2);
  if (!src || !out) {
    console.error("usage: npx tsx scripts/preview-pagefly.ts <file.pagefly> <out.html>");
    process.exit(1);
  }
  const html = previewHtml(new Uint8Array(readFileSync(src)));
  writeFileSync(out, html);
  console.log(`${out}  ${html.length.toLocaleString()} chars`);
}

if (process.argv[1]?.endsWith("preview-pagefly.ts")) main();
