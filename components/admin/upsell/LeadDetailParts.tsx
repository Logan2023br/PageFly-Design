"use client";

import { useState } from "react";
import { KIND_LABEL, MESSAGE_STATUS_LABEL, fmtVN } from "@/lib/upsell/format";
import { PAGE_LABELS, PAGE_TYPES, REPEATED_FAILURE, type EventRow, type MessageRow, type PageType } from "@/lib/upsell/types";
import { Button, Icon } from "../../ui";
import { FIELD, FIELD_LABEL, Segmented } from "../collections/shared";
import { CrispLink, ErrorLine, Pill, useAct } from "./bits";

/* ==========================================================================
   The lead page's interactive parts: the two previews, the review actions,
   the messages, and the timeline with notes.
   ========================================================================== */

type Device = "desktop" | "tablet" | "mobile";
const WIDTH: Record<Device, number> = { desktop: 1280, tablet: 820, mobile: 390 };

/* ---- previews ------------------------------------------------------------- */

export function PagePreviews({
  designId,
  versions,
  current,
  pages,
  storeHandle,
}: {
  designId: string;
  versions: number[];
  current: number;
  pages: { slot: number; type: string; title: string | null; size_bytes: number | null }[];
  storeHandle: string;
}) {
  const [device, setDevice] = useState<Device>("desktop");
  const [version, setVersion] = useState(current);
  const [full, setFull] = useState<number | null>(null);
  const q = version === current ? "" : `?v=${version}`;
  const label = (t: string) => PAGE_LABELS[t as PageType] ?? t;

  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-[300px]">
          <Segmented
            label="Thiết bị"
            value={device}
            onChange={setDevice}
            options={[
              { id: "desktop", label: "Desktop" },
              { id: "tablet", label: "Tablet" },
              { id: "mobile", label: "Mobile" },
            ]}
          />
        </div>
        {versions.length > 1 && (
          <label className="flex items-center gap-2 text-[12.5px] text-pf-muted">
            Phiên bản
            <select className={`${FIELD} w-auto py-1.5`} value={version} onChange={(e) => setVersion(Number(e.target.value))}>
              {versions.map((v) => (
                <option key={v} value={v}>
                  v{v}
                  {v === current ? " (hiện tại)" : ""}
                </option>
              ))}
            </select>
          </label>
        )}
        {version !== current && <Pill tone="warn">Đang xem bản cũ v{version} — khách thấy bản v{current}</Pill>}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {pages.map((p) => (
          <div key={p.slot} className="grid gap-2 rounded-pf-card border border-pf-border bg-pf-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-[13px] font-semibold text-pf-text">
                  Page {p.slot}: {label(p.type)}
                </div>
                {p.title && <div className="text-[11.5px] text-pf-faint">{p.title}</div>}
              </div>
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="ghost" icon="Maximize" onClick={() => setFull(p.slot)}>
                  Toàn màn hình
                </Button>
                {/* Signed in as admin, so this download is not counted. */}
                <a
                  href={`/api/upsell/download/${designId}/${p.slot}${q}`}
                  className="inline-flex h-8 items-center gap-1.5 rounded-pf-md border border-pf-border px-3 text-[12.5px] font-semibold text-pf-body hover:bg-pf-card"
                >
                  <Icon name="Download" size={14} /> .pagefly
                  {p.size_bytes ? <span className="text-pf-faint">{Math.max(1, Math.round(p.size_bytes / 1024))} KB</span> : null}
                </a>
              </div>
            </div>
            <Frame src={`/upsell/preview/${designId}/${p.slot}${q}`} device={device} height={560} title={label(p.type)} />
          </div>
        ))}
      </div>
      <p className="text-[11.5px] text-pf-faint">Nút nâng cấp trên trang khách mở admin.shopify.com/store/{storeHandle}/apps/pagefly.</p>
      {full !== null && (
        <div className="fixed inset-0 z-50 grid grid-rows-[auto_1fr] bg-[rgba(7,4,17,0.96)] p-4" role="dialog" aria-modal="true">
          <div className="flex items-center justify-between gap-3 pb-3">
            <div className="w-[300px]">
              <Segmented
                label="Thiết bị"
                value={device}
                onChange={setDevice}
                options={[
                  { id: "desktop", label: "Desktop" },
                  { id: "tablet", label: "Tablet" },
                  { id: "mobile", label: "Mobile" },
                ]}
              />
            </div>
            <Button variant="ghost" icon="X" onClick={() => setFull(null)}>
              Đóng
            </Button>
          </div>
          <Frame src={`/upsell/preview/${designId}/${full}${q}`} device={device} fill title="Toàn màn hình" />
        </div>
      )}
    </section>
  );
}

/** The page rendered at the device's real width and scaled to fit, so a
    phone layout is the phone layout and not a squeezed desktop. */
function Frame({ src, device, height = 560, fill = false, title }: { src: string; device: Device; height?: number; fill?: boolean; title: string }) {
  const [box, setBox] = useState(0);
  const w = WIDTH[device];
  const scale = box ? Math.min(1, box / w) : 0.4;
  return (
    <div
      ref={(el) => {
        if (el && el.clientWidth !== box) setBox(el.clientWidth);
      }}
      className={`relative overflow-hidden rounded-pf-md border border-pf-border bg-white ${fill ? "h-full" : ""}`}
      style={fill ? undefined : { height }}
    >
      <iframe
        key={src}
        src={src}
        title={title}
        sandbox="allow-scripts"
        className="absolute left-1/2 top-0 origin-top border-0"
        style={{ width: w, height: `${100 / scale}%`, transform: `translateX(-50%) scale(${scale})` }}
      />
    </div>
  );
}

/* ---- review actions -------------------------------------------------------- */

export function ReviewActions({ leadId, draft, pageTypes }: { leadId: string; draft: string; pageTypes: [string | null, string | null] }) {
  const [content, setContent] = useState(draft);
  const [mode, setMode] = useState<"none" | "rebuild" | "reject">("none");
  const [note, setNote] = useState("");
  const [types, setTypes] = useState<[string, string]>([pageTypes[0] ?? "home", pageTypes[1] ?? "product"]);
  const [changeTypes, setChangeTypes] = useState(false);
  const [run, busy, error] = useAct();
  const url = `/api/admin/upsell/leads/${leadId}`;
  const edited = content.trim() !== draft.trim();

  return (
    <section className="grid gap-3 rounded-pf-card border border-pf-primary-hi/30 bg-pf-primary/5 p-4">
      <h2 className="font-display text-[16px] font-bold text-pf-text">Duyệt page & tin nhắn đầu tiên</h2>
      <label className="grid gap-1.5">
        <span className={FIELD_LABEL}>Tin nhắn đầu tiên (Markdown, gửi qua Crisp)</span>
        <textarea className={`${FIELD} min-h-[220px] font-mono text-[12.5px]`} value={content} onChange={(e) => setContent(e.target.value)} />
        <span className="text-[11.5px] text-pf-faint">
          {edited ? "Đã sửa — sẽ gửi đúng nội dung này." : "Soạn sẵn từ mẫu trong Cài đặt."}{" "}
          {edited && (
            <button type="button" className="underline" onClick={() => setContent(draft)}>
              Khôi phục mẫu
            </button>
          )}
        </span>
      </label>
      <div className="flex flex-wrap gap-2">
        <Button icon="Check" disabled={busy} onClick={() => run(url, { action: "approve", content, send_mode: "window" })}>
          Duyệt & gửi trong giờ của khách
        </Button>
        <Button variant="ghost" icon="Rocket" disabled={busy} onClick={() => run(url, { action: "approve", content, send_mode: "now" })}>
          Duyệt & gửi ngay
        </Button>
        <Button variant="ghost" icon="RefreshCw" disabled={busy} onClick={() => setMode(mode === "rebuild" ? "none" : "rebuild")}>
          Yêu cầu rebuild
        </Button>
        <Button variant="danger" icon="X" disabled={busy} onClick={() => setMode(mode === "reject" ? "none" : "reject")}>
          Từ chối
        </Button>
      </div>
      {mode !== "none" && (
        <div className="grid gap-2 rounded-pf-md border border-pf-border bg-pf-bg-deep p-3">
          <label className="grid gap-1.5">
            <span className={FIELD_LABEL}>{mode === "rebuild" ? "Ghi chú cho Builder (bắt buộc)" : "Lý do từ chối (bắt buộc)"}</span>
            <textarea className={`${FIELD} min-h-[90px]`} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          {mode === "rebuild" && (
            <div className="grid gap-2">
              <label className="flex items-center gap-2 text-[12.5px] text-pf-muted">
                <input type="checkbox" checked={changeTypes} onChange={(e) => setChangeTypes(e.target.checked)} /> Đổi loại page
              </label>
              {changeTypes && (
                <div className="flex flex-wrap gap-2">
                  {[0, 1].map((i) => (
                    <select
                      key={i}
                      className={`${FIELD} w-[180px]`}
                      value={types[i]}
                      onChange={(e) => setTypes(i === 0 ? [e.target.value, types[1]] : [types[0], e.target.value])}
                      aria-label={`Loại page ${i + 1}`}
                    >
                      {PAGE_TYPES.map((t) => (
                        <option key={t} value={t}>
                          Page {i + 1}: {PAGE_LABELS[t]}
                        </option>
                      ))}
                    </select>
                  ))}
                </div>
              )}
            </div>
          )}
          <div>
            <Button
              size="sm"
              variant={mode === "reject" ? "danger" : "primary"}
              disabled={busy || !note.trim()}
              onClick={() =>
                run(url, mode === "rebuild" ? { action: "rebuild", note, page_types: changeTypes ? types : null } : { action: "reject", reason: note })
              }
            >
              {mode === "rebuild" ? "Gửi yêu cầu rebuild" : "Xác nhận từ chối"}
            </Button>
          </div>
        </div>
      )}
      <ErrorLine error={error} />
    </section>
  );
}

/* ---- messages --------------------------------------------------------------- */

export function LeadMessages({ leadId, messages, ticketLink }: { leadId: string; messages: MessageRow[]; ticketLink: string | null }) {
  const [compose, setCompose] = useState(false);
  const [text, setText] = useState("");
  const [run, busy, error] = useAct();
  return (
    <section className="grid gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-[16px] font-bold text-pf-text">Tin nhắn</h2>
        <Button size="sm" variant="ghost" icon="Pencil" onClick={() => setCompose(!compose)}>
          Soạn tin thủ công
        </Button>
      </div>
      {compose && (
        <div className="grid gap-2 rounded-pf-md border border-pf-border bg-pf-bg-deep p-3">
          <textarea className={`${FIELD} min-h-[140px] font-mono text-[12.5px]`} value={text} onChange={(e) => setText(e.target.value)} placeholder="Markdown. Tin này cũng phải được duyệt ở tab Tin chờ duyệt." />
          <div>
            <Button
              size="sm"
              disabled={busy || !text.trim()}
              onClick={() =>
                run(`/api/admin/upsell/leads/${leadId}`, { action: "message", content: text }).then((ok) => {
                  if (ok) {
                    setText("");
                    setCompose(false);
                  }
                })
              }
            >
              Lưu nháp (chờ duyệt)
            </Button>
          </div>
        </div>
      )}
      {messages.length === 0 && <p className="text-[12.5px] text-pf-faint">Chưa có tin nào.</p>}
      {messages.map((m) => (
        <MessageItem key={m.id} m={m} ticketLink={ticketLink} />
      ))}
      <ErrorLine error={error} />
    </section>
  );
}

function MessageItem({ m, ticketLink }: { m: MessageRow; ticketLink: string | null }) {
  const [run, busy, error] = useAct();
  const url = `/api/admin/upsell/messages/${m.id}`;
  const tone = m.status === "sent" ? "ok" : m.status === "failed" ? "bad" : m.status === "rejected" ? "muted" : "warn";
  return (
    <article className="grid gap-2 rounded-pf-md border border-pf-border bg-pf-card p-3">
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <Pill tone="primary">{KIND_LABEL[m.kind] ?? m.kind}</Pill>
        <Pill tone={tone}>{MESSAGE_STATUS_LABEL[m.status] ?? m.status}</Pill>
        {m.status === "approved" && <Pill>{m.send_mode === "now" ? "Gửi ngay" : "Trong giờ khách"}</Pill>}
        <span className="text-pf-faint">
          {m.created_by} · {fmtVN(m.created_at)}
          {m.approved_by && ` · duyệt bởi ${m.approved_by.replace(/^admin:/, "")} ${fmtVN(m.approved_at)}`}
          {m.sent_at && ` · gửi ${fmtVN(m.sent_at)}`}
        </span>
        {m.status === "sent" && ticketLink && <CrispLink href={ticketLink} label="Mở ticket Crisp" />}
      </div>
      <pre className="max-h-[200px] overflow-auto whitespace-pre-wrap font-mono text-[12px] text-pf-body">{m.content}</pre>
      {m.error && (
        <p className="flex flex-wrap items-center gap-2 text-[12px] text-pf-danger">
          {m.error}
          {m.attempts > 0 && (
            <span className="text-pf-faint">
              · lỗi {fmtVN(m.failed_at)} · đã thử {m.attempts} lần
            </span>
          )}
          {m.attempts >= REPEATED_FAILURE && <Pill tone="bad">Lỗi nhiều lần</Pill>}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {(m.status === "pending_review" || m.status === "failed") && (
          <>
            <Button size="sm" disabled={busy} onClick={() => run(url, { action: "approve", send_mode: "window" })}>
              {m.status === "failed" ? "Thử gửi lại" : "Duyệt"}
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(url, { action: "approve", send_mode: "now" })}>
              {m.status === "failed" ? "Gửi lại ngay" : "Duyệt & gửi ngay"}
            </Button>
            <Button size="sm" variant="danger" disabled={busy} onClick={() => run(url, { action: "reject" })}>
              Bỏ
            </Button>
          </>
        )}
        {m.status === "approved" && (
          <>
            {m.send_mode !== "now" && (
              <Button size="sm" disabled={busy} onClick={() => run(url, { action: "send_now" })}>
                Gửi ngay
              </Button>
            )}
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(url, { action: "unapprove" })}>
              Huỷ duyệt
            </Button>
          </>
        )}
      </div>
      <ErrorLine error={error} />
    </article>
  );
}

/* ---- timeline ----------------------------------------------------------------- */

const EVENT_LABEL: Record<string, string> = {
  lead_created: "Tạo lead",
  building: "Bắt đầu build",
  built: "Build xong",
  approved: "Duyệt",
  rebuild_requested: "Yêu cầu rebuild",
  rejected: "Từ chối",
  message_drafted: "Soạn tin",
  message_approved: "Duyệt tin",
  message_unapproved: "Huỷ duyệt tin",
  message_rejected: "Bỏ tin",
  message_sent: "Gửi tin",
  message_failed: "Gửi tin lỗi",
  replied: "Khách phản hồi",
  upgraded: "Nâng cấp",
  uninstalled: "Gỡ app",
  note_added: "Ghi chú",
  whatsapp_sent: "Đánh dấu đã gửi WhatsApp",
  whatsapp_unmarked: "Bỏ đánh dấu WhatsApp",
  status_changed: "Đổi trạng thái",
  view: "Khách xem trang",
  preview_open: "Khách mở toàn màn hình",
  device_toggle: "Khách đổi thiết bị",
  download: "Khách tải .pagefly",
  cta_click: "Khách bấm xem plan",
  feedback: "Khách góp ý",
};

export function Timeline({ leadId, events, pic, pics, notes }: { leadId: string; events: EventRow[]; pic: string | null; pics: string[]; notes: string | null }) {
  const [note, setNote] = useState("");
  const [picValue, setPic] = useState(pic ?? "");
  const [run, busy, error] = useAct();
  const url = `/api/admin/upsell/leads/${leadId}`;
  return (
    <section className="grid gap-3">
      <h2 className="font-display text-[16px] font-bold text-pf-text">Timeline</h2>
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1">
          <span className={FIELD_LABEL}>PIC</span>
          <input className={`${FIELD} w-[160px]`} list="upsell-pics" value={picValue} onChange={(e) => setPic(e.target.value)} />
          <datalist id="upsell-pics">
            {pics.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </label>
        <Button size="sm" variant="ghost" disabled={busy || picValue === (pic ?? "")} onClick={() => run(url, { action: "meta", pic: picValue })}>
          Lưu PIC
        </Button>
      </div>
      <div className="grid gap-2">
        <textarea className={`${FIELD} min-h-[70px]`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ghi chú nội bộ (khách không thấy)" />
        <div>
          <Button size="sm" disabled={busy || !note.trim()} onClick={() => run(url, { action: "meta", note }).then((ok) => ok && setNote(""))}>
            Thêm ghi chú
          </Button>
        </div>
      </div>
      {notes && <pre className="max-h-[160px] overflow-auto whitespace-pre-wrap rounded-pf-md border border-pf-border bg-pf-bg-deep p-3 text-[12px] text-pf-muted">{notes}</pre>}
      <ErrorLine error={error} />
      <ol className="grid gap-0">
        {events.map((e) => (
          <li key={e.id} className="grid grid-cols-[96px_1fr] gap-3 border-l border-pf-border py-1.5 pl-3 text-[12.5px]">
            <span className="text-pf-faint">{fmtVN(e.created_at)}</span>
            <span className="text-pf-body">
              <span className="font-semibold">{EVENT_LABEL[e.type] ?? e.type}</span>
              <span className="text-pf-faint"> · {e.actor.replace(/^admin:/, "")}</span>
              {e.page_slot ? <span className="text-pf-faint"> · page {e.page_slot}</span> : null}
              {e.rating ? <span className="text-pf-warn"> · {"★".repeat(e.rating)}</span> : null}
              {e.detail && "from" in e.detail ? (
                <span className="text-pf-faint">
                  {" "}
                  · {String(e.detail.from)} → {String(e.detail.to)}
                </span>
              ) : null}
              {e.detail && typeof e.detail.kind === "string" ? <span className="text-pf-faint"> · {KIND_LABEL[e.detail.kind] ?? e.detail.kind}</span> : null}
              {e.detail && typeof e.detail.note === "string" ? <span className="block text-pf-muted">{e.detail.note}</span> : null}
              {e.detail && typeof e.detail.reason === "string" ? <span className="block text-pf-muted">{e.detail.reason}</span> : null}
              {e.detail && typeof e.detail.device === "string" ? <span className="text-pf-faint"> · {e.detail.device}</span> : null}
              {e.comment ? <span className="block whitespace-pre-wrap text-pf-muted">“{e.comment}”</span> : null}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
