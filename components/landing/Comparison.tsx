"use client";

import Image from "next/image";
import { SectionHead } from "./SectionHead";
import { useSeen } from "./useSeen";

/* ==========================================================================
   THE QUESTION THE PAGE WAS NOT ANSWERING: why not a template?

   Every visitor is already choosing between three things — a theme template
   they own, an AI site builder they have seen an advert for, and this. The
   page argued only for the third and left the comparison to be made
   somewhere else, which is where it gets lost.

   FOUR ROWS, AND THE OTHER TWO COLUMNS ARE WRITTEN STRAIGHT. A table where
   every row flatters one side is an advertisement and reads as one; the
   honest sentences about a template — you own it, it is cheap — are the
   reason the rows about copy and about where it ends up land at all.

   OUR COLUMN IS TINTED RATHER THAN BADGED. A "best" label on your own column
   is an argument nobody believes; a wash of the brand colour says which column
   is ours and lets the four sentences in it do the arguing.
   ========================================================================== */
const COLUMNS = ["A theme template", "An AI website builder", "PageFly Design"] as const;

const ROWS: { label: string; cells: [string, string, string] }[] = [
  {
    label: "You start from",
    cells: [
      "Someone else's layout",
      "A blank prompt",
      "A short brief about your store and your market",
    ],
  },
  {
    label: "Copy and content",
    cells: [
      "Placeholder text to replace",
      "Generic filler",
      "Written for your products, market and price point",
    ],
  },
  {
    label: "How many pages",
    cells: [
      "One at a time, each from scratch",
      "A whole site — on their platform",
      "A matching set: home, product, collection, landing and more",
    ],
  },
  {
    label: "Where it ends up",
    cells: [
      "Hours of editing in your theme",
      "Hosted with them, not in your store",
      "In your PageFly editor, on your store, fully editable",
    ],
  },
];

/* The wash behind our column. A token would be wrong: this is not a surface
   any other component has, it is one column of one table saying "this one is
   us", and inventing `--color-pf-tint` for a single use puts a decision in the
   palette that belongs in this file. */
const OURS = "bg-[rgba(107,47,247,0.16)]";

export function Comparison() {
  const ref = useSeen<HTMLElement>("comparison");

  return (
    <section
      ref={ref}
      className="border-t border-pf-border px-5 py-20 sm:px-8 sm:py-24 lg:px-[120px]"
    >
      <div className="mx-auto flex max-w-[1200px] flex-col items-center">
        <SectionHead eyebrow="Why not a template?" title="Three ways to get store pages" />

        {/* A TABLE, BECAUSE IT IS ONE: four questions asked of three options.
            Its own scroller so a narrow screen scrolls the comparison rather
            than the page — the same rule the exporter applies to wide tables.
            `border-separate` with a zero gap, or the rounded corners of the
            frame are painted over by the square corners of the first and last
            cells. */}
        <div className="mt-10 w-full overflow-x-auto rounded-pf-lg border border-pf-border">
          <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left">
            <thead>
              <tr>
                <th className="w-[190px] border-b border-pf-border px-6 py-[18px]" />
                {COLUMNS.map((c, i) => (
                  <th
                    key={c}
                    className={
                      "border-b border-pf-border px-6 py-[18px] text-[15px] " +
                      (i === 2
                        ? `font-bold text-pf-text ${OURS}`
                        : "font-semibold text-pf-body/85")
                    }
                  >
                    {i === 2 ? (
                      <span className="flex items-center gap-2">
                        <Image
                          src="/pagefly-icon.png"
                          alt=""
                          width={18}
                          height={18}
                          className="size-[18px] rounded-[5px]"
                        />
                        {c}
                      </span>
                    ) : (
                      c
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, r) => {
                /* The last row keeps no bottom rule: the frame is already
                   there, and two lines a pixel apart read as a mistake. */
                const rule = r === ROWS.length - 1 ? "" : "border-b border-pf-border";
                return (
                  <tr key={row.label} className="align-top">
                    <th
                      scope="row"
                      className={`px-6 py-5 text-[14px] font-semibold text-pf-body/[.72] ${rule}`}
                    >
                      {row.label}
                    </th>
                    {row.cells.map((cell, i) => (
                      <td
                        key={cell}
                        className={
                          `px-6 py-5 text-[14.5px] leading-[1.5] ${rule} ` +
                          (i === 2 ? `text-pf-text ${OURS}` : "text-pf-muted")
                        }
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
