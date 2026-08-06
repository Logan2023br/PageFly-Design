"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import type { SyncResponse } from "@/app/api/admin/sync/route";
import { Button, Icon, Panel } from "../ui";

/* ==========================================================================
   Load the allowlist by pasting it.

   The sheet is private and holds merchant email addresses, so the two clean
   options — a service account, or an n8n push — both need setting up first. This
   needs nothing: select the rows in Google Sheets, copy, paste, done. It is the
   difference between the beta being testable today and being testable after a
   Google Cloud project exists.

   The same parser handles it as the pull path, so a paste and a fetch cannot
   produce different records from the same rows.
   ========================================================================== */

export function PasteSheet() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const submit = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setResult(null);
    setFailed(false);
    try {
      const res = await fetch("/api/admin/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csv: text }),
      });
      const body = (await res.json()) as SyncResponse;
      if (body.ok) {
        setResult(`${body.stores} store${body.stores === 1 ? "" : "s"} loaded`);
        setText("");
        // The table on screen was rendered before this.
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
        Paste the sheet instead
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
              <p className="text-[12.5px] leading-relaxed text-pf-muted">
                Select the rows in Google Sheets — including the header row — copy,
                and paste here. Tab-separated and CSV both work. Existing stores
                are updated; sign-in history and saved pages are never touched.
              </p>

              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={7}
                spellCheck={false}
                placeholder={
                  "Store Domain\tEmail\tTên store\tShopify Plan\t…\nmystore.myshopify.com\tyou@example.com\tMy Store\tGrow\t…"
                }
                className="w-full resize-y rounded-pf-md border border-pf-border bg-pf-bg-deep px-3 py-2 font-mono text-[11.5px] leading-relaxed text-pf-text outline-none transition-colors placeholder:text-pf-faint focus:border-pf-primary-hi"
              />

              <div className="flex flex-wrap items-center justify-between gap-2">
                {result ? (
                  <span
                    className={`text-[11.5px] ${failed ? "text-pf-danger" : "text-pf-success"}`}
                  >
                    {result}
                  </span>
                ) : (
                  <span className="text-[11.5px] text-pf-faint">
                    {text.trim()
                      ? `${text.trim().split(/\r?\n/).length - 1} data row(s)`
                      : "Header row first"}
                  </span>
                )}
                <Button
                  size="sm"
                  disabled={busy || !text.trim()}
                  onClick={() => void submit()}
                >
                  {busy ? "Loading…" : "Load stores"}
                </Button>
              </div>
            </Panel>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
