"use client";

import { useEffect, useState } from "react";
import { fmtVN, money, whatsappText } from "@/lib/upsell/format";
import type { CustomerListRow } from "@/lib/storeSetUpsell/queries";
import { SSU_KIND_LABEL, SSU_MESSAGE_STATUS_LABEL, SSU_STATUS_LABEL, type SsuEvent, type SsuMessage, type SsuSelection } from "@/lib/storeSetUpsell/types";
import { Button } from "../../../ui";
import { CopyButton, CrispLink, ErrorLine, PhoneLine, Pill, useAct } from "../../upsell/bits";
import { FIELD, api } from "../shared";

/* ==========================================================================
   One card per store that picked a Store set: who they are (Mixpanel + AC2),
   what they picked, what Crisp says (conversations, app_review), where the
   upsell is, and every action on them. "Chi tiết" opens the selects, the
   messages and the timeline.
   ========================================================================== */

const API = "/api/admin/collection-pages/store-set-upsell";

const EVENT_LABEL: Record<string, string> = {
  selected: "Chọn template",
  checked: "Kiểm tra AC2 + Crisp",
  reviewed: "Đã review 5★",
  skipped: "Bỏ qua",
  message_drafted: "Soạn tin",
  message_approved: "Duyệt tin",
  message_rejected: "Bỏ tin",
  message_sent: "Đã gửi tin",
  message_failed: "Gửi lỗi",
  blocked_by_review: "Chặn gửi vì đã review 5★",
  delivered: "Crisp đã chuyển tin (chat hoặc email)",
  read: "Khách đã đọc",
  replied: "Khách phản hồi",
  segmented: "Gắn segment trên Crisp",
  deferred_support: "Tin đợi vì khách đang chat với support",
  segment_failed: "Không gắn được segment trên Crisp",
  upgraded: "Nâng cấp plan",
  pages_updated: "Cập nhật page",
  uninstalled: "Gỡ app",
  admin_checked: "Đã kiểm tra phản hồi",
  admin_skipped: "Admin bỏ qua",
};

function statusTone(s: string): "muted" | "warn" | "ok" | "bad" | "primary" {
  if (s === "sent") return "ok";
  if (s === "pending_review" || s === "approved" || s === "new") return "warn";
  if (s === "failed") return "bad";
  if (s === "eligible") return "primary";
  return "muted";
}

export function CustomerCards({ rows, editDays }: { rows: CustomerListRow[]; editDays: number }) {
  if (rows.length === 0)
    return <p className="rounded-pf-card border border-pf-border bg-pf-card p-6 text-center text-[13px] text-pf-muted">Không có khách nào ở đây.</p>;
  return (
    <div className="grid gap-3">
      {rows.map((c) => (
        <CustomerCard key={c.store_domain} c={c} editDays={editDays} />
      ))}
    </div>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <p className="flex gap-1.5 text-[12px]">
      <span className="w-[88px] shrink-0 text-pf-faint">{label}</span>
      <span className="min-w-0 text-pf-body">{children}</span>
    </p>
  );
}

/** The free editing still left, in days, from the thanks being sent. */
function editLeft(sentAt: string | null, editDays: number): number | null {
  if (!sentAt) return null;
  return Math.max(0, Math.ceil((new Date(sentAt).getTime() + editDays * 86_400_000 - Date.now()) / 86_400_000));
}

const FOLLOW_UPS = ["edit_reminder", "care_read", "care_upgraded", "review_ask"] as const;

function CustomerCard({ c, editDays }: { c: CustomerListRow; editDays: number }) {
  const [open, setOpen] = useState(false);
  const [followUp, setFollowUp] = useState<string>("edit_reminder");
  const left = editLeft(c.sent_at, editDays);
  const [run, busy, error] = useAct();
  const url = `${API}/customers/${encodeURIComponent(c.store_domain)}`;
  const reviewed5 = c.app_review !== null && Number(c.app_review) >= 5;

  return (
    <article className={`grid gap-3 rounded-pf-card border bg-pf-card p-4 ${c.needs_check ? "border-pf-warn/60" : "border-pf-border"}`}>
      <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr_1fr_1fr]">
        {/* Who */}
        <div className="grid content-start gap-1">
          <a href={`https://${c.store_domain}`} target="_blank" rel="noreferrer" className="text-[14px] font-semibold text-pf-text hover:text-pf-primary-hi">
            {c.store_name || c.store_domain}
          </a>
          <p className="truncate text-[11.5px] text-pf-faint">{c.store_domain}</p>
          {c.email ? (
            <p className="flex items-center gap-2 text-[12.5px] text-pf-body">
              <span className="truncate">{c.email}</span>
              <CopyButton text={c.email} label="Copy" />
            </p>
          ) : (
            <p className="text-[12px] text-pf-danger">Không có email</p>
          )}
          <PhoneLine phone={c.phone} />
          <p className="text-[12px] text-pf-muted">{[c.city, c.country].filter(Boolean).join(", ") || "—"}</p>
          {c.timezone && <p className="text-[11.5px] text-pf-faint">{c.timezone}</p>}
        </div>

        {/* Store */}
        <div className="grid content-start gap-0.5">
          <Line label="Shopify plan">{c.shopify_plan ?? "—"}{c.is_dev_store ? " · dev store" : ""}</Line>
          <Line label="PageFly plan">
            {c.pf_plan ?? "—"} {c.pf_price !== null ? `(${money(c.pf_price)})` : ""}
          </Line>
          <Line label="Pages">
            {c.pages ?? "—"} page · {c.published ?? "—"} publish
          </Line>
          <Line label="App">
            <span className={c.app_status === "uninstalled" ? "text-pf-danger" : ""}>{c.app_status ?? "—"}</span>
            {c.uninstalled_at ? ` · gỡ ${fmtVN(c.uninstalled_at, true)}` : ""}
          </Line>
          <Line label="Cài app">{fmtVN(c.installed_at, true)}</Line>
          <Line label="AC2">{c.ac2_synced_at ? `cập nhật ${fmtVN(c.ac2_synced_at)}` : "chưa đọc"}</Line>
        </div>

        {/* What they picked */}
        <div className="grid content-start gap-1">
          <div className="flex flex-wrap gap-1">
            {c.sets.map((s) => (
              <Pill key={s} tone="primary">
                {s}
              </Pill>
            ))}
          </div>
          <Line label="Page dùng">
            <span className="font-semibold text-pf-text">{c.pages_used.length}</span>
          </Line>
          <ul className="grid gap-0.5 pl-[94px] text-[11.5px] text-pf-muted">
            {c.pages_used.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <Line label="Lượt click">{c.selections}</Line>
          <Line label="Lần đầu">{fmtVN(c.first_selected_at, true)}</Line>
          <Line label="Gần nhất">{fmtVN(c.last_selected_at, true)}</Line>
        </div>

        {/* Crisp */}
        <div className="grid content-start gap-1">
          <Line label="Crisp">
            {c.crisp_checked_at ? `${c.crisp_conversations ?? 0} hội thoại` : "chưa kiểm tra"}
          </Line>
          <Line label="app_review">
            {c.app_review === null ? (
              <span className="text-pf-faint">trống</span>
            ) : (
              <span className={reviewed5 ? "font-semibold text-pf-success" : "text-pf-warn"}>{Number(c.app_review)}★</span>
            )}
          </Line>
          {/* Every conversation with this email, each a link to read it in full;
              the one the upsell messages go to is marked. */}
          {c.crisp_sessions && c.crisp_sessions.length > 0 && (
            <ul className="grid gap-1 pt-1 text-[12px]">
              {c.crisp_sessions.map((s) => (
                <li key={s.session_id} className="flex flex-wrap items-baseline gap-x-1.5">
                  {s.session_id === c.crisp_session && <Pill tone="primary">Upsell</Pill>}
                  {s.inapp && <Pill>In-app</Pill>}
                  <a href={s.link} target="_blank" rel="noreferrer" className="text-pf-primary-hi hover:underline">
                    {s.subject || s.session_id.slice(0, 18)}
                  </a>
                  <span className="text-pf-faint">
                    {fmtVN(s.updated_at, true)}
                    {s.state ? ` · ${s.state}` : ""}
                    {s.app_review !== null ? ` · ${s.app_review}★` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <CrispLink href={c.ticket_link} label="Tin upsell" />
            {c.crisp_channel && (
              <span className="text-[11.5px] text-pf-muted">
                {c.crisp_channel === "inapp" ? "gửi vào chat box in-app" : "gửi qua email (khách chưa có chat in-app)"}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Where the upsell is */}
      <div className="flex flex-wrap items-center gap-1.5 border-t border-pf-border pt-3">
        <Pill tone={statusTone(c.status)}>{SSU_STATUS_LABEL[c.status] ?? c.status}</Pill>
        {c.skip_reason && <span className="text-[12px] text-pf-muted">{c.skip_reason}</span>}
        {c.sent_at && <Pill tone="ok">Gửi {fmtVN(c.sent_at)}</Pill>}
        {left !== null && <Pill tone={left > 0 ? "primary" : "muted"}>{left > 0 ? `Còn ${left} ngày chỉnh sửa` : "Hết hạn chỉnh sửa"}</Pill>}
        {c.read_at && <Pill tone="ok">Đã đọc {fmtVN(c.read_at)}</Pill>}
        {c.replied && <Pill tone="primary">Có phản hồi {fmtVN(c.last_reply_at)}</Pill>}
        {c.needs_check && <Pill tone="warn">Cần kiểm tra</Pill>}
        {c.checked_at && !c.needs_check && <Pill>Đã kiểm tra · {c.checked_by?.replace(/^admin:/, "")}</Pill>}
        {c.review_asked_at && <Pill tone="primary">Đã xin review {fmtVN(c.review_asked_at)}</Pill>}
        {c.reviewed_at && c.sent_at && <Pill tone="ok">Review 5★ sau khi gửi</Pill>}
        {c.upgraded_at && <Pill tone="ok">Nâng cấp → {c.upgraded_to}</Pill>}
        {c.pages_updated_at && <Pill tone="ok">Cập nhật page</Pill>}
        {c.last_message_status && c.last_message_status !== "sent" && (
          <Pill>
            Tin {SSU_KIND_LABEL[c.last_message_kind as keyof typeof SSU_KIND_LABEL] ?? c.last_message_kind}: {SSU_MESSAGE_STATUS_LABEL[c.last_message_status] ?? c.last_message_status}
          </Pill>
        )}
      </div>

      {c.last_reply_text && (
        <blockquote className="whitespace-pre-wrap rounded-pf-md border-l-2 border-pf-primary-hi bg-pf-bg-deep px-3 py-2 text-[12.5px] text-pf-body">
          {c.last_reply_text}
        </blockquote>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" icon={open ? "ChevronDown" : "ChevronRight"} onClick={() => setOpen(!open)}>
          Chi tiết
        </Button>
        {c.needs_check && (
          <Button size="sm" icon="Check" disabled={busy} onClick={() => run(url, { action: "mark_checked" })}>
            Đã kiểm tra
          </Button>
        )}
        {!c.sent_at && !reviewed5 && c.email && c.status !== "pending_review" && c.status !== "approved" && (
          <Button size="sm" icon="Mail" disabled={busy} onClick={() => run(url, { action: "draft_thanks" })}>
            Soạn tin cảm ơn
          </Button>
        )}
        {c.sent_at && !reviewed5 && (
          <span className="inline-flex items-center gap-1.5">
            <select className={`${FIELD} !w-auto py-1 text-[12px]`} value={followUp} onChange={(e) => setFollowUp(e.target.value)} aria-label="Loại tin">
              {FOLLOW_UPS.map((k) => (
                <option key={k} value={k}>
                  {SSU_KIND_LABEL[k]}
                </option>
              ))}
            </select>
            <Button size="sm" variant="ghost" icon="Mail" disabled={busy} onClick={() => run(url, { action: "draft_kind", kind: followUp })}>
              Soạn tin
            </Button>
          </span>
        )}
        {!c.sent_at && (c.skip_reason === "Admin bỏ tin" || c.skip_reason === "Admin bỏ qua") && (
          <Button size="sm" disabled={busy} onClick={() => run(url, { action: "restore" })}>
            Khôi phục tin về Chờ duyệt
          </Button>
        )}
        <Button size="sm" variant="ghost" icon="RefreshCw" disabled={busy} onClick={() => run(url, { action: "recheck" })}>
          Kiểm tra lại
        </Button>
        {!c.sent_at && c.status !== "skipped" && c.status !== "reviewed" && (
          <Button size="sm" variant="danger" disabled={busy} onClick={() => run(url, { action: "skip" })}>
            Bỏ qua
          </Button>
        )}
        <ErrorLine error={error} />
      </div>

      {open && <Detail c={c} url={url} />}
    </article>
  );
}

type DetailData = { selections: SsuSelection[]; messages: SsuMessage[]; events: SsuEvent[] };

function Detail({ c, url }: { c: CustomerListRow; url: string }) {
  const [data, setData] = useState<DetailData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notes, setNotes] = useState(c.notes ?? "");
  const [custom, setCustom] = useState("");
  const [run, busy, error] = useAct();

  useEffect(() => {
    let live = true;
    void api<DetailData>(url).then((r) => {
      if (!live) return;
      if (r.ok) setData(r);
      else setLoadError(r.error);
    });
    return () => {
      live = false;
    };
  }, [url]);

  return (
    <div className="grid gap-4 rounded-pf-md border border-pf-border bg-pf-bg-deep p-3">
      {loadError && <ErrorLine error={loadError} />}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="grid content-start gap-1.5">
          <h4 className="text-[12.5px] font-semibold text-pf-text">Template đã chọn</h4>
          {!data ? (
            <p className="text-[12px] text-pf-faint">Đang tải…</p>
          ) : (
            <ul className="grid gap-1 text-[12px]">
              {data.selections.map((s) => (
                <li key={s.id} className="flex flex-wrap gap-x-2 text-pf-body">
                  <span className="text-pf-faint">{fmtVN(s.event_time, true)}</span>
                  <span className="font-semibold">{s.store_set}</span>
                  <span>{s.page_type}</span>
                  <span className="text-pf-faint">
                    {s.template_id} {s.min_plan ? `· ${s.min_plan}` : ""} {s.is_locked ? "· khoá" : ""} {s.source ? `· ${s.source}` : ""}{" "}
                    {[s.browser, s.os].filter(Boolean).join("/")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="grid content-start gap-1.5">
          <h4 className="text-[12.5px] font-semibold text-pf-text">Dòng thời gian</h4>
          {data && (
            <ul className="grid max-h-[260px] gap-1 overflow-auto text-[12px]">
              {data.events.map((e) => (
                <li key={e.id} className="flex gap-2">
                  <span className="shrink-0 text-pf-faint">{fmtVN(e.created_at)}</span>
                  <span className="text-pf-body">{EVENT_LABEL[e.type] ?? e.type}</span>
                  <span className="truncate text-pf-faint">
                    {e.actor.replace(/^admin:/, "")}
                    {e.detail && Object.keys(e.detail).length ? ` · ${summarize(e.detail)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {data && data.messages.length > 0 && (
        <section className="grid gap-2">
          <h4 className="text-[12.5px] font-semibold text-pf-text">Tin nhắn</h4>
          {data.messages.map((m) => (
            <div key={m.id} className="grid gap-1 rounded-pf-md border border-pf-border p-2.5">
              <div className="flex flex-wrap gap-1.5 text-[11.5px]">
                <Pill tone="primary">{SSU_KIND_LABEL[m.kind]}</Pill>
                <Pill tone={m.status === "sent" ? "ok" : m.status === "failed" ? "bad" : "muted"}>{SSU_MESSAGE_STATUS_LABEL[m.status] ?? m.status}</Pill>
                <span className="text-pf-faint">
                  soạn {fmtVN(m.created_at)} {m.sent_at ? `· gửi ${fmtVN(m.sent_at)}` : ""} {m.error ? `· ${m.error}` : ""}
                </span>
              </div>
              <pre className="max-h-[180px] overflow-auto whitespace-pre-wrap font-mono text-[12px] text-pf-body">{m.content}</pre>
              <div className="flex gap-2">
                <CopyButton text={m.content} label="Copy Crisp" />
                <CopyButton text={whatsappText(m.content)} label="Copy WhatsApp" />
              </div>
            </div>
          ))}
        </section>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="grid gap-1.5">
          <h4 className="text-[12.5px] font-semibold text-pf-text">Ghi chú nội bộ</h4>
          <textarea className={`${FIELD} min-h-[80px]`} value={notes} onChange={(e) => setNotes(e.target.value)} aria-label="Ghi chú" />
          <div>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(url, { action: "note", notes })}>
              Lưu ghi chú
            </Button>
          </div>
        </section>
        <section className="grid gap-1.5">
          <h4 className="text-[12.5px] font-semibold text-pf-text">Tin tự viết (vào tab Chờ duyệt)</h4>
          <textarea
            className={`${FIELD} min-h-[80px] font-mono text-[12px]`}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder={"Hi **Store**,\n\n…\n\nBest regards,\n**Logan – PageFly Support**"}
            aria-label="Tin tự viết"
          />
          <div>
            <Button size="sm" variant="ghost" disabled={busy || !custom.trim() || !c.email} onClick={() => run(url, { action: "draft_custom", content: custom }).then((ok) => ok && setCustom(""))}>
              Soạn tin
            </Button>
          </div>
        </section>
      </div>
      <ErrorLine error={error} />
    </div>
  );
}

function summarize(d: Record<string, unknown>): string {
  return Object.entries(d)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(", ")
    .slice(0, 200);
}
