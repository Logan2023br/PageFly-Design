"use client";

import { Button } from "../../ui";
import { ErrorLine, useAct } from "../upsell/bits";

/* The report's toolbar buttons. Tải PDF is the browser's print with "Save as
   PDF": the page has a print layout (A4, white, no toolbar), and its title
   becomes the file name. */

export function PrintButton() {
  return (
    <Button size="sm" icon="Download" onClick={() => window.print()}>
      Tải PDF
    </Button>
  );
}

export function RegenerateButton({ upsell, week, label }: { upsell: string; week: string; label: string }) {
  const [run, busy, error] = useAct();
  return (
    <div className="grid justify-items-end gap-1">
      <Button size="sm" variant="ghost" icon="RefreshCw" disabled={busy} onClick={() => void run(`/api/admin/reports/${upsell}/${week}`, {})}>
        {busy ? "Đang tạo…" : label}
      </Button>
      <ErrorLine error={error} />
    </div>
  );
}
