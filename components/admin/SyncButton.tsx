"use client";

import { useState } from "react";
import type { SheetSource } from "@/lib/sheet";
import type { SyncResponse } from "@/app/api/admin/sync/route";
import { Button, Icon } from "../ui";

/* Pulls the allowlist sheet on demand. Separate from the page so the page can
   stay a server component and read the database directly. */
export function SyncButton({ source }: { source: SheetSource }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const sync = async () => {
    setBusy(true);
    setResult(null);
    setFailed(false);
    try {
      const res = await fetch("/api/admin/sync", { method: "POST" });
      const body = (await res.json()) as SyncResponse;
      if (body.ok) {
        setResult(`${body.stores} store${body.stores === 1 ? "" : "s"} synced`);
        // The numbers on screen were rendered before the sync.
        setTimeout(() => window.location.reload(), 700);
      } else {
        setFailed(true);
        setResult(body.error);
      }
    } catch {
      setFailed(true);
      setResult("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {result && (
        <span
          className={`max-w-[420px] text-right text-[11.5px] ${failed ? "text-pf-danger" : "text-pf-success"}`}
        >
          {result}
        </span>
      )}
      {/* Left clickable with no source configured: the click is what explains
          what is missing, and the message names the variable to set. */}
      <Button variant="ghost" size="sm" disabled={busy} onClick={() => void sync()}>
        <Icon name="RefreshCw" size={13} />
        {busy ? "Syncing…" : source === "none" ? "Sync sheet" : `Sync sheet (${source})`}
      </Button>
    </div>
  );
}
