import "server-only";

import { serviceAccountEmail, sheetsWrite } from "@/lib/sheet";
import { db, getState, setState } from "./db";
import { TAB_SQL, tabCounts } from "./queries";
import { INTENT_LABEL, SEGMENTS, type UrspTarget } from "./types";

/* ==========================================================================
   The Upsell Responsive log sheet — what the screen shows, kept in a Google
   Sheet for the team, written by the same service account that reads Recap
   (shared with it as Editor). Tabs, made if missing:

     Tổng quan        the counts as the screen's tabs give them, now
     Theo ngày        one row per day (Vietnam time): the counts at that
                      day's last sync, so the sheet keeps the progress
     Đã gửi … Đã bỏ qua   one tab per tab of the screen, listing its rows —
                      the same rows, chosen by the same SQL (TAB_SQL)

   Written over on every sync — the sheet follows the screen, never the
   other way. A sync runs every five minutes from the timer and a few
   seconds after any button on the screen (scheduleSheetSync). No A/B.
   ========================================================================== */

export const LOG_SHEET_ID = process.env.URSP_LOG_SHEET_ID?.trim() || "1UwH2SZrDVPOlB-20RjVF5_GLddLqKy2vQORN0iN4Ys8";
export const LOG_SHEET_URL = `https://docs.google.com/spreadsheets/d/${LOG_SHEET_ID}/edit`;
const SA = () => process.env.URSP_SHEET_SA_JSON?.trim() || process.env.GOOGLE_SA_JSON?.trim() || null;
export const logSheetEmail = () => serviceAccountEmail(SA());

const TAB_SUMMARY = "Tổng quan";
const TAB_DAYS = "Theo ngày";
/* the first version's one list; it becomes Đã gửi */
const OLD_CASES = "Danh sách case";

/** One sheet tab per screen tab: its rows, newest first by the step that put them there. */
const LISTS: { title: string; tab: keyof typeof TAB_SQL; order: string }[] = [
  { title: "Đã gửi", tab: "sent", order: "t.sent_at desc nulls last" },
  { title: "Khách phản hồi", tab: "replied", order: "t.last_reply_at desc nulls last" },
  { title: "Đang xử lý", tab: "working", order: "t.working_at desc" },
  { title: "Đã xử lý", tab: "done", order: "t.done_at desc" },
  { title: "Kết thúc", tab: "closed", order: "t.closed_at desc" },
  { title: "Đã nâng cấp", tab: "upgraded", order: "t.upgraded_at desc" },
  { title: "Review 5★", tab: "review5", order: "t.review5_at desc" },
  { title: "Đã bỏ qua", tab: "dismissed", order: "t.dismissed_at desc" },
];

export type SheetLogState = { at: string; ok: boolean; cases?: number; error?: string };

const VN = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
const vn = (t: Date | string | null) => (t ? VN.format(new Date(t)) : "");

/** Where a case stands, the furthest step first — one word per row. */
function stage(t: UrspTarget): string {
  if (t.closed_at) return "Kết thúc";
  if (t.dismissed_at) return "Đã bỏ qua";
  if (t.done_at) return "Đã xử lý";
  if (t.working_at) return "Đang xử lý";
  if (t.replied_at) return "Khách phản hồi";
  if (t.read_at) return "Đã xem, chưa phản hồi";
  return "Chưa xem";
}

const SUMMARY_ROWS: { label: string; key: string; note: string }[] = [
  { label: "Đã gửi", key: "sent", note: "Số case đã gửi tin mời" },
  { label: "Khách phản hồi (tổng)", key: "replied_all", note: "Mọi store đã trả lời tin" },
  { label: "Khách phản hồi — chưa nhận xử lý", key: "replied", note: "Tab Khách phản hồi (như trên web)" },
  { label: "Đang xử lý", key: "working", note: "" },
  { label: "Đã xử lý", key: "done", note: "Đã xử lý xong, chưa kết thúc" },
  { label: "Kết thúc", key: "closed", note: "" },
  { label: "Đã nâng cấp", key: "upgraded", note: "Nâng cấp sau khi mình đã xử lý responsive" },
  { label: "Review 5★", key: "review5", note: "Đánh dấu Đã review 5★" },
  { label: "Đã bỏ qua", key: "dismissed", note: "Gồm cả case huỷ khi đang xử lý" },
];

const CASE_HEADER = [
  "Store",
  "Tên store",
  "Phân khúc",
  "Trạng thái",
  "PIC",
  "Gửi lúc",
  "Đã xem",
  "Phản hồi lúc",
  "Số tin khách",
  "Khách nói",
  "Tin khách gần nhất",
  "Bắt đầu xử lý",
  "Xử lý xong",
  "Kết thúc",
  "Nâng cấp lúc",
  "Nâng cấp lên",
  "Review 5★",
  "Bỏ qua lúc",
  "Lý do bỏ qua",
  "Ticket Crisp",
];

const caseRow = (t: UrspTarget) => [
  t.store_domain,
  t.store_name ?? "",
  SEGMENTS[t.segment]?.label ?? t.segment,
  stage(t),
  t.pic ?? "",
  vn(t.sent_at),
  vn(t.read_at),
  vn(t.replied_at),
  t.replies || "",
  t.reply_intent ? (INTENT_LABEL[t.reply_intent] ?? t.reply_intent) : "",
  (t.last_reply_text ?? "").replace(/\s+/g, " ").trim().slice(0, 500),
  vn(t.working_at),
  vn(t.done_at),
  vn(t.closed_at),
  vn(t.upgraded_at),
  [t.upgraded_to, t.upgraded_price ? `$${Number(t.upgraded_price)}` : ""].filter(Boolean).join(" · "),
  vn(t.review5_at),
  vn(t.dismissed_at),
  t.dismiss_reason ?? "",
  t.ticket_link ?? "",
];

async function ensureTabs(sa: string): Promise<void> {
  const meta = await sheetsWrite<{ sheets: { properties: { sheetId: number; title: string } }[] }>(LOG_SHEET_ID, "?fields=sheets.properties(sheetId,title)", sa, undefined, "GET");
  const byTitle = new Map(meta.sheets.map((s) => [s.properties.title, s.properties.sheetId]));
  const requests: unknown[] = [];
  const rename = (from: string, to: string) => {
    if (byTitle.has(to) || !byTitle.has(from)) return;
    requests.push({ updateSheetProperties: { properties: { sheetId: byTitle.get(from), title: to }, fields: "title" } });
    byTitle.set(to, byTitle.get(from)!);
    byTitle.delete(from);
  };
  /* a new file's empty Sheet1 becomes Tổng quan rather than sitting there blank */
  rename("Sheet1", TAB_SUMMARY);
  rename(OLD_CASES, LISTS[0].title);
  for (const title of [TAB_SUMMARY, TAB_DAYS, ...LISTS.map((l) => l.title)])
    if (!byTitle.has(title)) requests.push({ addSheet: { properties: { title, gridProperties: { frozenRowCount: 1 } } } });
  if (requests.length) await sheetsWrite(LOG_SHEET_ID, ":batchUpdate", sa, { requests });
}

let running: Promise<SheetLogState> | null = null;

/** Writes the sheet from the database now. One at a time; the state is kept for the screen. */
export function syncSheetLog(): Promise<SheetLogState> {
  if (!running) running = sync().finally(() => (running = null));
  return running;
}

async function sync(): Promise<SheetLogState> {
  const sa = SA();
  if (!sa) {
    const s: SheetLogState = { at: new Date().toISOString(), ok: false, error: "Server chưa có service account (URSP_SHEET_SA_JSON)." };
    await setState("sheet_log", s);
    return s;
  }
  try {
    await ensureTabs(sa);
    const p = await db();
    const [counts, extra, ...lists] = await Promise.all([
      tabCounts(),
      p.query<{ replied_all: number }>("select count(*) filter (where status = 'sent' and replied_at is not null)::int as replied_all from ursp_targets"),
      ...LISTS.map((l) => p.query<UrspTarget>(`select * from ursp_targets t where ${TAB_SQL[l.tab]} order by ${l.order}, t.id desc`)),
    ]);
    const n: Record<string, number> = { ...counts, ...extra.rows[0] };
    const now = new Date();
    const today = vn(now).slice(0, 10);

    /* Theo ngày: today's row is written over, a new day gets a new one */
    const days = await sheetsWrite<{ values?: string[][] }>(LOG_SHEET_ID, `/values/${encodeURIComponent(`${TAB_DAYS}!A:A`)}`, sa, undefined, "GET");
    const col = days.values ?? [];
    let dayRow = col.findIndex((r, i) => i > 0 && r[0] === today) + 1;
    if (dayRow === 0) dayRow = Math.max(col.length, 1) + 1;

    await sheetsWrite(LOG_SHEET_ID, "/values:batchClear", sa, { ranges: [`${TAB_SUMMARY}!A1:D30`, ...LISTS.map((l) => `'${l.title}'!A2:Z`)] });
    await sheetsWrite(LOG_SHEET_ID, "/values:batchUpdate", sa, {
      /* RAW: a store name starting with = is text, never a formula */
      valueInputOption: "RAW",
      data: [
        {
          range: `${TAB_SUMMARY}!A1`,
          values: [
            ["Upsell Responsive", "", `Cập nhật lúc ${vn(now)} (giờ VN)`],
            [],
            ["Chỉ số", "Số lượng", "Ghi chú"],
            ...SUMMARY_ROWS.map((r) => [r.label, n[r.key] ?? 0, r.note]),
            [],
            ["Danh sách từng case: xem các tab Đã gửi, Khách phản hồi, Đang xử lý, Đã xử lý, Kết thúc, Đã nâng cấp, Review 5★, Đã bỏ qua."],
          ],
        },
        { range: `${TAB_DAYS}!A1`, values: [["Ngày", ...SUMMARY_ROWS.map((r) => r.label), "Cập nhật lúc"]] },
        { range: `${TAB_DAYS}!A${dayRow}`, values: [[today, ...SUMMARY_ROWS.map((r) => n[r.key] ?? 0), vn(now)]] },
        ...LISTS.map((l, i) => ({ range: `'${l.title}'!A1`, values: [CASE_HEADER, ...lists[i].rows.map(caseRow)] })),
      ],
    });
    const cases = lists[0].rows.length;
    const s: SheetLogState = { at: now.toISOString(), ok: true, cases };
    await setState("sheet_log", s);
    return s;
  } catch (err) {
    const s: SheetLogState = { at: new Date().toISOString(), ok: false, error: err instanceof Error ? err.message : String(err) };
    await setState("sheet_log", s).catch(() => undefined);
    return s;
  }
}

/* ---- when ---------------------------------------------------------------- */

const EVERY_MS = 5 * 60_000;
let soon: ReturnType<typeof setTimeout> | null = null;

/** After a button on the screen: one sync a few seconds later, however many presses. */
export function scheduleSheetSync(): void {
  if (soon) return;
  soon = setTimeout(() => {
    soon = null;
    void syncSheetLog();
  }, 8_000);
  soon.unref?.();
}

/** From the timer's tick: a sync when the last one is five minutes old. */
export async function sheetSyncTick(): Promise<void> {
  const last = await getState<SheetLogState>("sheet_log");
  if (last && Date.now() - new Date(last.at).getTime() < EVERY_MS) return;
  await syncSheetLog();
}
