import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { adminGate } from "@/components/admin/adminGate";
import { REPORTS, REPORT_UPSELLS, addWeeks, isReportUpsell, weekLabel, weekOf, type Report } from "@/lib/reports/defs";
import { firstSentAt } from "@/lib/reports/compute";
import { listReports } from "@/lib/reports/store";
import { readAdmin } from "@/lib/session";
import { hasUpsellDatabase } from "@/lib/upsell/db";

/* /design/admin/reports/{upsell} — the weekly reports of one upsell: this
   week so far, then every finished week, newest first. Each opens as a
   document with Tải PDF. Made on their own at 01:00 Monday (lib/reports). */

export const dynamic = "force-dynamic";

const COLS = [
  { key: "c_sent", label: "Gửi" },
  { key: "c_read", label: "Đọc", of: "c_sent" },
  { key: "c_replied", label: "Phản hồi", of: "c_sent" },
  { key: "c_upgraded", label: "Nâng cấp", of: "c_sent" },
  { key: "c_mrr", label: "MRR", money: true },
  { key: "a_reviewed", label: "Review (trong tuần)" },
] as const;

const pct = (n: number, of: number) => (of ? ` · ${Math.round((n / of) * 1000) / 10}%` : "");

export default async function ReportsPage(props: PageProps<"/design/admin/reports/[upsell]">) {
  const { upsell } = await props.params;
  if (!isReportUpsell(upsell)) notFound();
  const def = REPORTS[upsell];
  const gate = await adminGate(def.section);
  if (gate) return gate;
  if (!hasUpsellDatabase())
    return (
      <AdminShell current={def.section} title="Báo cáo tuần">
        <p className="text-pf-muted">Cần Postgres (DATABASE_URL).</p>
      </AdminShell>
    );

  const me = await readAdmin();
  const [saved, first] = await Promise.all([listReports(upsell), firstSentAt(upsell)]);
  const byWeek = new Map(saved.map((r) => [r.week, r]));
  /* Finished weeks since the first send (last 12), saved or not. */
  const current = weekOf();
  const weeks: string[] = [];
  if (first) for (let w = addWeeks(current, -1); w >= weekOf(first) && weeks.length < 12; w = addWeeks(w, -1)) weeks.push(w);
  for (const r of saved) if (!weeks.includes(r.week)) weeks.push(r.week);
  weeks.sort().reverse();

  const cell = (r: Report | undefined, c: (typeof COLS)[number]) => {
    if (!r) return "—";
    const n = r.data.metrics[c.key] ?? 0;
    if ("money" in c) return `$${n.toLocaleString("en-US")}`;
    return `${n.toLocaleString("en-US")}${"of" in c ? pct(n, r.data.metrics[c.of] ?? 0) : ""}`;
  };

  return (
    <AdminShell current={def.section} title={`Báo cáo tuần — ${def.label}`} subtitle="Mỗi tuần (thứ Hai – Chủ nhật, giờ Việt Nam) một báo cáo, tự lập lúc 1:00 sáng thứ Hai. Bấm một tuần để xem và tải PDF.">
      <div className="grid gap-4">
        <nav aria-label="Upsell" className="flex flex-wrap gap-1 rounded-xl border border-pf-border bg-pf-surface/60 p-1">
          {REPORT_UPSELLS.filter((u) => me?.sections.includes(REPORTS[u].section)).map((u) => (
            <Link
              key={u}
              href={`/design/admin/reports/${u}`}
              aria-current={u === upsell ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-semibold ${u === upsell ? "bg-pf-primary text-white" : "text-pf-muted hover:text-pf-text"}`}
            >
              {REPORTS[u].label}
            </Link>
          ))}
          <Link href={def.href} className="ml-auto rounded-lg px-3 py-1.5 text-[13px] text-pf-muted hover:text-pf-text">
            ← Về {def.label}
          </Link>
        </nav>

        <Link
          href={`/design/admin/reports/${upsell}/${current}`}
          className="flex flex-wrap items-center justify-between gap-2 rounded-pf-card border border-pf-primary/40 bg-pf-primary/10 px-4 py-3 hover:border-pf-primary"
        >
          <span className="text-[13.5px] font-semibold text-pf-text">Tuần này {weekLabel(current)} — xem trước (tạm tính)</span>
          <span className="text-[12px] text-pf-muted">Số liệu tới lúc mở · lưu chính thức lúc 1:00 sáng thứ Hai tới →</span>
        </Link>

        <div className="overflow-x-auto rounded-pf-card border border-pf-border">
          <table className="w-full text-left text-[12.5px]">
            <thead className="bg-pf-card-hi text-[11px] uppercase tracking-[0.06em] text-pf-faint">
              <tr>
                <th className="whitespace-nowrap px-3 py-2 font-semibold">Tuần</th>
                {COLS.map((c) => (
                  <th key={c.key} className="whitespace-nowrap px-3 py-2 text-right font-semibold">
                    {c.label}
                  </th>
                ))}
                <th className="whitespace-nowrap px-3 py-2 font-semibold">Lập lúc</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {weeks.length === 0 && (
                <tr>
                  <td colSpan={COLS.length + 3} className="px-3 py-6 text-center text-pf-muted">
                    Chưa có tuần nào kết thúc kể từ lần gửi đầu tiên.
                  </td>
                </tr>
              )}
              {weeks.map((w) => {
                const r = byWeek.get(w);
                return (
                  <tr key={w} className="border-t border-pf-border">
                    <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-pf-text">{weekLabel(w)}</td>
                    {COLS.map((c) => (
                      <td key={c.key} className="whitespace-nowrap px-3 py-2.5 text-right text-pf-body">
                        {cell(r, c)}
                      </td>
                    ))}
                    <td className="whitespace-nowrap px-3 py-2.5 text-pf-muted">
                      {r
                        ? `${new Date(r.generated_at).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "short" })}${r.generated_by === "auto" ? "" : " · tạo lại"}`
                        : "Chưa lưu"}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Link href={`/design/admin/reports/${upsell}/${w}`} className="font-semibold text-pf-primary-hi hover:underline">
                        Xem báo cáo →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  );
}
