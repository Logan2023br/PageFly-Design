"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { collectionFileUrl } from "@/lib/collectionPages";
import {
  COLLECTION_REVIEWERS,
  type CollectionReviewer,
  type CollectionSetRecord,
} from "@/lib/db/types";
import { Button, Icon } from "../../ui";
import { api } from "./shared";

/* ==========================================================================
   The TS team's check of one set, on its row in the admin list.

     nobody yet   [TS Review] → a dialog: pick Max, Aasim or Alfie, Confirm
     reviewing    [Download .pagefly]  Alfie Reviewing · 14/10/2026 10:22:05  [Done]
     done         [Download .pagefly]  Alfie Done · 14/10/2026 11:03:41

   The download is the whole set as one .pagefly — the same file the public
   page hands out, which an admin may fetch even for a hidden or paid set.
   ========================================================================== */

/** dd/mm/yyyy hh:mm:ss, in the viewer's own time zone */
export function reviewTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  );
}

export function TsReview({
  set,
  onSaved,
}: {
  set: CollectionSetRecord;
  onSaved: (set: CollectionSetRecord) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const review = set.review;
  const hasFiles = set.pages.some((p) => p.pageflySize !== null);

  const send = async (body: { reviewer: CollectionReviewer } | { done: true }) => {
    setBusy(true);
    setError(null);
    const res = await api<{ set: CollectionSetRecord }>(
      `/api/admin/collection-pages/${set.id}/review`,
      { method: "PUT", body: JSON.stringify(body) },
    );
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return false;
    }
    onSaved(res.set);
    return true;
  };

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {review ? (
        <>
          <a
            href={
              hasFiles ? collectionFileUrl(set.slug, "all", "pagefly", set.updatedAt) : undefined
            }
            download={`${set.slug}.pagefly`}
            aria-disabled={!hasFiles}
            title={
              hasFiles ? "Every .pagefly file of this set, as one import" : "No .pagefly files yet"
            }
            className={`inline-flex h-8 items-center gap-1.5 rounded-pf-md border border-pf-border px-3 text-[12.5px] font-semibold transition-colors ${
              hasFiles
                ? "text-pf-body hover:border-pf-border-hi hover:bg-pf-card"
                : "pointer-events-none text-pf-faint"
            }`}
          >
            <Icon name="Download" size={14} />
            Download .pagefly
          </a>
          <span
            className={`inline-flex h-8 items-center gap-1.5 rounded-pf-md border px-3 text-[12.5px] font-semibold ${
              review.doneAt
                ? "border-pf-success/30 bg-pf-success/10 text-pf-success"
                : "border-pf-warn/30 bg-pf-warn/10 text-pf-warn"
            }`}
          >
            <Icon name={review.doneAt ? "CircleCheck" : "Clock"} size={14} />
            {review.reviewer} {review.doneAt ? "Done" : "Reviewing"}
            <span className="font-normal opacity-80">
              · {reviewTime(review.doneAt ?? review.startedAt)}
            </span>
          </span>
          {!review.doneAt && (
            <Button
              size="sm"
              icon="Check"
              onClick={() => void send({ done: true })}
              disabled={busy}
            >
              {busy ? "Saving…" : "Done"}
            </Button>
          )}
        </>
      ) : (
        <Button variant="ghost" size="sm" icon="Users" onClick={() => setOpen(true)}>
          TS Review
        </Button>
      )}
      {error && !open && (
        <p role="alert" className="basis-full text-right text-[12px] text-pf-danger">
          {error}
        </p>
      )}
      {open && (
        <ReviewerDialog
          setName={set.name}
          busy={busy}
          error={error}
          onClose={() => {
            setOpen(false);
            setError(null);
          }}
          onConfirm={async (reviewer) => {
            if (await send({ reviewer })) setOpen(false);
          }}
        />
      )}
    </div>
  );
}

function ReviewerDialog({
  setName,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  setName: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (reviewer: CollectionReviewer) => void;
}) {
  const [pick, setPick] = useState<CollectionReviewer | null>(null);

  // Escape closes, as any dialog should.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
          aria-modal="true"
          aria-label={`TS review of ${setName}`}
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 320, damping: 30 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-[380px] rounded-pf-card border border-pf-border bg-pf-bg-deep p-5 text-left shadow-pf-float"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-display text-[17px] font-semibold text-pf-text">TS Review</h2>
              <p className="mt-0.5 truncate text-[12px] text-pf-muted">
                Who is reviewing {setName}?
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

          <div role="radiogroup" aria-label="Reviewer" className="mt-4 grid gap-1.5">
            {COLLECTION_REVIEWERS.map((name) => (
              <button
                key={name}
                type="button"
                role="radio"
                aria-checked={pick === name}
                onClick={() => setPick(name)}
                className={`flex items-center justify-between rounded-pf-md border px-3 py-2.5 text-[13.5px] font-semibold transition-colors ${
                  pick === name
                    ? "border-pf-primary-hi bg-pf-primary/10 text-pf-text"
                    : "border-pf-border text-pf-body hover:border-pf-border-hi hover:bg-pf-card"
                }`}
              >
                {name}
                <span
                  className={`grid size-4 place-items-center rounded-full border ${
                    pick === name ? "border-pf-primary-hi bg-pf-primary-hi" : "border-pf-border-hi"
                  }`}
                >
                  {pick === name && <Icon name="Check" size={10} className="text-white" />}
                </span>
              </button>
            ))}
          </div>

          {error && (
            <p role="alert" className="mt-3 text-[12.5px] text-pf-danger">
              {error}
            </p>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <Button variant="quiet" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => pick && onConfirm(pick)} disabled={!pick || busy}>
              {busy ? "Saving…" : "Confirm"}
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
