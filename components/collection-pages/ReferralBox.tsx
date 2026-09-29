"use client";

import Link from "next/link";
import { EV, track } from "@/lib/analytics";
import { REFERRAL_GOAL, REFERRAL_URL } from "@/lib/referral";
import { Icon } from "../ui";

/* ==========================================================================
   THE REFERRAL OFFER, BESIDE THE PREMIUM SETS.

   Beside them rather than below, because it is an answer to the price on
   those cards: "or earn one". Placed where the eye lands after reading the
   heading, and sized to sit there without pushing the cards down.

   IT MOVES ON HOVER AND ONLY THEN — a lift, the border warming, a sheen
   crossing it, the gift tipping — so it is found by the same hand that has
   been hovering the cards, and is still when nobody is looking at it.
   ========================================================================== */

export function ReferralBox() {
  return (
    <Link
      href={REFERRAL_URL}
      onClick={() => track(EV.cpReferralBoxClicked, {})}
      className="group relative block w-full max-w-[440px] rounded-[20px] bg-gradient-to-br from-pf-warn/70 via-pf-primary-hi/50 to-pf-primary/70 p-px shadow-[0_18px_50px_-24px_rgba(251,191,36,0.55)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_26px_60px_-18px_rgba(251,191,36,0.7)] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <span className="relative flex gap-4 overflow-hidden rounded-[19px] bg-[linear-gradient(135deg,#1c1426_0%,#120c1f_55%,#1a1030_100%)] p-5">
        {/* the sheen, crossing once per hover */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 transition-all duration-700 group-hover:left-[120%] group-hover:opacity-100 motion-reduce:hidden"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-12 size-40 rounded-full bg-pf-warn/20 blur-3xl transition-transform duration-500 group-hover:scale-125"
        />

        <span className="relative grid size-11 shrink-0 place-items-center rounded-2xl sm:size-14 bg-gradient-to-br from-pf-warn to-[#f59e0b] text-pf-ink shadow-[0_8px_24px_-6px_rgba(251,191,36,0.7)] transition-transform duration-500 group-hover:-rotate-12 group-hover:scale-110 motion-reduce:transition-none">
          <Icon name="Gift" size={26} />
        </span>

        <span className="relative min-w-0">
          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-pf-warn">
            <Icon name="Sparkles" size={11} />
            Referral program
          </span>
          <span className="mt-1 block font-display text-[17px] font-bold leading-snug tracking-[-0.01em] text-pf-text">
            Refer {REFERRAL_GOAL} stores, get a premium template free
          </span>
          <span className="mt-1 block text-[12.5px] leading-relaxed text-pf-muted">
            When {REFERRAL_GOAL} stores you refer install PageFly and upgrade to any paid plan, one
            premium page set is yours.
          </span>
          <span className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2.5">
            <span className="flex items-center gap-1" aria-hidden>
              {Array.from({ length: REFERRAL_GOAL }, (_, i) => (
                <span
                  key={i}
                  style={{ transitionDelay: `${i * 60}ms` }}
                  className="grid size-6 place-items-center rounded-full border border-pf-warn/40 bg-pf-warn/10 text-pf-warn transition-colors duration-300 group-hover:border-pf-warn group-hover:bg-pf-warn group-hover:text-pf-ink"
                >
                  <Icon name="ShoppingBag" size={11} />
                </span>
              ))}
              <Icon name="ArrowRight" size={12} className="mx-0.5 text-pf-faint" />
              <span className="grid size-6 place-items-center rounded-full bg-pf-primary text-white">
                <Icon name="Gift" size={11} />
              </span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-pf-md bg-pf-warn px-3.5 py-2 text-[13px] font-bold text-pf-ink shadow-pf-button">
              Join now
              <Icon
                name="ArrowRight"
                size={14}
                className="transition-transform duration-300 group-hover:translate-x-1"
              />
            </span>
          </span>
        </span>
      </span>
    </Link>
  );
}
