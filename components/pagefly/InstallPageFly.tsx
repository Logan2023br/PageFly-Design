"use client";

import { PAGEFLY_INSTALL_URL } from "@/lib/pagefly/install";
import { Icon } from "../ui";

/* ==========================================================================
   Install PageFly.

   A LINK WEARING A BUTTON, not a button that navigates. It leaves this app for
   another site, and a merchant who wants it in a second tab should be able to
   middle-click or cmd-click it — which a `<button onClick={location.assign}>`
   silently refuses.

   `target="_blank"` for the same reason it is on the Shopify sign-up link in
   the register form: somebody is mid-task here, and a new tab is the
   difference between "look at this" and "lose what you were doing".
   `rel="noopener noreferrer"` is not optional with it — without `noopener` the
   opened page gets a handle on this one through `window.opener`.
   ========================================================================== */

export function InstallPageFlyButton({
  size = "md",
  className = "",
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = {
    sm: "h-8 px-3 text-[12.5px] gap-1.5",
    md: "h-10 px-4 text-[13.5px] gap-2",
    lg: "h-12 px-6 text-[14.5px] gap-2",
  }[size];

  return (
    <a
      href={PAGEFLY_INSTALL_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex shrink-0 items-center justify-center rounded-pf-md bg-pf-primary font-semibold text-white shadow-pf-button transition-colors duration-150 hover:bg-pf-primary-hi ${sizes} ${className}`}
    >
      Install PageFly
      <Icon name="ArrowUpRight" size={size === "sm" ? 14 : 16} />
    </a>
  );
}

/**
 * The quiet form, for a place that is already about exporting.
 *
 * Beside an Export control the loud one would compete with it — and the person
 * reading it has usually already installed PageFly, because that is how they
 * came to be here. A line of text is enough for the ones who have not.
 */
export function InstallPageFlyLink({ className = "" }: { className?: string }) {
  return (
    <span className={`text-[11.5px] text-pf-faint ${className}`}>
      Need the app to open these?{" "}
      <a
        href={PAGEFLY_INSTALL_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-pf-sm font-semibold text-pf-primary-hi underline underline-offset-2 hover:text-pf-text focus:outline-none focus-visible:ring-2 focus-visible:ring-pf-primary-hi"
      >
        Install PageFly
      </a>
    </span>
  );
}
