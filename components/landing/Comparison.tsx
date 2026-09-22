"use client";

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
   ========================================================================== */
const COLUMNS = ["A theme template", "An AI website builder", "PageFly Design"] as const;

const ROWS: { label: string; cells: [string, string, string] }[] = [
  {
    label: "You start from",
    cells: ["Someone else's layout", "A blank prompt", "A short brief about your store and your market"],
  },
  {
    label: "Copy and content",
    cells: ["Placeholder text to replace", "Generic filler", "Written for your products, market and price point"],
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

export function Comparison() {
  const ref = useSeen<HTMLElement>("comparison");

  return (
    <section ref={ref} className="relative mx-auto max-w-6xl px-5 py-20 sm:py-24">
      <p className="text-center text-[12.5px] font-semibold uppercase tracking-[0.18em] text-pf-faint">
        Why not a template?
      </p>
      <h2 className="mt-3 text-center font-display text-pf-h2 font-semibold text-pf-text">
        Three ways to get store pages
      </h2>

      {/* A table, because it is one: four questions asked of three options.
          Its own scroller so a narrow screen scrolls the comparison instead of
          the page — see the note on tables in the exporter for the same rule. */}
      <div className="mt-12 overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead>
            <tr>
              <th className="w-[150px] pb-4" />
              {COLUMNS.map((c, i) => (
                <th
                  key={c}
                  className={
                    "px-5 pb-4 font-display text-[15px] font-semibold tracking-[-0.01em] " +
                    /* The third column is ours and says so by weight, not by a
                       badge: a "best" label on your own column is an argument
                       nobody believes. */
                    (i === 2 ? "text-pf-text" : "text-pf-faint")
                  }
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.label} className="border-t border-pf-border align-top">
                <th scope="row" className="py-5 pr-4 text-[12.5px] font-semibold uppercase tracking-[0.12em] text-pf-faint">
                  {row.label}
                </th>
                {row.cells.map((cell, i) => (
                  <td
                    key={cell}
                    className={
                      "px-5 py-5 text-[13.5px] leading-relaxed " +
                      (i === 2 ? "text-pf-text" : "text-pf-muted")
                    }
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
