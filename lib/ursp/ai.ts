import "server-only";

/* ==========================================================================
   The two questions Haiku answers for Upsell Responsive:

     category   is a Recap row's category_issue about mobile / responsive
                layout? Support types it by hand — "Mobile/Responsive",
                "responsive", "Mobile view", "Reponsive"… — so a string match
                misses some. Asked once per distinct spelling, cached in
                ursp_categories by the caller.
     reply      what the customer's answer means (agrees, declines, asks)
                and how satisfied they sound.

   Without ANTHROPIC_API_KEY, or when the call fails, a plain word match
   stands in, so the workflow never stops on the model.
   ========================================================================== */

const MODEL = "claude-haiku-4-5";
const TIMEOUT_MS = 30_000;

async function ask(prompt: string, maxTokens = 400): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = (await res.json()) as { content?: { type: string; text?: string }[]; error?: unknown };
    if (!res.ok || body.error) return null;
    return (body.content ?? []).map((c) => c.text ?? "").join("");
  } catch {
    return null;
  }
}

/** The first JSON value in a model's answer, or null. */
function json<T>(text: string | null): T | null {
  if (!text) return null;
  const m = text.match(/[[{][\s\S]*[\]}]/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as T;
  } catch {
    return null;
  }
}

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase();

/** The word match that stands in for the model. */
export function looksResponsive(category: string): boolean {
  return /re?sp?o?n?sive|reponsive|mobile|mobi|tablet|dien thoai|man hinh nho/.test(fold(category));
}

/**
 * category_issue values → responsive or not. Every value given gets an
 * answer; `by` says whether the model or the word match gave it.
 */
export async function classifyCategories(values: string[]): Promise<{ value: string; responsive: boolean; by: "haiku" | "match" }[]> {
  if (!values.length) return [];
  const answer = json<Record<string, boolean>>(
    await ask(
      [
        "Support agents for PageFly (a Shopify page builder) tag each ticket with a category, typed by hand, so spellings vary.",
        "For each category below, answer true if it means the ticket is about MOBILE / RESPONSIVE layout",
        "(how pages look or behave on phones, tablets or small screens), false otherwise.",
        'Reply with JSON only: {"<category exactly as given>": true|false, ...}',
        "",
        ...values.map((v) => `- ${JSON.stringify(v)}`),
      ].join("\n"),
      40 + values.length * 20,
    ),
  );
  return values.map((value) =>
    answer && typeof answer[value] === "boolean"
      ? { value, responsive: answer[value], by: "haiku" as const }
      : { value, responsive: looksResponsive(value), by: "match" as const },
  );
}

/**
 * What the customer wrote, in one short Vietnamese sentence — for the case's
 * notes. Without the model: the first words of it.
 */
export async function summarizeReply(text: string): Promise<string> {
  const said = text.replace(/\s+/g, " ").trim();
  const a = await ask(
    [
      "A Shopify merchant wrote this to PageFly support (latest last):",
      "<<<",
      said.slice(-1500),
      ">>>",
      "Sum it up in ONE short Vietnamese sentence (at most 25 words): what they say or want. Reply with the sentence only.",
    ].join("\n"),
    120,
  );
  const line = a?.replace(/\s+/g, " ").trim();
  return line && line.length > 3 ? line.slice(0, 300) : said.length > 160 ? `${said.slice(0, 160)}…` : said;
}

export type ReplyRead = { intent: "agree" | "decline" | "question" | "other"; mood: "happy" | "neutral" | "unhappy"; note: string; by: "haiku" | "match" };

/**
 * What the customer's replies to the offer mean. `offer` is the message we
 * sent, so "yes please" reads as agreeing to it.
 */
export async function readReply(offer: string, replies: string): Promise<ReplyRead> {
  const a = json<{ intent?: string; mood?: string; note?: string }>(
    await ask(
      [
        "We (PageFly support) sent a Shopify merchant this offer:",
        "<<<",
        offer.slice(0, 1500),
        ">>>",
        "The merchant replied (latest last):",
        "<<<",
        replies.slice(-2000),
        ">>>",
        "Classify the merchant's reply. Answer JSON only:",
        '{"intent": "agree" | "decline" | "question" | "other", "mood": "happy" | "neutral" | "unhappy", "note": "<one short sentence in Vietnamese: what they want>"}',
        "intent: agree = accepts the free responsive review / fixes; decline = does not want it; question = asks something before deciding; other = anything else.",
        "mood: how satisfied the merchant sounds with PageFly and with us.",
      ].join("\n"),
      200,
    ),
  );
  const intents = ["agree", "decline", "question", "other"] as const;
  const moods = ["happy", "neutral", "unhappy"] as const;
  if (a && intents.includes(a.intent as never) && moods.includes(a.mood as never))
    return { intent: a.intent as ReplyRead["intent"], mood: a.mood as ReplyRead["mood"], note: String(a.note ?? "").slice(0, 300), by: "haiku" };
  const t = fold(replies);
  const intent = /\b(no thanks|not interested|no need|don't|dont|stop)\b/.test(t)
    ? "decline"
    : /\b(yes|sure|ok|okay|please|agree|go ahead|i'd like|would like|interested)\b/.test(t)
      ? "agree"
      : /\?/.test(t)
        ? "question"
        : "other";
  const mood = /\b(thank|great|awesome|love|perfect|amazing)\b/.test(t) ? "happy" : /\b(bad|terrible|angry|disappointed|refund|worst)\b/.test(t) ? "unhappy" : "neutral";
  return { intent, mood, note: "", by: "match" };
}
