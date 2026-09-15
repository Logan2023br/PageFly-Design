import { unzipSync, zipSync, strFromU8 } from "fflate";

/* ==========================================================================
   Reading a .pagefly back, and drawing it.

   THE DIRECTION NOBODY HAD NEEDED BEFORE. `lib/design/toPagefly.ts` goes one
   way — a design tree becomes a .pagefly — and it is deliberately lossy on the
   way: CSS is flattened to strings, images are resolved to URLs, nodes become
   PageFly element types. So turning a .pagefly back into a design tree is not
   a missing function, it is a different and worse idea.

   Drawing the file DIRECTLY is neither. A .pagefly already carries everything
   a browser needs:

     items       the element tree, each with `children`
     styles      real CSS, per element, keyed by the element's id
     data.value  the real copy, HTML and all
     customCSS   the look — scoped to `#__pf` by PageFly itself
     data.src    images, as data: URIs, so nothing is fetched

   `customCSS` being pre-scoped is what makes this tractable rather than a
   rewrite: render the tree inside an element with that id and PageFly's own
   stylesheet applies verbatim, selector for selector.

   WHAT THIS IS NOT is a PageFly-compatible renderer. It has no store behind
   it, so ProductBox and its relatives draw their boxes and no products; and
   PageFly ships base CSS that is not in the file, so spacing can differ. It is
   a recognisable picture of the page, which is what a gallery card needs, and
   this comment is here so nobody later mistakes it for the real thing.
   ========================================================================== */

export type PageflyItem = {
  id: string;
  type: string;
  children: string[];
  data?: Record<string, unknown>;
};

export type PageflyPage = {
  /** the entry's name, cleaned of the export's numbering */
  label: string;
  items: PageflyItem[];
  /** element id → the styleData object, already parsed */
  styles: Record<string, Record<string, Record<string, string>>>;
  customCSS: string;
};

/**
 * Entry names look like `3 - 1 _ GLOWRY About Us _ 2026_09_.json`.
 *
 * The leading `N - ` is the export's ordering, the `1 _ ` is PageFly's own
 * page numbering, and the trailing date is when it was exported. None of that
 * belongs on a card, and the underscores are a filename's version of
 * characters a title cannot carry.
 */
export function labelFromEntry(entry: string): string {
  return entry
    .replace(/\.json$/i, "")
    .replace(/^\s*\d+\s*-\s*/, "")
    .replace(/^\s*\d+\s*_\s*/, "")
    /* The trailing export date, which PageFly TRUNCATES to whatever fits its
       filename length — the seven entries here end `_ 2026`, `_ 2026_09_`,
       `_ 2026_09_10 1` and `_ 2`. So the year is matched at one to four digits
       rather than four, and everything after it goes.

       `\W` was the first attempt and it does not match an underscore — `\w`
       includes one — so `GLOWRY Home _ 2026_09_10 1` kept everything from the
       first underscore onward and the card read `GLOWRY Home 2026 09 10 1`. */
    .replace(/[_\s]+\d{1,4}([_\s].*)?$/, "")
    .replace(/_+/g, " ")
    .trim();
}

/**
 * ONE page, from a .pagefly holding exactly that.
 *
 * PageFly exports either shape: several pages selected together arrive as one
 * file with numbered entries, and a page exported on its own arrives as a file
 * with one. Both are read here — the first by `readPageflySet` below, which is
 * this function over every entry.
 */
export function readPageflyPage(bytes: Uint8Array): PageflyPage {
  const files = unzipSync(bytes);
  const entry = Object.keys(files)[0];
  if (!entry) throw new Error("that .pagefly holds nothing");
  return readEntry(entry, strFromU8(files[entry]));
}

function readEntry(entry: string, text: string): PageflyPage {
  const page = JSON.parse(text) as {
    items?: PageflyItem[];
    styles?: { id: string; styles: string }[];
    customCSS?: string;
  };

  const styles: PageflyPage["styles"] = {};
  for (const row of page.styles ?? []) {
    try {
      styles[row.id] = JSON.parse(row.styles);
    } catch {
      /* One unparseable style entry is one element drawn plainly, not a page
         that fails to draw. */
    }
  }

  return {
    label: labelFromEntry(entry),
    items: page.items ?? [],
    styles,
    customCSS: page.customCSS ?? "",
  };
}

/** Every page in one exported set, in the order the export put them. */
export function readPageflySet(bytes: Uint8Array): PageflyPage[] {
  const files = unzipSync(bytes);

  return Object.keys(files)
    /* The export numbers its entries and a zip's key order is not guaranteed,
       so the order is taken from the name rather than trusted. */
    .sort((a, b) => (Number(a.match(/^\d+/)?.[0] ?? 0) - Number(b.match(/^\d+/)?.[0] ?? 0)))
    .map((entry) => readEntry(entry, strFromU8(files[entry])));
}

/**
 * Seven single-page files as one multi-page .pagefly.
 *
 * PageFly's own multi-page export is a zip whose entries are numbered —
 * `1 - GLOWRY Black Friday.json`, `2 - …` — and a set exported page by page is
 * seven zips of one entry each. This puts them back into the first shape so
 * "Export all" hands over ONE file the merchant imports once, rather than seven
 * downloads and seven imports.
 *
 * NOT AN INVENTED FORMAT. It is the shape the first GLOWRY export arrived in,
 * read off a real file rather than guessed at, and the JSON inside each entry
 * is passed through untouched — only the entry's number changes.
 */
export function combinePagefly(files: Uint8Array[]): Uint8Array {
  const out: Record<string, Uint8Array> = {};

  files.forEach((bytes, i) => {
    const entries = unzipSync(bytes);
    for (const name of Object.keys(entries)) {
      /* The name without whatever index it already carried, renumbered for its
         place in this set. */
      const bare = name.replace(/\.json$/i, "").replace(/^\s*\d+\s*-\s*/, "");
      out[`${i + 1} - ${bare}.json`] = entries[name];
    }
  });

  return zipSync(out, { level: 6 });
}

/* ---- drawing -------------------------------------------------------------

   Text is written into the document, and some of it is HTML the merchant
   typed — `Glass skin, <em>American</em> schedule.` So it is escaped except
   for a small set of inline tags, and attribute values are escaped always.
   The files are ours, put in `public/` by us; this is the belt for the day one
   of them is not.
   ------------------------------------------------------------------------ */

const INLINE_TAGS = new Set(["b", "strong", "i", "em", "u", "s", "br", "span", "sup", "sub", "mark", "small"]);

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(value: string): string {
  return escapeText(value).replace(/"/g, "&quot;");
}

/**
 * Keep the inline formatting a heading was written with, drop everything else.
 *
 * Rebuilt from escaped text rather than filtered in place: a blocklist of tags
 * is a list somebody has to keep up to date, and the thing it is protecting is
 * a document this app writes into an iframe. An allowlist that only ever
 * re-opens twelve inline tags cannot be walked around.
 */
function richText(value: string): string {
  const escaped = escapeText(value);
  return escaped.replace(
    /&lt;(\/?)([a-zA-Z][a-zA-Z0-9]*)\s*(\/?)&gt;/g,
    (whole, close: string, tag: string, selfClose: string) =>
      INLINE_TAGS.has(tag.toLowerCase()) ? `<${close}${tag}${selfClose}>` : whole,
  );
}

/** Elements whose `data.value` is the copy, per MD Json PageFly/fields.md. */
const TEXT_ELEMENTS = new Set([
  "Heading2",
  "Paragraph4",
  "Button2",
  "ProductTitle",
  "ProductVendor",
  "ProductBadge",
  "ListItemText",
  "Table2.Cell",
]);

const IMAGE_ELEMENTS = new Set(["Image5", "ImageItem", "MediaItem2"]);

/**
 * One item's own CSS, as rules rather than as a style attribute.
 *
 * The styleData keys are selectors with `&` standing for the element — `"&"`,
 * `"& img"`, `"&:hover"` — which a `style=` attribute cannot express. So each
 * element is given a generated class and its selectors are expanded against
 * it, which is also what makes the breakpoint keys work: `laptop`, `tablet`
 * and `mobile` become media queries instead of being dropped.
 */
const WIDTHS: Record<string, number> = { laptop: 1200, tablet: 820, mobile: 480 };

function rulesFor(id: string, style: Record<string, Record<string, string>>): string {
  const cls = `.pf-${cssId(id)}`;
  const out: string[] = [];

  for (const [device, selectors] of Object.entries(style ?? {})) {
    const body = Object.entries(selectors ?? {})
      .map(([selector, css]) => `${selector.replace(/&/g, cls)}{${css}}`)
      .join("");
    if (!body) continue;

    if (device === "all") out.push(body);
    else if (WIDTHS[device]) out.push(`@media (max-width:${WIDTHS[device]}px){${body}}`);
  }

  return out.join("");
}

/** Ids are uuids, which are valid in a class name; anything else is made so. */
function cssId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/**
 * The page as a standalone HTML document, for an iframe's `srcdoc`.
 *
 * AN IFRAME AND NOT A DIV, and not for tidiness. `customCSS` styles bare
 * selectors — `#__pf h1`, `#__pf p` — and this app has its own stylesheet on
 * the same page; rendered inline, each would reach into the other. An iframe
 * is the only boundary in a browser that both stylesheets respect.
 */
export function pageToHtml(page: PageflyPage): string {
  const byId = new Map(page.items.map((i) => [i.id, i]));
  const kids = new Set(page.items.flatMap((i) => i.children ?? []));
  const root = page.items.find((i) => !kids.has(i.id));

  const rules: string[] = [];

  const draw = (item: PageflyItem | undefined, depth: number): string => {
    /* A malformed file is a card that draws less, never a stack overflow.
       PageFly nests deeply — twenty is comfortably past anything real. */
    if (!item || depth > 40) return "";

    const style = page.styles[item.id];
    if (style) rules.push(rulesFor(item.id, style));

    const classes = [`pf-${cssId(item.id)}`];
    const global = item.data?.classGlobalStyling;
    /* Where the look actually lives: these name rules in `customCSS`. Dropping
       them renders the page's skeleton with none of its design. */
    if (typeof global === "string" && global) classes.push(escapeAttr(global));

    const attrs = `class="${classes.join(" ")}"`;

    if (IMAGE_ELEMENTS.has(item.type)) {
      const src = item.data?.src;
      if (typeof src !== "string" || !src) return `<div ${attrs}></div>`;
      const alt = typeof item.data?.alt === "string" ? item.data.alt : "";
      return `<div ${attrs}><img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}" loading="lazy"></div>`;
    }

    const inner = (item.children ?? []).map((id) => draw(byId.get(id), depth + 1)).join("");

    if (TEXT_ELEMENTS.has(item.type)) {
      const value = item.data?.value;
      const text = typeof value === "string" ? richText(value) : "";
      /* The tag matters for `customCSS`, which styles `#__pf h1` and `#__pf p`
         directly — rendered as divs the headings would come out at body size
         and the whole page would read flat. */
      const tag =
        item.type === "Heading2"
          ? typeof item.data?.tag === "string" && /^h[1-6]$/.test(item.data.tag)
            ? item.data.tag
            : "h2"
          : item.type === "Paragraph4"
            ? "p"
            : "div";
      return `<${tag} ${attrs}>${text}${inner}</${tag}>`;
    }

    return `<div ${attrs}>${inner}</div>`;
  };

  const body = draw(root, 0);

  return [
    "<!doctype html><html><head><meta charset=\"utf-8\">",
    '<meta name="viewport" content="width=1280">',
    /* No margin, and nothing may scroll: the card scrolls this document by
       moving it, so a scrollbar inside would be a second one nobody asked
       for. */
    "<style>html,body{margin:0;padding:0;background:#fff;overflow:hidden}",
    "img{max-width:100%}",
    rules.join(""),
    "</style>",
    "<style>",
    page.customCSS,
    "</style></head><body>",
    /* The id `customCSS` is written against. Every rule in it starts `#__pf`,
       so without this wrapper the stylesheet applies to nothing at all. */
    `<div id="__pf">${body}</div>`,
    "</body></html>",
  ].join("");
}
