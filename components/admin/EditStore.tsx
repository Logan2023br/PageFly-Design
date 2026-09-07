"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { StoreSummary } from "@/lib/db";
import type { StoresResponse } from "@/app/api/admin/stores/route";
import { Button, Icon } from "../ui";

/* ==========================================================================
   Edit one store.

   A dialog rather than inline fields: the row is already the widest thing on the
   screen, and editing eight values inside a horizontally scrolling table means
   losing half the form off the edge.

   The domain is shown but not editable. It is the primary key, the thing every
   run and review is filed under; changing it here would silently orphan all of
   that. Removing the store and adding the new domain is the honest way to do it.
   ========================================================================== */

type Draft = {
  storeName: string;
  email: string;
  shopifyPlan: string;
  currentPlan: string;
  country: string;
  status: string;
  userType: string;
  pageLimit: string;
  /* "" means no rating. The select offers it as an option, and it is the only
     way an operator can take a rating back off a store. */
  stars: string;
  comment: string;
};

function draftOf(store: StoreSummary): Draft {
  return {
    storeName: store.storeName ?? "",
    email: store.email ?? "",
    shopifyPlan: store.shopifyPlan ?? "",
    currentPlan: store.currentPlan ?? "",
    country: store.country ?? "",
    status: store.status ?? "",
    userType: store.userType ?? "",
    pageLimit: String(store.pageLimit),
    stars: store.review ? String(store.review.stars) : "",
    comment: store.review?.comment ?? "",
  };
}

export function EditStore({
  store,
  onClose,
}: {
  store: StoreSummary;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(store));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Escape closes, as any dialog should.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = (key: keyof Draft) => (value: string) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/stores", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          domain: store.domain,
          storeName: draft.storeName.trim(),
          email: draft.email.trim(),
          shopifyPlan: draft.shopifyPlan.trim(),
          currentPlan: draft.currentPlan.trim(),
          country: draft.country.trim(),
          status: draft.status.trim(),
          userType: draft.userType.trim(),
          pageLimit: Number(draft.pageLimit) || 0,
          /* null clears the rating, a number sets it. Always sent, because the
             form always asked — see the three states on the route's schema. */
          stars: draft.stars === "" ? null : Number(draft.stars),
          comment: draft.comment.trim(),
        }),
      });
      const body = (await res.json()) as StoresResponse;
      if (!body.ok) {
        setError(body.error);
        return;
      }
      window.location.reload();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          role="dialog"
          aria-label={`Edit ${store.domain}`}
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 320, damping: 30 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-[640px] rounded-pf-card border border-pf-border bg-pf-bg-deep p-5 shadow-pf-float"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-display text-[17px] font-semibold text-pf-text">
                Edit store
              </h2>
              <p className="mt-0.5 truncate text-[12px] text-pf-muted">
                {store.domain}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-1 -mt-1 rounded-pf-sm p-1 text-pf-faint transition-colors hover:text-pf-text"
            >
              <Icon name="X" size={16} />
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Store name" value={draft.storeName} onChange={set("storeName")} />
            <Field label="Email" value={draft.email} onChange={set("email")} />
            <Field label="Shopify plan" value={draft.shopifyPlan} onChange={set("shopifyPlan")} />
            <Field label="Gói hiện tại" value={draft.currentPlan} onChange={set("currentPlan")} />
            <Field label="Country" value={draft.country} onChange={set("country")} />
            <Field label="Status" value={draft.status} onChange={set("status")} />
            <Field label="Type" value={draft.userType} onChange={set("userType")} />
            <Field
              label="Page limit"
              value={draft.pageLimit}
              onChange={set("pageLimit")}
              inputMode="numeric"
            />
          </div>

          {/* The rating sits below the store's own fields and behind a rule,
              because it is not one of them: it lives in `reviews`, it is what
              the merchant said rather than what the sheet knows, and an
              operator editing it is correcting a record of someone else's
              words. */}
          <div className="mt-4 border-t border-pf-border pt-4">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-[12.5px] font-semibold text-pf-text">Review</h3>
              <p className="text-[11px] text-pf-faint">
                {store.review
                  ? `Given ${new Date(store.review.createdAt).toLocaleDateString()}`
                  : "No review yet"}
              </p>
            </div>

            <div className="mt-2.5 grid gap-3 sm:grid-cols-[140px_1fr]">
              <label className="grid gap-1.5">
                <span className="text-[11.5px] font-semibold text-pf-body">Rating</span>
                <select
                  value={draft.stars}
                  onChange={(e) => set("stars")(e.target.value)}
                  className="h-9 w-full rounded-pf-md border border-pf-border bg-pf-bg px-2.5 text-[13px] text-pf-text outline-none transition-colors focus:border-pf-primary-hi"
                >
                  <option value="">— none</option>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n} star{n === 1 ? "" : "s"}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1.5">
                <span className="text-[11.5px] font-semibold text-pf-body">Comment</span>
                <textarea
                  value={draft.comment}
                  onChange={(e) => set("comment")(e.target.value)}
                  rows={2}
                  maxLength={2000}
                  className="w-full resize-none rounded-pf-md border border-pf-border bg-pf-bg px-2.5 py-2 text-[13px] text-pf-text outline-none transition-colors placeholder:text-pf-faint focus:border-pf-primary-hi"
                  placeholder={draft.stars === "" ? "Pick a rating first" : "What they said"}
                />
              </label>
            </div>

            {/* Said out loud, because "none" looks like a blank field rather
                than an instruction to delete something. */}
            {draft.stars === "" && store.review && (
              <p className="mt-2 text-[11.5px] font-semibold text-pf-warn">
                Saving with no rating deletes this review.
              </p>
            )}
          </div>

          {error && (
            <p
              role="alert"
              className="mt-3 flex items-center gap-2 rounded-pf-md border border-pf-danger/35 bg-pf-danger/10 px-3 py-2 text-[12px] font-semibold text-pf-danger"
            >
              <Icon name="CircleAlert" size={13} />
              {error}
            </p>
          )}

          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-[11.5px] text-pf-faint">
              {store.pagesUsed} pages built — not affected by these changes.
            </p>
            <div className="flex items-center gap-2">
              <Button variant="quiet" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button size="sm" disabled={busy} onClick={() => void save()}>
                {busy ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function Field({
  label,
  value,
  onChange,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  inputMode?: "numeric";
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[11.5px] font-semibold text-pf-body">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode={inputMode}
        autoCapitalize="off"
        spellCheck={false}
        className="h-9 w-full rounded-pf-md border border-pf-border bg-pf-bg px-2.5 text-[13px] text-pf-text outline-none transition-colors focus:border-pf-primary-hi"
      />
    </label>
  );
}
