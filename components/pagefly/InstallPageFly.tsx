"use client";

import { EV, track, type Surface } from "@/lib/analytics";
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
  surface,
  variant = "solid",
  label = "Install PageFly",
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
  /** Which screen this one is on. Required, not defaulted: a default would be
      a wrong answer that never looks wrong — the count would land under some
      other placement and the comparison it exists for would be quietly off. */
  surface: Surface;
  /* ----------------------------------------------------------------------
     HOW LOUD, WHICH IS A QUESTION ABOUT THE SENTENCE AROUND IT.

     Purple everywhere was wrong in two different ways at once. In the masthead
     it sat beside `Design now` in the same fill, so the header offered two
     equally weighted next steps and the one this product is for came second.
     In the going-live band it is the only action in sight and does not need to
     shout, but it does need an outline to read as a control at all.

     So: `solid` where it IS the ask, `ghost` where it is the only action in a
     quiet band, `link` in the masthead where `Design now` is the ask and this
     is a thing you might also want.
     ---------------------------------------------------------------------- */
  variant?: "solid" | "ghost" | "link";
  /** The masthead says "Install PageFly"; the going-live band says which plan. */
  label?: string;
}) {
  const sizes = {
    sm: "h-8 px-3 text-[12.5px] gap-1.5",
    md: "h-10 px-4 text-[13.5px] gap-2",
    lg: "h-12 px-6 text-[14.5px] gap-2",
  }[size];

  const skins = {
    solid:
      `rounded-pf-md bg-pf-primary font-semibold text-white shadow-pf-button transition-colors duration-150 hover:bg-pf-primary-hi ${sizes}`,
    ghost:
      `rounded-pf-md border border-pf-border-hi font-semibold text-pf-body transition-colors duration-150 hover:border-pf-primary-hi hover:text-pf-text ${sizes}`,
    /* No box at all — a nav item that happens to leave the site. The sizes
       above are heights and horizontal padding, neither of which a run of text
       in a header should carry. */
    link: "font-medium text-pf-muted transition-colors duration-150 hover:text-pf-text gap-1.5 text-[14px]",
  }[variant];

  return (
    <a
      href={PAGEFLY_INSTALL_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => track(EV.pageflyInstallClicked, { surface })}
      className={`inline-flex shrink-0 items-center justify-center ${skins} ${className}`}
    >
      {label}
      <Icon name="ArrowUpRight" size={size === "sm" || variant === "link" ? 14 : 16} />
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
export function InstallPageFlyLink({
  className = "",
  surface,
}: {
  className?: string;
  surface: Surface;
}) {
  return (
    <span className={`text-[11.5px] text-pf-faint ${className}`}>
      Need the app to open these?{" "}
      <a
        href={PAGEFLY_INSTALL_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => track(EV.pageflyInstallClicked, { surface })}
        className="rounded-pf-sm font-semibold text-pf-primary-hi underline underline-offset-2 hover:text-pf-text focus:outline-none focus-visible:ring-2 focus-visible:ring-pf-primary-hi"
      >
        Install PageFly
      </a>
    </span>
  );
}
