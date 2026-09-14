"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { RegisterResponse } from "@/app/api/auth/register/route";
import { Button, Eyebrow, GradientWord, Icon, Panel } from "../ui";

/* ==========================================================================
   Ask for an account.

   The same shell, glow and type scale as the sign-in screen, because it IS the
   sign-in screen with three fields instead of one — a visitor who follows the
   link from there should not feel they have left the product.

   REGISTERING DOES NOT SIGN ANYONE IN. The route writes a row and stops, so
   this screen ends by sending them back to the form rather than to /design.
   Two acts, and the gate stays the gate: see the long comment on
   /api/auth/register.
   ========================================================================== */

type State = "idle" | "sending" | "failed" | "done";

export function RegisterScreen() {
  const [domain, setDomain] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const filled = domain.trim() && name.trim() && email.trim();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (state === "sending" || !filled) return;

    setState("sending");
    setMessage(null);
    setHint(null);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domain, name, email }),
      });

      /* A crashed route answers with an HTML error page and res.json() throws
         on it. Caught here rather than in the outer catch, which would report
         "could not reach the server" for a server that had answered — the same
         trap the sign-in form has a comment about. */
      let body: RegisterResponse;
      try {
        body = (await res.json()) as RegisterResponse;
      } catch {
        setState("failed");
        setMessage(`The server returned an error (${res.status}).`);
        setHint("Check /api/health for what is missing.");
        return;
      }

      if (body.ok) {
        setState("done");
        return;
      }

      setState("failed");
      setMessage(body.error);
      setHint(body.hint ?? null);
    } catch {
      setState("failed");
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
        </header>

        <main className="grid place-items-center px-2 pt-[9vh] sm:pt-[12vh]">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-[460px]"
          >
            {state === "done" ? <Done domain={domain} /> : (
              <>
                <div className="grid gap-2 text-center">
                  <Eyebrow>Register</Eyebrow>
                  <h1 className="font-display text-[30px] font-bold leading-[1.1] tracking-[-0.03em] text-pf-text sm:text-[38px]">
                    Start seeing your store as{" "}
                    <GradientWord>pages</GradientWord>
                  </h1>
                  <p className="mx-auto max-w-[380px] text-[13.5px] leading-relaxed text-pf-muted">
                    Tell us where your store lives and we will set you up with
                    three free pages.
                  </p>
                </div>

                <Panel className="mt-6 p-4 sm:p-5">
                  <form onSubmit={submit} className="grid gap-3.5" noValidate>
                    <Field
                      label="Store domain"
                      value={domain}
                      onChange={setDomain}
                      onEdit={() => state === "failed" && setState("idle")}
                      placeholder="mystore.myshopify.com"
                      invalid={state === "failed"}
                      autoFocus
                      // No type="url": a merchant types the domain with no
                      // scheme and the browser would reject it as invalid
                      // before this code ever saw it.
                      inputMode="url"
                      autoComplete="url"
                    />
                    <Field
                      label="Store name"
                      value={name}
                      onChange={setName}
                      onEdit={() => state === "failed" && setState("idle")}
                      placeholder="Cloudloft"
                      invalid={state === "failed"}
                      autoComplete="organization"
                    />
                    <Field
                      label="Email"
                      value={email}
                      onChange={setEmail}
                      onEdit={() => state === "failed" && setState("idle")}
                      placeholder="you@yourstore.com"
                      invalid={state === "failed"}
                      inputMode="email"
                      autoComplete="email"
                    />

                    {message && (
                      <motion.div
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
                      disabled={state === "sending" || !filled}
                      iconRight="ArrowRight"
                      className="w-full"
                    >
                      {state === "sending" ? "Registering…" : "Register"}
                    </Button>
                  </form>
                </Panel>

                <p className="mt-4 text-center text-[11.5px] text-pf-faint">
                  Already have an account?{" "}
                  <Link
                    href="/design/login"
                    className="rounded-pf-sm font-semibold text-pf-primary-hi underline underline-offset-2 hover:text-pf-text focus:outline-none focus-visible:ring-2 focus-visible:ring-pf-primary-hi"
                  >
                    Sign in
                  </Link>
                  .
                </p>
              </>
            )}
          </motion.div>
        </main>
      </div>
    </div>
  );
}

/**
 * The success state, which is a screen rather than a toast.
 *
 * A merchant who has just filled in three fields needs to be told two things:
 * that it worked, and that there is one more step. A green flash over a form
 * they can still see and still submit says neither clearly.
 */
function Done({ domain }: { domain: string }) {
  return (
    <div className="grid gap-2 text-center">
      <div className="mx-auto grid size-11 place-items-center rounded-full border border-pf-success/40 bg-pf-success/10 text-pf-success">
        <Icon name="CircleCheck" size={20} />
      </div>
      <h1 className="mt-1 font-display text-[26px] font-bold leading-[1.15] tracking-[-0.03em] text-pf-text sm:text-[30px]">
        You&rsquo;re registered
      </h1>
      <p className="mx-auto max-w-[380px] text-[13.5px] leading-relaxed text-pf-muted">
        <span className="text-pf-body">{domain.trim()}</span> has three free
        pages waiting. Sign in with that domain to start.
      </p>

      <Panel className="mt-4 p-4">
        {/* A full navigation rather than a router push. The sign-in screen
            reads the session cookie on the server, and a client-side
            transition would show it a page rendered before this visit. */}
        <Button
          size="lg"
          iconRight="ArrowRight"
          className="w-full"
          onClick={() => window.location.assign("/design/login")}
        >
          Go to sign in
        </Button>
      </Panel>
    </div>
  );
}

/* ---- one labelled input -------------------------------------------------- */

function Field({
  label,
  value,
  onChange,
  onEdit,
  placeholder,
  invalid,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onEdit: () => void;
  placeholder: string;
  invalid: boolean;
  /* The three this component owns are omitted from the passthrough, or they
     collide: `onChange` here takes the VALUE, and the DOM's takes the event. */
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "placeholder">) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[12px] font-semibold text-pf-body">{label}</span>
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          onEdit();
        }}
        placeholder={placeholder}
        aria-invalid={invalid}
        autoCapitalize="off"
        spellCheck={false}
        className={`h-11 w-full rounded-pf-md border bg-pf-bg-deep px-3 text-[14px] text-pf-text outline-none transition-colors placeholder:text-pf-faint focus:border-pf-primary-hi ${
          invalid ? "border-pf-danger/60" : "border-pf-border"
        }`}
        {...rest}
      />
    </label>
  );
}
