"use client";

import { motion } from "framer-motion";
import { useState } from "react";

/* ==========================================================================
   A row of five stars that reads as one scale.

   Shared by the in-app prompt and the public feedback link. Extracted when the
   second one appeared: a rating control copied into two files is two controls
   that drift, and the thing most likely to drift is the hover behaviour below —
   which is the whole reason this is not five checkboxes.
   ========================================================================== */

export function StarRating({
  value,
  onChange,
  size = 22,
  disabled = false,
}: {
  value: number;
  onChange: (stars: number) => void;
  size?: number;
  disabled?: boolean;
}) {
  const [hover, setHover] = useState(0);
  /* Hovering the nth star lights 1..n, which is what makes a star row read as a
     scale rather than as five separate buttons. */
  const shown = hover || value;

  return (
    <div
      className="flex items-center gap-1"
      onMouseLeave={() => setHover(0)}
      role="radiogroup"
      aria-label="Rating out of 5"
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          disabled={disabled}
          aria-checked={value === n}
          aria-label={`${n} star${n === 1 ? "" : "s"}`}
          onMouseEnter={() => setHover(n)}
          onFocus={() => setHover(n)}
          onBlur={() => setHover(0)}
          onClick={() => onChange(n)}
          className="rounded-pf-sm p-0.5 transition-transform hover:scale-110 disabled:cursor-default disabled:hover:scale-100"
        >
          <motion.span
            animate={{ scale: shown >= n ? 1 : 0.94 }}
            transition={{ duration: 0.12 }}
            className={`block ${shown >= n ? "text-pf-warn" : "text-pf-faint"}`}
          >
            <Star filled={shown >= n} size={size} />
          </motion.span>
        </button>
      ))}
      <span className="ml-1.5 text-[12px] tabular-nums text-pf-muted">
        {shown ? `${shown}/5` : ""}
      </span>
    </div>
  );
}

/** Drawn rather than taken from the icon set: the set's Star has one outline
    shape, and this needs a filled and an unfilled state at the same weight. */
function Star({ filled, size }: { filled: boolean; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 3.2l2.62 5.3 5.85.85-4.24 4.13 1 5.82L12 16.57l-5.23 2.75 1-5.82L3.53 9.35l5.85-.85z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    </svg>
  );
}
