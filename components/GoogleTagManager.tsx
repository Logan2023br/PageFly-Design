import Script from "next/script";

/* ==========================================================================
   Google Tag Manager.

   THE SNIPPET GOOGLE GIVES YOU IS FOR A PLAIN HTML PAGE. It says "as high in
   the <head> as possible", which in a hand-written document means "before the
   browser has anything else to do". In Next that instruction maps to
   `beforeInteractive`, and taking it literally would block hydration of the
   whole app behind a third-party request.

   `afterInteractive` instead, which is what Next's own `GoogleTagManager`
   component does — the docs shipped in this repo say it "fetches the original
   inline script after hydration occurs on the page". So this is not a
   deviation from the snippet, it is the snippet as Next runs it.

   `next/script` DIRECTLY, and no new dependency. `@next/third-parties` is not
   installed and its component is a wrapper around exactly this with the same
   strategy. Its other export, `sendGTMEvent`, is for pushing app events into
   the dataLayer — which this product does not need, because it has its own
   analytics in `lib/analytics.ts` writing to its own table. The two are
   separate on purpose: one is ours and answers product questions, the other is
   marketing's and answers acquisition ones.

   IT DOES NOT SHIP IN THE EMBED. `app/layout.tsx` is only used when this app
   is served on its own — when the feature is embedded into pagefly.io only the
   `.pfd-root` tree goes, and that site has its own container. Loading a second
   one inside theirs would double every pageview they count.
   ========================================================================== */

/** The container. Overridable so a second property can be pointed at a staging
    container without a code change; compiled in so production does not depend
    on an environment variable nobody remembers to set. */
const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID ?? "GTM-MF2LR4BD";

/**
 * Whether this deployment should report at all.
 *
 * NOT `NODE_ENV`, which is `production` on a Vercel preview as well as on
 * production. A preview reporting into the live container is the same class of
 * problem the in-app analytics was built to avoid: numbers somebody will act
 * on, quietly inflated by traffic that is not customers — here it would be us,
 * reloading a branch.
 *
 * `VERCEL_ENV` is read on the server, which is where this component runs, so
 * it needs no `NEXT_PUBLIC_` prefix and never reaches the browser.
 */
function shouldLoad(): boolean {
  if (!GTM_ID) return false;

  const vercel = process.env.VERCEL_ENV;
  if (vercel) return vercel === "production";

  /* Not on Vercel: a real server, or somebody's laptop. `npm run dev` must not
     report, and a self-hosted production build should. */
  return process.env.NODE_ENV === "production";
}

/** Goes in `<head>`. */
export function GoogleTagManagerHead() {
  if (!shouldLoad()) return null;

  /* IT RUNS AFTER HYDRATION, NOT IN THE HEAD, and that was not a choice so
     much as a finding. Three ways were tried and the served HTML was
     byte-identical each time: `<Script afterInteractive>`, `<Script
     beforeInteractive>`, and a plain `<script>` in `<head>`. React 19 hoists a
     script with `dangerouslySetInnerHTML` out of the head, and Next's
     `beforeInteractive` is built for scripts with a `src` — the documented
     example puts one in `<body>`. The inline snippet ends up in the RSC
     payload in all three cases and is created client-side.

     Which is fine, and is what Next's own `GoogleTagManager` does: the docs in
     this repo say it "fetches the original inline script after hydration". GTM
     is a client-side tag manager; it needs a browser either way. What is lost
     is a visitor who leaves before hydration, which is the accepted cost on
     every React app and the reason that component was written this way.

     The snippet itself is verified rather than assumed — `scripts/test-gtm.ts`
     executes the exact string this ships against a stub document and checks
     what it builds. */
  return (
    <Script
      id="gtm"
      strategy="afterInteractive"
      /* Google's own snippet, unchanged apart from the container id coming
         from a constant. Rewriting it as a fetch of gtm.js would drop the
         `gtm.start` timestamp and the `gtm.js` event, which are what container
         triggers fire on. */
      dangerouslySetInnerHTML={{
        __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');`,
      }}
    />
  );
}

/**
 * Goes immediately after the opening `<body>`.
 *
 * Plain markup rather than a `Script`, because it is not a script — it is the
 * fallback for a browser that will not run one, and `next/script` would never
 * render it there.
 */
export function GoogleTagManagerNoScript() {
  if (!shouldLoad()) return null;

  return (
    <noscript>
      <iframe
        src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
        height="0"
        width="0"
        style={{ display: "none", visibility: "hidden" }}
        /* A frame nobody can reach with a keyboard and no screen reader should
           announce — it has no content, it is a tracking pixel in an iframe. */
        title="Google Tag Manager"
        aria-hidden
      />
    </noscript>
  );
}
