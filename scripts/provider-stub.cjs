/* A provider that answers instantly and remembers what it was asked.

   Stands in for lib/ai/provider.ts under scripts/test-prompt.ts, so the prompt
   can be inspected without a key, a network call or a bill. The tree it returns
   is the smallest thing the schema accepts — this test is about the question,
   not the answer. */

const asked = [];
globalThis.__PFD_ASKED = asked;

const TREE = JSON.stringify({
  sections: [
    {
      type: "section",
      role: "hero",
      children: [{ type: "heading", level: 1, text: "A page" }],
    },
  ],
});

/* Tests that care about the ANSWER set `globalThis.__PFD_REPLY` — a string, or a
   function of the request. Everything else gets the minimal tree above, which is
   what a test about the QUESTION wants. */
exports.getProvider = () => ({
  name: "stub",
  model: "stub",
  async complete(args) {
    asked.push(args);
    const reply = globalThis.__PFD_REPLY;
    const answer = typeof reply === "function" ? reply(args) : (reply ?? TREE);
    if (answer && typeof answer === "object")
      return { usage: { input: 0, output: 0 }, truncated: false, reasoning: null, ...answer };
    return { text: answer, usage: { input: 0, output: 0 }, truncated: false, reasoning: null };
  },
});

exports.isAiEnabled = () => true;
exports.providerName = () => "deepseek";
