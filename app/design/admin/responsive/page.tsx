import Link from "next/link";
import { AdminShell } from "@/components/admin/AdminShell";
import { ReportsLink } from "@/components/admin/reports/ReportsLink";
import { adminGate } from "@/components/admin/adminGate";
import { FIELD } from "@/components/admin/fieldClass";
import { CrispLink, Pill } from "@/components/admin/upsell/bits";
import { DoneButton, ModeSwitch, RecapBackfill, ReleaseB, QueueActions, RunControls, SendAnyway, SettingsForm, TrackButton } from "@/components/admin/ursp/Controls";
import { vnTime } from "@/lib/ucp2/core";
import { RECAP_SHEET_URL, composeMessage, recapServiceAccount, deadlineText, offerUntil, withDeadline, type ActiveResult, type BackfillState, type JobState, type RecapResult } from "@/lib/ursp/core";
import { getState, hasUrspDatabase } from "@/lib/ursp/db";
import {
  OUTCOME,
  SEEN,
  URSP_TABS,
  abBySegment,
  abStats,
  abVerdict,
  byDay,
  listTargets,
  recentRecapRows,
  segmentStats,
  tabCounts,
  type AbArm,
  type AbSegmentRow,
  type SegmentStats,
  type UrspFilters,
  type UrspTab,
} from "@/lib/ursp/queries";
import { URSP_HELP, URSP_NUMERIC, campaignOver, getUrspSettings, runState } from "@/lib/ursp/settings";
import { INTENT_LABEL, MOOD_LABEL, SEGMENTS, SKIP_REASONS, STATUS_LABEL, type Segment, type UrspTarget } from "@/lib/ursp/types";

/* /design/admin/responsive — Upsell Responsive: Logan offers BFMC customers
   a free review of their pages' responsive layout, and free fixes. Two
   segments — Recap (a new support ticket in the Recap sheet) and Active (a store
   active today that has not talked to support) — each with how many stores
   were found, left out and why, sent, and what came of it: read, replied,
   agreed, handled, upgraded, reviewed, how satisfied. */

export const metadata = { title: "Upsell Responsive — PageFly Design Admin" };
export const dynamic = "force-dynamic";

const HREF = "/design/admin/responsive";
const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 1000) / 10}%` : "—");
const short = (t: string | null) => (t ? vnTime(t).slice(5, 16) : "");
const SEG_TONE: Record<Segment, "primary" | "warn"> = { recap: "primary", active: "warn" };

export default async function UrspPage(props: PageProps<"/design/admin/responsive">) {
  const gate = await adminGate("ursp");
  if (gate) return gate;

  if (!hasUrspDatabase())
    return (
      <AdminShell current="ursp" title="Upsell Responsive">
        <p className="text-pf-muted">Cần Postgres (DATABASE_URL).</p>
      </AdminShell>
    );

  const sp = await props.searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return typeof v === "string" && v ? v : undefined;
  };
  const tab = (URSP_TABS.some((t) => t.id === one("tab")) ? one("tab") : "overview") as UrspTab;
  const f: UrspFilters = {
    q: one("q"),
    seg: one("seg"),
    from: one("from"),
    to: one("to"),
    reason: one("reason"),
    intent: one("intent"),
    mood: one("mood"),
    seen: one("seen"),
    variant: one("variant"),
    outcome: one("outcome"),
    open: one("open"),
    page: Number(one("page")) || 1,
  };
  const qs = (patch: Record<string, string | undefined>) => {
    const s = new URLSearchParams();
    for (const [k, v] of Object.entries({ tab, q: f.q, seg: f.seg, from: f.from, to: f.to, reason: f.reason, intent: f.intent, mood: f.mood, seen: f.seen, variant: f.variant, outcome: f.outcome, open: f.open, ...patch }))
      if (v && !(k === "tab" && v === "overview")) s.set(k, v);
    const t = s.toString();
    return t ? `${HREF}?${t}` : HREF;
  };

  const [run, cfg, counts, recap, active, job, backfill] = await Promise.all([
    runState(),
    getUrspSettings(),
    tabCounts(),
    getState<RecapResult>("recap"),
    getState<ActiveResult>("active"),
    getState<JobState>("job"),
    getState<BackfillState>("recap_backfill"),
  ]);

  let body: React.ReactNode;
  if (tab === "overview") {
    const [stats, days, recent, arms] = await Promise.all([segmentStats(f), byDay(), recentRecapRows(), abStats()]);
    const rate = (a: AbArm) => (a.sent ? `${((a.replied / a.sent) * 100).toFixed(1)}%` : "—");
    body = (
      <>
        {arms.A.sent + arms.B.sent + arms.B.held > 0 && (
          <Link href={`${HREF}?tab=ab`} className="flex flex-wrap items-center gap-2 rounded-pf-card border border-pf-border bg-pf-card px-4 py-2.5 text-[13px] transition-colors hover:border-pf-primary">
            <strong className="text-pf-text">A/B test:</strong>
            <Pill tone="primary">Bản A</Pill>
            <span className="text-pf-body">
              Đã gửi bản A: <b className="text-pf-text">{arms.A.sent}</b> · {rate(arms.A)} phản hồi
            </span>
            <Pill tone="ok">Bản B</Pill>
            <span className="text-pf-body">
              Đã gửi bản B: <b className="text-pf-text">{arms.B.sent}</b>
              {arms.B.sent ? ` · ${rate(arms.B)} phản hồi` : ""}
              {arms.B.held ? ` · ${arms.B.held} store đang giữ, chưa gửi` : ""}
            </span>
            <span className="ml-auto text-pf-primary-hi">Xem so sánh →</span>
          </Link>
        )}
        <AfterDone s={[stats.recap, stats.active]} sentA={arms.A.sent} sentB={arms.B.sent} />
        <div className="grid gap-4 xl:grid-cols-2">
          {(["recap", "active"] as const).map((seg) => (
            <SegmentPanel key={seg} seg={seg} s={stats[seg]} href={qs} />
          ))}
        </div>
        <Days rows={days} />
        <RecentRecap rows={recent} />
      </>
    );
  } else if (tab === "settings") {
    body = (
      <SettingsForm
        initial={cfg}
        help={URSP_HELP}
        numeric={URSP_NUMERIC}
        samples={{
          recap_template: withDeadline(composeMessage("recap", { store_name: "Sun Coast Elements", store_domain: "x.myshopify.com" }, { ...cfg, recap_template: "" }), offerUntil(cfg)),
          active_template: withDeadline(composeMessage("active", { store_name: "Sun Coast Elements", store_domain: "x.myshopify.com" }, { ...cfg, active_template: "" }), offerUntil(cfg)),
          followup_template: withDeadline(composeMessage("followup", { store_name: "Sun Coast Elements", store_domain: "x.myshopify.com" }, { ...cfg, followup_template: "" }), offerUntil(cfg)),
        }}
      />
    );
  } else if (tab === "ab") {
    const sample = { store_name: "Sun Coast Elements", store_domain: "x.myshopify.com" };
    const [arms, held, bySeg] = await Promise.all([abStats(), listTargets("ab", { ...f, page: f.page }), abBySegment()]);
    body = (
      <AbView
        arms={arms}
        bySeg={bySeg}
        held={held}
        heldHref={(p) => qs({ page: String(p) })}
        auto={cfg.mode === "auto"}
        split={cfg.ab_split === 1}
        messages={{
          A: withDeadline(composeMessage("recap", sample, cfg, "A"), offerUntil(cfg)),
          B: withDeadline(composeMessage("recap", sample, cfg, "B"), offerUntil(cfg)),
          fA: withDeadline(composeMessage("followup", sample, cfg, "A"), offerUntil(cfg)),
          fB: withDeadline(composeMessage("followup", sample, cfg, "B"), offerUntil(cfg)),
        }}
      />
    );
  } else if (tab === "queue") {
    const all = { ...f, page: 1 };
    const [pending, waiting, failed] = await Promise.all([
      listTargets("queue", { ...all, status: "pending" }),
      listTargets("queue", { ...all, status: "waiting" }),
      listTargets("queue", { ...all, status: "failed" }),
    ]);
    body = (
      <>
        <section className="grid gap-2 rounded-pf-card border border-pf-border bg-pf-card p-4">
          <h3 className="text-[13px] font-semibold text-pf-text">Chế độ gửi</h3>
          <ModeSwitch mode={cfg.mode} />
        </section>
        <QueueSection
          title="Chờ duyệt"
          note={`Tin mời và tin nhắc lại soạn sẵn, chờ bạn đọc / sửa rồi bấm Duyệt & gửi (chế độ Chờ duyệt). {deadline} trong tin mời được điền lúc gửi: ngày gửi + ${cfg.offer_days} ngày.`}
          list={pending}
          empty={cfg.mode === "auto" ? "Đang Tự động gửi — tin mới không vào đây." : "Không có tin nào chờ duyệt."}
        />
        <QueueSection
          title="Chờ gửi"
          note="Đã duyệt (hoặc tự động), sẽ gửi ở lần chạy tới — tin vào ticket support vừa có người nhắn thì đợi ticket yên rồi gửi."
          list={waiting}
          empty="Không có tin nào chờ gửi."
        />
        {failed.total > 0 && <QueueSection title="Lỗi gửi" note="Gửi không được — xem lỗi, bấm Gửi lại hoặc Bỏ qua." list={failed} empty="" />}
      </>
    );
  } else {
    const list = await listTargets(tab, f);
    const pager = <Pager list={list} href={(p) => qs({ page: String(p) })} />;
    body = (
      <>
        {pager}
        {tab === "skipped" ? <SkippedTable rows={list.rows} /> : <SentTable rows={list.rows} followupHours={cfg.followup_after_hours} />}
        {list.total > 0 && pager}
      </>
    );
  }

  return (
    <AdminShell
      current="ursp"
      title="Upsell Responsive"
      subtitle="Mùa BFMC: Logan mời khách review responsive mọi page + chỉnh sửa miễn phí. Phân khúc Recap (ticket support mới) và Active (store hoạt động hôm nay)."
      actions={
        <div className="flex flex-wrap items-start gap-2">
          <ReportsLink upsell="ursp" />
          <RunControls on={run.on} />
        </div>
      }
    >
      <div className="grid gap-4">
        <StatusBar run={run} cfg={cfg} over={campaignOver(cfg)} recap={recap} active={active} job={job} backfill={backfill} />
        <nav className="flex flex-wrap gap-1 border-b border-pf-border">
          {URSP_TABS.map((t) => {
            const n =
              t.id === "queue"
                ? counts.queue
                : t.id === "sent"
                  ? counts.sent
                  : t.id === "replied"
                    ? counts.replied
                    : t.id === "done"
                      ? counts.done
                      : t.id === "skipped"
                        ? counts.skipped
                        : t.id === "ab"
                          ? counts.ab
                          : undefined;
            const on = tab === t.id;
            return (
              <Link
                key={t.id}
                href={t.id === "overview" ? HREF : `${HREF}?tab=${t.id}`}
                className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] font-semibold ${on ? "border-pf-primary text-pf-text" : "border-transparent text-pf-muted hover:text-pf-text"}`}
              >
                {t.label}
                {n !== undefined && <span className="rounded-pf-pill bg-pf-card-hi px-1.5 text-[11px] text-pf-muted">{n}</span>}
                {(t.id === "sent" || t.id === "replied") && (
                  <span className="text-[11px] font-normal text-pf-faint">
                    <span className="text-pf-primary-hi">A {t.id === "sent" ? counts.sent_a : counts.replied_a}</span> ·{" "}
                    <span className="text-pf-success">B {t.id === "sent" ? counts.sent_b : counts.replied_b}</span>
                  </span>
                )}
                {t.id === "replied" && counts.replied_open > 0 && (
                  <span className="rounded-pf-pill bg-pf-warn/15 px-1.5 text-[11px] text-pf-warn" title="Đã phản hồi, chưa xử lý xong">
                    {counts.replied_open} chưa xử lý
                  </span>
                )}
                {t.id === "queue" && counts.pending > 0 && (
                  <span className="rounded-pf-pill bg-pf-primary/15 px-1.5 text-[11px] text-pf-primary-hi">{counts.pending} chờ duyệt</span>
                )}
              </Link>
            );
          })}
        </nav>
        {tab !== "settings" && tab !== "ab" && <Filters tab={tab} f={f} />}
        {body}
      </div>
    </AdminShell>
  );
}

/* ---------------------------------------------------------------- status */

function StatusBar({
  run,
  cfg,
  over,
  recap,
  active,
  job,
  backfill,
}: {
  run: Awaited<ReturnType<typeof runState>>;
  cfg: Awaited<ReturnType<typeof getUrspSettings>>;
  over: boolean;
  recap: RecapResult | null;
  active: ActiveResult | null;
  job: JobState | null;
  backfill: BackfillState | null;
}) {
  const sheetDirect = !!recapServiceAccount();
  return (
    <section className="grid gap-2 rounded-pf-card border border-pf-border bg-pf-card p-4 text-[12.5px] text-pf-body">
      <div className="flex flex-wrap items-center gap-2">
        {run.on ? <Pill tone="ok">● Đang chạy</Pill> : <Pill tone="warn">❚❚ Đang tạm dừng</Pill>}
        <span className="text-pf-muted">
          {run.on
            ? `từ ${short(run.at)} (${run.by.replace(/^admin:/, "")}) — chỉ xét row Recap / store mới từ lúc bấm Bắt đầu`
            : run.started_at
              ? `dừng lúc ${short(run.at)} (${run.by.replace(/^admin:/, "")}) — không đọc, không gửi, không theo dõi`
              : "chưa chạy lần nào — bấm Bắt đầu để chạy"}
        </span>
        <Pill tone={cfg.mode === "auto" ? "primary" : "muted"}>{cfg.mode === "auto" ? "Tự gửi" : "Chờ duyệt rồi gửi"}</Pill>
        <Pill tone="primary">Ưu đãi {cfg.offer_days} ngày từ lúc gửi</Pill>
        <Pill tone={over ? "bad" : "muted"}>
          {over ? "Hết hạn chương trình" : "Gửi tới hết"} {cfg.campaign_end.split("-").reverse().join("/")}
        </Pill>
        <Pill tone="muted">≤ {cfg.max_published_pages} page publish · Shopify trả phí</Pill>
      </div>
      <div className="grid gap-1 text-pf-muted">
        <p>
          <strong className="text-pf-text">Recap</strong>
          {!cfg.recap_enabled ? " — đang tắt" : ""}:{" "}
          {sheetDirect ? "đọc thẳng file Recap mỗi 5 phút" : "chờ n8n gửi row mới (POST /api/ursp/recap) — server chưa có quyền đọc sheet"} ·{" "}
          {recap
            ? `${short(recap.at)}: đọc ${recap.read} row, ${recap.added} mới, ${recap.responsive} vào danh sách, ${recap.targets} store${recap.cursor ? ` · tới dòng ${recap.cursor}` : ""}${recap.note ? ` · ${recap.note}` : ""}`
            : "chưa đọc"}{" "}
          ·{" "}
          <a href={RECAP_SHEET_URL} target="_blank" rel="noreferrer" className="text-pf-primary-hi hover:underline">
            Mở file Recap
          </a>
        </p>
        {sheetDirect && (
          <div className="grid gap-1 pl-4">
            <RecapBackfill defaultFrom={firstOfMonth()} />
            {backfill && (
              <p className={backfill.error ? "text-pf-warn" : ""}>
                {backfill.running
                  ? `Đang lấy row Recap từ ${backfill.from}${backfill.rows ? `: ${backfill.rows} row, ${backfill.stores} store…` : "…"}`
                  : backfill.error
                    ? `Lấy row Recap từ ${backfill.from} lỗi: ${backfill.error}`
                    : `Đã lấy row Recap từ ${backfill.from} (${short(backfill.at)}, ${backfill.by.replace(/^admin:/, "")}): ${backfill.rows} row, ${backfill.stores} store → ${backfill.result?.added ?? 0} row mới, ${backfill.result?.targets ?? 0} store vào danh sách${backfill.split ? ` · một nửa mỗi ngày: ${backfill.sent_half ?? 0} gửi (bản A), ${backfill.held_half ?? 0} giữ cho bản B` : ""}`}
              </p>
            )}
          </div>
        )}
        <p>
          <strong className="text-pf-text">Active</strong>
          {!cfg.active_enabled ? " — đang tắt" : ""}: quét AC2 mỗi giờ ·{" "}
          {active
            ? `${short(active.at)}: AC2 trả ${active.listed} store, ${active.active_today} hoạt động hôm nay${active.field ? ` (theo ${active.field})` : ""}, xét ${active.looked} store mới, ${active.targets} vào danh sách`
            : "chưa quét"}
          {active?.error && <span className="text-pf-warn"> · {active.error}</span>}
        </p>
        {active && active.listed > 0 && !active.field && (
          <p className="text-pf-warn">
            Không thấy trường thời gian hoạt động nào trong store của AC2 — sửa active_fields ở Cài đặt. AC2 có các trường: {active.keys.join(", ")}
          </p>
        )}
        {job && (
          <p>
            <strong className="text-pf-text">Lần chạy gần nhất</strong> {short(job.at)}: gửi {job.sent}, theo dõi {job.tracked} (còn {job.remaining} chờ)
            {job.errors.length > 0 && <span className="text-pf-warn"> · Lỗi: {job.errors.join("; ")}</span>}
          </p>
        )}
      </div>
    </section>
  );
}

function Filters({ tab, f }: { tab: UrspTab; f: UrspFilters }) {
  return (
    /* the reset gives fields `font: inherit`, which beats FIELD's text size: the form sets it */
    <form method="get" className="flex flex-wrap items-end gap-2 text-[13px]">
      {tab !== "overview" && <input type="hidden" name="tab" value={tab} />}
      <input name="q" defaultValue={f.q} placeholder="Domain, tên store, email…" className={`${FIELD} w-[220px]!`} aria-label="Tìm" />
      {tab !== "overview" && (
        <select name="seg" defaultValue={f.seg ?? ""} className={`${FIELD} w-[160px]!`} aria-label="Phân khúc">
          <option value="">Mọi phân khúc</option>
          <option value="recap">Recap</option>
          <option value="active">Active</option>
        </select>
      )}
      <label className="grid gap-0.5">
        <span className="text-[11px] text-pf-faint">Từ ngày</span>
        <input type="date" name="from" defaultValue={f.from} className={`${FIELD} w-[150px]!`} />
      </label>
      <label className="grid gap-0.5">
        <span className="text-[11px] text-pf-faint">Đến</span>
        <input type="date" name="to" defaultValue={f.to} className={`${FIELD} w-[150px]!`} />
      </label>
      {tab === "skipped" && (
        <select name="reason" defaultValue={f.reason ?? ""} className={`${FIELD} w-[240px]!`} aria-label="Lý do">
          <option value="">Mọi lý do</option>
          {Object.entries(SKIP_REASONS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      )}
      {(tab === "replied" || tab === "done" || tab === "sent") && (
        <>
          <select name="variant" defaultValue={f.variant ?? ""} className={`${FIELD} w-[150px]!`} aria-label="Bản tin">
            <option value="">Mọi bản tin</option>
            <option value="A">Bản A</option>
            <option value="B">Bản B</option>
          </select>
          <select name="outcome" defaultValue={f.outcome ?? ""} className={`${FIELD} w-[200px]!`} aria-label="Kết quả">
            <option value="">Mọi kết quả</option>
            {Object.entries(OUTCOME).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          <select name="seen" defaultValue={f.seen ?? ""} className={`${FIELD} w-[210px]!`} aria-label="Trạng thái xem">
            <option value="">Mọi trạng thái xem</option>
            {Object.entries(SEEN).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          <select name="intent" defaultValue={f.intent ?? ""} className={`${FIELD} w-[150px]!`} aria-label="Ý khách">
            <option value="">Mọi ý khách</option>
            {Object.entries(INTENT_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select name="mood" defaultValue={f.mood ?? ""} className={`${FIELD} w-[160px]!`} aria-label="Hài lòng">
            <option value="">Mọi mức hài lòng</option>
            {Object.entries(MOOD_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </>
      )}
      {tab === "replied" && (
        <label className="flex h-[38px] items-center gap-1.5 text-pf-muted">
          <input type="checkbox" name="open" value="1" defaultChecked={f.open === "1"} /> Chỉ chưa xử lý
        </label>
      )}
      <button type="submit" className="h-[38px] rounded-pf-md bg-pf-primary px-4 text-[13px] font-semibold text-white hover:bg-pf-primary-hi">
        Lọc
      </button>
      <Link href={tab === "overview" ? HREF : `${HREF}?tab=${tab}`} className="h-[38px] px-2 py-2 text-[12.5px] text-pf-faint hover:text-pf-text">
        Xoá lọc
      </Link>
    </form>
  );
}

/** The 1st of this month, Vietnam time — the backfill's default. */
const firstOfMonth = () => `${new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 7)}-01`;

/* ---------------------------------------------------------------- overview */

/** The goal: of the stores the team handled, how many upgraded, reviewed, and how they felt. */
function AfterDone({ s, sentA, sentB }: { s: SegmentStats[]; sentA: number; sentB: number }) {
  const sum = (k: keyof SegmentStats) => s.reduce((a, x) => a + (x[k] as number), 0);
  const sent = sum("sent");
  const done = sum("done");
  const moods = sum("happy") + sum("neutral") + sum("unhappy");
  const tiles = [
    { label: "Đã gửi", n: sent, note: `bản A ${sentA} · bản B ${sentB} · ${pct(sum("read"), sent)} đã xem · ${sum("followup_sent")} đã nhắc lại` },
    { label: "Phản hồi", n: sum("replied"), note: `${pct(sum("replied"), sent)} đã gửi` },
    { label: "Đồng ý", n: sum("agree"), note: `${pct(sum("agree"), sum("replied"))} người phản hồi` },
    { label: "Đã xử lý xong", n: done, note: `${sum("done_open")} phản hồi chưa xử lý` },
    { label: "Nâng cấp sau xử lý", n: sum("upgraded_after_done"), note: `${pct(sum("upgraded_after_done"), done)} đã xử lý · tổng ${sum("upgraded")} (+$${Math.round(sum("mrr"))})` },
    { label: "Review sau xử lý", n: sum("reviewed_after_done"), note: `${pct(sum("reviewed_after_done"), done)} đã xử lý · tổng ${sum("reviewed")}` },
    { label: "Hài lòng", n: sum("happy"), note: `${pct(sum("happy"), moods)} · ${sum("neutral")} bình thường · ${sum("unhappy")} không` },
  ];
  return (
    <section className="grid gap-2">
      <h3 className="text-[13px] font-semibold text-pf-text">Kết quả chung (cả 2 phân khúc)</h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
        {tiles.map((t) => (
          <div key={t.label} className="grid gap-0.5 rounded-pf-card border border-pf-border bg-pf-card px-3 py-2.5">
            <span className="text-[11.5px] text-pf-faint">{t.label}</span>
            <span className="text-[22px] font-semibold leading-tight text-pf-text">{t.n}</span>
            <span className="text-[11px] text-pf-muted">{t.note}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Bar({ n, of, tone = "bg-pf-primary" }: { n: number; of: number; tone?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-pf-card-hi">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${of ? Math.min(100, (n / of) * 100) : 0}%` }} />
    </div>
  );
}

function SegmentPanel({ seg, s, href }: { seg: Segment; s: SegmentStats; href: (p: Record<string, string | undefined>) => string }) {
  const funnel: { label: string; n: number; tab?: string; extra?: Record<string, string> }[] = [
    { label: "Đã xem", n: s.read },
    { label: "Đã nhắc lại (xem mà chưa reply)", n: s.followup_sent },
    { label: "Phản hồi", n: s.replied, tab: "replied" },
    { label: "Phản hồi sau nhắc lại", n: s.replied_after_followup, tab: "replied" },
    { label: "Đồng ý", n: s.agree, tab: "replied", extra: { intent: "agree" } },
    { label: "Từ chối", n: s.decline, tab: "replied", extra: { intent: "decline" } },
    { label: "Đã xử lý xong", n: s.done, tab: "done" },
    { label: "Nâng cấp", n: s.upgraded },
    { label: "Review 5★", n: s.reviewed },
    { label: "Gỡ app", n: s.uninstalled },
  ];
  const moods = s.happy + s.neutral + s.unhappy;
  return (
    <section className="grid content-start gap-4 rounded-pf-card border border-pf-border bg-pf-card p-4">
      <header className="grid gap-0.5">
        <div className="flex items-center gap-2">
          <Pill tone={SEG_TONE[seg]}>Phân khúc {SEGMENTS[seg].label}</Pill>
        </div>
        <p className="text-[12px] text-pf-muted">{SEGMENTS[seg].hint}</p>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          seg === "recap"
            ? { label: "Khách từ Recap", n: s.found, note: `${s.rows} row Recap mới · ${s.responsive} vào danh sách` }
            : { label: "Store được xét", n: s.found, note: "hoạt động hôm nay (AC2)" },
          { label: "Bị loại", n: s.skipped, note: `${pct(s.skipped, s.found)}${s.held ? ` · ${s.held} giữ cho bản B` : ""}`, href: href({ tab: "skipped", seg }) },
          { label: "Đã gửi", n: s.sent, note: pct(s.sent, s.found), href: href({ tab: "sent", seg }) },
          {
            label: "Chờ gửi",
            n: s.queued + s.failed + s.followup_queued,
            note: `${s.followup_queued ? `${s.followup_queued} tin nhắc lại · ` : ""}${s.failed ? `${s.failed} lỗi gửi` : "chờ duyệt / chờ giờ"}`,
            href: href({ tab: "queue", seg }),
          },
        ].map((t) => {
          const inner = (
            <>
              <span className="text-[11.5px] text-pf-faint">{t.label}</span>
              <span className="text-[22px] font-semibold leading-tight text-pf-text">{t.n}</span>
              <span className="text-[11px] text-pf-muted">{t.note}</span>
            </>
          );
          const cls = "grid gap-0.5 rounded-pf-md border border-pf-border bg-pf-bg-deep px-3 py-2";
          return "href" in t && t.href ? (
            <Link key={t.label} href={t.href} className={`${cls} transition-colors hover:border-pf-primary`}>
              {inner}
            </Link>
          ) : (
            <div key={t.label} className={cls}>
              {inner}
            </div>
          );
        })}
      </div>

      <div className="grid gap-2">
        <h4 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-pf-faint">Lý do bị loại</h4>
        {s.reasons.length === 0 ? (
          <p className="text-[12px] text-pf-faint">Chưa có store nào bị loại.</p>
        ) : (
          s.reasons.map((r) => (
            <Link key={r.code} href={href({ tab: "skipped", seg, reason: r.code })} className="grid gap-1 hover:text-pf-text">
              <span className="flex justify-between gap-3 text-[12.5px]">
                <span className="text-pf-body">{SKIP_REASONS[r.code as keyof typeof SKIP_REASONS] ?? r.code}</span>
                <span className="whitespace-nowrap text-pf-text">
                  {r.n} <span className="text-[11px] text-pf-faint">{pct(r.n, s.skipped)}</span>
                </span>
              </span>
              <Bar n={r.n} of={s.skipped} tone="bg-pf-warn" />
            </Link>
          ))
        )}
      </div>

      <div className="grid gap-2">
        <h4 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-pf-faint">Sau khi gửi ({s.sent})</h4>
        {funnel.map((x) => {
          const row = (
            <>
              <span className="flex justify-between gap-3 text-[12.5px]">
                <span className="text-pf-body">{x.label}</span>
                <span className="whitespace-nowrap text-pf-text">
                  {x.n} <span className="text-[11px] text-pf-faint">{pct(x.n, s.sent)}</span>
                </span>
              </span>
              <Bar n={x.n} of={s.sent} tone={x.label === "Gỡ app" || x.label === "Từ chối" ? "bg-pf-danger" : "bg-pf-primary"} />
            </>
          );
          return x.tab ? (
            <Link key={x.label} href={href({ tab: x.tab, seg, ...x.extra })} className="grid gap-1">
              {row}
            </Link>
          ) : (
            <div key={x.label} className="grid gap-1">
              {row}
            </div>
          );
        })}
      </div>

      <div className="grid gap-2">
        <h4 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-pf-faint">Sau khi xử lý xong ({s.done})</h4>
        <div className="grid grid-cols-3 gap-2 text-[12.5px]">
          <div className="rounded-pf-md border border-pf-border bg-pf-bg-deep px-3 py-2">
            <div className="text-[11px] text-pf-faint">Nâng cấp</div>
            <div className="text-[18px] font-semibold text-pf-text">{s.upgraded_after_done}</div>
            <div className="text-[11px] text-pf-muted">{pct(s.upgraded_after_done, s.done)}</div>
          </div>
          <div className="rounded-pf-md border border-pf-border bg-pf-bg-deep px-3 py-2">
            <div className="text-[11px] text-pf-faint">Review 5★</div>
            <div className="text-[18px] font-semibold text-pf-text">{s.reviewed_after_done}</div>
            <div className="text-[11px] text-pf-muted">{pct(s.reviewed_after_done, s.done)}</div>
          </div>
          <div className="rounded-pf-md border border-pf-border bg-pf-bg-deep px-3 py-2">
            <div className="text-[11px] text-pf-faint">Hài lòng</div>
            <div className="text-[18px] font-semibold text-pf-text">{pct(s.happy, moods)}</div>
            <div className="text-[11px] text-pf-muted">
              {s.happy} 🙂 · {s.neutral} 😐 · {s.unhappy} 🙁
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Days({ rows }: { rows: Awaited<ReturnType<typeof byDay>> }) {
  return (
    <section className="grid gap-2 rounded-pf-card border border-pf-border bg-pf-card p-4">
      <h3 className="text-[13px] font-semibold text-pf-text">Theo ngày (14 ngày, theo ngày tìm thấy store)</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[12.5px]">
          <thead className="text-[11px] uppercase tracking-[0.06em] text-pf-faint">
            <tr>
              {["Ngày", "Phân khúc", "Tìm thấy", "Bị loại", "Đã gửi", "Phản hồi", "Đồng ý", "Đã xử lý"].map((h, i) => (
                <th key={h} className={`py-1.5 pr-3 font-semibold ${i > 1 ? "text-right" : ""}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.day}-${r.segment}`} className="border-t border-pf-border">
                <td className="py-1.5 pr-3 text-pf-text">{r.day.split("-").reverse().join("/")}</td>
                <td className="py-1.5 pr-3">
                  <Pill tone={SEG_TONE[r.segment]}>{SEGMENTS[r.segment].label}</Pill>
                </td>
                {[r.found, r.skipped, r.sent, r.replied, r.agree, r.done].map((n, i) => (
                  <td key={i} className="py-1.5 pr-3 text-right text-pf-text">
                    {n}
                  </td>
                ))}
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={8} className="py-3 text-center text-pf-faint">
                  Chưa có dữ liệu.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RecentRecap({ rows }: { rows: Awaited<ReturnType<typeof recentRecapRows>> }) {
  return (
    <details className="rounded-pf-card border border-pf-border bg-pf-card p-4 text-[12.5px] text-pf-body">
      <summary className="cursor-pointer text-[13px] font-semibold text-pf-text">Row Recap mới đọc gần đây ({rows.length}) và cách hoạt động</summary>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-[12px]">
          <thead className="text-[11px] uppercase tracking-[0.06em] text-pf-faint">
            <tr>
              <th className="py-1 pr-3">Dòng</th>
              <th className="py-1 pr-3">Recap lúc</th>
              <th className="py-1 pr-3">Store</th>
              <th className="py-1 pr-3">category_issue</th>
              <th className="py-1 pr-3">Resolution</th>
              <th className="py-1 pr-3">Vào danh sách?</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.row_key} className="border-t border-pf-border">
                <td className="py-1 pr-3 text-pf-faint">{r.sheet_row ?? "—"}</td>
                <td className="py-1 pr-3">{short(r.recap_at)}</td>
                <td className="py-1 pr-3">{r.store_domain ?? "—"}</td>
                <td className="py-1 pr-3">{r.category_issue ?? "—"}</td>
                <td className="py-1 pr-3">{r.resolution ?? "—"}</td>
                <td className="py-1 pr-3">{r.responsive ? <Pill tone="ok">Có{r.target_id ? "" : " · trùng store"}</Pill> : <span className="text-pf-faint">Không</span>}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={6} className="py-3 text-center text-pf-faint">
                  Chưa đọc row mới nào.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-4 grid gap-2">
        <p>
          <strong className="text-pf-text">Recap:</strong> mọi row mới của tab Recap v11 (từ lúc bấm Bắt đầu), không cần category responsive (bật lại ở Cài
          đặt: recap_only_responsive = 1, Haiku kiểm tra). Resolution là &quot;Đợi TS check&quot; / &quot;Hết ca chưa giải quyết&quot; thì bỏ qua. Store vẫn phải đủ
          điều kiện như dưới. Tin gửi thẳng vào chính ticket đó, kèm note nội bộ, rồi resolved.
        </p>
        <p>
          <strong className="text-pf-text">Active:</strong> mỗi giờ đọc danh sách store của AC2, lấy store hoạt động trong hôm nay (giờ VN). Khách đã có hội thoại
          Crisp thì gửi vào hội thoại gần nhất, chưa có thì mở hội thoại mới (đi qua email).
        </p>
        <p>
          <strong className="text-pf-text">Cả hai:</strong> Shopify trả phí (không dev / partner / trial), không quá max_published_pages page publish, chưa gỡ app, mỗi
          store chỉ nhận 1 tin mời. Khách đã xem mà sau followup_after_hours giờ (mặc định 24) chưa trả lời: 1 tin nhắc lại — miễn phí, chỉ trong tháng 11. Khách reply: note mention Logan trên ticket, Haiku đọc ý (đồng ý / từ chối / hỏi thêm) và mức hài lòng. Sau đó theo dõi nâng cấp (AC2)
          và review 5★ (app_review trên Crisp) — so với lúc bấm Đã xử lý xong.
        </p>
        <p>
          Server đọc file Recap bằng service account (URSP_SHEET_SA_JSON trong .env của VPS, share file cho email của nó quyền Viewer). Không có thì n8n gửi row mới vào{" "}
          <code>POST /api/ursp/recap</code> kèm header <code>X-API-Key</code> (key của upsell API).
        </p>
      </div>
    </details>
  );
}

/* ---------------------------------------------------------------- A/B test */

/** **bold** as Crisp shows it — for reading the two messages side by side. */
function Bolded({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*\n]+\*\*)/g).map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i} className="text-pf-text">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

const rateOf = (n: number, of: number) => (of ? (n / of) * 100 : null);

function AbView({
  arms,
  bySeg,
  held,
  heldHref,
  auto,
  split,
  messages,
}: {
  arms: Record<"A" | "B", AbArm>;
  bySeg: AbSegmentRow[];
  held: Awaited<ReturnType<typeof listTargets>>;
  heldHref: (p: number) => string;
  auto: boolean;
  split: boolean;
  messages: { A: string; B: string; fA: string; fB: string };
}) {
  const { A, B } = arms;
  const bWaiting = B.sent === 0;
  /* each metric: its count per arm, and what it is a share of */
  const rows: { label: string; key: keyof AbArm; of: (a: AbArm) => number; test?: boolean }[] = [
    { label: "Đã gửi", key: "sent", of: () => 0 },
    { label: "Đã xem", key: "read", of: (a) => a.sent, test: true },
    { label: "Phản hồi", key: "replied", of: (a) => a.sent, test: true },
    { label: "Đồng ý", key: "agree", of: (a) => a.sent, test: true },
    { label: "Từ chối", key: "decline", of: (a) => a.sent },
    { label: "Đã nhắc lại", key: "followup_sent", of: (a) => a.sent },
    { label: "Phản hồi sau nhắc lại", key: "replied_after_followup", of: (a) => a.followup_sent },
    { label: "Đã xử lý xong", key: "done", of: (a) => a.sent },
    { label: "Nâng cấp", key: "upgraded", of: (a) => a.sent, test: true },
    { label: "Review 5★", key: "reviewed", of: (a) => a.sent },
    { label: "Hài lòng", key: "happy", of: (a) => a.happy + a.neutral + a.unhappy },
  ];
  const main = abVerdict(A.replied, A.sent, B.replied, B.sent);
  const verdict = bWaiting
    ? "Bản B chưa gửi — chưa so sánh được."
    : main.diff === null
      ? "Chưa có dữ liệu."
      : main.p !== null && main.p < 0.05
        ? `${main.diff > 0 ? "Bản B" : "Bản A"} hơn rõ về phản hồi (${main.diff > 0 ? "+" : ""}${main.diff} điểm %, p = ${main.p}) — đủ tin cậy.`
        : `Chênh lệch phản hồi ${main.diff > 0 ? "+" : ""}${main.diff} điểm % (B so với A) — chưa đủ chắc chắn${main.p !== null ? ` (p = ${main.p})` : ""}${main.needed ? `, cần khoảng ${main.needed} store mỗi bản để kết luận` : ""}.`;

  return (
    <div className="grid gap-4">
      <section className="grid gap-3 rounded-pf-card border border-pf-border bg-pf-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1">
            <h3 className="text-[14px] font-semibold text-pf-text">A/B test mẫu tin</h3>
            <p className="text-[12.5px] text-pf-muted">
              Bản A: mẫu hiện tại — mọi store đã nhận nó, cả Recap lẫn Active · Bản B: mẫu mới (mở bằng câu hỏi, ngắn, 1 việc cần làm).
            </p>
            <p className="text-[12.5px] text-pf-muted">
              Store mới:{" "}
              {split
                ? "vào bản đang ít store hơn trong cùng phân khúc — B được bù cho bằng A trước, rồi hai bản chia đều; cả 2 bản đều có Recap và Active."
                : "nhận bản A (bật chia A/B: ab_split = 1 ở Cài đặt)."}
            </p>
          </div>
          <ReleaseB held={B.held} auto={auto} />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: "Bản A — đã gửi", n: A.sent, note: A.queued ? `${A.queued} đang chờ gửi` : "" },
            { label: "Bản B — đã gửi", n: B.sent, note: B.held ? `${B.held} đang giữ, chưa gửi` : B.queued ? `${B.queued} đang chờ gửi` : "" },
            { label: "Phản hồi A", n: A.replied, note: A.sent ? `${(rateOf(A.replied, A.sent) ?? 0).toFixed(1)}%` : "—" },
            { label: "Phản hồi B", n: B.replied, note: B.sent ? `${(rateOf(B.replied, B.sent) ?? 0).toFixed(1)}%` : "chưa gửi" },
          ].map((t) => (
            <div key={t.label} className="grid gap-0.5 rounded-pf-md border border-pf-border bg-pf-bg-deep px-3 py-2">
              <span className="text-[11.5px] text-pf-faint">{t.label}</span>
              <span className="text-[22px] font-semibold leading-tight text-pf-text">{t.n}</span>
              <span className="text-[11px] text-pf-muted">{t.note}</span>
            </div>
          ))}
        </div>
        <p className={`rounded-pf-md border px-3 py-2 text-[13px] ${main.p !== null && main.p < 0.05 ? "border-pf-success/40 bg-pf-success/10 text-pf-success" : "border-pf-border bg-pf-bg-deep text-pf-body"}`}>
          <strong>Kết luận:</strong> {verdict}
        </p>
      </section>

      <section className="grid gap-2 rounded-pf-card border border-pf-border bg-pf-card p-4">
        <h3 className="text-[13px] font-semibold text-pf-text">So sánh từng chỉ số</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12.5px]">
            <thead className="text-[11px] uppercase tracking-[0.06em] text-pf-faint">
              <tr>
                <th className="py-1.5 pr-3 font-semibold">Chỉ số</th>
                <th className="py-1.5 pr-3 text-right font-semibold">Bản A</th>
                <th className="py-1.5 pr-3 text-right font-semibold">Bản B</th>
                <th className="py-1.5 pr-3 text-right font-semibold">B so với A</th>
                <th className="py-1.5 pr-3 font-semibold">Độ tin cậy</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const a = A[r.key] as number;
                const b = B[r.key] as number;
                const ra = rateOf(a, r.of(A));
                const rb = rateOf(b, r.of(B));
                const d = ra !== null && rb !== null && !bWaiting ? Math.round((rb - ra) * 10) / 10 : null;
                const v = r.test && !bWaiting ? abVerdict(a, A.sent, b, B.sent) : null;
                const worse = r.key === "decline";
                return (
                  <tr key={r.key} className="border-t border-pf-border">
                    <td className="py-1.5 pr-3 text-pf-text">{r.label}</td>
                    <td className="py-1.5 pr-3 text-right">
                      <span className="text-pf-text">{a}</span> {ra !== null && <span className="text-[11px] text-pf-faint">{ra.toFixed(1)}%</span>}
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      {bWaiting && r.key !== "sent" ? (
                        <span className="text-pf-faint">—</span>
                      ) : (
                        <>
                          <span className="text-pf-text">{b}</span> {rb !== null && <span className="text-[11px] text-pf-faint">{rb.toFixed(1)}%</span>}
                        </>
                      )}
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      {d === null || d === 0 ? (
                        <span className="text-pf-faint">{d === 0 ? "=" : "—"}</span>
                      ) : (
                        <span className={(d > 0) !== worse ? "font-semibold text-pf-success" : "font-semibold text-pf-danger"}>
                          {d > 0 ? "▲ +" : "▼ "}
                          {d} điểm
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 pr-3 text-[11.5px]">
                      {v && v.p !== null ? (
                        v.p < 0.05 ? (
                          <span className="text-pf-success">Chắc chắn (p = {v.p})</span>
                        ) : (
                          <span className="text-pf-muted">
                            Chưa chắc (p = {v.p}){v.needed ? ` · cần ~${v.needed}/bản` : ""}
                          </span>
                        )
                      ) : (
                        <span className="text-pf-faint">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t border-pf-border">
                <td className="py-1.5 pr-3 text-pf-text">Thời gian tới khi reply (TB)</td>
                <td className="py-1.5 pr-3 text-right text-pf-text">{A.reply_hours !== null ? `${A.reply_hours} giờ` : "—"}</td>
                <td className="py-1.5 pr-3 text-right text-pf-text">{B.reply_hours !== null ? `${B.reply_hours} giờ` : "—"}</td>
                <td colSpan={2} />
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-[11.5px] text-pf-faint">
          Tỷ lệ tính trên số tin đã gửi của từng bản. &quot;Chắc chắn&quot;: kiểm định 2 tỷ lệ, p &lt; 0.05 — chênh lệch nhiều khả năng do mẫu tin, không phải ngẫu nhiên.
        </p>
      </section>

      <section className="grid gap-2 rounded-pf-card border border-pf-border bg-pf-card p-4">
        <h3 className="text-[13px] font-semibold text-pf-text">Theo phân khúc</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12.5px]">
            <thead className="text-[11px] uppercase tracking-[0.06em] text-pf-faint">
              <tr>
                {["Phân khúc", "Bản", "Đã gửi", "Chờ gửi", "Đang giữ", "Đã xem", "Phản hồi", "Đồng ý"].map((h, i) => (
                  <th key={h} className={`py-1.5 pr-3 font-semibold ${i > 1 ? "text-right" : ""}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(["recap", "active"] as const).flatMap((seg) =>
                (["A", "B"] as const).map((v) => {
                  const r = bySeg.find((x) => x.segment === seg && x.variant === v);
                  const pctOf = (n: number) => (r?.sent ? <span className="text-[11px] text-pf-faint"> {((n / r.sent) * 100).toFixed(1)}%</span> : null);
                  return (
                    <tr key={`${seg}${v}`} className="border-t border-pf-border">
                      <td className="py-1.5 pr-3">
                        <Pill tone={SEG_TONE[seg]}>{SEGMENTS[seg].label}</Pill>
                      </td>
                      <td className="py-1.5 pr-3">
                        <Pill tone={v === "B" ? "ok" : "primary"}>Bản {v}</Pill>
                      </td>
                      <td className="py-1.5 pr-3 text-right text-pf-text">{r?.sent ?? 0}</td>
                      <td className="py-1.5 pr-3 text-right text-pf-text">{r?.queued ?? 0}</td>
                      <td className="py-1.5 pr-3 text-right text-pf-text">{r?.held ?? 0}</td>
                      <td className="py-1.5 pr-3 text-right text-pf-text">
                        {r?.read ?? 0}
                        {pctOf(r?.read ?? 0)}
                      </td>
                      <td className="py-1.5 pr-3 text-right text-pf-text">
                        {r?.replied ?? 0}
                        {pctOf(r?.replied ?? 0)}
                      </td>
                      <td className="py-1.5 pr-3 text-right text-pf-text">
                        {r?.agree ?? 0}
                        {pctOf(r?.agree ?? 0)}
                      </td>
                    </tr>
                  );
                }),
              )}
            </tbody>
          </table>
        </div>
        <p className="text-[11.5px] text-pf-faint">
          Recap nhận tin ngay trong ticket support, Active nhận qua hội thoại cũ hoặc email — tỷ lệ tự nhiên khác nhau, nên so A với B trong cùng một phân khúc là chính xác nhất.
        </p>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        {(["A", "B"] as const).map((v) => (
          <div key={v} className="grid content-start gap-2 rounded-pf-card border border-pf-border bg-pf-card p-4">
            <div className="flex items-center gap-2">
              <span className="shrink-0 whitespace-nowrap">
                <Pill tone={v === "B" ? "ok" : "primary"}>Bản {v}</Pill>
              </span>
              <span className="text-[12px] text-pf-muted">{v === "A" ? "Mẫu hiện tại" : "Mẫu mới — sửa ở Cài đặt (recap_template_b, active_template_b, followup_template_b)"}</span>
            </div>
            <div className="whitespace-pre-wrap rounded-pf-md border border-pf-border bg-pf-bg-deep p-3 text-[12.5px] leading-relaxed text-pf-body">
              <Bolded text={v === "A" ? messages.A : messages.B} />
            </div>
            <details className="text-[12px]">
              <summary className="cursor-pointer text-pf-muted hover:text-pf-text">Tin nhắc lại (xem mà 24 giờ chưa reply)</summary>
              <div className="mt-2 whitespace-pre-wrap rounded-pf-md border border-pf-border bg-pf-bg-deep p-3 text-[12.5px] leading-relaxed text-pf-body">
                <Bolded text={v === "A" ? messages.fA : messages.fB} />
              </div>
            </details>
          </div>
        ))}
      </section>

      <section className="grid gap-2">
        <h3 className="text-[13px] font-semibold text-pf-text">Store đang giữ cho bản B ({held.total}) — chưa gửi gì</h3>
        <Pager list={held} href={heldHref} />
        <SkippedTableLike rows={held.rows} />
      </section>
    </div>
  );
}

/** The held stores: who they are and why they came — no action, the button above sends them all. */
function SkippedTableLike({ rows }: { rows: UrspTarget[] }) {
  const TH = "px-3 py-2 font-semibold";
  const TD = "px-3 py-2 align-top";
  return (
    <div className="overflow-x-auto rounded-pf-card border border-pf-border">
      <table className="w-full text-left text-[12.5px]">
        <thead className="bg-pf-card-hi text-[11px] uppercase tracking-[0.06em] text-pf-faint">
          <tr>
            <th className={TH}>Store</th>
            <th className={TH}>Phân khúc · nguồn</th>
            <th className={TH}>Ticket</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} className="border-t border-pf-border">
              <td className={TD}>
                <StoreCell t={t} />
              </td>
              <td className={`${TD} max-w-[320px]`}>
                <SourceCell t={t} />
              </td>
              <td className={TD}>
                <CrispLink href={t.ticket_link} label="Mở ticket" />
              </td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={3} className="px-3 py-8 text-center text-pf-faint">
                Không có store nào đang giữ.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------------------------------------------------------- lists */

function Pager({ list, href }: { list: { total: number; page: number; pages: number }; href: (p: number) => string }) {
  return (
    <div className="flex items-center justify-between text-[12.5px] text-pf-muted">
      <span>{list.total} store</span>
      {list.pages > 1 && (
        <div className="flex items-center gap-2">
          {list.page > 1 && (
            <Link className="rounded-pf-md border border-pf-border px-3 py-1 hover:text-pf-text" href={href(list.page - 1)}>
              ← Trước
            </Link>
          )}
          <span>
            Trang {list.page}/{list.pages}
          </span>
          {list.page < list.pages && (
            <Link className="rounded-pf-md border border-pf-border px-3 py-1 hover:text-pf-text" href={href(list.page + 1)}>
              Sau →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function StoreCell({ t }: { t: UrspTarget }) {
  return (
    <div className="grid gap-0.5">
      <span className="font-semibold text-pf-text">{t.store_name || t.store_domain}</span>
      <span className="text-[11.5px] text-pf-faint">{t.store_domain}</span>
      {t.email && <span className="text-[11.5px] text-pf-faint">{t.email}</span>}
      <span className="text-[11.5px] text-pf-muted">
        {[t.shopify_plan && `Shopify ${t.shopify_plan}`, t.pf_plan && `PF ${t.pf_plan}`, t.pages_published !== null && `${t.pages_published} page publish`, t.country]
          .filter(Boolean)
          .join(" · ")}
      </span>
    </div>
  );
}

function SourceCell({ t }: { t: UrspTarget }) {
  const s = t.source ?? {};
  return (
    <div className="grid justify-items-start gap-1">
      <span className="flex flex-wrap gap-1">
        <Pill tone={SEG_TONE[t.segment]}>{SEGMENTS[t.segment].label}</Pill>
        {t.variant && <Pill tone={t.variant === "B" ? "ok" : "primary"}>Bản {t.variant}</Pill>}
      </span>
      {t.segment === "recap" ? (
        <div className="text-[11.5px] text-pf-muted">
          <div>
            {s.category_issue ?? "—"} · {s.resolution ?? "—"}
          </div>
          {s.issue_summary && <div className="line-clamp-2 text-pf-body">{String(s.issue_summary)}</div>}
          <div className="text-pf-faint">
            {s.recap_at ? `Recap ${short(String(s.recap_at))}` : ""}
            {s.pic ? ` · ${s.pic}` : ""}
            {s.sheet_row ? ` · dòng ${s.sheet_row}` : ""}
          </div>
        </div>
      ) : (
        <div className="text-[11.5px] text-pf-muted">{s.active_at ? `Hoạt động ${short(String(s.active_at))}` : ""}</div>
      )}
    </div>
  );
}

function Msg({ text, label = "Xem tin đã gửi" }: { text: string | null; label?: string }) {
  if (!text) return <span className="text-pf-faint">—</span>;
  return (
    <details className="text-[11.5px]">
      <summary className="cursor-pointer text-pf-muted hover:text-pf-text">{label}</summary>
      <pre className="mt-1 max-w-[340px] whitespace-pre-wrap rounded-pf-md border border-pf-border bg-pf-bg-deep p-2 font-sans text-pf-body">{text}</pre>
    </details>
  );
}

/** The time has come — outside the component: reading the clock is not a render's job. */
const isPast = (at: string) => new Date(at).getTime() <= Date.now();

/** Whether the customer has seen the offer — and where the reminder stands. */
function Seen({ t, hours }: { t: UrspTarget; hours: number }) {
  const due = t.read_at ? new Date(new Date(t.read_at).getTime() + hours * 3_600_000).toISOString() : null;
  const expired = !!t.offer_until && isPast(t.offer_until);
  const reminder =
    t.followup_status === "sent" && t.followup_sent_at ? (
      <span className="whitespace-nowrap text-pf-warn">Đã nhắc lại {short(t.followup_sent_at)}</span>
    ) : t.followup_status === "pending" ? (
      <span className="text-pf-primary-hi">Tin nhắc lại chờ duyệt</span>
    ) : t.followup_status === "approved" || t.followup_status === "sending" ? (
      <span className="text-pf-muted">Tin nhắc lại chờ gửi</span>
    ) : t.followup_status === "failed" ? (
      <span className="text-pf-danger">Nhắc lại lỗi gửi</span>
    ) : t.followup_status === "skipped" ? (
      <span className="text-pf-faint">Không nhắc lại</span>
    ) : t.read_at && !t.replied_at && !t.done_at && due ? (
      expired || (t.offer_until && due >= new Date(t.offer_until).toISOString()) ? (
        <span className="text-pf-faint">Hết hạn ưu đãi — không nhắc lại</span>
      ) : (
        <span className="text-pf-faint">Chưa reply → nhắc lại lúc {short(due)}</span>
      )
    ) : null;
  return (
    <div className="grid gap-1 text-[11.5px]">
      {t.read_at ? (
        <span className="whitespace-nowrap font-semibold text-pf-success">👁 Đã xem {short(t.read_at)}</span>
      ) : t.delivered_at ? (
        <span className="text-pf-muted">Đã tới, chưa xem</span>
      ) : (
        <span className="text-pf-faint">Chưa xem</span>
      )}
      {reminder}
      {t.offer_until && (
        <span className={expired ? "text-pf-faint" : "text-pf-muted"}>
          {expired ? "Ưu đãi đã hết hạn" : "Ưu đãi tới"} {deadlineText(t.offer_until)}
        </span>
      )}
    </div>
  );
}

function SentTable({ rows, followupHours }: { rows: UrspTarget[]; followupHours: number }) {
  const TH = "px-3 py-2 font-semibold";
  const TD = "px-3 py-2 align-top";
  return (
    <div className="overflow-x-auto rounded-pf-card border border-pf-border">
      <table className="w-full text-left text-[12.5px]">
        <thead className="bg-pf-card-hi text-[11px] uppercase tracking-[0.06em] text-pf-faint">
          <tr>
            <th className={TH}>Store</th>
            <th className={TH}>Phân khúc · nguồn</th>
            <th className={TH}>Tin nhắn</th>
            <th className={TH}>Đã xem</th>
            <th className={TH}>Khách phản hồi</th>
            <th className={TH}>Kết quả</th>
            <th className={TH}>Xử lý</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} className="border-t border-pf-border">
              <td className={TD}>
                <StoreCell t={t} />
              </td>
              <td className={`${TD} max-w-[240px]`}>
                <SourceCell t={t} />
              </td>
              <td className={TD}>
                <div className="grid gap-1">
                  <span className="whitespace-nowrap text-pf-text">Gửi {short(t.sent_at)}</span>
                  <Msg text={t.message} />
                  {t.followup_sent_at && <Msg text={t.followup_message} label="Xem tin nhắc lại" />}
                  <CrispLink href={t.ticket_link} label="Mở ticket" />
                </div>
              </td>
              <td className={TD}>
                <Seen t={t} hours={followupHours} />
              </td>
              <td className={`${TD} max-w-[300px]`}>
                {t.replied_at ? (
                  <div className="grid gap-1">
                    <span className="whitespace-nowrap text-pf-success">
                      {short(t.last_reply_at ?? t.replied_at)}
                      {t.replies > 1 ? <span className="text-pf-muted"> · {t.replies} tin</span> : null}
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {t.reply_intent && <Pill tone={t.reply_intent === "agree" ? "ok" : t.reply_intent === "decline" ? "bad" : "muted"}>{INTENT_LABEL[t.reply_intent]}</Pill>}
                      {t.mood && <Pill tone={t.mood === "happy" ? "ok" : t.mood === "unhappy" ? "bad" : "muted"}>{MOOD_LABEL[t.mood]}</Pill>}
                    </div>
                    {t.last_reply_text && <div className="line-clamp-4 text-[11.5px] text-pf-body">{t.last_reply_text}</div>}
                    {t.mood_note && <div className="text-[11px] italic text-pf-muted">{t.mood_note}</div>}
                    {t.mentioned_at && <span className="text-[11px] text-pf-faint">Đã note mention Logan</span>}
                  </div>
                ) : (
                  <span className="text-pf-faint">—</span>
                )}
              </td>
              <td className={TD}>
                <div className="grid gap-1 text-[11.5px]">
                  {t.upgraded_at ? (
                    <span className="text-pf-success">
                      Nâng cấp {short(t.upgraded_at)} · {t.upgraded_to}
                      {t.upgraded_price ? ` $${Number(t.upgraded_price)}` : ""}
                      {t.done_at && t.upgraded_at >= t.done_at ? " (sau xử lý)" : ""}
                    </span>
                  ) : (
                    <span className="text-pf-faint">Chưa nâng cấp{t.pf_plan ? ` · ${t.pf_plan}` : ""}</span>
                  )}
                  {t.reviewed_at ? (
                    <span className="text-pf-success">
                      Review {t.app_review ?? 5}★ {short(t.reviewed_at)}
                      {t.done_at && t.reviewed_at >= t.done_at ? " (sau xử lý)" : ""}
                    </span>
                  ) : t.first_review !== null && t.first_review >= 5 ? (
                    <span className="text-pf-muted">5★ từ trước</span>
                  ) : (
                    <span className="text-pf-faint">Chưa review{t.app_review ? ` · ${t.app_review}★` : ""}</span>
                  )}
                  {t.uninstalled_at && <span className="text-pf-warn">Gỡ app {short(t.uninstalled_at)}</span>}
                  <TrackButton id={t.id} />
                </div>
              </td>
              <td className={TD}>
                <DoneButton id={t.id} done={!!t.done_at} by={t.done_by} at={short(t.done_at)} />
              </td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={7} className="px-3 py-8 text-center text-pf-faint">
                Chưa có store nào ở đây.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function QueueSection({ title, note, list, empty }: { title: string; note: string; list: { rows: UrspTarget[]; total: number }; empty: string }) {
  return (
    <section className="grid gap-2">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-[14px] font-semibold text-pf-text">
          {title} <span className="text-pf-muted">({list.total})</span>
        </h3>
        <span className="text-[12px] text-pf-faint">{note}</span>
      </div>
      {list.rows.length ? (
        <Queue rows={list.rows} />
      ) : (
        <p className="rounded-pf-card border border-pf-border bg-pf-card p-5 text-center text-[13px] text-pf-faint">{empty}</p>
      )}
      {list.total > list.rows.length && <p className="text-[12px] text-pf-faint">Đang hiện {list.rows.length}/{list.total} — lọc để xem phần còn lại.</p>}
    </section>
  );
}

/** One card per message waiting — a sent row is here for its reminder. */
function Queue({ rows }: { rows: UrspTarget[] }) {
  return (
    <div className="grid gap-3">
      {rows.map((t) => (
        <QueueCard key={t.id} t={t} />
      ))}
    </div>
  );
}

function QueueCard({ t }: { t: UrspTarget }) {
  const followup = t.status === "sent";
  const status = followup ? (t.followup_status ?? "") : t.status;
  const error = followup ? t.followup_error : t.error;
  return (
    <article className="grid gap-3 rounded-pf-card border border-pf-border bg-pf-card p-4 lg:grid-cols-[320px_1fr]">
      <div className="grid content-start gap-2">
        <StoreCell t={t} />
        <SourceCell t={t} />
        <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
          {followup && <Pill tone="warn">Tin nhắc lại</Pill>}
          <Pill tone={status === "failed" ? "bad" : status === "pending" ? "primary" : "muted"}>{STATUS_LABEL[status] ?? status}</Pill>
          {t.wait_until && <span className="text-pf-muted">đợi ticket yên tới {short(t.wait_until)}</span>}
          {!followup && t.segment === "active" && <span className="text-pf-muted">{t.session_id ? "gửi vào hội thoại gần nhất của khách" : "sẽ mở hội thoại mới"}</span>}
        </div>
        {followup && (
          <p className="text-[11.5px] text-pf-muted">
            Tin mời gửi {short(t.sent_at)} · khách xem {short(t.read_at)} · chưa trả lời
          </p>
        )}
        {error && <p className="text-[12px] text-pf-danger">{error}</p>}
        <CrispLink href={t.ticket_link} label="Mở ticket" />
      </div>
      <QueueActions id={t.id} status={status} message={(followup ? t.followup_message : t.message) ?? ""} followup={followup} />
    </article>
  );
}

function SkippedTable({ rows }: { rows: UrspTarget[] }) {
  const TH = "px-3 py-2 font-semibold";
  const TD = "px-3 py-2 align-top";
  return (
    <div className="overflow-x-auto rounded-pf-card border border-pf-border">
      <table className="w-full text-left text-[12.5px]">
        <thead className="bg-pf-card-hi text-[11px] uppercase tracking-[0.06em] text-pf-faint">
          <tr>
            <th className={TH}>Store</th>
            <th className={TH}>Phân khúc · nguồn</th>
            <th className={TH}>Lý do bị loại</th>
            <th className={TH}>Lúc</th>
            <th className={TH}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} className="border-t border-pf-border">
              <td className={TD}>
                <StoreCell t={t} />
              </td>
              <td className={`${TD} max-w-[260px]`}>
                <SourceCell t={t} />
              </td>
              <td className={TD}>
                <Pill tone="warn">{SKIP_REASONS[t.skip_code as keyof typeof SKIP_REASONS] ?? t.skip_code ?? "—"}</Pill>
                {t.skip_reason && t.skip_reason !== SKIP_REASONS[t.skip_code as keyof typeof SKIP_REASONS] && (
                  <div className="mt-1 text-[11.5px] text-pf-muted">{t.skip_reason}</div>
                )}
              </td>
              <td className={`${TD} whitespace-nowrap text-pf-muted`}>{short(t.created_at)}</td>
              <td className={TD}>
                <div className="grid justify-items-start gap-1">
                  {t.ticket_link && <CrispLink href={t.ticket_link} label="Mở ticket" />}
                  {t.skip_code !== "no_domain" && <SendAnyway id={t.id} />}
                </div>
              </td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={5} className="px-3 py-8 text-center text-pf-faint">
                Không có store nào bị loại.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
