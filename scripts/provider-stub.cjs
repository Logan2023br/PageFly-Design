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

exports.getProvider = () => ({
  name: "stub",
  model: "stub",
  async complete(args) {
    asked.push(args);
    return { text: TREE, usage: { input: 0, output: 0 }, truncated: false, reasoning: null };
  },
});

exports.isAiEnabled = () => true;
exports.providerName = () => "deepseek";
