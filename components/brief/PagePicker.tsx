"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import {
  MAX_PER_PAGE,
  MAX_TOTAL_PAGES,
  VISIBLE_PAGE_CATEGORIES,
  totalSelected,
  type CategoryDef,
  type PageDef,
} from "@/lib/pageCatalog";
import { useStore } from "@/lib/store";
import { Icon, SectionCard } from "../ui";
import { Stepper } from "../ui";

const CAP_MESSAGE = `You've reached ${MAX_TOTAL_PAGES} pages. Remove one to add another.`;

/* ---- one page row ------------------------------------------------------- */

function PageRow({ page, atCap }: { page: PageDef; atCap: boolean }) {
  const count = useStore((s) => s.draft.pages[page.id] ?? 0);
  const togglePage = useStore((s) => s.togglePage);
  const setPageCount = useStore((s) => s.setPageCount);

  const on = count > 0;
  const blocked = !on && atCap;

  /* One line per row, not two. With 45 page types on screen the description
     line doubled the height of the densest section for information most
     merchants can read off the label — it lives in the tooltip instead. */
  return (
    <div
      className={`flex items-center gap-2.5 rounded-pf-md border px-2.5 py-2 transition-colors duration-150 ${
        on
          ? "border-pf-primary-hi/55 bg-pf-primary/10"
          : blocked
            ? "border-pf-border bg-transparent opacity-45"
            : "border-pf-border bg-pf-card/60 hover:border-pf-border-hi"
      }`}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={on}
        disabled={blocked}
        onClick={() => togglePage(page.id)}
        title={blocked ? CAP_MESSAGE : page.blurb}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left disabled:cursor-not-allowed"
      >
        <span
          className={`grid size-7 shrink-0 place-items-center rounded-pf-sm border transition-colors ${
            on
              ? "border-pf-primary-hi bg-pf-primary text-white"
              : "border-pf-border text-pf-muted"
          }`}
        >
          <Icon name={on ? "Check" : page.icon} size={14} />
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-pf-text">
          {page.label}
        </span>
      </button>

      {page.repeatable && (
        <Stepper
          value={count}
          max={MAX_PER_PAGE}
          atCap={atCap}
          capMessage={CAP_MESSAGE}
          label={page.label}
          onChange={(v) => setPageCount(page.id, v)}
        />
      )}
    </div>
  );
}

/* ---- one collapsible group --------------------------------------------- */

function Group({ cat, atCap }: { cat: CategoryDef; atCap: boolean }) {
  const [open, setOpen] = useState(cat.defaultOpen);
  const selection = useStore((s) => s.draft.pages);
  const selectAllInGroup = useStore((s) => s.selectAllInGroup);

  const ids = cat.pages.map((p) => p.id);
  const chosen = ids.filter((id) => (selection[id] ?? 0) > 0);
  const allOn = chosen.length === ids.length;
  const countInGroup = ids.reduce((n, id) => n + (selection[id] ?? 0), 0);

  return (
    <div className="overflow-hidden rounded-pf-lg border border-pf-border">
      <div className="flex items-center gap-3 bg-pf-card/70 px-3.5 py-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          <motion.span
            animate={{ rotate: open ? 0 : -90 }}
            transition={{ duration: 0.16 }}
            className="text-pf-muted"
          >
            <Icon name="ChevronDown" size={16} />
          </motion.span>
          <span className="flex min-w-0 items-center gap-2" title={cat.blurb}>
            <span className="truncate text-[13.5px] font-semibold text-pf-text">
              {cat.label}
            </span>
            <span className="shrink-0 text-[11.5px] text-pf-faint">
              {cat.pages.length}
            </span>
            {countInGroup > 0 && (
              <span className="rounded-pf-pill bg-pf-primary/22 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-pf-primary-hi">
                {countInGroup}
              </span>
            )}
          </span>
        </button>

        <button
          type="button"
          onClick={() => selectAllInGroup(ids, !allOn)}
          className="shrink-0 text-[12px] font-semibold text-pf-primary-hi transition-opacity hover:opacity-75"
        >
          {allOn ? "Clear all" : "Select all"}
        </button>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="grid gap-2 p-2.5 sm:grid-cols-2">
              {cat.pages.map((p) => (
                <PageRow key={p.id} page={p} atCap={atCap} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---- the section -------------------------------------------------------- */

export function PagePicker() {
  const selection = useStore((s) => s.draft.pages);
  const total = totalSelected(selection);
  const atCap = total >= MAX_TOTAL_PAGES;

  return (
    <SectionCard
      id="pfd-pages"
      eyebrow="Step 7"
      title="Which pages?"
      help={`Repeatable pages have a stepper. ${MAX_TOTAL_PAGES} max.`}
      aside={
        <span
          className={`text-[12px] font-semibold tabular-nums ${
            atCap ? "text-pf-warn" : "text-pf-faint"
          }`}
        >
          {total}/{MAX_TOTAL_PAGES} pages
        </span>
      }
    >
      <div className="grid gap-2.5">
        {VISIBLE_PAGE_CATEGORIES.map((cat) => (
          <Group key={cat.id} cat={cat} atCap={atCap} />
        ))}

        <AnimatePresence>
          {atCap && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              role="status"
              className="flex items-center gap-2 rounded-pf-md border border-pf-warn/35 bg-pf-warn/10 px-3.5 py-2.5 text-[13px] text-pf-warn"
            >
              <Icon name="Info" size={15} />
              {CAP_MESSAGE}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </SectionCard>
  );
}
