import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/* ==========================================================================
   Sessions.

   Signed, not stored: a cookie holds the domain and an HMAC of it, so any API
   route can trust who is calling without a session table. Tampering fails the
   signature check.

   SESSION_SECRET is REQUIRED in production and there is deliberately no
   fallback. A hardcoded default would sit in a public repository, and anyone who
   read it could mint themselves an admin cookie. Failing closed with a clear
   message is the only honest option.

   What this is NOT: authentication of the merchant. Signing in only asks for a
   store domain, so anyone who knows an allowlisted domain can get in. That is
   the specified design and it is fine for a gated beta, but it is an allowlist,
   not a login, and should not be treated as one.
   ========================================================================== */

const STORE_COOKIE = "pfd_store";
const ADMIN_COOKIE = "pfd_admin";

/** Long enough that a merchant is not signed out mid-session, short enough that
    a shared computer does not stay signed in for ever. */
const STORE_MAX_AGE = 60 * 60 * 24 * 30;
const ADMIN_MAX_AGE = 60 * 60 * 12;

export class MissingSecretError extends Error {
  constructor() {
    super(
      "SESSION_SECRET is not set. Generate one (openssl rand -base64 32) and add " +
        "it to the environment — sessions cannot be signed without it.",
    );
    this.name = "MissingSecretError";
  }
}

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (value && value.length >= 16) return value;
  if (process.env.NODE_ENV === "production") throw new MissingSecretError();
  /* Development only, and clearly marked as such. It never ships: production
     throws above rather than reaching this line. */
  return "pfd-development-only-secret";
}

export function hasSessionSecret(): boolean {
  const value = process.env.SESSION_SECRET;
  return Boolean(value && value.length >= 16) || process.env.NODE_ENV !== "production";
}

/* ---- sign / verify ------------------------------------------------------- */

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function seal(data: unknown): string {
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function unseal<T>(token: string | undefined, maxAgeSeconds: number): T | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;

  const payload = token.slice(0, dot);
  const provided = token.slice(dot + 1);
  const expected = sign(payload);

  /* Constant-time compare. A plain === leaks how much of the signature matched,
     which is enough to forge one byte at a time. */
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      iat?: number;
    };
    // Expiry is enforced here as well as by the cookie: a cookie's own maxAge is
    // set by the browser and a copied cookie value would otherwise last for ever.
    if (typeof data.iat !== "number") return null;
    if ((Date.now() - data.iat) / 1000 > maxAgeSeconds) return null;
    return data as T;
  } catch {
    return null;
  }
}

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  secure: process.env.NODE_ENV === "production",
} as const;

/* ---- store session ------------------------------------------------------- */

export type StoreSession = { domain: string; iat: number };

export async function setStoreSession(domain: string): Promise<void> {
  const jar = await cookies();
  jar.set(STORE_COOKIE, seal({ domain, iat: Date.now() }), {
    ...COOKIE_OPTIONS,
    maxAge: STORE_MAX_AGE,
  });
}

export async function readStoreSession(): Promise<StoreSession | null> {
  const jar = await cookies();
  return unseal<StoreSession>(jar.get(STORE_COOKIE)?.value, STORE_MAX_AGE);
}

export async function clearStoreSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(STORE_COOKIE);
}

/* ---- admin session ------------------------------------------------------- */

export async function setAdminSession(): Promise<void> {
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, seal({ admin: true, iat: Date.now() }), {
    ...COOKIE_OPTIONS,
    maxAge: ADMIN_MAX_AGE,
  });
}

export async function readAdminSession(): Promise<boolean> {
  const jar = await cookies();
  return unseal<{ admin: boolean }>(jar.get(ADMIN_COOKIE)?.value, ADMIN_MAX_AGE)
    ?.admin === true;
}

export async function clearAdminSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(ADMIN_COOKIE);
}

/* ---- admin credentials --------------------------------------------------- */

/**
 * Checked server-side only, so the values never reach the browser bundle.
 *
 * The defaults are the ones specified for launch. They are weak and shared, so
 * ADMIN_USERNAME / ADMIN_PASSWORD override them without a code change — set them
 * before this is reachable by anyone outside the team.
 */
export function checkAdminCredentials(
  username: string,
  password: string,
): boolean {
  const expectedUser = process.env.ADMIN_USERNAME ?? "admin";
  const expectedPass = process.env.ADMIN_PASSWORD ?? "pf123456";

  // Compared in constant time, and hashed first so the compare is length-safe.
  const digest = (value: string) =>
    createHmac("sha256", "pfd-credential-compare").update(value).digest();

  return (
    timingSafeEqual(digest(username), digest(expectedUser)) &&
    timingSafeEqual(digest(password), digest(expectedPass))
  );
}

export const COOKIE_NAMES = { store: STORE_COOKIE, admin: ADMIN_COOKIE };
