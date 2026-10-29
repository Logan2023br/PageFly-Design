"use client";

import { MotionConfig, motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import type { AdminSection } from "@/lib/adminSections";
import type { IconName } from "@/lib/icons";
import { Icon } from "../ui";
import { useAdminAccess } from "./AdminAccess";
import { AdminNotifier, NotificationBell } from "./AdminNotifier";

/* ==========================================================================
   Admin chrome: left sidebar, content on the right.

   Same tokens, glow and type scale as the merchant app — an operator moving
   between the two should not feel like they changed products.
   ========================================================================== */

export type { AdminSection };

const NAV: { id: AdminSection; label: string; href: string; icon: IconName }[] = [
  { id: "stats", label: "Thống kê", href: "/design/admin", icon: "ChartColumn" },
  { id: "users", label: "Users", href: "/design/admin/users", icon: "Users" },
  /* Under Users, as asked. "Thống kê" above it counts what the product has
     produced — stores, pages, tokens; this counts what people DID on the way
     to producing it, which is a different question and a different screen. */
  {
    id: "analytics",
    label: "Analytics",
    href: "/design/admin/analytics",
    icon: "TrendingUp",
  },
  {
    id: "training",
    label: "Training Design",
    href: "/design/admin/training",
    icon: "Images",
  },
  {
    id: "collections",
    label: "Collection pages",
    href: "/design/admin/collections",
    icon: "LayoutGrid",
  },
  {
    id: "ssu",
    label: "Upsell Collection Pages",
    href: "/design/admin/collections/upsell",
    icon: "Megaphone",
  },
  {
    id: "upsell",
    label: "Upsell Build 2 pages",
    href: "/design/admin/upsell",
    icon: "Rocket",
  },
  {
    id: "accounts",
    label: "Tài khoản",
    href: "/design/admin/accounts",
    icon: "ShieldCheck",
  },
];

/* What is waiting for review in Upsell Build 2 pages, on the menu item itself.
   Read in the browser rather than by every admin page's server component, so
   adding the badge did not add a query to five screens that have nothing to
   do with it. A failure just shows no badge. */
function useUpsellPending(allowed: boolean): { n: number; failed: number } {
  const [n, setN] = useState({ n: 0, failed: 0 });
  useEffect(() => {
    /* Without the section the counts answer 401; there is no badge to show. */
    if (!allowed) return;
    let live = true;
    const load = () =>
      fetch("/api/admin/upsell/counts")
        .then((r) => (r.ok ? r.json() : null))
        .then((b: { pages?: number; messages?: number; failed?: number } | null) => {
          /* Waiting for review plus failed sends; red while anything failed. */
          if (live && b) setN({ n: (b.pages ?? 0) + (b.messages ?? 0) + (b.failed ?? 0), failed: b.failed ?? 0 });
        })
        .catch(() => undefined);
    void load();
    const t = setInterval(load, 60_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [allowed]);
  return n;
}

/* The same for Upsell Collection Pages: drafts to approve, replies to read. */
function useSsuPending(allowed: boolean): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!allowed) return;
    let live = true;
    const load = () =>
      fetch("/api/admin/collection-pages/store-set-upsell/counts")
        .then((r) => (r.ok ? r.json() : null))
        .then((b: { n?: number } | null) => {
          if (live && b) setN(b.n ?? 0);
        })
        .catch(() => undefined);
    void load();
    const t = setInterval(load, 60_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [allowed]);
  return n;
}

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
  /* Only the sections this sign-in has; the server refuses the rest anyway. */
  const access = useAdminAccess();
  const nav = NAV.filter((item) => access.sections.includes(item.id));
  const upsellPending = useUpsellPending(access.sections.includes("upsell"));
  const ssuPending = useSsuPending(access.sections.includes("ssu"));
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
              {nav.map((item) => {
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
                      {item.id === "upsell" && upsellPending.n > 0 && (
                        <span
                          title={upsellPending.failed > 0 ? `${upsellPending.failed} tin gửi lỗi` : undefined}
                          className={`rounded-pf-pill px-1.5 text-[11px] ${
                            upsellPending.failed > 0 ? "bg-pf-danger text-white" : "bg-pf-warn/25 text-pf-warn"
                          }`}
                        >
                          {upsellPending.n}
                        </span>
                      )}
                      {item.id === "ssu" && ssuPending > 0 && (
                        <span className="rounded-pf-pill bg-pf-warn/25 px-1.5 text-[11px] text-pf-warn">{ssuPending}</span>
                      )}
                    </span>
                  </Link>
                );
              })}

              <div className="ml-auto lg:ml-0 lg:mt-2">
                <AdminNotifier />
              </div>

              <form
                action="/api/auth/admin"
                onSubmit={(e) => {
                  e.preventDefault();
                  void fetch("/api/auth/admin", { method: "DELETE" }).then(() =>
                    window.location.assign("/design/admin"),
                  );
                }}
                className="lg:ml-0"
              >
                <button
                  type="submit"
                  className="flex items-center gap-2 rounded-pf-md px-3 py-2 text-[13px] font-semibold text-pf-faint transition-colors hover:text-pf-text"
                >
                  <Icon name="LogOut" size={15} />
                  Sign out
                  {access.username && (
                    <span className="font-normal text-pf-faint">· {access.username}</span>
                  )}
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
              {/* The bell sits at the top right of every admin screen; its list
                  opens down and to the left from there. */}
              <div className="flex items-center gap-3">
                {actions}
                <NotificationBell />
              </div>
            </header>

            <div className="pt-5">{children}</div>
          </main>
        </div>
      </div>
    </MotionConfig>
  );
}
