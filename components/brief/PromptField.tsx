"use client";

import { useEffect, useRef } from "react";
import {
  MAX_PROMPT_CHARS,
  PROMPT_PLACEHOLDER,
  PROMPT_SNIPPETS,
  QUICK_PROMPT_PLACEHOLDER,
} from "@/lib/briefOptions";
import { useStore } from "@/lib/store";
import { Chip, Counter, SectionCard } from "../ui";
import { PromptExampleButton } from "./PromptExample";

/* ---- the field itself --------------------------------------------------- */

export function PromptField() {
  /**
   * The same 3,000 characters, asked for twice over.
   *
   * In Build Detail this is the last optional field: everything important has
   * its own card and this is where the rest goes. In Build Quickly it is the
   * ONLY thing the merchant writes, so it is Step 1, it is required, and it has
   * to say out loud what the cards it replaced used to ask — otherwise the
   * merchant answers the question the title asks, which is "anything else?",
   * and leaves out the trade and the colours entirely.
   */
  const quick = useStore((s) => s.mode) === "quick";
  const prompt = useStore((s) => s.draft.prompt);
  const setPrompt = useStore((s) => s.setPrompt);
  const appendPrompt = useStore((s) => s.appendPrompt);
  const ref = useRef<HTMLTextAreaElement>(null);

  /* Auto-grow: keep the box exactly as tall as its content. Taller from the
     start in quick mode — a six-line answer typed into a four-line box scrolls
     out of sight as it is written, and this is the field that most needs a
     merchant to keep going. */
  const minHeight = quick ? 168 : 104;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, minHeight)}px`;
  }, [prompt, minHeight]);

  return (
    <SectionCard
      id="pfd-prompt"
      eyebrow={quick ? "Step 1" : "Step 4 · optional"}
      /* Against the eyebrow rather than under the field: it is a control for
         the whole section, and a merchant looks for help beside the label that
         names the section, not after the box they have not filled in yet. */
      eyebrowAction={<PromptExampleButton />}
      title={quick ? "What should we build?" : "Anything else?"}
      /* Both modes say the same thing now, and it is an instruction rather than
         an aphorism. "The more specific, the less generic" is true and gives a
         merchant nothing to do; the example gives them the structure, so the
         help line's whole job is to send them to it. */
      help="Please click the Example button to write yours in the right structure."
      aside={<Counter value={prompt.length} max={MAX_PROMPT_CHARS} />}
    >
      <div className="grid gap-3.5">
        <textarea
          ref={ref}
          value={prompt}
          rows={quick ? 7 : 4}
          maxLength={MAX_PROMPT_CHARS}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={quick ? QUICK_PROMPT_PLACEHOLDER : PROMPT_PLACEHOLDER}
          aria-label={
            quick ? "Describe the pages you want built" : "Describe your store in detail"
          }
          className="w-full resize-none rounded-pf-md border border-pf-border bg-pf-bg-deep p-4 text-[14px] leading-relaxed text-pf-text transition-colors placeholder:text-pf-faint hover:border-pf-border-hi focus:border-pf-primary-hi focus:outline-none"
        />

        <div className="flex flex-wrap gap-2">
          {PROMPT_SNIPPETS.map((s) => (
            <Chip
              key={s.id}
              icon={s.icon}
              onClick={() => appendPrompt(s.snippet)}
              disabled={prompt.includes(s.snippet)}
              title={
                prompt.includes(s.snippet)
                  ? "Already added"
                  : "Adds an example line you can edit"
              }
            >
              {s.label}
            </Chip>
          ))}
        </div>
      </div>
    </SectionCard>
  );
}
