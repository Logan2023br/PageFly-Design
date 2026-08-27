import { LandingScreen } from "@/components/landing/LandingScreen";

/* The public front door. Everything behind a sign-in lives at /design, which
   `proxy.ts` guards; this route is deliberately outside that matcher. */
export default function Home() {
  return <LandingScreen />;
}
