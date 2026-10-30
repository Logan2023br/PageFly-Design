"use client";

import { useState } from "react";
import { fmtVN } from "@/lib/upsell/format";
import { Button } from "../../ui";
import { FIELD } from "../collections/shared";
import { ErrorLine, Pill, useAct } from "./bits";

/* ==========================================================================
   Routine API — BPU Builder and BPU Ops started at once through their API
   triggers (see lib/upsell/routines.ts): the token of each, where it comes
   from, the last call and what came of it, and "Gọi ngay".
   ========================================================================== */

export type RoutineView = {
  id: "builder" | "ops";
  label: string;
  from: "env" | "panel" | null;
  last: { at: string; reason: string; result: string; ok: boolean; session?: string | null } | null;
};

const WHAT: Record<RoutineView["id"], string> = {
  builder: "Gọi khi có lead mới, khi bạn bấm Build lại / đưa lại vào hàng đợi, và khi build xong một lead mà hàng đợi còn lead.",
  ops: "Gọi (chỉ gửi tin) khi bạn bấm Duyệt / Gửi ngay, khi page được tự duyệt, và khi tới giờ hành chính của khách có tin đang chờ. Lần chạy mỗi giờ vẫn giữ để tìm store mới cài và theo dõi.",
};

export function RoutinesPanel({ routines }: { routines: RoutineView[] }) {
  return (
    <section className="grid gap-3 rounded-pf-card border border-pf-border bg-pf-card p-4">
      <div>
        <h3 className="text-[14px] font-semibold text-pf-text">Routine API — chạy ngay, không chờ tới giờ</h3>
        <p className="text-[12px] text-pf-muted">
          Mỗi routine cần token API trigger: trên claude.ai mở routine → Triggers → thêm API trigger → tạo token, rồi dán vào đây. Hệ thống kiểm tra lại mỗi 5 phút nên
          một lần gọi bị lỡ cũng chỉ trễ vài phút.
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
        {r.from ? <Pill tone="ok">{r.from === "env" ? "Token trong .env của VPS" : "Đã có token"}</Pill> : <Pill tone="warn">Chưa có token — đang chờ lịch chạy</Pill>}
        <Button size="sm" icon="Rocket" disabled={busy || !r.from} onClick={() => void run(url, { routine: r.id, action: "fire" })}>
          Gọi ngay
        </Button>
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
