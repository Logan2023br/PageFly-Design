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

export type SkillScope = "copy" | "design" | "export" | "all";

const cache = new Map<SkillScope, string>();

/** `scope:` from YAML front matter, or "all" when it says nothing. */
function scopeOf(body: string): SkillScope {
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(body);
  if (!front) return "all";
  const declared = /^\s*scope:\s*([a-z]+)\s*$/m.exec(front[1])?.[1];
  return declared === "copy" || declared === "design" || declared === "export"
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
