"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { InstallPageFlyButton } from "../pagefly/InstallPageFly";
import { EV, track } from "@/lib/analytics";
import type { StoreAuthResponse } from "@/app/api/auth/store/route";
import { Button, Eyebrow, GradientWord, Icon, Panel } from "../ui";

/* ==========================================================================
   Sign in with a store domain.

   Same shell, glow and type scale as the brief screen — this is the first thing
   a merchant sees, so it has to read as the same product rather than as a gate
   bolted on the front.
   ========================================================================== */

type State = "idle" | "checking" | "denied" | "granted";

export function LoginScreen({ next }: { next: string }) {
  const [domain, setDomain] = useState("");
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  /* The second denominator, and the one that says where traffic went. Compared
     against `design_landing_viewed` it is the whole of "people pressed the CTA
     and then what". */
  useEffect(() => {
    track(EV.signinViewed);
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (state === "checking" || !domain.trim()) return;

    setState("checking");
    setMessage(null);
    setHint(null);

    try {
      const res = await fetch("/api/auth/store", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domain }),
      });

      /* A crashed route answers with an HTML error page, and res.json() throws on
         it. Left in the outer catch, that surfaced as "could not reach the
         server" for a server that had very much answered — the single most
         misleading thing this form could say. */
      let body: StoreAuthResponse;
      try {
        body = (await res.json()) as StoreAuthResponse;
      } catch {
        setState("denied");
        setMessage(`The server returned an error (${res.status}).`);
        setHint("Check /api/health for what is missing.");
        return;
      }

      /* ==========================================================================
         ONE EVENT, THREE — NOT TWO — OUTCOMES.

         The brief named `success`, `not_registered` and `invalid_format`. The
         route also answers 503: the store list could not be reached, or this
         deployment is not finished being set up. Filing that under
         `invalid_format` would read as "the user typed rubbish" about an
         outage of ours, and the number it lands in is the one meant to show
         whether the ads are bringing people who know what Shopify is.
         ========================================================================== */
      const result = body.ok
        ? "success"
        : res.status === 503
          ? "server_error"
          : res.status === 403
            ? "not_registered"
            : "invalid_format";
      track(EV.signinSubmitted, { result });

      if (body.ok) {
        setState("granted");
        /* Full navigation, not router.push: the destination is behind the proxy
           guard, which reads the cookie the browser has only just been given. */
        window.location.assign(next);
        return;
      }

      setState("denied");
      setMessage(body.error);
      setHint(body.hint ?? null);
    } catch {
      setState("denied");
      setMessage("Could not reach the server. Check your connection and try again.");
    }
  };

  return (
    <div
      translate="no"
      className="notranslate pfd-root relative min-h-screen overflow-x-clip"
    >
      <div aria-hidden className="pfd-glow absolute inset-x-0 top-0 h-[720px]" />
      <div aria-hidden className="pfd-grid absolute inset-x-0 top-0 h-[720px]" />

      <div className="relative mx-auto w-full max-w-[1600px] px-4 pb-8 pt-4 sm:px-6 sm:pt-6">
        <header className="flex items-center gap-2 border-b border-pf-border pb-3.5">
          {/* A link home, because a logo that does nothing is the one control
              every visitor tries first — and on THIS screen they are more likely
              to try it than anywhere else: a sign-in wall is exactly where
              someone with no account goes looking for the way back out.
              `/` needs no session, so it works signed in or out. */}
          <Link
            href="/"
            className="flex items-center gap-2 rounded-pf-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-pf-primary-hi"
          >
            <Image
              src="/pagefly-icon.png"
              alt="PageFly Design — home"
              width={28}
              height={28}
              className="size-7 rounded-pf-sm"
              priority
            />
            <span className="font-display text-[15px] font-semibold tracking-[-0.02em] text-pf-text">
              PageFly <span className="text-pf-muted">Design</span>
            </span>
          </Link>
        {/* Right of the logo, which is all these headers carry. */}
        <InstallPageFlyButton size="sm" surface="topbar_login" />
        </header>

        <main className="grid place-items-center px-2 pt-[9vh] sm:pt-[12vh]">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-[460px]"
          >
            <div className="grid gap-2 text-center">
              <Eyebrow>Beta access</Eyebrow>
              <h1 className="font-display text-[30px] font-bold leading-[1.1] tracking-[-0.03em] text-pf-text sm:text-[38px]">
                See your store as <GradientWord>pages</GradientWord>
              </h1>
              <p className="mx-auto max-w-[380px] text-[13.5px] leading-relaxed text-pf-muted">
                Enter your store domain to continue. Access is limited to stores
                on the beta list.
              </p>
            </div>

            <Panel className="mt-6 p-4 sm:p-5">
              <form onSubmit={submit} className="grid gap-3.5" noValidate>
                <label className="grid gap-1.5">
                  <span className="text-[12px] font-semibold text-pf-body">
                    Store domain
                  </span>
                  <input
                    value={domain}
                    onChange={(e) => {
                      setDomain(e.target.value);
                      if (state === "denied") setState("idle");
                    }}
                    // No type="url": a merchant types "mystore.myshopify.com"
                    // without a scheme, and the browser would reject it as
                    // invalid before this code ever sees it.
                    inputMode="url"
                    autoComplete="url"
                    autoCapitalize="off"
                    spellCheck={false}
                    autoFocus
                    placeholder="mystore.myshopify.com"
                    aria-invalid={state === "denied"}
                    aria-describedby={message ? "login-error" : undefined}
                    className={`h-11 w-full rounded-pf-md border bg-pf-bg-deep px-3 text-[14px] text-pf-text outline-none transition-colors placeholder:text-pf-faint focus:border-pf-primary-hi ${
                      state === "denied" ? "border-pf-danger/60" : "border-pf-border"
                    }`}
                  />
                </label>

                {message && (
                  <motion.div
                    id="login-error"
                    role="alert"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-start gap-2 rounded-pf-md border border-pf-danger/35 bg-pf-danger/10 px-3 py-2.5"
                  >
                    <span className="mt-px text-pf-danger">
                      <Icon name="CircleAlert" size={14} />
                    </span>
                    <div className="grid gap-0.5">
                      <p className="text-[12.5px] font-semibold text-pf-danger">
                        {message}
                      </p>
                      {hint && (
                        <p className="text-[11.5px] text-pf-muted">{hint}</p>
                      )}
                    </div>
                  </motion.div>
                )}

                <Button
                  type="submit"
                  size="lg"
                  disabled={state === "checking" || !domain.trim()}
                  iconRight={state === "granted" ? "CircleCheck" : "ArrowRight"}
                  className="w-full"
                >
                  {state === "checking"
                    ? "Checking…"
                    : state === "granted"
                      ? "Signed in"
                      : "Continue"}
                </Button>
              </form>
            </Panel>

            {/* The way OUT of this screen for someone who has no account yet.
                It used to read "Contact support to request beta access", which
                names no action a visitor can take on their own — they close the
                tab. A link to a form is the same sentence with somewhere to go. */}
            <p className="mt-4 text-center text-[11.5px] text-pf-faint">
              If you don&rsquo;t have an account yet, please{" "}
              <Link
                href="/design/register"
                /* The gap between this and `not_registered` is the cost of
                   asking people to register on a second screen — how many were
                   turned away and did not come back. */
                onClick={() => track(EV.registerLinkClicked)}
                className="rounded-pf-sm font-semibold text-pf-primary-hi underline underline-offset-2 hover:text-pf-text focus:outline-none focus-visible:ring-2 focus-visible:ring-pf-primary-hi"
              >
                register
              </Link>
              .
            </p>
          </motion.div>
        </main>
      </div>
    </div>
  );
}
