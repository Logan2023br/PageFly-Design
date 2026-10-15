"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { STATUS_LABEL, statusTone } from "@/lib/upsell/format";
import { Icon } from "../../ui";
import { api } from "../collections/shared";

/* The small pieces every Upsell screen uses. */

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-pf-pill border px-2 py-0.5 text-[11px] font-semibold ${statusTone(status)}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function Pill({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "warn" | "ok" | "bad" | "primary" }) {
  const tones = {
    muted: "border-pf-border bg-pf-card-hi text-pf-muted",
    warn: "border-pf-warn/30 bg-pf-warn/10 text-pf-warn",
    ok: "border-pf-success/30 bg-pf-success/10 text-pf-success",
    bad: "border-pf-danger/30 bg-pf-danger/10 text-pf-danger",
    primary: "border-pf-primary-hi/30 bg-pf-primary/10 text-pf-primary-hi",
  }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-pf-pill border px-2 py-0.5 text-[11px] font-semibold ${tones}`}>{children}</span>;
}

/**
 * One admin action: POST, then re-read the server-rendered screen.
 * Returns [run, busy, error]. The error stays on screen until the next try —
 * a refusal (409: someone else already approved it) must be read, not
 * flashed.
 */
export function useAct(): [(url: string, body: unknown) => Promise<boolean>, boolean, string | null] {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const run = async (url: string, body: unknown) => {
    setBusy(true);
    setError(null);
    const r = await api(url, { method: "POST", body: JSON.stringify(body) });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return false;
    }
    startTransition(() => router.refresh());
    return true;
  };
  return [run, busy, error];
}

/**
 * The thumbnail when there is one; otherwise the page itself, live, scaled
 * down. The Builder may send no PNG and Playwright may not be installed, and
 * a grey box would make the reviewer open every lead to see anything.
 */
export function PageThumb({ designId, slot, version, label, height = 220 }: { designId: string; slot: number; version?: number; label: string; height?: number }) {
  const [failed, setFailed] = useState(false);
  const v = version ? `?v=${version}` : "";
  if (!failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/upsell/thumb/${designId}/${slot}${v}`}
        alt={label}
        onError={() => setFailed(true)}
        className="w-full rounded-pf-md border border-pf-border bg-white object-cover object-top"
        style={{ height }}
        loading="lazy"
      />
    );
  }
  const scale = 0.25;
  return (
    <div className="relative w-full overflow-hidden rounded-pf-md border border-pf-border bg-white" style={{ height }} aria-label={label}>
      <iframe
        src={`/upsell/preview/${designId}/${slot}${v}`}
        title={label}
        sandbox="allow-scripts allow-same-origin"
        loading="lazy"
        tabIndex={-1}
        className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
        style={{ width: `${100 / scale}%`, height: height / scale, transform: `scale(${scale})` }}
      />
    </div>
  );
}

/**
 * The lead's Crisp conversation, in a new tab — or "—" without one. Only an
 * https link is drawn: the script writes ticket_link, and a stored
 * `javascript:` URL must never become something an admin clicks.
 */
export function CrispLink({ href, label = "Mở Crisp" }: { href: string | null | undefined; label?: string }) {
  if (!href || !/^https:\/\//i.test(href)) return <span className="text-pf-faint">—</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-pf-md border border-pf-border px-2.5 text-[12px] font-semibold text-pf-body transition-colors hover:border-pf-border-hi hover:bg-pf-card-hi hover:text-pf-text"
    >
      <Icon name="MessageSquare" size={13} />
      {label}
    </a>
  );
}

export function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return <p className="text-[12.5px] font-medium text-pf-danger">{error}</p>;
}
