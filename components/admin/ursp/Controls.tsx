"use client";

import { useState } from "react";
import { FIELD } from "../collections/shared";
import { Button } from "../../ui";
import { ErrorLine, useAct } from "../upsell/bits";

/* The Upsell Responsive screen's buttons. Each posts, then the server-rendered
   screen is read again (useAct). */

const RUN = "/api/admin/ursp/run";
const row = (id: string) => `/api/admin/ursp/targets/${id}`;

/** Bắt đầu / Tạm dừng, and Cập nhật ngay while it runs. */
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
  { id: "manual", label: "Chờ duyệt", hint: "Tin soạn sẵn nằm ở Chờ duyệt — bạn đọc, sửa, rồi bấm Duyệt & gửi" },
  { id: "auto", label: "Tự động gửi", hint: "Store đủ điều kiện được gửi luôn, không cần duyệt" },
] as const;

/** Chờ duyệt / Tự động gửi — the `mode` setting, from the Chờ gửi tab. */
export function ModeSwitch({ mode }: { mode: string }) {
  const [run, busy, error] = useAct();
  const current = MODES.find((m) => m.id === mode) ?? MODES[1];
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
              onClick={() => current.id !== m.id && void run("/api/admin/ursp/settings", { mode: m.id })}
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
      <p className="text-[11.5px] text-pf-faint">Đổi chế độ chỉ áp dụng cho store tìm thấy từ giờ; tin đang ở Chờ duyệt vẫn chờ bạn duyệt.</p>
      <ErrorLine error={error} />
    </div>
  );
}

/**
 * "Chạy Recap từ ngày": the rows already in the sheet since that day (the
 * latest per store), taken as new — for the weeks before Bắt đầu.
 */
export function RecapBackfill({ defaultFrom }: { defaultFrom: string }) {
  const [run, busy, error] = useAct();
  const [from, setFrom] = useState(defaultFrom);
  const [split, setSplit] = useState(true);
  return (
    <div className="grid gap-1">
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <span className="text-pf-muted">Lấy cả row Recap cũ từ ngày</span>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${FIELD} w-[150px]! py-1!`} aria-label="Từ ngày" />
        <label className="flex items-center gap-1.5 text-pf-muted" title="Mỗi ngày Recap: một nửa store hợp lệ (chọn ngẫu nhiên) được gửi ngay, nửa còn lại giữ cho bản B của A/B test">
          <input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} />
          Chỉ gửi một nửa mỗi ngày (nửa kia giữ cho A/B test)
        </label>
        <Button size="sm" variant="ghost" icon="RefreshCw" disabled={busy || !from} onClick={() => void run(RUN, { action: "backfill", from, split })}>
          {busy ? "Đang bắt đầu…" : "Chạy Recap từ ngày này"}
        </Button>
      </div>
      <ErrorLine error={error} />
    </div>
  );
}

/** "Đã xử lý xong" on a sent row — pressed again (Hoàn tác) it is open again. */
export function DoneButton({ id, done, by, at }: { id: string; done: boolean; by: string | null; at: string | null }) {
  const [run, busy, error] = useAct();
  return (
    <div className="grid gap-1">
      {done ? (
        <>
          <span className="inline-flex items-center gap-1 whitespace-nowrap text-[12px] font-semibold text-pf-success">✓ Đã xử lý xong</span>
          <span className="text-[11px] text-pf-faint">
            {by ?? ""}
            {at ? ` · ${at}` : ""}
          </span>
          <button type="button" disabled={busy} onClick={() => void run(row(id), { action: "undone" })} className="text-left text-[11px] text-pf-faint hover:text-pf-text">
            Hoàn tác
          </button>
        </>
      ) : (
        <Button size="sm" variant="ghost" icon="Check" className="whitespace-nowrap" disabled={busy} onClick={() => void run(row(id), { action: "done" })}>
          Đã xử lý xong
        </Button>
      )}
      <ErrorLine error={error} />
    </div>
  );
}

/** "Kiểm tra lại": Crisp and AC2 for this row, now. */
export function TrackButton({ id }: { id: string }) {
  const [run, busy, error] = useAct();
  return (
    <div className="grid gap-1">
      <button type="button" disabled={busy} onClick={() => void run(row(id), { action: "track" })} className="text-left text-[11px] text-pf-faint hover:text-pf-text">
        {busy ? "Đang kiểm tra…" : "Kiểm tra lại"}
      </button>
      <ErrorLine error={error} />
    </div>
  );
}

/**
 * A message waiting: read it, change it, send it or leave the store out.
 * `followup`: the reminder of a sent row — the same buttons act on it, and
 * skipping it skips only the reminder.
 */
export function QueueActions({ id, status, message, followup = false }: { id: string; status: string; message: string; followup?: boolean }) {
  const a = (x: string) => (followup ? `${x}_followup` : x);
  const [run, busy, error] = useAct();
  const [text, setText] = useState(message);
  const changed = text.trim() !== message.trim();
  return (
    <div className="grid gap-2 text-[13px]">
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={9} className={`${FIELD} font-mono text-[12px] leading-relaxed`} aria-label="Nội dung tin" />
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
        {changed && status !== "pending" && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(row(id), { action: a("edit"), text })}>
            Lưu nội dung
          </Button>
        )}
        <Button size="sm" variant="quiet" disabled={busy} onClick={() => void run(row(id), { action: a("skip") })}>
          {followup ? "Không nhắc lại" : "Bỏ qua store này"}
        </Button>
      </div>
      <ErrorLine error={error} />
    </div>
  );
}

/** A skipped store, sent by hand after all. */
export function SendAnyway({ id }: { id: string }) {
  const [run, busy, error] = useAct();
  return (
    <div className="grid gap-1">
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(row(id), { action: "send_anyway" })}>
        Vẫn gửi
      </Button>
      <ErrorLine error={error} />
    </div>
  );
}

/** Cài đặt: every setting, its help under it; numbers as numbers. */
export function SettingsForm({
  initial,
  help,
  numeric,
  samples,
}: {
  initial: Record<string, string | number>;
  help: Record<string, string>;
  numeric: string[];
  samples: Record<string, string>;
}) {
  const [run, busy, error] = useAct();
  const [v, setV] = useState<Record<string, string>>(Object.fromEntries(Object.entries(initial).map(([k, x]) => [k, String(x)])));
  const [saved, setSaved] = useState(false);
  const save = async () => {
    setSaved(false);
    const patch = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, numeric.includes(k) ? Number(x) : x]));
    if (await run("/api/admin/ursp/settings", patch)) setSaved(true);
  };
  return (
    <section className="grid gap-4 rounded-pf-card border border-pf-border bg-pf-card p-4 text-[13px]">
      {Object.keys(initial).map((k) => {
        const long = k.endsWith("_template");
        return (
          <label key={k} className="grid gap-1">
            <span className="text-[12.5px] font-semibold text-pf-text">{k}</span>
            {k === "mode" ? (
              <select value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} className={`${FIELD} w-[200px]`}>
                <option value="auto">auto — gửi luôn</option>
                <option value="manual">manual — chờ duyệt</option>
              </select>
            ) : long ? (
              <textarea
                value={v[k]}
                onChange={(e) => setV({ ...v, [k]: e.target.value })}
                rows={10}
                placeholder={samples[k] ?? ""}
                className={`${FIELD} font-mono text-[12px] leading-relaxed`}
              />
            ) : (
              <input
                value={v[k]}
                onChange={(e) => setV({ ...v, [k]: e.target.value })}
                inputMode={numeric.includes(k) ? "numeric" : undefined}
                className={`${FIELD} ${numeric.includes(k) ? "w-[140px]" : ""}`}
              />
            )}
            <span className="text-[11.5px] text-pf-faint">{help[k]}</span>
          </label>
        );
      })}
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
