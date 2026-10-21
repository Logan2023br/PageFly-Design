import "server-only";

import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cache } from "react";
import { ALL_ADMIN_SECTIONS, type AdminSection } from "./adminSections";
import { getRepo } from "./db";
import { normalizeDomain } from "./sheet";
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

/**
 * A key derived from the platform's own project identifiers.
 *
 * This is what makes serverless work with nothing configured. Every instance of a
 * deployment sees the same VERCEL_PROJECT_ID, so all of them derive the same key
 * and a cookie signed by one verifies on the next — which a key generated into a
 * per-instance /tmp can never do.
 *
 * It is NOT a secret in the strict sense: anyone with access to the Vercel project
 * can read those identifiers. It is not published by this app, and someone with
 * project access already has more power than forging a cookie would give them, so
 * it is a real improvement over signing with a value that changes per instance.
 * SESSION_SECRET still wins wherever it is set, and /api/health keeps saying so.
 */
function derivedKey(): string | null {
  const parts = [
    process.env.VERCEL_PROJECT_ID,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_ENV,
  ].filter(Boolean);
  if (parts.length === 0) return null;

  return createHmac("sha256", "pfd-derived-session-key-v1")
    .update(parts.join("|"))
    .digest("base64url");
}

export type KeySource = "env" | "derived" | "file" | "ephemeral";

let cached: string | null = null;
let source: KeySource | null = null;

function secret(): string {
  const configured = process.env.SESSION_SECRET;
  if (configured && configured.length >= 16) {
    source = "env";
    return configured;
  }

  if (cached) return cached;

  /* Order matters, and it is different per host. On serverless the derived key is
     tried FIRST: a file in /tmp belongs to one instance, so preferring it there
     would sign cookies nobody else can verify. On a real server the file is the
     better answer — it is a true random secret and it survives restarts. */
  const onServerless = Boolean(process.env.VERCEL);

  if (onServerless) {
    const derived = derivedKey();
    if (derived) {
      cached = derived;
      source = "derived";
      return cached;
    }
  }

  const file = secretFile();
  try {
    if (existsSync(file)) {
      const stored = readFileSync(file, "utf8").trim();
      if (stored.length >= 16) {
        cached = stored;
        source = "file";
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
    cached = generated;
    source = "file";
    return cached;
  } catch {
    // Read-only filesystem and no derived key available.
  }

  const derived = derivedKey();
  if (derived) {
    cached = derived;
    source = "derived";
    return cached;
  }

  /* Last resort: usable within this module instance only. Sessions will fail
     across instances, which hasStableSecret() reports. */
  cached = generated;
  source = "ephemeral";
  return cached;
}

/** Where the signing key came from, for diagnostics. */
export function keySource(): KeySource {
  secret();
  return source ?? "ephemeral";
}

/**
 * True when the signing key is stable across restarts.
 *
 * Establishes the key first rather than only looking for the file. Checking for a
 * file that is created lazily reported "could not be written anywhere" on a
 * healthy deployment where simply nothing had needed a key yet.
 */
export function hasStableSecret(): boolean {
  const from = keySource();
  /* "file" is stable on a server with a disk; on serverless the file path is a
     per-instance /tmp, so it is not. */
  if (from === "file") return !process.env.VERCEL;
  return from === "env" || from === "derived";
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

/* ==========================================================================
   INVITE LINKS.

   /?login=<domain>&name=…&email=…&t=<token> creates a store and signs somebody
   in, so the link is a credential and has to be unforgeable. `t` is an HMAC of
   the domain under the same secret the session cookie uses — n8n asks the
   server for a link, the secret never leaves this process, and a link issued
   for one store is refused on every other.

   THE DOMAIN IS SIGNED, NOT THE NAME OR THE EMAIL. Those two are only used to
   fill in a store that does not exist yet, and neither grants anything: a
   forged name is a wrong label on a store the signature already permitted.
   Signing them too would mean a link broke whenever a mail client rewrote a
   space in the name.

   Normalised before signing and before checking, because a link comes back
   through mail clients that add schemes, trailing slashes and capitals — and
   `shop.myshopify.com` and `HTTPS://Shop.myshopify.com/` are the same store.
   ========================================================================== */

/** Thirty days. Long enough for someone who opens their mail late, short
    enough that a link in an old inbox stops being a key eventually. */
export const INVITE_MAX_AGE = 30 * 24 * 60 * 60;

/* ==========================================================================
   FEEDBACK LINKS ARE SIGNED. /customer-feedback writes a review with no
   session behind it; with only ?domain= anyone could rate any store — and,
   since the first review stands, take the real merchant's turn. The link an
   admin hands out carries this token, which names its domain; a review is
   taken only with a token for that domain. A purpose field (`fb`) keeps it
   from being read as any other kind of token.
   ========================================================================== */
export const FEEDBACK_MAX_AGE = 180 * 24 * 60 * 60;

export function signFeedback(domain: string): string {
  return seal({ fb: normalizeDomain(domain), iat: Date.now() });
}

export function verifyFeedback(token: string | undefined, domain: string): boolean {
  const data = unseal<{ fb?: string }>(token, FEEDBACK_MAX_AGE);
  return data?.fb !== undefined && data.fb === normalizeDomain(domain);
}

export function signInvite(domain: string): string {
  /* `iat` is the caller's job — `unseal` refuses a payload without one, and
     that is what makes the age check below possible at all. */
  return seal({ d: normalizeDomain(domain), iat: Date.now() });
}

/**
 * Is this token one we issued FOR THIS DOMAIN, and still young enough?
 *
 * Both halves matter. A valid token for another store is the forgery this
 * exists to stop, so the domain is compared as well as the signature.
 */
export function verifyInvite(
  token: string | undefined,
  domain: string,
  maxAgeSeconds: number = INVITE_MAX_AGE,
): boolean {
  const data = unseal<{ d?: string }>(token, maxAgeSeconds);
  return data?.d !== undefined && data.d === normalizeDomain(domain);
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

/* ---- referral program session -------------------------------------------- */

/* A member of the referral program on /collection-pages/referral. Its own
   cookie, not the store session: joining the program is not signing in to
   PageFly Design, and signing out of one must not sign anybody out of the
   other. Holds the member's id only — everything else is read fresh, so an
   admin pausing a member takes effect on their next request. */
const REFERRAL_COOKIE = "pfd_referral";
const REFERRAL_MAX_AGE = 60 * 60 * 24 * 60;

export async function setReferralSession(memberId: string): Promise<void> {
  const jar = await cookies();
  jar.set(REFERRAL_COOKIE, seal({ mid: memberId, iat: Date.now() }), {
    ...COOKIE_OPTIONS,
    maxAge: REFERRAL_MAX_AGE,
  });
}

export async function readReferralSession(): Promise<string | null> {
  const jar = await cookies();
  return unseal<{ mid: string }>(jar.get(REFERRAL_COOKIE)?.value, REFERRAL_MAX_AGE)?.mid ?? null;
}

export async function clearReferralSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(REFERRAL_COOKIE);
}

/* ---- admin session ------------------------------------------------------- */

/**
 * `username` is who signed in, kept so a review can say who made it. A cookie
 * from before it was recorded still verifies — it just has no name.
 *
 * `account` is set for a sign-in made on the Accounts screen, and is what its
 * permissions are looked up by on every request; without it the sign-in is
 * the owner's (ADMIN_USERNAME), which opens every section.
 */
/* ==========================================================================
   A CHANGED PASSWORD ENDS THE SESSIONS IT OPENED.

   The cookie carries a short fingerprint of the credential it was issued for
   (`pv`) — the account's stored hash, or the owner's configured pair — and
   every read compares it with the current one. Change the password (or the
   owner's ADMIN_PASSWORD) and every cookie signed in with the old one stops
   working on its next request, instead of living out its twelve hours.
   ========================================================================== */
const fingerprint = (value: string) => createHash("sha256").update(`pfd-admin-pv|${value}`).digest("base64url").slice(0, 16);

export function ownerFingerprint(): string {
  return fingerprint(`owner|${process.env.ADMIN_USERNAME ?? "admin"}|${process.env.ADMIN_PASSWORD ?? "pf123456"}`);
}

export function accountFingerprint(passwordHash: string): string {
  return fingerprint(`account|${passwordHash}`);
}

export async function setAdminSession(username?: string, account?: string, pv?: string): Promise<void> {
  const jar = await cookies();
  jar.set(
    ADMIN_COOKIE,
    seal({ admin: true, u: username?.slice(0, 120), acct: account, pv, iat: Date.now() }),
    { ...COOKIE_OPTIONS, maxAge: ADMIN_MAX_AGE },
  );
}

export type AdminIdentity = {
  username: string | null;
  /** null for the owner, who is configured rather than stored */
  accountId: string | null;
  sections: AdminSection[];
};

/**
 * Who is signed in to admin, and what they may open — or null.
 *
 * AN ACCOUNT IS READ FRESH, not from the cookie: deleting an account or taking
 * a section away holds from its next request, not when its cookie runs out.
 * Cached for the request, so a page and its guards cost one lookup.
 */
export const readAdmin = cache(async (): Promise<AdminIdentity | null> => {
  const jar = await cookies();
  const data = unseal<{ admin: boolean; u?: string; acct?: string; pv?: string }>(
    jar.get(ADMIN_COOKIE)?.value,
    ADMIN_MAX_AGE,
  );
  if (data?.admin !== true) return null;
  if (!data.acct) {
    if (data.pv !== ownerFingerprint()) return null;
    return { username: data.u ?? null, accountId: null, sections: ALL_ADMIN_SECTIONS };
  }
  const account = await getRepo()
    .getAdminAccount(data.acct)
    .catch(() => null);
  if (!account || data.pv !== accountFingerprint(account.passwordHash)) return null;
  return { username: account.username, accountId: account.id, sections: account.sections };
});

/** Signed in to admin at all — for what any admin may do, like seeing a hidden
    set's preview. A section's own screens and API ask `readAdminSection`. */
export async function readAdminSession(): Promise<boolean> {
  return (await readAdmin()) !== null;
}

/** Signed in AND given this section. */
export async function readAdminSection(section: AdminSection): Promise<boolean> {
  return (await readAdmin())?.sections.includes(section) ?? false;
}

export async function readAdminName(): Promise<string | null> {
  return (await readAdmin())?.username ?? null;
}

export async function clearAdminSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(ADMIN_COOKIE);
}

/* ---- admin credentials --------------------------------------------------- */

/**
 * Checked server-side only, so the values never reach the browser bundle.
 *
 * The defaults are for local development only. They are in a public
 * repository, so IN PRODUCTION THERE ARE NONE: with ADMIN_USERNAME or
 * ADMIN_PASSWORD unset there, owner sign-in is simply off (admin accounts still
 * sign in), rather than open to "admin / pf123456".
 */
export function checkAdminCredentials(
  username: string,
  password: string,
): boolean {
  const production = process.env.NODE_ENV === "production";
  if (production && (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD)) return false;
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

/* ---- admin account passwords -------------------------------------------- */

/** `scrypt$<salt>$<hash>`, both base64url. */
export function hashAdminPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export function verifyAdminPassword(password: string, stored: string): boolean {
  const [kind, salt, hash] = stored.split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const given = scryptSync(password, Buffer.from(salt, "base64url"), expected.length);
  return timingSafeEqual(given, expected);
}

/** A hash nobody's password matches, verified against when the username is
    unknown, so a wrong username takes as long as a wrong password. */
export const DECOY_ADMIN_HASH = hashAdminPassword(randomBytes(16).toString("hex"));

export const COOKIE_NAMES = { store: STORE_COOKIE, admin: ADMIN_COOKIE };
