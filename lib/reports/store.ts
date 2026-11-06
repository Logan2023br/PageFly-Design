import "server-only";

import { db as upsellDb, hasUpsellDatabase } from "@/lib/upsell/db";
import { computeReport, firstSentAt } from "./compute";
import { REPORT_UPSELLS, addWeeks, weekIsOver, weekOf, weekStartAt, type Report, type ReportData, type ReportUpsell } from "./defs";

/* ==========================================================================
   Saved weekly reports. Each Monday at 01:00 Vietnam time the week that just
   ended is worked out once per upsell and kept as it was then — a report
   does not change later on its own; "Tạo lại" makes it again from today's
   data. On the first run the weeks before are made too (up to HISTORY), so
   there is a history to look back on.

   The timer checks every 10 minutes and makes only what is missing, so a
   server that was down at 01:00 catches up when it comes back, and two
   servers at once write the same row once (on conflict do nothing).
   ========================================================================== */

const HISTORY = 12;
const TICK_MS = 10 * 60_000;
/** Monday 01:00, Vietnam time: one hour into the week. */
const DUE_AFTER_MS = 3_600_000;

const SCHEMA = `
create table if not exists upsell_reports (
  upsell       text not null,
  week         date not null,
  data         jsonb not null,
  generated_at timestamptz not null default now(),
  generated_by text not null,
  primary key (upsell, week)
);`;

let ensured: Promise<void> | null = null;
async function db() {
  const p = await upsellDb();
  if (!ensured)
    ensured = p.query(SCHEMA).then(
      () => undefined,
      (err) => {
        ensured = null;
        throw err;
      },
    );
  await ensured;
  return p;
}

/** For tests: a fresh database gets the table again. */
export function resetReportSchema(): void {
  ensured = null;
}

type DbRow = { upsell: ReportUpsell; week: string | Date; data: ReportData; generated_at: Date; generated_by: string };
const shape = (r: DbRow): Report => ({
  upsell: r.upsell,
  week: typeof r.week === "string" ? r.week.slice(0, 10) : weekOf(new Date(r.week.getTime() + 12 * 3_600_000)),
  data: r.data,
  generated_at: new Date(r.generated_at).toISOString(),
  generated_by: r.generated_by,
});

/** The saved reports of one upsell, newest week first. */
export async function listReports(upsell: ReportUpsell): Promise<Report[]> {
  const { rows } = await (await db()).query<DbRow>(
    "select upsell, to_char(week, 'YYYY-MM-DD') as week, data, generated_at, generated_by from upsell_reports where upsell = $1 order by week desc",
    [upsell],
  );
  return rows.map(shape);
}

export async function getReport(upsell: ReportUpsell, week: string): Promise<Report | null> {
  const { rows } = await (await db()).query<DbRow>(
    "select upsell, to_char(week, 'YYYY-MM-DD') as week, data, generated_at, generated_by from upsell_reports where upsell = $1 and week = $2::date",
    [upsell, week],
  );
  return rows[0] ? shape(rows[0]) : null;
}

/** A week's report, worked out now and not saved: this week so far, or one no one made yet. */
export async function liveReport(upsell: ReportUpsell, week: string): Promise<Report> {
  return { upsell, week, data: await computeReport(upsell, week), generated_at: new Date().toISOString(), generated_by: "live", live: true };
}

/** Work a finished week out and save it; `replace` makes it again over the saved one. */
export async function saveReport(upsell: ReportUpsell, week: string, by: string, replace = false): Promise<Report | null> {
  if (!weekIsOver(week)) return null;
  const data = await computeReport(upsell, week);
  const { rows } = await (await db()).query<DbRow>(
    `insert into upsell_reports (upsell, week, data, generated_by) values ($1, $2::date, $3, $4)
     on conflict (upsell, week) do ${replace ? "update set data = excluded.data, generated_at = now(), generated_by = excluded.generated_by" : "nothing"}
     returning upsell, to_char(week, 'YYYY-MM-DD') as week, data, generated_at, generated_by`,
    [upsell, week, JSON.stringify(data), by],
  );
  return rows[0] ? shape(rows[0]) : getReport(upsell, week);
}

/** The finished weeks that should have a report and have none — oldest first. */
async function missingWeeks(upsell: ReportUpsell, now: Date): Promise<string[]> {
  const current = weekOf(now);
  if (now.getTime() < weekStartAt(current).getTime() + DUE_AFTER_MS) return []; // Monday before 01:00: wait
  const first = await firstSentAt(upsell);
  if (!first) return [];
  const last = addWeeks(current, -1);
  let from = weekOf(first);
  if (from < addWeeks(last, -(HISTORY - 1))) from = addWeeks(last, -(HISTORY - 1));
  const have = new Set((await listReports(upsell)).map((r) => r.week));
  const out: string[] = [];
  for (let w = from; w <= last; w = addWeeks(w, 1)) if (!have.has(w)) out.push(w);
  return out;
}

/** What the timer does: every missing finished week, every upsell. */
export async function runDueReports(now = new Date()): Promise<{ upsell: ReportUpsell; week: string }[]> {
  const made: { upsell: ReportUpsell; week: string }[] = [];
  for (const upsell of REPORT_UPSELLS)
    for (const week of await missingWeeks(upsell, now)) {
      await saveReport(upsell, week, "auto");
      made.push({ upsell, week });
    }
  return made;
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startReportTimer(): void {
  if (timer || !hasUpsellDatabase() || process.env.REPORTS_DISABLE_TIMER === "1") return;
  const tick = () =>
    runDueReports().then(
      (made) => made.length && console.log(`[reports] made ${made.map((m) => `${m.upsell} ${m.week}`).join(", ")}`),
      (err) => console.error("[reports] tick failed:", err instanceof Error ? err.message : err),
    );
  setTimeout(tick, 90_000);
  timer = setInterval(tick, TICK_MS);
  timer.unref?.();
}
