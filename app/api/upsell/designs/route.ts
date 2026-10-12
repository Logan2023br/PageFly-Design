import { after } from "next/server";
import { fail, json, requireKey } from "@/lib/upsell/api";
import { captureMissingThumbs, uploadDesign, type UploadFields, type UploadFiles } from "@/lib/upsell/designs";
import { notifySlack } from "@/lib/upsell/notify";
import { UpsellError } from "@/lib/upsell/types";

/* ==========================================================================
   POST /api/upsell/designs   multipart/form-data

   Fields: lead_id, store_domain, store_name, category, language, page1_type,
   page1_title, page2_type, page2_title, build_note.
   Files:  page1_html, page1_pagefly, page2_html, page2_pagefly, and optional
   page1_thumb, page2_thumb (PNG).

   201 { id, url, version, admin_url }. A lead that already has a design gets
   a new version under the same id. A bad file is 422 with the reason.

   NGINX: its default client_max_body_size is 1 MB. Four files of up to 15 MB
   need `client_max_body_size 64m;` on this location, or nginx answers 413
   before this code runs.
   ========================================================================== */
export const dynamic = "force-dynamic";

const FIELD_NAMES = [
  "lead_id", "store_domain", "store_name", "category", "language",
  "page1_type", "page1_title", "page2_type", "page2_title", "build_note",
] as const;
const FILE_NAMES = ["page1_html", "page1_pagefly", "page2_html", "page2_pagefly", "page1_thumb", "page2_thumb"] as const;

export async function POST(req: Request) {
  const denied = requireKey(req);
  if (denied) return denied;
  try {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new UpsellError("Send multipart/form-data.", 400);
    }
    const fields: Record<string, string> = {};
    for (const k of FIELD_NAMES) {
      const v = form.get(k);
      if (typeof v === "string") fields[k] = v.trim();
    }
    const files: Record<string, Uint8Array | null> = {};
    for (const k of FILE_NAMES) {
      const v = form.get(k);
      files[k] = v && typeof v !== "string" ? new Uint8Array(await v.arrayBuffer()) : null;
    }
    const result = await uploadDesign(fields as unknown as UploadFields, files as unknown as UploadFiles);
    after(async () => {
      await captureMissingThumbs(result.id, result.version, result.thumbs_missing).catch((e) => console.error("[upsell] thumbs", e));
      await notifySlack("lead").catch(() => undefined);
    });
    const { thumbs_missing: _omit, ...body } = result;
    void _omit;
    return json(body, 201);
  } catch (err) {
    return fail(err);
  }
}
