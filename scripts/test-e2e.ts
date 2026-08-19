/* One real page through the whole v2 path: resolver → prompt → model → audit →
   repair. Costs one or two page-builds.

       npx tsx scripts/test-e2e.ts [vertical] [pageType]
*/
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import Module from "node:module";

const require_ = createRequire(import.meta.url);
const resolve_ = (Module as unknown as { _resolveFilename: (r: string, ...a: unknown[]) => string })._resolveFilename;
(Module as unknown as { _resolveFilename: unknown })._resolveFilename = function (this: unknown, request: string, ...args: unknown[]) {
  if (request === "server-only") return require_.resolve("./server-only.cjs");
  return resolve_.call(this, request, ...args);
};

for (const f of [".env.local", ".env.production.local"]) {
  try {
    for (const line of readFileSync(f, "utf8").split("\n")) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {}
}
process.env.AI_PROVIDER = "deepseek";

const VERTICAL = process.argv[2] ?? "skincare";
const PAGE = process.argv[3] ?? "home";

async function main() {
  const { planPage, seedFor } = await import("../lib/design/plan");
  const { audit } = await import("../lib/design/audit");
  const { designPageTree } = await import("../lib/ai/designServer");

  const brief = { whatYouSell: "Skincare", verticalSlug: VERTICAL, visualStyle: "minimal" };
  const order = planPage(brief as never, PAGE, seedFor("aurelia-skin.myshopify.com", PAGE, "minimal"));

  console.log(`ORDER · ${order.vertical} · archetype ${order.archetype}`);
  order.sections.forEach((s, i) =>
    console.log(`  ${i + 1} ${s.role.padEnd(11)} ${(s.pattern || "—").padEnd(26)} ${s.dark ? "dark " : "light"} ${s.padding.padEnd(10)}${s.signature ? " SIGNATURE" : ""}${s.motion ? " " + s.motion : ""}`),
  );

  const t0 = Date.now();
  const r = await designPageTree({
    sell: "clinical skincare for sensitive skin", storeType: "single-product", prompt: "",
    style: "minimal", styleLabel: "Minimal & clean", styleBlurb: "Restrained type",
    density: "airy", reference: null, refSections: null, deckSize: 1,
    storeDomain: "aurelia-skin.myshopify.com", verticalSlug: VERTICAL,
    pageLabel: PAGE, pageType: PAGE,
    tokens: { bg: "#FFFFFF", ink: "#14161A", accent: "#3F6B5B", band: "#F4F1EC", border: "", fontHeading: "Inter", fontBody: "Inter", radius: 6 },
  } as never);

  console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)}s`);
  if (!r.used) { console.log("FAIL:", r.reason); return; }

  console.log(`in ${r.usage.input} · out ${r.usage.output} · TỔNG ${r.usage.input + r.usage.output}`);
  console.log(`audit lần đầu: ${(r as { auditFailures: number }).auditFailures} lỗi`);
  console.log(`sections: ${r.tree.sections.length}/${order.sections.length}`);

  const after = audit(r.tree, order);
  console.log(`audit sau repair: ${after.length} lỗi`);
  after.forEach((p) => console.log(`   • ${p.slice(0, 110)}`));

  console.log("\npattern model trả về so với order:");
  order.sections.forEach((want, i) => {
    const got = (r.tree.sections[i] as { pattern?: string } | undefined)?.pattern;
    console.log(`  ${i + 1} ${(want.pattern || "—").padEnd(26)} → ${got === want.pattern ? "✓" : `✗ ${got ?? "thiếu"}`}`);
  });
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
