"use client";

import Link from "next/link";
import { useState } from "react";
import { EV, track } from "@/lib/analytics";
import { entryFor, refHost, useTrackOnce } from "./cpTrack";
import { CUSTOM_REQUEST, pagesLabel, type PublicCollectionSet } from "@/lib/collectionPages";
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

/**
 * `set` is what is being bought; null is a custom-template request, which is
 * the same form with one more field — what the buyer wants made.
 */
export function CheckoutForm({ set }: { set: PublicCollectionSet | null }) {
  const custom = set === null;
  const [note, setNote] = useState("");
  const [domain, setDomain] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const setKey = set?.id ?? CUSTOM_REQUEST.slug;

  useTrackOnce(setKey, () =>
    track(EV.cpCheckoutViewed, { set: setKey, entry: entryFor("checkout"), ref: refHost() }),
  );

  const failed = (reason: string) => {
    setError(reason);
    track(EV.cpCheckoutFailed, { set: setKey, reason: reason.slice(0, 120) });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state === "sending") return;
    setState("sending");
    setError(null);
    try {
      const res = await fetch("/api/collection-pages/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          set: set?.id ?? CUSTOM_REQUEST.slug,
          domain,
          name,
          email,
          ...(custom ? { note } : {}),
        }),
      });
      const body = (await res.json().catch(() => null)) as { ok: boolean; error?: string } | null;
      if (body?.ok) {
        setState("sent");
        window.scrollTo({ top: 0 });
        return;
      }
      failed(body?.error ?? "Something went wrong — please try again.");
    } catch {
      failed("No connection — please try again.");
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
          {set ? (
            <>
              Thank you for choosing <span className="font-semibold text-pf-text">{set.name}</span>.
              We will check your order and send a confirmation email to{" "}
            </>
          ) : (
            <>
              Thank you for your template request. We will review it and send a confirmation email
              with the next steps to{" "}
            </>
          )}
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
        href={set ? `/collection-pages/${set.id}` : "/collection-pages"}
        className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-pf-muted transition-colors hover:text-pf-text"
      >
        <Icon name="ArrowLeft" size={14} />
        {set ? `Back to ${set.name}` : "Back to all sets"}
      </Link>

      <h1 className="mt-6 font-display text-[32px] font-bold leading-[1.1] tracking-[-0.02em] text-pf-text sm:text-[40px]">
        {set ? "Checkout" : "Pre-order a template"}
      </h1>

      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* ---- the item ---- */}
        {set ? (
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
              <span className="grid justify-items-end">
                <span className="font-display text-[24px] font-bold text-pf-text">{set.price}</span>
                <span className="text-[12px] font-medium text-pf-warn">(Free edits included)</span>
              </span>
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
        ) : (
          <CustomSummary />
        )}

        {/* ---- the form ---- */}
        <form
          onSubmit={(e) => void submit(e)}
          className="grid gap-5 rounded-pf-card border border-pf-border bg-pf-card p-5 shadow-pf-card sm:p-6"
        >
          <div>
            <h2 className="text-[17px] font-semibold text-pf-text">Your details</h2>
            <p className="mt-1 text-[13.5px] text-pf-muted">
              Tell us where the pages should go and how to reach you.
            </p>
          </div>

          {custom && (
            <label className="grid gap-1.5">
              <span className="text-[13px] font-semibold text-pf-body">The template you want</span>
              <textarea
                required
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={5}
                maxLength={2000}
                placeholder="What you sell, the look you are after, the pages you need — and a store or two you like, if you have them."
                className={`${FIELD} resize-y`}
              />
            </label>
          )}

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
            {state === "sending"
              ? "Sending…"
              : set
                ? `Confirm order${set.price ? ` · ${set.price}` : ""}`
                : "Send my request"}
          </button>
          <p className="-mt-2 text-center text-[12.5px] text-pf-faint">
            {set
              ? "Nothing is charged now. We will review your order and email you the next steps."
              : "Nothing is charged now. We will reply with a quote and a delivery date."}
          </p>
        </form>
      </div>
    </>
  );
}

/** The left column of a custom request: what the buyer is asking for. */
function CustomSummary() {
  const steps = [
    ["MessageSquare", "Tell us the store", "What you sell, the style, and the pages you need."],
    ["Mail", "We reply with a quote", "A price and a date, sent to the email you give us."],
    ["Package", "Get your page set", "Delivered as PageFly files, ready to import."],
  ] as const;
  return (
    <div className="relative overflow-hidden rounded-pf-card border border-pf-warn/25 bg-pf-card p-6 shadow-pf-card">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-pf-warn/15 blur-3xl"
      />
      <p className="relative flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-pf-warn">
        <Icon name="Sparkles" size={12} />
        Made to order
      </p>
      <h2 className="relative mt-2 font-display text-[22px] font-bold text-pf-text">
        A template built for your store
      </h2>
      <p className="relative mt-2 text-[14px] leading-relaxed text-pf-muted">
        Don’t see the look you want? Describe it and our designers will build a full page set to
        match — same quality as the premium sets.
      </p>
      <p className="relative mt-4 flex items-start gap-2 rounded-pf-md border border-pf-warn/30 bg-pf-warn/10 px-3 py-2.5 text-[13px] leading-snug text-pf-text">
        <Icon name="ShieldCheck" size={15} className="mt-px shrink-0 text-pf-warn" />
        <span>
          <span className="font-semibold">Guaranteed unique.</span> Your set is designed from scratch
          for your store and never reused — it will not match any other template, here or anywhere
          else.
        </span>
      </p>
      <ol className="relative mt-6 grid gap-4">
        {steps.map(([icon, title, body], i) => (
          <li key={title} className="flex gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-pf-md border border-pf-warn/30 bg-pf-warn/10 text-pf-warn">
              <Icon name={icon} size={16} />
            </span>
            <span>
              <span className="block text-[14px] font-semibold text-pf-text">
                {i + 1}. {title}
              </span>
              <span className="block text-[13px] text-pf-faint">{body}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
