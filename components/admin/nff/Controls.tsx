"use client";

import { useState } from "react";
import { FIELD } from "../collections/shared";
import { Button } from "../../ui";
import { ErrorLine, useAct } from "../upsell/bits";

/* The Feedback New Feature screen's buttons. Each posts, then the
   server-rendered screen is read again (useAct). */

const RUN = "/api/admin/nff/run";
const row = (id: string) => `/api/admin/nff/targets/${id}`;

export function RunControls({ pending }: { pending: number }) {
  const [run, busy, error] = useAct();
  const [sure, setSure] = useState(false);
  return (
    <div className="grid justify-items-end gap-1">
      <div className="flex flex-wrap items-center gap-2">
        {pending > 0 &&
          (sure ? (
            <>
              <Button size="sm" icon="Send" disabled={busy} onClick={() => void run(RUN, { action: "approve_all" }).then(() => setSure(false))}>
                Gửi {pending} tin ngay
              </Button>
              <Button size="sm" variant="quiet" disabled={busy} onClick={() => setSure(false)}>
                Thôi
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" icon="Send" disabled={busy} onClick={() => setSure(true)}>
              Duyệt & gửi tất cả ({pending})
            </Button>
          ))}
        <Button size="sm" icon="RefreshCw" disabled={busy} onClick={() => void run(RUN, { action: "run" })}>
          {busy ? "Đang chạy…" : "Cập nhật ngay"}
        </Button>
      </div>
      <ErrorLine error={error} />
    </div>
  );
}

/** A message waiting: read, edit, Duyệt & gửi or Bỏ qua. */
export function MessageBox({ id, status, message }: { id: string; status: string; message: string }) {
  const [run, busy, error] = useAct();
  const [text, setText] = useState(message);
  const changed = text.trim() !== message.trim();
  return (
    <div className="grid gap-2 text-[13px]">
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={12} className={`${FIELD} text-[12.5px] leading-relaxed`} aria-label="Nội dung tin" />
      <div className="flex flex-wrap items-center gap-2">
        {status === "pending" && (
          <Button size="sm" icon="Send" disabled={busy} onClick={() => void run(row(id), { action: "approve", text })}>
            Duyệt & gửi
          </Button>
        )}
        {status === "failed" && (
          <Button size="sm" icon="RefreshCw" disabled={busy} onClick={() => void run(row(id), { action: "retry" })}>
            Gửi lại
          </Button>
        )}
        {status === "approved" && <span className="text-[12px] text-pf-success">Đã duyệt — gửi trong vài phút (đợi khách không đang chat với support)</span>}
        {changed && status !== "pending" && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(row(id), { action: "edit", text })}>
            Lưu nội dung
          </Button>
        )}
        {status !== "approved" && (
          <Button size="sm" variant="quiet" disabled={busy} onClick={() => void run(row(id), { action: "skip" })}>
            Bỏ qua store này
          </Button>
        )}
      </div>
      <ErrorLine error={error} />
    </div>
  );
}

export function RowButton({ id, action, label }: { id: string; action: "track" | "unskip"; label: string }) {
  const [run, busy, error] = useAct();
  return (
    <div className="grid gap-1">
      <Button size="sm" variant="quiet" disabled={busy} onClick={() => void run(row(id), { action })}>
        {busy ? "…" : label}
      </Button>
      <ErrorLine error={error} />
    </div>
  );
}

export function SettingsForm({ initial, help, numeric, sample }: { initial: Record<string, string | number>; help: Record<string, string>; numeric: string[]; sample: string }) {
  const [run, busy, error] = useAct();
  const [v, setV] = useState<Record<string, string>>(Object.fromEntries(Object.entries(initial).map(([k, x]) => [k, String(x)])));
  const [saved, setSaved] = useState(false);
  const save = async () => {
    setSaved(false);
    const patch = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, numeric.includes(k) ? Number(x) : x]));
    if (await run("/api/admin/nff/settings", patch)) setSaved(true);
  };
  return (
    <section className="grid gap-4 rounded-pf-card border border-pf-border bg-pf-card p-4 text-[13px]">
      {Object.keys(initial).map((k) => (
        <label key={k} className="grid gap-1">
          <span className="text-[12.5px] font-semibold text-pf-text">{k}</span>
          {k === "template" ? (
            <textarea value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} rows={14} placeholder={sample} className={`${FIELD} text-[12.5px] leading-relaxed`} />
          ) : (
            <input value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} inputMode={numeric.includes(k) ? "numeric" : undefined} className={`${FIELD} ${numeric.includes(k) ? "w-[140px]" : ""}`} />
          )}
          <span className="text-[11.5px] text-pf-faint">{help[k]}</span>
        </label>
      ))}
      <div className="flex items-center gap-3">
        <Button size="sm" icon="Save" disabled={busy} onClick={() => void save()}>
          {busy ? "Đang lưu…" : "Lưu cài đặt"}
        </Button>
        {saved && <span className="text-[12px] text-pf-success">Đã lưu — tin đang Chờ duyệt đã được soạn lại</span>}
      </div>
      <ErrorLine error={error} />
    </section>
  );
}
