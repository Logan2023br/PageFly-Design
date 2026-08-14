"use client";

import { motion } from "framer-motion";
import { VISUAL_STYLES, styleSwatch, type VisualStyleId } from "@/lib/styleTokens";
import { useStore } from "@/lib/store";
import { Icon, SectionCard } from "../ui";
import { BrandColors } from "./BrandColors";

/* The card preview: three palette dots plus a type sample rendered in the
   style's own display face. The point is that the choice reads visually — the
   word "Neubrutalist" tells a merchant much less than seeing it. */
function Swatch({ id, brandColors }: { id: VisualStyleId; brandColors: string[] }) {
  const s = styleSwatch(id, brandColors);
  return (
    <div
      className="flex h-[68px] items-end justify-between gap-2 rounded-pf-md px-3 pb-2.5 pt-3"
      style={{ background: s.bg }}
    >
      <span
        style={{
          fontFamily: s.font,
          fontWeight: s.weight,
          letterSpacing: s.tracking,
          textTransform: s.case === "upper" ? "uppercase" : "none",
          color: s.ink,
          fontSize: 22,
          lineHeight: 1,
        }}
      >
        Aa
      </span>
      {/* The colours the page will actually use, so the first dot becomes the
          merchant's the moment they add one. Dimming these instead was the
          wrong answer: it said the style's palette had been dropped when in
          fact only its accent had, and it left the old colour on screen. */}
      <span className="flex gap-1">
        {s.dots.map((d, i) => (
          <span
            key={i}
            className="size-2.5 rounded-full"
            style={{ background: d, outline: "1px solid rgba(128,128,128,.25)" }}
          />
        ))}
      </span>
    </div>
  );
}

export function StylePicker() {
  const selected = useStore((s) => s.draft.visualStyle);
  const setStyle = useStore((s) => s.setStyle);
  const brandColors = useStore((s) => s.draft.brandColors);
  const overridden = brandColors.length > 0;

  return (
    <SectionCard
      id="pfd-style"
      eyebrow="Step 2"
      title="Pick a visual style"
      help="Sets the palette, type and shape of every page."
    >
      <div className="grid gap-3.5">
      <div
        role="radiogroup"
        aria-label="Visual style"
        className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5"
      >
        {VISUAL_STYLES.map((style) => {
          const on = selected === style.id;
          return (
            <motion.button
              key={style.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setStyle(style.id)}
              title={style.blurb}
              whileTap={{ scale: 0.975 }}
              transition={{ type: "spring", stiffness: 520, damping: 30 }}
              className={`relative overflow-hidden rounded-pf-lg border p-2 text-left transition-colors duration-150 ${
                on
                  ? "border-pf-primary-hi bg-pf-primary/12 shadow-pf-glow"
                  : "border-pf-border bg-pf-card hover:border-pf-border-hi"
              }`}
            >
              <Swatch id={style.id} brandColors={brandColors} />
              {/* Label only. The swatch is the description — that was the point
                  of rendering a live preview rather than naming the style. The
                  written blurb is the card's tooltip. */}
              <div className="px-1 pb-0.5 pt-2 text-[12.5px] font-medium leading-tight text-pf-text">
                {style.label}
              </div>

              {on && (
                <motion.span
                  layoutId="pfd-style-check"
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 600, damping: 26 }}
                  className="absolute right-2.5 top-2.5 grid size-6 place-items-center rounded-full bg-pf-primary text-white shadow-pf-button"
                >
                  <Icon name="Check" size={13} />
                </motion.span>
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Under the styles, because this is what overrules them. At the bottom
          of the free-text prompt it read as a footnote to a description. */}
      <BrandColors />

      {overridden && (
        <p className="text-[11.5px] leading-relaxed text-pf-faint">
          Your first colour is the accent on every card above. A second one
          tints the alternating band. Background, text and type stay with the
          style — remove your colours to hand the accent back.
        </p>
      )}
      </div>
    </SectionCard>
  );
}
