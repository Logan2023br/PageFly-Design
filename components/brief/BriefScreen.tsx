"use client";

import { motion } from "framer-motion";
import { GradientWord } from "../ui";
import { ImageUpload } from "./ImageUpload";
import { MarketPicker } from "./MarketPicker";
import { PagePicker } from "./PagePicker";
import { PromptField } from "./PromptField";
import { SellInput } from "./SellInput";
import { StickyBar } from "./StickyBar";
import { StoreTypePicker } from "./StoreTypePicker";
import { StylePicker } from "./StylePicker";

export function BriefScreen() {
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
          Four answers, three optional. Every page comes back as a mockup.
        </p>
      </header>

      <div className="mx-auto grid max-w-5xl gap-4">
        {/* Above the numbered steps rather than inside them. Where a merchant
            sells frames every answer below it — the language, what the page has
            to promise — and it is the one question they can skip. */}
        <MarketPicker />
        <SellInput />
        <StylePicker />
        <StoreTypePicker />
        <PromptField />
        <ImageUpload />
        <PagePicker />
      </div>

      <StickyBar />
    </motion.div>
  );
}
