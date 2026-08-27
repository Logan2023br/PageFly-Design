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

   ==========================================================================
   ROLES, because one build now makes two different kinds of call.

   Deciding a whole deck's design once and writing one page's elements are not
   the same job, and the model that is best at the first is not obviously the
   one that is cheapest at the second. So a call names the ROLE it is making,
   and a role can be pointed at its own vendor, model and key:

     DESIGN_PROVIDER=anthropic  DESIGN_MODEL=claude-opus-5  DESIGN_API_KEY=…

   Every field falls back: an unset role is the default provider, so a deploy
   that sets none of these behaves exactly as it did before roles existed.

   `DESIGN_API_KEY` is separate from `ANTHROPIC_API_KEY` on purpose — the point
   is not only "a different vendor" but "a different key at the same vendor",
   which is how a spend on an expensive model is kept legible on a bill.
   ========================================================================== */

export type Usage = { input: number; output: number };

/**
 * `truncated` is the difference between "the model could not do it" and "the
 * model was not given room to finish", and those need different fixes. Without
 * it a budget that ran out surfaces as "did not return JSON" — which sent this
 * codebase looking at the prompt when the answer was the ceiling.
 */
export type Completion = {
  text: string;
  usage: Usage;
  truncated: boolean;
  /**
   * Of the output tokens, how many were the model thinking rather than
   * answering. Null where the provider does not separate them.
   *
   * This is the number that explains a truncated page. A reasoning model bills
   * its thinking against the same ceiling as its answer, so a page that ran out
   * of budget did not fail at writing — it spent the budget before it started.
   * Without this the two are indistinguishable and the fix is a guess.
   */
  reasoning: number | null;
};

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

/**
 * Which call is being made.
 *
 * `"default"` is everything that existed before roles did. `"design"` is the
 * deck-planning call in `deckPlan.ts` — one per build, the one worth pointing
 * at a stronger model.
 */
export type Role = "default" | "design";

/** The env prefix a role reads, or null for the unprefixed default. */
const PREFIX: Record<Role, string | null> = {
  default: null,
  design: "DESIGN",
};

/** `DESIGN_MODEL` for the design role, `AI_MODEL` for the default one. */
function roleVar(role: Role, name: "PROVIDER" | "MODEL" | "API_KEY"): string | undefined {
  const prefix = PREFIX[role];
  if (!prefix) {
    return name === "PROVIDER"
      ? process.env.AI_PROVIDER
      : name === "MODEL"
        ? process.env.AI_MODEL
        : undefined;
  }
  return process.env[`${prefix}_${name}`];
}

/** The key a vendor is reached with for this role — the role's own, or the shared one. */
function keyFor(vendor: "anthropic" | "deepseek", role: Role): string | undefined {
  return (
    roleVar(role, "API_KEY") ??
    (vendor === "anthropic" ? process.env.ANTHROPIC_API_KEY : process.env.DEEPSEEK_API_KEY)
  );
}

export function providerName(role: Role = "default"): "anthropic" | "deepseek" | "none" {
  const explicit = roleVar(role, "PROVIDER")?.toLowerCase();

  if (explicit === "anthropic") return keyFor("anthropic", role) ? "anthropic" : "none";
  if (explicit === "deepseek") return keyFor("deepseek", role) ? "deepseek" : "none";

  /* A role that names no provider of its own inherits the default one entirely
     — vendor AND model — so setting nothing is setting nothing. */
  if (role !== "default") return providerName("default");

  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.DEEPSEEK_API_KEY) return "deepseek";
  return "none";
}

export function isAiEnabled(role: Role = "default"): boolean {
  return providerName(role) !== "none";
}

/**
 * The model that will actually be used, defaults resolved.
 *
 * Reporting the raw AI_MODEL instead sends an operator looking for a fault:
 * unset reads as `null`, which looks like nothing is configured on a server
 * that is happily spending money on the default.
 */
export function modelName(role: Role = "default"): string | null {
  const named = roleVar(role, "MODEL");
  if (named) return named;

  /* A role with no model of its own but a provider of its own must NOT inherit
     the default role's `AI_MODEL` — `AI_MODEL=deepseek-v4-flash` sent to
     Anthropic is a 404. Only the vendor's own default is safe here. */
  const inherits = !roleVar(role, "PROVIDER");
  if (role !== "default" && inherits) return modelName("default");

  switch (providerName(role)) {
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

function anthropicProvider(role: Role): Provider {
  const model = modelName(role) ?? DEFAULT_ANTHROPIC_MODEL;
  const client = new Anthropic({ apiKey: keyFor("anthropic", role)! });

  return {
    name: "anthropic",
    model,
    async complete({ system, user, maxTokens, signal }) {
      const params = {
        model,
        max_tokens: maxTokens,
        /* The skills are identical on every request and dwarf the brief, so
           they are marked cacheable. Without this the same instructions are
           billed at full input rate on every page of every build. */
        system: [
          { type: "text" as const, text: system, cache_control: { type: "ephemeral" as const } },
        ],
        messages: [{ role: "user" as const, content: user }],
      };

      /* ====================================================================
         ABOVE ~16,000 OUTPUT TOKENS, STREAM.

         Anthropic's own guidance, and it is not advisory: a non-streaming
         request with a large `max_tokens` hits the SDK's HTTP timeout and
         fails as a network error rather than as anything diagnosable. This
         provider was written when the only Anthropic call in the codebase was
         the reference read at 1,200 tokens, where it never came up. The deck
         plan asks for 32,000, and on a model whose thinking is on by default
         that budget can genuinely be used.

         `getFinalMessage()` returns the same `Message` the non-streaming call
         does, so everything below is unchanged.
         ==================================================================== */
      /* Wrapped so both vendors fail in the same words. The SDK throws an
         `APIError` carrying a status and a message written for a developer;
         unwrapped, an Anthropic account out of credit reaches a merchant as
         SDK prose while the same DeepSeek condition reaches them as a
         sentence. See `sayWhy`. */
      let res: Anthropic.Message;
      try {
        res =
          maxTokens > 16_000
            ? await client.messages.stream(params, { signal }).finalMessage()
            : await client.messages.create(params, { signal });
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (typeof status === "number")
          throw new Error(
            fromStatus(status, "Anthropic", (err as Error).message ?? ""),
          );
        throw err;
      }

      const text = res.content
        .map((part) => (part.type === "text" ? part.text : ""))
        .join("");

      return {
        truncated: res.stop_reason === "max_tokens",
        /* Thinking blocks are billed as output like any other. Counting them
           is what tells "the model could not do it" from "the model was not
           given room to finish" — the same distinction `reasoning` carries for
           DeepSeek, and on a model with thinking on by default it is not a
           theoretical one. */
        reasoning:
          res.content.reduce(
            (n, part) => n + (part.type === "thinking" ? part.thinking.length : 0),
            0,
          ) || null,
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

/**
 * Why a provider refused, in words the person reading it can act on.
 *
 * The raw form — `DeepSeek returned 402: {"error":{"message":...}}` — travels a
 * long way: it becomes the job's `error`, which becomes the sentence a merchant
 * sees. A build that stopped because the account is out of credit and says
 * "could not finish" sends someone to support with a question their own billing
 * page answers, and sends whoever reads the log looking for a bug that is not
 * there.
 *
 * The status code is the whole signal. It is kept in the message anyway,
 * because an operator wants it and it costs four characters.
 */
export function fromStatus(status: number, vendor: string, body = ""): string {
  if (status === 402 || /insufficient|balance|quota|credit/i.test(body))
    return `${vendor} refused the request: the account is out of credit. Top it up and build again. (${status})`;
  if (status === 401 || status === 403)
    return `${vendor} rejected the API key. Check it is set and still valid. (${status})`;
  if (status === 429)
    return `${vendor} is rate limiting this key. Wait a minute and build again. (429)`;
  if (status >= 500)
    return `${vendor} is having an outage — nothing here is wrong. Try again shortly. (${status})`;

  return `${vendor} returned ${status}: ${body.slice(0, 200)}`;
}

async function sayWhy(res: Response, vendor: string): Promise<string> {
  return fromStatus(res.status, vendor, await res.text().catch(() => ""));
}

/* ---- DeepSeek ------------------------------------------------------------ */

function deepseekProvider(role: Role): Provider {
  const model = modelName(role) ?? DEFAULT_DEEPSEEK_MODEL;
  const key = keyFor("deepseek", role)!;

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

      if (!res.ok) throw new Error(await sayWhy(res, "DeepSeek"));

      const body = (await res.json()) as {
        choices: { message: { content: string }; finish_reason?: string }[];
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          completion_tokens_details?: { reasoning_tokens?: number };
        };
      };

      return {
        truncated: body.choices[0]?.finish_reason === "length",
        reasoning: body.usage?.completion_tokens_details?.reasoning_tokens ?? null,
        text: body.choices[0]?.message?.content ?? "",
        usage: {
          input: body.usage?.prompt_tokens ?? 0,
          output: body.usage?.completion_tokens ?? 0,
        },
      };
    },
  };
}

export function getProvider(role: Role = "default"): Provider | null {
  switch (providerName(role)) {
    case "anthropic":
      return anthropicProvider(role);
    case "deepseek":
      return deepseekProvider(role);
    default:
      return null;
  }
}
