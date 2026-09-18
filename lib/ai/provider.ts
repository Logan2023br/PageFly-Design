import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { deepseekAccumulator, sseDecoder } from "./sse";

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
    /**
     * Whether the answer is expected to be a JSON object. Default true, which
     * is what every caller wanted for the whole life of this file.
     *
     * It reaches the wire on DeepSeek, which takes a `response_format` and then
     * REFUSES the request if the prompt does not also contain the word "json":
     *
     *   Prompt must contain the word 'json' in some form to use
     *   'response_format' of type 'json_object'.
     *
     * So a caller that asks for HTML must say so here as well as in the prompt.
     * Leaving the flag out of the call and only out of the prompt is a 400 from
     * the vendor, which is how this was found.
     */
    json?: boolean;
    /**
     * Called as output arrives, with the characters seen so far.
     *
     * OPT-IN, AND THAT IS DELIBERATE. Passing it switches the call to a
     * streaming request; leaving it off keeps the exact request this codebase
     * has always made. Every page of every build goes through here, so the new
     * path is reachable only from the one caller that wants it, and backing the
     * feature out is deleting one argument at that caller rather than reverting
     * a provider.
     *
     * CHARACTERS, NOT TOKENS. Tokens are only known when the stream ends —
     * usage arrives in the final chunk — and a number that is exact but only at
     * the end cannot move a progress bar. See lib/ai/sse.ts.
     */
    onProgress?: (chars: number) => void;
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

/* ==========================================================================
   WHO DESIGNS, DECIDED IN THE SOURCE.

   These were `DESIGN_PROVIDER` and `DESIGN_MODEL`, read from the environment.
   The deployment never set them — and a role that names no provider of its own
   inherits the default one entirely, so the design stages resolved to whatever
   `AI_PROVIDER` was, which is DeepSeek. That was invisible until `/api/health`
   started reporting it: every Opus result in this project's design work came
   from a laptop, and production had never run the stage at all.

   So they are constants now, for the same reason `FREE_DESIGN` is: the value is
   reviewed, it is in the history, and there is no way for the running server to
   be designing with a model the source does not name. An operator cannot set
   these, and cannot forget to.

   THE KEY IS STILL AN ENVIRONMENT VARIABLE and always will be — a secret does
   not belong in a repository. `keyFor` falls back to `ANTHROPIC_API_KEY`, which
   this deployment already has (it is what reads the merchant's reference
   uploads). Without a key `providerName("design")` returns "none" and the
   design stage says "no design model configured" rather than quietly running on
   something cheaper, which is the failure mode worth keeping.
   ========================================================================== */
export const DESIGN_PROVIDER = "anthropic";
export const DESIGN_MODEL = "claude-opus-5";

/** `DESIGN_MODEL` for the design role, `AI_MODEL` for the default one. */
function roleVar(role: Role, name: "PROVIDER" | "MODEL" | "API_KEY"): string | undefined {
  /* The design role's vendor and model come from the source, not the box. Its
     KEY does not — see above. */
  if (role === "design") {
    if (name === "PROVIDER") return DESIGN_PROVIDER;
    if (name === "MODEL") return DESIGN_MODEL;
  }

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
    async complete({ system, user, maxTokens, signal, onProgress }) {
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
        if (onProgress || maxTokens > 16_000) {
          /* Streaming already happened above the budget threshold; a caller
             that wants progress simply also wants it. The `text` event carries
             the answer only — the SDK reports thinking separately — so both are
             counted, for the reason lib/ai/sse.ts spells out at length: this
             model thinks for most of the call, and a bar that ignores thinking
             sits at zero for the part that takes longest. */
          let chars = 0;
          const stream = client.messages.stream(params, { signal });
          if (onProgress) {
            stream.on("text", (delta) => onProgress((chars += delta.length)));
            stream.on("thinking", (delta) => onProgress((chars += delta.length)));
          }
          res = await stream.finalMessage();
        } else {
          res = await client.messages.create(params, { signal });
        }
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (typeof status === "number")
          throw vendorError(
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
/**
 * Did this error come from the VENDOR saying no, or from the network saying
 * nothing?
 *
 * The distinction reached a merchant's screen the hard way. `designPageTree`
 * marked every error from a provider call as the vendor's — reasoning that
 * `fromStatus` had turned it into a sentence — and `fromStatus` only does that
 * when there was an HTTP status. A dropped socket has none, so `terminated`
 * travelled from inside undici all the way to a brief.
 *
 * Matching on the marker rather than on the prose, because the prose is ours to
 * reword and a check that breaks when someone improves a sentence is a check
 * nobody trusts.
 */
export function fromVendor(err: unknown): boolean {
  return (err as { vendorSaidNo?: unknown })?.vendorSaidNo === true;
}

/** An error whose message `fromStatus` wrote, tagged so callers can tell. */
export function vendorError(message: string): Error {
  const err = new Error(message);
  (err as Error & { vendorSaidNo?: boolean }).vendorSaidNo = true;
  return err;
}

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

/**
 * Drain a streaming DeepSeek response into the same `Completion` the
 * non-streaming call returns.
 *
 * The parsing is in `lib/ai/sse.ts` and tested without a network; what is here
 * is only the plumbing, because the plumbing is the part that cannot be tested
 * without one.
 *
 * `onProgress` is called per network chunk rather than per event. A page emits
 * a few hundred chunks over fifteen minutes, the browser polls the job row
 * every 2.5 seconds, and the runner throttles its writes anyway — calling this
 * more often would cost work nobody can observe.
 */
async function readDeepseekStream(
  res: Response,
  onProgress: (chars: number) => void,
): Promise<Completion> {
  const body = res.body;
  /* A 200 with no body is not something the caller can be handed as an empty
     page — that would reach the merchant as "the designer answered in the
     wrong shape", which is a different problem with a different fix. */
  if (!body) throw vendorError("DeepSeek returned no response body.");

  const decode = sseDecoder();
  const acc = deepseekAccumulator();
  const reader = body.pipeThrough(new TextDecoderStream()).getReader();

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const payload of decode(value)) acc.push(payload);
      onProgress(acc.chars());
    }
  } finally {
    /* An aborted build leaves a half-read stream, and a socket nobody released
       is a socket held until the process exits. `cancel` on an already-finished
       reader is a no-op, so this is safe on the happy path too. */
    await reader.cancel().catch(() => {});
  }

  return acc.result();
}


function deepseekProvider(role: Role): Provider {
  const model = modelName(role) ?? DEFAULT_DEEPSEEK_MODEL;
  const key = keyFor("deepseek", role)!;

  return {
    name: "deepseek",
    model,
    async complete({ system, user, maxTokens, signal, onProgress, json = true }) {
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
          /* Omitted entirely rather than set to a "text" type: the parameter
             is optional, and a mode nobody asked for is a mode nobody tested. */
          ...(json ? { response_format: { type: "json_object" as const } } : {}),
          /* Only when somebody is listening. A streaming response is parsed by
             a different code path, and this one builds every page — so the
             request stays byte-for-byte what it has always been unless a caller
             actually wants the progress. */
          ...(onProgress
            ? { stream: true, stream_options: { include_usage: true } }
            : {}),
        }),
        signal,
      });

      if (!res.ok) throw vendorError(await sayWhy(res, "DeepSeek"));

      if (onProgress) return readDeepseekStream(res, onProgress);

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
