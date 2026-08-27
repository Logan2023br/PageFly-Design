/* ==========================================================================
   The four screens, drawn.

   NOT SCREENSHOTS, and not for want of trying: every screen here is behind a
   sign-in, so capturing them means a logged-in browser this repo does not have.
   The first cut shipped <img> tags pointing at files nobody had taken, which
   404'd — and the fallback never fired, because the image fails during the
   server-rendered pass and React attaches `onError` at hydration, by which time
   the failure is already history. A broken-image glyph with alt text beside it
   is the worst thing a landing page can show.

   So these are schematics, drawn from the same tokens the real screens use.
   They stay sharp at any size, weigh a few hundred bytes each, and cannot 404.
   What they give up is fidelity — a schematic is a claim about a screen rather
   than the screen — so each one shows only the shape a visitor needs to
   recognise, and the labels underneath say the rest.
   ========================================================================== */

const BG = "var(--color-pf-bg-deep)";
const CARD = "var(--color-pf-card)";
const LINE = "var(--color-pf-border)";
const DIM = "var(--color-pf-faint)";
const TEXT = "var(--color-pf-muted)";
const ON = "var(--color-pf-primary)";
const ON_HI = "var(--color-pf-primary-hi)";

/** A rounded block — the unit every one of these is built from. */
function Box(p: {
  x: number;
  y: number;
  w: number;
  h: number;
  r?: number;
  fill?: string;
  stroke?: string;
  opacity?: number;
}) {
  return (
    <rect
      x={p.x}
      y={p.y}
      width={p.w}
      height={p.h}
      rx={p.r ?? 4}
      fill={p.fill ?? CARD}
      stroke={p.stroke ?? LINE}
      strokeWidth={1}
      opacity={p.opacity}
    />
  );
}

/** A line of text, as a bar. Length carries the meaning, not the glyphs. */
function Line(p: { x: number; y: number; w: number; h?: number; fill?: string }) {
  return <rect x={p.x} y={p.y} width={p.w} height={p.h ?? 5} rx={2.5} fill={p.fill ?? DIM} />;
}

const VIEWBOX = "0 0 560 280";

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox={VIEWBOX} className="h-full w-full" preserveAspectRatio="xMidYMin slice" aria-hidden>
      <rect width="560" height="280" fill={BG} />
      {children}
    </svg>
  );
}

/** 01 — a field, then the trades. */
export function ArtSell() {
  const chips = [64, 48, 76, 56, 40, 68, 52, 60, 44, 72, 50, 58];
  let x = 40;
  let y = 132;
  const rows: { x: number; y: number; w: number }[] = [];
  for (const w of chips) {
    if (x + w > 520) {
      x = 40;
      y += 26;
    }
    rows.push({ x, y, w });
    x += w + 8;
  }
  return (
    <Frame>
      <Line x={40} y={40} w={54} h={6} fill={ON_HI} />
      <Line x={40} y={62} w={186} h={9} fill={TEXT} />
      <Box x={40} y={92} w={480} h={28} r={6} />
      <Line x={54} y={102} w={150} h={7} />
      {rows.map((c, i) => (
        <Box key={i} x={c.x} y={c.y} w={c.w} h={18} r={9} opacity={i > 7 ? 0.55 : 1} />
      ))}
    </Frame>
  );
}

/** 02 — fifteen looks, one taken. */
export function ArtStyle() {
  const cells = Array.from({ length: 10 }, (_, i) => i);
  return (
    <Frame>
      <Line x={40} y={40} w={54} h={6} fill={ON_HI} />
      <Line x={40} y={62} w={148} h={9} fill={TEXT} />
      {cells.map((i) => {
        const col = i % 5;
        const row = Math.floor(i / 5);
        const x = 40 + col * 98;
        const y = 96 + row * 84;
        const on = i === 1;
        return (
          <g key={i}>
            <Box x={x} y={y} w={86} h={68} r={7} stroke={on ? ON_HI : LINE} />
            <Box x={x + 8} y={y + 8} w={70} h={38} r={4} fill="var(--color-pf-bg)" />
            <Line x={x + 8} y={y + 54} w={44} h={5} />
            {on && <circle cx={x + 74} cy={y + 12} r={6} fill={ON} />}
          </g>
        );
      })}
    </Frame>
  );
}

/** 03 — what to build, and how many of each. */
export function ArtPages() {
  const rows = [
    { on: true, step: false },
    { on: true, step: true },
    { on: true, step: true },
    { on: false, step: false },
    { on: false, step: false },
  ];
  return (
    <Frame>
      <Line x={40} y={40} w={54} h={6} fill={ON_HI} />
      <Line x={40} y={62} w={128} h={9} fill={TEXT} />
      {rows.map((r, i) => {
        const y = 96 + i * 34;
        return (
          <g key={i}>
            <Box x={40} y={y} w={480} h={26} r={6} stroke={r.on ? ON_HI : LINE} />
            <Box x={50} y={y + 7} w={12} h={12} r={3} fill={r.on ? ON : "transparent"} stroke={r.on ? ON : LINE} />
            <Line x={72} y={y + 10} w={r.on ? 96 : 74} h={6} fill={r.on ? TEXT : DIM} />
            {r.step && (
              <g>
                <Box x={430} y={y + 5} w={80} h={16} r={8} />
                <Line x={440} y={y + 12} w={8} h={2} />
                <Line x={466} y={y + 11} w={6} h={4} fill={TEXT} />
                <Line x={494} y={y + 12} w={8} h={2} />
              </g>
            )}
          </g>
        );
      })}
    </Frame>
  );
}

/** 04 — what comes back. */
export function ArtResults() {
  const cards = Array.from({ length: 4 }, (_, i) => i);
  return (
    <Frame>
      <Line x={40} y={40} w={54} h={6} fill={ON_HI} />
      <Line x={40} y={62} w={166} h={9} fill={TEXT} />
      {cards.map((i) => {
        const x = 40 + i * 124;
        return (
          <g key={i}>
            <Box x={x} y={96} w={112} h={148} r={8} />
            {/* A page inside the card: a band, some lines, a grid. Enough shape
                to read as a web page at 40mm across. */}
            <rect x={x + 1} y={97} width={110} height={40} fill="var(--color-pf-bg)" />
            <Line x={x + 10} y={110} w={54} h={7} fill={TEXT} />
            <Line x={x + 10} y={122} w={34} h={4} />
            <Box x={x + 10} y={148} w={30} h={26} r={3} fill="var(--color-pf-bg)" />
            <Box x={x + 44} y={148} w={30} h={26} r={3} fill="var(--color-pf-bg)" />
            <Box x={x + 78} y={148} w={24} h={26} r={3} fill="var(--color-pf-bg)" />
            <Line x={x + 10} y={184} w={78} h={4} />
            <Line x={x + 10} y={194} w={60} h={4} />
            <rect x={x + 1} y={210} width={110} height={33} fill="var(--color-pf-bg)" opacity={0.6} />
            <Line x={x + 10} y={222} w={40} h={6} fill={TEXT} />
          </g>
        );
      })}
    </Frame>
  );
}
