"use client";

import { useEffect, useRef } from "react";
import { encodeRunPayload } from "@/lib/runPayload";
import { useStore } from "@/lib/store";
import { VISUAL_STYLES } from "@/lib/styleTokens";
import { useAccount } from "./AccountProvider";

/* ==========================================================================
   Saves a finished run and re-reads the allowance.

   It does NOT navigate. A merchant who just pressed Create wants to look at what
   came out, right where they were; being moved to another tab mid-thought is worse
   than a second copy of the deck existing. Starting the next build is the Design
   tab's job — see WorkspaceNav.

   Guarded twice on purpose. The ref below stops a re-render from saving twice, but
   it lives in the component: navigating Design → Library → Design remounts this and
   the ref resets, which is how one build became seven rows. The durable guard is
   the run id being derived from content, so the database refuses a duplicate
   however many times a client asks.

   A separate component rather than a call inside the store: the store must stay
   free of network work, and this way nothing about how pages are generated is
   touched by persistence.

   What is stored is the brief and each page's variant, never the pages — see
   lib/runPayload.ts. Reopening replays the generator and gets the same deck.
   ========================================================================== */

export function RunRecorder() {
  const screen = useStore((s) => s.screen);
  const brief = useStore((s) => s.brief);
  const pages = useStore((s) => s.pages);
  const variants = useStore((s) => s.variants);
  const reopened = useStore((s) => s.reopened);
  const tokens = useStore((s) => s.tokens);
  const { refresh } = useAccount();

  /* Signature of the last run written, so a re-render, a filter change or a
     device switch cannot save the same deck twice. */
  const saved = useRef<string | null>(null);

  useEffect(() => {
    /* A deck reopened from the Library is already saved. Without this check,
       opening one and navigating back to Design wrote it again as a new build and
       charged the allowance a second time. */
    if (reopened) return;
    if (screen !== "results" || !brief || pages.length === 0) return;

    const payload = encodeRunPayload(brief, variants);
    const signature = `${payload}::${pages.map((p) => p.id).join(",")}`;
    if (saved.current === signature) return;
    saved.current = signature;

    const style = VISUAL_STYLES.find((s) => s.id === brief.visualStyle);

    void (async () => {
      try {
        const res = await fetch("/api/runs", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            payload,
            pages: pages.map((p) => ({
              pageId: p.id,
              pageType: p.pageType,
              label: p.label,
              index: p.index,
            })),
            sell: brief.whatYouSell,
            styleLabel: style?.label ?? brief.visualStyle,
            /* Real model spend for this build, summed across its pages. Still 0
               when no model is configured, which is the honest number then. */
            tokens,
          }),
        });
        /* A rejected save must not be remembered as done — the next render
           should try again rather than silently losing the run. */
        if (!res.ok) saved.current = null;
      } catch {
        saved.current = null;
      }
      await refresh();
    })();
  }, [screen, brief, pages, variants, reopened, tokens, refresh]);

  return null;
}
