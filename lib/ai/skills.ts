import "server-only";

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/* ==========================================================================
   Skills.

   Every `.md` in `skills/` is concatenated into the system prompt, in filename
   order. Nothing here names a specific file: adding a skill is dropping one in,
   replacing one is deleting and dropping in. That contract is the whole point of
   the directory, so it must not acquire a registry.

   Read once per process and cached. These files change on deploy, not per
   request, and re-reading them on every generation would put disk IO in the path
   of something a merchant is waiting on.

   A skill may declare what it is for, in YAML front matter:

       ---
       scope: copy
       ---

   `copy` reaches the copywriter, `design` reaches the page designer, and
   `export` reaches nothing — it is knowledge for constructing .pagefly payloads,
   which this codebase does in TypeScript and does not need a model for. A skill
   with no `scope` goes everywhere, which is the safe default for a file someone
   just dropped in.

   The distinction between `design` and `export` is worth stating plainly,
   because the first skill dropped in here looked like one and was the other: a
   skill about slot rules and validators teaches a designer nothing about where
   to put the whitespace. Aesthetics go to `design`; payload mechanics are
   already solved in code.

   The mechanism exists because scope is not free: the first skill added here was
   18KB about constructing PageFly payloads, and sending it to a model asked to
   rewrite six sentences cost 7,000 input tokens per page and taught it nothing
   about the merchant.
   ========================================================================== */

const SKILLS_DIR = process.env.PFD_SKILLS_DIR ?? join(process.cwd(), "skills");

export type SkillScope = "copy" | "design" | "slice" | "all";

const cache = new Map<SkillScope, string>();

/** `scope:` from YAML front matter, or "all" when it says nothing. */
function scopeOf(body: string): SkillScope {
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(body);
  if (!front) return "all";
  const declared = /^\s*scope:\s*([a-z]+)\s*$/m.exec(front[1])?.[1];
  return declared === "copy" || declared === "design" || declared === "slice"
    ? declared
    : "all";
}

function stripFrontMatter(body: string): string {
  return body.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").trim();
}

export function loadSkills(want: SkillScope = "all"): string {
  const hit = cache.get(want);
  if (hit !== undefined) return hit;

  let files: string[] = [];
  try {
    files = readdirSync(SKILLS_DIR)
      .filter((f) => f.endsWith(".md"))
      /* README.md documents the directory for people; it is not instruction for a
         model and would only spend tokens telling it how to swap files. */
      .filter((f) => f.toLowerCase() !== "readme.md")
      .sort();
  } catch {
    cache.set(want, "");
    return "";
  }

  const parts: string[] = [];
  for (const file of files) {
    try {
      const raw = readFileSync(join(SKILLS_DIR, file), "utf8").trim();
      if (!raw) continue;

      const scope = scopeOf(raw);
      if (want !== "all" && scope !== "all" && scope !== want) continue;

      const body = stripFrontMatter(raw);
      if (body)
        parts.push(`<skill name="${file.replace(/\.md$/, "")}">\n${body}\n</skill>`);
    } catch {
      // A skill that cannot be read is skipped rather than failing generation.
    }
  }

  const joined = parts.join("\n\n");
  cache.set(want, joined);
  return joined;
}


/* ==========================================================================
   Slicing.

   Three files hold everything the designer might need — 36 layout patterns, 67
   verticals, 16 motion effects — and no page needs more than a handful. Whole,
   they are 12,400 tokens on every call; sliced, about 1,400.

   That is not only a bill. DeepSeek bills its own reasoning against the same
   ceiling as its answer, so a pattern the page will never use is still a
   pattern weighed. The point of slicing is that the model reads six patterns
   and picks nothing, rather than reading thirty-six and choosing.

   `scope: slice` files are never returned by `loadSkills()`. They live in
   `_sliced/` as well, which is belt and braces: `readdirSync` reads one level,
   so a loader that forgets the scope still cannot pick them up.
   ========================================================================== */

export type SliceFile = "patterns" | "verticals" | "motion";

const SLICE_FILES: Record<SliceFile, string> = {
  patterns: "20-patterns.md",
  verticals: "30-verticals.md",
  motion: "40-motion.md",
};

const SLICED_DIR = join(SKILLS_DIR, "_sliced");

/** Parsed once per file. These change on deploy, not per request. */
const blockCache = new Map<SliceFile, Map<string, string>>();

/* Logged once per id per process. An unknown id is a bug in the resolver or a
   block someone renamed, and it should be visible — but a build of thirty
   pages must not print the same line thirty times. */
const warned = new Set<string>();

/**
 * Every `<!--#id-->…<!--/-->` block in one sliced file, keyed by id.
 *
 * A missing file yields an empty map rather than throwing: a page without its
 * pattern descriptions is a worse page, not a failed build.
 */
function blocksOf(file: SliceFile): Map<string, string> {
  const hit = blockCache.get(file);
  if (hit) return hit;

  const out = new Map<string, string>();
  let text: string;
  try {
    text = readFileSync(join(SLICED_DIR, SLICE_FILES[file]), "utf8");
  } catch {
    blockCache.set(file, out);
    return out;
  }

  /* Non-greedy to the NEXT close marker, so an unterminated block swallows one
     block rather than the rest of the file. */
  const re = /<!--#([a-z0-9-]+)-->\r?\n([\s\S]*?)<!--\/-->/g;
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    const body = m[2].trim();
    if (body) out.set(m[1], body);
  }

  blockCache.set(file, out);
  return out;
}

/**
 * The named blocks of one sliced file, in the order asked for.
 *
 * Order is the caller's, not the file's: the resolver puts the vertical's
 * signature pattern first because the model reads top-down, and re-sorting here
 * would quietly undo that.
 *
 * An empty result returns "" — never the whole file. Falling back to the whole
 * file would turn one bad id into 12,400 tokens on every page of every build,
 * and it would work, so nobody would notice.
 */
export function sliceSkill(file: SliceFile, ids: string[]): string {
  const blocks = blocksOf(file);
  if (blocks.size === 0) return "";

  const seen = new Set<string>();
  const parts: string[] = [];

  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);

    const body = blocks.get(id);
    if (body === undefined) {
      const key = `${file}:${id}`;
      if (!warned.has(key)) {
        warned.add(key);
        console.warn(`[skills] no block "${id}" in ${SLICE_FILES[file]}`);
      }
      continue;
    }
    parts.push(body);
  }

  return parts.join("\n\n");
}

/** Every id a sliced file defines. For the tests, and for the resolver to
    validate its own candidate lists against at startup rather than in a prompt. */
export function sliceIds(file: SliceFile): string[] {
  return [...blocksOf(file).keys()];
}

/** Names of the skills in play, for diagnostics and for /api/health. */
export function skillNames(): string[] {
  try {
    return readdirSync(SKILLS_DIR)
      .filter((f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md")
      .map((f) => f.replace(/\.md$/, ""))
      .sort();
  } catch {
    return [];
  }
}
