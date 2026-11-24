"use client";

import { useState } from "react";
import { FIELD } from "../collections/shared";
import { Button } from "../../ui";
import { ErrorLine, useAct } from "../upsell/bits";
import { URSP_PICS } from "@/lib/ursp/types";

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

/** Slack, when a customer says yes: is the bot set, who is on shift now, and a test send. */
export function SlackCard({
  token,
  channel,
  onShift,
  fallback,
  ids,
}: {
  token: { from: string | null; hint: string | null };
  channel: string;
  onShift: string[];
  fallback: string;
  /** what slack_ts_ids holds now: each name and its id; example ids flagged */
  ids: { name: string; id: string; example: boolean }[];
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ tagged: string[]; missing: string[]; store?: string } | null>(null);
  const ready = Boolean(token.from);
  const test = async () => {
    setBusy(true);
    setError(null);
    setSent(null);
    const res = await fetch(RUN, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "slack_test" }) })
      .then((r) => r.json() as Promise<{ ok: boolean; error?: string; slack?: { tagged: string[]; missing: string[]; store?: string } }>)
      .catch(() => null);
    setBusy(false);
    if (res?.ok && res.slack) setSent(res.slack);
    else setError(res?.error ?? "Không gọi được máy chủ.");
  };
  return (
    <section className="grid gap-2 rounded-pf-card border border-pf-primary-hi/30 bg-pf-card p-4 text-[13px]">
      <h3 className="text-[14px] font-semibold text-pf-text">Slack báo khách đồng ý</h3>
      <ul className="grid gap-1 text-pf-body">
        <li>
          <b className="text-pf-text">Bot token:</b>{" "}
          {ready ? (
            <span className="text-pf-success">đã đặt {token.hint ?? ""} ({token.from === "env" ? ".env của VPS" : "Cài đặt"})</span>
          ) : (
            <span className="text-pf-warn">
              chưa đặt — thêm dòng <code className="rounded bg-pf-bg-deep px-1">URSP_SLACK_BOT_TOKEN=xoxb-…</code> (token của BBBot) vào .env trên VPS, rồi khởi động lại app
            </span>
          )}
        </li>
        <li>
          <b className="text-pf-text">Kênh:</b> {channel.trim() ? <code className="rounded bg-pf-bg-deep px-1">{channel}</code> : <span className="text-pf-warn">chưa đặt — điền slack_channel ngay bên dưới</span>}
        </li>
        <li>
          <b className="text-pf-text">TS phụ trách (slack_ts_ids):</b>{" "}
          {ids.length ? (
            ids.map((x, i) => (
              <span key={x.name}>
                {i > 0 && ", "}
                {x.name} → <code className={`rounded bg-pf-bg-deep px-1 ${x.example ? "text-pf-danger" : ""}`}>{x.id}</code>
                {x.example && <span className="text-pf-danger"> (ID ví dụ, không phải người thật — thay bằng ID thật)</span>}
              </span>
            ))
          ) : (
            <span className="text-pf-muted">chưa điền — bot tự tìm mọi TS theo tên</span>
          )}
        </li>
        <li>
          <b className="text-pf-text">TS trong ca lúc này:</b>{" "}
          {onShift.length ? onShift.join(", ") : <span className="text-pf-muted">không ai theo ts_roster — sẽ tag {fallback}</span>}
        </li>
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" icon="Send" disabled={busy || !ready || !channel.trim()} onClick={() => void test()}>
          {busy ? "Đang gửi…" : "Gửi thử lên Slack"}
        </Button>
        {sent && (
          <span className="text-[12px] text-pf-success">
            Đã gửi{sent.store ? ` (mẫu: ${sent.store})` : ""} — {sent.tagged.length ? `tag ${sent.tagged.join(", ")}` : "không tag ai (chưa TS nào trong ca có Slack ID)"}
            {sent.missing.length > 0 && (
              <span className="text-pf-muted"> · trong ca có {sent.missing.join(", ")} nhưng không có trong slack_ts_ids nên không tag</span>
            )}
          </span>
        )}
      </div>
      <ErrorLine error={error} />
    </section>
  );
}

/** The log sheet: when it was last written, a link, and Đồng bộ ngay. */
export function SheetSync({ url, at, ok, cases, error, email }: { url: string; at: string | null; ok: boolean; cases: number | null; error: string | null; email: string | null }) {
  const [run, busy, err] = useAct();
  return (
    <div className="grid gap-1.5 rounded-pf-card border border-pf-border bg-pf-card px-4 py-2.5 text-[13px]">
      <div className="flex flex-wrap items-center gap-2">
        <strong className="text-pf-text">Google Sheet log:</strong>
        {at ? (
          <span className={ok ? "text-pf-body" : "text-pf-danger"}>
            {ok ? `đồng bộ lúc ${at}${cases !== null ? ` · ${cases} case` : ""}` : `lỗi lúc ${at}`}
          </span>
        ) : (
          <span className="text-pf-muted">chưa đồng bộ lần nào</span>
        )}
        <span className="text-[12px] text-pf-faint">· tự cập nhật 5 phút / lần và ngay sau mỗi thao tác</span>
        <a href={url} target="_blank" rel="noreferrer" className="ml-auto text-pf-primary-hi hover:underline">
          Mở sheet ↗
        </a>
        <Button size="sm" variant="ghost" icon="RefreshCw" disabled={busy} onClick={() => void run(RUN, { action: "sheet_sync" })}>
          {busy ? "Đang đồng bộ…" : "Đồng bộ ngay"}
        </Button>
      </div>
      {!ok && error && <span className="text-[12px] text-pf-danger">{error}</span>}
      {!ok && email && (
        <span className="text-[12px] text-pf-muted">
          Share sheet cho <b data-no-translate className="select-all text-pf-text">{email}</b> quyền Editor rồi bấm Đồng bộ ngay.
        </span>
      )}
      <ErrorLine error={err} />
    </div>
  );
}

type AbLine = { label: string; a: string; b: string; diff: number | null; p: number | null; lead: "A" | "B" | null };

/**
 * Dừng A/B test. While it runs: one button, which opens the reading of
 * which message is winning (computed on the server: abPick) and the two ways
 * to stop — keep A, or keep B. Once stopped: which message every store gets
 * now, a button for the other one, and one to run the test again.
 */
export function AbStop({
  mode,
  pick,
  stopped,
}: {
  mode: "split" | "A" | "B";
  pick: { winner: "A" | "B"; sure: boolean; why: string; lines: AbLine[] };
  /** when and by whom the test was stopped */
  stopped?: { at: string; by: string | null } | null;
}) {
  const [run, busy, error] = useAct();
  const [open, setOpen] = useState(false);
  const set = (m: "split" | "A" | "B") => void run(RUN, { action: "ab_mode", mode: m }).then((ok) => ok && setOpen(false));
  const other = mode === "A" ? "B" : "A";
  const analysis = (
    <div className="grid gap-2">
      <p className={`rounded-pf-md border px-3 py-2 text-[13px] ${pick.sure ? "border-pf-success/40 bg-pf-success/10 text-pf-success" : "border-pf-warn/40 bg-pf-warn/10 text-pf-text"}`}>
        <strong>Bản {pick.winner} đang thắng{pick.sure ? "" : " (chưa chắc chắn)"}.</strong> {pick.why}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-[12.5px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-pf-faint">
              <th className="py-1 pr-3 font-semibold">Chỉ số</th>
              <th className="py-1 pr-3 text-right font-semibold">Bản A</th>
              <th className="py-1 pr-3 text-right font-semibold">Bản B</th>
              <th className="py-1 font-semibold">Hơn</th>
            </tr>
          </thead>
          <tbody>
            {pick.lines.map((l) => (
              <tr key={l.label} className="border-t border-pf-border">
                <td className="py-1.5 pr-3 text-pf-body">{l.label}</td>
                <td className={`py-1.5 pr-3 text-right ${l.lead === "A" ? "font-semibold text-pf-text" : "text-pf-muted"}`}>{l.a}</td>
                <td className={`py-1.5 pr-3 text-right ${l.lead === "B" ? "font-semibold text-pf-text" : "text-pf-muted"}`}>{l.b}</td>
                <td className="py-1.5 text-pf-muted">
                  {l.lead ? `Bản ${l.lead} ${l.diff! > 0 ? "+" : ""}${l.diff} điểm` : "Ngang"}
                  {l.p !== null && <span className={l.p < 0.05 ? "text-pf-success" : "text-pf-faint"}> · p = {l.p}{l.p < 0.05 ? " ✓" : ""}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  /* stopped: the final report — both versions side by side — and the one now running */
  if (mode !== "split")
    return (
      <div className="grid gap-3 rounded-pf-md border border-pf-border-hi bg-pf-bg-deep p-3">
        <h4 className="text-[13px] font-semibold text-pf-text">Báo cáo A/B test</h4>
        {analysis}
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <span className="rounded-pf-pill border border-pf-border-hi bg-pf-card-hi px-2 py-0.5 text-[11.5px] font-semibold text-pf-muted">A/B test đã dừng</span>
          <span className="text-pf-text">
            {stopped?.at ? `Từ ${new Date(stopped.at).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}${stopped.by ? ` (${stopped.by.replace(/^admin:/, "")})` : ""}, ` : ""}
            mọi store mới nhận <b>bản {mode}</b>
            {mode === pick.winner ? " — bản đang thắng." : ` — bản ${pick.winner} đang có số liệu tốt hơn.`}
          </span>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => set(other)}>
            Dừng {mode}, chạy {other}
          </Button>
          <Button size="sm" variant="quiet" disabled={busy} onClick={() => set("split")}>
            ↺ Chạy lại A/B test
          </Button>
        </div>
        <ErrorLine error={error} />
      </div>
    );

  return (
    <div className="grid gap-2">
      {open ? (
        <div className="grid gap-3 rounded-pf-md border border-pf-border-hi bg-pf-bg-deep p-3">
          <h4 className="text-[13px] font-semibold text-pf-text">Báo cáo A/B test</h4>
          {analysis}
          <p className="text-[12px] text-pf-muted">
            Bấm dừng: từ lúc đó mọi store mới nhận <b>bản {pick.winner}</b> (bản thắng); store đang chờ gửi của bản kia được chuyển sang bản {pick.winner}, viết lại. Tin đã gửi giữ nguyên, báo cáo vẫn ở đây.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={busy} onClick={() => set(pick.winner)}>
              ⏹ Dừng & chạy bản {pick.winner} (bản thắng)
            </Button>
            <Button size="sm" variant="quiet" disabled={busy} onClick={() => set(pick.winner === "A" ? "B" : "A")}>
              hoặc giữ bản {pick.winner === "A" ? "B" : "A"}
            </Button>
            <Button size="sm" variant="quiet" disabled={busy} onClick={() => setOpen(false)}>
              Thôi
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="ghost" className="w-fit" onClick={() => setOpen(true)}>
          ⏹ Dừng A/B test
        </Button>
      )}
      <ErrorLine error={error} />
    </div>
  );
}

/**
 * "Gửi bản B": two presses — the first says what will happen, the second
 * does it. Nothing else sends the held half.
 */
export function ReleaseB({ held, auto, variant = "B" }: { held: number; auto: boolean; variant?: "A" | "B" }) {
  const [run, busy, error] = useAct();
  const [sure, setSure] = useState(false);
  if (!held) return null;
  return (
    <div className="grid gap-1.5">
      {sure ? (
        <div className="flex flex-wrap items-center gap-2 rounded-pf-md border border-pf-warn/40 bg-pf-warn/10 px-3 py-2 text-[13px]">
          <span className="text-pf-text">
            Gửi tin bản {variant} cho <b>{held}</b> store? {auto ? "Tin đi dần ~10 tin / 2 phút." : "Tin vào Chờ duyệt để bạn duyệt từng tin."}
          </span>
          <Button size="sm" icon="Send" disabled={busy} onClick={() => void run(RUN, { action: "release_b" }).then(() => setSure(false))}>
            {busy ? "Đang xếp hàng…" : `Xác nhận gửi bản ${variant}`}
          </Button>
          <Button size="sm" variant="quiet" disabled={busy} onClick={() => setSure(false)}>
            Huỷ
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="ghost" icon="Send" onClick={() => setSure(true)}>
          Gửi bản {variant} cho {held} store
        </Button>
      )}
      <ErrorLine error={error} />
    </div>
  );
}

type Who = { by: string | null; at: string | null };

/**
 * A sent row's handling, one step at a time:
 *   not started   ▶ Tiến hành xử lý (and the screen follows it to Đang xử lý)
 *   in hand       ● Đang tiến hành xử lý (lit) · ✓ Đã xử lý xong · ✕ Huỷ (asks why, to Đã bỏ qua; the PIC stays)
 *   done          ✓ Đã xử lý xong (lit) — pressed again, back in hand · ⭐ Gửi xin review (by hand, once)
 *   dismissed     ⊘ Đã bỏ qua (lit, with the reason) — pressed again, back to not started
 */
/**
 * To the tab the case just moved to, loaded afresh: a client navigation can
 * show that tab as it was cached, without the case, so nothing to scroll to.
 */
const freshTo = (url: string) => window.location.assign(url);

export function DoneButton({
  id,
  done,
  working,
  dismissed,
  closed,
  reviewAsked,
  pic,
  review5,
}: {
  id: string;
  /** marked "Đã review 5★" (by, at), or null */
  review5?: Who | null;
  /** who owns the case, shown in every state once chosen */
  pic?: string | null;
  done: Who | null;
  closed?: Who | null;
  working: Who | null;
  dismissed?: (Who & { reason: string | null }) | null;
  reviewAsked?: boolean;
}) {
  const [run, busy, error] = useAct();
  const [asking, setAsking] = useState(false);
  const [why, setWhy] = useState("");
  const [picking, setPicking] = useState(false);
  const picLine = pic ? (
    <span className="inline-flex items-center gap-1 rounded-pf-pill border border-pf-primary-hi/40 bg-pf-primary/15 px-2 py-0.5 text-[11.5px] font-semibold text-pf-primary-hi">
      PIC: {pic}
    </span>
  ) : null;
  /* "Đã review 5★": a toggle on a done (or closed) case — lit once marked, pressed again to unmark */
  const review5Line = () => (
    <div className="grid justify-items-start gap-0.5">
      <button
        type="button"
        disabled={busy}
        aria-pressed={!!review5}
        title={review5 ? "Bấm lần nữa để bỏ đánh dấu" : "Đánh dấu store này đã cho review 5★"}
        onClick={() => void go(review5 ? "unreview5" : "review5")}
        className={`${lit} ${review5 ? "border-pf-warn/60 bg-pf-warn/20 text-pf-warn" : "border-pf-border-hi text-pf-muted hover:text-pf-text"}`}
      >
        {review5 ? "★ Đã review 5★" : "☆ Đã review 5★?"}
      </button>
      {review5 && who(review5)}
    </div>
  );
  const lit = "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-pf-md border px-3 text-[12.5px] font-semibold transition-colors disabled:opacity-60";
  const go = (action: string, body: Record<string, unknown> = {}) => run(row(id), { action, ...body });
  const who = (w: Who) => (
    <span className="text-[11px] text-pf-faint">
      {w.by ?? ""}
      {w.at ? ` · ${w.at}` : ""}
    </span>
  );

  if (closed)
    return (
      <div className="grid justify-items-start gap-1">
        {picLine}
        <button type="button" disabled={busy} title="Bấm lần nữa để mở lại, về Đã xử lý" onClick={() => void go("reopen")} className={`${lit} border-pf-border-hi bg-pf-card-hi text-pf-muted hover:text-pf-text`}>
          ■ Đã kết thúc
        </button>
        {who(closed)}
        {review5Line()}
        <ErrorLine error={error} />
      </div>
    );

  if (done)
    return (
      <div className="grid justify-items-start gap-1">
        {picLine}
        <button type="button" disabled={busy} title="Bấm lần nữa để trở lại Đang xử lý" onClick={() => void go("undone")} className={`${lit} border-pf-success/50 bg-pf-success/15 text-pf-success hover:bg-pf-success/25`}>
          ✓ Đã xử lý xong
        </button>
        {who(done)}
        {review5Line()}
        {!reviewAsked && (
          <Button size="sm" variant="ghost" className="whitespace-nowrap" disabled={busy} onClick={() => void go("ask_review")}>
            ⭐ Gửi xin review
          </Button>
        )}
        {/* closed for good: off to Kết thúc, no more tracking or notices for it */}
        <button
          type="button"
          disabled={busy}
          onClick={() => void go("close").then((ok) => ok && freshTo("/design/admin/responsive?tab=closed"))}
          className={`${lit} border-[#15803d] bg-[#15803d] text-white hover:bg-[#166534]`}
        >
          ■ Kết thúc
        </button>
        <ErrorLine error={error} />
      </div>
    );

  if (dismissed)
    return (
      <div className="grid max-w-[220px] justify-items-start gap-1">
        {picLine}
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
        {picLine}
        <span className={`${lit} border-pf-warn/50 bg-pf-warn/15 text-pf-warn`}>● Đang tiến hành xử lý</span>
        {who(working)}
        <Button size="sm" variant="ghost" icon="Check" className="whitespace-nowrap" disabled={busy} onClick={() => void go("done")}>
          Đã xử lý xong
        </Button>
        {asking ? (
          <div className="grid w-[220px] gap-1.5 text-[13px]">
            <textarea
              value={why}
              onChange={(e) => setWhy(e.target.value)}
              rows={3}
              autoFocus
              placeholder="Lý do huỷ…"
              className={`${FIELD} text-[12.5px]!`}
              aria-label="Lý do huỷ"
            />
            <div className="flex gap-1.5">
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => void go("cancel", { text: why.trim() }).then((ok) => ok && freshTo("/design/admin/responsive?tab=dismissed"))}
              >
                Xác nhận huỷ
              </Button>
              <Button size="sm" variant="quiet" disabled={busy} onClick={() => setAsking(false)}>
                Thôi
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="quiet" className="whitespace-nowrap" disabled={busy} onClick={() => setAsking(true)}>
            ✕ Huỷ
          </Button>
        )}
        <ErrorLine error={error} />
      </div>
    );

  return (
    <div className="grid justify-items-start gap-1.5">
      {picLine}
      <Button size="sm" icon="Play" className="whitespace-nowrap" disabled={busy} onClick={() => setPicking(true)}>
        Tiến hành xử lý
      </Button>
      {picking && (
        <PicDialog
          busy={busy}
          initial={pic ?? ""}
          onCancel={() => setPicking(false)}
          onConfirm={(chosen) =>
            void go("start", { pic: chosen }).then((ok) => ok && freshTo(`/design/admin/responsive?tab=working&focus=${id}#case-${id}`))
          }
          error={error}
        />
      )}
      <ErrorLine error={error} />
    </div>
  );
}

/** "Tiến hành xử lý": who takes the case, then Xác nhận. */
function PicDialog({
  busy,
  initial,
  onCancel,
  onConfirm,
  error,
}: {
  busy: boolean;
  initial: string;
  onCancel: () => void;
  onConfirm: (pic: string) => void;
  error: string | null;
}) {
  const [chosen, setChosen] = useState(initial);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pic-title"
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
      onClick={(e) => e.target === e.currentTarget && !busy && onCancel()}
      onKeyDown={(e) => e.key === "Escape" && !busy && onCancel()}
    >
      <div className="grid w-full max-w-[360px] gap-4 rounded-pf-card border border-pf-border bg-pf-card p-5 shadow-pf-card">
        <div className="grid gap-1">
          <h2 id="pic-title" className="text-[16px] font-bold text-pf-text">
            Tiến hành xử lý
          </h2>
          <p className="text-[13px] text-pf-muted">Chọn người xử lý (PIC) cho case này.</p>
        </div>
        <label className="grid gap-1.5 text-[12.5px] font-semibold text-pf-body">
          Người xử lý
          <select autoFocus value={chosen} onChange={(e) => setChosen(e.target.value)} className={FIELD}>
            <option value="">Chọn người…</option>
            {URSP_PICS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <ErrorLine error={error} />
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="quiet" disabled={busy} onClick={onCancel}>
            Huỷ
          </Button>
          <Button size="sm" icon="Play" disabled={busy || !chosen} onClick={() => onConfirm(chosen)}>
            {busy ? "Đang chuyển…" : "Xác nhận"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export type NoteView = { id: string; stage: string; text: string; by: string; at: string; customer: boolean; auto?: boolean };

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
          <div
            key={n.id}
            className={`rounded-pf-md border px-2 py-1.5 ${n.customer ? "border-pf-primary-hi/40 bg-pf-primary/10" : n.auto ? "border-pf-success/40 bg-pf-success/10" : "border-pf-border bg-pf-bg-deep"}`}
          >
            <div className="flex items-center justify-between gap-2 text-[10.5px] text-pf-faint">
              <span className={`font-semibold ${n.customer ? "text-pf-primary-hi" : n.auto ? "text-pf-success" : "text-pf-muted"}`}>
                {n.customer ? "💬 Khách phản hồi" : n.auto ? `🤖 Tự động · ${n.stage}` : n.stage}
              </span>
              <span>{n.customer || n.auto ? n.at : `${n.by} · ${n.at}`}</span>
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
        const long = k.endsWith("_template") || k === "ts_roster";
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
