"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { StoreSummary } from "@/lib/db";
import { Icon, Panel } from "../ui";

/* ==========================================================================
   Users.

   Columns chosen for the questions an operator actually has: is this store
   active, how much of its allowance is gone, what did it cost, and did they like
   it. The sheet's own fields (plan, package, country, type) come along because
   they are the segmentation, but they sit after the numbers that decide whether
   anyone needs to act.

   Rating colour is the specified split: 1–3 red, 4–5 green.
   ========================================================================== */

type SortKey = "recent" | "pages" | "tokens" | "rating" | "domain";

export function UsersTable({ stores }: { stores: StoreSummary[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? stores.filter((s) =>
          [s.domain, s.email, s.storeName, s.country, s.userType, s.status]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(needle)),
        )
      : stores;

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      switch (sort) {
        case "pages":
          return b.pagesUsed - a.pagesUsed;
        case "tokens":
          return b.tokens - a.tokens;
        case "rating":
          /* Unrated stores go last rather than counting as zero — "no opinion"
             is not the same as "hated it". */
          return (b.review?.stars ?? -1) - (a.review?.stars ?? -1);
        case "domain":
          return a.domain.localeCompare(b.domain);
        default:
          return (b.lastRunAt ?? b.lastSeenAt ?? "").localeCompare(
            a.lastRunAt ?? a.lastSeenAt ?? "",
          );
      }
    });
    return sorted;
  }, [stores, query, sort]);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex-1 min-w-[220px]">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-pf-faint">
            <Icon name="Search" size={14} />
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search domain, email, store, country…"
            className="h-9 w-full rounded-pf-md border border-pf-border bg-pf-bg-deep pl-9 pr-3 text-[13px] text-pf-text outline-none transition-colors placeholder:text-pf-faint focus:border-pf-primary-hi"
          />
        </label>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          aria-label="Sort by"
          className="h-9 rounded-pf-md border border-pf-border bg-pf-bg-deep px-2.5 text-[12.5px] text-pf-body outline-none focus:border-pf-primary-hi"
        >
          <option value="recent">Most recent</option>
          <option value="pages">Most pages</option>
          <option value="tokens">Most tokens</option>
          <option value="rating">Rating</option>
          <option value="domain">Domain A–Z</option>
        </select>

        <span className="text-[12px] tabular-nums text-pf-muted">
          {rows.length} of {stores.length}
        </span>
      </div>

      {rows.length === 0 ? (
        <Panel className="grid place-items-center gap-2 px-6 py-14 text-center">
          <span className="grid size-10 place-items-center rounded-pf-md border border-pf-border text-pf-faint">
            <Icon name="Users" size={18} />
          </span>
          <p className="text-[13.5px] text-pf-muted">
            {stores.length === 0
              ? "No stores loaded yet — sync the sheet."
              : "Nothing matches that search."}
          </p>
        </Panel>
      ) : (
        /* The table scrolls inside its own container, so the page body never
           scrolls sideways however many columns the sheet grows. */
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[1080px] border-collapse text-left">
            <thead>
              <tr className="border-b border-pf-border text-[11px] uppercase tracking-[0.06em] text-pf-faint">
                <Th>Store</Th>
                <Th>Status</Th>
                <Th className="text-right">Pages</Th>
                <Th className="text-right">Builds</Th>
                <Th className="text-right">Tokens</Th>
                <Th>Rating</Th>
                <Th>Comment</Th>
                <Th>Type</Th>
                <Th>Plan</Th>
                <Th>Country</Th>
                <Th className="text-right">Last activity</Th>
                <Th> </Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((store, i) => (
                <motion.tr
                  key={store.domain}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: Math.min(i * 0.015, 0.25) }}
                  className="border-b border-pf-border/60 text-[12.5px] transition-colors last:border-0 hover:bg-pf-card/60"
                >
                  <Td>
                    <div className="grid gap-0.5">
                      <span className="font-semibold text-pf-text">
                        {store.storeName || store.domain}
                      </span>
                      <span className="text-[11.5px] text-pf-muted">
                        {store.domain}
                      </span>
                      {store.email && (
                        <span className="text-[11px] text-pf-faint">
                          {store.email}
                        </span>
                      )}
                    </div>
                  </Td>

                  <Td>
                    <StatusChip
                      status={store.status}
                      signedIn={Boolean(store.lastSeenAt)}
                    />
                  </Td>

                  <Td className="text-right">
                    <Usage used={store.pagesUsed} limit={store.pageLimit} />
                  </Td>

                  <Td className="text-right tabular-nums text-pf-body">
                    {store.runCount}
                  </Td>

                  <Td className="text-right tabular-nums text-pf-body">
                    {store.tokens.toLocaleString()}
                  </Td>

                  <Td>
                    <Rating stars={store.review?.stars ?? null} />
                  </Td>

                  <Td>
                    <span
                      title={store.review?.comment ?? undefined}
                      className="line-clamp-2 max-w-[220px] text-[11.5px] text-pf-muted"
                    >
                      {store.review?.comment ?? "—"}
                    </span>
                  </Td>

                  <Td className="text-pf-muted">{store.userType ?? "—"}</Td>
                  <Td className="text-pf-muted">
                    <div className="grid gap-0.5">
                      <span>{store.shopifyPlan ?? "—"}</span>
                      {store.currentPlan && (
                        <span className="text-[11px] text-pf-faint">
                          {store.currentPlan}
                        </span>
                      )}
                    </div>
                  </Td>
                  <Td className="text-pf-muted">{store.country ?? "—"}</Td>

                  <Td className="text-right text-pf-muted">
                    <Ago iso={store.lastRunAt ?? store.lastSeenAt} />
                  </Td>

                  <Td className="text-right">
                    <Link
                      href={`/design/admin/users/${encodeURIComponent(store.domain)}`}
                      className="inline-flex items-center gap-1 rounded-pf-sm px-2 py-1 text-[11.5px] font-semibold text-pf-muted transition-colors hover:bg-pf-card hover:text-pf-text"
                    >
                      Pages
                      <Icon name="ArrowUpRight" size={12} />
                    </Link>
                  </Td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}

/* ---- cells --------------------------------------------------------------- */

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th scope="col" className={`whitespace-nowrap px-3 py-2.5 font-semibold ${className}`}>
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-3 py-2.5 align-top ${className}`}>{children}</td>;
}

function StatusChip({
  status,
  signedIn,
}: {
  status: string | null;
  signedIn: boolean;
}) {
  /* Two different facts, and conflating them hides the interesting one: the
     sheet says what the plan is, `signedIn` says whether they ever showed up. */
  const active = /đang|active|using/i.test(status ?? "");
  return (
    <div className="grid gap-1">
      <span
        className={`inline-flex w-fit items-center gap-1 rounded-pf-pill border px-2 py-0.5 text-[11px] font-semibold ${
          active
            ? "border-pf-success/40 bg-pf-success/10 text-pf-success"
            : "border-pf-border text-pf-muted"
        }`}
      >
        {status || "unknown"}
      </span>
      {!signedIn && (
        <span className="text-[10.5px] text-pf-faint">never signed in</span>
      )}
    </div>
  );
}

function Usage({ used, limit }: { used: number; limit: number }) {
  const ratio = limit > 0 ? used / limit : 0;
  const spent = used >= limit;
  return (
    <div className="grid justify-items-end gap-1">
      <span
        className={`text-[12.5px] font-semibold tabular-nums ${
          spent ? "text-pf-danger" : ratio >= 0.8 ? "text-pf-warn" : "text-pf-body"
        }`}
      >
        {used}/{limit}
      </span>
      <span className="block h-1 w-14 overflow-hidden rounded-pf-pill bg-pf-bg-deep">
        <motion.span
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, ratio * 100)}%` }}
          transition={{ type: "spring", stiffness: 240, damping: 28 }}
          className={`block h-full ${
            spent ? "bg-pf-danger" : ratio >= 0.8 ? "bg-pf-warn" : "bg-pf-primary-hi"
          }`}
        />
      </span>
    </div>
  );
}

/** 1–3 red, 4–5 green, as specified. */
function Rating({ stars }: { stars: number | null }) {
  if (stars === null)
    return <span className="text-[11.5px] text-pf-faint">—</span>;

  const good = stars >= 4;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-pf-pill border px-2 py-0.5 text-[11.5px] font-bold tabular-nums ${
        good
          ? "border-pf-success/40 bg-pf-success/10 text-pf-success"
          : "border-pf-danger/40 bg-pf-danger/10 text-pf-danger"
      }`}
    >
      {stars}s
      <span aria-hidden>★</span>
    </span>
  );
}

/** Rendered on the client so the timezone is the operator's, not the server's. */
function Ago({ iso }: { iso: string | null }) {
  if (!iso) return <span className="text-pf-faint">never</span>;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return <span className="text-pf-faint">—</span>;

  return (
    <time
      dateTime={iso}
      title={then.toLocaleString()}
      suppressHydrationWarning
      className="whitespace-nowrap tabular-nums"
    >
      {then.toLocaleDateString(undefined, { day: "numeric", month: "short" })}
    </time>
  );
}
