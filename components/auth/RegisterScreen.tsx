"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { InstallPageFlyButton } from "../pagefly/InstallPageFly";
import { EV, track } from "@/lib/analytics";
import type { RegisterResponse } from "@/app/api/auth/register/route";
import {
  emailProblem,
  storeDomainProblem,
  storeNameProblem,
  type FieldProblem,
} from "@/lib/storeForm";
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

  /* ==========================================================================
     TOUCHED PER FIELD, CHECKED ON THE WAY OUT OF IT.

     A form that says nothing until Register is pressed makes the merchant fill
     in all three, press, and only then learn the first one was wrong — and it
     reports one problem at a time, so a form with two mistakes takes two more
     attempts. Checking as they leave each field tells them while they are
     still looking at it.

     ON BLUR, never while typing. `mystore.myshopify.com` is invalid at every
     keystroke until the last one, and a field that turns red on the first
     letter is a field shouting at someone who is doing it right. Once a field
     HAS been marked wrong the check does run live, so the red clears the
     instant it is fixed rather than making them leave the field again to find
     out.
     ========================================================================== */
  const [touched, setTouched] = useState({
    domain: false,
    name: false,
    email: false,
  });

  const problems = {
    domain: storeDomainProblem(domain),
    name: storeNameProblem(name),
    email: emailProblem(email),
  };
  type FieldName = keyof typeof problems;

  /* An empty field the merchant has not reached yet is not a mistake; it only
     becomes one when they try to submit. So a blur on an untouched EMPTY field
     stays quiet, and `markAll` below is what turns those into errors. */
  const shown = (field: FieldName) => (touched[field] ? problems[field] : null);

  useEffect(() => {
    track(EV.registerViewed);
  }, []);

  /* The success screen has no address of its own, so it is announced when the
     state reaches it rather than on a route change. Compared with the count of
     `design_register_submitted result=success` it says whether anybody is
     falling over between the answer arriving and the screen drawing. */
  useEffect(() => {
    if (state === "done") track(EV.registeredViewed);
  }, [state]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (state === "sending") return;

    /* Every field is marked at once here, so a merchant who tabbed straight to
       the button sees all of the problems rather than the first one. The route
       runs the same checks again on what arrives — a browser check is a
       courtesy to whoever is typing, never a gate. See lib/storeForm.ts. */
    setTouched({ domain: true, name: true, email: true });
    if (problems.domain || problems.name || problems.email) {
      /* EVERY FIELD THAT IS WRONG, not the first one. People fail more than
         one box at a time, and reporting only the first would make `domain`
         win every time simply because it is the box at the top — which is the
         opposite of the question, "which box stops people". */
      track(EV.registerSubmitted, {
        result: "validation_error",
        /* The domain rides along so the tile opens into a list of stores
           rather than a list of counts — same reason as the sign-in event.
           Only when the domain box itself is not the thing that failed: a
           refused domain is by definition not one. */
        ...(problems.domain ? {} : { domain: domain.trim().toLowerCase() }),
        error_field: [
          problems.domain ? "domain" : null,
          problems.name ? "store_name" : null,
          problems.email ? "email" : null,
        ].filter((f): f is string => f !== null),
      });
      return;
    }

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

      track(EV.registerSubmitted, {
        result: body.ok ? "success" : res.status >= 500 || res.status === 503 ? "server_error" : "validation_error",
        domain: domain.trim().toLowerCase(),
        ...(body.ok ? {} : { status: res.status }),
      });

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

  /* Editing anything clears the refusal. A red border that survives the fix is
     a form arguing with someone who has already corrected it. */
  /* The SERVER's refusal, cleared on the next edit. A "this store is already
     registered" that outlives the domain it was about is a form arguing with
     someone who has already changed it. The per-field messages are not cleared
     here — they are derived from the value itself, so they go when it is
     right. */
  const onEdit = () => {
    if (state === "failed") {
      setState("idle");
      setMessage(null);
      setHint(null);
    }
  };

  const onLeave = (field: FieldName) => () => {
    /* Quiet about a field they have not filled in yet — see `shown`. */
    const value = { domain, name, email }[field];
    if (!value.trim() && !touched[field]) return;
    setTouched((was) => ({ ...was, [field]: true }));
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
        {/* Right of the logo, which is all these headers carry. */}
        <InstallPageFlyButton size="sm" surface="topbar_register" />
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
                      onEdit={onEdit}
                      placeholder="mystore.myshopify.com"
                      problem={shown("domain")}
                      onBlur={onLeave("domain")}
                      autoFocus
                      // No type="url": a merchant types the domain with no
                      // scheme and the browser would reject it as invalid
                      // before this code ever saw it.
                      inputMode="url"
                      autoComplete="url"
                      /* THE WAY OUT for someone who has no store to name yet.
                         This field is the one that can stop a visitor dead —
                         they cannot invent a .myshopify.com address, so
                         without this the only honest thing they can do is
                         close the tab.

                         A NEW TAB, deliberately. They are three fields into a
                         form; navigating away in place loses what they have
                         typed and they come back to an empty one, if they come
                         back. `rel` is not optional with `target="_blank"` —
                         without `noopener` the opened page gets a handle on
                         this one through `window.opener`. */
                      footer={
                        <a
                          href="https://shopify.pxf.io/DWmaZb"
                          target="_blank"
                          rel="noopener noreferrer"
                          /* How many arrivals are not Shopify merchants at
                             all — which is a reading of the keywords, not of
                             the form. */
                          onClick={() => track(EV.shopifySignupClicked)}
                          className="rounded-pf-sm font-semibold text-pf-primary-hi underline underline-offset-2 hover:text-pf-text focus:outline-none focus-visible:ring-2 focus-visible:ring-pf-primary-hi"
                        >
                          Create a Shopify account
                        </a>
                      }
                    />
                    <Field
                      label="Store name"
                      value={name}
                      onChange={setName}
                      onEdit={onEdit}
                      placeholder="Cloudloft"
                      problem={shown("name")}
                      onBlur={onLeave("name")}
                      autoComplete="organization"
                    />
                    <Field
                      label="Email"
                      value={email}
                      onChange={setEmail}
                      onEdit={onEdit}
                      placeholder="you@yourstore.com"
                      problem={shown("email")}
                      onBlur={onLeave("email")}
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

                    {/* NOT disabled on an incomplete form. A greyed-out button
                        with nothing saying why is a dead end — the merchant
                        cannot tell whether the form is broken or they are.
                        Pressing it marks every field, which is what puts the
                        reason under each one. */}
                    <Button
                      type="submit"
                      size="lg"
                      disabled={state === "sending"}
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
          onClick={() => {
            track(EV.signinReturnClicked);
            window.location.assign("/design/login");
          }}
        >
          Go to sign in
        </Button>
      </Panel>
    </div>
  );
}

/* ---- one labelled input -------------------------------------------------- */

/**
 * One labelled input that carries its own verdict.
 *
 * The message sits under the field it belongs to rather than in a box at the
 * bottom of the form. Three inputs and one shared box makes the merchant work
 * out which of them it meant, and it can only ever report one problem — so a
 * form with two mistakes costs two round trips to discover.
 */
function Field({
  label,
  value,
  onChange,
  onEdit,
  placeholder,
  problem,
  footer,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onEdit: () => void;
  placeholder: string;
  problem: FieldProblem;
  /** An optional line under the input — a way out for someone this field
      cannot be answered by. Sits below the problem, so a refusal is still the
      first thing read. */
  footer?: React.ReactNode;
  /* The ones this component owns are omitted from the passthrough, or they
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
        aria-invalid={Boolean(problem)}
        /* Points at the message below, so a screen reader reads the reason with
           the field rather than leaving "invalid" unexplained. */
        aria-describedby={problem ? `${label}-problem` : undefined}
        autoCapitalize="off"
        spellCheck={false}
        className={`h-11 w-full rounded-pf-md border bg-pf-bg-deep px-3 text-[14px] text-pf-text outline-none transition-colors placeholder:text-pf-faint focus:border-pf-primary-hi ${
          problem ? "border-pf-danger/60" : "border-pf-border"
        }`}
        {...rest}
      />
      {problem && (
        <motion.span
          id={`${label}-problem`}
          initial={{ opacity: 0, y: -3 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-1.5 text-[11.5px] text-pf-danger"
        >
          <span className="mt-px shrink-0">
            <Icon name="CircleAlert" size={12} />
          </span>
          <span>
            {problem.error}
            {problem.hint && (
              <span className="text-pf-muted"> {problem.hint}</span>
            )}
          </span>
        </motion.span>
      )}
      {footer && (
        <span className="text-[11.5px] text-pf-faint">{footer}</span>
      )}
    </label>
  );
}
