/* ==========================================================================
   ONE WORKER, A QUEUE IN FRONT OF IT.

   REPORTED: "bấm export xong nó không cho export ở item khác" — pressing
   Export on one card refused every other card until it finished.

   WHY THE WORK CANNOT SIMPLY RUN IN PARALLEL, which is the obvious fix and
   the wrong one. Two reasons, either sufficient:

     · THE STAGE IS ONE NODE. `capture` and `buildPagefly` mount the page into
       a single offscreen surface and measure it through one ref. Two exports
       at once measure each other's page, and the failure is silent — both
       files build, both download, one of them is of the wrong layout.

     · A CONVERSION IS ALREADY PARALLEL. One page is about ten model calls at
       once. Three pages is thirty concurrent requests at the vendor, which is
       a rate limit rather than a speed-up; `lib/pagefly/prebuild.ts` reached
       the same conclusion from the server side and queues for the same reason.

   SO THE PRESS IS ACCEPTED AND THE WORK IS ORDERED. What was asked for is a
   queue that is OPEN, not work that is parallel: press as many cards as you
   like, first pressed runs first, each file downloads the moment it is ready.

   LIFTED OUT OF THE PROVIDER SO IT CAN BE TESTED. Order, de-duplication and
   failure isolation are three rules that all fail quietly — a queue that drops
   one job, runs them out of order, or stops at the first failure still looks
   like a screen that is working, just slower or shorter than it should be.
   ========================================================================== */

export type ExportQueue = {
  /**
   * Queue one page's export, and hand back that page's own outcome.
   *
   * THE PROMISE BELONGS TO THE JOB, NOT TO THE PRESS. The card awaits this to
   * choose between "Exported" and "Export failed", so it must settle when the
   * file is built — not when the click was accepted. Resolving early would
   * flash "Exported" on a card whose conversion had not started.
   */
  add(id: string, work: () => Promise<void>): Promise<void>;
  /** The ids waiting, in order; the head is the one running. */
  ids(): string[];
};

/**
 * @param onChange called with the new id list whenever the queue moves, so a
 *                 React caller can mirror it into state for rendering
 * @param onIdle   called once the last job has finished and the queue is empty
 */
export function createExportQueue(
  onChange: (ids: string[]) => void,
  onIdle?: () => void,
): ExportQueue {
  type Job = {
    id: string;
    work: () => Promise<void>;
    resolve: () => void;
    reject: (err: unknown) => void;
  };
  let jobs: Job[] = [];
  let working = false;

  const publish = () => onChange(jobs.map((j) => j.id));

  const pump = async () => {
    /* ONE WORKER. A second call while the loop is turning is a no-op — the job
       it just queued is picked up by the loop already running. */
    if (working) return;
    working = true;
    try {
      while (jobs.length > 0) {
        /* READ, RUN, THEN REMOVE — never remove first. The head of the list is
           what every card reads as "running"; taking it off before the work is
           done leaves the converting card labelled `Export` and the one behind
           it claiming to be in progress. */
        const job = jobs[0];
        let failed: unknown = null;
        try {
          await job.work();
        } catch (err) {
          /* Held rather than rethrown: the loop must not stop, or one failed
             page strands every page queued behind it on "Queued" for ever.
             The caller is told below. */
          failed = err;
        }
        jobs = jobs.slice(1);
        publish();
        /* SETTLED AFTER THE LIST HAS MOVED, and the order matters. Settling
           first hands the caller a promise that has resolved while the queue
           still names its job as the one running — so anything that reads the
           queue immediately after awaiting gets an answer that is one job out
           of date. A card would be showing "Exporting…" for a file already in
           the merchant's downloads folder. */
        if (failed === null) job.resolve();
        else job.reject(failed);
      }
    } finally {
      working = false;
      onIdle?.();
    }
  };

  return {
    add: (id, work) =>
      new Promise<void>((resolve, reject) => {
        /* ALREADY ASKED FOR. A second press on the same card is not a second
           file — it is impatience — and queueing it would convert the same
           document twice and hand the merchant two identical downloads. */
        if (jobs.some((j) => j.id === id)) {
          resolve();
          return;
        }
        jobs = [...jobs, { id, work, resolve, reject }];
        publish();
        void pump();
      }),
    ids: () => jobs.map((j) => j.id),
  };
}
