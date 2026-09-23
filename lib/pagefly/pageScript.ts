import "server-only";

import { wrapPageJs } from "../design/customBlock";
import { getProvider } from "../ai/provider";
import type { NativeFeature } from "./nativeFeatures";

/* ==========================================================================
   THE PAGE'S BEHAVIOUR, REWRITTEN FOR THE EXPORT.

   One extra call per page, after every band is transcribed and before the file
   is built. It is the only call here that reads the document as a whole, and
   that is what it is for: the mockup's script is one file about one page, and a
   band is the wrong unit to understand it in.

   WHAT IT IS GIVEN

     · the scripts the bands did not carry — `outsideScripts`, which is the
       9.1 KB that used to be dropped in silence on every Hexwood page
     · the features that came back NATIVE, so it deletes its own version of them
     · the class names that survived the export, because those are the only
       selectors that still address anything

   WHAT IT MUST RETURN is heavily constrained, and every constraint is a failure
   this path has already had:

     NOT ONE `<`. PageFly's custom-code validator refuses a customJS file
     outright over a single one, percent-decoding before it looks. `if (i < n)`
     would take the reveal observer, every custom block's script and this down
     with it — a page-wide failure from one keystroke. So: no comparisons that
     way round, no markup in strings, no `createElement("<div>")`.

     NOTHING THE PAGE ALREADY DOES. A tab bar that came back as a `tabs` node is
     PageFly's own element with PageFly's own script; a second tab controller
     bound to the same elements fights it, and the merchant gets a tab strip
     that flickers between two panels.

     NOTHING HIDDEN. The editor does not run custom JS at all, so anything this
     script hides is hidden for ever as far as the merchant's first look is
     concerned. It may only ADD.

   IT IS ALLOWED TO RETURN NOTHING, and often should: a mockup whose whole
   script was a reveal observer and a tab bar has nothing left to do once both
   are native. An empty answer is a correct answer and costs the page nothing.
   ========================================================================== */

const SYSTEM = [
  "You rewrite one page's JavaScript so it keeps working after the page has been",
  "rebuilt as a PageFly page.",
  "",
  "Return JavaScript and nothing else. No markdown fence, no commentary, no",
  "explanation before or after. An empty answer is allowed and is the right",
  "answer when nothing is left to do.",
  "",
  "THE RULES, in the order they break pages:",
  "",
  "1. NOT ONE `<` CHARACTER ANYWHERE IN YOUR ANSWER. The platform refuses the",
  "   whole file over one. So:",
  "     · write `if (b > a)` instead of `if (a < b)`, `>=` instead of `<=`",
  "     · `for (var i = 0; i !== n; i++)` or `arr.forEach(...)`, never `i < n`",
  "     · never put markup in a string: build nodes with",
  "       `document.createElement(\"div\")` and `appendChild`",
  "     · no `innerHTML` with tags in it",
  "   Read your answer back before you send it and check.",
  "",
  "2. DELETE the behaviour the page now has natively. It is listed below. A",
  "   second controller bound to the same elements fights the real one.",
  "",
  "3. SELECT BY CLASS. The ids and `data-` attributes of the original page are",
  "   restored before your script runs, so `#id` and `[data-x]` selectors do",
  "   work — but the class list below is what is certain, and a class selector",
  "   is the one that survives a merchant editing the page afterwards.",
  "",
  "4. NEVER HIDE ANYTHING. No `display:none`, no `visibility:hidden`, no",
  "   `opacity:0` on content, no removing nodes. The editor does not run this",
  "   script at all, so whatever you hide is hidden in the merchant's own view",
  "   of their page with no way to bring it back. Your script may only ADD:",
  "   listeners, classes, text, elements.",
  "",
  "5. NO NETWORK, no `fetch`, no `eval`, no `new Function`, no cookies, no",
  "   `localStorage`, no redirects. This runs on a storefront that takes money.",
  "",
  "6. Guard everything. Query, check the result is there, and return quietly if",
  "   it is not — the page it runs on is not the page you are reading.",
  "",
  "Do not wrap your answer in a function or an IIFE. That is added afterwards,",
  "and yours would only nest inside it.",
].join("\n");

export type PageScript = {
  /** ready to ship: wrapped, guarded, and checked for `<` */
  js: string;
  /** why there is none, when there is none */
  reason?: string;
  usage: { input: number; output: number };
};

/** Markdown fences, the one thing every model adds back however it is asked. */
function unfence(text: string): string {
  const fenced = /```(?:javascript|js)?\s*([\s\S]*?)```/i.exec(text);
  return (fenced ? fenced[1] : text).trim();
}

/**
 * Rewrite the page's own script for the exported page.
 *
 * Returns `js: ""` whenever there is nothing to ship — no input, no model, an
 * answer that would not pass, or an answer that was empty on purpose. Never
 * throws: a page that loses its countdown is a page; a page that fails to
 * export is not.
 */
export async function pageScriptFor(
  scripts: string[],
  opts: { native: NativeFeature[]; classes: string[]; signal?: AbortSignal },
): Promise<PageScript> {
  const usage = { input: 0, output: 0 };
  const source = scripts.map((s) => s.trim()).filter(Boolean).join("\n\n");
  if (source === "") return { js: "", usage };

  const provider = getProvider();
  if (!provider) return { js: "", reason: "no model configured", usage };

  const user = [
    "THE PAGE'S SCRIPT, as the mockup wrote it:",
    "",
    source,
    "",
    "WHAT THE REBUILT PAGE ALREADY DOES BY ITSELF — delete your version of each:",
    "",
    opts.native.length
      ? opts.native.map((f) => `· ${f}`).join("\n")
      : "· nothing; the page has no native widgets",
    "",
    "THE CLASS NAMES THAT EXIST ON THE REBUILT PAGE:",
    "",
    opts.classes.length ? opts.classes.map((c) => `.${c}`).join(" ") : "(none were kept)",
    "",
    "Return the JavaScript that is still worth running, under the rules above.",
  ].join("\n");

  /* ONE RETRY, AND ONLY FOR THE `<`. It is the single rule a model breaks by
     habit rather than by misunderstanding — a comparison is how everybody
     writes a loop — and it is the one whose cost is the whole page's script
     rather than one line of it. Every other rule either holds or is not worth a
     second bill. */
  for (let attempt = 0; attempt < 2; attempt++) {
    let text: string;
    try {
      const answer = await provider.complete({
        system: SYSTEM,
        user:
          attempt === 0
            ? user
            : `${user}\n\nYOUR PREVIOUS ANSWER CONTAINED A \`<\`, so it would be refused and the\npage would ship with no script at all. Rewrite it with none: turn every\ncomparison around, and build any element with \`createElement\`.`,
        maxTokens: 16_000,
        signal: opts.signal,
      });
      usage.input += answer.usage.input;
      usage.output += answer.usage.output;
      text = unfence(answer.text);
    } catch (err) {
      return { js: "", reason: (err as Error).message.slice(0, 160), usage };
    }

    if (text === "") return { js: "", usage };
    if (text.includes("<")) continue;

    /* THE PROMPT IS NOT THE ENFORCEMENT. Every rule above is a sentence to a
       model; these three are checks, because each one is something that reaches
       a merchant's live storefront if the model simply did not comply. */
    const banned = /\b(eval|Function\s*\(|fetch\s*\(|XMLHttpRequest|document\.cookie|localStorage|sessionStorage|location\s*=|location\.(href|replace|assign))/;
    if (banned.test(text)) return { js: "", reason: "the rewritten script reached outside the page", usage };
    /* BOTH SPELLINGS, because the first version only knew the CSS one and a
       model writes the other: `el.style.display = "none"` is the same sentence
       as `display:none` and was walking straight past the check. */
    const hides =
      /(display|visibility)\s*:\s*(none|hidden)/i.test(text) ||
      /\.style\s*\.\s*(display|visibility)\s*=/.test(text) ||
      /setProperty\s*\(\s*["'](display|visibility)["']/.test(text) ||
      /\.hidden\s*=\s*(true|1)\b/.test(text) ||
      /\.(remove|removeChild)\s*\(/.test(text);
    if (hides) return { js: "", reason: "the rewritten script hides part of the page", usage };

    const wrapped = wrapPageJs(text);
    return wrapped ? { js: wrapped, usage } : { js: "", reason: "nothing left to run", usage };
  }

  return { js: "", reason: "the rewritten script still contained a `<`", usage };
}
