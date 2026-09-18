import { NextResponse } from "next/server";
import { pageflyFromHtmlSkill } from "@/lib/pagefly/fromHtmlSkill";
import { pageflyFromHtmlLive } from "@/lib/pagefly/htmlToTree";

/* ==========================================================================
   POST /api/pagefly/from-html

   The HTML → .pagefly conversion, run by the model against the
   `pagefly-builder` skill.

   ON THE SERVER, and it has to be: the conversion is model calls, and the key
   that pays for them is not something a browser may hold. The other converter
   (`fromHtml.ts`) runs in the browser because it needs a laid-out DOM and
   nothing else; this one needs the opposite.

   It answers with the file itself rather than JSON, so the caller downloads
   what it is handed instead of decoding a payload it would only re-encode.
   ========================================================================== */

export const dynamic = "force-dynamic";
/* One call per section, in parallel — but a ten-section page on a slow day is
   still minutes, and the default would cut it off mid-build. */
export const maxDuration = 300;

export async function POST(req: Request): Promise<Response> {
  let body: {
    html?: unknown;
    name?: unknown;
    bg?: unknown;
    ink?: unknown;
    fontBody?: unknown;
    accent?: unknown;
    border?: unknown;
    radius?: unknown;
    band?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "expected a JSON body" }, { status: 400 });
  }

  const html = typeof body.html === "string" ? body.html : "";
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "page";
  if (html.trim() === "")
    return NextResponse.json({ error: "no html to convert" }, { status: 400 });

  /* ==========================================================================
     WHICH CONVERTER, and both are kept.

       live   (default) the model writes the LIVE design-tree vocabulary — 24
              node types — and `toPagefly.ts` turns it into PageFly. Every line
              of the 4,400 the live path has learned about PageFly is reused.
       skill  the model writes PageFly JSON directly against the
              `pagefly-builder` reference. It reaches elements the tree has no
              word for, and it has to be repaired in four known places.

     `PAGEFLY_FROM_HTML=skill` picks the second. Neither is deleted: they answer
     different questions, and which one is better is a thing to measure rather
     than to decide once. */
  const mode = process.env.PAGEFLY_FROM_HTML === "skill" ? "skill" : "live";

  try {
    const built =
      mode === "skill"
        ? await pageflyFromHtmlSkill(html, name, req.signal)
        : await pageflyFromHtmlLive(
            html,
            name,
            {
              /* Read off the document by the caller; the page's own palette,
                 never PageFly Design's. */
              bg: typeof body.bg === "string" ? body.bg : "#FFFFFF",
              ink: typeof body.ink === "string" ? body.ink : "#111111",
              fontBody: typeof body.fontBody === "string" ? body.fontBody : "Inter",
              accent: typeof body.accent === "string" ? body.accent : undefined,
              border: typeof body.border === "string" ? body.border : undefined,
              radius: typeof body.radius === "number" ? body.radius : undefined,
              band: typeof body.band === "string" ? body.band : undefined,
            },
            req.signal,
          );
    const bytes = new Uint8Array(await built.blob.arrayBuffer());

    console.log(
      `[pagefly] ${name} · ${mode} · ${built.built}/${built.sections} sections · ` +
        `${bytes.length.toLocaleString()} bytes · in ${built.usage.input} out ${built.usage.output}` +
        (built.failures.length
          ? ` · ${built.failures.length} failed: ${built.failures[0].reason}`
          : ""),
    );

    return new Response(bytes, {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${built.filename}"`,
        /* Read by the caller so a partial build can say so rather than looking
           like a whole one. A header, because the body is the file. */
        "x-pagefly-sections": `${built.built}/${built.sections}`,
      },
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown error";
    console.warn(`[pagefly] ${name} failed: ${reason}`);
    return NextResponse.json({ error: reason }, { status: 502 });
  }
}
