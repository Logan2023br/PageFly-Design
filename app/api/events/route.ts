import { z } from "zod";
import { countryOf } from "@/lib/geo";
import { getRepo } from "@/lib/db";
import { readStoreSession } from "@/lib/session";

/* ==========================================================================
   POST /api/events   product analytics, from the browser

   PUBLIC, AND IT HAS TO BE. Half of what is measured happens before anybody
   has an account — the landing page, the sign-in form, the registration form —
   so a route that required a session could not answer the one question this
   was built for: where people leave.

   WHICH MAKES THE CEILINGS THE ONLY GATE. There is nothing here worth forging,
   but there is something worth flooding: a public insert is an invitation to
   fill a table. So a batch is capped, a name is capped, and the props bag is
   capped — and anything over the line is dropped rather than truncated,
   because a half-recorded event is a number somebody will later trust.

   THE DOMAIN IS NOT TAKEN FROM THE BODY. It comes off the session cookie, so a
   browser cannot attribute its events to somebody else's store. The visitor id
   IS from the body and is not trusted for anything: it joins one browser's
   events together and identifies nobody.

   IT NEVER FAILS LOUDLY. Analytics that can break a sign-in is worse than no
   analytics — see `lib/analytics.ts`, which ignores the answer entirely.
   ========================================================================== */

export const dynamic = "force-dynamic";

/** Enough for a page's worth of interaction, small enough to be uninteresting
    to anyone wanting to fill the table. */
const MAX_BATCH = 40;

const eventSchema = z.object({
  id: z.string().min(8).max(64),
  name: z
    .string()
    .min(3)
    .max(64)
    /* The app's own vocabulary. A name outside it is either a bug or somebody
       poking at the endpoint, and both are better dropped than counted. */
    .regex(/^design_[a-z0-9_]+$/),
  props: z.record(z.string(), z.unknown()).default({}),
  visitorId: z.string().min(8).max(64),
  at: z.string().datetime().optional(),
});

const bodySchema = z.object({
  events: z.array(eventSchema).min(1).max(MAX_BATCH),
});

/** The props bag, with anything that is not a small scalar thrown away. */
function cleanProps(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let n = 0;
  for (const [key, value] of Object.entries(props)) {
    if (n >= 12) break;
    if (!/^[a-z][a-z0-9_]{0,31}$/.test(key)) continue;

    if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
    else if (typeof value === "boolean") out[key] = value;
    else if (typeof value === "string" && value.length <= 120) out[key] = value;
    /* Arrays of short strings, for `error_field` — a register form can fail on
       three boxes at once and "which box stops people" is the question it is
       there to answer. */
    else if (
      Array.isArray(value) &&
      value.length <= 8 &&
      value.every((v) => typeof v === "string" && v.length <= 40)
    )
      out[key] = value;
    else continue;
    n++;
  }
  return out;
}

export async function POST(request: Request) {
  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    /* 204 rather than 400. Nothing on the client reads this, and an endpoint
       that argues with a browser about a malformed beacon is an endpoint
       generating log noise nobody will act on. */
    return new Response(null, { status: 204 });
  }

  /* Whoever the cookie says, or nobody. Never what the body claims. */
  const domain = await readStoreSession()
    .then((s) => s?.domain ?? null)
    .catch(() => null);

  /* ==========================================================================
     WHERE FROM, RESOLVED ONCE FOR THE WHOLE BATCH.

     One request is one browser at one moment, so every event in it came from
     the same place — asking per event would be the same answer a dozen times.

     THE ADDRESS IS NOT KEPT. `countryOf` reads it, returns two letters, and
     nothing below this line has it — see `lib/geo.ts`, which is written around
     that rule. Awaited rather than fired off, because a row written now with no
     country cannot be given one later; it is bounded at 800ms and answers null
     rather than throwing, so the worst case is the batch is stamped unplaced.
     ========================================================================== */
  const country = await countryOf(request).catch(() => null);

  const now = new Date();
  const rows = parsed.events.map((e) => {
    /* The browser's clock is allowed to be wrong, but not by enough to move an
       event into another day's numbers. Anything outside a day either side of
       now is replaced by the server's clock. */
    const claimed = e.at ? new Date(e.at) : now;
    const drift = Math.abs(claimed.getTime() - now.getTime());
    const at = drift > 24 * 60 * 60 * 1000 ? now : claimed;

    return {
      id: e.id,
      name: e.name,
      props: cleanProps(e.props),
      visitorId: e.visitorId,
      domain,
      country,
      createdAt: at.toISOString(),
    };
  });

  await getRepo()
    .recordEvents(rows)
    /* Best effort, deliberately. A storage hiccup must not turn a page view
       into an error in somebody's console. */
    .catch(() => {});

  return new Response(null, { status: 204 });
}
