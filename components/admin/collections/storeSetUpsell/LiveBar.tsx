"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { fmtVN } from "@/lib/upsell/format";
import type { SsuJobState } from "@/lib/storeSetUpsell/types";
import { Button, Icon } from "../../../ui";
import { api } from "../shared";

/* ==========================================================================
   The top line: what the minute job last did, the mode, and "Cập nhật ngay".
   The screen re-reads itself every minute, in step with the job, so a new
   select shows up without a reload — unless somebody is typing in it.
   ========================================================================== */

export function LiveBar({ job, cursor, mode }: { job: SsuJobState | null; cursor: string | null; mode: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState(mode);

  useEffect(() => {
    const t = setInterval(() => {
      const el = document.activeElement;
      if (el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.tagName === "SELECT")) return;
      startTransition(() => router.refresh());
    }, 60_000);
    return () => clearInterval(t);
  }, [router]);

  const runNow = async () => {
    setBusy(true);
    setError(null);
    const r = await api<{ job: SsuJobState }>("/api/admin/collection-pages/store-set-upsell/run", { method: "POST" });
    setBusy(false);
    if (!r.ok) setError(r.error);
    startTransition(() => router.refresh());
  };

  const setMode = async (m: string) => {
    setError(null);
    const r = await api("/api/admin/collection-pages/store-set-upsell/settings", { method: "PUT", body: JSON.stringify({ mode: m }) });
    if (!r.ok) return setError(r.error);
    setCurrent(m);
    startTransition(() => router.refresh());
  };

  const MODES = [
    { id: "manual", label: "Cần duyệt", hint: "Tin soạn sẵn, chờ bạn bấm duyệt mới gửi" },
    { id: "auto", label: "Không cần duyệt", hint: "Khách đủ điều kiện (chưa review 5★) được gửi luôn" },
    { id: "off", label: "Tắt", hint: "Chỉ theo dõi, không soạn tin" },
  ];

  return (
    <div className="grid gap-3 rounded-pf-card border border-pf-border bg-pf-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-pf-faint">Gửi tin</span>
          <div role="radiogroup" aria-label="Chế độ gửi" className="flex gap-1 rounded-xl border border-pf-border bg-pf-surface/60 p-1">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={current === m.id}
                title={m.hint}
                onClick={() => current !== m.id && setMode(m.id)}
                className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                  current === m.id ? (m.id === "auto" ? "bg-pf-warn text-black" : "bg-pf-primary text-white") : "text-pf-muted hover:text-pf-text"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <span className="text-[12px] text-pf-muted">{MODES.find((m) => m.id === current)?.hint}</span>
        </div>
        <Button size="sm" icon="RefreshCw" disabled={busy} onClick={runNow}>
          {busy ? "Đang cập nhật…" : "Cập nhật ngay"}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-pf-muted">
        <span className="inline-flex items-center gap-1.5">
          <Icon name="Clock" size={13} /> Tự cập nhật mỗi phút · lần chạy cuối {fmtVN(job?.at)}
        </span>
        {job && (
          <span>
            Mixpanel: {job.fetched ?? "—"} sự kiện, {job.new_selections ?? 0} lượt mới, {job.new_customers ?? 0} khách mới · kiểm tra {job.checked ?? 0} · soạn{" "}
            {job.drafted ?? 0} · gửi {job.sent ?? 0}
            {job.failed ? ` · lỗi ${job.failed}` : ""} {job.tracked ? `· theo dõi ${job.tracked}` : ""}
          </span>
        )}
        <span className="text-pf-faint">Đã đọc Mixpanel tới {fmtVN(cursor)}</span>
      </div>
      {(job?.errors?.length ?? 0) > 0 && (
        <ul className="grid gap-1 rounded-pf-md border border-pf-warn/30 bg-pf-warn/10 p-2.5 text-[12.5px] text-pf-warn">
          {job!.errors!.map((e) => (
            <li key={e}>⚠ {e}</li>
          ))}
        </ul>
      )}
      {error && <p className="text-[12.5px] font-medium text-pf-danger">{error}</p>}
    </div>
  );
}
