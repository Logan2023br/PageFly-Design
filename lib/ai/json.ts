/**
 * The JSON object in a model's answer, however it was wrapped.
 *
 * Models return the object bare, inside a ```json fence, or with a sentence of
 * preamble in front of it. All three are the same answer, and a parser that
 * only accepts the first turns a good completion into a failed page — which is
 * expensive, because the completion has already been paid for.
 *
 * Three call sites had their own copy of this before it lived here. They were
 * identical but for whitespace, which is the state a helper reaches just before
 * one of them quietly drifts.
 */
export function parseObject(text: string): unknown | null {
  const attempts = [text];

  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  if (fenced) attempts.push(fenced[1]);

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) attempts.push(text.slice(start, end + 1));

  for (const attempt of attempts) {
    try {
      const value = JSON.parse(attempt.trim());
      if (value && typeof value === "object") return value;
    } catch {
      /* try the next shape */
    }
  }
  return null;
}
