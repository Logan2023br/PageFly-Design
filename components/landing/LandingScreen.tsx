"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { InstallPageFlyButton } from "../pagefly/InstallPageFly";
import { EV, track } from "@/lib/analytics";
import { cleanedUrl, inviteParams, loginParam, type Invite } from "@/lib/autoSignIn";
import type { StoreAuthResponse } from "@/app/api/auth/store/route";
import type { ProvisionResponse } from "@/app/api/auth/provision/route";
import { GradientWord, Icon } from "../ui";
import { Comparison } from "./Comparison";
import { HeroRail } from "./HeroRail";
import { Faq } from "./Faq";
import { GoingLive } from "./GoingLive";
import { HowItWorks } from "./HowItWorks";
import { LandingFooter } from "./LandingFooter";
import { ProofStrip } from "./ProofStrip";
import { WhatYouGet } from "./WhatYouGet";
import { useSeen } from "./useSeen";
import { Showcase } from "./Showcase";

/* ==========================================================================
   The front door.

   Public: no model call, and `/` is deliberately not in the proxy's matcher —
   see `proxy.ts` — so this renders for anyone, signed in or not.

   DESIGN NOW IS A PLAIN LINK. `/design` is guarded and the guard already
   redirects to `/design/login?next=…` and returns you afterwards. A sign-in
   check here would be a second implementation of a rule that already exists,
   and two implementations of an auth rule is one more than is safe.

   THE HEADER DOES read the session, and only the header. It showed "Sign in" to
   someone already signed in — so the one control on the page told them to do
   the thing they had already done, and gave them no way to see which store they
   were signed in AS or to leave it. That is a display question, not an access
   question: what the button SAYS changes, where it goes does not, and a failed
   account call falls back to the signed-out header rather than to an error.

   The showcase is fetched client-side rather than server-rendered: it is the
   one part that touches the database, and a slow or missing database should
   cost this page a section rather than the whole render.
   ========================================================================== */

/* ==========================================================================
   THE FOUR ANCHORS, ONCE.

   The bar renders them and so does the menu behind the button, and the two
   lists have to be the same list: a nav item added to one and not the other is
   a section that exists on a laptop and not on a phone, which is the exact bug
   the menu was added to fix.
   ========================================================================== */
const NAV: { label: string; to: string }[] = [
  { label: "Example pages", to: "examples" },
  { label: "What you get", to: "get" },
  { label: "How it works", to: "how" },
  { label: "FAQ", to: "faq" },
];

export function LandingScreen() {
  /**
   * The signed-in store, or null.
   *
   * `undefined` while unknown, and the header renders NOTHING on the right
   * until it resolves. Guessing "Sign in" first would flash the wrong control
   * on every load for the people most likely to be here — the beta testers, who
   * are all signed in.
   */
  const [domain, setDomain] = useState<string | null | undefined>(undefined);
  const [signingOut, setSigningOut] = useState(false);
  /* The menu behind the button below `lg`. Closed on every load: a masthead
     that opens itself is a masthead covering the hero. */
  const [menu, setMenu] = useState(false);
  /* The store a ?login= link named, held until the merchant presses Design
     now. Null on an ordinary visit, which is almost every visit.

     A ref, not state: nothing renders it. It is read once inside the click
     handler and cleared when it has been spent, and holding it in state would
     make the page re-render on load for a value no pixel depends on. */
  /* The hero and the closing ask report like every other section — see
     `useSeen`. Nine numbers rather than two is the whole point of the
     rebuild: a page that loses people has to say where. */
  const heroRef = useSeen<HTMLElement>("hero");
  const closingRef = useSeen<HTMLElement>("final_cta");
  const linkDomain = useRef<string | null>(null);
  /* An INVITE — a link carrying a signature, which may create the store it
     names. Held beside `linkDomain` rather than replacing it: a plain ?login=
     link is a different thing with a different rule, and collapsing the two
     would put every plain link through the door that creates stores. */
  const invite = useRef<Invite | null>(null);
  const [linkSignIn, setLinkSignIn] = useState<"trying" | "refused" | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);


  /**
   * Design now, for a visitor who arrived on a ?login= link.
   *
   * Falls through to the plain link in every other case: no link, or a store
   * already signed in. `/design` is guarded by the proxy, which sends anyone
   * without a cookie to the form — the behaviour this replaces only where a
   * link said which store to sign in as.
   */
  /**
   * Spend the link: sign in as the store it names, then go to the brief.
   *
   * TWO DOORS, AND THE LINK PICKS ONE. A signed invite goes to the route that
   * may create the store; a plain ?login= goes to the beta gate, which refuses
   * a store that is not on the list — the behaviour that shipped first and is
   * unchanged by any of this.
   *
   * WHATEVER SESSION EXISTS IS REPLACED. Both routes set the session cookie to
   * the store the link names, so arriving on an invite for one store while
   * signed in as another leaves you signed in as the one you were invited to.
   * Nothing needs clearing first — a cookie is overwritten, not merged.
   */
  const spendLink = async () => {
    const signed = invite.current;

    try {
      const res = signed
        ? await fetch("/api/auth/provision", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              domain: signed.domain,
              token: signed.token,
              name: signed.name,
              email: signed.email,
            }),
          })
        : await fetch("/api/auth/store", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ domain: linkDomain.current }),
          });

      /* A crashed route answers with an HTML error page and res.json() throws
         on it — the same trap LoginScreen documents. */
      let body: StoreAuthResponse | ProvisionResponse;
      try {
        body = (await res.json()) as StoreAuthResponse | ProvisionResponse;
      } catch {
        setLinkError(`The server returned an error (${res.status}).`);
        setLinkSignIn("refused");
        return;
      }

      if (!body.ok) {
        /* NOT A REFUSAL — an email is wanted, and there is nowhere here to ask
           for one. The store checked out, so this hands the visitor to the
           sign-in form, which draws the box. The domain stays armed so the
           form can be reached with it already filled in rather than making
           them type it a second time. */
        if ("needsEmail" in body) {
          window.location.assign(
            `/design/login?domain=${encodeURIComponent(body.domain)}`,
          );
          return;
        }

        setLinkError(body.error);
        setLinkSignIn("refused");
        /* Spent. A domain the list refused will be refused again, and leaving
           it armed would make the button retry it on every press — the second
           press should do what the button says and go to the sign-in form. */
        linkDomain.current = null;
        invite.current = null;
        return;
      }

      /* Full navigation, not router.push: /design is behind the proxy guard,
         which reads the cookie the browser has only just been given. */
      window.location.assign("/design");
    } catch {
      setLinkError("Could not reach the server. Check your connection.");
      setLinkSignIn("refused");
    }
  };

  /* ==========================================================================
     /?login=their-store.myshopify.com

     A link that lets a merchant press Design now once and land on the brief,
     instead of on a form asking for the store domain the link already carries.

     THE LINK IS REMEMBERED, NOT ACTED ON. Signing someone in the instant a page
     loads takes the decision away from them — they asked for the front door and
     got a redirect. So this only holds the domain, and the button they came to
     press is what spends it.

     THE PARAMETER IS STRIPPED IMMEDIATELY ANYWAY. While it sits in the address
     bar it reaches browser history, the Referer header of the next request, and
     every proxy log in between, none of which can be unsent. Reading it once
     into memory costs the merchant nothing and closes that window on load
     rather than on click.

     NOTHING HERE VALIDATES THE DOMAIN. `POST /api/auth/store` is the only place
     in this app allowed to say yes to a sign-in, and its own header says so.
     ========================================================================== */
  useEffect(() => {
    const wanted = loginParam(window.location.search);
    if (!wanted) return;

    linkDomain.current = wanted;
    const signed = inviteParams(window.location.search);
    invite.current = signed;

    try {
      window.history.replaceState(null, "", cleanedUrl(window.location.href));
    } catch {
      /* Some embedded browsers refuse replaceState. The link still works — one
         that works with an untidy address bar beats one that does not work. */
    }

    /* ======================================================================
       A SIGNED INVITE SPENDS ITSELF NOW. A plain ?login= link waits for the
       button, because arriving on the front door is not the same as asking to
       leave it. An invite is not that: the merchant pressed PageFly Design
       inside their store, something signed a link on their behalf, and this
       page is a step on a journey they already started.

       Waiting for a second press made that visible in the worst way. Someone
       signed in as another store landed here, saw THAT store's name in the
       header, and had every reason to believe the link had opened the wrong
       account — the session was simply still the old one, because nothing had
       replaced it yet. Spending the invite on load replaces it before there is
       anything to misread.
       ====================================================================== */
    if (!signed) return;

    /* The rule guards against effects that set state every render and drive a
       render loop. This one runs once, on mount, only when the URL carried a
       signature, and the pass it costs is the overlay appearing — which is the
       point. */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLinkSignIn("trying");
    void spendLink();
  }, []);

  /**
   * Design now, for a visitor who arrived on a plain ?login= link.
   *
   * NOT for an invite: that one has already spent itself on load — see the
   * effect above — and by the time this button exists to be pressed the
   * merchant is on the brief.
   *
   * NO `|| domain` GUARD. Skipping the link because a session already existed
   * meant every link opened the store already signed in: someone who had once
   * signed in as one store then got that store from every link they were sent,
   * and nothing on the screen said why.
   */
  /* THE DENOMINATOR OF EVERY RATIO on the analytics screen, so it fires once
     per mount and nowhere else. `[]` rather than a dependency: this page does
     not remount on navigation within itself, and a view counted twice makes
     every conversion rate below it read low. */
  useEffect(() => {
    track(EV.landingViewed);
  }, []);

  /* ==========================================================================
     THE MENU CLOSES ON ESCAPE, AND ON GROWING PAST ITS OWN BREAKPOINT.

     The second one is not hypothetical: the panel is `lg:hidden`, so a phone
     turned sideways — or a window dragged wider — leaves `menu` true with
     nothing on screen, and the next press of the button closes what is already
     invisible instead of opening it. The state has to follow the CSS that hides
     it, or the button does nothing once in every visit that rotates a device.
     ========================================================================== */
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(false);
    };
    /* 1024px is Tailwind's `lg`. Written out because there is no way to ask
       Tailwind for it at runtime, and a wrong number here is a bug that only
       appears at one window width. */
    const wide = window.matchMedia("(min-width: 1024px)");
    const onWide = () => {
      if (wide.matches) setMenu(false);
    };
    onWide();
    window.addEventListener("keydown", onKey);
    wide.addEventListener("change", onWide);
    return () => {
      window.removeEventListener("keydown", onKey);
      wide.removeEventListener("change", onWide);
    };
  }, [menu]);

  const designNow = async (event: React.MouseEvent) => {
    if (!linkDomain.current || linkSignIn === "trying") return;

    /* Only now, once the merchant has asked to go there. */
    event.preventDefault();
    setLinkSignIn("trying");
    setLinkError(null);
    await spendLink();
  };

  useEffect(() => {
    let alive = true;
    fetch("/api/account")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!alive) return;
        setDomain(data?.ok ? (data.account?.domain ?? null) : null);
      })
      .catch(() => {
        /* Signed out is the safe reading of "we could not tell". The worst it
           costs is a Sign in button shown to someone who is already in, and
           pressing it lands them straight back on /design. */
        if (alive) setDomain(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await fetch("/api/auth/store", { method: "DELETE" });
    } catch {
      /* The cookie is httpOnly, so there is nothing to clear here. Reloading is
         what makes the sign-out visible either way. */
    }
    /* A full reload rather than setState: every guarded route has to be
       re-evaluated without the cookie, and this page's own showcase fetch
       should run again as a stranger would see it. */
    window.location.assign("/");
  };

  /* ==========================================================================
     THE GALLERY NO LONGER FETCHES ANYTHING.

     It used to pull `/api/showcase` — the demo store's most recent run — while
     the strip under the hero drew from the curated list in
     `lib/showcasePages.ts`. So the page showed two different stores under one
     heading claiming they were one matching set, and the contradiction was
     invisible unless you knew which half came from where.

     Both read that list now, so there is nothing left to load, nothing to fail,
     and no first second of the visit where the gallery is empty. The endpoint
     and everything behind it stay — `lib/showcase.ts` is still what a future
     "recent builds" section would read — they are simply not what the front
     door claims a matching set from.
     ========================================================================== */

  return (
    <main className="pfd-root relative min-h-dvh overflow-x-clip bg-pf-bg text-pf-body">
      {/* Over everything, for the seconds between the press and the brief.
          Without it the button looks unpressed while the sign-in runs, and a
          second press starts a second one. */}
      {linkSignIn === "trying" && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-0 z-[60] grid place-items-center bg-pf-bg/85 backdrop-blur-sm"
        >
          <div className="grid justify-items-center gap-3">
            <span className="size-7 animate-spin rounded-full border-2 border-pf-border border-t-pf-primary-hi" />
            <p className="text-[13.5px] font-semibold text-pf-text">Signing you in…</p>
          </div>
        </div>
      )}

      {/* ====================================================================
          THE MASTHEAD, AND IT IS A BAR NOW RATHER THAN A ROW OF CONTROLS.

          72px with a rule under it and its own slightly opaque ground, because
          the hero's bloom starts immediately below: without the ground the
          purple wash climbed behind the wordmark and the header stopped
          reading as a separate surface.

          THREE GROUPS, NOT THREE CHILDREN. `justify-between` spreads whatever
          it is given evenly, so the logo, the four anchors and the three
          controls have to be three wrappers or the nav drifts off centre the
          moment the right-hand group changes width — which it does, on every
          page load, when the session resolves.
          ==================================================================== */}
      <header className="sticky top-0 z-40 border-b border-pf-border bg-[rgba(10,6,22,0.92)] backdrop-blur">
        {/* FULL BLEED, 120px OF SIDE PADDING — not a centred 1200px box. The
            bands below are content and hold a reading measure; a masthead is
            chrome and belongs to the window. Capped at 1200 it sat inside the
            page it was supposed to frame: on a wide monitor the wordmark
            started a third of the way in while the rule under it ran edge to
            edge, and the two did not read as one bar. */}
        <div className="flex h-[72px] items-center justify-between gap-4 px-5 sm:gap-6 sm:px-8 lg:px-[120px]">
          <Link href="/" className="flex shrink-0 items-center gap-2.5 text-pf-text">
            <Image
              src="/pagefly-icon.png"
              alt=""
              width={28}
              height={28}
              className="size-7 rounded-[7px]"
              priority
            />
            <span className="font-display text-[17px] font-bold tracking-[-0.012em]">
              PageFly <span className="font-semibold text-pf-muted">Design</span>
            </span>
          </Link>

          {/* FOUR ANCHORS. They are not decisions — each one scrolls to a
              section already on this page — so they are counted under their own
              name rather than as CTAs. Lumped in with `Design now`, a visitor
              who read the FAQ would be indistinguishable from one who left for
              the brief. */}
          <nav className="hidden items-center gap-7 text-[14px] font-medium lg:flex">
            {NAV.map((item) => (
              <a
                key={item.to}
                href={`#${item.to}`}
                onClick={() => track(EV.landingNav, { to: item.to })}
                className="text-pf-body/[.78] transition-colors hover:text-pf-text"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex min-w-0 shrink-0 items-center gap-4 sm:gap-5">
            {/* A TEXT LINK, NOT A SECOND PURPLE BUTTON. Beside `Design now` in
                the same fill it offered two equally weighted next steps, and
                the one this product exists for came second. */}
            <span className="hidden lg:inline-flex">
              <InstallPageFlyButton variant="link" surface="topbar_landing" />
            </span>

            {/* Nothing until the session is known — see `domain` above. */}
            {domain === undefined ? null : domain ? (
              <div className="hidden min-w-0 items-center gap-1.5 lg:flex">
                {/* The domain is a LINK to the workspace, not a label. Someone
                    who reads their own store name in a header is already
                    reaching for it. */}
                <Link
                  href="/design"
                  title={domain}
                  onClick={() => track(EV.ctaClicked, { location: "header_store" })}
                  className="max-w-[200px] truncate text-[14px] font-medium text-pf-body/[.78] transition-colors hover:text-pf-text"
                >
                  {domain}
                </Link>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  disabled={signingOut}
                  className="inline-flex shrink-0 items-center gap-1.5 text-[14px] font-medium text-pf-faint transition-colors hover:text-pf-text disabled:opacity-50"
                >
                  <Icon name="LogOut" size={14} />
                  {signingOut ? "Signing out…" : "Sign out"}
                </button>
              </div>
            ) : (
              <Link
                href="/design"
                onClick={() => track(EV.ctaClicked, { location: "header_signin" })}
                className="hidden text-[14px] font-medium text-pf-body/[.78] transition-colors hover:text-pf-text lg:block"
              >
                Sign in
              </Link>
            )}

            <Link
              href="/design"
              onClick={(e) => {
                track(EV.ctaClicked, { location: "header" });
                void designNow(e);
              }}
              className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-[10px] bg-pf-primary px-[18px] text-[14px] font-semibold text-white transition-colors duration-150 hover:bg-pf-primary-hi"
            >
              Design now
              <Icon name="ArrowRight" size={14} />
            </Link>

            {/* ==============================================================
                EVERYTHING THE BAR CANNOT HOLD, BEHIND ONE BUTTON.

                The four anchors, Install and Sign in were simply `hidden` below
                `lg` — which meant that on a phone AND on a tablet the whole
                page had one control on it, and a visitor who wanted the FAQ
                had to scroll past five bands to find it. A section nobody can
                navigate to is a section that only exists for desktop.

                `Design now` stays OUT of the menu and beside it. It is the
                thing this page is for; putting it one tap further away on the
                screen size where taps are dearest is exactly backwards.
                ============================================================== */}
            <button
              type="button"
              onClick={() => setMenu((open) => !open)}
              aria-expanded={menu}
              aria-controls="landing-menu"
              aria-label={menu ? "Close menu" : "Open menu"}
              className="-mr-1.5 inline-flex size-10 shrink-0 items-center justify-center rounded-pf-md text-pf-body transition-colors hover:bg-pf-card hover:text-pf-text lg:hidden"
            >
              <Icon name={menu ? "X" : "Menu"} size={20} />
            </button>
          </div>
        </div>

        {menu && (
          <div
            id="landing-menu"
            className="border-t border-pf-border bg-[rgba(10,6,22,0.98)] px-5 py-3 sm:px-8 lg:hidden"
          >
            <nav className="flex flex-col">
              {NAV.map((item) => (
                <a
                  key={item.to}
                  href={`#${item.to}`}
                  onClick={() => {
                    track(EV.landingNav, { to: item.to, where: "menu" });
                    setMenu(false);
                  }}
                  className="border-b border-pf-border py-3.5 text-[15px] font-medium text-pf-body transition-colors hover:text-pf-text"
                >
                  {item.label}
                </a>
              ))}
            </nav>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 py-4">
              <InstallPageFlyButton variant="link" surface="topbar_landing" />
              {domain === undefined ? null : domain ? (
                <>
                  <Link
                    href="/design"
                    title={domain}
                    onClick={() => track(EV.ctaClicked, { location: "header_store" })}
                    className="max-w-full truncate text-[15px] font-medium text-pf-body transition-colors hover:text-pf-text"
                  >
                    {domain}
                  </Link>
                  <button
                    type="button"
                    onClick={() => void signOut()}
                    disabled={signingOut}
                    className="inline-flex items-center gap-1.5 text-[15px] font-medium text-pf-faint transition-colors hover:text-pf-text disabled:opacity-50"
                  >
                    <Icon name="LogOut" size={14} />
                    {signingOut ? "Signing out…" : "Sign out"}
                  </button>
                </>
              ) : (
                <Link
                  href="/design"
                  onClick={() => track(EV.ctaClicked, { location: "header_signin" })}
                  className="text-[15px] font-medium text-pf-body transition-colors hover:text-pf-text"
                >
                  Sign in
                </Link>
              )}
            </div>
          </div>
        )}
      </header>

      {/* ====================================================================
          THE HERO.

          THE BLOOM IS ON THIS SECTION, not a floating element behind the page.
          It was an absolutely positioned `Aura`, which meant the light and the
          band it lights were two things that had to be kept the same size by
          hand — and were not, so the wash ended in a soft horizontal edge part
          way down the hero. As a background on the section itself it is the
          hero's own light, and it ends where the hero ends.
          ==================================================================== */}
      <section
        ref={heroRef}
        id="top"
        className="flex flex-col items-center px-5 pb-[72px] pt-16 text-center sm:px-8 sm:pt-24 lg:px-[120px]"
        style={{
          background:
            "radial-gradient(ellipse 900px 520px at 50% -120px, rgba(107,47,247,0.28), rgba(10,6,22,0) 70%)",
        }}
      >
        <h1 className="max-w-[980px] font-display text-[clamp(2.5rem,6vw,4.25rem)] font-semibold leading-[1.04] tracking-[-0.032em] text-pf-text">
          Describe your store.
          <span className="block">
            Get <GradientWord>every page</GradientWord> back.
          </span>
        </h1>
        <p className="mt-[22px] max-w-[700px] text-[18px] leading-relaxed text-pf-body/[.72]">
          Home, product, collection, landing, about, contact and blog — designed as
          one matching set for what you actually sell, then sent straight into the
          PageFly editor. Nothing to install to start.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3.5">
          <Link
            href="/design"
            onClick={(e) => {
              track(EV.ctaClicked, { location: "hero" });
              void designNow(e);
            }}
            className="inline-flex min-h-[52px] items-center gap-2.5 rounded-pf-md bg-pf-primary px-[26px] text-[17px] font-semibold text-white shadow-pf-button transition-colors duration-150 hover:bg-pf-primary-hi"
          >
            Design my pages — free
            <Icon name="ArrowRight" size={16} />
          </Link>
          {/* THE SECOND ACTION IS NOT A SECOND CTA. It goes down this page, to
              the work, for the visitor who is not ready to decide — and it is
              tracked as navigation so the CTA number keeps meaning "left for
              the brief". */}
          <a
            href="#examples"
            onClick={() => track(EV.landingNav, { to: "examples_hero" })}
            className="inline-flex min-h-[52px] items-center gap-2 rounded-pf-md border border-pf-border-hi px-[22px] text-[16px] font-semibold text-pf-body/85 transition-colors duration-150 hover:border-pf-primary-hi hover:text-pf-text"
          >
            See pages it built
            <Icon name="ArrowDown" size={14} />
          </a>
        </div>

        {/* The refusal sits here rather than replacing the line below it: the
            merchant arrived on a link we sent, and "not on the list" is the
            whole answer they need — the invitation to sign in by hand stays,
            because a different store of theirs might be on it. */}
        {linkSignIn === "refused" && linkError && (
          <p
            role="alert"
            className="mt-4 flex max-w-[380px] items-start gap-1.5 text-[12.5px] font-semibold text-pf-danger"
          >
            <span className="mt-px shrink-0">
              <Icon name="CircleAlert" size={13} />
            </span>
            {linkError}
          </p>
        )}

        {/* THREE, BECAUSE THEY ANSWER THREE DIFFERENT REFUSALS — the cost, the
            account, and the install. One line carrying all of them read as a
            single hedge. The ticks are violet rather than the success green:
            nothing has succeeded here, they are marks against a list. */}
        <ul className="mt-[18px] flex flex-wrap items-center justify-center gap-x-[18px] gap-y-2 text-[13.5px] font-medium text-pf-muted">
          {["3 pages free", "No password to set up", "Just your store domain"].map((line) => (
            <li key={line} className="inline-flex items-center gap-1.5">
              <span className="text-pf-violet">
                <Icon name="Check" size={14} />
              </span>
              {line}
            </li>
          ))}
        </ul>

        <HeroRail />
      </section>

      <ProofStrip />
      {/* THE ANCHOR IS OUT HERE, NOT ON THE SHOWCASE. `Showcase` renders
          nothing until the previews have been fetched — and nothing at all if
          that fetch fails — so an id on it is a link in the header that
          silently goes nowhere for the first second of every visit, and for
          the whole visit whenever the endpoint is down. A link that does
          nothing is worse than a section that is still loading. */}
      <div id="examples" className="scroll-mt-[72px]">
        <Showcase />
      </div>
      <WhatYouGet />
      <Comparison />
      <HowItWorks />
      <GoingLive />
      <Faq />

      {/* ====================================================================
          THE CLOSING ASK, AND NOTHING ELSE IN IT.

          THE FIGURES MOVED TO THE TOP. Read beside the last button they were a
          footnote to a decision already made; under the hero they are the
          reason to keep scrolling.

          The bloom comes up from below the fold this time — the mirror of the
          hero's, which is what makes the two ends of the page read as one
          object rather than two pages stuck together.
          ==================================================================== */}
      <section
        ref={closingRef}
        className="flex min-h-[400px] flex-col items-center justify-center border-t border-pf-border px-5 py-[72px] text-center sm:px-8 lg:px-[120px]"
        style={{
          background:
            "radial-gradient(ellipse 800px 360px at 50% 120%, rgba(107,47,247,0.30), rgba(10,6,22,0) 70%)",
        }}
      >
        <h2 className="font-display text-[clamp(2rem,5vw,3.25rem)] font-semibold leading-[1.06] tracking-[-0.031em] text-pf-text">
          Your turn. Four answers,
          <span className="block">
            then <GradientWord>every page</GradientWord> of your store.
          </span>
        </h2>
        {/* SEVEN MINUTES, MEASURED. "About two minutes" stood here against 26
            real single-page builds whose median is 432 seconds — a promise the
            build cannot keep is the fastest way to make a working build look
            broken. */}
        <p className="mt-[18px] max-w-[560px] text-[17px] leading-relaxed text-pf-muted">
          Three pages free. No password, no card, nothing to install — just your
          store domain. A page takes about seven minutes.
        </p>
        <Link
          href="/design"
          onClick={(e) => {
            track(EV.ctaClicked, { location: "closing" });
            void designNow(e);
          }}
          className="mt-7 inline-flex min-h-[52px] items-center gap-2.5 rounded-pf-md bg-pf-primary px-[26px] text-[17px] font-semibold text-white shadow-pf-button transition-colors duration-150 hover:bg-pf-primary-hi"
        >
          Design my pages — free
          <Icon name="ArrowRight" size={16} />
        </Link>
      </section>

      <LandingFooter />
    </main>
  );
}
