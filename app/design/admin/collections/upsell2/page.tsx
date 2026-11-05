import Link from "next/link";
import { AdminShell } from "@/components/admin/AdminShell";
import { adminGate } from "@/components/admin/adminGate";
import { FIELD } from "@/components/admin/collections/shared";
import { RunNow } from "@/components/admin/ucp2/RunNow";
import { CrispLink } from "@/components/admin/upsell/bits";
import { SHEET_COLUMNS, TRACK_DAYS, getState, vnTime, type TrackState } from "@/lib/ucp2/core";
import { hasUcp2Database } from "@/lib/ucp2/db";
import { FUNNEL, UCP2_DID, ucp2List, ucp2Stats, ucp2Types, type Funnel, type Ucp2Filters } from "@/lib/ucp2/queries";

/* /design/admin/collections/upsell2 — Upsell Collection Pages 2: the
   Collection Pages invite recorded in the "User Testing" tab of the Pagefly
   Design sheet, and what each customer did after it: read, clicked, downloaded,
   replied, upgraded, reviewed. Rows come in from the sheet through n8n, and
   go back to it the same way (see app/api/ucp2/rows). */

export const metadata = { title: "Upsell Collection Pages 2 — PageFly Design Admin" };
export const dynamic = "force-dynamic";

const HREF = "/design/admin/collections/upsell2";
const SHEET = "https://docs.google.com/spreadsheets/d/1byMQnpxP1GKeoQhTe2pP5SarEEM_2KnwWVR_gmoBusU/edit?gid=0#gid=0";

const LABEL: Record<(typeof FUNNEL)[number], string> = {
  read: "Đã đọc tin",
  clicked: "Click link",
  downloaded: "Tải template",
  replied: "Phản hồi",
  upgraded: "Nâng cấp",
  reviewed: "Review 5★",
  uninstalled: "Gỡ app",
};

const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 1000) / 10}%` : "—");

export default async function Ucp2Page(props: PageProps<"/design/admin/collections/upsell2">) {
  const gate = await adminGate("ucp2");
  if (gate) return gate;

  if (!hasUcp2Database())
    return (
      <AdminShell current="ucp2" title="Upsell Collection Pages 2">
        <p className="text-pf-muted">Cần Postgres (DATABASE_URL).</p>
      </AdminShell>
    );

  const sp = await props.searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return typeof v === "string" && v ? v : undefined;
  };
  const f: Ucp2Filters = { q: one("q"), from: one("from"), to: one("to"), type: one("type"), did: one("did"), page: Number(one("page")) || 1 };

  const [stats, list, types, imported, pulled, tracked] = await Promise.all([
    ucp2Stats(f),
    ucp2List(f),
    ucp2Types(),
    getState<{ at: string; received: number; added: number; updated: number; skipped: number }>("imported"),
    getState<{ at: string; rows: number }>("pulled"),
    getState<TrackState>("tracked"),
  ]);

  const qs = (patch: Record<string, string | undefined>) => {
    const s = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: f.q, from: f.from, to: f.to, type: f.type, did: f.did, ...patch })) if (v) s.set(k, v);
    const t = s.toString();
    return t ? `${HREF}?${t}` : HREF;
  };

  return (
    <AdminShell
      current="ucp2"
      title="Upsell Collection Pages 2"
      subtitle="Tin mời Collection Pages ghi ở sheet User Testing — khách đã đọc, click link, tải template, phản hồi, nâng cấp, review tới đâu."
      actions={<RunNow />}
    >
      <div className="grid gap-4">
        <p className="text-[12px] text-pf-muted">
          Nhận row từ sheet: {imported ? `${vnTime(imported.at)} (+${imported.added} mới, ${imported.updated} sửa${imported.skipped ? `, ${imported.skipped} bỏ qua` : ""})` : "chưa có"} ·
          Ghi lại sheet: {pulled ? `${vnTime(pulled.at)} (${pulled.rows} row)` : "chưa có"} · Theo dõi: {tracked ? `${vnTime(tracked.at)}, còn ${tracked.remaining} row chờ kiểm tra` : "chưa chạy"}
          {tracked?.errors.length ? <span className="text-pf-warn"> · Lỗi: {tracked.errors.join("; ")}</span> : null} ·{" "}
          <a href={SHEET} target="_blank" rel="noreferrer" className="text-pf-primary-hi hover:underline">
            Mở sheet
          </a>
        </p>

        <form method="get" className="flex flex-wrap items-end gap-2">
          <input name="q" defaultValue={f.q} placeholder="Domain, tên, email, code…" className={`${FIELD} w-[220px]`} aria-label="Tìm" />
          <label className="grid gap-0.5 text-[11px] text-pf-faint">
            Gửi từ
            <input type="date" name="from" defaultValue={f.from} className={`${FIELD} w-[150px]`} />
          </label>
          <label className="grid gap-0.5 text-[11px] text-pf-faint">
            Đến
            <input type="date" name="to" defaultValue={f.to} className={`${FIELD} w-[150px]`} />
          </label>
          <select name="type" defaultValue={f.type ?? ""} className={`${FIELD} w-[230px]`} aria-label="Type User">
            <option value="">Mọi loại khách</option>
            {types.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <select name="did" defaultValue={f.did ?? ""} className={`${FIELD} w-[170px]`} aria-label="Khách đã làm gì">
            <option value="">Mọi hoạt động</option>
            {Object.entries(UCP2_DID).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          <button type="submit" className="h-[38px] rounded-pf-md bg-pf-primary px-4 text-[13px] font-semibold text-white hover:bg-pf-primary-hi">
            Lọc
          </button>
          <Link href={HREF} className="h-[38px] px-2 py-2 text-[12.5px] text-pf-faint hover:text-pf-text">
            Xoá lọc
          </Link>
        </form>

        <Tiles s={stats.all} href={(did) => qs({ did, page: undefined })} />

        <div className="grid gap-4 xl:grid-cols-2">
          <Breakdown title="Theo loại khách (Type User)" head="Loại" rows={stats.byType.map((r) => ({ key: r.type, f: r, href: qs({ type: r.type === "(trống)" ? undefined : r.type }) }))} />
          <Breakdown title="Theo tuần gửi (12 tuần gần nhất)" head="Tuần từ" rows={stats.byWeek.map((r) => ({ key: r.week, f: r }))} />
        </div>

        <RowsTable list={list} pageHref={(p) => qs({ page: String(p) })} />

        <details className="rounded-pf-card border border-pf-border bg-pf-card p-4 text-[12.5px] text-pf-body">
          <summary className="cursor-pointer text-[13px] font-semibold text-pf-text">Kết nối sheet qua n8n và link theo dõi click</summary>
          <div className="mt-3 grid gap-2">
            <p>
              <strong className="text-pf-text">1. Row mới → PageFly Design.</strong> Khi flow thêm row vào tab User Testing, gửi row đó (hoặc cả tab) tới{" "}
              <code>POST /api/ucp2/rows</code> kèm header <code>X-API-Key</code> (key của upsell API). Gửi lại row cũ không tạo trùng — khoá là session
              Crisp trong cột Ticket.
            </p>
            <p>
              <strong className="text-pf-text">2. Trạng thái → sheet.</strong> Định kỳ gọi <code>GET /api/ucp2/rows?since=…</code>, rồi Google Sheets “Update
              row” khớp cột <code>Ticket</code>, ghi các cột: {SHEET_COLUMNS.join(", ")}.
            </p>
            <p>
              <strong className="text-pf-text">3. Link trong tin nhắn.</strong> Dùng <code>https://pagefly-design.pagefly.io/go/{"{Code Store}"}</code> — click
              được đếm rồi chuyển tới Collection pages. Muốn tới trang khác: thêm <code>?to=</code> với đường dẫn trên site này hoặc địa chỉ
              pagefly.io (ví dụ <code>?to=https://free-service.pagefly.io/</code>). Link không qua /go (như prnt.sc) thì không đếm được click.
            </p>
            <p>
              Theo dõi mỗi 2 phút, row gửi trong {TRACK_DAYS} ngày gần nhất: đọc / phản hồi từ Crisp mỗi 20 phút; review (app_review trên Crisp) và
              nâng cấp / gỡ app (AC2) mỗi 6 giờ. Tải template: form tải ở Collection pages với domain của store, sau lúc gửi.
            </p>
          </div>
        </details>
      </div>
    </AdminShell>
  );
}

function Tiles({ s, href }: { s: Funnel; href: (did: string | undefined) => string }) {
  const tiles: { key: string; label: string; n: number; note: string; did?: string }[] = [
    { key: "sent", label: "Đã gửi", n: s.sent, note: `${s.delivered} đã tới (${pct(s.delivered, s.sent)})` },
    ...FUNNEL.map((k) => ({
      key: k,
      label: LABEL[k],
      n: s[k],
      did: k,
      note:
        k === "clicked"
          ? `${pct(s[k], s.sent)} · ${s.clicks} lượt click`
          : k === "upgraded"
            ? `${pct(s[k], s.sent)} · +$${Math.round(s.mrr)}/tháng`
            : k === "replied"
              ? `${pct(s[k], s.sent)} · ${pct(s[k], s.read)} người đã đọc`
              : `${pct(s[k], s.sent)} đã gửi`,
    })),
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
      {tiles.map((t) => (
        <Link
          key={t.key}
          href={href(t.did)}
          className="grid gap-0.5 rounded-pf-card border border-pf-border bg-pf-card px-3 py-2.5 transition-colors hover:border-pf-primary"
        >
          <span className="text-[11.5px] text-pf-faint">{t.label}</span>
          <span className="text-[22px] font-semibold leading-tight text-pf-text">{t.n}</span>
          <span className="text-[11px] text-pf-muted">{t.note}</span>
        </Link>
      ))}
    </div>
  );
}

function Breakdown({ title, head, rows }: { title: string; head: string; rows: { key: string; f: Funnel; href?: string }[] }) {
  return (
    <section className="grid gap-2 rounded-pf-card border border-pf-border bg-pf-card p-4">
      <h3 className="text-[13px] font-semibold text-pf-text">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[12.5px]">
          <thead className="text-[11px] uppercase tracking-[0.06em] text-pf-faint">
            <tr>
              <th className="py-1.5 pr-3 font-semibold">{head}</th>
              <th className="py-1.5 pr-3 text-right font-semibold">Gửi</th>
              {FUNNEL.map((k) => (
                <th key={k} className="py-1.5 pr-3 text-right font-semibold">
                  {LABEL[k]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ key, f, href }) => (
              <tr key={key} className="border-t border-pf-border">
                <td className="py-1.5 pr-3 font-semibold text-pf-text">
                  {href ? (
                    <Link href={href} className="hover:text-pf-primary-hi">
                      {key}
                    </Link>
                  ) : (
                    key
                  )}
                </td>
                <td className="py-1.5 pr-3 text-right text-pf-text">{f.sent}</td>
                {FUNNEL.map((k) => (
                  <td key={k} className="whitespace-nowrap py-1.5 pr-3 text-right">
                    <span className="text-pf-text">{f[k]}</span> <span className="text-[11px] text-pf-faint">{pct(f[k], f.sent)}</span>
                  </td>
                ))}
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={2 + FUNNEL.length} className="py-3 text-center text-pf-faint">
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

function When({ at, extra }: { at: string | null; extra?: string }) {
  if (!at) return <span className="text-pf-faint">—</span>;
  return (
    <span className="whitespace-nowrap text-pf-success">
      {vnTime(at).slice(5, 16)}
      {extra ? <span className="text-pf-muted"> · {extra}</span> : null}
    </span>
  );
}

function RowsTable({ list, pageHref }: { list: Awaited<ReturnType<typeof ucp2List>>; pageHref: (p: number) => string }) {
  const TH = "px-3 py-2 font-semibold";
  const TD = "px-3 py-2 align-top";
  return (
    <section className="grid gap-2">
      <div className="flex items-center justify-between text-[12.5px] text-pf-muted">
        <span>{list.total} row</span>
        {list.pages > 1 && (
          <div className="flex items-center gap-2">
            {list.page > 1 && (
              <Link className="rounded-pf-md border border-pf-border px-3 py-1 hover:text-pf-text" href={pageHref(list.page - 1)}>
                ← Trước
              </Link>
            )}
            <span>
              Trang {list.page}/{list.pages}
            </span>
            {list.page < list.pages && (
              <Link className="rounded-pf-md border border-pf-border px-3 py-1 hover:text-pf-text" href={pageHref(list.page + 1)}>
                Sau →
              </Link>
            )}
          </div>
        )}
      </div>
      <div className="overflow-x-auto rounded-pf-card border border-pf-border">
        <table className="w-full text-left text-[12.5px]">
          <thead className="bg-pf-card-hi text-[11px] uppercase tracking-[0.06em] text-pf-faint">
            <tr>
              <th className={TH}>Store</th>
              <th className={TH}>Gửi lúc</th>
              <th className={TH}>Đọc</th>
              <th className={TH}>Click</th>
              <th className={TH}>Tải</th>
              <th className={TH}>Phản hồi</th>
              <th className={TH}>Nâng cấp</th>
              <th className={TH}>Review</th>
              <th className={TH}>Gỡ app</th>
              <th className={TH}>Ticket</th>
            </tr>
          </thead>
          <tbody>
            {list.rows.map((r) => (
              <tr key={r.session_id} className="border-t border-pf-border">
                <td className={TD}>
                  <div className="font-semibold text-pf-text">{r.store_name || r.store_domain}</div>
                  <div className="text-[11.5px] text-pf-faint">
                    {r.store_domain}
                    {r.code ? ` · ${r.code}` : ""}
                  </div>
                  {r.email && <div className="text-[11.5px] text-pf-faint">{r.email}</div>}
                </td>
                <td className={TD}>
                  <div className="whitespace-nowrap text-pf-text">{vnTime(r.sent_at).slice(0, 16)}</div>
                  <div className="text-[11.5px] text-pf-faint">
                    {r.type_user ?? ""}
                    {r.plan ? ` · ${r.plan}` : ""}
                    {r.pf_plan && r.pf_plan !== r.plan ? ` → ${r.pf_plan}` : ""}
                  </div>
                </td>
                <td className={TD}>
                  {r.read_at ? <When at={r.read_at} /> : r.delivered_at ? <span className="text-pf-muted">Đã tới</span> : <span className="text-pf-faint">—</span>}
                </td>
                <td className={TD}>
                  <When at={r.clicked_at} extra={r.clicks > 1 ? `${r.clicks} lần` : undefined} />
                </td>
                <td className={TD}>
                  <When at={r.downloaded_at} />
                </td>
                <td className={`${TD} max-w-[280px]`}>
                  <When at={r.replied_at} extra={r.replies > 1 ? `${r.replies} tin` : undefined} />
                  {r.last_reply_text && <div className="mt-0.5 line-clamp-3 text-[11.5px] text-pf-body">{r.last_reply_text}</div>}
                </td>
                <td className={TD}>
                  <When at={r.upgraded_at} extra={r.upgraded_at ? `${r.upgraded_to ?? ""}${r.upgraded_price ? ` $${Number(r.upgraded_price)}` : ""}` : undefined} />
                </td>
                <td className={TD}>
                  {r.reviewed_at ? (
                    <When at={r.reviewed_at} extra={`${r.app_review ?? 5}★`} />
                  ) : r.reviewed_before ? (
                    <span className="text-pf-muted" title="Đã 5★ từ trước khi gửi tin">
                      5★ từ trước
                    </span>
                  ) : r.app_review !== null ? (
                    <span className="text-pf-muted">{r.app_review}★</span>
                  ) : (
                    <span className="text-pf-faint">—</span>
                  )}
                </td>
                <td className={TD}>{r.uninstalled_at ? <span className="whitespace-nowrap text-pf-warn">{vnTime(r.uninstalled_at).slice(5, 16)}</span> : <span className="text-pf-faint">—</span>}</td>
                <td className={TD}>
                  <CrispLink href={r.ticket_link} label="Mở ticket" />
                </td>
              </tr>
            ))}
            {!list.rows.length && (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-pf-faint">
                  Chưa có row nào — n8n chưa gửi dữ liệu từ sheet sang, hoặc bộ lọc không khớp.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
