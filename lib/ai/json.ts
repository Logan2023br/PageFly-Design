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

/**
 * Is an unusable answer worth paying for a second one?
 *
 * A page costs 45,000-50,000 output tokens, so this is a money decision, and it
 * turns on WHICH WAY the answer is unusable. Three of the four shapes an answer
 * comes back in are unusable and only two of those are worth asking again:
 *
 *   nothing            → ask again. Measured on struct-v2: same page, same
 *                        prompt, six runs, three working trees and three empty
 *                        strings after 7-9k thinking tokens. Not the prompt.
 *   JSON, then stopped → ask again. Same failure wearing a different symptom.
 *                        A real build died on `{"plan":"hero · hero-full-bleed-
 *                        scrim · 88vh knit street shot…` — an answer that began
 *                        EXACTLY as `skills/00-contract.md` asks and then
 *                        stopped being JSON. There is no artefact to read here
 *                        any more than in an empty answer, just a broken stream.
 *   prose              → report it. This is a diagnosable artefact: the model
 *                        said something, and what it said is the diagnosis.
 *                        Asking again buries the evidence and most likely buys
 *                        more prose.
 *
 * `truncated` overrides all of it. Then the ceiling is the problem, and a second
 * ask at the same ceiling stops in the same place — one page's tokens spent to
 * reproduce a failure already understood.
 *
 * Lives here rather than beside the retry because the judgement is entirely
 * about the shape of a model's answer, which is what this file is for — and
 * because a decision this expensive should be testable without a model.
 */
export function worthAskingAgain(text: string, truncated: boolean): boolean {
  if (truncated) return false;

  const trimmed = text.trim();
  if (trimmed === "") return true;

  /* Usable after all. Reached because a caller may ask before parsing. */
  if (parseObject(trimmed) !== null) return false;

  /* Began as JSON — bare or fenced — and did not finish. The distinction prose
     cannot fake, and the only thing separating "the stream broke" from "the
     model answered in words". */
  return trimmed.startsWith("{") || trimmed.startsWith("```");
}
