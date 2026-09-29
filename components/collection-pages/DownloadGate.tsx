"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { analyticsVisitorId, EV, track } from "@/lib/analytics";
import { pagesLabel, type PublicCollectionSet } from "@/lib/collectionPages";
import type { ShowcasePage } from "@/lib/showcasePages";
import { InstallPageFlyButton } from "../pagefly/InstallPageFly";
import { Icon } from "../ui";

/* ==========================================================================
   THE DOWNLOAD, IN THREE STEPS.

     1  form    the store and an email — stored as a lead before anything else
     2  ready   the file, one press away
     3  done    what the file is for: it only opens in PageFly, so installing
                PageFly is the next thing to do, and the button is right there

   ONE PER DOWNLOAD, NOT ONCE PER VISITOR. Each press asks again, prefilled with
   what was typed last time, so a returning visitor confirms with one press and
   every download is on record against the set it was for.

   IN A PORTAL, because the card that opens it is `overflow-hidden` and the
   page preview that can open it sits at z-70 — a modal inside either would be
   cut off or drawn underneath.
   ========================================================================== */

const REMEMBER = "pfd.cp.lead";
const FIELD =
  "w-full rounded-pf-md border border-pf-border bg-pf-bg-deep px-3.5 py-2.5 text-[14.5px] text-pf-text outline-none transition-colors placeholder:text-pf-faint focus:border-pf-primary-hi";

type Step = "form" | "ready" | "done";

function remembered(): { domain: string; email: string } {
  try {
    const v = JSON.parse(window.localStorage.getItem(REMEMBER) ?? "{}");
    return { domain: String(v.domain ?? ""), email: String(v.email ?? "") };
  } catch {
    return { domain: "", email: "" };
  }
}

export function DownloadGate({
  set,
  page,
  place,
  onClose,
}: {
  set: PublicCollectionSet;
  /** one page, or null for the whole set */
  page: ShowcasePage | null;
  place: "card" | "detail" | "viewer";
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>("form");
  const [domain, setDomain] = useState(() => remembered().domain);
  const [email, setEmail] = useState(() => remembered().email);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const href = page ? page.file : set.download;
  const filename = page ? `${set.id}-${page.slug}.pagefly` : `${set.id}.pagefly`;
  const what = page ? `${set.name} — ${page.label}` : set.name;

  useEffect(() => {
    track(EV.cpGateOpened, { set: set.id, page: page?.slug ?? "", place });
    const had = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = had;
      window.removeEventListener("keydown", onKey);
    };
    // Opened once per mount; `onClose` changing identity is not a new opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    setError(null);
    const fail = (reason: string) => {
      setError(reason);
      track(EV.cpLeadFailed, { set: set.id, reason: reason.slice(0, 120) });
    };
    try {
      const res = await fetch("/api/collection-pages/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          set: set.id,
          page: page?.slug ?? null,
          domain,
          email,
          visitorId: analyticsVisitorId(),
        }),
      });
      const body = (await res.json().catch(() => null)) as { ok: boolean; error?: string } | null;
      if (body?.ok) {
        try {
          window.localStorage.setItem(REMEMBER, JSON.stringify({ domain, email }));
        } catch {
          // A private window forgets; the next download asks again, which is fine.
        }
        track(EV.cpLeadSubmitted, { set: set.id, page: page?.slug ?? "" });
        setStep("ready");
      } else fail(body?.error ?? "Something went wrong — please try again.");
    } catch {
      fail("No connection — please try again.");
    }
    setSending(false);
  };

  const downloaded = () => {
    if (page) {
      track(EV.showcaseFileDownloaded, { page_type: page.slug, set: set.id, from: "collection_pages" });
    } else {
      track(EV.showcaseSetDownloaded, { set: set.id, pages: set.pages.length, from: "collection_pages" });
    }
    setStep("done");
  };

  /* `.pfd-root` on the portal's own root: the app's reset, fonts and tokens are
     scoped to it, and `document.body` is outside every one of them — without
     it the form renders in Times with the browser's own buttons. */
  return createPortal(
    <div className="pfd-root">
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Download ${what}`}
      className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-[rgba(6,4,14,.8)] p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[460px] overflow-hidden rounded-pf-card border border-pf-border-hi bg-pf-card shadow-pf-float"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-24 size-64 rounded-full bg-pf-primary/25 blur-3xl"
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 grid size-8 place-items-center rounded-pf-md text-pf-muted transition-colors hover:bg-pf-card-hi hover:text-pf-text"
        >
          <Icon name="X" size={16} />
        </button>

        <div className="relative p-6">
          {/* ---- what is being downloaded, on every step ---- */}
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-pf-md bg-pf-primary/15 text-pf-primary-hi">
              <Icon name="Package" size={18} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold text-pf-text">{what}</p>
              <p className="text-[12.5px] text-pf-faint">
                {page ? "1 page" : pagesLabel(set.pages.length)} · free · .pagefly file
              </p>
            </div>
          </div>

          {step === "form" && (
            <form onSubmit={(e) => void submit(e)} className="mt-5 grid gap-4">
              <div>
                <h2 className="font-display text-[20px] font-bold tracking-[-0.015em] text-pf-text">
                  Get your free download
                </h2>
                <p className="mt-1 text-[13.5px] leading-relaxed text-pf-muted">
                  Tell us which store it is for and where to reach you — then the file is yours.
                </p>
              </div>
              <label className="grid gap-1.5">
                <span className="text-[13px] font-semibold text-pf-body">Store domain</span>
                <input
                  required
                  autoFocus={!domain}
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="your-store.myshopify.com"
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
              </label>
              {error && (
                <p role="alert" className="text-[13px] text-pf-danger">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={sending}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-pf-md bg-pf-primary px-6 text-[15px] font-semibold text-white shadow-pf-button transition-colors hover:bg-pf-primary-hi disabled:opacity-60"
              >
                {sending ? "One moment…" : "Continue"}
                {!sending && <Icon name="ArrowRight" size={15} />}
              </button>
              <p className="-mt-1 text-center text-[12px] text-pf-faint">
                Free, no account needed. We never share your details.
              </p>
            </form>
          )}

          {step === "ready" && (
            <div className="mt-6 grid justify-items-center gap-4 text-center">
              <span className="grid size-12 place-items-center rounded-full bg-pf-success/15 text-pf-success">
                <Icon name="CircleCheck" size={24} />
              </span>
              <div>
                <h2 className="font-display text-[20px] font-bold text-pf-text">Your download is ready</h2>
                <p className="mt-1 text-[13.5px] text-pf-muted">{filename}</p>
              </div>
              {href ? (
                <a
                  href={href}
                  download={filename}
                  onClick={downloaded}
                  className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-pf-md bg-pf-primary px-6 text-[15px] font-semibold text-white shadow-pf-button transition-colors hover:bg-pf-primary-hi"
                >
                  <Icon name="Download" size={16} />
                  Download {page ? "the page" : "the set"}
                </a>
              ) : (
                <p className="text-[13px] text-pf-danger">This file is not available right now.</p>
              )}
            </div>
          )}

          {step === "done" && (
            <div className="mt-6 grid gap-4">
              <div className="flex items-start gap-3 rounded-pf-md border border-pf-success/30 bg-pf-success/10 p-3.5">
                <Icon name="CircleCheck" size={18} className="mt-px shrink-0 text-pf-success" />
                <div>
                  <p className="text-[14px] font-semibold text-pf-text">You’ve downloaded {filename}</p>
                  <p className="mt-0.5 text-[12.5px] text-pf-muted">Check your browser’s downloads folder.</p>
                </div>
              </div>
              <div>
                <h2 className="font-display text-[19px] font-bold text-pf-text">Now bring it into your store</h2>
                <p className="mt-1 text-[13.5px] leading-relaxed text-pf-muted">
                  A .pagefly file opens in PageFly. To use it, install PageFly on your Shopify store and
                  import the file.
                </p>
              </div>
              <ol className="grid gap-2 text-[13px] text-pf-body">
                {[
                  "Install PageFly from the Shopify App Store",
                  "Open PageFly and choose Import",
                  `Select ${filename} — every page arrives ready to edit`,
                ].map((t, i) => (
                  <li key={t} className="flex items-start gap-2.5">
                    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-pf-primary/20 text-[11px] font-bold text-pf-primary-hi">
                      {i + 1}
                    </span>
                    {t}
                  </li>
                ))}
              </ol>
              <InstallPageFlyButton surface="collection_pages" size="lg" className="w-full justify-center" />
              <button
                type="button"
                onClick={() => setStep("ready")}
                className="justify-self-center text-[12.5px] font-medium text-pf-faint hover:text-pf-text"
              >
                Download again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
    </div>,
    document.body,
  );
}
