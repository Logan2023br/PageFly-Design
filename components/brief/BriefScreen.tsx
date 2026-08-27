"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useStore } from "@/lib/store";
import { GradientWord } from "../ui";
import { ImageUpload } from "./ImageUpload";
import { MarketPicker } from "./MarketPicker";
import { ModeToggle } from "./ModeToggle";
import { PagePicker } from "./PagePicker";
import { PromptField } from "./PromptField";
import { SellInput } from "./SellInput";
import { StickyBar } from "./StickyBar";
import { StoreTypePicker } from "./StoreTypePicker";
import { StylePicker } from "./StylePicker";

export function BriefScreen() {
  const quick = useStore((s) => s.mode) === "quick";

  return (
    <motion.div
      key="brief"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -18, filter: "blur(3px)" }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
    >
      <header className="relative mx-auto max-w-3xl px-1 pb-7 pt-3 text-center sm:pb-10 sm:pt-6">
        <h1 className="font-display text-pf-hero font-semibold text-pf-text">
          See your store as <GradientWord>pages</GradientWord>
        </h1>
        <p className="mx-auto mt-4 max-w-md text-pf-body text-pf-muted">
          {quick
            ? "One prompt, and the pages you want. Every page comes back as a mockup."
            : "Four answers, three optional. Every page comes back as a mockup."}
        </p>
      </header>

      <div className="mx-auto grid max-w-5xl gap-4">
        {/* Which brief is being filled in, above the brief. Placed here rather
            than in the top bar because it changes THIS form, and a control that
            reshapes the page below it belongs to the page. */}
        <div className="pb-2">
          <ModeToggle />
        </div>

        {/* Above the numbered steps rather than inside them. Where a merchant
            sells frames every answer below it — the language, what the page has
            to promise — and it is the one question they can skip. */}
        <MarketPicker />

        {/* The one field quick mode DOES ask for, and it is the prompt rather
            than the trade. A merchant describing colours and the sections they
            want has told us what they sell on the way past; asked for the trade
            in a 120-character box first, they answer "mugs" and stop. The card
            reads differently in each mode — see `PromptField`. */}
        {quick && <PromptField />}

        {/* Build Quickly hides these five (brand colours ride inside the style
            card). The first three are read out of the prompt by a model before
            the build starts (see `lib/quickBrief.ts`); references go unasked,
            exactly as they do today when a merchant skips them.
            `AnimatePresence` because the pages card below moves a long way when
            they leave, and a jump of that size reads as a different screen
            rather than the same one with less on it. */}
        <AnimatePresence initial={false} mode="popLayout">
          {!quick && (
            <motion.div
              key="detail-only"
              layout
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="grid gap-4"
            >
              <SellInput />
              <StylePicker />
              <StoreTypePicker />
              <PromptField />
              <ImageUpload />
            </motion.div>
          )}
        </AnimatePresence>

        <PagePicker />
      </div>

      <StickyBar />
    </motion.div>
  );
}
