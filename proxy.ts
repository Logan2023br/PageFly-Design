import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/* ==========================================================================
   Route guard.

   Named `proxy` and not `middleware`: this version of Next renamed the
   convention, and a middleware.ts file here would simply never run — see
   node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md

   This checks that a session cookie EXISTS and nothing more. It deliberately
   does not verify the signature: the docs are explicit that proxy should not
   rely on shared modules, and it may be deployed to a CDN edge away from the
   application. So this is only a fast redirect for the common case, and every
   route that acts on a session verifies the HMAC itself via lib/session.ts.
   Treating this file as the security boundary would be a mistake.
   ========================================================================== */

const STORE_COOKIE = "pfd_store";

/* ==========================================================================
   CSRF, for the APIs that act with an admin's or a store's cookie.

   A state-changing request must come from this site. Browsers say where a
   request came from in `Sec-Fetch-Site` (and `Origin`); a form or fetch from
   another site — including a sibling *.pagefly.io, which SameSite=Lax would
   let through — is refused. A caller that sends neither header is not a
   browser (a script with SYNC_SECRET, a test) and carries no ambient cookie
   to abuse, so it passes to the route's own check.
   ========================================================================== */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function crossSite(request: NextRequest): boolean {
  if (SAFE_METHODS.has(request.method)) return false;
  const site = request.headers.get("sec-fetch-site");
  if (site) return site !== "same-origin" && site !== "none";
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host !== (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host);
  } catch {
    return true;
  }
}

/* ==========================================================================
   THE MERCHANT APP IS OFF.

   Nobody uses /design (the brief → build → library app for merchants) any
   more, and its sign-in — a store domain, with no proof of ownership — and
   its paid AI calls were the largest risks left on the site. So its screens
   go to /collection-pages and its APIs answer 404, on the server, for
   everyone. The code stays: MERCHANT_APP=on brings it all back.

   Kept: /design/admin (admin), /collection-pages, the upsell and collection
   APIs, /api/events (collection analytics) and /api/pagefly/* (admin's view
   of a store's library exports from there).
   ========================================================================== */
const merchantAppOn = () => process.env.MERCHANT_APP === "on";

/* THE REFERRAL PROGRAM IS OFF too: its page goes to /collection-pages and the
   member APIs answer 404. The admin's view of past members stays.
   REFERRAL_PROGRAM=on brings it back. */
const referralOn = () => process.env.REFERRAL_PROGRAM === "on";
const REFERRAL_PAGE = /^\/collection-pages\/referral(\/|$)/;
const REFERRAL_APIS = /^\/api\/collection-pages\/referral(\/|$)/;
const MERCHANT_PAGES = /^\/design\/(login|register|library)(\/|$)/;
const MERCHANT_APIS = /^\/api\/(auth\/(store|register|provision)|account|build|ai|runs|generate|review)(\/|$)/;

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!referralOn()) {
    if (REFERRAL_APIS.test(pathname))
      return NextResponse.json({ ok: false, error: "This feature is turned off." }, { status: 404 });
    if (REFERRAL_PAGE.test(pathname)) return NextResponse.redirect(new URL("/collection-pages", request.url));
  }

  if (!merchantAppOn()) {
    if (MERCHANT_APIS.test(pathname))
      return NextResponse.json({ ok: false, error: "This feature is turned off." }, { status: 404 });
    if (MERCHANT_PAGES.test(pathname) || pathname === "/design")
      return NextResponse.redirect(new URL("/collection-pages", request.url));
  }

  /* With the app on, sign-in and register are reachable while signed out. */
  if (pathname === "/design/login" || pathname === "/design/register") return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    if (crossSite(request))
      return NextResponse.json({ ok: false, error: "Cross-site request refused." }, { status: 403 });
    return NextResponse.next();
  }

  if (request.cookies.has(STORE_COOKIE)) return NextResponse.next();

  const login = new URL("/design/login", request.url);
  /* Where they were headed, so signing in lands them there instead of dumping
     them on the brief. Path only — an absolute URL here would be an open
     redirect. */
  if (pathname !== "/design") login.searchParams.set("next", pathname);
  return NextResponse.redirect(login);
}

export const config = {
  /* The merchant-facing screens (redirect to sign-in), and every API (CSRF
     check only — routes answer 401 JSON themselves, so fetch callers can
     react). Key-authenticated callers (the BPU scripts, the sync) are not
     browsers and send no Sec-Fetch-Site or Origin, so they pass. */
  matcher: [
    "/design",
    "/design/library",
    "/design/login",
    "/design/register",
    "/design/library/:path*",
    "/collection-pages/referral",
    "/collection-pages/referral/:path*",
    "/api/:path*",
  ],
};
