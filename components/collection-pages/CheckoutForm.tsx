"use client";

import Link from "next/link";
import { useState } from "react";
import { pagesLabel, type PublicCollectionSet } from "@/lib/collectionPages";
import { Icon } from "../ui";
import { PageThumb } from "../landing/PagePreview";

/* ==========================================================================
   WHAT IS BEING BOUGHT, AND WHO TO SEND IT TO.

   The set on the left so the buyer never fills in a form without seeing what
   it is for; the form on the right asks for the three things an operator
   needs to deliver it — the store it goes into, a name, and an email.

   THE EMAIL IS THE WHOLE DELIVERY. Nothing is paid or sent here; an operator
   checks the order and writes back, so a mistyped address is an order nobody
   can answer. It is asked for twice in effect: the note under the field says
   so, and the confirmation screen repeats the address it will write to.
   ========================================================================== */

const FIELD =
  "w-full rounded-pf-md border border-pf-border bg-pf-bg-deep px-3.5 py-2.5 text-[14.5px] text-pf-text outline-none transition-colors placeholder:text-pf-faint focus:border-pf-primary-hi";

export function CheckoutForm({ set }: { set: PublicCollectionSet }) {
  const [domain, setDomain] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  /* The honeypot — see the orders route. */
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state === "sending") return;
    setState("sending");
    setError(null);
    try {
      const res = await fetch("/api/collection-pages/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ set: set.id, domain, name, email, website }),
      });
      const body = (await res.json().catch(() => null)) as { ok: boolean; error?: string } | null;
      if (body?.ok) {
        setState("sent");
        window.scrollTo({ top: 0 });
        return;
      }
      setError(body?.error ?? "Something went wrong — please try again.");
    } catch {
      setError("No connection — please try again.");
    }
    setState("idle");
  };

  if (state === "sent") {
    return (
      <div className="mx-auto grid max-w-[560px] justify-items-center gap-4 py-12 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-pf-success/15 text-pf-success">
          <Icon name="CircleCheck" size={28} />
        </span>
        <h1 className="font-display text-[28px] font-bold tracking-[-0.02em] text-pf-text sm:text-[32px]">
          We’ve received your details
        </h1>
        <p className="text-[15.5px] leading-relaxed text-pf-muted">
          Thank you for choosing <span className="font-semibold text-pf-text">{set.name}</span>. We
          will check your order and send a confirmation email to{" "}
          <span className="font-semibold text-pf-text">{email}</span>.
        </p>
        <p className="text-[13.5px] text-pf-faint">
          Don’t see it within a day? Check your spam folder.
        </p>
        <Link
          href="/collection-pages"
          className="mt-3 inline-flex items-center gap-2 rounded-pf-md border border-pf-border-hi px-5 py-2.5 text-[14px] font-semibold text-pf-body transition-colors hover:border-pf-primary-hi hover:text-pf-text"
        >
          <Icon name="ArrowLeft" size={14} />
          Back to all sets
        </Link>
      </div>
    );
  }

  return (
    <>
      <Link
        href={`/collection-pages/${set.id}`}
        className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-pf-muted transition-colors hover:text-pf-text"
      >
        <Icon name="ArrowLeft" size={14} />
        Back to {set.name}
      </Link>

      <h1 className="mt-6 font-display text-[32px] font-bold leading-[1.1] tracking-[-0.02em] text-pf-text sm:text-[40px]">
        Checkout
      </h1>

      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* ---- the item ---- */}
        <div className="overflow-hidden rounded-pf-card border border-pf-warn/25 bg-pf-card shadow-pf-card">
          {set.pages[0] && (
            <span className="relative block aspect-[4/3] overflow-hidden">
              <PageThumb set={set} page={set.pages[0]} />
            </span>
          )}
          <div className="grid gap-3 border-t border-pf-border p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-pf-warn">
                  <Icon name="Star" size={12} />
                  Premium template
                </p>
                <h2 className="mt-1 font-display text-[20px] font-semibold text-pf-text">{set.name}</h2>
              </div>
              <span className="font-display text-[24px] font-bold text-pf-text">{set.price}</span>
            </div>
            {set.blurb && <p className="text-[13.5px] leading-relaxed text-pf-muted">{set.blurb}</p>}
            <div className="flex flex-wrap gap-1.5">
              {set.pages.map((p) => (
                <span
                  key={p.slug}
                  className="rounded-pf-pill border border-pf-border px-2.5 py-1 text-[11.5px] font-medium text-pf-muted"
                >
                  {p.label}
                </span>
              ))}
            </div>
            <p className="border-t border-pf-border pt-3 text-[13px] text-pf-faint">
              {pagesLabel(set.pages.length)} as PageFly files, ready to import into your store.
            </p>
          </div>
        </div>

        {/* ---- the form ---- */}
        <form
          onSubmit={(e) => void submit(e)}
          className="relative grid gap-5 rounded-pf-card border border-pf-border bg-pf-card p-5 shadow-pf-card sm:p-6"
        >
          <div>
            <h2 className="text-[17px] font-semibold text-pf-text">Your details</h2>
            <p className="mt-1 text-[13.5px] text-pf-muted">
              Tell us where the pages should go and how to reach you.
            </p>
          </div>

          <label className="grid gap-1.5">
            <span className="text-[13px] font-semibold text-pf-body">Store domain</span>
            <input
              required
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="your-store.myshopify.com"
              autoComplete="url"
              className={FIELD}
            />
          </label>

          <label className="grid gap-1.5">
            <span className="text-[13px] font-semibold text-pf-body">Your name</span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Doe"
              autoComplete="name"
              className={FIELD}
            />
          </label>

          <label className="grid gap-1.5">
            <span className="text-[13px] font-semibold text-pf-body">Email</span>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              className={FIELD}
            />
            <span className="flex items-start gap-1.5 text-[12.5px] leading-snug text-pf-warn">
              <Icon name="Info" size={13} className="mt-px shrink-0" />
              Please enter your email correctly — we will send updates about your order to this
              address.
            </span>
          </label>

          {/* Off-screen rather than display:none, which some bots skip. */}
          <input
            tabIndex={-1}
            aria-hidden
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            name="website"
            className="absolute -left-[9999px] h-0 w-0 opacity-0"
          />

          {error && (
            <p role="alert" className="text-[13.5px] text-pf-danger">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={state === "sending"}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-pf-md bg-pf-primary px-6 text-[15px] font-semibold text-white shadow-pf-button transition-colors hover:bg-pf-primary-hi disabled:opacity-60"
          >
            {state === "sending" ? "Sending…" : `Confirm order${set.price ? ` · ${set.price}` : ""}`}
          </button>
          <p className="-mt-2 text-center text-[12.5px] text-pf-faint">
            Nothing is charged now. We will review your order and email you the next steps.
          </p>
        </form>
      </div>
    </>
  );
}
