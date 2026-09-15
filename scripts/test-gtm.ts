/* ==========================================================================
   The Tag Manager snippet, executed.

       npx tsx scripts/test-gtm.ts

   A tracking snippet is the easiest thing in a codebase to get wrong quietly.
   It has no output, nothing renders differently, no test goes red — the only
   symptom is a number that is missing from a dashboard somebody else looks at,
   weeks later.

   So rather than trust that the string is right, this runs it. The snippet is
   pulled out of the component that ships it and executed against a stub
   document, and what it builds is checked: the dataLayer, the start event, and
   the URL it would fetch — including the container id, which is the one thing
   in it that can be wrong while everything still looks correct.
   ========================================================================== */

import { readFileSync } from "node:fs";
import { join } from "node:path";

let failures = 0;
function check(ok: boolean, label: string, detail: string | null = null): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const SOURCE = join(process.cwd(), "components/GoogleTagManager.tsx");

async function main(): Promise<void> {
  const file = readFileSync(SOURCE, "utf8");

  /* The snippet as it appears in the component, template literal and all.
     Taken from the file rather than duplicated here — a copy in a test is a
     copy that stops matching the thing it is testing. */
  const between = file.match(/__html: `([\s\S]*?)`,\n {6}\}\}/);
  check(between !== null, "the snippet is found in the component");
  if (!between) {
    console.log(`\n1 failure(s)\n`);
    process.exit(1);
  }

  const id = file.match(/NEXT_PUBLIC_GTM_ID \?\? "([^"]+)"/)?.[1] ?? "";
  check(/^GTM-[A-Z0-9]+$/.test(id), "the container id has the shape Google issues", id);

  const snippet = between[1].replace("${GTM_ID}", id);

  console.log("\nwhat it does when it runs");

  /* Just enough document for the snippet: it asks for the existing script
     tags, makes one, and inserts before the first. Nothing else is touched, so
     nothing else is stubbed — a fuller fake would be a fake that could pass
     while the real browser fails. */
  const inserted: Record<string, unknown>[] = [];
  const first = { parentNode: { insertBefore: (node: Record<string, unknown>) => inserted.push(node) } };

  const win: Record<string, unknown> = {};
  const doc = {
    getElementsByTagName: (tag: string) => (tag === "script" ? [first] : []),
    createElement: () => ({} as Record<string, unknown>),
  };

  new Function("window", "document", snippet)(win, doc);

  const layer = win.dataLayer as Record<string, unknown>[] | undefined;
  check(Array.isArray(layer), "a dataLayer exists");
  check((layer?.length ?? 0) === 1, "with one entry", String(layer?.length));

  const pushed = layer?.[0] ?? {};
  /* Container triggers fire on this event. A snippet rewritten as a plain
     fetch of gtm.js would load the container and fire nothing. */
  check(pushed.event === "gtm.js", "carrying the gtm.js event", String(pushed.event));
  check(
    typeof pushed["gtm.start"] === "number" && (pushed["gtm.start"] as number) > 0,
    "and the start timestamp",
    String(pushed["gtm.start"]),
  );

  console.log("\nand what it would fetch");

  check(inserted.length === 1, "one script element is inserted", String(inserted.length));
  const tag = inserted[0] ?? {};
  check(tag.async === true, "asynchronously, so it never blocks rendering");
  check(
    typeof tag.src === "string" && tag.src.startsWith("https://www.googletagmanager.com/gtm.js?id="),
    "from Google",
    String(tag.src),
  );
  /* THE ONE THING THAT CAN BE WRONG WHILE EVERYTHING LOOKS RIGHT. A mistyped
     container id loads a container that exists, fires nothing, and reports no
     error anywhere. */
  check(
    typeof tag.src === "string" && tag.src.endsWith(`id=${id}`),
    "for this container and no other",
    String(tag.src),
  );

  console.log("\nwhere it is allowed to run");

  /* A preview deployment reporting into the live container is the same problem
     the in-app analytics was built to avoid: real-looking numbers inflated by
     traffic that is not customers. */
  check(
    file.includes("VERCEL_ENV"),
    "production is told apart from a preview by VERCEL_ENV, not NODE_ENV",
    "NODE_ENV is `production` on a Vercel preview too",
  );
  check(file.includes('process.env.NODE_ENV === "production"'), "and a self-hosted build still reports");

  console.log("\nthe no-script fallback");

  check(file.includes("ns.html?id="), "points at the iframe endpoint");
  check(file.includes("<noscript>"), "inside a noscript, so a browser with JS never loads it");

  console.log(failures === 0 ? "\nall good\n" : `\n${failures} failure(s)\n`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();

export {};
