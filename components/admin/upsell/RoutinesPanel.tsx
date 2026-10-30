"use client";

import { useState } from "react";
import { fmtVN } from "@/lib/upsell/format";
import { Button } from "../../ui";
import { FIELD } from "../collections/shared";
import { ErrorLine, Pill, useAct } from "./bits";

/* ==========================================================================
   Routine API — BPU Builder and BPU Ops started at once through their API
   triggers (see lib/upsell/routines.ts): the token of each, where it comes
   from, the last call and what came of it, "Gọi ngay" — and Duyệt / Không
   duyệt: whether a build waits for an admin or runs straight to the customer.
   ========================================================================== */

export type RoutineView = {
  id: "builder" | "ops";
  label: string;
  from: "env" | "panel" | null;
  last: { at: string; reason: string; result: string; ok: boolean; session?: string | null } | null;
};

const WHAT: Record<RoutineView["id"], string> = {
  builder: "Gọi khi có lead mới, khi bạn bấm Build lại / đưa lại vào hàng đợi, và khi build xong một lead mà hàng đợi còn lead.",
  ops: "Gửi tin: tự gọi khi bạn bấm Duyệt / Gửi ngay, khi page được tự duyệt, và khi tới giờ hành chính của khách có tin đang chờ. Không có lịch chạy: bấm Chạy đầy đủ để tìm store mới cài, theo dõi khách và soạn follow-up.",
};

export function RoutinesPanel({ routines, approval }: { routines: RoutineView[]; approval?: "review" | "auto" }) {
  return (
    <section className="grid gap-3 rounded-pf-card border border-pf-border bg-pf-card p-4">
      {approval && <ApprovalSwitch mode={approval} />}
      <div>
        <h3 className="text-[14px] font-semibold text-pf-text">Routine API — chạy ngay, không chờ tới giờ</h3>
        <p className="text-[12px] text-pf-muted">
          Không routine nào chạy theo lịch — PageFly Design gọi chúng qua API trigger khi có việc. Mỗi routine cần token: trên claude.ai mở routine → Triggers → thêm API
          trigger → tạo token, rồi dán vào đây. Hệ thống kiểm tra lại mỗi 5 phút nên một lần gọi bị lỡ cũng chỉ trễ vài phút.
        </p>
      </div>
      {routines.map((r) => (
        <RoutineRow key={r.id} r={r} />
      ))}
    </section>
  );
}

function RoutineRow({ r }: { r: RoutineView }) {
  const [token, setToken] = useState("");
  const [run, busy, error] = useAct();
  const url = "/api/admin/upsell/routines";
  return (
    <div className="grid gap-2 rounded-pf-md border border-pf-border bg-pf-bg-deep p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold text-pf-text">{r.label}</span>
        {r.from ? <Pill tone="ok">{r.from === "env" ? "Token trong .env của VPS" : "Đã có token"}</Pill> : <Pill tone="warn">Chưa có token — routine không được gọi</Pill>}
        <Button size="sm" icon="Rocket" disabled={busy || !r.from} onClick={() => void run(url, { routine: r.id, action: "fire" })}>
          {r.id === "ops" ? "Gửi tin ngay" : "Gọi ngay"}
        </Button>
        {r.id === "ops" && (
          <Button size="sm" variant="ghost" icon="RefreshCw" disabled={busy || !r.from} onClick={() => void run(url, { routine: "ops", action: "fire_full" })}>
            Chạy đầy đủ
          </Button>
        )}
      </div>
      <p className="text-[12px] text-pf-faint">{WHAT[r.id]}</p>
      {r.last && (
        <p className="text-[12px] text-pf-muted">
          Lần gọi gần nhất {fmtVN(r.last.at)} · {r.last.reason} ·{" "}
          <span className={r.last.ok ? "text-pf-success" : "text-pf-warn"}>{r.last.result}</span>
          {r.last.session && (
            <>
              {" "}
              ·{" "}
              <a href={r.last.session} target="_blank" rel="noreferrer" className="text-pf-primary-hi hover:underline">
                mở phiên
              </a>
            </>
          )}
        </p>
      )}
      {r.from !== "env" && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={r.from ? "Dán token mới để thay" : "Dán token API trigger"}
            className={`${FIELD} w-[320px]`}
            aria-label={`Token ${r.label}`}
          />
          <Button
            size="sm"
            variant="ghost"
            disabled={busy || !token.trim()}
            onClick={() => void run(url, { routine: r.id, action: "token", token }).then((ok) => ok && setToken(""))}
          >
            Lưu token
          </Button>
          {r.from === "panel" && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(url, { routine: r.id, action: "token", token: "" })}>
              Xoá token
            </Button>
          )}
        </div>
      )}
      <ErrorLine error={error} />
    </div>
  );
}

/** Duyệt: pages and messages wait for you. Không duyệt: built, approved and sent in one go. */
function ApprovalSwitch({ mode }: { mode: "review" | "auto" }) {
  const [run, busy, error] = useAct();
  const opts = [
    { id: "review", label: "Duyệt", hint: "Build xong, page và tin chờ bạn duyệt rồi mới gửi khách." },
    { id: "auto", label: "Không duyệt", hint: "Build xong là tự duyệt và gửi tin cho khách ngay, chạy một mạch — không chờ bạn, không chờ giờ của khách." },
  ] as const;
  return (
    <div className="grid gap-2 rounded-pf-md border border-pf-border bg-pf-bg-deep p-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[13px] font-semibold text-pf-text">Duyệt trước khi gửi</span>
        <div role="radiogroup" aria-label="Duyệt trước khi gửi" className="flex gap-1 rounded-xl border border-pf-border bg-pf-surface/60 p-1">
          {opts.map((o) => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={mode === o.id}
              disabled={busy}
              onClick={() => mode !== o.id && void run("/api/admin/upsell/routines", { action: "approval", mode: o.id })}
              className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors disabled:opacity-60 ${
                mode === o.id ? (o.id === "auto" ? "bg-pf-success text-white" : "bg-pf-primary text-white") : "text-pf-muted hover:text-pf-text"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <span className="text-[12px] text-pf-muted">{opts.find((o) => o.id === mode)?.hint}</span>
      </div>
      <p className="text-[11.5px] text-pf-faint">
        Đổi cùng lúc: Chờ duyệt page, Tin nhắn build page, tin khách đã xem và tin khách đã tải (loại tin đang Tắt vẫn tắt). Page và tin đang chờ từ trước vẫn cần duyệt tay.
      </p>
      <ErrorLine error={error} />
    </div>
  );
}
