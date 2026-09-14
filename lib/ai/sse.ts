/* ==========================================================================
   Server-sent events, and what a DeepSeek stream adds up to.

   WHY THIS EXISTS AT ALL. The build screen had one progress event per page —
   the page landing — and a page takes about fifteen minutes. So the bar sat at
   zero for fifteen minutes and then jumped to a hundred, which is
   indistinguishable from a build that has hung. Streaming the page call gives
   a few hundred real events instead of one, and they arrive at the rate the
   model is actually working: fast while it writes, slow while it thinks.

   SPLIT OUT OF `provider.ts` SO IT CAN BE TESTED WITHOUT A NETWORK. The
   DeepSeek path is the one every page of every build goes through — breaking
   it does not break a progress bar, it breaks the product. Parsing is the part
   that can be got wrong quietly, so it is pure functions here and covered by
   `scripts/test-sse.ts`, and `provider.ts` only does the plumbing.

   THE PROTOCOL, only as much of it as this needs. A stream is text; events are
   separated by a blank line; a line beginning `data:` carries a payload; the
   payload `[DONE]` ends it. Chunks arrive at whatever size the network feels
   like, so an event can be split across two of them and two events can arrive
   in one — which is the entire reason this is incremental rather than a
   `split("\n")`.
   ========================================================================== */

/**
 * Feed raw text, get back the payloads that became complete.
 *
 * Holds the tail of a chunk that did not end on an event boundary, which is
 * the case a naive parser gets wrong once in a hundred builds and then only
 * under load. `[DONE]` is passed through rather than swallowed: whether the
 * stream ended cleanly is the caller's business.
 */
export function sseDecoder(): (chunk: string) => string[] {
  let buffer = "";

  return (chunk: string): string[] => {
    buffer += chunk;
    const out: string[] = [];

    /* Events end at a blank line. `\r\n` because some proxies rewrite the
       newlines and the spec allows both.

       The separator is measured from the MATCH, not guessed. Matching it
       against the event text instead found nothing — the separator is what
       follows the event, not part of it — so the cut length came out
       `undefined`, the slice returned the whole buffer unchanged, and the loop
       re-emitted the same event until the array ran out of room. A parser that
       cannot make progress is worse than one that drops an event. */
    for (;;) {
      const sep = /\r?\n\r?\n/.exec(buffer);
      if (!sep) break;

      const event = buffer.slice(0, sep.index);
      buffer = buffer.slice(sep.index + sep[0].length);

      for (const line of event.split(/\r?\n/)) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload) out.push(payload);
      }
    }

    return out;
  };
}

export const SSE_DONE = "[DONE]";

/** The same shape `Provider.complete` returns, assembled from the stream. */
export type StreamedCompletion = {
  text: string;
  usage: { input: number; output: number };
  truncated: boolean;
  reasoning: number | null;
};

/**
 * Add up a DeepSeek stream.
 *
 * THINKING COUNTS AS PROGRESS, and getting this wrong would have made the
 * whole feature pointless. `provider.ts` records that this model "spends
 * 15,000-16,000 output tokens thinking before it writes any JSON" — so for
 * most of a fifteen-minute page there is no `content` at all, only
 * `reasoning_content`. Counting characters of `content` alone would leave the
 * bar at zero for the part of the call that takes the longest and then race it
 * to the end, which is the exact failure this was built to remove.
 *
 * `usage` only arrives in the final chunk, and only when the request asked for
 * it, so it cannot drive progress — `chars()` is what moves the bar and
 * `usage` is what gets reported at the end. They measure the same work in two
 * units and only the second one is exact.
 */
export function deepseekAccumulator() {
  const answer: string[] = [];
  let chars = 0;
  let finish: string | null = null;
  let usageIn = 0;
  let usageOut = 0;
  let reasoning: number | null = null;

  type Chunk = {
    choices?: {
      delta?: { content?: string | null; reasoning_content?: string | null };
      finish_reason?: string | null;
    }[];
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      completion_tokens_details?: { reasoning_tokens?: number };
    } | null;
  };

  return {
    /** One `data:` payload. `[DONE]` and anything unparseable are ignored —
        a stream that ends with a half-written chunk must not throw away the
        page that arrived before it. */
    push(payload: string): void {
      if (payload === SSE_DONE) return;

      let chunk: Chunk;
      try {
        chunk = JSON.parse(payload) as Chunk;
      } catch {
        return;
      }

      const choice = chunk.choices?.[0];
      const delta = choice?.delta;

      if (typeof delta?.content === "string" && delta.content) {
        answer.push(delta.content);
        chars += delta.content.length;
      }
      /* Not kept, only counted. The thinking is not part of the answer and
         `finish()` downstream would choke on it; what it is good for is
         telling the merchant the model is working. */
      if (typeof delta?.reasoning_content === "string" && delta.reasoning_content)
        chars += delta.reasoning_content.length;

      if (choice?.finish_reason) finish = choice.finish_reason;

      if (chunk.usage) {
        usageIn = chunk.usage.prompt_tokens ?? usageIn;
        usageOut = chunk.usage.completion_tokens ?? usageOut;
        reasoning =
          chunk.usage.completion_tokens_details?.reasoning_tokens ?? reasoning;
      }
    },

    /** Characters of model output so far, thinking included. What moves the
        bar; see the note above about why it is not tokens. */
    chars(): number {
      return chars;
    },

    result(): StreamedCompletion {
      return {
        text: answer.join(""),
        truncated: finish === "length",
        reasoning,
        usage: {
          input: usageIn,
          /* A stream that ended before its usage chunk still has to report
             something, or a build's token total silently under-counts. Four
             characters to the token is the usual rule of thumb for JSON and it
             is only ever a fallback — the exact number arrives with `usage`
             whenever the stream finishes properly. */
          output: usageOut || Math.round(chars / 4),
        },
      };
    },
  };
}
