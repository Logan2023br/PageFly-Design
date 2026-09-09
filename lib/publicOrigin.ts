/* ==========================================================================
   The origin a link we mint should point at.

   Two endpoints build URLs a merchant is expected to open — the invite link
   and the feedback link in the morning review mail — and both used to read the
   origin off the request. That is correct only for a process nothing sits in
   front of. On the VPS this app runs behind nginx, so the request reaching it
   is addressed to `localhost:3000`, and every link minted there pointed at a
   machine nobody outside it can reach.

   THREE SOURCES, IN THIS ORDER, and each exists because the one after it can
   be wrong:

   1. `PFD_PUBLIC_URL`. What an operator wrote down. Nothing can override a
      decision that was made deliberately.
   2. The forwarded headers. What the proxy says the client asked for, which is
      the only thing that knows the public hostname when TLS terminates
      upstream.
   3. The request itself. Right when there is no proxy — a development server,
      or a process exposed directly.

   TRUSTING A FORWARDED HEADER IS A CHOICE, and it is bounded here: both
   callers are authenticated by SYNC_SECRET, so a forged host would have to
   come from something already holding the secret — at which point it can mint
   links anyway. `PFD_PUBLIC_URL` is the answer for a deployment that does not
   want to make that trade.
   ========================================================================== */

/** The first entry of a possibly-chained forwarded header, trimmed. */
function firstHop(value: string | null): string | null {
  const first = value?.split(",")[0]?.trim();
  return first ? first : null;
}

export function publicOrigin(request: Request): string {
  const configured = process.env.PFD_PUBLIC_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  const forwardedHost = firstHop(request.headers.get("x-forwarded-host"));
  const host = forwardedHost ?? firstHop(request.headers.get("host"));

  if (host) {
    /* https unless the proxy says otherwise. A forwarded header only exists
       because something is in front, and that something almost always holds
       the certificate. */
    const proto = firstHop(request.headers.get("x-forwarded-proto")) ?? "https";
    return `${proto}://${host}`;
  }

  return new URL(request.url).origin;
}
