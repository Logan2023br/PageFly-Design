import Image from "next/image";
import type { ReactNode } from "react";

/* The frame /new-page shares with its "not found" and "expired" answers.
   Same masthead as /collection-pages, without that screen's navigation —
   a merchant here has one thing to do. */
export function UpsellShell({ banner, children }: { banner?: ReactNode; children: ReactNode }) {
  return (
    <main className="pfd-root relative min-h-dvh overflow-x-clip bg-pf-bg text-pf-body">
      <div aria-hidden className="pfd-glow absolute inset-x-0 top-0 h-[620px]" />
      <div aria-hidden className="pfd-grid absolute inset-x-0 top-0 h-[620px]" />
      <header className="sticky top-0 z-40 border-b border-pf-border bg-[rgba(10,6,22,0.92)] backdrop-blur">
        <div className="flex h-[72px] items-center gap-2.5 px-4 sm:px-8 lg:px-[120px]">
          <Image src="/pagefly-icon.png" alt="" width={28} height={28} className="size-7 rounded-[7px]" priority />
          <span className="font-display text-[17px] font-bold tracking-[-0.012em] text-pf-text">PageFly</span>
        </div>
      </header>
      {banner}
      <div className="relative px-4 py-12 sm:px-8 sm:py-20 lg:px-[120px]">
        <div className="mx-auto max-w-[1200px]">{children}</div>
      </div>
    </main>
  );
}
