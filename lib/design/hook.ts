/* ==========================================================================
   THE MOCKUP'S OWN CLASS, ID AND `data-*`, CARRIED THROUGH THE EXPORT.

   Only transcription fills these in (`lib/pagefly/htmlToTree.ts`): a designed
   page invents its own structure and has no names to keep. A transcribed page
   has names its own script depends on, and losing them is why an exported page
   kept every pixel of the mockup and none of its behaviour.

   TWO ROADS, BECAUSE PAGEFLY HAS ONLY ONE.

     class    `classGlobalStyling`, which is a real PageFly field — appended to
              whatever the builder and the motion pass already put there.
     id       nothing. There is no element id and no attribute map anywhere in
     data-*   the 480 elements of `reference/all-elements.pagefly`, so these are
              written back on at boot by the page's own script, against a marker
              class the exporter mints for exactly this.

   PER NODE, NOT PER CLASS. Two tabs that share `class="tab"` and differ only by
   `data-tab` are one class and two elements; a table keyed by the shared class
   would give both the same value, which is the bug this indirection exists to
   avoid. `pfd-h-1`, `pfd-h-2` are minted in emit order and belong to one node
   each.

   NOTHING IS MINTED FOR A NODE THAT ONLY HAS CLASSES, which is most of them.
   The marker and the table row are the cost of an id or a `data-*`, and a page
   that uses neither carries no table and no boot script at all.
   ========================================================================== */

/** What the schema's `hook` parses to. */
export type Hook = { class?: string; id?: string; data?: Record<string, string> };

/** One element's attributes, addressed by the marker class minted for it. */
export type HookAttrs = { className: string; attrs: [string, string][] };

/** Collected on the way past, the same way custom blocks are. */
export type HookSink = { rows: HookAttrs[]; count: { value: number } };

/**
 * The classes this node should carry, minting a marker when it needs one.
 *
 * Returns the mockup's own class names plus, where the node also has an id or a
 * `data-*`, one `pfd-h-N` — and registers that row on the sink, which is what
 * the boot script is built from.
 */
export function hookClasses(hook: Hook | undefined, sink?: HookSink): string[] {
  if (!hook) return [];
  const classes = hook.class ? hook.class.split(/\s+/).filter(Boolean) : [];

  const attrs: [string, string][] = [];
  if (hook.id) attrs.push(["id", hook.id]);
  for (const [k, v] of Object.entries(hook.data ?? {})) attrs.push([`data-${k}`, v]);
  if (attrs.length === 0 || !sink) return classes;

  const className = `pfd-h-${++sink.count.value}`;
  sink.rows.push({ className, attrs });
  return [...classes, className];
}

/**
 * The boot script that writes the ids and `data-*` back on.
 *
 * NOT ONE `<` ANYWHERE, and that is not a style preference: PageFly's
 * custom-code validator refuses a customJS file outright if it holds a single
 * one, decoding percent-encoding before it looks — so one `i < n` in here would
 * take the reveal observer, every custom block's script and the page's own
 * behaviour down with it. Hence `forEach` rather than an indexed loop, and
 * `<` for any `<` that a merchant's own attribute value happens to carry.
 *
 * Idempotent and silent. PageFly re-runs custom JS on an editor preview
 * refresh, and setting the same attribute twice is free; a throw here would be
 * an uncaught exception on a live storefront, which is not what an id is worth.
 */
export function hookAttrsJs(rows: HookAttrs[]): string {
  if (rows.length === 0) return "";
  const table = JSON.stringify(rows.map((r) => [r.className, r.attrs])).replace(/</g, "\\u003c");
  return [
    `(function(){try{`,
    `var T=${table};`,
    `T.forEach(function(r){`,
    `Array.prototype.forEach.call(document.querySelectorAll("."+r[0]),function(el){`,
    `r[1].forEach(function(a){if(!el.hasAttribute(a[0]))el.setAttribute(a[0],a[1])});`,
    `});`,
    `});`,
    `}catch(e){}})();`,
  ].join("");
}
