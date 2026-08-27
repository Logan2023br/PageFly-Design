"use client";

import { useEffect, useRef } from "react";

/* ==========================================================================
   The two lights on this page.

   `sky` sits behind the hero: a wide indigo bloom off the top edge with a
   scattered field of small lights in it. `horizon` sits behind the last call to
   action: one enormous circle whose top arc rises out of the bottom of the
   section, which is what makes it read as a horizon rather than a blob.

   BUILT, NOT BORROWED. Both are drawn here from the palette's own tokens rather
   than shipped as artwork: a PNG of a gradient is four hundred kilobytes that
   band on a wide screen and go stale the moment the accent changes, and this
   page's accent is a token two files away.

   Decoration all the way down — `aria-hidden`, `pointer-events-none`, and
   underneath everything. Nothing here carries meaning, so nothing here is
   announced.
   ========================================================================== */

/** Lights in the sky: position, radius, base opacity, and how it breathes. */
type Star = { x: number; y: number; r: number; a: number; hue: number; phase: number };

function makeStars(count: number, w: number, h: number): Star[] {
  const out: Star[] = [];
  for (let i = 0; i < count; i++) {
    /* Weighted toward the top, because that is where the bloom is and a light
       in the dark half of the gradient reads as a dead pixel. */
    const y = Math.pow(Math.random(), 1.7) * h;
    out.push({
      x: Math.random() * w,
      y,
      r: Math.random() * 1.6 + 0.6,
      a: Math.random() * 0.5 + 0.25,
      /* Violet through to a colder blue, never white — white dots on a violet
         field read as dust on the screen. */
      hue: 250 + Math.random() * 40,
      phase: Math.random() * Math.PI * 2,
    });
  }
  return out;
}

function Starfield({ className }: { className: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let stars: Star[] = [];
    let raf = 0;
    let stop = false;

    const size = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      /* Density rather than a fixed count: the same 60 lights are a crowd on a
         phone and a sprinkle on an ultrawide. */
      stars = makeStars(Math.round((w * h) / 14000), w, h);
    };

    const draw = (t: number) => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        /* A slow breath, not a blink. Blinking reads as a rendering fault. */
        const a = reduced ? s.a : s.a * (0.62 + 0.38 * Math.sin(t / 2200 + s.phase));
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${s.hue}, 90%, 76%, ${a})`;
        ctx.fill();
      }
      if (!reduced && !stop) raf = requestAnimationFrame(draw);
    };

    size();
    draw(0);

    const onResize = () => {
      size();
      if (reduced) draw(0);
    };
    window.addEventListener("resize", onResize);

    return () => {
      stop = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return <canvas ref={ref} className={className} aria-hidden />;
}

export function Aura({ variant }: { variant: "sky" | "horizon" }) {
  if (variant === "sky")
    return (
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[560px] overflow-hidden">
        {/* The bloom. Ellipse rather than circle so it spreads across a wide
            screen instead of ballooning down the middle of it. */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 80% at 50% -18%, rgba(107,47,247,.38) 0%, rgba(77,28,196,.16) 38%, rgba(10,6,22,0) 70%)",
          }}
        />
        {/* One faint arc, the edge of something much larger passing behind. */}
        <div
          className="absolute left-1/2 top-[-960px] h-[1200px] w-[2000px] -translate-x-1/2 rounded-full"
          style={{ boxShadow: "0 0 0 1px rgba(154,107,255,.10)" }}
        />
        <Starfield className="absolute inset-0 h-full w-full" />
      </div>
    );

  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[620px] overflow-hidden">
      {/* One very large circle, mostly below the fold. Only its top arc is in
          view, and an arc that wide reads as a horizon. A blurred ellipse would
          have given the glow and none of the curve. */}
      <div
        className="absolute left-1/2 top-[38%] h-[1700px] w-[2600px] -translate-x-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, rgba(107,47,247,.34) 0%, rgba(77,28,196,.14) 46%, rgba(10,6,22,0) 72%)",
          boxShadow: "inset 0 1px 0 rgba(154,107,255,.22)",
        }}
      />
    </div>
  );
}
