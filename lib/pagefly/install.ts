/* ==========================================================================
   Where "install PageFly" goes, and how anything knows to offer it.

   ONE CONSTANT, because this is a referral link. It carries `ref=` and every
   place that offers the install has to carry the same one — a second copy
   typed somewhere else is a placement whose installs are credited to nobody,
   and nothing in the app would look wrong.
   ========================================================================== */

export const PAGEFLY_INSTALL_URL =
  "https://pagefly.io/?ref=BQd9wfg4&target=app-listing";

/* ---- "they have exported something" -------------------------------------

   A .pagefly is a file only PageFly opens. A merchant who has just downloaded
   their first one is holding something they cannot use, and that is the one
   moment where "install PageFly" is an instruction rather than an
   advertisement — so it is the only moment anything interrupts them about it.

   REMEMBERED IN THE BROWSER, per store, and that is a deliberate ceiling on
   the ambition. "Once per account" would need a column, a route and two
   drivers; what this actually has to avoid is nagging the same person twice,
   which a local flag does. Someone who exports again on a different machine
   sees it once more there — and may genuinely not have PageFly on that
   machine either.
   ------------------------------------------------------------------------ */

const key = (domain: string) => `pfd.install-prompt.${domain}`;

/** Fired when a .pagefly download has just been handed over. */
export const EXPORTED_EVENT = "pfd:pagefly-exported";

export function announceExport(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EXPORTED_EVENT));
}

export function installPromptSeen(domain: string): boolean {
  try {
    return window.localStorage.getItem(key(domain)) === "1";
  } catch {
    /* Private mode, or storage switched off. Treating that as "seen" is the
       kinder failure: the alternative is a panel that returns after every
       single export and cannot be dismissed for good. */
    return true;
  }
}

export function markInstallPromptSeen(domain: string): void {
  try {
    window.localStorage.setItem(key(domain), "1");
  } catch {
    // Nothing to do — see above.
  }
}
