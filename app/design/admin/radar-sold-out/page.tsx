import Link from "next/link";
import { AdminShell } from "@/components/admin/AdminShell";
import { adminGate } from "@/components/admin/adminGate";
import { CrispLink, Pill } from "@/components/admin/upsell/bits";
import { CaseButtons, MessageBox, ModeSwitch, RunControls, SettingsForm } from "@/components/admin/rso/Controls";
import { vnTime } from "@/lib/ucp2/core";
import type { JobState } from "@/lib/rso/core";
import { getState, hasRsoDatabase } from "@/lib/rso/db";
import { RSO_TABS, funnel, listTargets, tabCounts, type RsoTab } from "@/lib/rso/queries";
import { RSO_HELP, RSO_NUMERIC, getRsoSettings, runState } from "@/lib/rso/settings";
import { INTENT_LABEL, MOOD_LABEL, STAGE_LABEL, STATUS_LABEL, productNames, type RsoTarget } from "@/lib/rso/types";

/* /design/admin/radar-sold-out — Radar Sold Out: the Radar's "Tell them a
   product is out of stock" rows → a heads-up on Crisp → restocked? → a
   review request. The funnel, what needs a person, every store sent, every
   store left out and why. */

export const metadata = { title: "Radar Sold Out — PageFly Design Admin" };
export const dynamic = "force-dynamic";

const HREF = "/design/admin/radar-sold-out";
const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 1000) / 10}%` : "—");
const short = (t: string | null) => (t ? vnTime(t).slice(5, 16) : "");
const fmt = (n: number) => n.toLocaleString("vi-VN");

export default async function RsoPage(props: PageProps<"/design/admin/radar-sold-out">) {
  const gate = await adminGate("rso");
  if (gate) return gate;
  if (!hasRsoDatabase())
    return (
      <AdminShell current="rso" title="Radar Sold Out">
        <p className="text-pf-muted">Cần Postgres (DATABASE_URL).</p>
      </AdminShell>
    );

  const sp = await props.searchParams;
  const tab = (RSO_TABS.some((t) => t.id === sp.tab) ? sp.tab : "todo") as RsoTab;
  const q = typeof sp.q === "string" && sp.q ? sp.q : undefined;
  const [run, cfg, f, counts, job] = await Promise.all([runState(), getRsoSettings(), funnel(), tabCounts(), getState<JobState>("last_job")]);

  const steps = [
    { label: "Tìm thấy", n: f.found - f.skipped, of: null as number | null },
    { label: "Đã gửi", n: f.sent, of: f.found - f.skipped },
    { label: "Khách trả lời", n: f.replied, of: f.sent },
    { label: "Đã nhập hàng", n: f.restocked, of: f.checked },
    { label: "Đã xin review", n: f.review_asked, of: f.restocked },
    { label: "Đã review", n: f.reviewed, of: f.review_asked },
  ];

  let body: React.ReactNode;
  if (tab === "settings") {
    body = <SettingsForm initial={cfg} help={RSO_HELP} numeric={RSO_NUMERIC} />;
  } else {
    const rows = await listTargets(tab, q);
    body =
      tab === "skipped" ? (
        <SkippedTable rows={rows} />
      ) : (
        <div className="grid gap-3">
          {tab === "todo" && (
            <section className="grid gap-2 rounded-pf-card border border-pf-border bg-pf-card p-4">
              <h3 className="text-[13px] font-semibold text-pf-text">Chế độ gửi</h3>
              <ModeSwitch mode={cfg.mode} />
            </section>
          )}
          {rows.length === 0 && <p className="rounded-pf-card border border-dashed border-pf-border p-6 text-[13px] text-pf-muted">Không có store nào ở đây.</p>}
          {rows.map((t) => (
            <Card key={t.id} t={t} todo={tab === "todo"} />
          ))}
        </div>
      );
  }

  return (
    <AdminShell
      current="rso"
      title="Radar Sold Out"
      subtitle="Radar AC2 báo page PageFly đang bán sản phẩm hết hàng → nhắc khách trên Crisp → khách nhập hàng → xin App Store review. Haiku đọc phản hồi của khách."
      actions={<RunControls on={run.on} />}
    >
      <div className="grid gap-4">
        <section className="grid gap-2 rounded-pf-card border border-pf-border bg-pf-card p-4 text-[12.5px] text-pf-body">
          <div className="flex flex-wrap items-center gap-2">
            {run.on ? <Pill tone="ok">● Đang chạy</Pill> : <Pill tone="warn">❚❚ Đang tạm dừng</Pill>}
            <span className="text-pf-muted">
              {run.on ? `từ ${short(run.at)} (${run.by.replace(/^admin:/, "")})` : "không quét, không gửi, không theo dõi — bấm Bắt đầu để chạy"}
            </span>
            <span className="text-pf-faint">· chế độ: {cfg.mode === "auto" ? "Tự động gửi" : "Chờ duyệt"}</span>
          </div>
          {job && (
            <div className="text-pf-faint">
              Lần chạy gần nhất {short(job.at)}
              {job.scan && ` · Radar ${job.scan.rows} dòng hết hàng, lấy ${job.scan.taken}, loại ${job.scan.skipped}`}
              {job.checked && ` · nhập hàng ${job.checked.restocked}, vẫn hết ${job.checked.still}, review ${job.checked.reviewed}`}
              {job.errors.length > 0 && <span className="text-pf-danger"> · lỗi: {job.errors.slice(0, 2).join(" | ")}</span>}
            </div>
          )}
        </section>

        <section className="grid grid-cols-2 gap-px overflow-hidden rounded-pf-card border border-pf-border bg-pf-border sm:grid-cols-3 xl:grid-cols-6">
          {steps.map((s) => (
            <div key={s.label} className="grid gap-0.5 bg-pf-card px-4 py-3">
              <span className="text-[12px] text-pf-muted">{s.label}</span>
              <span className="text-[26px] font-bold leading-tight text-pf-text tabular-nums">{fmt(s.n)}</span>
              <span className="text-[11.5px] text-pf-faint">{s.of === null ? `${fmt(f.skipped)} bị loại` : pct(s.n, s.of)}</span>
            </div>
          ))}
        </section>
        <p className="-mt-2 text-[12px] text-pf-faint">
          {fmt(f.visits_saved)} lượt xem/tháng đã quay lại page mua được hàng · {fmt(f.stopped)} khách không muốn liên hệ thêm
        </p>

        <nav className="flex flex-wrap items-end gap-1 border-b border-pf-border">
          {RSO_TABS.map((t) => {
            const on = tab === t.id;
            const n = t.id === "settings" ? undefined : counts[t.id];
            return (
              <Link
                key={t.id}
                href={t.id === "todo" ? HREF : `${HREF}?tab=${t.id}`}
                className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] font-semibold ${on ? "border-pf-primary text-pf-text" : "border-transparent text-pf-muted hover:text-pf-text"}`}
              >
                {t.label}
                {n !== undefined && <span className="rounded-pf-pill bg-pf-card-hi px-1.5 text-[11px] text-pf-muted">{n}</span>}
              </Link>
            );
          })}
          {tab !== "settings" && (
            <form className="mb-1 ml-auto" action={HREF}>
              <input type="hidden" name="tab" value={tab} />
              <input name="q" defaultValue={q} placeholder="Tìm store" className="h-8 rounded-pf-md border border-pf-border bg-pf-bg-deep px-3 text-[12.5px] text-pf-text" />
            </form>
          )}
        </nav>
        {body}
      </div>
    </AdminShell>
  );
}

function Card({ t, todo }: { t: RsoTarget; todo: boolean }) {
  const stage = t.stage ? STAGE_LABEL[t.stage] ?? t.stage : null;
  const tone = t.stage === "stopped" ? "bad" : t.stage === "reviewed" ? "ok" : t.stage?.startsWith("restocked") ? "ok" : "muted";
  const heads = t.status === "pending" || t.status === "failed" || t.status === "approved";
  const review = t.review_status === "pending" || t.review_status === "failed" || t.review_status === "approved";
  return (
    <article className="grid gap-3 rounded-pf-card border border-pf-border bg-pf-card p-4 text-[13px]">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <strong className="text-[14px] text-pf-text">{t.store_name || t.store_domain}</strong>
            <span className="text-pf-faint">{t.store_domain}</span>
            <Pill>{STATUS_LABEL[t.status] ?? t.status}</Pill>
            {stage && <Pill tone={tone}>{stage}</Pill>}
            {t.radar_group && <Pill tone="warn">Cũng ở Keep</Pill>}
            {t.reviewed_before && <Pill tone="ok">Đã review trước đó</Pill>}
          </div>
          <div className="text-pf-body">
            {productNames(t.pages).join(", ")} · <b className="text-pf-text">{fmt(t.visits)}</b> lượt xem/tháng
            {t.pf_plan && <span className="text-pf-faint"> · {t.pf_plan}</span>}
          </div>
          <div className="flex flex-wrap gap-x-3 text-[12px]">
            {t.pages.slice(0, 4).map((p) => (
              <a key={p.path} href={`https://${t.store_domain}${p.path}`} target="_blank" rel="noreferrer" className="text-pf-primary-hi hover:underline">
                {p.title.slice(0, 50)}
              </a>
            ))}
          </div>
        </div>
        <div className="grid justify-items-end gap-1 text-[12px] text-pf-faint">
          <CrispLink href={t.ticket_link} />
          {t.sent_at && <span>Gửi {short(t.sent_at)}{t.read_at ? " · đã xem" : ""}</span>}
          {t.review_asked_at && <span>Xin review {short(t.review_asked_at)}</span>}
          {t.app_review ? <span className="text-pf-success">{t.app_review}★</span> : null}
        </div>
      </header>

      {t.last_reply_text && (
        <div className="grid gap-1 rounded-pf-md bg-pf-bg-deep px-3 py-2">
          <div className="flex flex-wrap gap-2 text-[12px]">
            {t.reply_intent && <Pill tone="primary">{INTENT_LABEL[t.reply_intent] ?? t.reply_intent}</Pill>}
            {t.mood && <Pill tone={t.mood === "unhappy" ? "bad" : t.mood === "happy" ? "ok" : "muted"}>{MOOD_LABEL[t.mood] ?? t.mood}</Pill>}
            {t.mood_note && <span className="text-pf-muted">{t.mood_note}</span>}
          </div>
          <p className="whitespace-pre-wrap text-pf-body">{t.last_reply_text}</p>
        </div>
      )}
      {(t.error || t.review_error) && <p className="text-[12px] text-pf-danger">{t.error || t.review_error}</p>}

      {todo && heads && <MessageBox id={t.id} status={t.status} message={t.message ?? ""} />}
      {todo && review && (
        <div className="grid gap-1">
          <span className="text-[12px] font-semibold text-pf-success">Store đã nhập hàng — tin xin review</span>
          <MessageBox id={t.id} status={t.review_status!} message={t.review_message ?? ""} review />
        </div>
      )}
      {t.status === "sent" && <CaseButtons id={t.id} manual={t.stage === "manual"} />}
    </article>
  );
}

function SkippedTable({ rows }: { rows: RsoTarget[] }) {
  if (!rows.length) return <p className="text-[13px] text-pf-muted">Chưa có store nào bị loại.</p>;
  return (
    <div className="overflow-x-auto rounded-pf-card border border-pf-border">
      <table className="w-full text-[12.5px]">
        <thead className="bg-pf-card-hi text-left text-pf-muted">
          <tr>
            <th className="px-3 py-2 font-semibold">Store</th>
            <th className="px-3 py-2 font-semibold">Sản phẩm</th>
            <th className="px-3 py-2 text-right font-semibold">Lượt xem</th>
            <th className="px-3 py-2 font-semibold">Lý do</th>
            <th className="px-3 py-2 font-semibold">Lúc</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} className="border-t border-pf-border">
              <td className="px-3 py-2 text-pf-text">{t.store_domain}</td>
              <td className="px-3 py-2 text-pf-body">{productNames(t.pages).join(", ")}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmt(t.visits)}</td>
              <td className="px-3 py-2 text-pf-muted">{t.skip_reason}</td>
              <td className="px-3 py-2 text-pf-faint">{short(t.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
