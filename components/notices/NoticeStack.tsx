"use client";

import { InstallPrompt } from "../pagefly/InstallPrompt";
import { ReviewPrompt } from "../review/ReviewPrompt";

/* ==========================================================================
   The bottom-right corner, when two things want it.

   Both of these used to carry `fixed bottom-4 right-4` themselves, which works
   right up until both are up at once — then they are in exactly the same
   place, one on top of the other, and the one underneath is a panel the
   merchant cannot read or close.

   So the corner belongs to this component and neither of them positions
   itself. A column that grows upward from the bottom, and the ORDER IS THE
   POINT: the install notice sits above the review, because it answers a
   question the merchant is holding right now — "why will this file not open" —
   while the review is asking them for a favour. The urgent one should not be
   the one that gets pushed off the screen.

   `pointer-events-none` on the column with `auto` on the children, so the
   empty space above a short stack does not swallow clicks on the page beneath.
   ========================================================================== */

export function NoticeStack() {
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col items-end gap-3 [&>*]:pointer-events-auto">
      <InstallPrompt />
      <ReviewPrompt />
    </div>
  );
}
