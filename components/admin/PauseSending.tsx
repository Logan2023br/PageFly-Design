"use client";

import { fmtVN } from "@/lib/upsell/format";
import { Button } from "../ui";
import { ErrorLine, useAct } from "./upsell/bits";

/* ==========================================================================
   Tạm dừng / Tiếp tục gửi — one button in a module's header. While paused
   the module sends no customer anything; resuming lets what waited go out.
   The module's own route takes { action: "pause", paused }.
   ========================================================================== */

export function PauseSending({ url, paused, at, by, note }: { url: string; paused: boolean; at?: string | null; by?: string | null; note?: string }) {
  const [run, busy, error] = useAct();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {paused && (
        <span className="rounded-full border border-pf-warn/40 bg-pf-warn/10 px-2.5 py-1 text-[12px] font-semibold text-pf-warn">
          ⏸ Đang tạm dừng gửi{at ? ` từ ${fmtVN(at)}` : ""}
          {by ? ` (${by})` : ""}
          {note ? ` · ${note}` : ""}
        </span>
      )}
      <Button
        size="sm"
        variant={paused ? "primary" : "ghost"}
        icon={paused ? "Play" : "Pause"}
        disabled={busy}
        onClick={() => void run(url, { action: "pause", paused: !paused })}
      >
        {paused ? "Tiếp tục gửi" : "Tạm dừng gửi"}
      </Button>
      <ErrorLine error={error} />
    </div>
  );
}
