"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Icon } from "../ui";

/* ==========================================================================
   Bốn bước, chỉ ra chứ không kể lại.

   The pictures are SCREENSHOTS of the running app, from `public/how-it-works/`.
   They replaced four drawn placeholders, and the reason is the one the
   placeholders were written to admit: a drawing of a UI is wrong the first time
   that UI changes and nobody notices for months. A screenshot is at least wrong
   visibly, and the person who changed the screen is the person looking at it.

   Written in Vietnamese, because these four steps are not a pitch — they are
   the instructions a beta merchant follows, and they were dictated in
   Vietnamese by the person handing the product to them. The section heading
   follows the steps rather than the rest of the page: a Vietnamese instruction
   under an English title reads as a page half-translated.
   ========================================================================== */

type Step = {
  n: string;
  title: string;
  /** what to do at this step — the tooltip, and the lightbox caption */
  tip: string;
  /** under `public/`, so `next/image` optimises and serves it as webp */
  src: string;
  /** the file's real size, for the lightbox to show it uncropped */
  width: number;
  height: number;
};

const STEPS: Step[] = [
  {
    n: "01",
    title: "Tạo page",
    src: "/how-it-works/01-create-page.png",
    width: 1600,
    height: 752,
    tip: "Chọn các option trong Build Quickly hoặc Build Detail, sau đó bấm tạo page. (Lưu ý: phần viết thông tin page vui lòng điền đầy đủ như hướng dẫn để có page đẹp nhất.)",
  },
  {
    n: "02",
    title: "Xem Page đã tạo",
    src: "/how-it-works/02-view-pages.png",
    width: 1600,
    height: 783,
    tip: "Xem các page đã build trong phần Library, hover vào để xem toàn giao diện của từng page và responsive từng kích thước màn hình. Dữ liệu vẫn sẽ được lưu khi bạn đăng nhập vào những lần sau.",
  },
  {
    n: "03",
    title: "Export Page",
    src: "/how-it-works/03-export-page.png",
    width: 1600,
    height: 840,
    tip: "Hover vào góc trái của từng page để export, dữ liệu export ra sẽ tạo 1 file .pagefly. Có thể export nhiều page.",
  },
  {
    n: "04",
    title: "Import and live page",
    src: "/how-it-works/04-import-page.png",
    width: 1600,
    height: 883,
    tip: "Import và add file .pagefly vào PageFly App để có thể xem page. Giao diện sau khi import sẽ giống giao diện trên Library của PageFly Design.",
  },
];

export function HowItWorks() {
  const [zoom, setZoom] = useState<Step | null>(null);

  /* Escape closes it. A lightbox that traps someone until they find the small
     button is the thing people remember about a landing page. */
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoom(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom]);

  return (
    <section className="mx-auto max-w-6xl px-5 py-14 sm:py-20">
      <div className="mx-auto mb-10 max-w-2xl text-center">
        <h2 className="font-display text-pf-h2 font-semibold text-pf-text">
          Bốn bước để có page
        </h2>
        <p className="mt-3 text-pf-body text-pf-muted">
          Hover vào từng bước để xem hướng dẫn. Click để mở ảnh full size.
        </p>
      </div>

      {/* Two across, not four. These hold screenshots of a UI, and a quarter of
          a 1,150px row is 270px — a whole brief screen shrunk past the point
          where anyone can tell what they are looking at. Two rows of two gives
          each one about 560px, which is a readable picture of a screen. */}
      <ol className="grid gap-5 sm:grid-cols-2">
        {STEPS.map((step, i) => (
          <li key={step.n} className="group relative">
            <button
              type="button"
              onClick={() => setZoom(step)}
              className="block w-full overflow-hidden rounded-pf-card border border-pf-border bg-pf-bg-deep text-left transition-colors hover:border-pf-border-hi focus:border-pf-primary-hi focus:outline-none"
            >
              {/* 2:1 — a band rather than a box. These sit two to a row at about
                  560px, so 16:10 made each one 350px tall and the four of them a
                  full screen of scrolling before the counts. Every screenshot is
                  between 1.8:1 and 2.13:1, so `object-top` trims a sliver off
                  the bottom and never the part that identifies the screen. */}
              <span className="relative block aspect-[2/1] overflow-hidden bg-pf-bg">
                <Image
                  src={step.src}
                  alt={step.title}
                  fill
                  /* Two columns above 640px, one below — so the browser never
                     fetches a 1,600px copy to paint a 560px card. */
                  sizes="(max-width: 640px) 100vw, 560px"
                  className="object-cover object-top"
                  /* The first two are above the fold on a laptop; the last two
                     are not, and eagerly loading 2.5MB of screenshots to paint
                     a hero nobody has scrolled past yet is the whole reason
                     `loading` exists. */
                  priority={i < 2}
                />
              </span>
              <span className="flex items-baseline gap-2 px-3.5 py-3">
                <span className="text-[11px] font-semibold tabular-nums text-pf-faint">
                  {step.n}
                </span>
                <span className="text-[13.5px] font-semibold text-pf-text">
                  {step.title}
                </span>
              </span>
            </button>

            {/* ABOVE the card, pointing down at it. Inside the card it covered
                the picture it was describing, which is the one thing a tooltip
                on an image must not do.

                Shown on hover AND on keyboard focus: a tooltip only a mouse can
                reach is a tooltip half the visitors never see. */}
            <span
              role="tooltip"
              className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2.5 w-[min(24rem,92%)] -translate-x-1/2 rounded-pf-md border border-pf-border bg-pf-bg-deep p-3 text-center text-[12.5px] leading-snug text-pf-body opacity-0 shadow-pf-float transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
            >
              {step.tip}
              {/* Two triangles, one a pixel below the other: the back one is
                  the border colour and the front one the panel, which is how a
                  CSS arrow keeps a 1px outline on its two visible sides. */}
              <span className="absolute left-1/2 top-full -ml-[7px] border-x-[7px] border-t-[7px] border-x-transparent border-t-pf-border" />
              <span className="absolute left-1/2 top-full -ml-[6px] -mt-px border-x-[6px] border-t-[6px] border-x-transparent border-t-pf-bg-deep" />
            </span>
          </li>
        ))}
      </ol>

      {zoom && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={zoom.title}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(6,4,14,.88)] p-4 backdrop-blur-sm"
          onClick={() => setZoom(null)}
        >
          <div
            className="relative max-h-full w-full max-w-6xl overflow-auto rounded-pf-card border border-pf-border bg-pf-bg-deep"
            /* The backdrop closes; the picture does not. Without this a click
               anywhere on the thing someone just opened closes it again. */
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setZoom(null)}
              aria-label="Đóng"
              className="absolute right-3 top-3 z-10 rounded-pf-sm border border-pf-border bg-pf-bg-deep p-1.5 text-pf-muted hover:text-pf-text"
            >
              <Icon name="X" size={16} />
            </button>
            {/* The image's OWN shape here, not the card's 2:1. Someone who
                clicked to see it full size has asked for the part the card
                cropped, and a lightbox that crops it too has answered nothing. */}
            <Image
              src={zoom.src}
              alt={zoom.title}
              width={zoom.width}
              height={zoom.height}
              sizes="(max-width: 1200px) 100vw, 1152px"
              className="h-auto w-full"
            />
            <p className="border-t border-pf-border px-4 py-3 text-[13px] text-pf-muted">
              <span className="font-semibold text-pf-text">{zoom.title}</span>{" "}
              — {zoom.tip}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
