import { redirect } from "next/navigation";

/* Thin entry point — the feature lives at /design. */
export default function Home() {
  redirect("/design");
}
