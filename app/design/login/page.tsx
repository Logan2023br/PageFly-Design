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
  searchParams: Promise<{ next?: string; domain?: string }>;
}) {
  const { next, domain } = await searchParams;

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
  /* Only a path on this site is honoured, and checked BEFORE either use — the
     signed-in redirect used the raw value, which made
     /design/login?next=https://evil.example an open redirect. */
  const target = safeNext(next);
  if (signedIn) redirect(target);

  /* Carried from the front door, where a `?login=` link found a real store
     that has no account yet: the visitor typed it once and should not have to
     type it again. Trimmed to a sane length — it only prefills a box a merchant
     can edit, but it does come off a URL. */
  const prefill = domain && domain.length <= 255 ? domain : undefined;

  return <LoginScreen next={target} initialDomain={prefill} />;
}

/** `next` if it is a path on this site, else /design. "//host" and "/\\host"
    are other sites to a browser, and so is anything that resolves off-origin. */
function safeNext(next: string | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || /[\\\s]/.test(next)) return "/design";
  try {
    const u = new URL(next, "https://same.invalid");
    return u.origin === "https://same.invalid" ? `${u.pathname}${u.search}${u.hash}` : "/design";
  } catch {
    return "/design";
  }
}
