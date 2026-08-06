"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import type { StoresResponse } from "@/app/api/admin/stores/route";
import { Button, Icon, Panel } from "../ui";

/* ==========================================================================
   Add one store to the allowlist.

   Pasting the sheet loads the whole list; this is for the far more common case of
   admitting a single tester. It writes to the database, so the change is live for
   every instance immediately and survives a redeploy.
   ========================================================================== */

export function AddStore() {
  const [open, setOpen] = useState(false);
  const [domain, setDomain] = useState("");
  const [storeName, setStoreName] = useState("");
  const [email, setEmail] = useState("");
  const [pageLimit, setPageLimit] = useState("30");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const submit = async () => {
    if (!domain.trim() || busy) return;
    setBusy(true);
    setResult(null);
    setFailed(false);
    try {
      const res = await fetch("/api/admin/stores", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          domain,
          storeName: storeName.trim() || undefined,
          email: email.trim() || undefined,
          pageLimit: Number(pageLimit) || undefined,
        }),
      });
      const body = (await res.json()) as StoresResponse;
      if (body.ok) {
        setResult(`${body.domain} can now sign in`);
        setDomain("");
        setStoreName("");
        setEmail("");
        setTimeout(() => window.location.reload(), 800);
      } else {
        setFailed(true);
        setResult(body.error);
      }
    } catch {
      setFailed(true);
      setResult("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-fit items-center gap-1.5 text-[12.5px] font-semibold text-pf-muted transition-colors hover:text-pf-text"
      >
        <Icon name={open ? "ChevronDown" : "ChevronRight"} size={14} />
        Add a store
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <Panel className="grid gap-3 p-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field
                  label="Store domain"
                  value={domain}
                  onChange={setDomain}
                  placeholder="mystore.myshopify.com"
                  autoFocus
                />
                <Field
                  label="Store name"
                  value={storeName}
                  onChange={setStoreName}
                  placeholder="optional"
                />
                <Field
                  label="Email"
                  value={email}
                  onChange={setEmail}
                  placeholder="optional"
                />
                <Field
                  label="Page limit"
                  value={pageLimit}
                  onChange={setPageLimit}
                  placeholder="30"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                {result ? (
                  <span
                    className={`text-[11.5px] ${failed ? "text-pf-danger" : "text-pf-success"}`}
                  >
                    {result}
                  </span>
                ) : (
                  <span className="text-[11.5px] text-pf-faint">
                    Saved to the database — live everywhere, and it survives a
                    redeploy.
                  </span>
                )}
                <Button
                  size="sm"
                  disabled={busy || !domain.trim()}
                  onClick={() => void submit()}
                >
                  {busy ? "Adding…" : "Add store"}
                </Button>
              </div>
            </Panel>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[11.5px] font-semibold text-pf-body">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoCapitalize="off"
        spellCheck={false}
        className="h-9 w-full rounded-pf-md border border-pf-border bg-pf-bg-deep px-2.5 text-[13px] text-pf-text outline-none transition-colors placeholder:text-pf-faint focus:border-pf-primary-hi"
      />
    </label>
  );
}
