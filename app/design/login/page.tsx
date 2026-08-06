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
  try {
    if (await currentAccount()) redirect(next ?? "/design");
  } catch {
    // fall through to the form
  }

  /* Only same-site paths are honoured. Taking the raw value would turn this
     into an open redirect: /design/login?next=https://evil.example. */
  const target =
    next && next.startsWith("/") && !next.startsWith("//") ? next : "/design";

  return <LoginScreen next={target} />;
}
