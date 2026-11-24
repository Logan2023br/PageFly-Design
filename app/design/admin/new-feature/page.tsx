import Link from "next/link";
import { AdminShell } from "@/components/admin/AdminShell";
import { adminGate } from "@/components/admin/adminGate";
import { CrispLink, Pill } from "@/components/admin/upsell/bits";
import { ImportSheet, MessageBox, RowButton, RunControls, SettingsForm } from "@/components/admin/nff/Controls";
import { importSheetEmail } from "@/lib/nff/importSheet";
import { vnTime } from "@/lib/ucp2/core";
import { collect, composeMessage, refreshDrafts, type JobState } from "@/lib/nff/core";
import { getState, hasNffDatabase } from "@/lib/nff/db";
import { NFF_TABS, funnel, listTargets, tabCounts, type NffTab } from "@/lib/nff/queries";
import { NFF_HELP, NFF_NUMERIC, getNffSettings } from "@/lib/nff/settings";
import { INTEREST_LABEL, MOOD_LABEL, STATUS_LABEL, type NffTarget } from "@/lib/nff/types";

/* /design/admin/new-feature — Feedback New Feature: PageFly's new features
   introduced to the stores whose Upsell Responsive case was handled, on
   approval, and what they said about them. */

export const metadata = { title: "Feedback New Feature — PageFly Design Admin" };
export const dynamic = "force-dynamic";

const HREF = "/design/admin/new-feature";
const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 1000) / 10}%` : "—");
const short = (t: string | null) => (t ? vnTime(t).slice(5, 16) : "");

export default async function NffPage(props: PageProps<"/design/admin/new-feature">) {
  const gate = await adminGate("nff");
  if (gate) return gate;
  if (!hasNffDatabase())
    return (
      <AdminShell current="nff" title="Feedback New Feature">
        <p className="text-pf-muted">Cần Postgres (DATABASE_URL).</p>
      </AdminShell>
    );

  const sp = await props.searchParams;
  const tab = (NFF_TABS.some((t) => t.id === sp.tab) ? sp.tab : "pending") as NffTab;
  const q = typeof sp.q === "string" && sp.q ? sp.q : undefined;
  /* the handled stores not here yet are added as the screen opens, not only by the timer */
  await refreshDrafts().catch(() => 0);
  await collect().catch(() => 0);
  const [cfg, f, counts, job] = await Promise.all([getNffSettings(), funnel(), tabCounts(), getState<JobState>("last_job")]);

  const steps = [
    { label: "Chờ duyệt / chờ gửi", n: f.queued, note: "" },
    { label: "Đã gửi", n: f.sent, note: "" },
    { label: "Đã xem", n: f.read, note: pct(f.read, f.sent) },
    { label: "Khách phản hồi", n: f.replied, note: pct(f.replied, f.sent) },
    { label: "Funnel Builder", n: f.funnel + f.several, note: "quan tâm" },
    { label: "Bundles", n: f.bundles + f.several, note: "quan tâm" },
    { label: "Post-purchase", n: f.post_purchase + f.several, note: "quan tâm" },
    { label: "Không cần", n: f.none, note: "" },
  ];

  let body: React.ReactNode;
  if (tab === "settings") {
    body = <SettingsForm initial={cfg} help={NFF_HELP} numeric={NFF_NUMERIC} sample={composeMessage({ store_name: "Sun Coast Elements", store_domain: "sun-coast.myshopify.com" }, { ...cfg, template: "" })} />;
  } else {
    const rows = await listTargets(tab, q);
    body = (
      <div className="grid gap-3">
        {tab === "pending" && <ImportSheet email={importSheetEmail()} />}
        {rows.length === 0 && <p className="rounded-pf-card border border-dashed border-pf-border p-6 text-[13px] text-pf-muted">Không có store nào ở đây.</p>}
        {rows.map((t) => (
          <Card key={t.id} t={t} />
        ))}
      </div>
    );
  }

  return (
    <AdminShell
      current="nff"
      title="Feedback New Feature"
      subtitle="Giới thiệu tính năng mới của PageFly (Funnel Builder, Bundles, Post-purchase offer) cho các store đã xử lý xong ở Upsell Responsive (Đã xử lý / Kết thúc), hỏi khách cần tính năng nào. Tin chờ duyệt mới gửi; mỗi giờ kiểm tra đã xem / phản hồi."
      actions={<RunControls pending={f.pending} />}
    >
      <div className="grid gap-4">
        {job && (
          <p className="text-[12px] text-pf-faint">
            Lần chạy gần nhất {short(job.at)}
            {job.added ? ` · thêm ${job.added} store` : ""}
            {job.send ? ` · gửi ${job.send.sent}${job.send.waited ? `, đợi ${job.send.waited} (khách đang chat)` : ""}${job.send.failed ? `, lỗi ${job.send.failed}` : ""}` : ""}
            {job.tracked ? ` · kiểm tra ${job.tracked} hội thoại` : ""}
            {job.errors.length > 0 && <span className="text-pf-danger"> · lỗi: {job.errors.slice(0, 2).join(" | ")}</span>}
          </p>
        )}
        <section className="grid grid-cols-2 gap-px overflow-hidden rounded-pf-card border border-pf-border bg-pf-border sm:grid-cols-4">
          {steps.map((s) => (
            <div key={s.label} className="grid gap-0.5 bg-pf-card px-4 py-3">
              <span className="text-[12px] text-pf-muted">{s.label}</span>
              <span className="text-[24px] font-bold leading-tight text-pf-text tabular-nums">{s.n}</span>
              <span className="text-[11.5px] text-pf-faint">{s.note || " "}</span>
            </div>
          ))}
        </section>

        <nav className="flex flex-wrap items-end gap-1 border-b border-pf-border">
          {NFF_TABS.map((t) => {
            const on = tab === t.id;
            const n = t.id === "settings" ? undefined : counts[t.id];
            return (
              <Link
                key={t.id}
                href={t.id === "pending" ? HREF : `${HREF}?tab=${t.id}`}
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

function Card({ t }: { t: NffTarget }) {
  const waiting = t.status === "pending" || t.status === "approved" || t.status === "failed";
  return (
    <article className="grid gap-3 rounded-pf-card border border-pf-border bg-pf-card p-4 text-[13px]">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <strong className="text-[14px] text-pf-text">{t.store_name || t.store_domain}</strong>
            <span className="text-pf-faint">{t.store_domain}</span>
            <Pill>{STATUS_LABEL[t.status] ?? t.status}</Pill>
            {t.ursp_stage && <Pill tone="primary">Upsell Responsive · {t.ursp_stage === "closed" ? "Kết thúc" : "Đã xử lý"}</Pill>}
            {t.source && <Pill tone="primary">{t.source}</Pill>}
            {t.note && <Pill tone="warn">{t.note}</Pill>}
            {t.interest && <Pill tone={t.interest === "none" ? "muted" : "ok"}>Quan tâm: {INTEREST_LABEL[t.interest] ?? t.interest}</Pill>}
          </div>
          {t.email && <span className="text-[12px] text-pf-faint">{t.email}</span>}
        </div>
        <div className="grid justify-items-end gap-1 text-[12px] text-pf-faint">
          <CrispLink href={t.ticket_link} />
          {t.sent_at && (
            <span>
              Gửi {short(t.sent_at)} · {t.read_at ? `đã xem ${short(t.read_at)}` : "chưa xem"}
            </span>
          )}
          {t.status === "sent" && <RowButton id={t.id} action="track" label="Kiểm tra Crisp" />}
          {t.status === "skipped" && <RowButton id={t.id} action="unskip" label="Đưa lại Chờ duyệt" />}
        </div>
      </header>

      {t.last_reply_text && (
        <div className="grid gap-1 rounded-pf-md bg-pf-bg-deep px-3 py-2">
          <div className="flex flex-wrap gap-2 text-[12px]">
            <span className="text-pf-success">Khách phản hồi {short(t.last_reply_at)}</span>
            {t.mood && <Pill tone={t.mood === "unhappy" ? "bad" : t.mood === "happy" ? "ok" : "muted"}>{MOOD_LABEL[t.mood] ?? t.mood}</Pill>}
            {t.mood_note && <span className="text-pf-muted">{t.mood_note}</span>}
          </div>
          <p className="whitespace-pre-wrap text-pf-body">{t.last_reply_text}</p>
        </div>
      )}
      {t.error && <p className="text-[12px] text-pf-danger">{t.error}</p>}
      {waiting && <MessageBox id={t.id} status={t.status} message={t.message ?? ""} />}
    </article>
  );
}
