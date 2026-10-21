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

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

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
  matcher: ["/design", "/design/library", "/api/:path*"],
};
