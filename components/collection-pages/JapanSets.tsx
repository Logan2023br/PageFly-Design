"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { JP_COPY, JP_INDUSTRIES, type JpIndustry } from "@/lib/collectionMarkets";
import type { PublicCollectionSet } from "@/lib/collectionPages";
import { PageThumb } from "../landing/PagePreview";
import { SetAction } from "./SetAction";

/* ==========================================================================
   /collection-pages/ja — the Japanese sets, in Japanese.

   Every visible set whose pages are written in Japanese (lib/collectionLanguage),
   the new ones first, with an industry filter. The words about each set come
   from JP_COPY (lib/collectionMarkets); a set not described there still shows,
   under その他, with its own blurb.
   ========================================================================== */

export function JapanSets({ sets }: { sets: PublicCollectionSet[] }) {
  const [industry, setIndustry] = useState<JpIndustry | "all">("all");
  const ordered = useMemo(
    () => [...sets].sort((a, b) => Number(!!JP_COPY[b.id]?.isNew) - Number(!!JP_COPY[a.id]?.isNew)),
    [sets],
  );
  const industryOf = (s: PublicCollectionSet): JpIndustry => JP_COPY[s.id]?.industry ?? "other";
  const chips = JP_INDUSTRIES.map((i) => ({ ...i, count: sets.filter((s) => industryOf(s) === i.id).length })).filter((i) => i.count > 0);
  const shown = industry === "all" ? ordered : ordered.filter((s) => industryOf(s) === industry);

  return (
    <>
      <section aria-labelledby="ja-h1" className="grid max-w-[820px] gap-4">
        <p className="font-display text-[12px] font-bold uppercase tracking-[0.14em] text-pf-danger">Made for Japan · 無料 · 登録不要</p>
        <h1 id="ja-h1" className="text-[32px] font-extrabold leading-[1.3] text-pf-text sm:text-[44px]">
          日本のストアのための、無料ページセット {sets.length}種
        </h1>
        <p className="text-[16px] leading-[1.8] text-pf-muted sm:text-[17px]">
          すべて日本語・1セット7ページ（ホーム、商品、コレクション、ブランド紹介、お問い合わせ、ブログ、セール）。1ファイルでダウンロードして、PageFly
          にそのままインポートできます。
        </p>
        <div className="mt-1 flex flex-wrap gap-2.5">
          <a href="#sets" className="rounded-pf-md bg-pf-primary px-5 py-3.5 text-[15px] font-bold text-white transition-colors hover:bg-pf-primary-hi">
            セットを見る
          </a>
          <a
            href="https://pagefly.io"
            target="_blank"
            rel="noreferrer"
            className="rounded-pf-md border border-pf-border-hi px-5 py-3.5 text-[15px] font-semibold text-pf-text transition-colors hover:border-pf-primary-hi"
          >
            インポート方法
          </a>
        </div>
      </section>

      {chips.length > 1 && (
        <div role="group" aria-label="業種で絞り込む" className="mt-10 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[13px] text-pf-faint">業種</span>
          <Chip on={industry === "all"} onClick={() => setIndustry("all")} label={`すべて (${sets.length})`} />
          {chips.map((c) => (
            <Chip key={c.id} on={industry === c.id} onClick={() => setIndustry(c.id)} label={c.count > 1 ? `${c.label} (${c.count})` : c.label} />
          ))}
        </div>
      )}

      <ul id="sets" aria-label="日本向けページセット" className="mt-6 grid scroll-mt-24 grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((set) => {
          const jp = JP_COPY[set.id];
          return (
            <li key={set.id}>
              <article className="flex h-full flex-col overflow-hidden rounded-pf-card border border-pf-border bg-pf-card">
                <Link href={`/collection-pages/${set.id}`} className="relative block aspect-[4/3] overflow-hidden" aria-label={`${set.name} の7ページを見る`}>
                  <PageThumb set={set} page={set.pages[0]} lazy />
                </Link>
                <div className="flex flex-1 flex-col gap-2.5 border-t border-pf-border p-[18px]">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="truncate text-[18px] font-bold text-pf-text">{set.name}</h2>
                    <span
                      className={`shrink-0 rounded-pf-pill px-2 py-0.5 text-[11px] font-bold ${
                        jp?.isNew ? "bg-pf-danger text-white" : "bg-pf-border text-pf-muted"
                      }`}
                    >
                      {jp?.isNew ? "NEW" : "人気"}
                    </span>
                  </div>
                  {jp && <p className="text-[14px] font-semibold text-pf-body">{jp.category}</p>}
                  <p className="text-[13px] leading-[1.7] text-pf-muted">{jp?.desc ?? set.blurb}</p>
                  <div className="mt-auto flex flex-wrap gap-2 pt-1.5">
                    <Link
                      href={`/collection-pages/${set.id}`}
                      className="flex-1 rounded-[10px] bg-pf-primary px-3.5 py-3 text-center text-[14px] font-bold text-white transition-colors hover:bg-pf-primary-hi"
                    >
                      {set.pages.length}ページを見る
                    </Link>
                    <SetAction
                      set={set}
                      place="card"
                      label="無料ダウンロード"
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-pf-border-hi !bg-transparent px-3.5 py-3 text-[14px] !shadow-none hover:border-pf-primary-hi"
                    />
                  </div>
                </div>
              </article>
            </li>
          );
        })}
      </ul>

      <section className="mt-14 flex flex-wrap items-center justify-between gap-4 rounded-[20px] border border-pf-border bg-pf-card p-6 sm:p-7">
        <div className="grid flex-[1_1_420px] gap-1.5">
          <h2 className="text-[20px] font-extrabold text-pf-text sm:text-[22px]">お探しの業種がありませんか？</h2>
          <p className="text-[15px] leading-[1.7] text-pf-muted">
            日本のお客様の声をもとに、新しいセットを追加しています。作ってほしい業種を教えてください。
          </p>
        </div>
        <a
          href="mailto:japan@pagefly.io?subject=%E3%83%9A%E3%83%BC%E3%82%B8%E3%82%BB%E3%83%83%E3%83%88%E3%81%AE%E3%83%AA%E3%82%AF%E3%82%A8%E3%82%B9%E3%83%88"
          className="rounded-pf-md bg-pf-text px-5 py-3.5 text-[15px] font-bold text-pf-bg transition-opacity hover:opacity-90"
        >
          リクエストする
        </a>
      </section>
    </>
  );
}

function Chip({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`min-h-[40px] rounded-pf-pill border px-4 text-[14px] font-semibold transition-colors ${
        on ? "border-pf-text bg-pf-text text-pf-bg" : "border-pf-border bg-pf-card text-pf-body hover:border-pf-border-hi"
      }`}
    >
      {label}
    </button>
  );
}
