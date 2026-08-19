/* ==========================================================================
   Score every page this app has ever built.

   Run before a change to the design pipeline and again after it. Without a
   before-number the change is a matter of opinion — every metric here exists
   because someone claimed a page was "basic" or "all the same", and those are
   claims that can be counted.

       npx tsx scripts/baseline.ts > baseline-v1.txt

   Read-only. It opens the database, reads `runs.snapshot`, and writes nothing
   back. Safe to run against production.

   WHAT IT MEASURES, and why each one:

   - distinct paddings   one padding value down a page is the fastest way an
                         otherwise correct page still reads machine-made
   - distinct font sizes a type scale with three sizes is a document
   - centred share       everything centred is the default nobody chose
   - accordion           should be a choice; if it is on 90% of pages it is a
                         habit the prompt taught
   - dark band           a page in one tone reads flat however good the copy
   - full-bleed          the difference between a page and a column of boxes
   - image ratios        every image the same shape is a grid, not a layout
   ========================================================================== */

import { createHash } from "node:crypto";

/* Loaded the same way the app loads it, so this script is configured by
   whatever configures the app rather than by its own copy of the rules. */
function loadEnv(): void {
  try {
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    for (const file of [".env.production.local", ".env.local"]) {
      let text: string;
      try {
        text = readFileSync(file, "utf8");
      } catch {
        continue;
      }
      for (const line of text.split("\n")) {
        const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
        if (m && !process.env[m[1]])
          process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    /* No env file is not an error — the variables may already be set. */
  }
}

/* ---- the shape we read ---------------------------------------------------

   Deliberately loose. This reads rows written by every version of the app that
   has ever run, including ones whose schema has since changed, and a row it
   cannot parse should be skipped rather than crash a measurement run. */

type Css = Record<string, unknown>;
type Node = {
  type?: string;
  css?: Css;
  mobile?: Css;
  ratio?: number;
  children?: Node[];
  slides?: Node[];
  [k: string]: unknown;
};
type Section = Node & { role?: string; children?: Node[] };
type Tree = { sections?: Section[] };

type PageScore = {
  domain: string;
  pageType: string;
  paddings: number;
  fontSizes: number;
  centredShare: number;
  hasAccordion: boolean;
  darkSections: number;
  fullBleed: number;
  imageRatios: number;
  sections: number;
  nodes: number;
};

/* ---- reading a tree ------------------------------------------------------ */

function walk(node: Node, out: Node[] = []): Node[] {
  out.push(node);
  for (const kid of node.children ?? []) walk(kid, out);
  /* A slideshow holds its children under `slides`, and a page whose only
     images live in a carousel would otherwise score zero image ratios. */
  for (const kid of node.slides ?? []) walk(kid, out);
  return out;
}

/** `"96px 56px"` -> `96`. The vertical value is the one that sets rhythm. */
function paddingTop(css: Css | undefined): string | null {
  if (!css) return null;
  const direct = css.paddingTop ?? css.padding;
  if (direct === undefined || direct === null) return null;
  const first = String(direct).trim().split(/\s+/)[0];
  return first || null;
}

/**
 * Is this section painted dark?
 *
 * Read from the luminance of the colour rather than from a list of names,
 * because a page can be dark in `#0A0A0A`, `rgb(12,12,14)` or `#111`. Anything
 * below 0.35 relative luminance is dark enough that light text sits on it.
 */
function isDark(css: Css | undefined): boolean {
  if (!css) return false;
  const raw = String(css.background ?? css.backgroundColor ?? "").trim();
  if (!raw) return false;

  let r = 0;
  let g = 0;
  let b = 0;
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})\b/i.exec(raw);
  const rgb = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(raw);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].replace(/./g, (c) => c + c) : hex[1];
    r = parseInt(h.slice(0, 2), 16);
    g = parseInt(h.slice(2, 4), 16);
    b = parseInt(h.slice(4, 6), 16);
  } else if (rgb) {
    r = +rgb[1];
    g = +rgb[2];
    b = +rgb[3];
  } else return false;

  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.35;
}

/**
 * Does this section run edge to edge?
 *
 * A section is full-bleed when it paints its own background and nothing inside
 * it caps the width. The cap is what the exporter calls the content block —
 * `maxWidth` on a direct child. A band with a colour and no cap reaches both
 * edges of the screen; a band with a cap is an inset rectangle.
 */
function isFullBleed(section: Section): boolean {
  const painted = Boolean(
    section.css?.background ?? section.css?.backgroundColor,
  );
  if (!painted) return false;
  return !(section.children ?? []).some((c) => c.css?.maxWidth !== undefined);
}

function scoreTree(tree: Tree, domain: string, pageType: string): PageScore | null {
  const sections = tree.sections ?? [];
  if (sections.length === 0) return null;

  const all = sections.flatMap((s) => walk(s));

  const paddings = new Set<string>();
  for (const s of sections) {
    const p = paddingTop(s.css);
    if (p) paddings.add(p);
  }

  const fontSizes = new Set<string>();
  const ratios = new Set<string>();
  let centred = 0;
  for (const n of all) {
    const fs = n.css?.fontSize;
    if (fs !== undefined && fs !== null) fontSizes.add(String(fs));
    if (n.type === "image" && typeof n.ratio === "number")
      /* Rounded to one decimal: 0.61 and 0.62 are the same shape to the eye,
         and counting them separately would flatter the page. */
      ratios.add(n.ratio.toFixed(1));
  }
  for (const s of sections) {
    /* Centred is judged on the SECTION, not on every node — a centred heading
       inside a left-aligned band is a choice, a centred band is the default. */
    if (
      s.css?.textAlign === "center" ||
      (s.children ?? []).some((c) => c.css?.textAlign === "center" && (c.children ?? []).length > 1)
    )
      centred++;
  }

  return {
    domain,
    pageType,
    paddings: paddings.size,
    fontSizes: fontSizes.size,
    centredShare: centred / sections.length,
    hasAccordion: all.some((n) => n.type === "accordion"),
    darkSections: sections.filter((s) => isDark(s.css)).length,
    fullBleed: sections.filter(isFullBleed).length,
    imageRatios: ratios.size,
    sections: sections.length,
    nodes: all.length,
  };
}

/* ---- reporting ----------------------------------------------------------- */

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function row(label: string, values: number[], pass?: (v: number) => boolean): string {
  const share =
    pass === undefined
      ? ""
      : `${((values.filter(pass).length / values.length) * 100).toFixed(0)}%`;
  return [
    label.padEnd(34),
    median(values).toFixed(1).padStart(8),
    Math.min(...values).toFixed(1).padStart(6),
    Math.max(...values).toFixed(1).padStart(6),
    share.padStart(8),
  ].join("");
}

async function main(): Promise<void> {
  loadEnv();

  const url =
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL ??
    process.env.PG_URL ??
    "";

  if (!url) {
    console.log("NO DATABASE");
    console.log();
    console.log("No DATABASE_URL, POSTGRES_URL or PG_URL in the environment, so");
    console.log("there is nothing to score. This script is read-only and safe to");
    console.log("point at production:");
    console.log();
    console.log("  DATABASE_URL='postgres://…' npx tsx scripts/baseline.ts > baseline-v1.txt");
    console.log();
    console.log("Or run it on the host that already has the variable set.");
    process.exitCode = 1;
    return;
  }

  const { Pool } = (await import("pg")) as typeof import("pg");
  const pool = new Pool({
    connectionString: url,
    /* One connection. This is a reporting script; it must not compete with the
       app for the pool, which is set to three. */
    max: 1,
    ssl: url.includes("sslmode=disable") ? false : { rejectUnauthorized: false },
  });

  let rows: { domain: string; snapshot: unknown }[];
  try {
    const res = await pool.query(
      `select domain, snapshot from runs where snapshot is not null order by created_at desc`,
    );
    rows = res.rows as { domain: string; snapshot: unknown }[];
  } catch (err) {
    console.log("DATABASE UNREACHABLE");
    console.log();
    console.log((err as Error).message);
    process.exitCode = 1;
    await pool.end().catch(() => {});
    return;
  }
  await pool.end().catch(() => {});

  const scores: PageScore[] = [];
  let skippedNoDesign = 0;
  let skippedUnreadable = 0;

  for (const r of rows) {
    const pages = Array.isArray(r.snapshot) ? r.snapshot : [];
    for (const page of pages as Record<string, unknown>[]) {
      const design = page?.design as { tree?: Tree } | null | undefined;
      if (!design?.tree) {
        /* A page built before the model designed trees, or one whose model call
           declined. Counted rather than hidden: the share of pages with no tree
           at all is itself a number worth knowing. */
        skippedNoDesign++;
        continue;
      }
      try {
        const s = scoreTree(
          design.tree,
          /* Hashed. This file gets committed, and a store domain is a customer's
             identity — the metric that needs it is "do two stores differ", which
             a stable hash answers just as well. */
          createHash("sha256").update(r.domain).digest("hex").slice(0, 8),
          String(page.pageType ?? page.id ?? "unknown"),
        );
        if (s) scores.push(s);
        else skippedUnreadable++;
      } catch {
        skippedUnreadable++;
      }
    }
  }

  console.log("PageFly Design — page baseline");
  console.log(new Date().toISOString());
  console.log();
  console.log(`runs read              ${rows.length}`);
  console.log(`pages with a tree      ${scores.length}`);
  console.log(`pages without a tree   ${skippedNoDesign}   (generator fallback, or the model declined)`);
  console.log(`unreadable             ${skippedUnreadable}`);
  console.log();

  if (scores.length === 0) {
    console.log("Nothing to score.");
    return;
  }

  console.log("metric                              median   min   max   share meeting target");
  console.log("─".repeat(78));
  console.log(row("distinct section paddings", scores.map((s) => s.paddings), (v) => v >= 3) + "   ≥3");
  console.log(row("distinct font sizes", scores.map((s) => s.fontSizes), (v) => v >= 5) + "   ≥5");
  console.log(row("dark sections", scores.map((s) => s.darkSections), (v) => v >= 1) + "   ≥1");
  console.log(row("full-bleed sections", scores.map((s) => s.fullBleed), (v) => v >= 2) + "   ≥2");
  console.log(row("distinct image ratios", scores.map((s) => s.imageRatios), (v) => v >= 3) + "   ≥3");
  console.log(row("centred share of sections", scores.map((s) => s.centredShare), (v) => v <= 0.4) + "   ≤0.4");
  console.log(row("sections per page", scores.map((s) => s.sections)));
  console.log(row("nodes per page", scores.map((s) => s.nodes)));
  console.log();

  const withAccordion = scores.filter((s) => s.hasAccordion).length;
  console.log(
    `pages containing an accordion  ${withAccordion}/${scores.length}  ` +
      `${((withAccordion / scores.length) * 100).toFixed(0)}%   target ≤55%`,
  );
  console.log();

  /* Sameness, measured directly: two pages of the same type from different
     stores that use the same padding scale, the same type scale and the same
     section count are the same page with different words in it. */
  const byType = new Map<string, PageScore[]>();
  for (const s of scores) {
    const list = byType.get(s.pageType) ?? [];
    list.push(s);
    byType.set(s.pageType, list);
  }
  console.log("shape repetition — pages of one type sharing an identical profile");
  console.log("(same section count, padding count and font-size count)");
  for (const [type, list] of [...byType.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 8)) {
    if (list.length < 2) continue;
    const profiles = new Map<string, number>();
    for (const s of list) {
      const key = `${s.sections}|${s.paddings}|${s.fontSizes}`;
      profiles.set(key, (profiles.get(key) ?? 0) + 1);
    }
    const biggest = Math.max(...profiles.values());
    console.log(
      `  ${type.padEnd(18)} ${String(list.length).padStart(4)} pages  ` +
        `${profiles.size} distinct profiles  ` +
        `largest group ${biggest} (${((biggest / list.length) * 100).toFixed(0)}%)`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
