/* ==========================================================================
   Claude Build — an admin's export split into one .pagefly per page.

       npx tsx scripts/test-claude-build-export.ts
   ========================================================================== */

import { strToU8, unzipSync, zipSync } from "fflate";
import { matchEntry, splitExport } from "../lib/claudeBuildExport";
import type { LoganPage } from "../lib/claudeBuildShared";

let failures = 0;
function check(ok: boolean, label: string, detail: unknown = null): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${!ok && detail !== null ? ` — ${JSON.stringify(detail)}` : ""}`);
  if (!ok) failures++;
}

const page = (slug: string, label: string): LoganPage => ({ slug, label, title: `Solvane - ${label}`, pageId: null, editorUrl: null, previewUrl: null });
const PAGES = [
  page("home", "Home"),
  page("product-page", "Product"),
  page("collection-page", "Collection"),
  page("about-us", "About"),
  page("contact", "Contact"),
  page("blog-article", "Blog Article"),
  page("sale", "Sale"),
];
const json = (n: string) => strToU8(JSON.stringify({ items: [{ id: n, type: "Body", children: [] }], styles: [], customCSS: "", customJS: "" }));

console.log("matching an entry to its page");
check(matchEntry("1 - Solvane - Home.json", PAGES)?.slug === "home", "an All Pages entry, by its full title");
check(matchEntry("Solvane - Product.json", PAGES)?.slug === "product-page", "a single export, by its title");
check(matchEntry("6 - Solvane – Blog Article.json", PAGES)?.slug === "blog-article", "an en dash and a two-word label");
check(matchEntry("2 - SOLVANE - product.json", PAGES)?.slug === "product-page", "case does not matter");
check(matchEntry("3 - Something else - Collection.json", PAGES)?.slug === "collection-page", "a renamed set still ends in its label");
check(matchEntry("4 - Solvane - Article.json", PAGES) === null, "a label must be whole: Article is not Blog Article");
check(matchEntry("9 - Solvane - FAQ.json", PAGES) === null, "a page the routine did not build matches nothing");
const prod = [page("product", "Product"), page("product-page-2", "Product Page")];
check(matchEntry("1 - X - Product Page.json", prod)?.slug === "product-page-2", "the longest label wins");

console.log("an All Pages export");
const all = zipSync(Object.fromEntries(PAGES.map((p, i) => [`${i + 1} - Solvane - ${p.label}.json`, json(p.slug)])));
const out = splitExport(all, PAGES);
check(out.pages.length === 7 && out.unmatched.length === 0, "seven pages, nothing left over", out.unmatched);
const home = out.pages.find((p) => p.slug === "home")!;
const inner = unzipSync(home.bytes);
check(Object.keys(inner).length === 1 && Object.keys(inner)[0] === "1 - Solvane - Home.json", "each page is its own zip, the entry name kept", Object.keys(inner));
check(JSON.parse(new TextDecoder().decode(inner["1 - Solvane - Home.json"])).items[0].id === "home", "with that page's JSON");

console.log("one page, plus things that are not pages");
const one = zipSync({ "Solvane - Sale.json": json("sale"), "assets/": new Uint8Array(), "assets/a.png": new Uint8Array([1, 2]), "7 - Other - Landing.json": json("x") });
const o2 = splitExport(one, PAGES);
check(o2.pages.length === 1 && o2.pages[0].slug === "sale", "the one page", o2.pages.map((p) => p.slug));
check(o2.unmatched.length === 1 && o2.unmatched[0] === "7 - Other - Landing.json", "a JSON of no page is reported, assets are skipped", o2.unmatched);

console.log("not a zip");
let threw = false;
try {
  splitExport(strToU8("{}"), PAGES);
} catch {
  threw = true;
}
check(threw, "throws");

console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
