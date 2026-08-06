"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import type { AdminAuthResponse } from "@/app/api/auth/admin/route";
import { Button, Eyebrow, Icon, Panel } from "../ui";

/* ==========================================================================
   Admin sign-in. Credentials are checked on the server — nothing here knows
   what the right answer is.
   ========================================================================== */

export function AdminLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/admin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const body = (await res.json()) as AdminAuthResponse;
      if (body.ok) {
        // Full reload: the page is server-rendered from the new cookie.
        window.location.reload();
        return;
      }
      setError(body.error);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      translate="no"
      className="notranslate pfd-root relative min-h-screen overflow-x-clip"
    >
      <div aria-hidden className="pfd-glow absolute inset-x-0 top-0 h-[620px]" />
      <div aria-hidden className="pfd-grid absolute inset-x-0 top-0 h-[620px]" />

      <div className="relative mx-auto grid min-h-screen w-full max-w-[1600px] place-items-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-[400px]"
        >
          <div className="grid gap-2 text-center">
            <span className="mx-auto grid size-9 place-items-center rounded-pf-md bg-pf-primary text-white">
              <Icon name="ShieldCheck" size={17} />
            </span>
            <Eyebrow>Internal</Eyebrow>
            <h1 className="font-display text-[26px] font-bold tracking-[-0.03em] text-pf-text">
              PageFly Design Admin
            </h1>
          </div>

          <Panel className="mt-5 p-4 sm:p-5">
            <form onSubmit={submit} className="grid gap-3">
              <label className="grid gap-1.5">
                <span className="text-[12px] font-semibold text-pf-body">
                  Username
                </span>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  autoCapitalize="off"
                  spellCheck={false}
                  autoFocus
                  className="h-11 w-full rounded-pf-md border border-pf-border bg-pf-bg-deep px-3 text-[14px] text-pf-text outline-none transition-colors focus:border-pf-primary-hi"
                />
              </label>

              <label className="grid gap-1.5">
                <span className="text-[12px] font-semibold text-pf-body">
                  Password
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="h-11 w-full rounded-pf-md border border-pf-border bg-pf-bg-deep px-3 text-[14px] text-pf-text outline-none transition-colors focus:border-pf-primary-hi"
                />
              </label>

              {error && (
                <p
                  role="alert"
                  className="flex items-start gap-2 rounded-pf-md border border-pf-danger/35 bg-pf-danger/10 px-3 py-2.5 text-[12.5px] font-semibold text-pf-danger"
                >
                  <span className="mt-px shrink-0">
                    <Icon name="CircleAlert" size={14} />
                  </span>
                  {error}
                </p>
              )}

              <Button
                type="submit"
                size="lg"
                disabled={busy || !username || !password}
                className="w-full"
              >
                {busy ? "Checking…" : "Sign in"}
              </Button>
            </form>
          </Panel>
        </motion.div>
      </div>
    </div>
  );
}
