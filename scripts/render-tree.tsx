/* Render một DesignTree đã build thành HTML tĩnh bằng chính renderer của app.
   DEMO_IN=… DEMO_OUT=… npx tsx scripts/render-tree.tsx */
import { createRequire } from "node:module";
import Module from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
const require_ = createRequire(import.meta.url);
const r_ = (Module as unknown as { _resolveFilename: (r: string, ...a: unknown[]) => string })._resolveFilename;
(Module as unknown as { _resolveFilename: unknown })._resolveFilename = function (this: unknown, req: string, ...a: unknown[]) {
  if (req === "server-only") return require_.resolve("./server-only.cjs");
  return r_.call(this, req, ...a);
} as never;
async function main() {
  const React = (await import("react")).default;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { DesignRender } = await import("../lib/design/render");
  const { WEBFONT_CSS_URL } = await import("../lib/styleTokens");
  const data = JSON.parse(readFileSync(process.env.DEMO_IN!, "utf8"));
  const o = data.outcome;
  if (!o?.used) throw new Error(`build không dùng được: ${o?.reason}`);
  const t = data.tokens;
  const body = renderToStaticMarkup(
    React.createElement(DesignRender, {
      tree: o.tree,
      /* "all" là desktop — `Device` chỉ có all|laptop|tablet|mobile. */
      device: "all",
      images: o.images ?? {},
      videos: o.videos ?? {},
      palette: { accent: t.accent, border: t.border, radius: t.radius },
    } as never),
  );
  const html = `<title>${process.env.DEMO_TITLE ?? "Trang đã dựng"}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${WEBFONT_CSS_URL}">
<style>
  html,body{margin:0;padding:0;background:${t.bg};color:${t.ink}}
  *{box-sizing:border-box}
  img{max-width:100%}
  /* Bản tĩnh không có IntersectionObserver của app, nên mọi thứ hiện sẵn —
     đúng trạng thái nghỉ mà exporter cũng dựa vào. */
  .pfd-reveal{opacity:1 !important;transform:none !important}
</style>
${body}`;
  writeFileSync(process.env.DEMO_OUT!, html);
  console.log("bytes:", html.length, "→", process.env.DEMO_OUT);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
