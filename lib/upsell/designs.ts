import "server-only";

import { kickSoon } from "./routines";
import { rejectFile } from "@/lib/collectionPagesServer";
import { db, tx } from "./db";
import { adminLeadUrl, designUrl, newDesignId, recordEvent } from "./common";
import { lockLead, updateLead } from "./leads";
import { approveLead } from "./review";
import { getSettings } from "./settings";
import { MAX_UPSELL_FILE_BYTES, getFile, putFile, relPath } from "./storage";
import { PAGE_TYPES, UpsellError, type DesignRow, type LeadRow, type PageRow } from "./types";

/* ==========================================================================
   Designs: the two pages the Builder uploads for a lead.

   ONE DESIGN PER LEAD, ONE ID FOR EVER. A rebuild is a new version under the
   same id, so the link in a message already sent keeps working and opens the
   newest pages. Older versions stay on disk and in upsell_pages as history.
   ========================================================================== */

const PNG = [0x89, 0x50, 0x4e, 0x47];

export type UploadFields = {
  lead_id: string;
  store_domain?: string;
  store_name?: string;
  category?: string;
  language?: string;
  page1_type: string;
  page1_title?: string;
  page2_type: string;
  page2_title?: string;
  build_note?: string;
  /** "1"/"true": example products, the storefront was password-protected */
  sample?: string;
};

export type UploadFiles = {
  page1_html: Uint8Array;
  page1_pagefly: Uint8Array;
  page2_html: Uint8Array;
  page2_pagefly: Uint8Array;
  page1_thumb?: Uint8Array | null;
  page2_thumb?: Uint8Array | null;
};

export type UploadResult = { id: string; url: string; version: number; admin_url: string; thumbs_missing: number[]; auto_approved: boolean };

/** The lead may receive pages from these statuses — a build was asked for. */
const UPLOAD_FROM = new Set(["new", "building", "rebuild_requested"]);

export function validateUpload(f: Partial<UploadFields>, files: Partial<UploadFiles>): string | null {
  if (!f.lead_id) return "lead_id is required.";
  for (const slot of [1, 2] as const) {
    const type = f[`page${slot}_type`];
    if (!type || !(PAGE_TYPES as readonly string[]).includes(type))
      return `page${slot}_type must be one of ${PAGE_TYPES.join(", ")}.`;
    for (const kind of ["html", "pagefly"] as const) {
      const bytes = files[`page${slot}_${kind}`];
      const name = `page${slot}_${kind}`;
      if (!bytes) return `${name} is missing.`;
      if (bytes.length > MAX_UPSELL_FILE_BYTES) return `${name} is over 15 MB.`;
      const why = rejectFile(kind, bytes);
      if (why) return `${name}: ${why}`;
    }
    const thumb = files[`page${slot}_thumb`];
    if (thumb) {
      if (thumb.length > MAX_UPSELL_FILE_BYTES) return `page${slot}_thumb is over 15 MB.`;
      if (!PNG.every((b, i) => thumb[i] === b)) return `page${slot}_thumb is not a PNG.`;
    }
  }
  return null;
}

export async function uploadDesign(f: UploadFields, files: UploadFiles, actor = "claude"): Promise<UploadResult> {
  const invalid = validateUpload(f, files);
  if (invalid) throw new UpsellError(invalid, 422);

  const result = await tx(async (c) => {
    const lead = await lockLead(c, f.lead_id);
    if (f.store_domain && f.store_domain.trim().toLowerCase() !== lead.store_domain)
      throw new UpsellError(`store_domain ${f.store_domain} does not match lead ${lead.lead_id} (${lead.store_domain}).`, 422);
    if (!UPLOAD_FROM.has(lead.status))
      throw new UpsellError(`Lead ${lead.lead_id} is ${lead.status}; pages are only accepted while it waits for a build.`, 409);

    const sample = /^(1|true|yes)$/i.test(f.sample ?? "");
    const existing = await c.query<DesignRow>("select * from upsell_designs where lead_id = $1 for update", [lead.lead_id]);
    let design = existing.rows[0];
    if (design) {
      const version = design.version + 1;
      await c.query(
        "update upsell_designs set version = $2, category = coalesce($3, category), language = coalesce($4, language), sample = $5 where id = $1",
        [design.id, version, f.category || null, f.language || null, sample],
      );
      design = { ...design, version, sample };
    } else {
      /* Collisions in 32^8 are not worth a retry loop's complexity — but they
         are worth not overwriting someone else's design over. */
      const id = newDesignId();
      const ins = await c.query<DesignRow>(
        "insert into upsell_designs (id, lead_id, version, category, language, sample) values ($1,$2,1,$3,$4,$5) returning *",
        [id, lead.lead_id, f.category || null, f.language || null, sample],
      );
      design = ins.rows[0];
    }

    const thumbsMissing: number[] = [];
    for (const slot of [1, 2] as const) {
      const html = files[`page${slot}_html`];
      const pf = files[`page${slot}_pagefly`];
      const thumb = files[`page${slot}_thumb`] ?? null;
      const htmlPath = relPath(design.id, design.version, slot, "html");
      const pfPath = relPath(design.id, design.version, slot, "pagefly");
      const thumbPath = thumb ? relPath(design.id, design.version, slot, "png") : null;
      await putFile(htmlPath, html);
      await putFile(pfPath, pf);
      if (thumb && thumbPath) await putFile(thumbPath, thumb);
      else thumbsMissing.push(slot);
      await c.query(
        `insert into upsell_pages (design_id, version, slot, type, title, html_path, pagefly_path, thumb_path, size_bytes)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         on conflict (design_id, version, slot) do update set type = excluded.type, title = excluded.title,
           html_path = excluded.html_path, pagefly_path = excluded.pagefly_path, thumb_path = excluded.thumb_path,
           size_bytes = excluded.size_bytes`,
        [design.id, design.version, slot, f[`page${slot}_type`], f[`page${slot}_title`] || null, htmlPath, pfPath, thumbPath, pf.length],
      );
    }

    await updateLead(c, lead.lead_id, {
      status: "pending_review",
      built_at: new Date().toISOString(),
      page1_type: f.page1_type,
      page2_type: f.page2_type,
      rebuild_note: null,
      build_note: f.build_note || null,
      error: null,
      ...(f.store_name && !lead.store_name ? { store_name: f.store_name } : {}),
    });
    await recordEvent(c, {
      lead_id: lead.lead_id,
      design_id: design.id,
      type: "built",
      actor,
      detail: { from: lead.status, to: "pending_review", version: design.version, page1: f.page1_type, page2: f.page2_type, sample },
    });
    return { id: design.id, version: design.version, thumbsMissing };
  });

  /* "Tự duyệt" on Chờ duyệt page: the pages are approved as they arrive and
     the first message goes out in the customer's hours, as "auto". If that
     fails the lead simply stays in Chờ duyệt page, as in manual mode. */
  let autoApproved = false;
  if ((await getSettings()).page_review_mode === "auto") {
    try {
      await approveLead(f.lead_id, { send_mode: "window", autoSend: true }, "auto");
      autoApproved = true;
    } catch (err) {
      console.error(`[upsell] auto-approve ${f.lead_id} failed:`, err);
    }
  }

  /* The next lead in the queue, and the first message if it was approved. */
  kickSoon("build xong");
  return {
    auto_approved: autoApproved,
    id: result.id,
    url: designUrl(result.id),
    version: result.version,
    admin_url: adminLeadUrl(f.lead_id),
    thumbs_missing: result.thumbsMissing,
  };
}

/* ---- thumbnails ---------------------------------------------------------- */

/**
 * Screenshot a page's HTML when the Builder sent no thumbnail.
 *
 * PLAYWRIGHT IS OPTIONAL and not in package.json: it brings a 150 MB browser,
 * and the screens fall back to a scaled live preview when a thumbnail is
 * missing. To turn this on, on the VPS:
 *     npm i playwright && npx playwright install --with-deps chromium
 * Loaded through a computed specifier so the bundler does not try to resolve
 * a package that is not installed.
 */
/** What a thumbnail may load: data URIs and the public CDNs pages use. */
const THUMB_HOSTS =
  /^(data:|https:\/\/(cdn\.shopify\.com|[a-z0-9-]+\.myshopify\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|images\.unsplash\.com|images\.pexels\.com|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net)\/)/i;

export async function captureMissingThumbs(designId: string, version: number, slots: number[]): Promise<number> {
  if (slots.length === 0) return 0;
  type PwRoute = { request: () => { url: () => string }; continue: () => Promise<void>; abort: () => Promise<void> };
  type Pw = { chromium: { launch: (o: object) => Promise<{ newPage: (o: object) => Promise<{ route: (pattern: string, h: (r: PwRoute) => Promise<void>) => Promise<void>; setContent: (h: string, o: object) => Promise<void>; screenshot: (o: object) => Promise<Buffer> }>; close: () => Promise<void> }> } };
  let pw: Pw;
  try {
    const load = new Function("m", "return import(m)") as (m: string) => Promise<Pw>;
    pw = await load("playwright");
  } catch {
    return 0;
  }
  const p = await db();
  let made = 0;
  /* Chromium's own sandbox stays ON. Only an operator who has to run it as
     root (where Chromium refuses to start sandboxed) turns it off, knowingly:
     UPSELL_THUMB_NO_SANDBOX=1. Without either, there is simply no thumbnail
     and the screens show the live preview instead. */
  const browser = await pw.chromium.launch(process.env.UPSELL_THUMB_NO_SANDBOX === "1" ? { args: ["--no-sandbox"] } : {});
  try {
    for (const slot of slots) {
      const { rows } = await p.query<PageRow>("select * from upsell_pages where design_id=$1 and version=$2 and slot=$3", [designId, version, slot]);
      const html = await getFile(rows[0]?.html_path ?? null);
      if (!html) continue;
      /* The HTML is model output built from a merchant's storefront. It is
         drawn, not run: no JavaScript, and only https requests to the CDNs a
         page's images and fonts come from — never this server's network. */
      const page = await browser.newPage({ viewport: { width: 1280, height: 1600 }, javaScriptEnabled: false });
      await page.route("**/*", (r) => (THUMB_HOSTS.test(r.request().url()) ? r.continue() : r.abort()));
      await page.setContent(html.toString("utf8"), { waitUntil: "networkidle", timeout: 30_000 }).catch(() => undefined);
      const png = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 1280, height: 1600 } });
      const rel = relPath(designId, version, slot, "png");
      await putFile(rel, png);
      await p.query("update upsell_pages set thumb_path=$4 where design_id=$1 and version=$2 and slot=$3", [designId, version, slot, rel]);
      made++;
    }
  } finally {
    await browser.close();
  }
  return made;
}

/* ---- reads --------------------------------------------------------------- */

export type DesignView = {
  design: DesignRow;
  lead: LeadRow;
  pages: PageRow[];
  versions: number[];
};

/** A design with the pages of one version (the current one by default). */
export async function getDesign(id: string, version?: number): Promise<DesignView | null> {
  if (!/^[A-Z0-9]{8}$/.test(id)) return null;
  const p = await db();
  const d = await p.query<DesignRow>("select * from upsell_designs where id = $1", [id]);
  const design = d.rows[0];
  if (!design) return null;
  const v = version ?? design.version;
  const [l, pages, vs] = await Promise.all([
    p.query<LeadRow>("select * from upsell_leads where lead_id = $1", [design.lead_id]),
    p.query<PageRow>("select * from upsell_pages where design_id = $1 and version = $2 order by slot", [id, v]),
    p.query<{ version: number }>("select distinct version from upsell_pages where design_id = $1 order by version desc", [id]),
  ]);
  if (!l.rows[0]) return null;
  return { design, lead: l.rows[0], pages: pages.rows, versions: vs.rows.map((r) => r.version) };
}

export async function getDesignForLead(leadId: string): Promise<DesignView | null> {
  const p = await db();
  const { rows } = await p.query<{ id: string }>("select id from upsell_designs where lead_id = $1", [leadId]);
  return rows[0] ? getDesign(rows[0].id) : null;
}

/** Download file name: `{store}-{type}.pagefly`, safe for a header. */
export function downloadName(lead: LeadRow, page: PageRow): string {
  const store = (lead.store_domain.replace(/\.myshopify\.com$/, "") || "store").replace(/[^a-z0-9-]+/gi, "-");
  const type = String(page.type).replace(/[^a-z0-9-]+/gi, "-");
  return `${store}-${type}.pagefly`;
}
