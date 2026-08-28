"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { MAX_PROMPT_CHARS, PROMPT_EXAMPLE } from "@/lib/briefOptions";
import { Icon } from "../ui";

/* ==========================================================================
   A worked example of the one field that matters.

   "The more specific, the less generic the mockups" told a merchant the
   PRINCIPLE and not the SHAPE, and the shape is the part nobody guesses: what
   you sell, then the look, then the component every page shares, then a line
   per page naming the sections wanted on it. So the shape is shown.

   READ-ONLY, and deliberately. A button that pasted this in would either wipe
   what the merchant had already written or append 2,000 characters of another
   store's brief to it — and a merchant who copies the parts they want ends up
   with their own brief in this structure, which is the entire point. Copy is
   offered because re-typing two thousand characters is not a design.
   ========================================================================== */

export function PromptExampleButton() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  /* Escape closes it. A dialog that traps someone until they find the small
     button is the thing people remember about a form. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  /* The confirmation has to go away on its own — there is no other moment to
     clear it, and "Copied" left standing beside the button reads as a state the
     dialog is in rather than a thing that just happened. */
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(PROMPT_EXAMPLE);
      setCopied(true);
    } catch {
      /* Denied permission, or an insecure origin. The text is on screen and
         selectable, which is the fallback — saying nothing is better than an
         error about a convenience. */
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-pf-pill border border-pf-primary-hi/45 bg-pf-primary/16 px-2.5 py-1 text-[11.5px] font-semibold text-pf-text transition-colors hover:bg-pf-primary/28"
      >
        <Icon name="FileText" size={12} />
        Example
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            role="dialog"
            aria-modal="true"
            aria-label="Example prompt"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(6,4,14,.88)] p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.99 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              /* The backdrop closes; the dialog does not. Without this a click
                 anywhere on the thing just opened closes it again — and this is
                 a panel people will click into to select text. */
              onClick={(e) => e.stopPropagation()}
              className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-pf-card border border-pf-border bg-pf-bg-deep shadow-pf-float"
            >
              <header className="flex items-start justify-between gap-3 border-b border-pf-border px-5 py-4">
                <div className="min-w-0">
                  <h2 className="font-display text-[16px] font-semibold text-pf-text">
                    Example prompt
                  </h2>
                  <p className="mt-1 text-[12.5px] text-pf-muted">
                    What you sell, then the look, then one line per page naming
                    the sections you want on it.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="shrink-0 rounded-pf-sm border border-pf-border p-1.5 text-pf-muted transition-colors hover:text-pf-text"
                >
                  <Icon name="X" size={16} />
                </button>
              </header>

              {/* `whitespace-pre-wrap` because the blank lines between the
                  paragraphs ARE the structure being demonstrated. Collapsed,
                  this is one wall of text and teaches nothing. */}
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-pf-body">
                  {PROMPT_EXAMPLE}
                </p>
              </div>

              <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-pf-border px-5 py-3.5">
                <span className="text-[12px] tabular-nums text-pf-faint">
                  {PROMPT_EXAMPLE.length} / {MAX_PROMPT_CHARS} characters
                </span>
                <button
                  type="button"
                  onClick={() => void copy()}
                  className="inline-flex items-center gap-1.5 rounded-pf-md border border-pf-border px-3 py-1.5 text-[12.5px] font-semibold text-pf-text transition-colors hover:border-pf-border-hi"
                >
                  <Icon name={copied ? "Check" : "Copy"} size={14} />
                  {copied ? "Copied" : "Copy"}
                </button>
              </footer>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
