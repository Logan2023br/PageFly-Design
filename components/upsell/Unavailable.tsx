"use client";

import { MessageSquare, SearchX, TimerOff } from "lucide-react";
import { openCrispChat } from "./CrispChat";

/* What a link shows when there is nothing behind it for this visitor: never
   there, not sent yet (said the same way — a stranger learns nothing), or
   expired. Always with a way to reach a person. */
export function Unavailable({ reason }: { reason: "missing" | "expired" | "rejected" }) {
  const expired = reason !== "missing";
  const Icon = expired ? TimerOff : SearchX;
  return (
    <section className="mx-auto grid max-w-[560px] justify-items-center gap-5 py-10 text-center">
      <span className="grid size-14 place-items-center rounded-full border border-pf-border bg-pf-card text-pf-primary-hi">
        <Icon size={26} strokeWidth={1.75} aria-hidden />
      </span>
      <h1 className="font-display text-[28px] font-bold tracking-[-0.02em] text-pf-text sm:text-[34px]">
        {expired ? "This link is no longer available" : "We couldn’t find these pages"}
      </h1>
      <p className="text-[15.5px] leading-relaxed text-pf-muted">
        {expired
          ? "The pages behind this link have expired. Our support team is happy to help — send us a message and we’ll sort it out."
          : "The link may be incomplete, or the pages aren’t ready yet. If someone from PageFly sent it to you, reply in chat and we’ll help."}
      </p>
      <button
        type="button"
        onClick={openCrispChat}
        className="inline-flex h-12 items-center gap-2 rounded-pf-md bg-pf-primary px-6 text-[14.5px] font-semibold text-white shadow-pf-button transition-colors hover:bg-pf-primary-hi"
      >
        <MessageSquare size={17} strokeWidth={1.75} aria-hidden />
        Chat with PageFly Support
      </button>
    </section>
  );
}
