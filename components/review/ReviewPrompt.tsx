"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { ReviewResponse } from "@/app/api/review/route";
import { useAccount } from "../AccountProvider";
import { Button, Icon } from "../ui";

/* ==========================================================================
   "Was this useful?" — a short wait after a build, once per store.

   Two triggers, whichever lands later:

   - 15 seconds after the last build, timed from the SERVER's record of it, so the
     wait keeps running across a reload rather than restarting.
   - 15 seconds after signing in, for a merchant who already has builds and never
     answered. Without this they would only ever be asked in the window right
     after a build, and someone who came back the next day would never see it.

   The session mark lives in sessionStorage, not in this component: moving between
   Design and Library remounts it, and a merchant who keeps switching tabs would
   otherwise restart the countdown for ever and never be asked at all.

   Shown once ever: the server refuses a second review, and `hasReviewed` hides
   the form. Dismissing without answering does not mark it as done — it only
   stays out of the way for the rest of this session, so a merchant who closed it
   by accident is asked again on their next visit rather than never.
   ========================================================================== */

const DELAY_MS = 15 * 1000;

/** When this browser session first saw the app, per store. */
function sessionStartedAt(domain: string): number {
  const key = `pfd.session.${domain}`;
  try {
    const stored = window.sessionStorage.getItem(key);
    if (stored) {
      const at = Number(stored);
      if (Number.isFinite(at)) return at;
    }
    const now = Date.now();
    window.sessionStorage.setItem(key, String(now));
    return now;
  } catch {
    /* Private mode or storage disabled. Falling back to "now" means the wait
       restarts on navigation, which is a worse prompt but never a broken one. */
    return Date.now();
  }
}

type Phase = "hidden" | "asking" | "sending" | "thanks";

export function ReviewPrompt() {
  const { account } = useAccount();
  const [phase, setPhase] = useState<Phase>("hidden");
  const [dismissed, setDismissed] = useState(false);
  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  const lastRunAt = account?.lastRunAt ?? null;
  const eligible = Boolean(account && !account.hasReviewed && lastRunAt);

  const domain = account?.domain ?? "";

  /* One timer, armed for whatever is left of the wait. When both marks are
     already past — a merchant coming back the next day — the remainder is
     negative and it opens on this render's timeout. */

  useEffect(() => {
    if (!eligible || dismissed || !lastRunAt || !domain) return;

    const finishedAt = new Date(lastRunAt).getTime();
    if (Number.isNaN(finishedAt)) return;

    /* Whichever comes later. A build that finished long ago is due immediately on
       the session clock; a build that just finished is due on its own. */
    const dueAt = Math.max(
      finishedAt + DELAY_MS,
      sessionStartedAt(domain) + DELAY_MS,
    );

    const timer = setTimeout(
      () => setPhase((p) => (p === "hidden" ? "asking" : p)),
      Math.max(0, dueAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [eligible, dismissed, lastRunAt, domain]);

  const submit = async () => {
    if (stars < 1 || phase === "sending") return;
    setPhase("sending");
    setError(null);
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stars, comment }),
      });
      const body = (await res.json()) as ReviewResponse;
      if (!body.ok) {
        setError(body.error);
        setPhase("asking");
        return;
      }
      setPhase("thanks");
    } catch {
      setError("Could not send that. Please try again.");
      setPhase("asking");
    }
  };

  const open = phase !== "hidden";
  const shown = hover || stars;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-label="Rate PageFly Design"
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 320, damping: 30 }}
          className="pfd-glass fixed bottom-4 right-4 z-50 w-[min(360px,calc(100vw-2rem))] rounded-pf-card border border-pf-border p-4 shadow-pf-float"
        >
          {phase === "thanks" ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="grid gap-2 py-1 text-center"
            >
              <span className="mx-auto grid size-9 place-items-center rounded-full bg-pf-success/15 text-pf-success">
                <Icon name="CircleCheck" size={18} />
              </span>
              <p className="text-[14px] font-semibold text-pf-text">
                Thanks for the feedback
              </p>
              <p className="text-[12.5px] text-pf-muted">
                It goes straight to the team building this.
              </p>
              <Button
                variant="quiet"
                size="sm"
                className="mx-auto mt-1"
                onClick={() => setPhase("hidden")}
              >
                Close
              </Button>
            </motion.div>
          ) : (
            <div className="grid gap-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[13.5px] font-semibold leading-snug text-pf-text">
                  Was this useful to you?
                </p>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => {
                    setDismissed(true);
                    setPhase("hidden");
                  }}
                  className="-mr-1 -mt-1 shrink-0 rounded-pf-sm p-1 text-pf-faint transition-colors hover:text-pf-text"
                >
                  <Icon name="X" size={15} />
                </button>
              </div>

              {/* Hovering the nth star lights 1..n, which is what makes a star
                  row read as a scale rather than as five separate buttons. */}
              <div
                className="flex items-center gap-1"
                onMouseLeave={() => setHover(0)}
                role="radiogroup"
                aria-label="Rating out of 5"
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={stars === n}
                    aria-label={`${n} star${n === 1 ? "" : "s"}`}
                    onMouseEnter={() => setHover(n)}
                    onFocus={() => setHover(n)}
                    onBlur={() => setHover(0)}
                    onClick={() => setStars(n)}
                    className="rounded-pf-sm p-0.5 transition-transform hover:scale-110"
                  >
                    <motion.span
                      animate={{ scale: shown >= n ? 1 : 0.94 }}
                      transition={{ duration: 0.12 }}
                      className={`block ${shown >= n ? "text-pf-warn" : "text-pf-faint"}`}
                    >
                      <Star filled={shown >= n} />
                    </motion.span>
                  </button>
                ))}
                <span className="ml-1.5 text-[12px] tabular-nums text-pf-muted">
                  {shown ? `${shown}/5` : ""}
                </span>
              </div>

              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Anything you would change? (optional)"
                className="w-full resize-none rounded-pf-md border border-pf-border bg-pf-bg-deep px-3 py-2 text-[13px] text-pf-text outline-none transition-colors placeholder:text-pf-faint focus:border-pf-primary-hi"
              />

              {error && (
                <p role="alert" className="text-[12px] font-semibold text-pf-danger">
                  {error}
                </p>
              )}

              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="quiet"
                  size="sm"
                  onClick={() => {
                    setDismissed(true);
                    setPhase("hidden");
                  }}
                >
                  Not now
                </Button>
                <Button
                  size="sm"
                  disabled={stars < 1 || phase === "sending"}
                  onClick={() => void submit()}
                >
                  {phase === "sending" ? "Sending…" : "Submit"}
                </Button>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Drawn rather than taken from the icon set: the set's Star has one outline
    shape, and this needs a filled and an unfilled state at the same weight. */
function Star({ filled }: { filled: boolean }) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 3.2l2.62 5.3 5.85.85-4.24 4.13 1 5.82L12 16.57l-5.23 2.75 1-5.82L3.53 9.35l5.85-.85z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    </svg>
  );
}
