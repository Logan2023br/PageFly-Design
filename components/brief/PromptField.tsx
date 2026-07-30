"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import {
  MAX_BRAND_COLORS,
  MAX_PROMPT_CHARS,
  PROMPT_PLACEHOLDER,
  PROMPT_SNIPPETS,
} from "@/lib/briefOptions";
import { isValidHex } from "@/lib/styleTokens";
import { useStore } from "@/lib/store";
import { Chip, Counter, Icon, InlineError, SectionCard } from "../ui";

/* ---- brand colors ------------------------------------------------------- */

function BrandColors() {
  const colors = useStore((s) => s.draft.brandColors);
  const addColor = useStore((s) => s.addColor);
  const removeColor = useStore((s) => s.removeColor);

  const pickerRef = useRef<HTMLInputElement>(null);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const full = colors.length >= MAX_BRAND_COLORS;

  const commit = (value: string) => {
    if (!value.trim()) return;
    if (!isValidHex(value)) {
      setError("That isn't a hex code. Try something like #6B2FF7.");
      return;
    }
    if (!addColor(value)) {
      setError(
        full
          ? `That's the maximum of ${MAX_BRAND_COLORS} colors.`
          : "You've already added that color.",
      );
      return;
    }
    setTyped("");
    setError(null);
  };

  return (
    <div className="grid gap-3 rounded-pf-md border border-pf-border bg-pf-bg-deep/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12px] font-semibold text-pf-body">
          Brand colors
        </span>
        <span className="text-[11.5px] text-pf-faint">
          {colors.length}/{MAX_BRAND_COLORS}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <AnimatePresence mode="popLayout">
          {colors.map((hex) => (
            <motion.span
              key={hex}
              layout
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ type: "spring", stiffness: 500, damping: 32 }}
              className="group inline-flex items-center gap-2 rounded-pf-pill border border-pf-border py-1.5 pl-1.5 pr-1"
            >
              <span
                className="size-6 rounded-full"
                style={{
                  background: hex,
                  outline: "1px solid rgba(255,255,255,.18)",
                }}
              />
              <code className="font-mono-pf text-[12px] uppercase text-pf-body">
                {hex}
              </code>
              <button
                type="button"
                onClick={() => removeColor(hex)}
                aria-label={`Remove ${hex}`}
                className="grid size-5 place-items-center rounded-full text-pf-faint transition-colors hover:bg-pf-card hover:text-pf-danger"
              >
                <Icon name="X" size={12} />
              </button>
            </motion.span>
          ))}
        </AnimatePresence>

        <button
          type="button"
          disabled={full}
          onClick={() => pickerRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-pf-pill border border-dashed border-pf-border-hi px-3.5 py-2 text-[12.5px] font-medium text-pf-muted transition-colors hover:border-pf-primary-hi hover:text-pf-body disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Icon name="Plus" size={13} />
          Add color
        </button>

        {/* Native color picker — hidden, opened by the button above. */}
        <input
          ref={pickerRef}
          type="color"
          className="sr-only"
          aria-label="Choose a brand color"
          onChange={(e) => commit(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={typed}
          disabled={full}
          onChange={(e) => {
            setTyped(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit(typed);
            }
          }}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            const found = text.match(/#?[0-9a-f]{6}\b/gi);
            if (found && found.length > 0) {
              e.preventDefault();
              found.slice(0, MAX_BRAND_COLORS).forEach((h) => commit(h));
            }
          }}
          placeholder="or paste a hex code"
          aria-label="Paste a hex code"
          className="h-9 w-[190px] rounded-pf-sm border border-pf-border bg-transparent px-3 font-mono-pf text-[12.5px] text-pf-text placeholder:text-pf-faint focus:border-pf-primary-hi focus:outline-none disabled:opacity-40"
        />
        {typed && (
          <button
            type="button"
            onClick={() => commit(typed)}
            className="text-[12.5px] font-semibold text-pf-primary-hi hover:underline"
          >
            Add
          </button>
        )}
      </div>

      <AnimatePresence>
        {error && (
          <InlineError onDismiss={() => setError(null)}>{error}</InlineError>
        )}
      </AnimatePresence>
    </div>
  );
}

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

        <BrandColors />

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
