import Image from "next/image";
import Link from "next/link";

/* The masthead and page frame both /collection-pages screens share. Public, like
   the front door: not in `proxy.ts`'s matcher. */
export function CollectionShell({ children, current = "all" }: { children: React.ReactNode; current?: "all" | "ja" }) {
  const ja = current === "ja";
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
          <nav aria-label={ja ? "メイン" : "Main"} className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/collection-pages"
              className="hidden px-2 py-2 text-[14px] font-medium text-pf-body/[.78] transition-colors hover:text-pf-text md:inline"
            >
              {ja ? "すべてのセット" : "Collection pages"}
            </Link>
            <Link
              href="/collection-pages/ja"
              aria-current={ja ? "page" : undefined}
              className={`hidden items-center gap-2 whitespace-nowrap rounded-pf-pill px-3.5 py-2 text-[14px] font-semibold transition-colors sm:flex ${
                ja ? "bg-pf-text text-pf-bg" : "border border-pf-border-hi text-pf-text hover:border-pf-primary-hi"
              }`}
            >
              日本向け
              {!ja && <span className="hidden rounded-pf-pill bg-pf-danger px-1.5 py-px text-[10.5px] font-bold text-white sm:inline">NEW</span>}
            </Link>
            <div role="group" aria-label={ja ? "言語" : "Language"} className="flex shrink-0 rounded-pf-pill border border-pf-border p-[3px]">
              <Link
                href="/collection-pages"
                hrefLang="en"
                aria-current={ja ? undefined : "page"}
                className={`whitespace-nowrap rounded-pf-pill px-2.5 py-1.5 text-[12.5px] font-semibold ${ja ? "text-pf-body/[.78] hover:text-pf-text" : "bg-pf-text text-pf-bg"}`}
              >
                EN
              </Link>
              <Link
                href="/collection-pages/ja"
                hrefLang="ja"
                aria-current={ja ? "page" : undefined}
                className={`whitespace-nowrap rounded-pf-pill px-2.5 py-1.5 text-[12.5px] font-semibold ${ja ? "bg-pf-text text-pf-bg" : "text-pf-body/[.78] hover:text-pf-text"}`}
              >
                日本語
              </Link>
            </div>
          </nav>
        </div>
      </header>
      <div className="px-5 py-14 sm:px-8 sm:py-20 lg:px-[120px]">
        <div className="mx-auto max-w-[1200px]">{children}</div>
      </div>
    </main>
  );
}
