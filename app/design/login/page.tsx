import { redirect } from "next/navigation";
import { LoginScreen } from "@/components/auth/LoginScreen";
import { currentAccount } from "@/lib/account";

/* ==========================================================================
   /design/login
   ========================================================================== */

export const metadata = { title: "Sign in — PageFly Design" };

/** Reads a session cookie, so it cannot be prerendered. */
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  /* Already signed in — no reason to show a form. Wrapped because a database
     that is unreachable should show the form, not an error page. */
  let signedIn = false;
  try {
    signedIn = Boolean(await currentAccount());
  } catch {
    // fall through to the form
  }
  /* `redirect` OUTSIDE THE TRY, and the Next docs shipped in this repo say so
     outright: "redirect throws an error so it should be called outside the try
     block when using try/catch statements." Inside one, the bare catch swallows
     the NEXT_REDIRECT it throws and the redirect silently does not happen — so
     the guard reads as working and never fires. The try is only around the
     database call, which is the part that may legitimately fail. */
  if (signedIn) redirect(next ?? "/design");

  /* Only same-site paths are honoured. Taking the raw value would turn this
     into an open redirect: /design/login?next=https://evil.example. */
  const target =
    next && next.startsWith("/") && !next.startsWith("//") ? next : "/design";

  return <LoginScreen next={target} />;
}
