"use client";

import { useEffect } from "react";

/* ==========================================================================
   PageFly Support's Crisp chat, on /new-page only.

   session:data ties the conversation to the lead, so whoever answers sees
   which store and which design the merchant is looking at without asking.
   Nothing personal is pushed — the domain and two ids, all already in the URL
   or the conversation.
   ========================================================================== */

export const CRISP_WEBSITE_ID = "7cd1799e-e8eb-476e-8cb7-33778fc41c2a";

type CrispQueue = unknown[][] & { push: (cmd: unknown[]) => void };
declare global {
  interface Window {
    $crisp?: CrispQueue;
    CRISP_WEBSITE_ID?: string;
  }
}

function queue(): CrispQueue {
  if (!window.$crisp) window.$crisp = [] as unknown as CrispQueue;
  return window.$crisp;
}

export function openCrispChat(): void {
  queue().push(["do", "chat:open"]);
}

export function CrispChat({
  storeDomain,
  leadId,
  designId,
}: {
  storeDomain?: string | null;
  leadId?: string | null;
  designId?: string | null;
}) {
  useEffect(() => {
    const q = queue();
    window.CRISP_WEBSITE_ID = CRISP_WEBSITE_ID;
    const data: [string, string][] = [];
    if (storeDomain) data.push(["store_domain", storeDomain]);
    if (leadId) data.push(["lead_id", leadId]);
    if (designId) data.push(["upsell_design_id", designId]);
    if (data.length) q.push(["set", "session:data", [data]]);

    if (!document.querySelector('script[src="https://client.crisp.chat/l.js"]')) {
      const s = document.createElement("script");
      s.src = "https://client.crisp.chat/l.js";
      s.async = true;
      document.head.appendChild(s);
    }
  }, [storeDomain, leadId, designId]);
  return null;
}
