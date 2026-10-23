"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { AutoMessageRow } from "@/lib/upsell/adminQueries";
import { MESSAGE_STATUS_LABEL, fmtVN, whatsappText, whatsappUrl } from "@/lib/upsell/format";
import type { AutoKind, AutoMode } from "@/lib/upsell/types";
import { api } from "../collections/shared";
import { CopyButton, ErrorLine, Pill, useAct } from "./bits";

/* ==========================================================================
   Tab — Tin tự động: the two messages written from what a customer did.

   One card per kind: when it is written, the mode (Chờ xác nhận / Tự động
   gửi / Tắt), the message as Crisp and as WhatsApp receive it with a copy
   button each, and every message of that kind — one row each, opened for
   the full text, its WhatsApp copy, and the actions its status allows.
   ========================================================================== */

export type AutoCard = {
  kind: AutoKind;
  title: string;
  when: string;
  mode: AutoMode;
  sample: string;
  rows: AutoMessageRow[];
};

const MODES: { id: AutoMode; label: string; hint: string }[] = [
  { id: "manual", label: "Chờ xác nhận để gửi", hint: "Tin được soạn sẵn, nằm ở Tin chờ duyệt — bấm gửi thì mới đi." },
  { id: "auto", label: "Tự động gửi", hint: "Tin được soạn và duyệt luôn, BPU Ops gửi ở lần chạy sau, trong giờ của khách." },
  { id: "off", label: "Tắt", hint: "Không soạn tin này." },
];

export function AutoMessages({ cards }: { cards: AutoCard[] }) {
  return (
    <div className="grid gap-5">
      {cards.map((c) => (
        <Card key={c.kind} card={c} />
      ))}
    </div>
  );
}

function Card({ card }: { card: AutoCard }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setMode = async (mode: AutoMode) => {
    setSaving(true);
    setError(null);
    const r = await api("/api/admin/upsell/settings", { method: "PUT", body: JSON.stringify({ [`${card.kind}_mode`]: mode }) });
    setSaving(false);
    if (!r.ok) return setError(r.error);
    start(() => router.refresh());
  };
  const counts = card.rows.reduce<Record<string, number>>((n, r) => ((n[r.status] = (n[r.status] ?? 0) + 1), n), {});

  return (
    <section className="grid gap-4 rounded-pf-card border border-pf-border bg-pf-card p-4">
      <header className="grid gap-1">
        <h2 className="font-display text-[16px] font-bold text-pf-text">{card.title}</h2>
        <p className="text-[12.5px] text-pf-muted">{card.when}</p>
      </header>

      <div className="grid gap-1.5">
        <div className="flex flex-wrap gap-1 rounded-xl border border-pf-border bg-pf-surface/60 p-1">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              disabled={saving}
              onClick={() => void setMode(m.id)}
              aria-pressed={card.mode === m.id}
              className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors disabled:opacity-60 ${
                card.mode === m.id
                  ? m.id === "auto"
                    ? "bg-pf-success text-white"
                    : m.id === "off"
                      ? "bg-pf-card-hi text-pf-text"
                      : "bg-pf-primary text-white"
                  : "text-pf-muted hover:text-pf-text"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="text-[11.5px] text-pf-faint">{MODES.find((m) => m.id === card.mode)?.hint}</p>
        <ErrorLine error={error} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Preview title="Mẫu tin Crisp" text={card.sample} />
        <Preview title="Mẫu tin WhatsApp" text={whatsappText(card.sample)} />
      </div>

      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
          <h3 className="font-semibold text-pf-text">Tin đã tạo ({card.rows.length})</h3>
          {Object.entries(counts).map(([s, n]) => (
            <Pill key={s} tone={s === "sent" ? "ok" : s === "failed" ? "bad" : s === "rejected" ? "muted" : "warn"}>
              {MESSAGE_STATUS_LABEL[s] ?? s} · {n}
            </Pill>
          ))}
        </div>
        {card.rows.length === 0 ? (
          <p className="text-[12.5px] text-pf-faint">Chưa có tin nào.</p>
        ) : (
          <ul className="grid gap-1.5">
            {card.rows.map((r) => (
              <Row key={r.id} m={r} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function Preview({ title, text }: { title: string; text: string }) {
  return (
    <div className="grid content-start gap-2 rounded-pf-md border border-pf-border bg-pf-bg-deep p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-semibold text-pf-body">{title}</span>
        <CopyButton text={text} />
      </div>
      <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap text-[12.5px] leading-relaxed text-pf-body">{text}</pre>
    </div>
  );
}

const TONE: Record<string, "ok" | "bad" | "muted" | "warn"> = { sent: "ok", failed: "bad", rejected: "muted", pending_review: "warn", approved: "warn" };

function Row({ m }: { m: AutoMessageRow }) {
  const [open, setOpen] = useState(false);
  const [run, busy, error] = useAct();
  const url = `/api/admin/upsell/messages/${m.id}`;
  const wa = whatsappText(m.content);
  const waLink = whatsappUrl(m.phone);
  const when = m.sent_at ?? m.approved_at ?? m.created_at;

  return (
    <li className="rounded-pf-md border border-pf-border bg-pf-bg-deep">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left text-[12.5px]">
        <span className="font-semibold text-pf-text">{m.store_name || m.store_domain}</span>
        <span className="text-pf-faint">{m.store_domain}</span>
        <Pill tone={TONE[m.status] ?? "muted"}>{MESSAGE_STATUS_LABEL[m.status] ?? m.status}</Pill>
        {m.approved_by === "auto" && <Pill tone="primary">Tự động</Pill>}
        <span className="ml-auto text-pf-faint">
          {m.status === "sent" ? "gửi" : "tạo"} {fmtVN(when)}
        </span>
      </button>
      {open && (
        <div className="grid gap-3 border-t border-pf-border p-3">
          <div className="flex flex-wrap items-center gap-2 text-[12px]">
            <Link href={`/design/admin/upsell/leads/${m.lead_id}`} className="text-pf-primary-hi hover:underline">
              Mở trang lead
            </Link>
            {m.error && <span className="text-pf-danger">Lỗi: {m.error}</span>}
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="grid content-start gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-semibold text-pf-body">Crisp</span>
                <CopyButton text={m.content} />
              </div>
              <pre className="max-h-[260px] overflow-auto whitespace-pre-wrap rounded-pf-md border border-pf-border p-2.5 text-[12px] text-pf-body">{m.content}</pre>
            </div>
            <div className="grid content-start gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-semibold text-pf-body">WhatsApp</span>
                <div className="flex items-center gap-2">
                  {waLink && (
                    <a href={`${waLink}?text=${encodeURIComponent(wa)}`} target="_blank" rel="noreferrer" className="text-[12px] font-semibold text-pf-success hover:underline">
                      Mở WhatsApp
                    </a>
                  )}
                  <CopyButton text={wa} />
                </div>
              </div>
              <pre className="max-h-[260px] overflow-auto whitespace-pre-wrap rounded-pf-md border border-pf-border p-2.5 text-[12px] text-pf-body">{wa}</pre>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(m.status === "pending_review" || m.status === "failed") && (
              <>
                <ActionButton disabled={busy} onClick={() => run(url, { action: "approve", send_mode: "window" })}>
                  Gửi (trong giờ của khách)
                </ActionButton>
                <ActionButton disabled={busy} onClick={() => run(url, { action: "approve", send_mode: "now" })}>
                  Gửi ngay
                </ActionButton>
                <ActionButton disabled={busy} danger onClick={() => run(url, { action: "reject" })}>
                  Bỏ
                </ActionButton>
              </>
            )}
            {m.status === "approved" && (
              <ActionButton disabled={busy} onClick={() => run(url, { action: "unapprove" })}>
                Huỷ gửi (về chờ duyệt)
              </ActionButton>
            )}
            <ErrorLine error={error} />
          </div>
        </div>
      )}
    </li>
  );
}

function ActionButton({ children, onClick, disabled, danger }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-8 items-center rounded-pf-md border px-3 text-[12.5px] font-semibold transition-colors disabled:opacity-50 ${
        danger ? "border-pf-danger/30 text-pf-danger hover:bg-pf-danger/10" : "border-pf-border text-pf-body hover:border-pf-border-hi hover:bg-pf-card-hi"
      }`}
    >
      {children}
    </button>
  );
}
