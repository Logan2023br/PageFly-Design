/* ==========================================================================
   WORK STARTED WHILE THE MERCHANT IS STILL READING.

   Converting an HTML mockup into a .pagefly file costs one model call per band
   — about a minute, and a third of a million tokens. It used to run on the
   Export click, so a merchant who had already waited for the build waited
   again for the file; and because nothing was kept, the six exports of one
   page in a real log were six full conversions of a document that had not
   changed between them.

   The conversion belongs where the waiting already is: it starts when the page
   appears, and the click collects it. That turns a minute of dead time into no
   time at all in the common case, and the uncommon case — a click while it is
   still running — into the same wait the merchant would have had anyway.

   Four rules, each of which was a bug waiting to be written into a component:

   · THE SAME PAGE IS NEVER CONVERTED TWICE. One promise per key, handed to
     everyone who asks.
   · A CLICK DURING THE CONVERSION JOINS IT. Not a second conversion racing the
     first for the same download.
   · CONVERSIONS RUN ONE AT A TIME. A deck is four pages and a page is ten
     bands, so starting them all is forty parallel model calls the moment a
     build finishes — which is also the moment the vendor is least likely to
     want them.
   · A FAILURE IS NOT AN ANSWER. Cached as one, the merchant gets the same
     failure for as long as the tab is open and no way to ask again, while the
     export path has a fallback converter that would have worked.
   ========================================================================== */

export type Preparer<I, T> = {
  /** Start it, or hand back the one already running (or finished). */
  start(key: string, input: I): Promise<T>;
  /** True once this key has a finished answer waiting. */
  ready(key: string): boolean;
};

export function createPreparer<I, T>(run: (input: I) => Promise<T>): Preparer<I, T> {
  const inFlight = new Map<string, Promise<T>>();
  const done = new Set<string>();
  /* The queue is a chain rather than a counter: each new piece of work is
     hooked onto the tail, and the tail swallows failures so one vendor error
     does not stall everything behind it. */
  let tail: Promise<unknown> = Promise.resolve();

  return {
    start(key, input) {
      const running = inFlight.get(key);
      if (running) return running;

      const work = tail.then(() => run(input));
      const tracked = work.then(
        (value) => {
          done.add(key);
          return value;
        },
        (err) => {
          /* Forgotten, not remembered as a failure — see the fourth rule. */
          inFlight.delete(key);
          throw err;
        },
      );
      inFlight.set(key, tracked);
      tail = tracked.catch(() => undefined);
      return tracked;
    },
    ready(key) {
      return done.has(key);
    },
  };
}

/**
 * A key for one document.
 *
 * The page's id is not enough: a rebuild writes a new mockup under the same id,
 * and the file has to follow the document rather than the slot it is in. The
 * document itself is, so the key is its length and a hash of it — cheap on a
 * 70,000-character string and specific enough that two different pages cannot
 * collide by accident.
 */
export function keyForHtml(id: string, html: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < html.length; i++) {
    h ^= html.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${id}:${html.length}:${(h >>> 0).toString(36)}`;
}
