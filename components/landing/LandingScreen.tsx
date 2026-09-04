"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { PageMockup } from "@/lib/generate/types";
import { cleanedUrl, loginParam } from "@/lib/autoSignIn";
import type { StoreAuthResponse } from "@/app/api/auth/store/route";
import { GradientWord, Icon } from "../ui";
import { Aura } from "./Aura";
import { Counts } from "./Counts";
import { HowItWorks } from "./HowItWorks";
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

export function LandingScreen() {
  const [pages, setPages] = useState<PageMockup[]>([]);
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
  /* The ?login= link, mid-flight. Null when this is an ordinary visit, which is
     almost every visit — the overlay and the message below both stay out of the
     way until a link actually asks for a sign-in. */
  const [linkSignIn, setLinkSignIn] = useState<"trying" | "refused" | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  /* ==========================================================================
     /?login=their-store.myshopify.com

     A link that signs a merchant in and drops them on the brief, rather than
     showing them a form asking for the domain the link already carries.

     THE SAME DOOR THE FORM USES. `POST /api/auth/store` is the only place in
     this app allowed to say yes to a sign-in, and its own header says so. A
     second grant path here would be a second thing to keep in step with the
     allowlist, and the second one is the one that drifts.

     THE PARAMETER IS STRIPPED BEFORE THE ANSWER COMES BACK, not after. While it
     sits in the address bar it reaches browser history, the Referer header of
     the next request, and every proxy log in between — none of which can be
     unsent. Closing that window early costs nothing.

     A REFUSAL KEEPS THEM HERE. Redirecting a merchant whose store is not on the
     list to a sign-in form would ask them to type the domain that was just
     rejected, which reads as the app not having heard them.
     ========================================================================== */
  useEffect(() => {
    const wanted = loginParam(window.location.search);
    if (!wanted) return;

    /* The rule guards against an effect that sets state on every render and
       drives a render loop. This one runs once, on mount, only when the URL
       carries the parameter, and the page it belongs to is about to navigate
       away — the extra pass it costs is the overlay appearing, which is the
       whole point. The alternatives are worse: reading `window` during render
       would make the client's first paint disagree with the prerendered HTML,
       and deferring past an await would show the front door for a beat before
       covering it. */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLinkSignIn("trying");
    try {
      window.history.replaceState(null, "", cleanedUrl(window.location.href));
    } catch {
      /* Some embedded browsers refuse replaceState. The sign-in still runs —
         a link that works with an untidy address bar beats one that does not
         work at all. */
    }

    let alive = true;
    void (async () => {
      try {
        const res = await fetch("/api/auth/store", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ domain: wanted }),
        });

        /* A crashed route answers with an HTML error page and res.json() throws
           on it — the same trap LoginScreen documents. */
        let body: StoreAuthResponse;
        try {
          body = (await res.json()) as StoreAuthResponse;
        } catch {
          if (alive) {
            setLinkError(`The server returned an error (${res.status}).`);
            setLinkSignIn("refused");
          }
          return;
        }

        if (!body.ok) {
          if (alive) {
            setLinkError(body.error);
            setLinkSignIn("refused");
          }
          return;
        }

        /* Full navigation, not router.push: /design is behind the proxy guard,
           which reads the cookie the browser has only just been given. The
           overlay stays up through it — this component is about to be gone. */
        window.location.assign("/design");
      } catch {
        if (alive) {
          setLinkError("Could not reach the server. Check your connection.");
          setLinkSignIn("refused");
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

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

  useEffect(() => {
    let alive = true;
    fetch("/api/showcase")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!alive || !data) return;
        setPages(Array.isArray(data.pages) ? data.pages : []);
      })
      .catch(() => {
        /* Nothing. The sections render nothing when they have nothing, which is
           the whole failure plan: a front door that errors because a demo run
           was deleted is worse than one with a section missing. */
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <main className="pfd-root relative min-h-dvh overflow-x-clip bg-pf-bg text-pf-body">
      {/* Over everything, and only for the seconds a ?login= link is in flight.
          Without it the merchant sees the front door they were not asking for,
          long enough to press something on it, and then the page navigates out
          from under the press. */}
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

      {/* Behind the masthead as well as the hero — the bloom reads as light
          coming from off the top of the page, and a header sitting on flat
          black in front of it would cut the effect in half. */}
      <Aura variant="sky" />

      {/* The SHELL width, not the content width. Every signed-in screen puts its
          masthead in `max-w-[1600px]` with `px-4 sm:px-6` — see `DesignApp`,
          `LibraryScreen`, `LoginScreen` — and this one was in `max-w-6xl`
          (1152px) with the page's reading measure. On a wide monitor that put
          the logo a third of the way in while the same logo on the next screen
          sat at the edge, so the two headers did not look like one product.

          Only the header moves. The sections below keep their narrower measures,
          which is what they are for. */}
      <header className="mx-auto flex w-full max-w-[1600px] items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <Image
            src="/pagefly-icon.png"
            alt=""
            width={28}
            height={28}
            className="size-7 rounded-pf-sm"
            priority
          />
          <span className="font-display text-[15px] font-semibold tracking-[-0.02em] text-pf-text">
            PageFly <span className="text-pf-muted">Design</span>
          </span>
        </Link>

        {/* Nothing until the session is known — see `domain` above. */}
        {domain === undefined ? null : domain ? (
          <div className="flex min-w-0 items-center gap-1.5">
            {/* The domain is a LINK to the workspace, not a label. Someone who
                reads their own store name in a header is already reaching for
                it, and "Design now" is a screen further down the page. */}
            <Link
              href="/design"
              title={domain}
              className="max-w-[200px] truncate rounded-pf-md px-2 py-1.5 text-[13px] text-pf-muted transition-colors hover:text-pf-text sm:max-w-[280px]"
            >
              {domain}
            </Link>
            <button
              type="button"
              onClick={() => void signOut()}
              disabled={signingOut}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-pf-md px-2 py-1.5 text-[12.5px] font-semibold text-pf-faint transition-colors hover:bg-pf-card hover:text-pf-text disabled:opacity-50"
            >
              <Icon name="LogOut" size={14} />
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        ) : (
          <Link
            href="/design"
            className="rounded-pf-md border border-pf-border px-3.5 py-2 text-[13.5px] font-semibold text-pf-text transition-colors hover:border-pf-border-hi"
          >
            Sign in
          </Link>
        )}
      </header>

      <section className="relative mx-auto max-w-4xl px-5 pb-4 pt-10 text-center sm:pt-16">
        <h1 className="font-display text-pf-hero font-semibold text-pf-text">
          See your store as <GradientWord>pages</GradientWord>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-pf-body text-pf-muted">
          Describe what you sell. Get a home page, a product page and everything
          around them back as real mockups — then send them straight into the
          PageFly editor.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3">
          {/* The same sparkle the Create button carries at the end of the
              brief, in the same place on the right. A visitor meets the mark
              here and presses it again three screens later; two different
              treatments of one action is two actions as far as anyone can
              tell. */}
          <Link href="/design" className="inline-flex items-center gap-2 rounded-pf-md bg-pf-primary px-6 py-3.5 text-[15px] font-semibold text-white shadow-pf-button transition-colors duration-150 hover:bg-pf-primary-hi">
            Design now
            <Icon name="Sparkles" size={17} />
          </Link>
          {/* The refusal sits here rather than replacing the line below it: the
              merchant arrived on a link we sent, and "not on the list" is the
              whole answer they need — the invitation to sign in by hand stays,
              because a different store of theirs might be on it. */}
          {linkSignIn === "refused" && linkError && (
            <p
              role="alert"
              className="flex max-w-[380px] items-start gap-1.5 text-center text-[12.5px] font-semibold text-pf-danger"
            >
              <span className="mt-px shrink-0">
                <Icon name="CircleAlert" size={13} />
              </span>
              {linkError}
            </p>
          )}
          <span className="text-[12.5px] text-pf-faint">
            Sign in with your store domain — nothing to install.
          </span>
        </div>
      </section>

      <Showcase pages={pages} />
      <HowItWorks />

      {/* The counts and the closing ask are ONE band now. Apart, they were two
          quiet sections doing the same job — persuade — separated by a rule
          that belonged to neither, and the wash behind the first had a hard top
          edge cutting across the page. Together they are a single closing
          argument: what it has done, then what you do next. */}
      <section className="relative px-5 pb-24 pt-16 text-center sm:pt-24">
        <Aura variant="horizon" />
        <Counts />
        <div className="mx-auto mt-16 max-w-3xl">
        <h2 className="font-display text-pf-h2 font-semibold text-pf-text">
          Your turn
        </h2>
        <p className="mx-auto mt-3 max-w-lg text-pf-body text-pf-muted">
          Four answers is all it needs. The first build takes about two minutes.
        </p>
        <Link href="/design" className="mt-7 inline-flex items-center gap-2 rounded-pf-md bg-pf-primary px-6 py-3.5 text-[15px] font-semibold text-white shadow-pf-button transition-colors duration-150 hover:bg-pf-primary-hi">
          Design now
          <Icon name="Sparkles" size={17} />
        </Link>
        </div>
      </section>

      <footer className="border-t border-pf-border px-5 py-8 text-center text-[12.5px] text-pf-faint">
        PageFly Design
      </footer>
    </main>
  );
}
