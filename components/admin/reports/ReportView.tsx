import { REPORTS, weekLabel, type Item, type Report } from "@/lib/reports/defs";

/* ==========================================================================
   One weekly report as a document: white, A4 when printed, so "Tải PDF"
   (the browser's Save as PDF) gives a file that reads like the screen. Its
   own styles, scoped under .rp — the admin's dark theme does not reach it.
   ========================================================================== */

const fmtInt = (n: number) => Math.round(n).toLocaleString("en-US");
const fmtMoney = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const fmt = (it: Item, n: number | undefined) => (n === undefined ? "—" : it.money ? fmtMoney(n) : fmtInt(n));
const rate = (n: number | undefined, of: number | undefined) => (n === undefined || !of ? null : `${(Math.round((n / of) * 1000) / 10).toLocaleString("en-US")}%`);
/** For these, more is worse: the arrow goes red. */
const worseWhenUp = (key: string) => key.includes("uninstalled");

function Delta({ it, cur, prev }: { it: Item; cur?: number; prev?: number }) {
  if (cur === undefined || prev === undefined) return <span className="rp-muted">—</span>;
  const d = Math.round((cur - prev) * 100) / 100;
  if (d === 0) return <span className="rp-muted">=</span>;
  const good = worseWhenUp(it.key) ? d < 0 : d > 0;
  return (
    <span className={good ? "rp-up" : "rp-down"}>
      {d > 0 ? "▲ +" : "▼ −"}
      {it.money ? fmtMoney(Math.abs(d)) : fmtInt(Math.abs(d))}
    </span>
  );
}

export function ReportView({ report }: { report: Report }) {
  const def = REPORTS[report.upsell];
  const m = report.data.metrics;
  const p = report.data.prev;
  const made = new Date(report.generated_at).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "short" });
  const sent = m.c_sent ?? 0;
  const replyRate = rate(m.c_replied, sent);
  const readRate = rate(m.c_read, sent);
  const upRate = rate(m.c_upgraded, sent);

  return (
    <article className="rp">
      <style>{CSS}</style>
      <header className="rp-head">
        <div>
          <p className="rp-eyebrow">Báo cáo tuần · PageFly Design</p>
          <h1>{def.label}</h1>
          <p className="rp-week">
            Tuần {weekLabel(report.week)}
            {report.live && <span className="rp-badge">Tạm tính — tuần chưa kết thúc hoặc chưa lưu</span>}
          </p>
        </div>
        <p className="rp-meta">
          {report.live ? "Tính lúc" : "Lập lúc"} {made}
          <br />
          {report.generated_by === "auto" ? "Tự động, 1:00 sáng thứ Hai" : report.generated_by === "live" ? "Chưa lưu" : report.generated_by.replace(/^admin:/, "Tạo lại bởi ")}
        </p>
      </header>
      <p className="rp-blurb">{def.blurb}</p>

      <section className="rp-summary">
        <strong>Tóm tắt:</strong> tuần này gửi <b>{fmtInt(sent)}</b> khách
        {readRate && (
          <>
            , <b>{readRate}</b> đã đọc
          </>
        )}
        {replyRate && (
          <>
            , tỷ lệ phản hồi <b>{replyRate}</b> ({fmtInt(m.c_replied ?? 0)} khách)
          </>
        )}
        {upRate && (
          <>
            , <b>{fmtInt(m.c_upgraded ?? 0)}</b> khách nâng cấp ({upRate}, +{fmtMoney(m.c_mrr ?? 0)}/tháng)
          </>
        )}
        . Trong tuần có <b>{fmtInt(m.a_upgraded ?? 0)}</b> lượt nâng cấp và <b>{fmtInt(m.a_reviewed ?? m.c_reviewed ?? 0)}</b> lượt review.
      </section>

      <section className="rp-tiles">
        {def.headline.map((it) => (
          <div key={it.key} className="rp-tile">
            <span className="rp-tile-label">{it.label}</span>
            <span className="rp-tile-value">{fmt(it, m[it.key])}</span>
            <span className="rp-tile-sub">
              {it.of && rate(m[it.key], m[it.of]) ? `${rate(m[it.key], m[it.of])} · ` : ""}
              tuần trước {fmt(it, p[it.key])} <Delta it={it} cur={m[it.key]} prev={p[it.key]} />
            </span>
          </div>
        ))}
      </section>

      {def.sections.map((s) => (
        <section key={s.title} className="rp-section">
          <h2>{s.title}</h2>
          <p className="rp-note">{s.note}</p>
          <table>
            <thead>
              <tr>
                <th>Chỉ số</th>
                <th className="rp-num">Tuần này</th>
                <th className="rp-num">Tỷ lệ</th>
                <th className="rp-num">Tuần trước</th>
                <th className="rp-num">Thay đổi</th>
              </tr>
            </thead>
            <tbody>
              {s.items.map((it) => (
                <tr key={it.key} className={it.label.startsWith("·") ? "rp-sub" : undefined}>
                  <td>{it.label.replace(/^· /, "")}</td>
                  <td className="rp-num rp-strong">{fmt(it, m[it.key])}</td>
                  <td className="rp-num">{it.of ? (rate(m[it.key], m[it.of]) ?? "—") : ""}</td>
                  <td className="rp-num rp-muted">
                    {fmt(it, p[it.key])}
                    {it.of && rate(p[it.key], p[it.of]) ? ` · ${rate(p[it.key], p[it.of])}` : ""}
                  </td>
                  <td className="rp-num">
                    <Delta it={it} cur={m[it.key]} prev={p[it.key]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      <section className="rp-section">
        <h2>Tin nhắn đã gửi trong tuần</h2>
        {report.data.messages.length === 0 ? (
          <p className="rp-note">Không có tin nào được gửi trong tuần.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Loại tin</th>
                <th className="rp-num">Số tin</th>
              </tr>
            </thead>
            <tbody>
              {report.data.messages.map((x) => (
                <tr key={x.label}>
                  <td>{x.label}</td>
                  <td className="rp-num rp-strong">{fmtInt(x.n)}</td>
                </tr>
              ))}
              <tr className="rp-total">
                <td>Tổng</td>
                <td className="rp-num">{fmtInt(report.data.messages.reduce((s, x) => s + x.n, 0))}</td>
              </tr>
            </tbody>
          </table>
        )}
      </section>

      {report.data.byType && report.data.byType.length > 0 && (
        <section className="rp-section">
          <h2>{def.byTypeTitle ?? "Theo loại khách (gửi trong tuần)"}</h2>
          <table>
            <thead>
              <tr>
                <th>{def.byTypeHead ?? "Type User"}</th>
                <th className="rp-num">Gửi</th>
                <th className="rp-num">Đọc</th>
                <th className="rp-num">Phản hồi</th>
                <th className="rp-num">Nâng cấp</th>
                <th className="rp-num">Review</th>
              </tr>
            </thead>
            <tbody>
              {report.data.byType.map((t) => (
                <tr key={t.type}>
                  <td>{t.type}</td>
                  <td className="rp-num rp-strong">{t.sent}</td>
                  {[t.read, t.replied, t.upgraded, t.reviewed].map((n, i) => (
                    <td key={i} className="rp-num">
                      {n} <span className="rp-muted">{rate(n, t.sent)}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <footer className="rp-foot">
        Tuần tính từ 00:00 thứ Hai tới 24:00 Chủ nhật, giờ Việt Nam. Cột &quot;Tuần trước&quot; tính cùng lúc với tuần này. Báo cáo đã lưu giữ nguyên số liệu lúc
        lập; bấm Tạo lại để tính lại từ dữ liệu hiện tại.
      </footer>
    </article>
  );
}

const CSS = `
.rp { --ink:#14121f; --body:#3b3850; --muted:#7a7690; --line:#e6e3ef; --soft:#f6f5fa; --brand:#5b3fd6; --up:#13804a; --down:#c2362b;
  background:#fff; color:var(--body); font:13px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  max-width:900px; margin:0 auto; padding:32px 36px 40px; border-radius:14px; }
.rp h1 { color:var(--ink); font-size:26px; line-height:1.15; margin:2px 0 4px; font-weight:700; letter-spacing:-.01em; }
.rp h2 { color:var(--ink); font-size:15px; margin:0 0 2px; font-weight:700; }
.rp-head { display:flex; justify-content:space-between; gap:16px; align-items:flex-start; border-bottom:2px solid var(--ink); padding-bottom:12px; }
.rp-eyebrow { color:var(--brand); font-size:11px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; margin:0; }
.rp-week { margin:0; color:var(--ink); font-weight:600; font-size:14px; display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
.rp-badge { font-size:11px; font-weight:600; color:#8a5a00; background:#fff3d6; border:1px solid #f0d58f; border-radius:999px; padding:1px 8px; }
.rp-meta { margin:0; text-align:right; color:var(--muted); font-size:11.5px; white-space:nowrap; }
.rp-blurb { color:var(--muted); margin:10px 0 14px; }
.rp-summary { background:var(--soft); border:1px solid var(--line); border-radius:10px; padding:10px 14px; color:var(--body); margin-bottom:14px; }
.rp-summary b { color:var(--ink); }
.rp-tiles { display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; margin-bottom:18px; }
.rp-tile { border:1px solid var(--line); border-radius:10px; padding:10px 12px; display:grid; gap:2px; }
.rp-tile-label { color:var(--muted); font-size:11.5px; }
.rp-tile-value { color:var(--ink); font-size:24px; font-weight:700; line-height:1.15; font-variant-numeric:tabular-nums; }
.rp-tile-sub { color:var(--muted); font-size:11px; }
.rp-section { margin-top:18px; break-inside:avoid; }
.rp-note { color:var(--muted); font-size:11.5px; margin:0 0 6px; }
.rp table { width:100%; border-collapse:collapse; font-variant-numeric:tabular-nums; }
.rp th { text-align:left; font-size:10.5px; text-transform:uppercase; letter-spacing:.05em; color:var(--muted); font-weight:600; border-bottom:1px solid var(--line); padding:6px 8px; }
.rp td { border-bottom:1px solid var(--line); padding:6px 8px; }
.rp tr { break-inside:avoid; }
.rp .rp-num { text-align:right; white-space:nowrap; }
.rp-strong { color:var(--ink); font-weight:600; }
.rp-muted { color:var(--muted); }
.rp-sub td:first-child { padding-left:22px; color:var(--muted); }
.rp-total td { font-weight:700; color:var(--ink); border-top:1.5px solid var(--ink); }
.rp-up { color:var(--up); font-weight:600; }
.rp-down { color:var(--down); font-weight:600; }
.rp-foot { margin-top:22px; padding-top:10px; border-top:1px solid var(--line); color:var(--muted); font-size:11px; }
@media (max-width:640px) { .rp { padding:20px 16px; } .rp-head { flex-direction:column; } .rp-meta { text-align:left; } .rp-tiles { grid-template-columns:1fr 1fr; } }
@page { size:A4; margin:12mm; }
@media print {
  html, body { background:#fff !important; }
  .rp-noprint { display:none !important; }
  .rp-shell { padding:0 !important; background:#fff !important; }
  .rp { max-width:none; padding:0; border-radius:0; font-size:11.5px; }
  .rp-tile-value { font-size:20px; }
  * { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
}
`;
