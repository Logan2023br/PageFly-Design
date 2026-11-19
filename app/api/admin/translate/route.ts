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
  texts: z.array(z.string().max(4000)).max(100),
});

const cache = new Map<string, string>();
const remember = (k: string, v: string) => {
  if (cache.size > 20_000) cache.delete(cache.keys().next().value!);
  cache.set(k, v);
};

const LANG = { en: "English", vi: "Vietnamese" } as const;

function promptFor(target: "en" | "vi", texts: string[]): string {
  return [
    `Translate each string below into ${LANG[target]}. They are pieces of the PageFly admin dashboard (a Shopify page builder company): UI labels, statuses, notes, and customer messages.`,
    `Every string written in another language — Vietnamese, Japanese, Chinese, Korean, Arabic, Thai, Russian, English or any other — MUST be translated into ${LANG[target]}; never return a foreign sentence untranslated.`,
    "Rules: keep the meaning and tone; keep numbers, dates, times, URLs, emails, domains, store and product names, brand names (PageFly, Shopify, Crisp, Recap, Active, Builder…) and code as they are;",
    `keep leading/trailing punctuation such as · — : ( ); only a string already wholly in ${LANG[target]} comes back unchanged; short UI labels stay short.`,
    `Reply with JSON only: {"t": [exactly ${texts.length} strings, in the same order]}.`,
    "",
    JSON.stringify(texts),
  ].join("\n");
}

/** The array in a model's answer, when it has exactly `n` strings. */
function arrayOf(text: string, n: number): string[] | null {
  const m = text.match(/[[{][\s\S]*[\]}]/);
  if (!m) return null;
  try {
    const v = JSON.parse(m[0]) as unknown;
    const arr = Array.isArray(v) ? v : (v as { t?: unknown }).t;
    return Array.isArray(arr) && arr.length === n && arr.every((s) => typeof s === "string") ? (arr as string[]) : null;
  } catch {
    return null;
  }
}

/* Haiku first; DeepSeek when there is no Anthropic key or Haiku fails — the
   same key the export runs on, so production always has one of the two. */
async function translate(target: "en" | "vi", texts: string[]): Promise<{ out: string[] | null; why: string }> {
  const prompt = promptFor(target, texts);
  const reasons: string[] = [];
  const anthropic = process.env.ANTHROPIC_API_KEY;
  if (anthropic) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": anthropic, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: MODEL, max_tokens: 8000, messages: [{ role: "user", content: prompt }] }),
        signal: AbortSignal.timeout(60_000),
      });
      const body = (await res.json()) as { content?: { text?: string }[]; error?: { message?: string } };
      const out = res.ok ? arrayOf((body.content ?? []).map((c) => c.text ?? "").join(""), texts.length) : null;
      if (out) return { out, why: "" };
      reasons.push(`Haiku: ${res.ok ? "câu trả lời không đúng dạng" : (body.error?.message ?? `HTTP ${res.status}`)}`);
    } catch (e) {
      reasons.push(`Haiku: ${(e as Error).message}`);
    }
  } else reasons.push("không có ANTHROPIC_API_KEY");
  const deepseek = process.env.DEEPSEEK_API_KEY;
  if (deepseek) {
    try {
      const res = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${deepseek}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: "deepseek-v4-flash",
          max_tokens: 8000,
          response_format: { type: "json_object" },
          messages: [{ role: "user", content: prompt }],
        }),
        signal: AbortSignal.timeout(90_000),
      });
      const body = (await res.json()) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
      const out = res.ok ? arrayOf(body.choices?.[0]?.message?.content ?? "", texts.length) : null;
      if (out) return { out, why: "" };
      reasons.push(`DeepSeek: ${res.ok ? "câu trả lời không đúng dạng" : (body.error?.message ?? `HTTP ${res.status}`)}`);
    } catch (e) {
      reasons.push(`DeepSeek: ${(e as Error).message}`);
    }
  } else reasons.push("không có DEEPSEEK_API_KEY");
  return { out: null, why: reasons.join(" · ") };
}

export async function POST(req: Request) {
  if (!(await readAdminSession())) return Response.json({ ok: false, error: "Not signed in." }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, error: "Bad request." }, { status: 400 });
  const { target, texts } = parsed.data;

  const missing = [...new Set(texts.filter((t) => !cache.has(`${target}\u0000${t}`)))];
  /* In slices of 25, four at a time. A slice the model answers wrongly (a
     string short, a broken JSON) is split in half and asked again, down to
     one string, so one awkward text never costs the other 24. */
  let failed = "";
  const run = async (slice: string[]): Promise<void> => {
    const { out, why } = await translate(target, slice);
    if (out) return void slice.forEach((t, k) => remember(`${target}\u0000${t}`, out[k]));
    failed = why;
    if (slice.length > 1) {
      const half = Math.ceil(slice.length / 2);
      await Promise.all([run(slice.slice(0, half)), run(slice.slice(half))]);
    }
  };
  const slices: string[][] = [];
  for (let i = 0; i < missing.length; i += 25) slices.push(missing.slice(i, i + 25));
  for (let i = 0; i < slices.length; i += 4) await Promise.all(slices.slice(i, i + 4).map(run));
  if (failed && missing.length && missing.every((t) => !cache.has(`${target}\u0000${t}`)))
    return Response.json({ ok: false, error: `Không dịch được — ${failed}` }, { status: 502 });
  /* null where no translation came back: the browser asks again later
     instead of keeping the original as if it were the answer. */
  return Response.json({ ok: true, translations: texts.map((t) => cache.get(`${target}\u0000${t}`) ?? null) });
}
