"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { JP_COPY, JP_FEATURED, JP_INDUSTRIES, LANGS, langInfo, type LangCode } from "@/lib/collectionMarkets";
import { EV, track } from "@/lib/analytics";
import { entryFor, refHost, screenBucket, useSeenOnce, useTrackOnce } from "./cpTrack";
import { ORDERS_OPEN, countLabel, pagesLabel, type PublicCollectionSet } from "@/lib/collectionPages";
import { Icon } from "../ui";
import { PageThumb } from "../landing/PagePreview";
import { PromoCards } from "./PromoCards";
import { SetAction } from "./SetAction";


/* ==========================================================================
   EVERY SET, ONE CARD EACH — FREE FIRST, THEN PREMIUM.

   Two groups under their own headings, because the two are different offers
   and a mixed grid makes a visitor read every card's corner to learn which is
   which. Free comes first: it is what most visitors came for, and it earns the
   trust the premium row then asks for. A group with nothing in it is left out
   rather than shown empty.

   The card's picture is the set's first page — its Home, the cover a merchant
   would meet the store by — and the chips under it name the rest.

   `preview` is /collection-pages-preview: the sets set to "Visible preview",
   drawn the same way. Its list and section views are not reported — that page
   is for checking sets, and its visits would blur the public page's funnel.
   ========================================================================== */
export function SetList({
  sets,
  preview = false,
}: {
  sets: PublicCollectionSet[];
  preview?: boolean;
}) {
  const free = sets.filter((s) => s.access === "free");
  const paid = sets.filter((s) => s.access === "paid");

  useTrackOnce("list", () => {
    if (preview) return;
    track(EV.cpListViewed, {
      entry: entryFor("list"),
      ref: refHost(),
      screen: screenBucket(),
      sets: sets.length,
    });
  });

  const [query, setQuery] = useState("");
  const [lang, setLang] = useState<LangCode | "all">("all");
  const languages = useMemo(
    () => LANGS.map((l) => ({ ...l, count: free.filter((s) => (s.lang ?? "en") === l.code).length })).filter((l) => l.count > 0),
    [free],
  );
  const shown = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return free.filter((s) => (lang === "all" || (s.lang ?? "en") === lang) && words.every((w) => haystack(s).includes(w)));
  }, [free, query, lang]);
  const featured = JP_FEATURED.map((slug) => free.find((s) => s.id === slug)).filter((s): s is PublicCollectionSet => !!s);
  const jpCount = free.filter((s) => s.lang === "ja").length;
  const finder = !preview && free.length > 0;

  return (
    <>
      <div className="max-w-[760px]">
        <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-pf-primary-hi">
          {preview
            ? "Collection pages · Preview"
            : `Free page sets · ${free.length} sets · ${languages.length} ${languages.length === 1 ? "language" : "languages"}`}
        </p>
        <h1 className="mt-3 font-display text-[34px] font-bold leading-[1.1] tracking-[-0.02em] text-pf-text sm:text-[48px]">
          Complete page sets, one store each.
        </h1>
        <p className="mt-4 text-[16px] leading-relaxed text-pf-muted">
          Pick a set to see every page in it. Download the whole set in one file and import it into PageFly — free,
          no sign-up.
        </p>
        {preview && sets.length === 0 && (
          <p className="mt-6 text-[14px] text-pf-faint">No set is in preview right now.</p>
        )}
      </div>

      {finder && (
        <section aria-label="Find a set" className="mt-8 grid gap-4">
          <form role="search" onSubmit={(e) => e.preventDefault()} className="grid gap-2">
            <label htmlFor="cp-search" className="text-[13px] font-semibold text-pf-body">
              Search sets
            </label>
            <div className="relative">
              <Icon name="Search" size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-pf-faint" />
              <input
                id="cp-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Try “jewelry”, “skincare”, “日本語”, “Arabic”…"
                className="h-[52px] w-full rounded-pf-md border border-pf-border-hi bg-pf-card pl-11 pr-4 text-[16px] text-pf-text placeholder:text-pf-faint focus:border-pf-primary-hi focus:outline-none"
              />
            </div>
          </form>
          <div role="group" aria-label="Filter by language" className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[13px] text-pf-faint">Language</span>
            <Chip on={lang === "all"} onClick={() => setLang("all")} label="All" count={free.length} />
            {languages.map((l) => (
              <Chip key={l.code} on={lang === l.code} jp={l.code === "ja"} onClick={() => setLang(l.code)} label={l.label} count={l.count} />
            ))}
          </div>
        </section>
      )}

      {finder && featured.length > 0 && !query && (lang === "all" || lang === "ja") && (
        <section aria-labelledby="jp-h" className="mt-12 rounded-[24px] border border-pf-primary/40 bg-pf-primary/[.06] p-5 sm:p-7">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="grid gap-2">
              <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-pf-danger">Made for Japan · New</p>
              <h2 id="jp-h" className="font-display text-[24px] font-bold tracking-[-0.01em] text-pf-text sm:text-[30px]">
                日本のストア向けテンプレート{" "}
                <span className="text-[16px] font-semibold text-pf-faint sm:text-[20px]">Japanese page sets</span>
              </h2>
              <p className="text-[15px] text-pf-muted">All copy in Japanese, 7 pages each, built around Japanese brands and buying habits.</p>
            </div>
            <Link
              href="/collection-pages/ja"
              className="rounded-pf-md bg-pf-primary px-5 py-3.5 text-[15px] font-bold text-white transition-colors hover:bg-pf-primary-hi"
            >
              すべて見る · See all {jpCount} →
            </Link>
          </div>
          <ul className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
            {featured.map((set) => (
              <li key={set.id}>
                <Link
                  href={`/collection-pages/${set.id}`}
                  className="group flex h-full flex-col overflow-hidden rounded-pf-card border border-pf-border bg-pf-card transition-colors hover:border-pf-primary-hi/50"
                >
                  <span className="relative block aspect-[4/3] overflow-hidden">
                    <PageThumb set={set} page={set.pages[0]} lazy />
                  </span>
                  <span className="flex flex-1 flex-col gap-1.5 border-t border-pf-border p-3.5">
                    <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                      <span className="text-[15px] font-bold text-pf-text">{set.name}</span>
                      <LangBadge lang="ja" />
                    </span>
                    {JP_COPY[set.id] && <span className="text-[13px] text-pf-muted">{JP_COPY[set.id].category}</span>}
                    <span className="text-[12px] text-pf-faint">Free · {pagesLabel(set.pages.length)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {free.length > 0 && (
        <Group
          eyebrow="Free to download"
          title={finder ? "All free page sets" : "Free page sets"}
          sub="Every page is yours to keep. Download a whole set in one file and import it straight into your PageFly editor — no cost, no sign-up."
          sets={finder ? shown : free}
          section="free"
          quiet={preview}
          aside={
            finder && shown.length !== free.length ? (
              <span className="text-[13px] font-medium text-pf-faint">
                Showing {shown.length} of {free.length}
              </span>
            ) : undefined
          }
          empty={
            <p className="col-span-full rounded-pf-card border border-dashed border-pf-border px-5 py-10 text-center text-[14px] text-pf-muted">
              No set matches that.{" "}
              <button type="button" className="font-semibold text-pf-primary-hi hover:underline" onClick={() => (setQuery(""), setLang("all"))}>
                Show every set
              </button>
            </p>
          }
        />
      )}

      {/* Hidden for now: the paid offer is off the list. Flip ORDERS_OPEN (lib/collectionPages) to
          bring the section back — with no premium set yet, it still carries
          the two ways to get a store that is not here. */}
      {ORDERS_OPEN && <Group
        eyebrow="Premium templates"
        title="Premium page sets"
        sub="Fuller stores with more pages and more polish. Preview every page for free — when you buy, we check your order and send the files to your email."
        sets={paid}
        premium
        section="premium"
        extra={<PromoCards />}
      />}
    </>
  );
}

function Group({
  eyebrow,
  title,
  sub,
  sets,
  premium = false,
  extra,
  section,
  aside,
  quiet = false,
  empty,
}: {
  eyebrow: string;
  title: string;
  sub: string;
  sets: PublicCollectionSet[];
  premium?: boolean;
  /** cards after the sets, in the same grid */
  extra?: React.ReactNode;
  /** reported once when the row scrolls into view */
  section: "free" | "premium";
  /** beside the heading, in place of the count */
  aside?: React.ReactNode;
  /** not reported when seen */
  quiet?: boolean;
  /** in the grid when `sets` is empty */
  empty?: React.ReactNode;
}) {
  const seen = useSeenOnce<HTMLElement>(() => {
    if (!quiet) track(EV.cpSectionSeen, { section });
  });
  return (
    <section ref={seen} className="mt-14 border-t border-pf-border pt-10 first-of-type:mt-12">
      <div
        className={`flex flex-wrap justify-between gap-x-8 gap-y-5 ${aside ? "items-center" : "items-end"}`}
      >
        <div className="max-w-[680px]">
          <p
            className={`flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] ${
              premium ? "text-pf-warn" : "text-pf-primary-hi"
            }`}
          >
            <Icon name={premium ? "Star" : "Download"} size={13} />
            {eyebrow}
          </p>
          <h2 className="mt-2 font-display text-[24px] font-bold tracking-[-0.015em] text-pf-text sm:text-[28px]">
            {title}
          </h2>
          <p className="mt-2 text-[14.5px] leading-relaxed text-pf-muted">{sub}</p>
        </div>
        {aside ??
          (sets.length > 0 && (
            <span className="text-[13px] font-medium text-pf-faint">
              {sets.length} {sets.length === 1 ? "set" : "sets"}
            </span>
          ))}
      </div>

      <ul className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {sets.length === 0 && empty}
        {sets.map((set) => (
          <li key={set.id} className="relative">
            <Link
              href={`/collection-pages/${set.id}`}
              className={`group flex h-full flex-col overflow-hidden rounded-pf-card border bg-pf-card shadow-pf-card transition-colors ${
                premium
                  ? "border-pf-warn/25 hover:border-pf-warn/60"
                  : "border-pf-border hover:border-pf-primary-hi/50"
              }`}
            >
              <span className="relative block aspect-[4/3] overflow-hidden">
                <PageThumb set={set} page={set.pages[0]} />
                <span className="pointer-events-none absolute inset-0 flex items-end justify-center gap-1.5 bg-gradient-to-t from-pf-bg/85 to-transparent pb-3 text-[12px] font-semibold text-pf-text opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  <Icon name="LayoutGrid" size={13} />
                  {set.pages.length === 1 ? "See the page" : `See all ${set.pages.length} pages`}
                </span>
              </span>
              <span className="flex flex-1 flex-col border-t border-pf-border px-4 py-4">
                <span className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-display text-[18px] font-semibold tracking-[-0.011em] text-pf-text">
                      {set.name}
                    </span>
                    {set.lang && <LangBadge lang={set.lang} />}
                  </span>
                  <span className="shrink-0 text-[12px] font-medium text-pf-faint">
                    {premium ? (
                      <span className="font-semibold text-pf-warn">{set.price ?? "Paid"}</span>
                    ) : (
                      "Free"
                    )}
                    {" · "}
                    {pagesLabel(set.pages.length)}
                  </span>
                </span>
                <SetCount set={set} />
                {set.blurb && (
                  <span className="mt-1.5 block text-[13px] leading-snug text-pf-faint">
                    {set.blurb}
                  </span>
                )}
                <span className="mt-4 flex flex-wrap gap-1.5">
                  {set.pages.map((page) => (
                    <span
                      key={page.slug}
                      className="rounded-pf-pill border border-pf-border px-2.5 py-1 text-[11.5px] font-medium text-pf-muted"
                    >
                      {page.label}
                    </span>
                  ))}
                </span>
              </span>
            </Link>
            {/* Over the card's picture, and a sibling of the card's link rather
                than inside it: a link inside a link is invalid, and a press on
                it would also navigate. */}
            <div className="absolute right-3 top-3 z-10">
              <SetAction set={set} place="card" />
            </div>
          </li>
        ))}
        {extra}
      </ul>
    </section>
  );
}

/* ==========================================================================
   HOW MANY PEOPLE HAVE TAKEN IT — real numbers, see `collectionStats`.

   A set nobody has taken yet says "New" rather than "0 downloads": a zero on
   a card reads as "nobody wants this", when all it means is "just arrived".
   ========================================================================== */
export function SetCount({ set }: { set: PublicCollectionSet }) {
  const label = countLabel(set);
  const paid = set.access === "paid";
  return (
    <span
      className={`mt-1 flex items-center gap-1.5 text-[12.5px] font-medium ${
        label ? "text-pf-body" : paid ? "text-pf-warn" : "text-pf-primary-hi"
      }`}
    >
      <Icon name={label ? (paid ? "ShoppingBag" : "Download") : "Sparkles"} size={13} />
      {label ?? (paid ? "New release" : "New")}
    </span>
  );
}


/* What a search reads of a set: its name, its blurb, its language in both
   spellings ("日本語", "Japanese") and, for a Japanese set, its Japanese
   category and description. */
function haystack(set: PublicCollectionSet): string {
  const l = langInfo(set.lang ?? "en");
  const jp = JP_COPY[set.id];
  const industry = jp ? JP_INDUSTRIES.find((i) => i.id === jp.industry)?.label : "";
  return [set.name, set.id, set.blurb, l.label, l.badge, jp?.category, jp?.desc, industry].join(" ").toLowerCase();
}

function Chip({ on, jp = false, onClick, label, count }: { on: boolean; jp?: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`min-h-[40px] rounded-pf-pill border px-4 text-[14px] font-semibold transition-colors ${
        on
          ? "border-pf-text bg-pf-text text-pf-bg"
          : jp
            ? "border-pf-primary bg-pf-primary/15 text-pf-text hover:border-pf-primary-hi"
            : "border-pf-border bg-pf-card text-pf-body hover:border-pf-border-hi"
      }`}
    >
      {label} <span className="font-medium opacity-70">{count}</span>
    </button>
  );
}

/** "JP 日本語", "EN" — the language a set is written in, on its card. */
export function LangBadge({ lang }: { lang: LangCode }) {
  const badge = langInfo(lang).badge;
  if (!badge) return null;
  return (
    <span
      className={`shrink-0 whitespace-nowrap rounded-pf-pill px-2 py-0.5 text-[10.5px] font-bold ${
        lang === "ja" ? "bg-pf-primary/20 text-pf-primary-hi" : "bg-pf-border text-pf-muted"
      }`}
    >
      {badge}
    </span>
  );
}
