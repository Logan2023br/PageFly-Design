"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import {
  EXPORTED_EVENT,
  installPromptSeen,
  markInstallPromptSeen,
} from "@/lib/pagefly/install";
import { useAccount } from "../AccountProvider";
import { Icon } from "../ui";
import { InstallPageFlyButton } from "./InstallPageFly";

/* ==========================================================================
   "You'll need the app to open that."

   THE ONE MOMENT THIS IS AN INSTRUCTION. A .pagefly opens in PageFly and
   nowhere else, so a merchant who has just downloaded their first one is
   holding a file they cannot use. Said at any other time it would be an
   advertisement; said here it is the next step.

   ONCE, AND ONLY THE MERCHANT CLOSES IT. Not a timer, not a click outside —
   both are ways for a panel to vanish before it has been read, and this one is
   telling somebody why the thing they just downloaded does not open. The X is
   the only way out, and taking it is what marks it seen.

   IT DOES NOT BLOCK THE EXPORT. The download has already happened by the time
   this appears; nothing here gates anything. A merchant who already has
   PageFly closes it and has lost two seconds.
   ========================================================================== */

export function InstallPrompt() {
  const { account } = useAccount();
  const domain = account?.domain ?? null;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!domain) return;

    const onExported = () => {
      /* Checked when it fires rather than on mount: the flag is written by
         this same component, and a merchant who exports twice in one session
         must see it once. */
      if (!installPromptSeen(domain)) setOpen(true);
    };

    window.addEventListener(EXPORTED_EVENT, onExported);
    return () => window.removeEventListener(EXPORTED_EVENT, onExported);
  }, [domain]);

  const close = () => {
    setOpen(false);
    if (domain) markInstallPromptSeen(domain);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-label="Install PageFly"
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 320, damping: 30 }}
          /* No positioning of its own — `NoticeStack` owns where the corner is
             and what order things sit in when two of these are up at once. */
          className="pfd-glass w-[min(360px,calc(100vw-2rem))] rounded-pf-card border border-pf-border p-4 shadow-pf-float"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="grid size-8 shrink-0 place-items-center rounded-pf-sm bg-pf-primary/15 text-pf-primary-hi">
                <Icon name="Download" size={16} />
              </span>
              <p className="text-[13px] font-semibold text-pf-text">
                Your file is downloading
              </p>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="-mr-1 -mt-1 shrink-0 rounded-pf-sm p-1 text-pf-faint transition-colors hover:text-pf-text focus:outline-none focus-visible:ring-2 focus-visible:ring-pf-primary-hi"
            >
              <Icon name="X" size={15} />
            </button>
          </div>

          <p className="mt-2.5 text-[12.5px] leading-relaxed text-pf-muted">
            To open and edit a <span className="text-pf-body">.pagefly</span>{" "}
            file you&rsquo;ll need the PageFly app on your store.
          </p>

          <InstallPageFlyButton size="sm" surface="export_popup" className="mt-3 w-full" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
