"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { useState } from "react";
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

            <p className="mt-4 text-center text-[11.5px] text-pf-faint">
              Not on the list? Contact support to request beta access.
            </p>
          </motion.div>
        </main>
      </div>
    </div>
  );
}
