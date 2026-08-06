"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useStore, type Screen } from "@/lib/store";
import { useAccount } from "./AccountProvider";
import { StoreMenu } from "./StoreMenu";
import { Icon } from "./ui";

const STEPS: { id: Screen; label: string }[] = [
  { id: "brief", label: "Brief" },
  { id: "generating", label: "Generate" },
  { id: "results", label: "Results" },
];

/** Design | Library, in the top bar where the brief asked for it. Rendered as a
    segmented control so the current area is obvious without a page title. */
export function WorkspaceNav({ current }: { current: "design" | "library" }) {
  const items = [
    { id: "design", label: "Design", href: "/design", icon: "Wand" },
    { id: "library", label: "Library", href: "/design/library", icon: "Library" },
  ] as const;

  return (
    <nav
      aria-label="Workspace"
      className="flex items-center gap-0.5 rounded-pf-pill border border-pf-border bg-pf-bg-deep/60 p-0.5"
    >
      {items.map((item) => {
        const active = item.id === current;
        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`relative flex items-center gap-1.5 rounded-pf-pill px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
              active ? "text-pf-text" : "text-pf-muted hover:text-pf-text"
            }`}
          >
            {active && (
              <motion.span
                layoutId="pfd-workspace-pill"
                className="absolute inset-0 rounded-pf-pill border border-pf-primary-hi/45 bg-pf-primary/16"
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5">
              <Icon name={item.icon} size={13} />
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Pages used against the store's allowance. Re-read on every load and after
    every build, so it reflects the server rather than a local tally. */
export function PageQuota() {
  const { account, loading } = useAccount();
  // Server-seeded, so there is no empty first frame to cover with a skeleton.
  if (!account) return null;

  const { pagesUsed, pageLimit } = account;
  const ratio = pageLimit > 0 ? pagesUsed / pageLimit : 0;
  const spent = pagesUsed >= pageLimit;
  const nearly = !spent && ratio >= 0.8;

  return (
    <span
      title={`${pagesUsed} of ${pageLimit} pages used${spent ? " — limit reached" : ""}`}
      className={`inline-flex items-center gap-1.5 rounded-pf-pill border px-2.5 py-1 text-[11.5px] font-semibold tabular-nums transition-opacity ${
        loading ? "opacity-60" : ""
      } ${
        spent
          ? "border-pf-danger/40 bg-pf-danger/10 text-pf-danger"
          : nearly
            ? "border-pf-warn/40 bg-pf-warn/10 text-pf-warn"
            : "border-pf-border text-pf-muted"
      }`}
    >
      <Icon name={spent ? "CircleAlert" : "Files"} size={12} />
      {pagesUsed}/{pageLimit} pages
    </span>
  );
}

export function ProgressSteps() {
  const screen = useStore((s) => s.screen);
  const editBrief = useStore((s) => s.editBrief);
  const current = STEPS.findIndex((s) => s.id === screen);

  return (
    <nav
      aria-label="Progress"
      className="flex items-center justify-between gap-4 border-b border-pf-border pb-3.5"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="grid size-7 shrink-0 place-items-center rounded-pf-sm bg-pf-primary text-white">
          <Icon name="Layers" size={15} />
        </span>
        <span className="hidden font-display text-[15px] font-semibold tracking-[-0.02em] text-pf-text sm:inline">
          PageFly <span className="text-pf-muted">Design</span>
        </span>
        <PageQuota />
      </div>

      <WorkspaceNav current="design" />

      {/* Steps give way to the store identity before they crowd it: which store
          this is matters on every screen, whereas the step indicator only says
          something the screen already shows. */}
      <ol className="hidden items-center gap-1 xl:flex sm:gap-2">
        {STEPS.map((step, i) => {
          const done = i < current;
          const active = i === current;
          // Going back to the brief is allowed and keeps every answer.
          const clickable = step.id === "brief" && current === 2;

          return (
            <li key={step.id} className="flex items-center gap-1 sm:gap-2">
              {i > 0 && (
                <span
                  aria-hidden
                  className={`h-px w-4 sm:w-7 ${done || active ? "bg-pf-primary-hi/50" : "bg-pf-border"}`}
                />
              )}
              <button
                type="button"
                disabled={!clickable}
                onClick={clickable ? editBrief : undefined}
                aria-current={active ? "step" : undefined}
                className={`relative flex items-center gap-1.5 rounded-pf-pill px-2.5 py-1.5 text-[12px] font-semibold transition-colors ${
                  active
                    ? "text-pf-text"
                    : done
                      ? "text-pf-muted"
                      : "text-pf-faint"
                } ${clickable ? "hover:text-pf-text" : "cursor-default"}`}
              >
                {active && (
                  <motion.span
                    layoutId="pfd-step-pill"
                    className="absolute inset-0 rounded-pf-pill border border-pf-primary-hi/45 bg-pf-primary/14"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-1.5">
                  <span
                    className={`grid size-4 place-items-center rounded-full text-[9.5px] tabular-nums ${
                      done
                        ? "bg-pf-primary/30 text-pf-primary-hi"
                        : active
                          ? "bg-pf-primary text-white"
                          : "border border-pf-border"
                    }`}
                  >
                    {done ? <Icon name="Check" size={9} /> : i + 1}
                  </span>
                  <span className="hidden sm:inline">{step.label}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <StoreMenu />
    </nav>
  );
}
