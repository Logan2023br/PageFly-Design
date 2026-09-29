import Image from "next/image";
import { Gift } from "lucide-react";
import Link from "next/link";

/* The masthead and page frame both /collection-pages screens share. Public, like
   the front door: not in `proxy.ts`'s matcher. */
export function CollectionShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="pfd-root relative min-h-dvh overflow-x-clip bg-pf-bg text-pf-body">
      <header className="sticky top-0 z-40 border-b border-pf-border bg-[rgba(10,6,22,0.92)] backdrop-blur">
        <div className="flex h-[72px] items-center justify-between gap-4 px-5 sm:px-8 lg:px-[120px]">
          <Link href="/" className="flex shrink-0 items-center gap-2.5 text-pf-text">
            <Image
              src="/pagefly-icon.png"
              alt=""
              width={28}
              height={28}
              className="size-7 rounded-[7px]"
              priority
            />
            <span className="font-display text-[17px] font-bold tracking-[-0.012em]">
              PageFly <span className="font-semibold text-pf-muted">Design</span>
            </span>
          </Link>
          <nav className="flex items-center gap-5">
            <Link
              href="/collection-pages"
              className="hidden text-[14px] font-medium text-pf-body/[.78] transition-colors hover:text-pf-text sm:inline"
            >
              Collection pages
            </Link>
            <Link
              href="/collection-pages/referral"
              className="inline-flex items-center gap-1.5 rounded-pf-pill border border-pf-warn/40 bg-pf-warn/10 px-3 py-1.5 text-[13px] font-semibold text-pf-warn transition-colors hover:border-pf-warn hover:bg-pf-warn/20"
            >
              <Gift size={14} strokeWidth={1.75} aria-hidden />
              Referral program
            </Link>
          </nav>
        </div>
      </header>
      <div className="px-5 py-14 sm:px-8 sm:py-20 lg:px-[120px]">
        <div className="mx-auto max-w-[1200px]">{children}</div>
      </div>
    </main>
  );
}
