/* ==========================================================================
   Deterministic randomness.

   Every mockup is generated from a seed derived from its pageId, so:
   - re-rendering a page (device switch, zoom, remount) never reshuffles it
   - "Regenerate this page" bumps a variant counter to get a DIFFERENT but
     still reproducible result

   Nothing here calls Math.random().
   ========================================================================== */

/** FNV-1a, 32-bit. Small, fast, good enough spread for layout choices. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export type Rng = {
  /** float in [0, 1) */
  next(): number;
  /** integer in [min, max] inclusive */
  int(min: number, max: number): number;
  /** true with probability p */
  bool(p?: number): boolean;
  pick<T>(items: readonly T[]): T;
  /** n distinct items (or all of them if n exceeds the list) */
  pickMany<T>(items: readonly T[], n: number): T[];
  shuffle<T>(items: readonly T[]): T[];
};

/** mulberry32 */
export function makeRng(seed: string | number): Rng {
  let state = (typeof seed === "number" ? seed : hashString(seed)) >>> 0;

  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (min: number, max: number) =>
    min + Math.floor(next() * (max - min + 1));

  const shuffle = <T,>(items: readonly T[]): T[] => {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = int(0, i);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };

  return {
    next,
    int,
    bool: (p = 0.5) => next() < p,
    pick: <T,>(items: readonly T[]) => items[int(0, items.length - 1)],
    pickMany: <T,>(items: readonly T[], n: number) =>
      shuffle(items).slice(0, Math.min(n, items.length)),
    shuffle,
  };
}

/** The seed string for one mockup. `variant` increments on regenerate. */
/** A per-page note is part of the seed, so the same note always reproduces the
    same page — which is what makes a shared link exact. */
export function pageSeed(pageId: string, variant = 0, note = ""): string {
  const salt = note.trim();
  return salt
    ? `${pageId}::v${variant}::n${hashString(salt).toString(36)}`
    : `${pageId}::v${variant}`;
}
