import "server-only";

import { readAdminSection } from "@/lib/session";
import { apiKeyOk } from "./api";
import { getDesign, type DesignView } from "./designs";
import { VISIBLE } from "./types";

/* ==========================================================================
   Who may see a design.

   The customer: once the lead is `sent` or later, until it expires, and never
   a rejected one. An admin or the Builder (API key): always, any version —
   that is how a page is reviewed before anyone outside sees it.
   ========================================================================== */

export type Viewer = "customer" | "admin" | "key";

export type Access =
  | { ok: true; view: DesignView; viewer: Viewer }
  | { ok: false; reason: "missing" | "expired" | "rejected" | "not_sent" };

export function customerState(view: DesignView): "ok" | "expired" | "rejected" | "not_sent" | "purged" {
  if (view.lead.status === "rejected") return "rejected";
  if (!VISIBLE.has(view.lead.status)) return "not_sent";
  if (view.design.files_purged_at) return "purged";
  if (view.design.expires_at && new Date(view.design.expires_at).getTime() < Date.now()) return "expired";
  return "ok";
}

export async function viewerOf(req: Request | null): Promise<Viewer> {
  if (req && req.headers.get("x-api-key") && apiKeyOk(req)) return "key";
  if (await readAdminSection("upsell")) return "admin";
  return "customer";
}

/** `version` is honoured for admin and key viewers only; a customer always
    gets the current pages. */
export async function access(id: string, req: Request | null, version?: number): Promise<Access> {
  const viewer = await viewerOf(req);
  const v = viewer === "customer" ? undefined : version;
  const view = await getDesign(id, v).catch(() => null);
  if (!view) return { ok: false, reason: "missing" };
  if (viewer !== "customer") return { ok: true, view, viewer };
  const state = customerState(view);
  if (state === "ok") return { ok: true, view, viewer };
  /* Before the send, a stranger learns nothing — not even that it exists. */
  return { ok: false, reason: state === "not_sent" ? "missing" : state === "purged" ? "expired" : state };
}
