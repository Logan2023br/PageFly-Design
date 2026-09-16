import type { AnalyticsView, Slice } from "@/app/api/admin/analytics/route";

/* ==========================================================================
   Two windows of the same length, and what actually changed between them.

   THE HARD PART IS NOT THE SUBTRACTION. It is refusing to call three events a
   trend. This product's numbers are small — a month with 114 landings has four
   completed builds — and a percentage computed over four is a percentage that
   moves 25 points when one person changes their mind. A summary that reports
   "+300%" on a base of one teaches its reader to ignore it, and once ignored it
   never gets read again.

   So every figure here carries whether it is worth believing, and the ones that
   are not are kept and labelled rather than hidden. "Too few to say" is a real
   answer and the only honest one at this volume; dropping those rows would let
   a reader assume the metric was flat.

   RATES MATTER MORE THAN COUNTS, and they are the reason this file bothers with
   the funnel gaps. If traffic doubles and exports double, every count is up and
   nothing improved. The share that got from one step to the next is the number
   that says whether the product got better, and it is the number a reader
   cannot compute in their head from two tiles.
   ========================================================================== */

/** Which way is good news. Everything not named here reads better going up. */
const HIGHER_IS_WORSE = new Set([
  /* sign-in and register outcomes that are not the outcome anybody wanted */
  "not_registered",
  "invalid_format",
  "server_error",
  "validation_error",
  /* which field the register form refused — a rise is more people blocked */
  "domain",
  "store_name",
  "email",
  /* builds */
  "failed",
  "cancelled",
]);

/**
 * The smallest window either side can have before a percentage means anything.
 *
 * Eight, measured against this product rather than chosen from a book: a month
 * of real traffic puts the funnel's narrow end — builds started, builds
 * finished — in single figures, and at five events one person's afternoon is a
 * forty-percent swing. Below this the row still appears, marked, because a
 * reader who sees nothing assumes nothing moved.
 */
const MIN_VOLUME = 8;

/** Under this, a count has not really moved — three presses is three presses. */
const MIN_DELTA = 3;

/** And under this, a percentage change is inside the noise at this scale. */
const MIN_PCT = 0.2;

/** A rate has to move this many POINTS to count. 41% → 44% is not a finding. */
const MIN_POINTS = 5;

export type Verdict = "good" | "bad" | "thin" | "flat";

export type Change = {
  key: string;
  label: string;
  /** which block of the screen this came from, so a reader can go and look */
  group: string;
  now: number;
  before: number;
  delta: number;
  /** null when the earlier window was zero — a share of nothing is not a share */
  pct: number | null;
  higherIsBetter: boolean;
  verdict: Verdict;
  /** counts print as integers; rates print as percentages and move in points */
  unit: "count" | "rate";
};

export type Comparison = {
  days: number;
  /** improving, and big enough to believe — most improved first */
  good: Change[];
  /** the same, going the wrong way */
  bad: Change[];
  /** moved, but over numbers too small to read anything into */
  thin: Change[];
  /**
   * Looked at, and unchanged.
   *
   * The LIST rather than a count, because a count cannot be inspected — and
   * the flat rows are where the interesting silence lives: a conversion rate
   * that held while traffic doubled is the finding, and it is flat.
   */
  flat: Change[];
  /** one sentence for the top of the block */
  headline: string;
};

function rank(c: Change): number {
  /* Ordered by how far it moved, not by percentage. At this volume a percentage
     ranks a 1→4 above a 40→52, and the second is the one worth reading. */
  return c.unit === "rate" ? Math.abs(c.delta) : Math.abs(c.delta);
}

function judge(
  now: number,
  before: number,
  higherIsBetter: boolean,
  unit: "count" | "rate",
): { verdict: Verdict; pct: number | null } {
  const delta = now - before;
  const pct = before > 0 ? delta / before : null;

  if (delta === 0) return { verdict: "flat", pct };

  if (unit === "rate") {
    /* A rate's own value is already a percentage; what matters is how many
       points it moved, and whether there was enough underneath it to trust. */
    if (Math.abs(delta) < MIN_POINTS) return { verdict: "flat", pct };
    const better = higherIsBetter ? delta > 0 : delta < 0;
    return { verdict: better ? "good" : "bad", pct };
  }

  /* Both sides small: the movement may be real and it is still not readable. */
  if (Math.max(now, before) < MIN_VOLUME) return { verdict: "thin", pct };
  /* Big enough to see, but barely moved. */
  if (Math.abs(delta) < MIN_DELTA && (pct === null || Math.abs(pct) < MIN_PCT))
    return { verdict: "flat", pct };

  const better = higherIsBetter ? delta > 0 : delta < 0;
  return { verdict: better ? "good" : "bad", pct };
}

function change(
  key: string,
  label: string,
  group: string,
  now: number,
  before: number,
  unit: "count" | "rate" = "count",
  higherIsBetterOverride?: boolean,
): Change {
  const higherIsBetter = higherIsBetterOverride ?? !HIGHER_IS_WORSE.has(key);
  const { verdict, pct } = judge(now, before, higherIsBetter, unit);
  return {
    key,
    label,
    group,
    now,
    before,
    delta: now - before,
    pct,
    higherIsBetter,
    verdict,
    unit,
  };
}

/** Pair two slice lists by key, keeping anything present on either side. */
function pairSlices(now: Slice[], before: Slice[], group: string): Change[] {
  const was = new Map(before.map((s) => [s.key, s.count]));
  const out = now.map((s) => change(s.key, s.label, group, s.count, was.get(s.key) ?? 0));
  /* A value that existed before and has since gone to zero is a change, and
     the naive walk over `now` alone would drop it silently. */
  const has = new Set(now.map((s) => s.key));
  for (const s of before)
    if (!has.has(s.key)) out.push(change(s.key, s.label, group, 0, s.count));
  return out;
}

export function compareViews(now: AnalyticsView, before: AnalyticsView): Comparison {
  const all: Change[] = [];

  /* ---- the funnel, as counts -------------------------------------------- */
  const wasStep = new Map(before.funnel.map((s) => [s.key, s.events]));
  for (const step of now.funnel)
    all.push(change(step.key, step.label, "Funnel", step.events, wasStep.get(step.key) ?? 0));

  /* ---- the funnel, as the share that got through ------------------------
     The gaps, which is where a decision lives. A count can rise because more
     people arrived; only the share says the product got better at keeping
     them. Skipped where either window is too thin underneath to divide by. */
  const rateAt = (view: AnalyticsView, i: number): number | null => {
    const above = view.funnel[i - 1]?.events ?? 0;
    const here = view.funnel[i]?.events ?? 0;
    if (above < MIN_VOLUME) return null;
    return Math.round((here / above) * 100);
  };
  for (let i = 1; i < now.funnel.length; i++) {
    const a = rateAt(now, i);
    const b = rateAt(before, i);
    if (a === null || b === null) continue;
    all.push(
      change(
        `rate_${now.funnel[i].key}`,
        `${now.funnel[i - 1].label} → ${now.funnel[i].label}`,
        "Tỉ lệ chuyển tiếp",
        a,
        b,
        "rate",
        true,
      ),
    );
  }

  /* ---- outcomes ---------------------------------------------------------- */
  all.push(...pairSlices(now.signin, before.signin, "Sign-in"));
  all.push(...pairSlices(now.registerResults, before.registerResults, "Register"));
  all.push(...pairSlices(now.registerFields, before.registerFields, "Register · lỗi trường"));
  all.push(...pairSlices(now.cta, before.cta, "CTA"));

  /* ---- builds ------------------------------------------------------------ */
  for (const k of ["started", "completed", "failed", "cancelled"] as const)
    all.push(
      change(
        k,
        { started: "Bắt đầu build", completed: "Build xong", failed: "Build hỏng", cancelled: "Build bị huỷ" }[k],
        "Builds",
        now.builds[k],
        before.builds[k],
      ),
    );

  /* ---- elements that live on more than one screen ------------------------ */
  const wasShared = new Map(before.shared.map((s) => [s.key, s.total]));
  for (const s of now.shared)
    all.push(change(s.key, s.title, "Toàn sản phẩm", s.total, wasShared.get(s.key) ?? 0));

  /* ---- everything measured on one screen --------------------------------- */
  const wasMetric = new Map<string, number>();
  for (const p of before.pages) for (const m of p.metrics) wasMetric.set(`${p.key}:${m.key}`, m.count);
  for (const p of now.pages)
    for (const m of p.metrics)
      all.push(change(m.key, m.label, p.title, m.count, wasMetric.get(`${p.key}:${m.key}`) ?? 0));

  /* A figure that was zero in both windows is not a measurement that held
     steady — it is a thing that has never happened. Counting those as "flat"
     put four never-started builds into a tally the reader would take as "four
     metrics I checked", which is the kind of padding that makes a summary feel
     thorough while telling them less. */
  const moved = all.filter((c) => !(c.now === 0 && c.before === 0));

  const good = moved.filter((c) => c.verdict === "good").sort((a, b) => rank(b) - rank(a));
  const bad = moved.filter((c) => c.verdict === "bad").sort((a, b) => rank(b) - rank(a));
  const thin = moved.filter((c) => c.verdict === "thin").sort((a, b) => rank(b) - rank(a));
  const flat = moved.filter((c) => c.verdict === "flat");

  /* The sentence at the top, and it has to be able to say "nothing". A summary
     that always finds a story is a summary that invents one. */
  let headline: string;
  if (good.length === 0 && bad.length === 0)
    headline =
      thin.length > 0
        ? `Không có chỉ số nào thay đổi đủ lớn để kết luận — ${thin.length} chỉ số có dịch chuyển nhưng trên số liệu quá nhỏ.`
        : "Hai kỳ gần như giống hệt nhau.";
  else if (bad.length === 0)
    headline = `${good.length} chỉ số cải thiện, không chỉ số nào đi xuống.`;
  else if (good.length === 0)
    headline = `${bad.length} chỉ số đi xuống, không chỉ số nào cải thiện.`;
  else headline = `${good.length} chỉ số cải thiện, ${bad.length} chỉ số đi xuống.`;

  return { days: now.days, good, bad, thin, flat, headline };
}
