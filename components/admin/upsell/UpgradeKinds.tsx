import Link from "next/link";
import type { Filters } from "@/lib/upsell/adminQueries";
import { UPGRADE_KIND_LABEL, money, type UpgradeKind } from "@/lib/upsell/format";

/* ==========================================================================
   Đã nâng cấp, split by what the customer did before upgrading — thường
   (nothing), organic (read, or read and viewed), claim (read, viewed and
   downloaded). Each tile filters the table below; pressed again, it clears.
   ========================================================================== */

const KINDS: UpgradeKind[] = ["normal", "organic", "claim"];

export function UpgradeKinds({ counts, current, f }: { counts: Record<UpgradeKind, { n: number; mrr: number }>; current?: string; f: Filters }) {
  const total = KINDS.reduce((s, k) => s + counts[k].n, 0);
  const href = (k: UpgradeKind | null) => {
    const sp = new URLSearchParams({ tab: "upgraded" });
    for (const [key, v] of Object.entries(f)) if (v && key !== "page" && key !== "up") sp.set(key, String(v));
    if (k) sp.set("up", k);
    return `/design/admin/upsell?${sp}`;
  };
  return (
    <section className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {KINDS.map((k) => {
        const on = current === k;
        return (
          <Link
            key={k}
            href={href(on ? null : k)}
            aria-current={on ? "true" : undefined}
            className={`grid gap-0.5 rounded-pf-card border px-4 py-3 transition-colors ${
              on ? "border-pf-primary bg-pf-primary/10" : "border-pf-border bg-pf-card hover:border-pf-primary"
            }`}
          >
            <span className="text-[12px] font-semibold text-pf-text">{UPGRADE_KIND_LABEL[k].label}</span>
            <span className="text-[24px] font-semibold leading-tight text-pf-text">
              {counts[k].n}
              <span className="ml-2 text-[12px] font-normal text-pf-muted">{total ? `${Math.round((counts[k].n / total) * 100)}%` : "—"}</span>
            </span>
            <span className="text-[11.5px] text-pf-faint">
              {UPGRADE_KIND_LABEL[k].hint} · MRR <span className="text-pf-success">{money(counts[k].mrr)}</span>
            </span>
          </Link>
        );
      })}
    </section>
  );
}
