import "server-only";

/* ==========================================================================
   A sliding-window rate limit, in memory.

   One Node process serves the site (a VPS behind nginx), so memory is the
   whole truth; a second instance would only make each limit per-instance,
   which is looser, never wrong.

   BOUNDED. A flood of distinct keys (random cookies, rotating IPs) must not
   grow the map forever or make every request walk it: past MAX_KEYS the
   oldest keys are dropped — a Map iterates in insertion order, and a key is
   re-inserted on each hit, so the first ones are the least recently used.
   ========================================================================== */

const MAX_KEYS = 20_000;
const hits = new Map<string, number[]>();

/** Records a hit for `key` and says whether it is now over `max` in `windowMs`. */
export function rateLimited(key: string, max: number, windowMs = 60_000): boolean {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.delete(key);
  hits.set(key, list);
  if (hits.size > MAX_KEYS) {
    for (const k of hits.keys()) {
      hits.delete(k);
      if (hits.size <= MAX_KEYS * 0.9) break;
    }
  }
  return list.length > max;
}

/** Whether `key` is already at `max` in `windowMs`, without counting a hit —
    for limits that count only failures. */
export function isRateLimited(key: string, max: number, windowMs = 60_000): boolean {
  const now = Date.now();
  return (hits.get(key) ?? []).filter((t) => now - t < windowMs).length >= max;
}

/** Forgets `key` — a successful sign-in clears its failures. */
export function clearRateLimit(key: string): void {
  hits.delete(key);
}

/**
 * The caller's IP as the proxy in front of us saw it.
 *
 * nginx's `$proxy_add_x_forwarded_for` APPENDS the address it received the
 * request from, so the LAST entry is the one a client cannot choose; the
 * first is whatever the client wrote. `X-Real-IP`, when nginx sets it, is
 * that same address.
 */
export function clientIp(req: Request): string {
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const fwd = req.headers.get("x-forwarded-for");
  const last = fwd?.split(",").map((s) => s.trim()).filter(Boolean).pop();
  return last || "unknown";
}
