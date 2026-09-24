"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { EV, track } from "@/lib/analytics";
import type { PageMockup } from "@/lib/generate/types";
import { useExport } from "./ExportProvider";
import { actionLabel, type ExportState } from "./exportLabel";
import { useAdminView } from "./adminView";
import { htmlFileName, htmlOfPage } from "./downloadHtml";
import { Icon } from "../ui";

/* ==========================================================================
   The two hover actions on a result card.

   Deliberately NOT nested inside the card's click target: a button inside a
   button is invalid HTML, and the browser hoists it out of its parent, which
   breaks hydration. The card keeps a separate absolutely-positioned overlay
   button for "open preview"; this row sits above it on a higher layer.
   ========================================================================== */

export const LOCKED_TOOLTIP =
  "This feature will be available in a future update.";

export function CardActions({ page }: { page: PageMockup }) {
  const { exportPagefly, exporting, exportingId } = useExport();
  /* Operators only. See `adminView.tsx` — false anywhere the provider is not. */
  const admin = useAdminView();
  const html = admin ? htmlOfPage(page) : null;
  const [state, setState] = useState<ExportState>("idle");
  const [tip, setTip] = useState(false);
  /* The tooltip normally sits above the button. If the card has been scrolled
     near the top of the viewport there is no room up there, so it flips below —
     measured on hover rather than guessed, since it depends on scroll position. */
  const [below, setBelow] = useState(false);
  const lockRef = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openTip = () => {
    const top = lockRef.current?.getBoundingClientRect().top ?? 999;
    setBelow(top < 132);
    setTip(true);
  };

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const onExport = async () => {
    try {
      await exportPagefly(page);
      setState("done");
    } catch {
      setState("failed");
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2200);
  };

  /* DISABLED BECAUSE THE STAGE IS SHARED; LABELLED BECAUSE THIS CARD ASKED.
     One boolean did both, so pressing Export on one page made all seven say
     "Exporting…" — the screen reporting work that was not happening to them. */
  const label = actionLabel(state, exporting, exportingId === page.id);

  return (
    <div className="pointer-events-none absolute inset-x-2 top-2 z-20 flex items-start justify-between gap-2 opacity-0 transition-opacity duration-200 focus-within:opacity-100 group-hover:opacity-100">
      {/* ---- download the mockup's own html · operators only ----
           The document every later step is derived from, and the only thing
           that says what the export was supposed to produce. A page with no
           mockup renders no button rather than a zero-byte file named like a
           real one — see `downloadHtml.ts`. */}
      {html && (
        <button
          type="button"
          onClick={() => {
            const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
            const a = document.createElement("a");
            a.href = url;
            a.download = htmlFileName(page);
            a.click();
            /* Revoked on the next turn of the loop: released synchronously,
               the click has not started the download yet and Safari takes
               nothing. */
            setTimeout(() => URL.revokeObjectURL(url), 0);
          }}
          title="Download HTML — the mockup this page was built as"
          className="pointer-events-auto inline-flex items-center gap-1.5 rounded-pf-md bg-pf-bg/85 px-2.5 py-1.5 text-[11.5px] font-semibold text-pf-body shadow-pf-float backdrop-blur transition-colors duration-150 hover:bg-pf-primary hover:text-white"
        >
          <Icon name="FileText" size={13} />
          HTML
        </button>
      )}

      {/* ---- export .pagefly ---- */}
      <button
        type="button"
        onClick={() => {
          /* `scope` because one page and all seven are different intentions,
             and one number covering both cannot tell them apart.

             `page_type` because "28 exports" does not say WHICH pages a
             merchant thought were worth taking, and that is the question that
             decides which page types are worth making more of — the same
             reason the gallery and the preview have carried it all along. */
          track(EV.pageExported, { scope: "one", count: 1, page_type: page.pageType });
          void onExport();
        }}
        disabled={exporting}
        title="Download this page as a .pagefly file you can import into PageFly"
        className={`pointer-events-auto inline-flex items-center gap-1.5 rounded-pf-md px-2.5 py-1.5 text-[11.5px] font-semibold shadow-pf-float backdrop-blur transition-colors duration-150 disabled:cursor-not-allowed ${
          state === "done"
            ? "bg-pf-success text-pf-bg"
            : state === "failed"
              ? "bg-pf-danger text-white"
              : "bg-pf-bg/85 text-pf-body hover:bg-pf-primary hover:text-white"
        }`}
      >
        <Icon
          name={
            state === "done"
              ? "CircleCheck"
              : state === "failed"
                ? "CircleAlert"
                : "Download"
          }
          size={13}
        />
        {label}
      </button>

      {/* ---- import to editor: not built yet ----
          aria-disabled rather than the disabled attribute, because a disabled
          button stops firing pointer events in some browsers and the whole
          point of this control right now is its hover message. */}
      <div className="pointer-events-auto relative">
        <button
          ref={lockRef}
          type="button"
          aria-disabled="true"
          onClick={(e) => e.preventDefault()}
          onMouseEnter={openTip}
          onMouseLeave={() => setTip(false)}
          onFocus={openTip}
          onBlur={() => setTip(false)}
          className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-pf-md bg-pf-bg/70 px-2.5 py-1.5 text-[11.5px] font-semibold text-pf-faint shadow-pf-float backdrop-blur transition-colors duration-150 hover:text-pf-muted"
        >
          <Icon name="Lock" size={12} />
          Import to editor
        </button>

        <AnimatePresence>
          {tip && (
            <motion.div
              role="tooltip"
              initial={{ opacity: 0, y: below ? -4 : 4, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: below ? -4 : 4, scale: 0.97 }}
              transition={{ duration: 0.16 }}
              className={`absolute right-0 z-40 w-[236px] rounded-pf-md border border-pf-border bg-pf-bg-deep px-3 py-2.5 text-left text-[11.5px] leading-snug text-pf-body shadow-pf-float ${
                below ? "top-[calc(100%+8px)]" : "bottom-[calc(100%+8px)]"
              }`}
            >
              {LOCKED_TOOLTIP}
              <span
                className={`absolute right-5 size-2 rotate-45 border-pf-border bg-pf-bg-deep ${
                  below ? "-top-1 border-l border-t" : "-bottom-1 border-b border-r"
                }`}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
