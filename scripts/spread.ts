/* ==========================================================================
   Is the generator choosing, or reading a table?

       npx tsx scripts/spread.ts

   Read-only. Opens the saved runs and counts, for every page ever built:
   which opening it used, which band was its signature, and how often each of
   those was simply the one `30-verticals.md` names for that trade.

   WHY THIS EXISTS. "The pages all look the same" was an impression for weeks.
   Counted, it turned out to be two numbers: the trade block's named hero was
   chosen 6 times out of 7, and its named signature 7 out of 10. The model was
   not deciding between nine openings — it was looking one up. No prompt change
   should be believed about this without running it again afterwards.

   Two numbers matter and they are different:

   - SPREAD is how many distinct patterns appear at all. A generator using
     three of nine openings has six it never reaches for.
   - CONCENTRATION is what share the most common one takes. Nine openings used
     once each is a different product from one used nine times.

   `arc` is the deterministic path — a seed picks from a list. `model` is the
   deck plan. Split because they fail differently: the arc rolls dice, and the
   model reads a table, and both end up narrow for opposite reasons.
   ========================================================================== */

import { readFileSync } from "node:fs";

/** The commit that put the deck plan in front of the arc. */
const DECK_PLAN_FROM = "2026-08-25";

type Section = { pattern?: string; css?: Record<string, unknown> };
type Page = { vertical?: string; design?: { tree?: { sections?: Section[] } } };
type Run = { createdAt?: string; sell?: string; snapshot?: Page[] };

function db(): Run[] {
  for (const path of [".pfd-dev-db.json", ".pfd-db.json"]) {
    try {
      return (JSON.parse(readFileSync(path, "utf8")) as { runs?: Run[] }).runs ?? [];
    } catch {
      /* next */
    }
  }
  return [];
}

/** Every `<!--#id-->…<!--/-->` block in a sliced skill, by id. */
function blocks(file: string): Map<string, string> {
  const out = new Map<string, string>();
  let text: string;
  try {
    text = readFileSync(`skills/_sliced/${file}`, "utf8");
  } catch {
    return out;
  }
  const re = /<!--#([a-z0-9-]+)-->([\s\S]*?)<!--\/-->/g;
  for (let m = re.exec(text); m; m = re.exec(text)) out.set(m[1], m[2]);
  return out;
}

const VERTICALS = blocks("30-verticals.md");
const PATTERNS = blocks("20-patterns.md");

/** The trade block a brief's own words resolve to, by shared words. */
function tradeOf(sell: string | undefined): string | null {
  const words = new Set(
    (sell ?? "")
      .toLowerCase()
      .replace(/[^a-z]+/g, " ")
      .split(" ")
      .filter(Boolean),
  );
  let best: string | null = null;
  let score = 0;
  for (const id of VERTICALS.keys()) {
    const hits = id.split("-").filter((w) => words.has(w)).length;
    if (hits > score) {
      best = id;
      score = hits;
    }
  }
  return best;
}

function named(trade: string | null, field: "hero" | "signature"): string | null {
  if (!trade) return null;
  const m = new RegExp(`${field}\\s+\`([a-z-]+)\``).exec(VERTICALS.get(trade) ?? "");
  return m ? m[1] : null;
}

/** How many openings the pattern file offers at all, for the denominator. */
function heroIds(): string[] {
  return [...PATTERNS.keys()].filter((id) => id.startsWith("hero-"));
}

type Tally = { counts: Map<string, number>; followed: number; judged: number };

function empty(): Tally {
  return { counts: new Map(), followed: 0, judged: 0 };
}

function add(t: Tally, pattern: string, expected: string | null): void {
  t.counts.set(pattern, (t.counts.get(pattern) ?? 0) + 1);
  if (expected) {
    t.judged++;
    if (pattern === expected) t.followed++;
  }
}

function report(label: string, t: Tally, universe: number | null): void {
  const total = [...t.counts.values()].reduce((a, b) => a + b, 0);
  if (total === 0) {
    console.log(`\n${label}\n  nothing built`);
    return;
  }
  const ranked = [...t.counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranked[0];

  console.log(`\n${label} — ${total} band${total === 1 ? "" : "s"}`);
  for (const [pattern, n] of ranked)
    console.log(`  ${pattern.padEnd(26)} ${String(n).padStart(3)}  ${Math.round((n / total) * 100)}%`);

  console.log(
    `  spread        ${t.counts.size}${universe ? ` of ${universe}` : ""} distinct` +
      (universe && t.counts.size < universe
        ? `  — ${universe - t.counts.size} never chosen`
        : ""),
  );
  console.log(`  concentration ${Math.round((top[1] / total) * 100)}% is "${top[0]}"`);
  if (t.judged > 0)
    console.log(
      `  followed the trade block ${t.followed}/${t.judged}` +
        (t.followed / t.judged >= 0.7 ? "  — reading a table, not choosing" : ""),
    );
}

function main(): void {
  const runs = db();
  if (runs.length === 0) {
    console.log("No saved runs. Build a page first.");
    return;
  }

  const hero = { arc: empty(), model: empty() };
  const signature = { arc: empty(), model: empty() };
  let pages = 0;

  for (const run of runs) {
    const path = (run.createdAt ?? "") >= DECK_PLAN_FROM ? "model" : "arc";
    const trade = tradeOf(run.sell);
    const wantHero = named(trade, "hero");
    const wantSig = named(trade, "signature");

    for (const page of run.snapshot ?? []) {
      const sections = page.design?.tree?.sections ?? [];
      if (sections.length === 0) continue;
      pages++;

      for (const s of sections) {
        const pattern = String(s.pattern ?? "");
        if (!pattern) continue;

        if (pattern.startsWith("hero-")) {
          add(hero[path], pattern, wantHero);
          continue;
        }

        /* The signature is the band given statement padding — the most room on
           the page. Read off the built tree because the plan that named it is
           not saved anywhere, which is its own gap. */
        const padding = String((s.css ?? {}).padding ?? "");
        if (padding.startsWith("140px")) add(signature[path], pattern, wantSig);
      }
    }
  }

  console.log(`\n${pages} page${pages === 1 ? "" : "s"} across ${runs.length} runs`);

  console.log("\n════ OPENINGS ════");
  report("arc — a seed picks", hero.arc, heroIds().length);
  report("model — the deck plan picks", hero.model, heroIds().length);

  console.log("\n════ SIGNATURES ════");
  report("arc — a seed picks", signature.arc, null);
  report("model — the deck plan picks", signature.model, null);

  console.log(
    "\nA high `followed` is the finding to act on: it means the trade block is\n" +
      "deciding and the model is transcribing. Rerun after any prompt change\n" +
      "that was meant to loosen that — an impression is not a measurement.\n",
  );
}

main();
