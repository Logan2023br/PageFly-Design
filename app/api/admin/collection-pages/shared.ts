import { z } from "zod";
import { RESERVED_PAGE_SLUGS, RESERVED_SET_SLUGS, SLUG_RE } from "@/lib/collectionPages";
import { CollectionSlugTakenError } from "@/lib/db/types";
import { readAdminSection } from "@/lib/session";
import { keyMatches } from "@/lib/upsell/api";
import { rateLimited } from "@/lib/upsell/track";

/* What every /api/admin/collection-pages route shares: the guard, the answer
   shapes, and the field rules. */

export type Fail = { ok: false; error: string };

export async function guard(): Promise<Response | null> {
  if (await readAdminSection("collections")) return null;
  return Response.json({ ok: false, error: "Not signed in." } satisfies Fail, { status: 401 });
}

/* TODO: xoá fallback này sau khi đặt COLLECTIONS_API_KEY trong .env trên VPS.
   Until then a server without COLLECTIONS_API_KEY accepts the one key whose
   SHA-256 (hex) this is — only the hash is here, never the key. */
export const COLLECTIONS_API_KEY_SHA256_FALLBACK =
  "1c2dd4255bc9488b9046ae31cb6445988d63c5821849158bdb592581131b7942";

/* The review runner's key: X-API-Key against COLLECTIONS_API_KEY, or the
   fallback hash above while that is unset. It opens four things and nothing
   else: the set list, a .pagefly on a page that already exists, "Claude"
   taking and finishing a review, and the Claude Review run's progress. Creating, deleting, pricing and hiding still
   need the admin cookie. */
export function scriptKeyOk(request: Request): boolean {
  return keyMatches(
    request.headers.get("x-api-key") ?? "",
    process.env.COLLECTIONS_API_KEY ?? "",
    COLLECTIONS_API_KEY_SHA256_FALLBACK,
  );
}

/** "admin" for the cookie, "script" for the key, or the response to send. */
export async function guardOrKey(request: Request): Promise<"admin" | "script" | Response> {
  if (await readAdminSection("collections")) return "admin";
  if (scriptKeyOk(request)) {
    if (rateLimited("collections-key", 300)) return fail("Rate limit: 300 requests a minute.", 429);
    return "script";
  }
  return Response.json({ ok: false, error: "Not signed in." } satisfies Fail, { status: 401 });
}

/* Claude Build's own key: X-API-Key against CLAUDE_BUILD_API_KEY, accepted
   only by the claude-build routes. It is separate from COLLECTIONS_API_KEY so
   the build routine and the review routine never share or rotate a key
   together. */
/* TODO: xoá fallback này sau khi đặt CLAUDE_BUILD_API_KEY trong .env trên VPS.
   Until then a server without CLAUDE_BUILD_API_KEY accepts the one key whose
   SHA-256 (hex) this is — only the hash is here, never the key. */
export const CLAUDE_BUILD_API_KEY_SHA256_FALLBACK =
  "06b21a8ab6891d54c3f51b65882bb2f3ec96ba8d4c16e2660c6debe0e6c61330";

export function buildKeyOk(request: Request): boolean {
  return keyMatches(
    request.headers.get("x-api-key") ?? "",
    process.env.CLAUDE_BUILD_API_KEY ?? "",
    CLAUDE_BUILD_API_KEY_SHA256_FALLBACK,
  );
}

export async function buildGuardOrKey(request: Request): Promise<"admin" | "script" | Response> {
  if (await readAdminSection("collections")) return "admin";
  if (buildKeyOk(request)) {
    if (rateLimited("claude-build-key", 300)) return fail("Rate limit: 300 requests a minute.", 429);
    return "script";
  }
  return Response.json({ ok: false, error: "Not signed in." } satisfies Fail, { status: 401 });
}

export const fail = (error: string, status = 400) =>
  Response.json({ ok: false, error } satisfies Fail, { status });

/** A slug clash is the operator's to fix, so it is a 409 naming the slug. */
export function failFrom(err: unknown): Response {
  if (err instanceof CollectionSlugTakenError) return fail(err.message, 409);
  console.error("[collection-pages]", err);
  return fail("Could not save — try again.", 500);
}

export const slug = z
  .string()
  .trim()
  .min(1, "The URL is empty.")
  .max(60)
  .regex(SLUG_RE, "The URL may use a–z, 0–9 and dashes only.");

export const setSlug = slug.refine((s) => !RESERVED_SET_SLUGS.has(s), {
  message: "That URL is reserved.",
});

export const pageSlug = slug.refine((s) => !RESERVED_PAGE_SLUGS.has(s), {
  message: "That URL is reserved.",
});

export const settings = z
  .object({
    name: z.string().trim().min(1, "The name is empty.").max(80),
    slug: setSlug,
    blurb: z.string().trim().max(300).default(""),
    visibility: z.enum(["visible", "preview", "hidden"]),
    access: z.enum(["free", "paid"]),
    priceCents: z.number().int().min(0).max(100_000_000).nullable(),
    buyUrl: z
      .string()
      .trim()
      .max(500)
      .nullable()
      .transform((v) => (v ? v : null))
      .refine((v) => v === null || /^https?:\/\//i.test(v), "The buy link must start with http."),
  })
  .superRefine((v, ctx) => {
    /* A paid set with no price has nothing to show on its Buy button. */
    if (v.access === "paid" && (v.priceCents === null || v.priceCents <= 0)) {
      ctx.addIssue({ code: "custom", path: ["priceCents"], message: "A paid set needs a price." });
    }
  });

export function firstIssue(err: z.ZodError): string {
  return err.issues[0]?.message ?? "Invalid input.";
}
