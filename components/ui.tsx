"use client";

import { motion } from "framer-motion";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { ICONS, type IconName } from "@/lib/icons";

/* ==========================================================================
   App chrome primitives — the PageFly surface, not the mockups.
   ========================================================================== */

export function Icon({
  name,
  size = 16,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  const Cmp = ICONS[name];
  return <Cmp size={size} strokeWidth={1.75} className={className} aria-hidden />;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="text-pf-eyebrow font-semibold uppercase text-pf-primary-hi">
      {children}
    </div>
  );
}

/** Applies the violet→lavender gradient to one word of a headline. */
export function GradientWord({ children }: { children: ReactNode }) {
  return <span className="pfd-grad-text">{children}</span>;
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "quiet" | "danger";
  size?: "sm" | "md" | "lg";
  icon?: IconName;
  iconRight?: IconName;
  children?: ReactNode;
};

export function Button({
  variant = "primary",
  size = "md",
  icon,
  iconRight,
  children,
  className = "",
  ...rest
}: BtnProps) {
  const sizes = {
    sm: "h-8 px-3 text-[12.5px] gap-1.5",
    md: "h-10 px-4 text-[13.5px] gap-2",
    lg: "h-12 px-6 text-[14.5px] gap-2",
  }[size];

  const variants = {
    primary:
      "bg-pf-primary text-white shadow-pf-button hover:bg-pf-primary-hi disabled:bg-pf-card disabled:text-pf-faint disabled:shadow-none",
    ghost:
      "border border-pf-border text-pf-body hover:border-pf-border-hi hover:bg-pf-card disabled:text-pf-faint",
    quiet:
      "text-pf-muted hover:text-pf-text hover:bg-pf-card disabled:text-pf-faint",
    danger:
      "border border-pf-danger/40 text-pf-danger hover:bg-pf-danger/10",
  }[variant];

  return (
    <button
      className={`inline-flex shrink-0 items-center justify-center rounded-pf-md font-semibold transition-colors duration-150 disabled:cursor-not-allowed ${sizes} ${variants} ${className}`}
      {...rest}
    >
      {icon && <Icon name={icon} size={size === "sm" ? 14 : 16} />}
      {children}
      {iconRight && <Icon name={iconRight} size={size === "sm" ? 14 : 16} />}
    </button>
  );
}

/** Card with the reference site's 1px translucent border + inner highlight. */
export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-pf-card border border-pf-border bg-pf-card shadow-pf-card ${className}`}
    >
      {children}
    </div>
  );
}

/** A titled form section, as used down the whole brief. */
export function SectionCard({
  eyebrow,
  title,
  help,
  children,
  aside,
  id,
}: {
  eyebrow: string;
  title: string;
  help?: string;
  children: ReactNode;
  aside?: ReactNode;
  id?: string;
}) {
  /* Title and help sit on one line where they fit, so a section header costs
     two lines instead of four. */
  return (
    <Panel className="p-4 sm:p-5">
      <section id={id} className="grid gap-4">
        <header className="grid gap-1.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Eyebrow>{eyebrow}</Eyebrow>
            {aside}
          </div>
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <h2 className="font-display text-[17px] font-semibold tracking-[-0.02em] text-pf-text sm:text-[19px]">
              {title}
            </h2>
            {help && (
              <p className="text-[12.5px] text-pf-muted">{help}</p>
            )}
          </div>
        </header>
        {children}
      </section>
    </Panel>
  );
}

export function Chip({
  children,
  selected,
  onClick,
  disabled,
  icon,
  title,
}: {
  children: ReactNode;
  selected?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  icon?: IconName;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={selected}
      className={`inline-flex items-center gap-1.5 rounded-pf-pill border px-3.5 py-2 text-[13px] font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45 ${
        selected
          ? "border-pf-primary-hi/60 bg-pf-primary/18 text-pf-text"
          : "border-pf-border bg-transparent text-pf-muted hover:border-pf-border-hi hover:text-pf-body"
      }`}
    >
      {icon && <Icon name={icon} size={14} />}
      {children}
    </button>
  );
}

export function Counter({
  value,
  max,
  className = "",
}: {
  value: number;
  max: number;
  className?: string;
}) {
  const near = value / max > 0.9;
  return (
    <span
      className={`text-[12px] font-medium tabular-nums ${
        near ? "text-pf-warn" : "text-pf-faint"
      } ${className}`}
    >
      {value}/{max}
    </span>
  );
}

/** − N + stepper. Disabled `+` carries the reason as a native tooltip. */
export function Stepper({
  value,
  onChange,
  max,
  atCap,
  capMessage,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  max: number;
  atCap: boolean;
  capMessage: string;
  label: string;
}) {
  const plusDisabled = value >= max || atCap;
  return (
    <div className="inline-flex items-center gap-1 rounded-pf-pill border border-pf-border p-1">
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        disabled={value <= 0}
        aria-label={`One fewer ${label}`}
        className="grid size-6 place-items-center rounded-pf-pill text-pf-muted transition-colors hover:bg-pf-card hover:text-pf-text disabled:cursor-not-allowed disabled:opacity-35"
      >
        <Icon name="Minus" size={13} />
      </button>
      <span
        className="min-w-5 text-center text-[13px] font-semibold tabular-nums text-pf-text"
        aria-live="polite"
        aria-label={`${value} ${label}`}
      >
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        disabled={plusDisabled}
        title={value >= max ? `Up to ${max} of each page` : atCap ? capMessage : undefined}
        aria-label={`One more ${label}`}
        className="grid size-6 place-items-center rounded-pf-pill text-pf-muted transition-colors hover:bg-pf-card hover:text-pf-text disabled:cursor-not-allowed disabled:opacity-35"
      >
        <Icon name="Plus" size={13} />
      </button>
    </div>
  );
}

/** Inline error, in the interface's voice. */
export function InlineError({
  children,
  onDismiss,
}: {
  children: ReactNode;
  onDismiss?: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      role="alert"
      className="flex items-start gap-2.5 rounded-pf-md border border-pf-danger/35 bg-pf-danger/10 px-3.5 py-2.5 text-[13px] text-pf-danger"
    >
      <span className="mt-px shrink-0">
        <Icon name="CircleAlert" size={15} />
      </span>
      <span className="flex-1">{children}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 opacity-70 hover:opacity-100"
        >
          <Icon name="X" size={14} />
        </button>
      )}
    </motion.div>
  );
}

export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-pf-sm border border-pf-border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-pf-muted">
      {children}
    </span>
  );
}
