"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import type { ReferralMemberRecord, ReferralRecord } from "@/lib/db/types";
import { REFERRAL_GOAL, REFERRAL_URL, progressOf } from "@/lib/referral";
import { Button, Icon, Panel } from "../../ui";
import { FIELD, FIELD_LABEL, Segmented, api } from "./shared";

/* ==========================================================================
   ADMIN → COLLECTION PAGES → REFERRAL.

   The program from the team's side: who joined, what they claimed, and the
   one job only the team can do — checking each claimed store against
   PageFly's records and marking it verified or not eligible.

   ORDERED BY WHAT NEEDS DOING. "Needs review" is the default filter because
   an unchecked referral is a member waiting on us; "Reward earned" is next,
   because a member at five verified who has not been sent their template is
   the program failing its one promise.
   ========================================================================== */

type Filter = "review" | "earned" | "all" | "granted" | "paused";
type Data = { members: ReferralMemberRecord[]; referrals: ReferralRecord[] };

const STATUS_STYLE: Record<ReferralRecord["status"], string> = {
  pending: "border-pf-warn/40 bg-pf-warn/10 text-pf-warn",
  verified: "border-pf-success/40 bg-pf-success/10 text-pf-success",
  rejected: "border-pf-danger/40 bg-pf-danger/10 text-pf-danger",
};
const STATUS_TEXT: Record<ReferralRecord["status"], string> = {
  pending: "To check",
  verified: "Verified",
  rejected: "Not eligible",
};

export function ReferralsAdmin({ initial }: { initial: Data }) {
  const [data, setData] = useState(initial);
  const [filter, setFilter] = useState<Filter>(
    initial.referrals.some((r) => r.status === "pending") ? "review" : "all",
  );
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const byMember = (id: string) => data.referrals.filter((r) => r.memberId === id);
  const rows = data.members
    .map((m) => ({ m, refs: byMember(m.id), p: progressOf(byMember(m.id)) }))
    .filter(({ m, refs, p }) => {
      if (filter === "review" && p.pending === 0) return false;
      if (filter === "earned" && !(p.earned && m.rewardStatus !== "granted")) return false;
      if (filter === "granted" && m.rewardStatus !== "granted") return false;
      if (filter === "paused" && m.status !== "paused") return false;
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return (
        m.domain.includes(q) ||
        m.email.includes(q) ||
        (m.name ?? "").toLowerCase().includes(q) ||
        refs.some((r) => r.domain.includes(q))
      );
    });

  const count = {
    members: data.members.length,
    submitted: data.referrals.length,
    review: data.referrals.filter((r) => r.status === "pending").length,
    verified: data.referrals.filter((r) => r.status === "verified").length,
    earned: data.members.filter((m) => progressOf(byMember(m.id)).earned && m.rewardStatus !== "granted").length,
    granted: data.members.filter((m) => m.rewardStatus === "granted").length,
  };

  const apply = async (url: string, init: RequestInit) => {
    setError(null);
    const res = await api<Data>(url, init);
    if (res.ok) setData({ members: res.members, referrals: res.referrals });
    else setError(res.error);
    return res.ok;
  };

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/design/admin/collections"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-pf-muted transition-colors hover:text-pf-text"
        >
          <Icon name="ArrowLeft" size={14} />
          Sets
        </Link>
        <Link
          href={REFERRAL_URL}
          target="_blank"
          className="inline-flex h-9 items-center gap-1.5 rounded-pf-md border border-pf-border px-3.5 text-[13px] font-semibold text-pf-body transition-colors hover:border-pf-border-hi hover:text-pf-text"
        >
          <Icon name="ArrowUpRight" size={14} />
          Open the program page
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {(
          [
            ["Users", "Members", count.members, "joined the program"],
            ["ListChecks", "Stores submitted", count.submitted, "claimed by members"],
            ["Clock", "To check", count.review, "waiting on the team", count.review > 0],
            ["CircleCheck", "Verified", count.verified, "installed and on a paid plan"],
            ["Gift", "Reward owed", count.earned, `at ${REFERRAL_GOAL} verified, not sent yet`, count.earned > 0],
            ["PartyPopper", "Rewards sent", count.granted, "templates handed over"],
          ] as const
        ).map(([icon, label, value, note, alert]) => (
          <Panel key={label} className={`p-4 ${alert ? "border-pf-warn/50" : ""}`}>
            <p className="flex items-center gap-2 text-[12px] font-semibold text-pf-muted">
              <Icon name={icon} size={14} />
              {label}
            </p>
            <p className={`mt-2 font-display text-[28px] font-bold leading-none tabular-nums ${alert ? "text-pf-warn" : "text-pf-text"}`}>
              {value}
            </p>
            <p className="mt-1.5 text-[11.5px] text-pf-faint">{note}</p>
          </Panel>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["review", `Needs review · ${data.members.filter((m) => progressOf(byMember(m.id)).pending > 0).length}`],
              ["earned", `Reward owed · ${count.earned}`],
              ["all", `All members · ${count.members}`],
              ["granted", `Reward sent · ${count.granted}`],
              ["paused", `Paused · ${data.members.filter((m) => m.status === "paused").length}`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              aria-pressed={filter === id}
              className={`rounded-pf-pill border px-3 py-1 text-[12.5px] font-semibold transition-colors ${
                filter === id
                  ? "border-pf-primary-hi/50 bg-pf-primary/15 text-pf-text"
                  : "border-pf-border text-pf-muted hover:text-pf-text"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a store, email or referred store"
          className={`${FIELD} max-w-[320px]`}
        />
      </div>

      {error && (
        <p role="alert" className="text-[13px] text-pf-danger">
          {error}
        </p>
      )}

      {data.members.length === 0 ? (
        <Panel className="grid place-items-center gap-2 px-6 py-16 text-center">
          <Icon name="Gift" size={28} className="text-pf-faint" />
          <p className="text-[14px] font-semibold text-pf-text">Nobody has joined yet</p>
          <p className="max-w-sm text-[13px] text-pf-muted">
            Members join from the box beside the premium sets on /collection-pages.
          </p>
        </Panel>
      ) : rows.length === 0 ? (
        <Panel className="p-8 text-center text-[13px] text-pf-muted">Nothing matches this filter.</Panel>
      ) : (
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-pf-border text-[11px] uppercase tracking-[0.06em] text-pf-faint">
                <th className="px-4 py-2.5 font-semibold">Member</th>
                <th className="px-3 py-2.5 font-semibold">Progress</th>
                <th className="px-3 py-2.5 font-semibold">To check</th>
                <th className="px-3 py-2.5 font-semibold">Reward</th>
                <th className="px-3 py-2.5 font-semibold">Joined</th>
                <th className="px-3 py-2.5 font-semibold">Last login</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ m, refs, p }) => (
                <Fragment key={m.id}>
                  <tr
                    onClick={() => setOpen(open === m.id ? null : m.id)}
                    className="cursor-pointer border-b border-pf-border transition-colors hover:bg-pf-card-hi/50"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Icon
                          name="ChevronRight"
                          size={13}
                          className={`shrink-0 text-pf-faint transition-transform ${open === m.id ? "rotate-90" : ""}`}
                        />
                        <div>
                          <p className="font-semibold text-pf-text">
                            {m.domain}
                            {m.status === "paused" && (
                              <span className="ml-2 rounded-pf-pill border border-pf-border px-1.5 text-[10.5px] font-semibold text-pf-faint">
                                paused
                              </span>
                            )}
                          </p>
                          <p className="text-[12px] text-pf-faint">
                            {m.name ? `${m.name} · ` : ""}
                            {m.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-pf-bg-deep">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-pf-warn to-pf-success"
                            style={{ width: `${(Math.min(p.verified, REFERRAL_GOAL) / REFERRAL_GOAL) * 100}%` }}
                          />
                        </div>
                        <span className="tabular-nums font-semibold text-pf-text">
                          {p.verified}/{REFERRAL_GOAL}
                        </span>
                        <span className="text-[11.5px] text-pf-faint">· {p.total} submitted</span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {p.pending > 0 ? (
                        <span className="font-semibold text-pf-warn">{p.pending}</span>
                      ) : (
                        <span className="text-pf-faint">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {m.rewardStatus === "granted" ? (
                        <span className="rounded-pf-pill border border-pf-success/40 bg-pf-success/10 px-2 py-0.5 text-[11.5px] font-semibold text-pf-success">
                          Sent
                        </span>
                      ) : p.earned ? (
                        <span className="rounded-pf-pill border border-pf-warn/50 bg-pf-warn/15 px-2 py-0.5 text-[11.5px] font-semibold text-pf-warn">
                          Owed
                        </span>
                      ) : (
                        <span className="text-pf-faint">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-pf-muted">{new Date(m.createdAt).toLocaleDateString()}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-pf-muted">
                      {m.lastLoginAt ? new Date(m.lastLoginAt).toLocaleString() : "—"}
                    </td>
                  </tr>
                  {open === m.id && (
                    <tr className="border-b border-pf-border bg-pf-bg-deep/40">
                      <td colSpan={6} className="px-4 py-4">
                        <MemberDetail
                          key={m.updatedAt}
                          member={m}
                          referrals={refs}
                          apply={apply}
                          onDeleted={() => setOpen(null)}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}

/* ---- one member, opened: their details and every store they claimed ---- */
function MemberDetail({
  member,
  referrals,
  apply,
  onDeleted,
}: {
  member: ReferralMemberRecord;
  referrals: ReferralRecord[];
  apply: (url: string, init: RequestInit) => Promise<boolean>;
  onDeleted: () => void;
}) {
  const [f, setF] = useState({
    domain: member.domain,
    email: member.email,
    name: member.name ?? "",
    status: member.status,
    rewardStatus: member.rewardStatus,
    rewardNote: member.rewardNote ?? "",
    adminNote: member.adminNote ?? "",
  });
  const [saved, setSaved] = useState(false);
  const [add, setAdd] = useState({ domain: "", plan: "", note: "" });
  const p = progressOf(referrals);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      await apply("/api/admin/collection-pages/referrals", {
        method: "PATCH",
        body: JSON.stringify({ id: member.id, ...f, name: f.name || null, rewardNote: f.rewardNote || null, adminNote: f.adminNote || null }),
      })
    ) {
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    }
  };

  const setReferral = (r: ReferralRecord, patch: Partial<ReferralRecord>) =>
    apply("/api/admin/collection-pages/referrals/stores", {
      method: "PATCH",
      body: JSON.stringify({
        id: r.id,
        memberId: member.id,
        domain: r.domain,
        plan: r.plan,
        note: r.note,
        status: r.status,
        adminNote: r.adminNote,
        ...patch,
      }),
    });

  return (
    <div className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
      <form onSubmit={(e) => void save(e)} className="grid content-start gap-3">
        <p className="text-[13px] font-semibold text-pf-text">Member details</p>
        <label className="grid gap-1">
          <span className={FIELD_LABEL}>Store</span>
          <input value={f.domain} onChange={(e) => setF({ ...f, domain: e.target.value })} className={FIELD} />
        </label>
        <label className="grid gap-1">
          <span className={FIELD_LABEL}>Email</span>
          <input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className={FIELD} />
        </label>
        <label className="grid gap-1">
          <span className={FIELD_LABEL}>Name</span>
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={FIELD} />
        </label>
        <div className="grid gap-1">
          <span className={FIELD_LABEL}>Membership</span>
          <Segmented
            label="Membership"
            value={f.status}
            onChange={(v) => setF({ ...f, status: v })}
            options={[
              { id: "active", label: "Active" },
              { id: "paused", label: "Paused" },
            ]}
          />
        </div>
        <div className="grid gap-1">
          <span className={FIELD_LABEL}>
            Reward {p.earned ? <span className="normal-case tracking-normal text-pf-warn">· goal reached</span> : null}
          </span>
          <Segmented
            label="Reward"
            value={f.rewardStatus}
            onChange={(v) => setF({ ...f, rewardStatus: v })}
            options={[
              { id: "none", label: "Not sent" },
              { id: "granted", label: "Sent" },
            ]}
          />
          <input
            value={f.rewardNote}
            onChange={(e) => setF({ ...f, rewardNote: e.target.value })}
            placeholder="Which set was sent, and when"
            className={FIELD}
          />
        </div>
        <label className="grid gap-1">
          <span className={FIELD_LABEL}>Team note (never shown to the member)</span>
          <textarea value={f.adminNote} onChange={(e) => setF({ ...f, adminNote: e.target.value })} rows={3} className={`${FIELD} resize-y`} />
        </label>
        <div className="flex items-center gap-2">
          <Button type="submit" size="sm">
            {saved ? "Saved" : "Save member"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="danger"
            icon="Trash2"
            onClick={() => {
              if (!window.confirm(`Delete ${member.domain} and all ${referrals.length} of their referrals?`)) return;
              void apply(`/api/admin/collection-pages/referrals?id=${member.id}`, { method: "DELETE" }).then(
                (ok) => ok && onDeleted(),
              );
            }}
          >
            Delete
          </Button>
        </div>
      </form>

      <div className="grid content-start gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[13px] font-semibold text-pf-text">
            Referred stores · {p.verified}/{REFERRAL_GOAL} verified
          </p>
          <p className="text-[11.5px] text-pf-faint">
            Check each store in PageFly: installed, and on a paid plan.
          </p>
        </div>

        {referrals.length === 0 ? (
          <p className="rounded-pf-md border border-dashed border-pf-border px-4 py-6 text-center text-[12.5px] text-pf-muted">
            No stores claimed yet.
          </p>
        ) : (
          <div className="grid gap-2">
            {referrals.map((r) => (
              <ReferralRow key={`${r.id}-${r.updatedAt}`} r={r} onChange={(patch) => setReferral(r, patch)} onDelete={() => {
                if (!window.confirm(`Delete ${r.domain}?`)) return;
                void apply(`/api/admin/collection-pages/referrals/stores?id=${r.id}`, { method: "DELETE" });
              }} />
            ))}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void apply("/api/admin/collection-pages/referrals/stores", {
              method: "POST",
              body: JSON.stringify({ memberId: member.id, ...add, status: "pending" }),
            }).then((ok) => ok && setAdd({ domain: "", plan: "", note: "" }));
          }}
          className="grid gap-2 rounded-pf-md border border-pf-border p-3 sm:grid-cols-[1.3fr_1fr_1fr_auto]"
        >
          <input required value={add.domain} onChange={(e) => setAdd({ ...add, domain: e.target.value })} placeholder="Add a store on their behalf" className={FIELD} />
          <input value={add.plan} onChange={(e) => setAdd({ ...add, plan: e.target.value })} placeholder="Plan" className={FIELD} />
          <input value={add.note} onChange={(e) => setAdd({ ...add, note: e.target.value })} placeholder="Note" className={FIELD} />
          <Button type="submit" size="sm" icon="Plus" className="h-[38px]">
            Add
          </Button>
        </form>
      </div>
    </div>
  );
}

function ReferralRow({
  r,
  onChange,
  onDelete,
}: {
  r: ReferralRecord;
  onChange: (patch: Partial<ReferralRecord>) => Promise<boolean>;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ domain: r.domain, plan: r.plan ?? "", note: r.note ?? "", adminNote: r.adminNote ?? "" });

  return (
    <div className="rounded-pf-md border border-pf-border bg-pf-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <a href={`https://${r.domain}`} target="_blank" rel="noreferrer" className="font-semibold text-pf-text hover:underline">
          {r.domain}
        </a>
        <span className={`rounded-pf-pill border px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[r.status]}`}>
          {STATUS_TEXT[r.status]}
        </span>
        {r.plan && <span className="text-[12px] text-pf-muted">· {r.plan}</span>}
        <span className="text-[11.5px] text-pf-faint">· added {new Date(r.createdAt).toLocaleDateString()}</span>
        <div className="ml-auto flex items-center gap-1.5">
          {r.status !== "verified" && (
            <button type="button" onClick={() => void onChange({ status: "verified" })} className="inline-flex h-7 items-center gap-1 rounded-pf-md bg-pf-success/90 px-2.5 text-[12px] font-semibold text-white hover:bg-pf-success">
              <Icon name="Check" size={12} />
              Verify
            </button>
          )}
          {r.status !== "rejected" && (
            <button type="button" onClick={() => void onChange({ status: "rejected" })} className="inline-flex h-7 items-center rounded-pf-md border border-pf-danger/40 px-2.5 text-[12px] font-semibold text-pf-danger hover:bg-pf-danger/10">
              Not eligible
            </button>
          )}
          {r.status !== "pending" && (
            <button type="button" onClick={() => void onChange({ status: "pending" })} className="inline-flex h-7 items-center rounded-pf-md px-2 text-[12px] font-semibold text-pf-muted hover:text-pf-text">
              Reset
            </button>
          )}
          <button type="button" onClick={() => setEditing((e) => !e)} aria-label="Edit" className="grid size-7 place-items-center rounded-pf-md text-pf-muted hover:bg-pf-card-hi hover:text-pf-text">
            <Icon name="Pencil" size={12} />
          </button>
          <button type="button" onClick={onDelete} aria-label="Delete" className="grid size-7 place-items-center rounded-pf-md text-pf-muted hover:bg-pf-danger/10 hover:text-pf-danger">
            <Icon name="Trash2" size={12} />
          </button>
        </div>
      </div>
      {(r.note || r.adminNote) && !editing && (
        <div className="mt-1.5 grid gap-0.5 text-[12px]">
          {r.note && <p className="text-pf-muted">Member: {r.note}</p>}
          {r.adminNote && <p className="text-pf-warn">Team: {r.adminNote}</p>}
        </div>
      )}
      {editing && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void onChange({ domain: f.domain, plan: f.plan || null, note: f.note || null, adminNote: f.adminNote || null }).then(
              (ok) => ok && setEditing(false),
            );
          }}
          className="mt-3 grid gap-2 sm:grid-cols-2"
        >
          <input value={f.domain} onChange={(e) => setF({ ...f, domain: e.target.value })} placeholder="Store" className={FIELD} />
          <input value={f.plan} onChange={(e) => setF({ ...f, plan: e.target.value })} placeholder="Plan" className={FIELD} />
          <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Member's note" className={FIELD} />
          <input value={f.adminNote} onChange={(e) => setF({ ...f, adminNote: e.target.value })} placeholder="Team note — e.g. why not eligible" className={FIELD} />
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" size="sm">Save</Button>
            <Button type="button" size="sm" variant="quiet" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
