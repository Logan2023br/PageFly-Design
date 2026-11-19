import { z } from "zod";
import { readAdminSession } from "@/lib/session";

/* ==========================================================================
   POST /api/admin/translate   { target: "en" | "vi", texts: string[] }
                             → { ok, translations: string[] }  (same order)

   The admin's EN / VI switch (components/admin/PageTranslator): the screen's
   text, translated by Haiku. Admin only. Every answer is kept in memory, so
   a screen opened twice is translated once; a text the model fails on comes
   back unchanged rather than failing the rest.
   ========================================================================== */

export const dynamic = "force-dynamic";

const MODEL = "claude-haiku-4-5";
const Body = z.object({
  target: z.enum(["en", "vi"]),
  texts: z.array(z.string().max(4000)).max(120),
});

const cache = new Map<string, string>();
const remember = (k: string, v: string) => {
  if (cache.size > 20_000) cache.delete(cache.keys().next().value!);
  cache.set(k, v);
};

const LANG = { en: "English", vi: "Vietnamese" } as const;

async function translate(target: "en" | "vi", texts: string[]): Promise<string[] | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || texts.length === 0) return null;
  const prompt = [
    `Translate each string below into ${LANG[target]}. They are pieces of the PageFly admin dashboard (a Shopify page builder company): UI labels, statuses, notes, and customer messages.`,
    `Every string written in another language — Vietnamese, Japanese, Chinese, Korean, Arabic, Thai, Russian, English or any other — MUST be translated into ${LANG[target]}; never return a foreign sentence untranslated.`,
    "Rules: keep the meaning and tone; keep numbers, dates, times, URLs, emails, domains, store and product names, brand names (PageFly, Shopify, Crisp, Recap, Active, Builder…) and code as they are;",
    `keep leading/trailing punctuation such as · — : ( ); only a string already wholly in ${LANG[target]} comes back unchanged; short UI labels stay short.`,
    `Reply with JSON only: an array of exactly ${texts.length} strings, in the same order.`,
    "",
    JSON.stringify(texts),
  ].join("\n");
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 8000, messages: [{ role: "user", content: prompt }] }),
      signal: AbortSignal.timeout(60_000),
    });
    const body = (await res.json()) as { content?: { text?: string }[] };
    if (!res.ok) return null;
    const text = (body.content ?? []).map((c) => c.text ?? "").join("");
    const m = text.match(/\[[\s\S]*\]/);
    const out = m ? (JSON.parse(m[0]) as unknown) : null;
    return Array.isArray(out) && out.length === texts.length && out.every((s) => typeof s === "string") ? (out as string[]) : null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  if (!(await readAdminSession())) return Response.json({ ok: false, error: "Not signed in." }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, error: "Bad request." }, { status: 400 });
  const { target, texts } = parsed.data;

  const missing = [...new Set(texts.filter((t) => !cache.has(`${target}\u0000${t}`)))];
  /* In slices of 40, so one long answer never runs out of room. */
  for (let i = 0; i < missing.length; i += 40) {
    const slice = missing.slice(i, i + 40);
    const out = await translate(target, slice);
    if (out) slice.forEach((t, k) => remember(`${target}\u0000${t}`, out[k]));
  }
  return Response.json({ ok: true, translations: texts.map((t) => cache.get(`${target}\u0000${t}`) ?? t) });
}
