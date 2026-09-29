"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EV, track } from "@/lib/analytics";
import { REFERRAL_GOAL, STATUS_LABEL, progressOf } from "@/lib/referral";
import type { PublicMember, PublicReferral } from "@/lib/referralServer";
import { Icon } from "../ui";
import { useTrackOnce } from "./cpTrack";

/* ==========================================================================
   /collection-pages/referral — the program, and a member's own space in it.

   SIGNED OUT: what the offer is, how it works, the rules, and one form that
   joins or signs in. SIGNED IN: how close they are, the stores they named and
   where each one stands, and the controls to add, fix or remove one.

   THE PROGRESS IS COUNTED IN VERIFIED STORES ONLY. A member who has typed five
   domains is not five-fifths of the way there, and a bar that said so would
   promise a reward before anybody checked. Submitted and verified are both
   shown, so "why is it 2 of 5" answers itself.
   ========================================================================== */

const FIELD =
  "w-full rounded-pf-md border border-pf-border bg-pf-bg-deep px-3.5 py-2.5 text-[14px] text-pf-text outline-none transition-colors placeholder:text-pf-faint focus:border-pf-primary-hi";

type Data = { member: PublicMember; referrals: PublicReferral[] };

async function call(url: string, init?: RequestInit): Promise<({ ok: true } & Partial<Data>) | { ok: false; error: string }> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    });
    return ((await res.json().catch(() => null)) ?? { ok: false, error: `The server answered ${res.status}.` }) as
      | ({ ok: true } & Partial<Data>)
      | { ok: false; error: string };
  } catch {
    return { ok: false, error: "No connection — please try again." };
  }
}

export function ReferralPortal({ initial }: { initial: Data | null }) {
  useTrackOnce(initial ? `in-${initial.member.domain}` : "out", () =>
    track(EV.cpReferralViewed, { signed_in: Boolean(initial), member: initial?.member.domain ?? "" }),
  );
  return initial ? <MemberSpace initial={initial} /> : <JoinScreen />;
}

/* ============================== SIGNED OUT ============================== */

function JoinScreen() {
  const router = useRouter();
  const [domain, setDomain] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = (await call("/api/collection-pages/referral/session", {
      method: "POST",
      body: JSON.stringify({ domain, email, name: name || undefined }),
    })) as { ok: boolean; error?: string; created?: boolean };
    if (res.ok) {
      track(res.created ? EV.cpReferralJoined : EV.cpReferralLoggedIn, { member: domain.trim().toLowerCase() });
      router.refresh();
      return;
    }
    const reason = res.error ?? "Something went wrong.";
    setError(reason);
    track(EV.cpReferralLoginFailed, { reason: reason.slice(0, 120) });
    setBusy(false);
  };

  return (
    <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
      <div>
        <Link
          href="/collection-pages"
          className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-pf-muted transition-colors hover:text-pf-text"
        >
          <Icon name="ArrowLeft" size={14} />
          All sets
        </Link>
        <p className="mt-8 flex items-center gap-1.5 text-[12.5px] font-bold uppercase tracking-[0.1em] text-pf-warn">
          <Icon name="Gift" size={14} />
          Referral program
        </p>
        <h1 className="mt-3 font-display text-[36px] font-bold leading-[1.08] tracking-[-0.02em] text-pf-text sm:text-[46px]">
          Refer {REFERRAL_GOAL} stores.
          <br />
          <span className="bg-gradient-to-r from-pf-warn to-[#f472b6] bg-clip-text text-transparent">
            Get a premium template free.
          </span>
        </h1>
        <p className="mt-4 max-w-[560px] text-[16px] leading-relaxed text-pf-muted">
          Know stores that would love PageFly? When {REFERRAL_GOAL} stores you refer install PageFly
          and upgrade to any paid plan, you pick one premium page set — free, with free edits
          included.
        </p>

        <ol className="mt-8 grid gap-3 sm:grid-cols-3">
          {[
            ["UserPlus", "Join", "Sign up with your store and email — it takes ten seconds."],
            ["ListChecks", "Add the stores", "List each store you refer once it has installed PageFly and upgraded."],
            ["Gift", "Get your template", `We verify each one. At ${REFERRAL_GOAL} verified, a premium set is yours.`],
          ].map(([icon, title, body], i) => (
            <li
              key={title}
              className="relative rounded-pf-card border border-pf-border bg-pf-card p-4 shadow-pf-card"
            >
              <span className="absolute right-4 top-3 font-display text-[28px] font-bold text-pf-text/10">
                {i + 1}
              </span>
              <span className="grid size-9 place-items-center rounded-pf-md bg-pf-warn/15 text-pf-warn">
                <Icon name={icon as "Gift"} size={17} />
              </span>
              <p className="mt-3 text-[14px] font-semibold text-pf-text">{title}</p>
              <p className="mt-1 text-[12.5px] leading-snug text-pf-muted">{body}</p>
            </li>
          ))}
        </ol>

        <Rules />
      </div>

      <form
        onSubmit={(e) => void submit(e)}
        className="relative overflow-hidden rounded-[20px] border border-pf-warn/30 bg-pf-card p-6 shadow-pf-card lg:sticky lg:top-24"
      >
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-pf-warn/15 blur-3xl" />
        <h2 className="relative font-display text-[21px] font-bold text-pf-text">Join or log in</h2>
        <p className="relative mt-1 text-[13.5px] text-pf-muted">
          New here? This creates your space. Already a member? Use the email you joined with.
        </p>
        <div className="relative mt-5 grid gap-4">
          <label className="grid gap-1.5">
            <span className="text-[13px] font-semibold text-pf-body">Your store domain</span>
            <input required value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="your-store.myshopify.com" className={FIELD} />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[13px] font-semibold text-pf-body">Email</span>
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" className={FIELD} />
            <span className="text-[12px] text-pf-faint">We send your reward here — please enter it correctly.</span>
          </label>
          <label className="grid gap-1.5">
            <span className="text-[13px] font-semibold text-pf-body">
              Your name <span className="font-normal text-pf-faint">(optional)</span>
            </span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" autoComplete="name" className={FIELD} />
          </label>
          {error && (
            <p role="alert" className="text-[13px] text-pf-danger">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-pf-md bg-pf-warn px-6 text-[15px] font-bold text-pf-ink shadow-pf-button transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {busy ? "One moment…" : "Log in"}
            {!busy && <Icon name="ArrowRight" size={15} />}
          </button>
        </div>
      </form>
    </div>
  );
}

function Rules() {
  return (
    <div className="mt-8 rounded-pf-card border border-pf-border bg-pf-card/60 p-5">
      <p className="flex items-center gap-2 text-[14px] font-semibold text-pf-text">
        <Icon name="ShieldCheck" size={16} className="text-pf-warn" />
        The rules
      </p>
      <ul className="mt-3 grid gap-2 text-[13px] leading-relaxed text-pf-muted">
        {[
          "A store counts when it has installed PageFly and upgraded to any paid plan.",
          "Each store can be referred by one member only — the first to add it.",
          "Your own store does not count.",
          "We check every store against PageFly’s records before it counts as verified.",
          `At ${REFERRAL_GOAL} verified stores you choose one premium page set, free edits included.`,
        ].map((r) => (
          <li key={r} className="flex gap-2">
            <Icon name="Check" size={14} className="mt-[3px] shrink-0 text-pf-success" />
            {r}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ============================== SIGNED IN =============================== */

const BADGE: Record<PublicReferral["status"], string> = {
  pending: "border-pf-warn/40 bg-pf-warn/10 text-pf-warn",
  verified: "border-pf-success/40 bg-pf-success/10 text-pf-success",
  rejected: "border-pf-danger/40 bg-pf-danger/10 text-pf-danger",
};

function MemberSpace({ initial }: { initial: Data }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ domain: "", plan: "", note: "" });
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState({ domain: "", plan: "", note: "" });
  const [account, setAccount] = useState(false);
  const [contact, setContact] = useState({ email: initial.member.email, name: initial.member.name ?? "" });

  const m = data.member;
  const p = progressOf(data.referrals);
  const paused = m.status === "paused";

  const run = async (
    url: string,
    init: RequestInit,
    onOk: () => void,
  ): Promise<boolean> => {
    setBusy(true);
    setError(null);
    const res = await call(url, init);
    setBusy(false);
    if (res.ok && res.member && res.referrals) {
      setData({ member: res.member, referrals: res.referrals });
      onOk();
      return true;
    }
    const reason = (res as { error?: string }).error ?? "Something went wrong.";
    setError(reason);
    track(EV.cpReferralStoreFailed, { reason: reason.slice(0, 120), member: m.domain });
    return false;
  };

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    void run(
      "/api/collection-pages/referral/stores",
      { method: "POST", body: JSON.stringify(form) },
      () => {
        track(EV.cpReferralStoreAdded, { member: m.domain });
        setForm({ domain: "", plan: "", note: "" });
      },
    );
  };

  const saveEdit = (id: string) =>
    void run(
      "/api/collection-pages/referral/stores",
      { method: "PATCH", body: JSON.stringify({ id, ...edit }) },
      () => {
        track(EV.cpReferralStoreEdited, { member: m.domain });
        setEditing(null);
      },
    );

  const remove = (r: PublicReferral) => {
    if (!window.confirm(`Remove ${r.domain} from your list?`)) return;
    void run(`/api/collection-pages/referral/stores?id=${r.id}`, { method: "DELETE" }, () =>
      track(EV.cpReferralStoreRemoved, { member: m.domain }),
    );
  };

  const saveContact = (e: React.FormEvent) => {
    e.preventDefault();
    void run("/api/collection-pages/referral/me", { method: "PATCH", body: JSON.stringify(contact) }, () =>
      setAccount(false),
    );
  };

  const logout = async () => {
    await call("/api/collection-pages/referral/session", { method: "DELETE" });
    track(EV.cpReferralLoggedOut, { member: m.domain });
    router.refresh();
  };

  return (
    <div className="grid gap-6">
      {/* ---- who is signed in ---- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.1em] text-pf-warn">
            <Icon name="Gift" size={13} />
            Referral program
          </p>
          <h1 className="mt-1 font-display text-[28px] font-bold tracking-[-0.02em] text-pf-text sm:text-[34px]">
            {m.name ? `Welcome back, ${m.name.split(" ")[0]}` : "Your referrals"}
          </h1>
          <p className="mt-1 text-[13.5px] text-pf-muted">
            {m.domain} · {m.email}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAccount((a) => !a)}
            className="inline-flex h-9 items-center gap-1.5 rounded-pf-md border border-pf-border px-3.5 text-[13px] font-semibold text-pf-body transition-colors hover:border-pf-border-hi hover:text-pf-text"
          >
            <Icon name="Pencil" size={13} />
            Edit details
          </button>
          <button
            type="button"
            onClick={() => void logout()}
            className="inline-flex h-9 items-center gap-1.5 rounded-pf-md border border-pf-border px-3.5 text-[13px] font-semibold text-pf-body transition-colors hover:border-pf-danger/60 hover:text-pf-danger"
          >
            <Icon name="LogOut" size={13} />
            Log out
          </button>
        </div>
      </div>

      {account && (
        <form onSubmit={saveContact} className="grid gap-3 rounded-pf-card border border-pf-border bg-pf-card p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="grid gap-1.5">
            <span className="text-[12.5px] font-semibold text-pf-body">Email</span>
            <input required type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} className={FIELD} />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[12.5px] font-semibold text-pf-body">Name</span>
            <input value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} className={FIELD} />
          </label>
          <button type="submit" disabled={busy} className="h-11 rounded-pf-md bg-pf-primary px-5 text-[13.5px] font-semibold text-white hover:bg-pf-primary-hi disabled:opacity-60">
            Save
          </button>
          <p className="text-[12px] text-pf-faint sm:col-span-3">
            Your store domain is your login and cannot be changed here — contact us if it is wrong.
          </p>
        </form>
      )}

      {paused && (
        <p className="flex items-center gap-2 rounded-pf-md border border-pf-warn/40 bg-pf-warn/10 px-4 py-3 text-[13.5px] text-pf-warn">
          <Icon name="CircleAlert" size={15} />
          Your membership is paused, so new stores cannot be added. Contact us to resume it.
        </p>
      )}

      {/* ---- progress ---- */}
      <div className="relative overflow-hidden rounded-[20px] border border-pf-warn/30 bg-[linear-gradient(135deg,#1c1426_0%,#120c1f_60%,#1a1030_100%)] p-6 shadow-pf-card">
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-pf-warn/15 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div>
            <p className="text-[13px] font-semibold text-pf-muted">Verified stores</p>
            <p className="mt-1 font-display text-[44px] font-bold leading-none tracking-[-0.03em] text-pf-text">
              {Math.min(p.verified, REFERRAL_GOAL)}
              <span className="text-[26px] text-pf-faint"> / {REFERRAL_GOAL}</span>
            </p>
            <p className="mt-2 text-[13px] text-pf-muted">
              {p.earned
                ? "Goal reached."
                : `${REFERRAL_GOAL - p.verified} more verified ${REFERRAL_GOAL - p.verified === 1 ? "store" : "stores"} to your free template.`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {Array.from({ length: REFERRAL_GOAL }, (_, i) => {
              const verified = i < p.verified;
              const checking = !verified && i < p.verified + p.pending;
              return (
                <span
                  key={i}
                  title={verified ? "Verified" : checking ? "Being checked" : "Open slot"}
                  className={`grid size-12 place-items-center rounded-2xl border-2 transition-colors ${
                    verified
                      ? "border-pf-success bg-pf-success/20 text-pf-success"
                      : checking
                        ? "border-pf-warn/60 bg-pf-warn/10 text-pf-warn"
                        : "border-dashed border-pf-border-hi text-pf-faint"
                  }`}
                >
                  <Icon name={verified ? "Check" : checking ? "Clock" : "Plus"} size={18} />
                </span>
              );
            })}
            <Icon name="ArrowRight" size={16} className="mx-1 text-pf-faint" />
            <span
              className={`grid size-14 place-items-center rounded-2xl ${
                p.earned
                  ? "bg-gradient-to-br from-pf-warn to-[#f59e0b] text-pf-ink shadow-[0_8px_24px_-6px_rgba(251,191,36,0.7)]"
                  : "border-2 border-dashed border-pf-warn/40 text-pf-warn/60"
              }`}
            >
              <Icon name="Gift" size={24} />
            </span>
          </div>
        </div>
        <div className="relative mt-5 h-2 overflow-hidden rounded-full bg-pf-bg-deep">
          <div
            className="h-full rounded-full bg-gradient-to-r from-pf-warn to-pf-success transition-all duration-700"
            style={{ width: `${(Math.min(p.verified, REFERRAL_GOAL) / REFERRAL_GOAL) * 100}%` }}
          />
        </div>
        <div className="relative mt-4 flex flex-wrap gap-x-6 gap-y-1 text-[12.5px] text-pf-muted">
          <span>{p.total} submitted</span>
          <span className="text-pf-warn">{p.pending} being checked</span>
          <span className="text-pf-success">{p.verified} verified</span>
          {p.rejected > 0 && <span className="text-pf-danger">{p.rejected} not eligible</span>}
        </div>
        {p.earned && (
          <p className="relative mt-5 flex items-start gap-2.5 rounded-pf-md border border-pf-success/40 bg-pf-success/10 px-4 py-3 text-[14px] text-pf-text">
            <Icon name="PartyPopper" size={18} className="mt-px shrink-0 text-pf-success" />
            {m.rewardStatus === "granted"
              ? "Your free premium template has been sent. Thank you for spreading the word!"
              : `You did it! We will email ${m.email} to help you pick your free premium page set.`}
          </p>
        )}
      </div>

      {/* ---- the list ---- */}
      <section className="rounded-pf-card border border-pf-border bg-pf-card p-5 shadow-pf-card">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-[17px] font-semibold text-pf-text">Stores you referred</h2>
            <p className="mt-0.5 text-[13px] text-pf-muted">
              Add a store once it has installed PageFly and moved to a paid plan. We check each one.
            </p>
          </div>
        </div>

        <form onSubmit={add} className="mt-4 grid gap-2 sm:grid-cols-[1.3fr_1fr_1.2fr_auto]">
          <input
            required
            disabled={paused}
            value={form.domain}
            onChange={(e) => setForm({ ...form, domain: e.target.value })}
            placeholder="their-store.myshopify.com"
            aria-label="Store domain"
            className={FIELD}
          />
          <input
            disabled={paused}
            value={form.plan}
            onChange={(e) => setForm({ ...form, plan: e.target.value })}
            placeholder="Plan they upgraded to (optional)"
            aria-label="Plan"
            className={FIELD}
          />
          <input
            disabled={paused}
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder="Note for us (optional)"
            aria-label="Note"
            className={FIELD}
          />
          <button
            type="submit"
            disabled={busy || paused}
            className="inline-flex h-[46px] items-center justify-center gap-1.5 rounded-pf-md bg-pf-primary px-5 text-[13.5px] font-semibold text-white shadow-pf-button transition-colors hover:bg-pf-primary-hi disabled:opacity-60"
          >
            <Icon name="Plus" size={15} />
            Add store
          </button>
        </form>

        {error && (
          <p role="alert" className="mt-3 text-[13px] text-pf-danger">
            {error}
          </p>
        )}

        {data.referrals.length === 0 ? (
          <div className="mt-5 grid place-items-center gap-2 rounded-pf-md border border-dashed border-pf-border px-6 py-10 text-center">
            <Icon name="ListChecks" size={24} className="text-pf-faint" />
            <p className="text-[14px] font-semibold text-pf-text">No stores yet</p>
            <p className="max-w-sm text-[13px] text-pf-muted">Add the first store you referred above.</p>
          </div>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-pf-border text-[11.5px] uppercase tracking-[0.06em] text-pf-faint">
                  <th className="py-2 pr-3 font-semibold">Store</th>
                  <th className="px-3 py-2 font-semibold">Plan</th>
                  <th className="px-3 py-2 font-semibold">Note</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold">Added</th>
                  <th className="py-2 pl-3" />
                </tr>
              </thead>
              <tbody>
                {data.referrals.map((r) =>
                  editing === r.id ? (
                    <tr key={r.id} className="border-b border-pf-border last:border-0">
                      <td className="py-2 pr-2">
                        <input value={edit.domain} onChange={(e) => setEdit({ ...edit, domain: e.target.value })} className={FIELD} aria-label="Store domain" />
                      </td>
                      <td className="px-2 py-2">
                        <input value={edit.plan} onChange={(e) => setEdit({ ...edit, plan: e.target.value })} className={FIELD} aria-label="Plan" />
                      </td>
                      <td className="px-2 py-2">
                        <input value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} className={FIELD} aria-label="Note" />
                      </td>
                      <td colSpan={2} className="px-2 py-2 text-[12px] text-pf-faint">
                        Saving sends it back to be checked.
                      </td>
                      <td className="whitespace-nowrap py-2 pl-2 text-right">
                        <button type="button" onClick={() => saveEdit(r.id)} disabled={busy} className="mr-1 inline-flex h-8 items-center rounded-pf-md bg-pf-primary px-3 text-[12.5px] font-semibold text-white hover:bg-pf-primary-hi">
                          Save
                        </button>
                        <button type="button" onClick={() => setEditing(null)} className="inline-flex h-8 items-center rounded-pf-md px-2 text-[12.5px] text-pf-muted hover:text-pf-text">
                          Cancel
                        </button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={r.id} className="border-b border-pf-border last:border-0">
                      <td className="py-3 pr-3 font-semibold text-pf-text">{r.domain}</td>
                      <td className="px-3 py-3 text-pf-body">{r.plan ?? <span className="text-pf-faint">—</span>}</td>
                      <td className="max-w-[220px] truncate px-3 py-3 text-pf-muted" title={r.note ?? ""}>
                        {r.note ?? <span className="text-pf-faint">—</span>}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-pf-pill border px-2 py-0.5 text-[11.5px] font-semibold ${BADGE[r.status]}`}>
                          <Icon name={r.status === "verified" ? "CircleCheck" : r.status === "rejected" ? "CircleAlert" : "Clock"} size={11} />
                          {STATUS_LABEL[r.status]}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-pf-muted">{new Date(r.createdAt).toLocaleDateString()}</td>
                      <td className="whitespace-nowrap py-3 pl-3 text-right">
                        {r.status === "verified" ? (
                          <span className="inline-flex items-center gap-1 text-[12px] text-pf-faint" title="Verified stores are locked">
                            <Icon name="Lock" size={12} />
                            Locked
                          </span>
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled={paused}
                              onClick={() => {
                                setEditing(r.id);
                                setEdit({ domain: r.domain, plan: r.plan ?? "", note: r.note ?? "" });
                              }}
                              aria-label={`Edit ${r.domain}`}
                              className="grid size-8 place-items-center rounded-pf-md text-pf-muted transition-colors hover:bg-pf-card-hi hover:text-pf-text disabled:opacity-40"
                              style={{ display: "inline-grid" }}
                            >
                              <Icon name="Pencil" size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => remove(r)}
                              aria-label={`Remove ${r.domain}`}
                              className="grid size-8 place-items-center rounded-pf-md text-pf-muted transition-colors hover:bg-pf-danger/10 hover:text-pf-danger"
                              style={{ display: "inline-grid" }}
                            >
                              <Icon name="Trash2" size={13} />
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Rules />
    </div>
  );
}
