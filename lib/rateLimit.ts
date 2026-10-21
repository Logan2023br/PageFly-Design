import "server-only";

/* ==========================================================================
   Sliding-window rate limits, in memory.

   One Node process serves the site (a VPS behind nginx), so memory is the
   whole truth; a second instance would only make each limit per-instance,
   which is looser, never wrong.

   ONE MAP PER PURPOSE. A shared map lets a flood of cheap keys in one place
   (anonymous page events, each with a fresh cookie) push out the keys that
   matter in another (sign-in failures) — wiping a brute-force count on
   demand. So sign-in limits live in their own limiter, and each limiter is
   bounded by evicting EXPIRED entries first, and only then the oldest.
   ========================================================================== */

export type Limiter = {
  /** Records a hit for `key`; true when it is now over `max` in `windowMs`. */
  hit(key: string, max: number, windowMs?: number): boolean;
  /** Whether `key` is already at `max`, without recording anything. */
  isLimited(key: string, max: number, windowMs?: number): boolean;
  /** Forgets `key` — a successful sign-in clears its failures. */
  clear(key: string): void;
};

export function createLimiter(maxKeys: number, longestWindowMs: number): Limiter {
  const hits = new Map<string, number[]>();
  const live = (key: string, windowMs: number, now: number) => (hits.get(key) ?? []).filter((t) => now - t < windowMs);

  const evict = (now: number) => {
    if (hits.size <= maxKeys) return;
    for (const [k, v] of hits) if (now - v[v.length - 1] >= longestWindowMs) hits.delete(k);
    for (const k of hits.keys()) {
      if (hits.size <= maxKeys * 0.9) break;
      hits.delete(k);
    }
  };

  return {
    hit(key, max, windowMs = 60_000) {
      const now = Date.now();
      const list = live(key, windowMs, now);
      list.push(now);
      hits.delete(key);
      hits.set(key, list);
      evict(now);
      return list.length > max;
    },
    isLimited(key, max, windowMs = 60_000) {
      return live(key, windowMs, Date.now()).length >= max;
    },
    clear(key) {
      hits.delete(key);
    },
  };
}

/** For anonymous traffic: page events, conversions. */
const general = createLimiter(20_000, 60 * 60 * 1000);
/** For sign-in only. Nothing anonymous and cheap writes here. */
export const signInLimits = createLimiter(50_000, 15 * 60 * 1000);

export const rateLimited = (key: string, max: number, windowMs = 60_000): boolean => general.hit(key, max, windowMs);

/**
 * The caller's IP as the proxy in front of us saw it.
 *
 * WHICH HEADER IS A DEPLOYMENT FACT, so it is configured: TRUSTED_IP_HEADER
 * names the one header the proxy OVERWRITES with the address it received the
 * connection from (nginx: `proxy_set_header X-Real-IP $remote_addr;`). A
 * header the proxy only passes through is the client's to write, and any limit
 * keyed on it is a limit the client chooses.
 *
 * Unset, the last X-Forwarded-For hop is used: nginx's
 * `$proxy_add_x_forwarded_for` appends the connecting address, so the last
 * entry is the one the client could not write.
 */
export function clientIp(req: Request): string {
  const header = process.env.TRUSTED_IP_HEADER?.trim().toLowerCase();
  if (header && header !== "x-forwarded-for") return req.headers.get(header)?.split(",").pop()?.trim() || "unknown";
  const fwd = req.headers.get("x-forwarded-for");
  const last = fwd?.split(",").map((s) => s.trim()).filter(Boolean).pop();
  return last || "unknown";
}
