/* The class strings of admin form fields. Not in shared.tsx: that is a
   "use client" module, and a constant imported from one into a server
   component arrives as a client reference, not as its string — the field
   renders with a function's source for its class and no style at all. */

export const FIELD =
  "w-full rounded-pf-md border border-pf-border bg-pf-bg-deep px-3 py-2 text-[13px] text-pf-text outline-none transition-colors placeholder:text-pf-faint focus:border-pf-primary-hi";

export const FIELD_LABEL =
  "text-[11.5px] font-semibold uppercase tracking-[0.08em] text-pf-faint";
