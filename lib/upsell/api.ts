import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { readAdminName, readAdminSection } from "@/lib/session";
import { rateLimited } from "./track";
import { UpsellError } from "./types";

/* ==========================================================================
   What every upsell route shares: the key check, the admin check, and one
   way of turning an error into a response.
   ========================================================================== */

export const json = (body: unknown, status = 200) => Response.json(body, { status });

/** X-API-Key against UPSELL_API_KEY, constant time. No key configured means
    every call is refused — never "open because nobody set it". */
export function apiKeyOk(req: Request): boolean {
  const expected = process.env.UPSELL_API_KEY ?? "";
  const given = req.headers.get("x-api-key") ?? "";
  if (expected.length < 16 || !given) return false;
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/** null when the caller may proceed, else the response to send. 300 a minute
    per key, which an hourly script run never comes near and a loop does. */
export function requireKey(req: Request): Response | null {
  if (!apiKeyOk(req)) return json({ error: "Invalid or missing X-API-Key." }, 401);
  const key = createHash("sha256").update(req.headers.get("x-api-key") ?? "").digest("hex").slice(0, 16);
  if (rateLimited(`key:${key}`, 300)) return json({ error: "Rate limit: 300 requests a minute." }, 429);
  return null;
}

export async function requireAdmin(): Promise<Response | null> {
  if (await readAdminSection("upsell")) return null;
  return json({ ok: false, error: "Not signed in." }, 401);
}

/** Either credential: the Builder (key) or an admin (cookie). */
export async function keyOrAdmin(req: Request): Promise<{ who: "key" | "admin" } | Response> {
  if (req.headers.get("x-api-key")) {
    const denied = requireKey(req);
    return denied ?? { who: "key" };
  }
  if (await readAdminSection("upsell")) return { who: "admin" };
  return json({ error: "Invalid or missing X-API-Key." }, 401);
}

export async function adminActor(): Promise<string> {
  return `admin:${(await readAdminName()) ?? "admin"}`;
}

export function fail(err: unknown): Response {
  if (err instanceof UpsellError) return json({ ok: false, error: err.message }, err.status);
  console.error("[upsell]", err);
  return json({ ok: false, error: "Server error — try again." }, 500);
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    // fall through
  }
  throw new UpsellError("The body must be a JSON object.", 400);
}

export function list(body: Record<string, unknown>, key: string): unknown[] {
  const v = body[key];
  if (!Array.isArray(v)) throw new UpsellError(`Expected { "${key}": [ … ] }.`, 400);
  if (v.length > 1000) throw new UpsellError(`At most 1000 ${key} per request.`, 413);
  return v;
}
