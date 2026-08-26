"use client";

import { useEffect, useRef } from "react";
import {
  MAX_PROMPT_CHARS,
  PROMPT_PLACEHOLDER,
  PROMPT_SNIPPETS,
} from "@/lib/briefOptions";
import { useStore } from "@/lib/store";
import { Chip, Counter, SectionCard } from "../ui";

/* ---- the field itself --------------------------------------------------- */

export function PromptField() {
  const prompt = useStore((s) => s.draft.prompt);
  const setPrompt = useStore((s) => s.setPrompt);
  const appendPrompt = useStore((s) => s.appendPrompt);
  const ref = useRef<HTMLTextAreaElement>(null);

  // Auto-grow: keep the box exactly as tall as its content, from 6 rows up.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 104)}px`;
  }, [prompt]);

  return (
    <SectionCard
      id="pfd-prompt"
      eyebrow="Step 4 · optional"
      title="Anything else?"
      help="The more specific, the less generic the mockups."
      aside={<Counter value={prompt.length} max={MAX_PROMPT_CHARS} />}
    >
      <div className="grid gap-3.5">
        <textarea
          ref={ref}
          value={prompt}
          rows={4}
          maxLength={MAX_PROMPT_CHARS}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={PROMPT_PLACEHOLDER}
          aria-label="Describe your store in detail"
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
