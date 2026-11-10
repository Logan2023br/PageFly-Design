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

/**
 * "Gửi bản B": two presses — the first says what will happen, the second
 * does it. Nothing else sends the held half.
 */
export function ReleaseB({ held, auto }: { held: number; auto: boolean }) {
  const [run, busy, error] = useAct();
  const [sure, setSure] = useState(false);
  if (!held) return null;
  return (
    <div className="grid gap-1.5">
      {sure ? (
        <div className="flex flex-wrap items-center gap-2 rounded-pf-md border border-pf-warn/40 bg-pf-warn/10 px-3 py-2 text-[13px]">
          <span className="text-pf-text">
            Gửi tin bản B cho <b>{held}</b> store? {auto ? "Tin đi dần ~10 tin / 2 phút." : "Tin vào Chờ duyệt để bạn duyệt từng tin."}
          </span>
          <Button size="sm" icon="Send" disabled={busy} onClick={() => void run(RUN, { action: "release_b" }).then(() => setSure(false))}>
            {busy ? "Đang xếp hàng…" : "Xác nhận gửi bản B"}
          </Button>
          <Button size="sm" variant="quiet" disabled={busy} onClick={() => setSure(false)}>
            Huỷ
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="ghost" icon="Send" onClick={() => setSure(true)}>
          Gửi bản B cho {held} store
        </Button>
      )}
      <ErrorLine error={error} />
    </div>
  );
}

type Who = { by: string | null; at: string | null };

/**
 * A sent row's handling, one step at a time:
 *   not started   ▶ Tiến hành xử lý · ⊘ Bỏ qua (asks why)
 *   in hand       ● Đang tiến hành xử lý (lit) · ✓ Đã xử lý xong · ✕ Huỷ (to Đã huỷ)
 *   cancelled     ✕ Đã huỷ xử lý (lit) · ▶ Tiến hành xử lý lại · ⊘ Bỏ qua
 *   done          ✓ Đã xử lý xong (lit) — pressed again, back in hand
 *   dismissed     ⊘ Đã bỏ qua (lit, with the reason) — pressed again, back to not started
 */
export function DoneButton({
  id,
  done,
  working,
  dismissed,
  cancelled,
}: {
  id: string;
  done: Who | null;
  working: Who | null;
  dismissed?: (Who & { reason: string | null }) | null;
  cancelled?: Who | null;
}) {
  const [run, busy, error] = useAct();
  const [asking, setAsking] = useState(false);
  const [why, setWhy] = useState("");
  const lit = "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-pf-md border px-3 text-[12.5px] font-semibold transition-colors disabled:opacity-60";
  const go = (action: string, body: Record<string, unknown> = {}) => run(row(id), { action, ...body });
  const who = (w: Who) => (
    <span className="text-[11px] text-pf-faint">
      {w.by ?? ""}
      {w.at ? ` · ${w.at}` : ""}
    </span>
  );

  if (done)
    return (
      <div className="grid justify-items-start gap-1">
        <button type="button" disabled={busy} title="Bấm lần nữa để trở lại Đang xử lý" onClick={() => void go("undone")} className={`${lit} border-pf-success/50 bg-pf-success/15 text-pf-success hover:bg-pf-success/25`}>
          ✓ Đã xử lý xong
        </button>
        {who(done)}
        <ErrorLine error={error} />
      </div>
    );

  if (dismissed)
    return (
      <div className="grid max-w-[220px] justify-items-start gap-1">
        <button type="button" disabled={busy} title="Bấm lần nữa để bỏ đánh dấu" onClick={() => void go("undismiss")} className={`${lit} border-pf-border-hi bg-pf-card-hi text-pf-muted hover:text-pf-text`}>
          ⊘ Đã bỏ qua
        </button>
        {dismissed.reason && <span className="text-[11.5px] text-pf-body">{dismissed.reason}</span>}
        {who(dismissed)}
        <ErrorLine error={error} />
      </div>
    );

  if (working)
    return (
      <div className="grid justify-items-start gap-1.5">
        <span className={`${lit} border-pf-warn/50 bg-pf-warn/15 text-pf-warn`}>● Đang tiến hành xử lý</span>
        {who(working)}
        <Button size="sm" variant="ghost" icon="Check" className="whitespace-nowrap" disabled={busy} onClick={() => void go("done")}>
          Đã xử lý xong
        </Button>
        <Button size="sm" variant="quiet" className="whitespace-nowrap" disabled={busy} onClick={() => void go("cancel")}>
          ✕ Huỷ
        </Button>
        <ErrorLine error={error} />
      </div>
    );

  return (
    <div className="grid justify-items-start gap-1.5">
      {cancelled && (
        <>
          <span className={`${lit} border-pf-danger/50 bg-pf-danger/10 text-pf-danger`}>✕ Đã huỷ xử lý</span>
          {who(cancelled)}
        </>
      )}
      <Button size="sm" icon="Play" className="whitespace-nowrap" disabled={busy} onClick={() => void go("start")}>
        {cancelled ? "Tiến hành xử lý lại" : "Tiến hành xử lý"}
      </Button>
      {asking ? (
        <div className="grid w-[220px] gap-1.5 text-[13px]">
          <textarea
            value={why}
            onChange={(e) => setWhy(e.target.value)}
            rows={3}
            autoFocus
            placeholder="Lý do bỏ qua…"
            className={`${FIELD} text-[12.5px]!`}
            aria-label="Lý do bỏ qua"
          />
          <div className="flex gap-1.5">
            <Button size="sm" variant="ghost" disabled={busy || why.trim().length < 2} onClick={() => void go("dismiss", { text: why.trim() }).then((ok) => ok && setAsking(false))}>
              Xác nhận bỏ qua
            </Button>
            <Button size="sm" variant="quiet" disabled={busy} onClick={() => setAsking(false)}>
              Huỷ
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="ghost" className="whitespace-nowrap" disabled={busy} onClick={() => setAsking(true)}>
          ⊘ Bỏ qua
        </Button>
      )}
      <ErrorLine error={error} />
    </div>
  );
}

export type NoteView = { id: string; stage: string; text: string; by: string; at: string; customer: boolean };

/**
 * The case's notes: as many as needed, each filed under the stage it was
 * written at, and a box to add one. Open by default while the case is in hand.
 */
export function CaseNotes({ id, notes, open }: { id: string; notes: NoteView[]; open: boolean }) {
  const [run, busy, error] = useAct();
  const [text, setText] = useState("");
  return (
    <details open={open || undefined} className="w-[230px] text-[12px]">
      <summary className="cursor-pointer text-pf-muted hover:text-pf-text">Ghi chú ({notes.length})</summary>
      <div className="mt-1.5 grid gap-1.5">
        {/* one thread, numbered in time: the team's notes and, in between, what the customer replied */}
        {notes.map((n, i) => (
          <div key={n.id} className={`rounded-pf-md border px-2 py-1.5 ${n.customer ? "border-pf-primary-hi/40 bg-pf-primary/10" : "border-pf-border bg-pf-bg-deep"}`}>
            <div className="flex items-center justify-between gap-2 text-[10.5px] text-pf-faint">
              <span className={`font-semibold ${n.customer ? "text-pf-primary-hi" : "text-pf-muted"}`}>{n.customer ? "💬 Khách phản hồi" : n.stage}</span>
              <span>{n.customer ? n.at : `${n.by} · ${n.at}`}</span>
            </div>
            <div className="whitespace-pre-wrap text-[12px] text-pf-body">
              <b className="text-pf-text">{i + 1}:</b> {n.text}
            </div>
          </div>
        ))}
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Thêm ghi chú…" className={`${FIELD} text-[12px]!`} aria-label="Ghi chú mới" />
        <Button
          size="sm"
          variant="ghost"
          disabled={busy || !text.trim()}
          onClick={() => void run(row(id), { action: "note", text: text.trim() }).then((ok) => ok && setText(""))}
        >
          {busy ? "Đang lưu…" : "Thêm ghi chú"}
        </Button>
        <ErrorLine error={error} />
      </div>
    </details>
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
