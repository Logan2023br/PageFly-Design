import { deflateSync, inflateSync, strFromU8, strToU8 } from "fflate";
import { briefSchema, type Brief } from "./validation";

/* ==========================================================================
   Shareable runs, with no database.

   The generator is a pure function of the brief: seeded PRNG only, no
   Math.random and no Date.now anywhere under lib/generate. So a link does not
   need to carry the RESULT — it carries the INPUT, and the recipient's browser
   rebuilds pages that are identical to the sender's, byte for byte.

   That is why this app still has no storage layer. A stored-result design would
   need a database, a retention policy and a way to serve images; this needs a
   URL.

   TWO THINGS TO KNOW.

   Reference images are not in the link. Their pixels never reach the mockups
   anyway — the generator reads only `palette` and `layout` off them, and the
   artwork is drawn from scratch. So the hints travel and the megabytes do not.

   Determinism is the whole mechanism, so it is a constraint on future work: the
   moment page generation calls a model, the same link stops reproducing the same
   pages. At that point a link has to carry a result id instead, and that is when
   this app needs storage — not before.
   ========================================================================== */

export type SharedRun = {
  brief: Brief;
  variants: Record<string, number>;
  notes: Record<string, string>;
};

/** Bumped if the payload shape ever changes, so an old link fails cleanly
    instead of decoding into something subtly wrong. */
const FORMAT = 1;

export const SHARE_PARAM = "r";

/** Links much past this get mangled by chat apps and email clients, which wrap
    or truncate them. We warn rather than silently produce a broken link. */
export const SAFE_URL_LENGTH = 2000;

type Payload = {
  v: number;
  b: unknown;
  /** variants and notes, omitted entirely when empty */
  s?: Record<string, number>;
  n?: Record<string, string>;
};

/* ---- base64url ----------------------------------------------------------- */

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  // Chunked: String.fromCharCode(...bytes) blows the argument limit on big inputs.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* ---- encode -------------------------------------------------------------- */

/** Strips everything the generator never reads. `url` is an object URL, dead
    the moment the tab closes; `dataUrl` is a downscaled copy nothing consumes. */
function slimBrief(brief: Brief): unknown {
  return {
    ...brief,
    referenceImages: brief.referenceImages.map((img) => ({
      id: img.id,
      name: img.name,
      url: "",
      palette: img.palette,
      layout: img.layout,
      type: img.type,
      size: img.size,
    })),
  };
}

export function encodeRun(run: SharedRun): string {
  const payload: Payload = { v: FORMAT, b: slimBrief(run.brief) };
  if (Object.keys(run.variants).length) payload.s = run.variants;
  if (Object.keys(run.notes).length) payload.n = run.notes;

  return toBase64Url(
    deflateSync(strToU8(JSON.stringify(payload)), { level: 9 }),
  );
}

/** The full link, or null when there is nothing to share yet. */
export function shareUrl(run: SharedRun, origin: string, path: string): string {
  return `${origin}${path}#${SHARE_PARAM}=${encodeRun(run)}`;
}

/* ---- decode -------------------------------------------------------------- */

export type DecodeResult =
  | { ok: true; run: SharedRun }
  | { ok: false; reason: string };

export function decodeRun(encoded: string): DecodeResult {
  let payload: Payload;
  try {
    payload = JSON.parse(
      strFromU8(inflateSync(fromBase64Url(encoded))),
    ) as Payload;
  } catch {
    return { ok: false, reason: "This link is damaged or incomplete." };
  }

  if (payload?.v !== FORMAT)
    return { ok: false, reason: "This link was made by an older version." };

  /* Validated, not trusted. The payload came off a URL, so it is user input
     however friendly the sender was. */
  const parsed = briefSchema.safeParse(payload.b);
  if (!parsed.success)
    return { ok: false, reason: "This link does not contain a valid brief." };

  return {
    ok: true,
    run: {
      brief: parsed.data,
      variants: sanitizeNumbers(payload.s),
      notes: sanitizeStrings(payload.n),
    },
  };
}

function sanitizeNumbers(input: unknown): Record<string, number> {
  if (!input || typeof input !== "object") return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 1000)
      out[k] = v;
  }
  return out;
}

function sanitizeStrings(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim()) out[k] = v.slice(0, 400);
  }
  return out;
}

/** Reads a run out of `location.hash` and removes it, so a reload does not
    re-apply the link over whatever the user has done since. */
export function takeRunFromHash(): DecodeResult | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return null;

  const encoded = new URLSearchParams(hash).get(SHARE_PARAM);
  if (!encoded) return null;

  window.history.replaceState(
    null,
    "",
    window.location.pathname + window.location.search,
  );
  return decodeRun(encoded);
}
