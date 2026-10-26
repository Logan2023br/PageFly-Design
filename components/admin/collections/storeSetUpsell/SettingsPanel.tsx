"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ConnectionState } from "@/lib/storeSetUpsell/settings";
import { SSU_KIND_LABEL } from "@/lib/storeSetUpsell/types";
import { Button } from "../../../ui";
import { ErrorLine, Pill } from "../../upsell/bits";
import { FIELD, FIELD_LABEL, api } from "../shared";

/* ==========================================================================
   Cài đặt: the mode and templates, and the connections (Mixpanel, Crisp,
   AC2). A connection set in the VPS .env wins and cannot be changed here; a
   secret pasted here is never shown again, only "đã đặt".
   ========================================================================== */

const API = "/api/admin/collection-pages/store-set-upsell/settings";

const TEMPLATE_KIND: Record<string, string> = {
  thanks_template: "thanks",
  edit_reminder_template: "edit_reminder",
  care_read_template: "care_read",
  care_upgraded_template: "care_upgraded",
  review_template: "review_ask",
};

export function SettingsPanel({
  initial,
  help,
  numeric,
  connections: initialConnections,
  samples,
}: {
  initial: Record<string, string | number>;
  help: Record<string, string>;
  numeric: string[];
  connections: ConnectionState[];
  samples: Record<string, string>;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, String(v)])));
  const [conn, setConn] = useState<Record<string, string>>({});
  const [connections, setConnections] = useState(initialConnections);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = async (body: Record<string, string>) => {
    setBusy(true);
    setError(null);
    setSaved(false);
    const r = await api<{ connections: ConnectionState[] }>(API, { method: "PUT", body: JSON.stringify(body) });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setConnections(r.connections);
    setConn({});
    setSaved(true);
    router.refresh();
  };

  const keys = Object.keys(initial);
  return (
    <div className="grid gap-6">
      <section className="grid gap-3 rounded-pf-card border border-pf-border bg-pf-card p-4">
        <h3 className="text-[14px] font-semibold text-pf-text">Kết nối</h3>
        <p className="text-[12.5px] text-pf-muted">
          Crisp và AC2 dùng chung token với BPU Ops (Upsell Build Pages). Mixpanel cần một service account của project PageFly Analytics - Production
          (Organization settings → Service accounts) — export API của Mixpanel cho phép 60 lần đọc mỗi giờ, đúng bằng mỗi phút một lần.
        </p>
        <div className="grid gap-2">
          {connections.map((c) => (
            <div key={c.key} className="grid items-center gap-2 md:grid-cols-[320px_1fr_auto]">
              <span className="text-[12.5px] text-pf-body">{c.label}</span>
              {c.from === "env" ? (
                <span className="text-[12px] text-pf-muted">Đặt trong .env của VPS {c.value ? `· ${c.value}` : ""}</span>
              ) : (
                <input
                  className={FIELD}
                  type={c.value === null ? "password" : "text"}
                  placeholder={c.from === "panel" ? (c.value ?? "đã đặt — nhập để thay") : (c.value ?? "chưa đặt")}
                  value={conn[c.key] ?? ""}
                  onChange={(e) => setConn({ ...conn, [c.key]: e.target.value })}
                  autoComplete="off"
                  aria-label={c.label}
                />
              )}
              <Pill tone={c.from ? "ok" : "bad"}>{c.from === "env" ? ".env" : c.from === "panel" ? "đã đặt" : c.from === "default" ? "mặc định" : "chưa đặt"}</Pill>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={busy || Object.values(conn).every((v) => !v.trim())} onClick={() => save(conn)}>
            Lưu kết nối
          </Button>
        </div>
      </section>

      <section className="grid gap-3 rounded-pf-card border border-pf-border bg-pf-card p-4">
        <h3 className="text-[14px] font-semibold text-pf-text">Gửi tin</h3>
        {keys.map((k) => (
          <label key={k} className="grid gap-1">
            <span className={FIELD_LABEL}>{k}</span>
            {k === "mode" || k === "care_mode" ? (
              <select className={FIELD} value={values[k]} onChange={(e) => setValues({ ...values, [k]: e.target.value })}>
                <option value="manual">manual — cần duyệt</option>
                <option value="auto">auto — không cần duyệt, gửi luôn</option>
                <option value="off">off — không soạn tin</option>
              </select>
            ) : k.endsWith("_template") ? (
              <textarea
                className={`${FIELD} min-h-[200px] font-mono text-[12.5px]`}
                value={values[k]}
                placeholder={samples[TEMPLATE_KIND[k]] ?? ""}
                onChange={(e) => setValues({ ...values, [k]: e.target.value })}
              />
            ) : (
              <input
                className={FIELD}
                type={numeric.includes(k) ? "number" : "text"}
                value={values[k]}
                onChange={(e) => setValues({ ...values, [k]: e.target.value })}
              />
            )}
            <span className="text-[11.5px] text-pf-faint">{help[k]}</span>
          </label>
        ))}
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={busy} onClick={() => save(values)}>
            Lưu cài đặt
          </Button>
          {saved && <span className="text-[12.5px] text-pf-success">Đã lưu.</span>}
          <ErrorLine error={error} />
        </div>
      </section>

      <section className="grid gap-3 rounded-pf-card border border-pf-border bg-pf-card p-4">
        <h3 className="text-[14px] font-semibold text-pf-text">Tin mẫu (Your Store, set Aurum, 3 page)</h3>
        <p className="text-[12px] text-pf-muted">
          Tin soạn từ mẫu được viết lại lúc gửi, nên ngày hết hạn, số ngày còn lại và danh sách page là của ngày gửi. Nếu bạn sửa nội dung lúc duyệt thì gửi đúng như bạn sửa.
        </p>
        <div className="grid gap-3 lg:grid-cols-2">
          {Object.entries(samples).map(([k, text]) => (
            <div key={k} className="grid gap-1">
              <span className={FIELD_LABEL}>{SSU_KIND_LABEL[k as keyof typeof SSU_KIND_LABEL] ?? k}</span>
              <pre className="whitespace-pre-wrap rounded-pf-md border border-pf-border bg-pf-bg-deep p-3 font-mono text-[12px] text-pf-body">{text}</pre>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
