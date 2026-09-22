/* ==========================================================================
   The three lines every band on this page opens with.

   ONE COMPONENT BECAUSE IT IS ONE PATTERN, repeated six times: a violet label
   in caps, a 44px heading, and — sometimes — a line of explanation. Written
   out six times it drifts, and a page whose headings are four different sizes
   reads as four pages.
   ========================================================================== */
export function SectionHead({
  eyebrow,
  title,
  sub,
  align = "center",
}: {
  eyebrow: string;
  title: React.ReactNode;
  sub?: React.ReactNode;
  align?: "center" | "left";
}) {
  const centered = align === "center";
  return (
    <div className={centered ? "flex flex-col items-center text-center" : "flex flex-col gap-4"}>
      <p className="text-[12px] font-semibold uppercase tracking-[0.075em] text-pf-violet">
        {eyebrow}
      </p>
      <h2
        className={
          "font-display text-[clamp(1.9rem,4.4vw,2.75rem)] font-semibold leading-[1.1] tracking-[-0.025em] text-pf-text " +
          (centered ? "mt-3.5" : "")
        }
      >
        {title}
      </h2>
      {sub && (
        <p
          className={
            "text-[17px] leading-relaxed text-pf-muted " +
            (centered ? "mt-3.5 max-w-[640px]" : "")
          }
        >
          {sub}
        </p>
      )}
    </div>
  );
}
