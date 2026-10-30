"use client";

import Link from "next/link";
import { useState } from "react";
import { fmtVN, whatsappText } from "@/lib/upsell/format";
import type { MessageListRow, SsuGroup } from "@/lib/storeSetUpsell/queries";
import { SSU_KIND_LABEL } from "@/lib/storeSetUpsell/types";
import { CopyButton, CrispLink, PhoneLine, Pill } from "../../upsell/bits";

/* ==========================================================================
   Tab — Tin nhắn, as on Upsell Build 2 pages. A button per kind of message
   (the thanks, the care messages, the review asks), each with its drafts,
   its queue, its failures and every one sent — all of it, or only what the
   customer read. Then Có phản hồi: a button per kind of message the reply
   answers, with how many nobody has checked yet.
   ========================================================================== */

const BASE = "/design/admin/collections/upsell?tab=messages";

export type SsuGroupItem = { id: SsuGroup; label: string; pending: number; sent: number; read: number };

function Badge({ n, active, tone }: { n: number; active: boolean; tone: "warn" | "faint" }) {
  return (
    <span className={`rounded-pf-pill px-1.5 text-[11px] ${active ? "bg-white/20" : tone === "warn" ? "bg-pf-warn/20 text-pf-warn" : "bg-pf-card-hi text-pf-faint"}`}>{n}</span>
  );
}

const TAB = "flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-colors";
const on = (active: boolean) => (active ? "bg-pf-primary text-white" : "text-pf-muted hover:text-pf-text");

export function SsuGroupNav({ groups, current, unchecked }: { groups: SsuGroupItem[]; current: SsuGroup | "replied"; unchecked: number }) {
  return (
    <nav aria-label="Loại tin" className="flex flex-wrap gap-1 rounded-xl border border-pf-border bg-pf-surface/60 p-1">
      {groups.map((g) => {
        const active = g.id === current;
        return (
          <Link key={g.id} href={`${BASE}&group=${g.id}`} aria-current={active ? "page" : undefined} className={`${TAB} ${on(active)}`}>
            {g.label}
            {g.pending > 0 && <Badge n={g.pending} active={active} tone="warn" />}
            {g.sent > 0 && (
              <span className={`text-[11px] font-medium ${active ? "text-white/80" : "text-pf-faint"}`} title="Khách đã đọc / tin đã gửi">
                đã đọc {g.read}/{g.sent}
              </span>
            )}
          </Link>
        );
      })}
      <Link href={`${BASE}&group=replied`} aria-current={current === "replied" ? "page" : undefined} className={`${TAB} ${on(current === "replied")}`}>
        Có phản hồi
        <span title="Chưa kiểm tra">
          <Badge n={unchecked} active={current === "replied"} tone={unchecked > 0 ? "warn" : "faint"} />
        </span>
      </Link>
    </nav>
  );
}

function Chips<T extends string>({ label, items, current, href }: { label: string; items: [string, T | undefined, number][]; current: T | undefined; href: (v?: T) => string }) {
  return (
    <nav aria-label={label} className="flex w-fit gap-1 rounded-xl border border-pf-border bg-pf-surface/60 p-1">
      {items.map(([text, v, n]) => (
        <Link
          key={text}
          href={href(v)}
          aria-current={current === v ? "page" : undefined}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-[12px] font-semibold transition-colors ${current === v ? "bg-pf-primary text-white" : "text-pf-muted hover:text-pf-text"}`}
        >
          {text}
          <span className={`rounded-pf-pill px-1.5 text-[11px] ${current === v ? "bg-white/20" : "bg-pf-card-hi text-pf-faint"}`}>{n}</span>
        </Link>
      ))}
    </nav>
  );
}

/** Có phản hồi: a button per kind of message answered, then checked or not. */
export function SsuReplyNav({
  groups,
  current,
  check,
  counts,
}: {
  groups: { id: SsuGroup; label: string }[];
  current: SsuGroup;
  check: "0" | "1" | undefined;
  counts: Record<SsuGroup, { total: number; unchecked: number }>;
}) {
  const c = counts[current];
  return (
    <div className="grid gap-3">
      <nav aria-label="Phản hồi theo loại tin" className="flex flex-wrap gap-1 rounded-xl border border-pf-border bg-pf-surface/60 p-1">
        {groups.map((g) => {
          const active = g.id === current;
          const n = counts[g.id];
          return (
            <Link key={g.id} href={`${BASE}&group=replied&reply=${g.id}`} aria-current={active ? "page" : undefined} className={`${TAB} ${on(active)}`}>
              Phản hồi {g.label.toLowerCase()}
              {n.unchecked > 0 && (
                <span title="Chưa kiểm tra">
                  <Badge n={n.unchecked} active={active} tone="warn" />
                </span>
              )}
              <span className={`text-[11px] font-medium ${active ? "text-white/80" : "text-pf-faint"}`}>{n.total} phản hồi</span>
            </Link>
          );
        })}
      </nav>
      <Chips
        label="Kiểm tra"
        current={check}
        href={(v) => `${BASE}&group=replied&reply=${current}${v ? `&check=${v}` : ""}`}
        items={[
          ["Tất cả", undefined, c.total],
          ["Chưa kiểm tra", "0", c.unchecked],
          ["Đã kiểm tra", "1", c.total - c.unchecked],
        ]}
      />
    </div>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-2">
      <h3 className="text-[13.5px] font-semibold text-pf-text">{title}</h3>
      {children}
    </section>
  );
}

/** Every message of the group already sent, one row each, opening to its text. */
export function SsuSentList({
  rows,
  group,
  read,
  counts,
}: {
  rows: MessageListRow[];
  group: SsuGroup;
  read: "1" | "0" | undefined;
  counts: { sent: number; read: number };
}) {
  return (
    <section className="grid gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-[13.5px] font-semibold text-pf-text">Đã gửi ({counts.sent})</h3>
        <Chips
          label="Đã đọc"
          current={read}
          href={(r) => `${BASE}&group=${group}${r ? `&read=${r}` : ""}`}
          items={[
            ["Tất cả", undefined, counts.sent],
            ["Khách đã đọc", "1", counts.read],
            ["Chưa đọc", "0", counts.sent - counts.read],
          ]}
        />
        {rows.length >= 100 && <span className="text-[11.5px] text-pf-faint">Hiện 100 tin mới nhất.</span>}
      </div>
      {rows.length === 0 ? (
        <p className="text-[12.5px] text-pf-faint">Chưa có tin nào được gửi.</p>
      ) : (
        <ul className="grid gap-1.5">
          {rows.map((m) => (
            <SentRow key={m.id} m={m} />
          ))}
        </ul>
      )}
    </section>
  );
}

function SentRow({ m }: { m: MessageListRow }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-pf-md border border-pf-border bg-pf-card">
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
        <Pill tone="primary">{SSU_KIND_LABEL[m.kind] ?? m.kind}</Pill>
        {m.read_at ? <Pill tone="primary">Khách đã đọc</Pill> : <Pill tone="muted">Chưa đọc</Pill>}
        {m.approved_by === "auto" && <Pill>Tự động</Pill>}
        <span className="ml-auto text-pf-faint">gửi {fmtVN(m.sent_at)}</span>
      </div>
      {open && (
        <div className="grid gap-3 border-t border-pf-border p-3">
          <div className="flex flex-wrap items-center gap-3">
            <Link href={`/design/admin/collections/upsell?tab=all&q=${encodeURIComponent(m.store_domain)}`} className="text-[12px] text-pf-primary-hi hover:underline">
              Mở thẻ khách
            </Link>
            <CrispLink href={m.ticket_link} />
            <CopyButton text={m.content} label="Copy Crisp" />
            <CopyButton text={whatsappText(m.content)} label="Copy WhatsApp" />
          </div>
          <pre className="max-h-[300px] overflow-auto whitespace-pre-wrap rounded-pf-md border border-pf-border bg-pf-bg-deep p-3 text-[12px] leading-relaxed text-pf-body">{m.content}</pre>
        </div>
      )}
    </li>
  );
}
