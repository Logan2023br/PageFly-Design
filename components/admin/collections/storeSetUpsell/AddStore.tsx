"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { AddResult } from "@/lib/storeSetUpsell/job";
import { SSU_STATUS_LABEL } from "@/lib/storeSetUpsell/types";
import { Button } from "../../../ui";
import { FIELD, api } from "../shared";

/* "Thêm khách thủ công": a store whose select is older than the Mixpanel
   backfill (a list from a sheet, say). Its own selects are read, it is
   checked like a new store, and a thanks lands on Chờ duyệt — never sent
   from here. */

const BASE = "/design/admin/collections/upsell";

export function AddStore() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<AddResult | null>(null);

  const add = async () => {
    setBusy(true);
    setError(null);
    setDone(null);
    const r = await api<{ result: AddResult }>(`/api/admin/collection-pages/store-set-upsell/add`, {
      method: "POST",
      body: JSON.stringify({ domain }),
    });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setDone(r.result);
    setDomain("");
    startTransition(() => router.refresh());
  };

  const label = (s: string) => SSU_STATUS_LABEL[s as keyof typeof SSU_STATUS_LABEL] ?? s;

  return (
    <div className="grid gap-2 rounded-pf-card border border-pf-border bg-pf-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12.5px] font-semibold text-pf-text">Thêm khách thủ công</span>
        <input
          className={`${FIELD} w-[300px]`}
          placeholder="abc-123.myshopify.com"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && domain.trim() && !busy && add()}
          aria-label="Shopify domain"
          autoComplete="off"
          spellCheck={false}
        />
        <Button size="sm" disabled={busy || !domain.trim()} onClick={add}>
          {busy ? "Đang đọc Mixpanel, AC2, Crisp…" : "Thêm & kiểm tra"}
        </Button>
        <span className="text-[11.5px] text-pf-faint">
          Đọc các lượt Select Store set của store (90 ngày) rồi kiểm tra như khách mới. Tin cảm ơn chỉ được soạn vào Chờ duyệt, không tự gửi.
        </span>
      </div>
      {error && <p className="text-[12.5px] font-medium text-pf-danger">{error}</p>}
      {done && (
        <p className="text-[12.5px] text-pf-body">
          <b>{done.domain}</b> · {done.selections} lượt select ·{" "}
          {done.result === "drafted" ? (
            <>
              đã soạn tin cảm ơn —{" "}
              <Link className="text-pf-primary-hi hover:underline" href={`${BASE}?tab=pending&q=${encodeURIComponent(done.domain)}`}>
                xem ở Chờ duyệt
              </Link>
            </>
          ) : done.result === "exists" ? (
            <>đã có trong danh sách ({label(done.status)}) — không soạn thêm</>
          ) : (
            <>
              {label(done.status)}
              {done.skip_reason ? ` — ${done.skip_reason}` : ""}
            </>
          )}
        </p>
      )}
    </div>
  );
}
