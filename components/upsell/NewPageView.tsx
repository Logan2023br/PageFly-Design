"use client";

import { ArrowUpRight, Check, Download, Eye, Rocket, Sparkles, Star } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { sendEvent, postEvent } from "./events";
import { DeviceToggle, FullscreenButton, FullscreenPreview, ScaledFrame, type Device } from "./PagePreview";

/* ==========================================================================
   /new-page — the two pages we built for a new merchant.

   Gets only what is safe to show: the store's name and handle, the design id
   and the two pages. No email, no phone, nothing from the score — this
   component cannot leak what it was never handed.
   ========================================================================== */

export type PublicPage = { slot: number; type: string; label: string; title: string | null; version: number };

export type PublicDesign = {
  id: string;
  leadId: string;
  storeName: string;
  storeDomain: string;
  handle: string;
  pages: PublicPage[];
  expiresAt: string | null;
  /** an admin looking at it before the customer has it */
  preview: boolean;
  /** an admin looking at an older version */
  version: number | null;
  /** example products: the storefront was password-protected when they were built */
  sample: boolean;
};

/* ==========================================================================
   HOW TO IMPORT, IN ONE PLACE.

   ⚠ THE MENU NAMES BELOW MUST BE CONFIRMED BY THE PAGEFLY TEAM against the
   current app before this goes to customers. They were written without a
   screenshot of today's UI; a step that names a button the merchant cannot
   find is worse than no step at all. Change the text here and nowhere else.
   ========================================================================== */
export const IMPORT_STEPS: { title: string; body: string }[] = [
  {
    title: "Download the .pagefly file",
    body: "Use the Download button under the page you want. Each page is its own file.",
  },
  {
    title: "Open PageFly and click Import",
    body: "In Shopify admin, open PageFly → Pages, click Import (or “Import page”).",
  },
  {
    title: "Choose the file",
    body: "The page arrives as a draft, ready to edit and publish.",
  },
];

export function NewPageView({ design }: { design: PublicDesign }) {
  const viewed = useRef(false);
  useEffect(() => {
    if (viewed.current || design.preview) return;
    viewed.current = true;
    sendEvent({ id: design.id, type: "view" });
  }, [design.id, design.preview]);

  const versionQuery = design.version ? `?v=${design.version}` : "";

  return (
    <div className="grid gap-16 sm:gap-24">
      {/* Hero */}
      <section className="mx-auto grid max-w-[820px] justify-items-center gap-5 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-pf-pill border border-pf-primary-hi/30 bg-pf-primary/10 px-3 py-1 text-[12.5px] font-semibold text-pf-primary-hi">
          <Sparkles size={14} strokeWidth={1.75} aria-hidden />
          Free, made for your store
        </span>
        <h1 className="font-display text-[34px] font-extrabold leading-[1.08] tracking-[-0.03em] text-pf-text sm:text-[52px]">
          We designed 2 pages for <span className="pfd-grad-text">{design.storeName}</span>
        </h1>
        <p className="max-w-[640px] text-[16px] leading-relaxed text-pf-muted sm:text-[17.5px]">
          {design.sample ? (
            <>
              Designed for your store and ready to import into PageFly. Swap in your own products and photos in the editor,
              then publish. They&rsquo;re yours to keep, free.
            </>
          ) : (
            <>
              Built with your own products and ready to import into PageFly. They&rsquo;re yours to keep, free — publish them as
              they are, or make them your own in the editor.
            </>
          )}
        </p>
      </section>

      {/* The two pages */}
      <section aria-label="Your pages" className="grid gap-6 lg:grid-cols-2">
        {design.pages.map((p) => (
          <PageCard key={p.slot} designId={design.id} page={p} versionQuery={versionQuery} />
        ))}
      </section>

      <ImportGuide />

      <UpgradeCta designId={design.id} handle={design.handle} />

      <Feedback designId={design.id} />
    </div>
  );
}

function PageCard({ designId, page, versionQuery }: { designId: string; page: PublicPage; versionQuery: string }) {
  const [device, setDevice] = useState<Device>("desktop");
  const [full, setFull] = useState(false);
  const src = `/upsell/preview/${designId}/${page.slot}${versionQuery}`;
  const title = page.title || page.label;

  const changeDevice = (d: Device) => {
    setDevice(d);
    sendEvent({ id: designId, type: "device_toggle", page_slot: page.slot, detail: { device: d } });
  };

  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-pf-card border border-pf-border bg-pf-card shadow-pf-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-pf-border px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-pf-primary-hi">Page {page.slot}</p>
          <h2 className="truncate font-display text-[18px] font-bold text-pf-text">{page.label}</h2>
        </div>
        <div className="flex items-center gap-2">
          <DeviceToggle value={device} onChange={changeDevice} />
          <FullscreenButton
            onClick={() => {
              setFull(true);
              sendEvent({ id: designId, type: "preview_open", page_slot: page.slot, detail: { device } });
            }}
          />
        </div>
      </header>
      <ScaledFrame src={src} title={`${title} preview`} device={device} height={520} />
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-pf-border px-4 py-3.5 sm:px-5">
        {page.title && page.title !== page.label ? (
          <p className="min-w-0 truncate text-[13px] text-pf-muted">{page.title}</p>
        ) : (
          <p className="text-[13px] text-pf-muted">Live preview · scroll inside the frame</p>
        )}
        {/* A plain link: the browser handles the download, and the server counts it. */}
        <a
          href={`/api/upsell/download/${designId}/${page.slot}${versionQuery}`}
          className="inline-flex h-10 items-center gap-2 rounded-pf-md bg-pf-primary px-4 text-[13.5px] font-semibold text-white shadow-pf-button transition-colors hover:bg-pf-primary-hi"
        >
          <Download size={16} strokeWidth={1.75} aria-hidden />
          Download .pagefly
        </a>
      </footer>
      {full && (
        <FullscreenPreview src={src} title={title} device={device} onDevice={changeDevice} onClose={() => setFull(false)} />
      )}
    </article>
  );
}

function ImportGuide() {
  return (
    <section aria-labelledby="import-title" className="grid gap-8">
      <div className="grid gap-2 text-center">
        <h2 id="import-title" className="font-display text-[26px] font-bold tracking-[-0.02em] text-pf-text sm:text-[32px]">
          Import in about a minute
        </h2>
        <p className="text-[15px] text-pf-muted">Three steps, no copying and pasting.</p>
      </div>
      <ol className="grid gap-4 md:grid-cols-3">
        {IMPORT_STEPS.map((s, i) => (
          <li key={s.title} className="grid gap-4 rounded-pf-card border border-pf-border bg-pf-card p-5">
            <StepVisual step={i} />
            <div className="flex items-start gap-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-pf-primary/20 text-[13px] font-bold text-pf-primary-hi">
                {i + 1}
              </span>
              <div className="grid gap-1">
                <h3 className="font-display text-[16px] font-semibold text-pf-text">{s.title}</h3>
                <p className="text-[13.5px] leading-relaxed text-pf-muted">{s.body}</p>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* Drawn diagrams, not screenshots: a picture of a UI that has since changed
   would teach the wrong click. */
function StepVisual({ step }: { step: number }) {
  return (
    <div aria-hidden className="grid h-[132px] place-items-center rounded-pf-md border border-pf-border bg-pf-bg-deep">
      {step === 0 && (
        <svg viewBox="0 0 160 100" className="h-[96px] w-auto">
          <rect x="44" y="10" width="56" height="72" rx="6" fill="rgba(154,107,255,0.14)" stroke="#9a6bff" strokeWidth="1.5" />
          <path d="M86 10v14h14" fill="none" stroke="#9a6bff" strokeWidth="1.5" />
          <text x="72" y="54" textAnchor="middle" fontSize="10" fontWeight="700" fill="#e7e4f5">.pagefly</text>
          <circle cx="112" cy="74" r="16" fill="#6b2ff7" />
          <path d="M112 66v14m-6-6 6 6 6-6" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {step === 1 && (
        <svg viewBox="0 0 160 100" className="h-[96px] w-auto">
          <rect x="10" y="12" width="140" height="76" rx="7" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.16)" />
          <rect x="10" y="12" width="36" height="76" rx="7" fill="rgba(255,255,255,0.05)" />
          <rect x="17" y="24" width="22" height="5" rx="2.5" fill="rgba(231,228,245,0.4)" />
          <rect x="17" y="36" width="22" height="5" rx="2.5" fill="#9a6bff" />
          <rect x="17" y="48" width="22" height="5" rx="2.5" fill="rgba(231,228,245,0.25)" />
          <rect x="56" y="24" width="50" height="6" rx="3" fill="rgba(231,228,245,0.45)" />
          <rect x="108" y="20" width="34" height="14" rx="5" fill="#6b2ff7" />
          <text x="125" y="30" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="#fff">Import</text>
          <rect x="56" y="44" width="86" height="8" rx="3" fill="rgba(255,255,255,0.06)" />
          <rect x="56" y="58" width="86" height="8" rx="3" fill="rgba(255,255,255,0.06)" />
          <rect x="56" y="72" width="86" height="8" rx="3" fill="rgba(255,255,255,0.06)" />
        </svg>
      )}
      {step === 2 && (
        <svg viewBox="0 0 160 100" className="h-[96px] w-auto">
          <rect x="20" y="12" width="120" height="76" rx="7" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.16)" />
          <rect x="32" y="24" width="96" height="26" rx="4" fill="rgba(154,107,255,0.18)" />
          <rect x="32" y="56" width="44" height="22" rx="4" fill="rgba(255,255,255,0.07)" />
          <rect x="84" y="56" width="44" height="22" rx="4" fill="rgba(255,255,255,0.07)" />
          <circle cx="128" cy="20" r="13" fill="#2bd98a" />
          <path d="m122 20 4 4 8-8" fill="none" stroke="#0a0616" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
}

function UpgradeCta({ designId, handle }: { designId: string; handle: string }) {
  const href = `https://admin.shopify.com/store/${encodeURIComponent(handle)}/apps/pagefly`;
  return (
    <section className="relative overflow-hidden rounded-pf-card border border-pf-primary-hi/30 bg-gradient-to-br from-pf-primary/25 via-pf-card to-pf-card p-6 sm:p-10">
      <div className="grid items-center gap-6 md:grid-cols-[1fr_auto]">
        <div className="grid gap-3">
          <span className="inline-flex w-fit items-center gap-1.5 text-[12.5px] font-semibold uppercase tracking-[0.08em] text-pf-primary-hi">
            <Rocket size={14} strokeWidth={1.75} aria-hidden />
            Ready to go live?
          </span>
          <h2 className="font-display text-[24px] font-bold tracking-[-0.02em] text-pf-text sm:text-[30px]">Publish both pages on your store</h2>
          <p className="max-w-[620px] text-[15px] leading-relaxed text-pf-muted">
            Importing and editing are free. To publish both pages, your PageFly plan needs enough publish slots — each live
            page uses one. Check what your plan includes and pick the one that fits.
          </p>
        </div>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => sendEvent({ id: designId, type: "cta_click" })}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-pf-md bg-pf-primary px-6 text-[14.5px] font-semibold text-white shadow-pf-button transition-colors hover:bg-pf-primary-hi"
        >
          See plans to publish these pages
          <ArrowUpRight size={16} strokeWidth={1.75} aria-hidden />
        </a>
      </div>
    </section>
  );
}

function Feedback({ designId }: { designId: string }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rating && !comment.trim()) return;
    setState("sending");
    const ok = await postEvent({ id: designId, type: "feedback", rating: rating || null, comment: comment.trim() || null });
    setState(ok ? "done" : "error");
  };

  if (state === "done") {
    return (
      <section className="mx-auto grid w-full max-w-[640px] justify-items-center gap-3 rounded-pf-card border border-pf-success/30 bg-pf-success/10 p-8 text-center">
        <span className="grid size-11 place-items-center rounded-full bg-pf-success/20 text-pf-success">
          <Check size={22} strokeWidth={2} aria-hidden />
        </span>
        <h2 className="font-display text-[20px] font-bold text-pf-text">Thank you!</h2>
        <p className="text-[14px] text-pf-muted">We read every note. If you asked for changes, we&rsquo;ll get back to you in chat.</p>
      </section>
    );
  }

  const shown = hover || rating;
  return (
    <section aria-labelledby="feedback-title" className="mx-auto w-full max-w-[640px]">
      <form onSubmit={submit} className="grid gap-5 rounded-pf-card border border-pf-border bg-pf-card p-6 sm:p-8">
        <div className="grid gap-1 text-center">
          <h2 id="feedback-title" className="font-display text-[22px] font-bold text-pf-text">How did we do?</h2>
          <p className="text-[14px] text-pf-muted">Rate the pages — it tells us what to make next.</p>
        </div>
        <div role="radiogroup" aria-label="Rating" className="flex justify-center gap-1.5" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} star${n > 1 ? "s" : ""}`}
              onClick={() => setRating(n)}
              onMouseEnter={() => setHover(n)}
              className="grid size-11 place-items-center rounded-pf-md transition-transform hover:scale-110"
            >
              <Star
                size={30}
                strokeWidth={1.5}
                aria-hidden
                className={n <= shown ? "fill-pf-warn text-pf-warn" : "text-pf-faint"}
              />
            </button>
          ))}
        </div>
        <label className="grid gap-2">
          <span className="text-[13px] font-semibold text-pf-body">Want changes? Tell us what to adjust</span>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value.slice(0, 1000))}
            maxLength={1000}
            rows={4}
            placeholder="A different style, another page type, a section to add…"
            className="w-full resize-y rounded-pf-md border border-pf-border bg-pf-bg-deep px-3 py-2.5 text-[14px] text-pf-text outline-none transition-colors placeholder:text-pf-faint focus:border-pf-primary-hi"
          />
          <span className="justify-self-end text-[11.5px] text-pf-faint">{comment.length}/1000</span>
        </label>
        {state === "error" && <p className="text-center text-[13px] text-pf-danger">That didn&rsquo;t go through — please try again.</p>}
        <button
          type="submit"
          disabled={state === "sending" || (!rating && !comment.trim())}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-pf-md bg-pf-primary px-5 text-[14px] font-semibold text-white shadow-pf-button transition-colors hover:bg-pf-primary-hi disabled:cursor-not-allowed disabled:bg-pf-card-hi disabled:text-pf-faint disabled:shadow-none"
        >
          {state === "sending" ? "Sending…" : "Send feedback"}
        </button>
      </form>
    </section>
  );
}

/* For an admin: why the customer does not see this, and that nothing here is counted. */
export function PreviewBanner({ version, state }: { version: number | null; state: string }) {
  const why =
    state === "not_sent" ? "Bản xem trước, khách chưa nhận" : state === "expired" ? "Link đã hết hạn — khách không còn xem được" : state === "rejected" ? "Lead đã bị từ chối — khách không xem được" : "Xem với quyền admin";
  return (
    <div className="sticky top-[72px] z-30 border-b border-pf-warn/40 bg-[rgba(60,38,10,0.92)] px-5 py-2.5 text-center text-[13px] font-semibold text-pf-warn backdrop-blur">
      <Eye size={14} strokeWidth={1.75} aria-hidden className="mr-1.5 inline -translate-y-px" />
      {why}
      {version ? ` · phiên bản cũ v${version}` : ""} — lượt xem và tải của admin không được tính.
    </div>
  );
}
