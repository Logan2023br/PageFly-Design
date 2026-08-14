"use client";

import { MotionConfig, motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import type { IconName } from "@/lib/icons";
import { Icon } from "../ui";

/* ==========================================================================
   Admin chrome: left sidebar, content on the right.

   Same tokens, glow and type scale as the merchant app — an operator moving
   between the two should not feel like they changed products.
   ========================================================================== */

export type AdminSection = "stats" | "users" | "training";

const NAV: { id: AdminSection; label: string; href: string; icon: IconName }[] = [
  { id: "stats", label: "Thống kê", href: "/design/admin", icon: "ChartColumn" },
  { id: "users", label: "Users", href: "/design/admin/users", icon: "Users" },
  {
    id: "training",
    label: "Training Design",
    href: "/design/admin/training",
    icon: "Images",
  },
];

export function AdminShell({
  current,
  title,
  subtitle,
  actions,
  children,
}: {
  current: AdminSection;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <MotionConfig reducedMotion="user">
      <div
        translate="no"
        className="notranslate pfd-root relative min-h-screen overflow-x-clip"
      >
        <div aria-hidden className="pfd-glow absolute inset-x-0 top-0 h-[520px]" />
        <div aria-hidden className="pfd-grid absolute inset-x-0 top-0 h-[520px]" />

        <div className="relative mx-auto flex w-full max-w-[1600px] flex-col gap-0 px-4 pb-10 pt-4 sm:px-6 sm:pt-6 lg:flex-row lg:gap-6">
          <aside className="lg:w-[212px] lg:shrink-0">
            <div className="flex items-center gap-2 pb-4">
              {/* The real app icon, served from `public/` rather than hot-linked
                  from Shopify's CDN: one fewer third party in the render path,
                  and the mark still appears with the network blocked. It brings
                  its own blue field, so the primary background and white glyph
                  this replaced would only have stacked underneath it. */}
              <Image
                src="/pagefly-icon.png"
                alt=""
                width={28}
                height={28}
                className="size-7 rounded-pf-sm"
                priority
              />
              <span className="font-display text-[15px] font-semibold tracking-[-0.02em] text-pf-text">
                PageFly <span className="text-pf-muted">Admin</span>
              </span>
            </div>

            {/* Horizontal on small screens: a fixed left rail costs a third of a
                phone's width and this table is already wide. */}
            <nav
              aria-label="Admin sections"
              className="flex gap-1 overflow-x-auto border-b border-pf-border pb-3 lg:flex-col lg:border-b-0 lg:pb-0"
            >
              {NAV.map((item) => {
                const active = item.id === current;
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`relative flex shrink-0 items-center gap-2 rounded-pf-md px-3 py-2 text-[13px] font-semibold transition-colors ${
                      active ? "text-pf-text" : "text-pf-muted hover:text-pf-text"
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="pfd-admin-nav"
                        className="absolute inset-0 rounded-pf-md border border-pf-primary-hi/40 bg-pf-primary/14"
                        transition={{ type: "spring", stiffness: 380, damping: 32 }}
                      />
                    )}
                    <span className="relative z-10 flex items-center gap-2">
                      <Icon name={item.icon} size={15} />
                      {item.label}
                    </span>
                  </Link>
                );
              })}

              <form
                action="/api/auth/admin"
                onSubmit={(e) => {
                  e.preventDefault();
                  void fetch("/api/auth/admin", { method: "DELETE" }).then(() =>
                    window.location.assign("/design/admin"),
                  );
                }}
                className="ml-auto lg:ml-0 lg:mt-2"
              >
                <button
                  type="submit"
                  className="flex items-center gap-2 rounded-pf-md px-3 py-2 text-[13px] font-semibold text-pf-faint transition-colors hover:text-pf-text"
                >
                  <Icon name="LogOut" size={15} />
                  Sign out
                </button>
              </form>
            </nav>
          </aside>

          <main className="min-w-0 flex-1 pt-4 lg:pt-0">
            <header className="flex flex-wrap items-end justify-between gap-3 border-b border-pf-border pb-3.5">
              <div className="grid gap-1">
                <h1 className="font-display text-[22px] font-bold tracking-[-0.025em] text-pf-text sm:text-[26px]">
                  {title}
                </h1>
                {subtitle && (
                  <p className="text-[12.5px] text-pf-muted">{subtitle}</p>
                )}
              </div>
              {actions}
            </header>

            <div className="pt-5">{children}</div>
          </main>
        </div>
      </div>
    </MotionConfig>
  );
}
