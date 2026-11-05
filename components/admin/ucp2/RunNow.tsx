"use client";

import { Button } from "../../ui";
import { ErrorLine, useAct } from "../upsell/bits";

/** "Cập nhật ngay": one tracking batch now (Crisp, AC2), then the screen again. */
export function RunNow() {
  const [run, busy, error] = useAct();
  return (
    <div className="grid justify-items-end gap-1">
      <Button size="sm" icon="RefreshCw" disabled={busy} onClick={() => void run("/api/admin/ucp2/run", {})}>
        {busy ? "Đang cập nhật…" : "Cập nhật ngay"}
      </Button>
      <ErrorLine error={error} />
    </div>
  );
}
