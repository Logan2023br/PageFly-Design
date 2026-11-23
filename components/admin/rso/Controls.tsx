"use client";

import { useState } from "react";
import { FIELD } from "../collections/shared";
import { Button } from "../../ui";
import { ErrorLine, useAct } from "../upsell/bits";

/* The Radar Sold Out screen's buttons. Each posts, then the server-rendered
   screen is read again (useAct). */

const RUN = "/api/admin/rso/run";
const row = (id: string) => `/api/admin/rso/targets/${id}`;

export function RunControls({ on }: { on: boolean }) {
  const [run, busy, error] = useAct();
  return (
    <div className="grid justify-items-end gap-1">
      <div className="flex flex-wrap items-center gap-2">
        {on ? (
          <Button size="sm" variant="ghost" icon="Pause" disabled={busy} onClick={() => void run(RUN, { action: "pause" })}>
            Tạm dừng
          </Button>
        ) : (
          <Button size="sm" icon="Play" disabled={busy} onClick={() => void run(RUN, { action: "start" })}>
            Bắt đầu
          </Button>
        )}
        {on && (
          <Button size="sm" icon="RefreshCw" disabled={busy} onClick={() => void run(RUN, { action: "run" })}>
            {busy ? "Đang chạy…" : "Cập nhật ngay"}
          </Button>
        )}
      </div>
      <ErrorLine error={error} />
    </div>
  );
}

const MODES = [
  { id: "manual", label: "Chờ duyệt", hint: "Tin soạn sẵn nằm ở Cần làm — đọc, sửa, rồi bấm Duyệt & gửi" },
  { id: "auto", label: "Tự động gửi", hint: "Gửi luôn khi đủ điều kiện, không cần duyệt" },
] as const;

export function ModeSwitch({ mode }: { mode: string }) {
  const [run, busy, error] = useAct();
  const current = MODES.find((m) => m.id === mode) ?? MODES[0];
  return (
    <div className="grid gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Chế độ gửi" className="flex gap-1 rounded-xl border border-pf-border bg-pf-bg-deep p-1">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={current.id === m.id}
              disabled={busy}
              onClick={() => current.id !== m.id && void run("/api/admin/rso/settings", { mode: m.id })}
              className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                current.id === m.id ? (m.id === "auto" ? "bg-pf-warn text-black" : "bg-pf-primary text-white") : "text-pf-muted hover:text-pf-text"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <span className="text-[12px] text-pf-muted">{current.hint}</span>
      </div>
      <ErrorLine error={error} />
    </div>
  );
}

/** A message waiting (the heads-up, or the review request with `review`). */
export function MessageBox({ id, status, message, review = false }: { id: string; status: string; message: string; review?: boolean }) {
  const a = (x: string) => (review ? `${x}_review` : x);
  const [run, busy, error] = useAct();
  const [text, setText] = useState(message);
  const changed = text.trim() !== message.trim();
  return (
    <div className="grid gap-2 text-[13px]">
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} className={`${FIELD} text-[12.5px] leading-relaxed`} aria-label="Nội dung tin" />
      <div className="flex flex-wrap items-center gap-2">
        {status === "pending" && (
          <Button size="sm" icon="Send" disabled={busy} onClick={() => void run(row(id), { action: a("approve"), text })}>
            Duyệt & gửi
          </Button>
        )}
        {status === "failed" && (
          <Button size="sm" icon="RefreshCw" disabled={busy} onClick={() => void run(row(id), { action: a("retry") })}>
            Gửi lại
          </Button>
        )}
        {status === "approved" && <span className="text-[12px] text-pf-success">Đã duyệt, gửi trong vài phút</span>}
        {changed && status !== "pending" && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(row(id), { action: a("edit"), text })}>
            Lưu nội dung
          </Button>
        )}
        <Button size="sm" variant="quiet" disabled={busy} onClick={() => void run(row(id), { action: a("skip") })}>
          {review ? "Không xin review" : "Bỏ qua store này"}
        </Button>
      </div>
      <ErrorLine error={error} />
    </div>
  );
}

/** After the heads-up: a check by hand, stop for good, read Crisp now. */
export function CaseButtons({ id, manual }: { id: string; manual: boolean }) {
  const [run, busy, error] = useAct();
  return (
    <div className="grid gap-1">
      <div className="flex flex-wrap gap-2">
        {manual && (
          <>
            <Button size="sm" disabled={busy} onClick={() => void run(row(id), { action: "restocked" })}>
              Đã nhập hàng
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(row(id), { action: "still_out" })}>
              Vẫn hết hàng
            </Button>
          </>
        )}
        <Button size="sm" variant="quiet" disabled={busy} onClick={() => void run(row(id), { action: "track" })}>
          Kiểm tra Crisp
        </Button>
        <Button size="sm" variant="quiet" disabled={busy} onClick={() => void run(row(id), { action: "stop" })}>
          Dừng liên hệ
        </Button>
      </div>
      <ErrorLine error={error} />
    </div>
  );
}

export function SettingsForm({ initial, help, numeric }: { initial: Record<string, string | number>; help: Record<string, string>; numeric: string[] }) {
  const [run, busy, error] = useAct();
  const [v, setV] = useState<Record<string, string>>(Object.fromEntries(Object.entries(initial).map(([k, x]) => [k, String(x)])));
  const [saved, setSaved] = useState(false);
  const save = async () => {
    setSaved(false);
    const patch = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, numeric.includes(k) ? Number(x) : x]));
    if (await run("/api/admin/rso/settings", patch)) setSaved(true);
  };
  return (
    <section className="grid gap-4 rounded-pf-card border border-pf-border bg-pf-card p-4 text-[13px]">
      {Object.keys(initial).map((k) => (
        <label key={k} className="grid gap-1">
          <span className="text-[12.5px] font-semibold text-pf-text">{k}</span>
          {k === "mode" ? (
            <select value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} className={`${FIELD} w-[220px]`}>
              <option value="manual">manual — chờ duyệt</option>
              <option value="auto">auto — gửi luôn</option>
            </select>
          ) : k.endsWith("_template") ? (
            <textarea value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} rows={8} className={`${FIELD} text-[12.5px] leading-relaxed`} />
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
        {saved && <span className="text-[12px] text-pf-success">Đã lưu</span>}
      </div>
      <ErrorLine error={error} />
    </section>
  );
}
