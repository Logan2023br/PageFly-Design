import { DesignApp } from "@/components/DesignApp";
import { currentAccount } from "@/lib/account";

/* The session and the page allowance are read here and handed to the client, so
   a reload always reflects the server without a second round trip. Reading a
   cookie opts this route into dynamic rendering, which is the intent. */
export const dynamic = "force-dynamic";

export default async function DesignPage() {
  const account = await currentAccount().catch(() => null);
  return <DesignApp account={account} />;
}
