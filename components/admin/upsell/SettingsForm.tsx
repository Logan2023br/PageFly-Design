"use client";

import { useState } from "react";
import { Button } from "../../ui";
import { FIELD, FIELD_LABEL, api } from "../collections/shared";
import { ErrorLine } from "./bits";

/* Tab 11 — every upsell_settings key, with what it does beside it.

   ONLY WHAT CHANGED IS SENT. Saving the whole form wrote every field back
   as it was when the page loaded, so a tab left open (or a second admin)
   pressing Lưu put back values someone else had changed since. */

export function SettingsForm({
  initial,
  help,
  numeric,
}: {
  initial: Record<string, string | number>;
  help: Record<string, string>;
  numeric: string[];
}) {
  const [values, setValues] = useState(initial);
  /* What the server last said is stored — the baseline "changed" is against. */
  const [stored, setStored] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(false);
    const changed = Object.fromEntries(Object.entries(values).filter(([k, v]) => String(v) !== String(stored[k] ?? "")));
    const r = await api<{ settings: Record<string, string | number> }>("/api/admin/upsell/settings", { method: "PUT", body: JSON.stringify(changed) });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setValues(r.settings);
    setStored(r.settings);
    setSaved(true);
  };

  return (
    <div className="grid max-w-[880px] gap-4">
      {Object.keys(initial).map((k) => (
        <label key={k} className="grid gap-1.5">
          <span className={FIELD_LABEL}>{k}</span>
          {k.endsWith("_template") ? (
            <textarea className={`${FIELD} min-h-[200px] font-mono text-[12.5px]`} value={String(values[k] ?? "")} onChange={(e) => setValues({ ...values, [k]: e.target.value })} />
          ) : (
            <input
              className={FIELD}
              type={numeric.includes(k) ? "number" : k === "slack_webhook_url" ? "password" : "text"}
              step="any"
              value={String(values[k] ?? "")}
              onChange={(e) => {
                setSaved(false);
                setValues({ ...values, [k]: e.target.value });
              }}
            />
          )}
          <span className="text-[12px] text-pf-faint">{help[k]}</span>
        </label>
      ))}
      <div className="flex items-center gap-3">
        <Button icon="Check" disabled={busy} onClick={save}>
          Lưu cài đặt
        </Button>
        {saved && <span className="text-[12.5px] text-pf-success">Đã lưu.</span>}
        <ErrorLine error={error} />
      </div>
    </div>
  );
}
