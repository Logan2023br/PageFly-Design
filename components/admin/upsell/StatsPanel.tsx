import type { Breakdown, UpsellStats } from "@/lib/upsell/adminQueries";
import { money, pct } from "@/lib/upsell/format";

/* ==========================================================================
   Tab 10 — Thống kê.

   One hue (the brand violet) for every magnitude; no categorical palette,
   because nothing here compares more than one series on the same axis. The
   weekly view is three small multiples rather than one chart with three
   colours. Every bar has a native tooltip with its exact value, and every
   figure is also in a table.
   ========================================================================== */

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-pf-card border border-pf-border bg-pf-card p-4">
      <div className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-pf-faint">{label}</div>
      <div className="mt-1 font-display text-[26px] font-bold tracking-[-0.02em] text-pf-text">{value}</div>
      {sub && <div className="mt-0.5 text-[12px] text-pf-muted">{sub}</div>}
    </div>
  );
}

function Funnel({ steps }: { steps: { label: string; value: number }[] }) {
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <div className="grid gap-1.5" role="table" aria-label="Phễu">
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1].value : null;
        return (
          <div key={s.label} role="row" className="grid grid-cols-[120px_1fr_110px] items-center gap-3 text-[12.5px]">
            <span role="rowheader" className="text-pf-muted">
              {s.label}
            </span>
            <div className="h-5 rounded-[4px] bg-pf-card-hi" title={`${s.label}: ${s.value}`}>
              <div className="h-full rounded-[4px] bg-pf-primary" style={{ width: `${(s.value / max) * 100}%`, minWidth: s.value ? 4 : 0 }} />
            </div>
            <span role="cell" className="text-right font-semibold text-pf-text">
              {s.value}
              {prev ? <span className="ml-1.5 font-normal text-pf-faint">{pct(prev ? s.value / prev : 0)}</span> : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Weekly({ weeks, field, label }: { weeks: UpsellStats["weekly"]; field: "leads" | "sent" | "upgraded"; label: string }) {
  const max = Math.max(1, ...weeks.map((w) => w[field]));
  return (
    <figure className="grid gap-2">
      <figcaption className="text-[12px] font-semibold text-pf-body">{label}</figcaption>
      <div className="flex h-[96px] items-end gap-[2px] border-b border-pf-border">
        {weeks.map((w) => (
          <div key={w.week} className="flex h-full flex-1 items-end" title={`Tuần ${w.week}: ${w[field]}`}>
            <div className="w-full rounded-t-[4px] bg-pf-primary-hi" style={{ height: `${(w[field] / max) * 100}%`, minHeight: w[field] ? 3 : 0 }} />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10.5px] text-pf-faint">
        <span>{weeks[0]?.week.slice(5) ?? ""}</span>
        <span>{weeks[weeks.length - 1]?.week.slice(5) ?? ""}</span>
      </div>
    </figure>
  );
}

function BreakdownTable({ title, rows }: { title: string; rows: Breakdown[] }) {
  return (
    <section className="grid gap-2">
      <h3 className="text-[13px] font-semibold text-pf-text">{title}</h3>
      <div className="overflow-x-auto rounded-pf-card border border-pf-border">
        <table className="w-full text-left text-[12.5px]">
          <thead className="bg-pf-card-hi text-[11px] uppercase tracking-[0.06em] text-pf-faint">
            <tr>
              {["", "Lead", "Gửi", "Xem", "Tải", "Nâng cấp", "Tỉ lệ", "MRR"].map((h) => (
                <th key={h} className="px-3 py-2 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-4 text-center text-pf-faint">
                  Chưa có dữ liệu
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-pf-border">
                <td className="px-3 py-2 font-semibold text-pf-text">{r.key}</td>
                <td className="px-3 py-2">{r.leads}</td>
                <td className="px-3 py-2">{r.sent}</td>
                <td className="px-3 py-2">{r.viewed}</td>
                <td className="px-3 py-2">{r.downloaded}</td>
                <td className="px-3 py-2">{r.upgraded}</td>
                <td className="px-3 py-2">{r.sent ? pct(r.upgraded / r.sent) : "—"}</td>
                <td className="px-3 py-2">{money(r.mrr)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function StatsPanel({ s }: { s: UpsellStats }) {
  const approvals = s.firstPassApproved + s.approvedAfterRebuild;
  return (
    <div className="grid gap-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Nâng cấp · Test" value={pct(s.test.rate)} sub={`${s.test.upgraded}/${s.test.leads} lead · trong số đã gửi ${pct(s.testSent.rate)}`} />
        <Tile label="Nâng cấp · Control" value={pct(s.control.rate)} sub={`${s.control.upgraded}/${s.control.leads} lead`} />
        <Tile
          label="Chênh lệch"
          value={`${s.liftPoints >= 0 ? "+" : ""}${s.liftPoints.toFixed(1)} điểm %`}
          sub={s.test.leads < 30 || s.control.leads < 30 ? "Mẫu còn nhỏ — chưa kết luận được" : "Test so với Control"}
        />
        <Tile label="MRR tăng thêm" value={money(s.mrr)} sub={approvals ? `Duyệt ngay ${pct(s.firstPassApproved / approvals)} · sau rebuild ${pct(s.approvedAfterRebuild / approvals)}` : "Chưa có lead được duyệt"} />
      </div>
      <section className="grid gap-3 rounded-pf-card border border-pf-border bg-pf-card p-4">
        <h3 className="text-[13px] font-semibold text-pf-text">Phễu (nhóm test, trừ dòng đầu)</h3>
        <Funnel steps={s.funnel} />
      </section>
      <section className="grid gap-4 rounded-pf-card border border-pf-border bg-pf-card p-4 md:grid-cols-3">
        <Weekly weeks={s.weekly} field="leads" label="Lead mới mỗi tuần" />
        <Weekly weeks={s.weekly} field="sent" label="Đã gửi mỗi tuần" />
        <Weekly weeks={s.weekly} field="upgraded" label="Nâng cấp mỗi tuần" />
      </section>
      <div className="grid gap-6 xl:grid-cols-2">
        <BreakdownTable title="Theo ngành hàng" rows={s.byCategory} />
        <BreakdownTable title="Theo loại page" rows={s.byPageType} />
        <BreakdownTable title="Theo PIC" rows={s.byPic} />
      </div>
    </div>
  );
}
