import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { cookies } from "next/headers";

/* ==========================================================================
   Sessions.

   Signed, not stored: a cookie holds the domain and an HMAC of it, so any API
   route can trust who is calling without a session table. Tampering fails the
   signature check.

   SESSION_SECRET should be set. When it is not, one is generated and written to a
   file beside the data store — never a hardcoded default, because that would sit
   in a public repository and anyone who read it could mint themselves an admin
   cookie.

   THE FILE IS NOT OPTIONAL. A per-process random value looked equivalent and was
   not: a server component and a route handler are separate module instances with
   separate copies of this module, so signing in produced a cookie signed with one
   random key and the page that rendered next verified it against a different one.
   Every session failed, but only on the pages that read it — /design still
   answered 200 with no account, which made it look like a routing problem. Any
   secret that is not shared between module instances is not a secret, it is a
   coin flip.

   Where the file lives decides how long a session lasts. On a server with a real
   disk it survives restarts. On serverless it is per-instance and per-lifetime, so
   sign-ins do not survive a redeploy — which is a reason to set SESSION_SECRET,
   not a reason to refuse to run without it.

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

/** Beside the data store, so both live or die together. */
function secretFile(): string {
  const explicit = process.env.PFD_SECRET_FILE;
  if (explicit) return explicit;

  const dataFile =
    process.env.PFD_DB_FILE ??
    process.env.PFD_DEV_DB ??
    (process.env.VERCEL ? "/tmp/pfd-store.json" : ".pfd-dev-db.json");
  return join(dirname(dataFile), ".pfd-session-secret");
}

let cached: string | null = null;

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (value && value.length >= 16) return value;
  if (cached) return cached;

  const file = secretFile();
  try {
    if (existsSync(file)) {
      const stored = readFileSync(file, "utf8").trim();
      if (stored.length >= 16) {
        cached = stored;
        return cached;
      }
    }
  } catch {
    // Unreadable — fall through and try to write a fresh one.
  }

  const generated = randomBytes(32).toString("base64url");
  try {
    mkdirSync(dirname(file), { recursive: true });
    /* Owner-only. This is the key that signs admin sessions. */
    writeFileSync(file, generated, { mode: 0o600 });
  } catch {
    /* Read-only filesystem. Sessions then work only within this module instance,
       which is the broken case described above — but returning something is still
       better than throwing at sign-in. hasSessionSecret() reports the risk. */
  }

  cached = generated;
  return cached;
}

/** True when the signing key is stable across instances and restarts. */
export function hasStableSecret(): boolean {
  if (hasSessionSecret()) return true;
  try {
    return existsSync(secretFile());
  } catch {
    return false;
  }
}

/** True when SESSION_SECRET is properly set, so sessions survive a restart. */
export function hasSessionSecret(): boolean {
  const value = process.env.SESSION_SECRET;
  return Boolean(value && value.length >= 16);
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
