/* ==========================================================================
   The one element whose correctness depends on the calendar.

   Every other check in the audit is decidable from the tree alone. A
   `countdown` is not: `2026-11-24T23:59:00Z` is a working Black Friday timer
   in September and four zeros in December, and the tree looks identical.

   HOW A DEAD TIMER GETS BUILT. The contract and the stage-2 prompt each carry
   one worked example, and it is that Black Friday instant. Neither prompt says
   what day it is. A model with no clock, shown one date, writes that date —
   and once the date passes, every page built afterwards carries a timer that
   has already finished.

   The schema does not object: its rule for `endsAt` is that `Date.parse` does
   not return NaN, which a date in 1999 satisfies. Nothing downstream objects
   either — `toPagefly` hands the instant to PageFly's COUNTDOWN and PageFly
   renders exactly what it was given.

   NEAR IS ALSO WRONG. A timer ending in four minutes is not a sale, it is a
   number that hits zero while the page is being read. Fifteen minutes is the
   floor: below it the model has misunderstood the brief rather than mistyped
   a date, and a real flash sale clears it comfortably.

   `now` is a parameter, not a call, so the audit is a pure function of its
   input and the test does not depend on the day it runs.
   ========================================================================== */

/** Under this and the timer finishes while the page is still being read. */
const TOO_SOON_MS = 15 * 60 * 1000;

/**
 * One actionable line per thing wrong with a `countdown` node — empty for
 * every other node, and for a timer whose date is far enough out to count.
 */
export function countdownProblems(node: Record<string, unknown>, now: number): string[] {
  if (node?.type !== "countdown") return [];

  const endsAt = node.endsAt;
  if (typeof endsAt !== "string" || endsAt.trim() === "")
    return [`a countdown has no "endsAt" — it needs an ISO instant to count to`];

  const at = Date.parse(endsAt);
  if (Number.isNaN(at))
    return [`countdown "endsAt" is "${endsAt}", which is not a date — use an ISO instant like 2026-12-25T23:59:00Z`];

  if (at <= now)
    return [`countdown "endsAt" is ${endsAt}, which has already passed — it renders as zeros. Use a date after ${new Date(now).toISOString().slice(0, 10)}`];

  if (at - now < TOO_SOON_MS)
    return [`countdown "endsAt" is ${endsAt}, under fifteen minutes away — it finishes while the page is being read`];

  return [];
}

/* --------------------------------------------------------------------------
   The other half: a model cannot pick a sensible date without knowing the
   date. This line goes in the USER prompt of both stages, never the system
   prefix — the contract is the cached prefix, and a date in it would miss the
   cache on the first build of every day for no benefit.
   -------------------------------------------------------------------------- */

/** Today, for the prompt — so a `countdown` can be dated from the real calendar. */
export function todayLine(now: number = Date.now()): string {
  const iso = new Date(now).toISOString().slice(0, 10);
  return `TODAY IS ${iso}. Any date you write — a countdown's "endsAt", a sale ending, a shipping cut-off — must be after it.`;
}
