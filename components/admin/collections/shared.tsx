"use client";

import type { CollectionVisibility } from "@/lib/db/types";
import { Icon } from "../../ui";

/** One admin call, always answering `{ ok }` — a network failure included. */
export async function api<T extends object>(
  url: string,
  init?: RequestInit,
): Promise<({ ok: true } & T) | { ok: false; error: string }> {
  try {
    const res = await fetch(url, {
      ...init,
      headers:
        typeof init?.body === "string" ? { "Content-Type": "application/json" } : init?.headers,
    });
    const body = (await res.json().catch(() => null)) as
      | ({ ok: true } & T)
      | { ok: false; error: string }
      | null;
    return body ?? { ok: false, error: `The server answered ${res.status}.` };
  } catch {
    return { ok: false, error: "No connection — try again." };
  }
}

export function VisibilityBadge({ visibility }: { visibility: CollectionVisibility }) {
  if (visibility === "preview") {
    return (
      <span className="inline-flex items-center gap-1 rounded-pf-pill border border-pf-primary-hi/30 bg-pf-primary/10 px-2 py-0.5 text-[11px] font-semibold text-pf-primary-hi">
        <Icon name="ScanEye" size={11} />
        Visible preview
      </span>
    );
  }
  return visibility === "visible" ? (
    <span className="inline-flex items-center gap-1 rounded-pf-pill border border-pf-success/30 bg-pf-success/10 px-2 py-0.5 text-[11px] font-semibold text-pf-success">
      <Icon name="Eye" size={11} />
      Visible
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-pf-pill border border-pf-border bg-pf-card-hi px-2 py-0.5 text-[11px] font-semibold text-pf-faint">
      <Icon name="EyeOff" size={11} />
      Hidden
    </span>
  );
}

export function AccessBadge({ access, price }: { access: "free" | "paid"; price: string | null }) {
  return access === "paid" ? (
    <span className="inline-flex items-center gap-1 rounded-pf-pill border border-pf-warn/30 bg-pf-warn/10 px-2 py-0.5 text-[11px] font-semibold text-pf-warn">
      <Icon name="Lock" size={11} />
      Paid{price ? ` · ${price}` : ""}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-pf-pill border border-pf-primary-hi/30 bg-pf-primary/10 px-2 py-0.5 text-[11px] font-semibold text-pf-primary-hi">
      <Icon name="Download" size={11} />
      Free download
    </span>
  );
}

/** Two or three mutually exclusive options, drawn as one control. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex w-full items-center gap-0.5 rounded-pf-md border border-pf-border bg-pf-bg-deep p-0.5"
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={`flex-1 whitespace-nowrap rounded-[9px] px-2 py-1.5 text-[12.5px] font-semibold transition-colors ${
            value === o.id ? "bg-pf-card-hi text-pf-text" : "text-pf-faint hover:text-pf-body"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const FIELD =
  "w-full rounded-pf-md border border-pf-border bg-pf-bg-deep px-3 py-2 text-[13px] text-pf-text outline-none transition-colors placeholder:text-pf-faint focus:border-pf-primary-hi";

export const FIELD_LABEL =
  "text-[11.5px] font-semibold uppercase tracking-[0.08em] text-pf-faint";
