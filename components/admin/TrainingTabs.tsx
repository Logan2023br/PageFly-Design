"use client";

import { useState } from "react";
import type { TrainingSectionSummary, TrainingSummary } from "@/lib/db/types";
import { TrainingDesign } from "./TrainingDesign";
import { TrainingSections } from "./TrainingSections";

/* ==========================================================================
   Two collections, one screen.

   TEMPLATE is a whole page filed by industry: this is what a good footwear
   store looks like. SECTION is one element filed by element name: this is what
   a good ProductBox looks like. They answer different questions at different
   moments of a build — the first sets the shape of a page, the second the
   inside of one band — so they are separate collections rather than one with a
   flag on it.

   A wrapper rather than a rewrite. `TrainingDesign` is unchanged: it was
   working, and the fastest way to break something that works is to move it
   while adding something else. Both children own their own state and their own
   endpoint; this file only decides which one is on screen.
   ========================================================================== */

type Tab = "template" | "section";

export function TrainingTabs({
  templates,
  sections,
}: {
  templates: TrainingSummary[];
  sections: TrainingSectionSummary[];
}) {
  const [tab, setTab] = useState<Tab>("template");

  return (
    <div className="grid gap-4">
      <div
        role="tablist"
        aria-label="Training collections"
        className="flex w-fit items-center gap-1 rounded-xl border border-pf-border bg-pf-surface/60 p-1"
      >
        <TabButton
          active={tab === "template"}
          onClick={() => setTab("template")}
          count={templates.length}
        >
          Training Template
        </TabButton>
        <TabButton
          active={tab === "section"}
          onClick={() => setTab("section")}
          count={sections.length}
        >
          Training Section
        </TabButton>
      </div>

      {/* Both stay mounted. A tab that unmounts loses an upload in progress and
          re-fetches a list that had not changed, and the cost of keeping them is
          one hidden div — the images are lazy either way. */}
      <div hidden={tab !== "template"}>
        <TrainingDesign initial={templates} />
      </div>
      <div hidden={tab !== "section"}>
        <TrainingSections initial={sections} />
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={[
        "rounded-lg px-3.5 py-2 text-[12.5px] font-semibold transition-colors duration-150",
        active
          ? "bg-pf-accent text-white"
          : "text-pf-muted hover:bg-pf-surface hover:text-pf-text",
      ].join(" ")}
    >
      {children}
      {count > 0 && (
        <span className={active ? "ml-1.5 opacity-70" : "ml-1.5 text-pf-faint"}>
          {count}
        </span>
      )}
    </button>
  );
}
