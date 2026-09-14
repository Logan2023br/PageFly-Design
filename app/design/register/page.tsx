import { redirect } from "next/navigation";
import { RegisterScreen } from "@/components/auth/RegisterScreen";
import { currentAccount } from "@/lib/account";

/* ==========================================================================
   /design/register

   Beside /design/login rather than at the root, because it is the same screen
   with three fields — the proxy guard already treats everything under /design
   as the merchant-facing app, and a sign-up living somewhere else would be the
   one page in this product with its own address shape.
   ========================================================================== */

export const metadata = { title: "Register — PageFly Design" };

/** Reads a session cookie, so it cannot be prerendered. */
export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  /* Already signed in — there is nothing here for them, and a form that
     creates a second row for the store they are currently using is the worst
     thing this page could offer. Wrapped because an unreachable database
     should show the form, not an error page: the same treatment /design/login
     gives it. */
  let signedIn = false;
  try {
    signedIn = Boolean(await currentAccount());
  } catch {
    // Unreachable database — show the form rather than an error page.
  }
  /* `redirect` OUTSIDE THE TRY, and the Next docs shipped in this repo say so
     outright: "redirect throws an error so it should be called outside the try
     block when using try/catch statements." Inside one, the bare catch swallows
     the NEXT_REDIRECT it throws and the redirect silently does not happen — so
     the guard reads as working and never fires. The try is only around the
     database call, which is the part that may legitimately fail. */
  if (signedIn) redirect("/design");

  return <RegisterScreen />;
}
