import "server-only";

import { randomUUID } from "node:crypto";
import { getRepo } from "./db";

/* ==========================================================================
   The events only the server can honestly report.

   A BUILD TAKES FIFTEEN MINUTES AND THE SCREEN SAYS SO: "you can close this
   tab, it keeps building". Which means a browser is the wrong place to record
   whether one finished. Everybody who takes that advice would be missing from
   the completion count, and the rate would read as a product that fails far
   more often than it does — a number that would then be acted on.

   So `started` and `cancel` are the browser's, because they are things a
   person did, and `completed` and `failed` are the runner's, because they are
   things that happened whether or not anyone was watching. Both land in the
   same table.

   THE VISITOR ID IS THE STORE. There is no browser here to have one, and the
   column cannot be empty without breaking the distinct-visitor count that
   every funnel step is measured in. A store is the right unit for these two
   anyway: a build belongs to a shop, not to a tab.
   ========================================================================== */

export async function trackServer(
  name: string,
  props: Record<string, unknown>,
  domain: string,
): Promise<void> {
  /* Best effort, and silent. A build that finished must not be recorded as
     failed because the analytics write did — and this is called from the
     runner's own success path, where throwing would do exactly that. */
  await getRepo()
    .recordEvents([
      {
        id: randomUUID(),
        name,
        props,
        visitorId: `store:${domain}`,
        domain,
        /* NULL, AND IT HAS TO BE. These fire from the build runner, where the
           only address in sight is our own server's — stamping that would put
           every completed build in the data centre's country and make the
           country breakdown a lie about the busiest events in the product.
           Unplaced is the truthful answer: nobody's browser was involved. */
        country: null,
        createdAt: new Date().toISOString(),
      },
    ])
    .catch(() => {});
}
