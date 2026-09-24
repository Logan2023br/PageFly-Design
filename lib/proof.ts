import "server-only";

import { getRepo } from "./db";

/* ==========================================================================
   WHAT OTHER MERCHANTS DID, FOR A VISITOR WHO HAS NOT DECIDED.

   The front door already carries four figures under the hero. A figure is a
   claim; this is a witness — one store, one thing it did, one moment. The two
   do different work and the second is the one a visitor believes, because it is
   specific.

   THE NAME NEVER LEAVES THIS FILE. `mask` runs on the server and the domain is
   not in what the route returns — not shortened on the client, not hidden with
   CSS, not sent at all. A masked name assembled in the browser is a masked name
   anybody can read in the network tab, which is the same as not masking it.

   WHAT COUNTS AS TRUE ENOUGH TO SHOW. A store with no pages built has done
   nothing worth reporting, and a review is only shown when somebody actually
   wrote one — a rating with no sentence is a number, and the figures above
   already carry the numbers. `/api/showcase` states the same rule for its
   counts and gives the reason: a front door claiming something before it is
   true is the one thing a visitor cannot un-notice.

   AND IT IS ALLOWED TO BE EMPTY. A new deployment has no stores and no reviews.
   The caller renders nothing rather than inventing a merchant, which is the
   same contract every other section on that page keeps.
   ========================================================================== */

/** One line the toast can show. Nothing here identifies anybody. */
export type ProofItem =
  | { kind: "review"; who: string; stars: number; said: string }
  | { kind: "built"; who: string; pages: number };

/**
 * The first few characters and nothing else.
 *
 * FOUR, because three is often the whole of a short word and a visitor reading
 * `lo***` learns that somebody's name began with two letters. Four keeps the
 * shape of a name — enough to read as a person rather than as a placeholder —
 * while leaving a store unfindable from it.
 *
 * The suffix is dropped first: `bright-candles.myshopify.com` is one store's
 * name plus a platform's, and the platform's half is the same on every row.
 */
/**
 * Raises the first LETTER, and nothing else.
 *
 * Most names reach the card in lower case: `storeName` is usually null and the
 * fallback is the domain, which Shopify stores lower-cased. So the corner read
 * `brig***` and `quie***` beside the one store that happened to have a
 * capitalised name on file — a card that looks unfinished rather than one that
 * looks anonymous, which is the opposite of what the masking is for.
 *
 * The first LETTER rather than the first character, because a name beginning
 * on a digit (`3d-prints`) has nothing to raise in position zero, and
 * `toUpperCase` on a digit is a silent no-op that would leave that row alone.
 * And exactly one letter: a sentence somebody typed is theirs, and raising all
 * of it would be shouting on their behalf.
 */
function upperFirst(s: string): string {
  return s.replace(/^([^\p{L}]*)(\p{L})/u, (_, lead: string, c: string) => lead + c.toUpperCase());
}

export function mask(name: string): string {
  const stem = name
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\.myshopify\.com$/i, "")
    .replace(/\..*$/, "")
    .trim();
  if (!stem) return "***";
  /* A name shorter than the window is not padded up to it — `Jo***` says what
     it can and nothing more. */
  return `${upperFirst(stem.slice(0, 4))}***`;
}

/** Shown in full or not at all: a sentence cut mid-word reads as a fault. */
const MAX_SAID = 120;

export async function proofFeed(): Promise<ProofItem[]> {
  let stores;
  try {
    stores = await getRepo().listStoreSummaries();
  } catch {
    /* No database yet, or a driver that cannot answer. The toast shows
       nothing, which is the honest answer to "who else uses this". */
    return [];
  }

  const items: ProofItem[] = [];

  for (const s of stores) {
    /* A store refused at sign-in is not a customer to point at. */
    if (s.blocked) continue;

    const who = mask(s.storeName?.trim() || s.domain);

    /* A review is a sentence somebody wrote. A rating with no words is a
       number, and the strip above this already carries the numbers. */
    const said = s.review?.comment?.trim();
    if (said && s.review && s.review.stars >= 4)
      items.push({
        kind: "review",
        who,
        stars: s.review.stars,
        said: upperFirst(said.length > MAX_SAID ? `${said.slice(0, MAX_SAID).trimEnd()}…` : said),
      });

    /* And what they did, which is the commoner row: most stores build and
       never review. */
    if (s.pagesUsed > 0) items.push({ kind: "built", who, pages: s.pagesUsed });
  }

  return items;
}
