"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { FeedbackResponse } from "@/app/api/customer-feedback/route";
import { Button, Eyebrow, GradientWord, Icon, Panel } from "../ui";
import { StarRating } from "./StarRating";

/* ==========================================================================
   The page behind the link we send a merchant.

   The same question the in-app prompt asks, for someone who is not in the app —
   so it asks for nothing else. No sign-in, no name, no email, no domain field:
   the domain is in the URL because we put it there, and a form that asks a
   merchant to retype what we already know is a form fewer of them finish.

   Same shell, glow and type scale as the sign-in screen. This link is often the
   first PageFly Design page a merchant opens, and it has to read as the product
   rather than as a survey tool someone bolted on.
   ========================================================================== */

type Phase = "asking" | "sending" | "thanks" | "already";

export function FeedbackScreen({ domain }: { domain: string | null }) {
  const [phase, setPhase] = useState<Phase>("asking");
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!domain || stars < 1 || phase === "sending") return;

    setPhase("sending");
    setError(null);
    try {
      const res = await fetch("/api/customer-feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domain, stars, comment }),
      });

      /* A crashed route answers with an HTML error page, and res.json() throws
         on it — which would surface as "could not reach the server" for a
         server that had very much answered. */
      let body: FeedbackResponse;
      try {
        body = (await res.json()) as FeedbackResponse;
      } catch {
        setError(`The server returned an error (${res.status}).`);
        setPhase("asking");
        return;
      }

      if (!body.ok) {
        setError(body.error);
        setPhase("asking");
        return;
      }

      /* The server accepts the request and reports that it kept the earlier
         review. Saying "thanks for the feedback" here would be thanking them
         for something that was not stored. */
      setPhase(body.alreadyReviewed ? "already" : "thanks");
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      setPhase("asking");
    }
  };

  return (
    <div
      translate="no"
      className="notranslate pfd-root relative min-h-screen overflow-x-clip"
    >
      <div aria-hidden className="pfd-glow absolute inset-x-0 top-0 h-[720px]" />
      <div aria-hidden className="pfd-grid absolute inset-x-0 top-0 h-[720px]" />

      <div className="relative mx-auto w-full max-w-[1600px] px-4 pb-8 pt-4 sm:px-6 sm:pt-6">
        <header className="flex items-center gap-2 border-b border-pf-border pb-3.5">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-pf-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-pf-primary-hi"
          >
            <Image
              src="/pagefly-icon.png"
              alt="PageFly Design — home"
              width={28}
              height={28}
              className="size-7 rounded-pf-sm"
              priority
            />
            <span className="font-display text-[15px] font-semibold tracking-[-0.02em] text-pf-text">
              PageFly <span className="text-pf-muted">Design</span>
            </span>
          </Link>
        </header>

        <main className="grid place-items-center px-2 pt-[8vh] sm:pt-[11vh]">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-[480px]"
          >
            {domain === null ? (
              <Incomplete />
            ) : phase === "thanks" || phase === "already" ? (
              <Done phase={phase} />
            ) : (
              <>
                <div className="grid gap-2 text-center">
                  <Eyebrow>{domain}</Eyebrow>
                  <h1 className="font-display text-[30px] font-bold leading-[1.1] tracking-[-0.03em] text-pf-text sm:text-[38px]">
                    Was this <GradientWord>useful</GradientWord> to you?
                  </h1>
                  <p className="mx-auto max-w-[400px] text-[13.5px] leading-relaxed text-pf-muted">
                    One rating, no sign-in. It goes straight to the team building
                    PageFly Design.
                  </p>
                </div>

                <Panel className="mt-6 p-4 sm:p-5">
                  <form onSubmit={submit} className="grid gap-3.5" noValidate>
                    <div className="grid gap-1.5">
                      <span className="text-[12px] font-semibold text-pf-body">
                        Your rating
                      </span>
                      <StarRating
                        value={stars}
                        onChange={(n) => {
                          setStars(n);
                          setError(null);
                        }}
                        size={30}
                        disabled={phase === "sending"}
                      />
                    </div>

                    <label className="grid gap-1.5">
                      <span className="text-[12px] font-semibold text-pf-body">
                        Anything you would change?{" "}
                        <span className="font-normal text-pf-faint">(optional)</span>
                      </span>
                      <textarea
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        rows={4}
                        maxLength={2000}
                        placeholder="What worked, what did not…"
                        className="w-full resize-none rounded-pf-md border border-pf-border bg-pf-bg-deep px-3 py-2 text-[13.5px] text-pf-text outline-none transition-colors placeholder:text-pf-faint focus:border-pf-primary-hi"
                      />
                    </label>

                    {error && (
                      <motion.div
                        role="alert"
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-start gap-2 rounded-pf-md border border-pf-danger/35 bg-pf-danger/10 px-3 py-2.5"
                      >
                        <span className="mt-px text-pf-danger">
                          <Icon name="CircleAlert" size={14} />
                        </span>
                        <p className="text-[12.5px] font-semibold text-pf-danger">
                          {error}
                        </p>
                      </motion.div>
                    )}

                    {/* Disabled until a star is picked: the comment is optional
                        and the rating is not, so the button says which of the
                        two is still missing rather than the form rejecting it
                        after the fact. */}
                    <Button
                      type="submit"
                      disabled={stars < 1 || phase === "sending"}
                      className="w-full"
                    >
                      {phase === "sending"
                        ? "Sending…"
                        : stars < 1
                          ? "Pick a rating"
                          : "Submit"}
                    </Button>
                  </form>
                </Panel>
              </>
            )}
          </motion.div>
        </main>
      </div>
    </div>
  );
}

/** Sent, or sent once before. Worded as a fact rather than a refusal: they did
    the thing, and being told "you cannot" for having done it reads as a
    scolding. */
function Done({ phase }: { phase: "thanks" | "already" }) {
  return (
    <Panel className="grid gap-2.5 px-6 py-10 text-center">
      <span className="mx-auto grid size-11 place-items-center rounded-full bg-pf-success/15 text-pf-success">
        <Icon name="CircleCheck" size={22} />
      </span>
      <h1 className="font-display text-[22px] font-bold tracking-[-0.02em] text-pf-text">
        {phase === "thanks" ? "Thanks for the feedback" : "You already left a review"}
      </h1>
      <p className="mx-auto max-w-[320px] text-[13px] leading-relaxed text-pf-muted">
        {phase === "thanks"
          ? "It goes straight to the team building this. You can close this tab."
          : "Thanks — one rating per store is all we ask for."}
      </p>
    </Panel>
  );
}

/** The link was edited, truncated by a mail client, or sent without its query
    string. Nothing here can recover the domain, so it says so plainly instead
    of showing a form whose submit would always fail. */
function Incomplete() {
  return (
    <Panel className="grid gap-2.5 px-6 py-10 text-center">
      <span className="mx-auto grid size-11 place-items-center rounded-full bg-pf-danger/15 text-pf-danger">
        <Icon name="CircleAlert" size={22} />
      </span>
      <h1 className="font-display text-[22px] font-bold tracking-[-0.02em] text-pf-text">
        This feedback link is incomplete
      </h1>
      <p className="mx-auto max-w-[340px] text-[13px] leading-relaxed text-pf-muted">
        It is missing the store it was meant for. Open the link from the message
        we sent you, or ask us for a new one.
      </p>
    </Panel>
  );
}
