import "server-only";

import Anthropic from "@anthropic-ai/sdk";

/* ==========================================================================
   The model, behind one interface.

   Swapping models is meant to be a change of environment variable, not of code:
   the skills are text and belong to no vendor, and only the way we speak to a
   model is vendor-shaped. So everything vendor-shaped lives here.

     AI_PROVIDER=anthropic   ANTHROPIC_API_KEY=…   [AI_MODEL=claude-haiku-4-5]
     AI_PROVIDER=deepseek    DEEPSEEK_API_KEY=…    [AI_MODEL=deepseek-v4-flash]

   Unset or missing credentials is not an error. Generation falls back to the
   deterministic path, which is the whole product today — an unconfigured deploy
   must still build pages.
   ========================================================================== */

export type Usage = { input: number; output: number };

export type Completion = { text: string; usage: Usage };

export type Provider = {
  name: string;
  model: string;
  complete(args: {
    system: string;
    user: string;
    maxTokens: number;
    signal?: AbortSignal;
  }): Promise<Completion>;
};

export function providerName(): "anthropic" | "deepseek" | "none" {
  const explicit = process.env.AI_PROVIDER?.toLowerCase();
  if (explicit === "anthropic" && process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (explicit === "deepseek" && process.env.DEEPSEEK_API_KEY) return "deepseek";
  if (!explicit && process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (!explicit && process.env.DEEPSEEK_API_KEY) return "deepseek";
  return "none";
}

export function isAiEnabled(): boolean {
  return providerName() !== "none";
}

/**
 * The model that will actually be used, defaults resolved.
 *
 * Reporting the raw AI_MODEL instead sends an operator looking for a fault:
 * unset reads as `null`, which looks like nothing is configured on a server
 * that is happily spending money on the default.
 */
export function modelName(): string | null {
  if (process.env.AI_MODEL) return process.env.AI_MODEL;
  switch (providerName()) {
    case "anthropic":
      return DEFAULT_ANTHROPIC_MODEL;
    case "deepseek":
      return DEFAULT_DEEPSEEK_MODEL;
    default:
      return null;
  }
}

/* Named rather than inline so `modelName()` and the providers cannot drift —
   the whole point of the function is that it reports what will really run. */
const DEFAULT_ANTHROPIC_MODEL = "claude-haiku-4-5";
const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";

/* ---- Anthropic ----------------------------------------------------------- */

function anthropicProvider(): Provider {
  const model = process.env.AI_MODEL ?? DEFAULT_ANTHROPIC_MODEL;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  return {
    name: "anthropic",
    model,
    async complete({ system, user, maxTokens, signal }) {
      const res = await client.messages.create(
        {
          model,
          max_tokens: maxTokens,
          /* The skills are identical on every request and dwarf the brief, so
             they are marked cacheable. Without this the same instructions are
             billed at full input rate on every page of every build. */
          system: [
            { type: "text", text: system, cache_control: { type: "ephemeral" } },
          ],
          messages: [{ role: "user", content: user }],
        },
        { signal },
      );

      const text = res.content
        .map((part) => (part.type === "text" ? part.text : ""))
        .join("");

      return {
        text,
        usage: {
          /* Cache reads and writes are input tokens too. Reporting only
             `input_tokens` would show a spend far below the real one. */
          input:
            (res.usage.input_tokens ?? 0) +
            (res.usage.cache_creation_input_tokens ?? 0) +
            (res.usage.cache_read_input_tokens ?? 0),
          output: res.usage.output_tokens ?? 0,
        },
      };
    },
  };
}

/* ---- DeepSeek ------------------------------------------------------------ */

function deepseekProvider(): Provider {
  const model = process.env.AI_MODEL ?? DEFAULT_DEEPSEEK_MODEL;
  const key = process.env.DEEPSEEK_API_KEY!;

  return {
    name: "deepseek",
    model,
    async complete({ system, user, maxTokens, signal }) {
      const res = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          authorization: `Bearer ${key}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: { type: "json_object" },
        }),
        signal,
      });

      if (!res.ok)
        throw new Error(`DeepSeek returned ${res.status}: ${await res.text()}`);

      const body = (await res.json()) as {
        choices: { message: { content: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

      return {
        text: body.choices[0]?.message?.content ?? "",
        usage: {
          input: body.usage?.prompt_tokens ?? 0,
          output: body.usage?.completion_tokens ?? 0,
        },
      };
    },
  };
}

export function getProvider(): Provider | null {
  switch (providerName()) {
    case "anthropic":
      return anthropicProvider();
    case "deepseek":
      return deepseekProvider();
    default:
      return null;
  }
}
