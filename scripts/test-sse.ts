/* ==========================================================================
   The stream every page goes through.

       npx tsx scripts/test-sse.ts

   `designPageTree` calls the default provider, which in production is
   DeepSeek, which was a plain `fetch`. Streaming it is what gives the build
   screen more than one progress event per fifteen-minute page — and it also
   puts a parser on the path of every page of every build. Breaking it does not
   break a progress bar; it breaks the product.

   So the parsing is pure functions and this file is what stands behind them.
   The cases that matter are the ones a naive parser gets right in testing and
   wrong under load: an event split across two network chunks, two events in
   one chunk, `\r\n` from a proxy, a stream that stops mid-chunk.
   ========================================================================== */

let failures = 0;
function check(ok: boolean, label: string, detail: string | null = null): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

/** One DeepSeek chunk, as it appears on the wire. */
const say = (content: string) =>
  JSON.stringify({ choices: [{ delta: { content }, finish_reason: null }] });
const think = (reasoning_content: string) =>
  JSON.stringify({ choices: [{ delta: { reasoning_content }, finish_reason: null }] });
const stop = (reason = "stop") =>
  JSON.stringify({ choices: [{ delta: {}, finish_reason: reason }] });
const usage = (input: number, output: number, reasoning: number) =>
  JSON.stringify({
    choices: [],
    usage: {
      prompt_tokens: input,
      completion_tokens: output,
      completion_tokens_details: { reasoning_tokens: reasoning },
    },
  });

const event = (payload: string) => `data: ${payload}\n\n`;

async function main(): Promise<void> {
  const { sseDecoder, deepseekAccumulator, SSE_DONE } = await import("@/lib/ai/sse");

  console.log("\nthe decoder, on well-behaved input");

  {
    const decode = sseDecoder();
    const out = decode(event("a") + event("b"));
    check(out.join("|") === "a|b", "two events in one chunk", out.join("|"));
  }

  {
    const decode = sseDecoder();
    check(decode("data: hel").length === 0, "half an event yields nothing yet");
    const out = decode('lo"\n\n');
    check(out.join("|") === 'hel lo"'.replace(" ", ""), "and completes on the next chunk", out.join("|"));
  }

  console.log("\nand on the input that breaks naive parsers");

  {
    /* THE CASE THAT MATTERS. A 40KB page arrives in whatever slices the
       network chooses, and a chunk boundary inside a JSON payload is the
       normal case rather than the rare one. */
    const decode = sseDecoder();
    const whole = event(say("hello"));
    const seen: string[] = [];
    for (const ch of whole) seen.push(...decode(ch));
    check(seen.length === 1, "an event split one character at a time", String(seen.length));
    check(seen[0] === say("hello"), "arrives intact", seen[0]);
  }

  {
    const decode = sseDecoder();
    const out = decode(`data: a\r\n\r\ndata: b\r\n\r\n`);
    check(out.join("|") === "a|b", "\\r\\n line endings, which proxies introduce", out.join("|"));
  }

  {
    const decode = sseDecoder();
    const out = decode("event: ping\ndata: a\n\n");
    check(out.join("|") === "a", "a named event's data is still data", out.join("|"));
  }

  {
    const decode = sseDecoder();
    const out = decode(": keep-alive comment\n\ndata: a\n\n");
    check(out.join("|") === "a", "a comment line is not data", out.join("|"));
  }

  {
    const decode = sseDecoder();
    check(decode("data:  \n\n").length === 0, "an empty payload is dropped");
  }

  console.log("\nadding a page up");

  {
    const acc = deepseekAccumulator();
    for (const p of [say('{"a":'), say("1}"), stop(), usage(1200, 9000, 7000), SSE_DONE])
      acc.push(p);

    const out = acc.result();
    check(out.text === '{"a":1}', "the text is the content deltas joined", out.text);
    check(out.truncated === false, "not truncated");
    check(out.usage.input === 1200 && out.usage.output === 9000, "usage comes from the last chunk", JSON.stringify(out.usage));
    check(out.reasoning === 7000, "and so does the thinking count", String(out.reasoning));
  }

  console.log("\nthinking counts as progress — the whole point");

  {
    /* `provider.ts` records that this model spends 15,000-16,000 output tokens
       thinking BEFORE it writes any JSON. Counting `content` alone would leave
       the bar at zero for the longest part of a page and then race it to the
       end, which is the failure this feature exists to remove. */
    const acc = deepseekAccumulator();
    acc.push(think("x".repeat(4000)));
    check(acc.chars() === 4000, "characters move while the model is only thinking", String(acc.chars()));
    check(acc.result().text === "", "and none of it lands in the answer", JSON.stringify(acc.result().text));

    acc.push(say("{}"));
    check(acc.chars() === 4002, "then the answer adds to the same count", String(acc.chars()));
    check(acc.result().text === "{}", "and only the answer is kept", acc.result().text);
  }

  console.log("\na budget that ran out is not a model that failed");

  {
    const acc = deepseekAccumulator();
    acc.push(say('{"a":'));
    acc.push(stop("length"));
    check(acc.result().truncated === true, "finish_reason length reports truncated");
  }

  console.log("\nand a stream that simply stops");

  {
    /* No usage chunk, no [DONE]. The page is lost either way, but the build's
       token total must not silently under-count by the whole call. */
    const acc = deepseekAccumulator();
    acc.push(say("y".repeat(400)));
    const out = acc.result();
    check(out.usage.output === 100, "output falls back to a character estimate", String(out.usage.output));
    check(out.truncated === false, "and it is not claimed as truncated", String(out.truncated));
  }

  {
    const acc = deepseekAccumulator();
    acc.push("not json at all");
    acc.push(SSE_DONE);
    acc.push(say("ok"));
    check(acc.result().text === "ok", "an unparseable chunk does not throw the page away", acc.result().text);
  }

  {
    const acc = deepseekAccumulator();
    acc.push(JSON.stringify({ choices: [{ delta: { content: null } }] }));
    acc.push(JSON.stringify({ choices: [] }));
    acc.push(JSON.stringify({}));
    check(acc.result().text === "", "nulls and empty chunks are survived");
    check(acc.chars() === 0, "and count for nothing");
  }

  console.log(failures === 0 ? "\nall good\n" : `\n${failures} failure(s)\n`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();

export {};
