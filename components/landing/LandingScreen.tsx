"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { PageMockup } from "@/lib/generate/types";
import { GradientWord } from "../ui";
import { Counts, type Counts as CountsData } from "./Counts";
import { HowItWorks } from "./HowItWorks";
import { Showcase } from "./Showcase";

/* ==========================================================================
   The front door.

   Public: no session, no account call, no model call. `/` is deliberately not
   in the proxy's matcher — see `proxy.ts` — so this renders for anyone.

   DESIGN NOW IS A PLAIN LINK. `/design` is guarded and the guard already
   redirects to `/design/login?next=…` and returns you afterwards. A sign-in
   check here would be a second implementation of a rule that already exists,
   and two implementations of an auth rule is one more than is safe.

   The showcase is fetched client-side rather than server-rendered: it is the
   one part that touches the database, and a slow or missing database should
   cost this page a section rather than the whole render.
   ========================================================================== */

export function LandingScreen() {
  const [pages, setPages] = useState<PageMockup[]>([]);
  const [counts, setCounts] = useState<CountsData>({});

  useEffect(() => {
    let alive = true;
    fetch("/api/showcase")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!alive || !data) return;
        setPages(Array.isArray(data.pages) ? data.pages : []);
        setCounts(data.counts ?? {});
      })
      .catch(() => {
        /* Nothing. The sections render nothing when they have nothing, which is
           the whole failure plan: a front door that errors because a demo run
           was deleted is worse than one with a section missing. */
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <main className="pfd-root min-h-dvh bg-pf-bg text-pf-body">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Link href="/" className="flex items-center gap-2.5">
          <Image
            src="/pagefly-icon.png"
            alt=""
            width={28}
            height={28}
            className="size-7 rounded-pf-sm"
            priority
          />
          <span className="font-display text-[15px] font-semibold tracking-[-0.02em] text-pf-text">
            PageFly <span className="text-pf-muted">Design</span>
          </span>
        </Link>

        <Link
          href="/design"
          className="rounded-pf-md border border-pf-border px-3.5 py-2 text-[13.5px] font-semibold text-pf-text transition-colors hover:border-pf-border-hi"
        >
          Sign in
        </Link>
      </header>

      <section className="mx-auto max-w-4xl px-5 pb-4 pt-10 text-center sm:pt-16">
        <h1 className="font-display text-pf-hero font-semibold text-pf-text">
          See your store as <GradientWord>pages</GradientWord>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-pf-body text-pf-muted">
          Describe what you sell. Get a home page, a product page and everything
          around them back as real mockups — then send them straight into the
          PageFly editor.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3">
          <Link
            href="/design"
            className="rounded-pf-md bg-pf-primary px-6 py-3 text-[15px] font-semibold text-white shadow-pf-float transition-colors hover:bg-pf-primary-hi"
          >
            Design now
          </Link>
          <span className="text-[12.5px] text-pf-faint">
            Sign in with your store domain — nothing to install.
          </span>
        </div>
      </section>

      <Showcase pages={pages} />
      <HowItWorks />
      <Counts counts={counts} />

      <section className="mx-auto max-w-3xl px-5 pb-20 text-center">
        <h2 className="font-display text-pf-h2 font-semibold text-pf-text">
          Your turn
        </h2>
        <p className="mx-auto mt-3 max-w-lg text-pf-body text-pf-muted">
          Four answers is all it needs. The first build takes about two minutes.
        </p>
        <Link
          href="/design"
          className="mt-7 inline-block rounded-pf-md bg-pf-primary px-6 py-3 text-[15px] font-semibold text-white shadow-pf-float transition-colors hover:bg-pf-primary-hi"
        >
          Design now
        </Link>
      </section>

      <footer className="border-t border-pf-border px-5 py-8 text-center text-[12.5px] text-pf-faint">
        PageFly Design
      </footer>
    </main>
  );
}
