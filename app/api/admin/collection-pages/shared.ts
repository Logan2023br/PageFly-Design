import { z } from "zod";
import { RESERVED_PAGE_SLUGS, RESERVED_SET_SLUGS, SLUG_RE } from "@/lib/collectionPages";
import { CollectionSlugTakenError } from "@/lib/db/types";
import { readAdminSession } from "@/lib/session";

/* What every /api/admin/collection-pages route shares: the guard, the answer
   shapes, and the field rules. */

export type Fail = { ok: false; error: string };

export async function guard(): Promise<Response | null> {
  if (await readAdminSession()) return null;
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
