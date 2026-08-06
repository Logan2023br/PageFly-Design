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

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (request.cookies.has(STORE_COOKIE)) return NextResponse.next();

  const login = new URL("/design/login", request.url);
  /* Where they were headed, so signing in lands them there instead of dumping
     them on the brief. Path only — an absolute URL here would be an open
     redirect. */
  if (pathname !== "/design") login.searchParams.set("next", pathname);
  return NextResponse.redirect(login);
}

export const config = {
  /* Only the merchant-facing screens. /design/login must stay reachable while
     signed out, /design/admin has its own credentials, and the API routes
     answer with 401 JSON rather than a redirect so fetch callers can react. */
  matcher: ["/design", "/design/library"],
};
