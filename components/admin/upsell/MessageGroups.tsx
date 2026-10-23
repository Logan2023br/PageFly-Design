"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { AutoMessageRow, MessageGroup } from "@/lib/upsell/adminQueries";
import { KIND_LABEL, MESSAGE_STATUS_LABEL, fmtVN, whatsappText, whatsappUrl } from "@/lib/upsell/format";
import { api } from "../collections/shared";
import { CopyButton, ErrorLine, PhoneLine, Pill, WhatsappMark } from "./bits";

/* ==========================================================================
   Tab — Tin nhắn. Three buttons, one per kind of message:

     Tin nhắn build page  the first message (sent with the 2 pages when they
                          are approved), the follow-ups and review asks;
     Tin nhắn đã xem      the reminder to a customer who viewed, not downloaded;
     Tin nhắn đã tải      the Complimentary Editing offer after a download.

   Each has one switch — Đợi duyệt or Tự động gửi — then the messages
   waiting for review (Duyệt sends them), then every one already sent, one
   row each, opening to its Crisp text and its WhatsApp copy.
   ========================================================================== */

export type GroupNavItem = { id: MessageGroup; label: string; pending: number };

export function GroupNav({ groups, current }: { groups: GroupNavItem[]; current: MessageGroup }) {
  return (
    <nav aria-label="Loại tin" className="flex flex-wrap gap-1 rounded-xl border border-pf-border bg-pf-surface/60 p-1">
      {groups.map((g) => (
        <Link
          key={g.id}
          href={`/design/admin/upsell?tab=messages&group=${g.id}`}
          aria-current={g.id === current ? "page" : undefined}
          className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-colors ${
            g.id === current ? "bg-pf-primary text-white" : "text-pf-muted hover:text-pf-text"
          }`}
        >
          {g.label}
          {g.pending > 0 && (
            <span className={`rounded-pf-pill px-1.5 text-[11px] ${g.id === current ? "bg-white/20" : "bg-pf-warn/20 text-pf-warn"}`}>{g.pending}</span>
          )}
        </Link>
      ))}
    </nav>
  );
}

export function GroupHeader({
  setting,
  mode,
  description,
  sample,
}: {
  setting: string;
  mode: "manual" | "auto";
  description: string;
  sample: string;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setMode = async (next: "manual" | "auto") => {
    setSaving(true);
    setError(null);
    const r = await api("/api/admin/upsell/settings", { method: "PUT", body: JSON.stringify({ [setting]: next }) });
    setSaving(false);
    if (!r.ok) return setError(r.error);
    start(() => router.refresh());
  };
  return (
    <section className="grid gap-3 rounded-pf-card border border-pf-border bg-pf-card p-4">
      <p className="text-[12.5px] text-pf-muted">{description}</p>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-xl border border-pf-border bg-pf-surface/60 p-1">
          {(
            [
              ["manual", "Đợi duyệt"],
              ["auto", "Tự động gửi"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              disabled={saving}
              aria-pressed={mode === id}
              onClick={() => void setMode(id)}
              className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors disabled:opacity-60 ${
                mode === id ? (id === "auto" ? "bg-pf-success text-white" : "bg-pf-primary text-white") : "text-pf-muted hover:text-pf-text"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-[12px] text-pf-faint">
          {mode === "auto"
            ? "Tin tạo ra được duyệt luôn, BPU Ops gửi ở lần chạy sau trong giờ của khách."
            : "Tin tạo ra nằm ở danh sách Chờ duyệt bên dưới — bấm Duyệt thì mới gửi."}
        </span>
        <ErrorLine error={error} />
      </div>
      <details className="rounded-pf-md border border-pf-border bg-pf-bg-deep">
        <summary className="cursor-pointer px-3 py-2 text-[12.5px] font-semibold text-pf-body">Xem mẫu tin (Crisp và WhatsApp)</summary>
        <div className="grid gap-3 p-3 pt-0 lg:grid-cols-2">
          <TextBox title="Crisp" text={sample} />
          <TextBox title="WhatsApp" text={whatsappText(sample)} />
        </div>
      </details>
    </section>
  );
}

function TextBox({ title, text, extra }: { title: string; text: string; extra?: React.ReactNode }) {
  return (
    <div className="grid content-start gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-semibold text-pf-body">{title}</span>
        <div className="flex items-center gap-2">
          {extra}
          <CopyButton text={text} />
        </div>
      </div>
      <pre className="max-h-[300px] overflow-auto whitespace-pre-wrap rounded-pf-md border border-pf-border p-2.5 text-[12px] leading-relaxed text-pf-body">{text}</pre>
    </div>
  );
}

/** Everything already sent in a group, one row each. */
export function SentList({ rows }: { rows: AutoMessageRow[] }) {
  return (
    <section className="grid gap-2">
      <h3 className="text-[13.5px] font-semibold text-pf-text">Đã gửi ({rows.length})</h3>
      {rows.length === 0 ? (
        <p className="text-[12.5px] text-pf-faint">Chưa có tin nào được gửi.</p>
      ) : (
        <ul className="grid gap-1.5">
          {rows.map((r) => (
            <SentRow key={r.id} m={r} />
          ))}
        </ul>
      )}
    </section>
  );
}

function SentRow({ m }: { m: AutoMessageRow }) {
  const [open, setOpen] = useState(false);
  const wa = whatsappText(m.content);
  const waLink = whatsappUrl(m.phone);
  return (
    <li className="rounded-pf-md border border-pf-border bg-pf-card">
      {/* The row opens the message — except a press on the phone (which
          copies it) or its WhatsApp link, which do their own thing. */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={(e) => {
          if ((e.target as Element).closest("a, button")) return;
          setOpen(!open);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(!open);
          }
        }}
        className="flex w-full cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left text-[12.5px]"
      >
        <span className="font-semibold text-pf-text">{m.store_name || m.store_domain}</span>
        <span className="text-pf-faint">{m.store_domain}</span>
        <PhoneLine phone={m.phone} />
        <Pill tone="primary">{KIND_LABEL[m.kind] ?? m.kind}</Pill>
        <Pill tone="ok">{MESSAGE_STATUS_LABEL[m.status] ?? m.status}</Pill>
        {m.approved_by === "auto" && <Pill>Tự động</Pill>}
        <span className="ml-auto text-pf-faint">gửi {fmtVN(m.sent_at)}</span>
        <WhatsappMark
          leadId={m.lead_id}
          sentAt={m.whatsapp_sent_at}
          sentBy={m.whatsapp_sent_by}
          skippedAt={m.whatsapp_skipped_at}
          skippedBy={m.whatsapp_skipped_by}
        />
      </div>
      {open && (
        <div className="grid gap-3 border-t border-pf-border p-3">
          <Link href={`/design/admin/upsell/leads/${m.lead_id}`} className="text-[12px] text-pf-primary-hi hover:underline">
            Mở trang lead
          </Link>
          <div className="grid gap-3 lg:grid-cols-2">
            <TextBox title="Crisp" text={m.content} />
            <TextBox
              title="WhatsApp"
              text={wa}
              extra={
                waLink ? (
                  <a href={`${waLink}?text=${encodeURIComponent(wa)}`} target="_blank" rel="noreferrer" className="text-[12px] font-semibold text-pf-success hover:underline">
                    Mở WhatsApp
                  </a>
                ) : null
              }
            />
          </div>
        </div>
      )}
    </li>
  );
}
