import "server-only";

import { serviceAccountEmail, sheetsWrite } from "@/lib/sheet";
import { UpsellError } from "@/lib/upsell/types";
import { composeMessage } from "./core";
import { db, logEvent } from "./db";
import { getNffSettings } from "./settings";

/* ==========================================================================
   Nhập từ Google Sheet: a list of stores (a sheet tab with a header row)
   becomes messages on Chờ duyệt — one per store, never twice. The columns
   are found by their header: the store's domain, its name, the Crisp link of
   the conversation to write in (the message goes there, no new one), and a
   priority, kept as a note. Read with the service account the other sheets
   use; the sheet must be shared with it (Viewer is enough).
   ========================================================================== */

const SA = () => process.env.URSP_SHEET_SA_JSON?.trim() || process.env.GOOGLE_SA_JSON?.trim() || null;
export const importSheetEmail = () => serviceAccountEmail(SA());

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();

function column(header: string[], ...names: string[]): number {
  const h = header.map(norm);
  for (const n of names) {
    const i = h.findIndex((x) => x === n);
    if (i >= 0) return i;
  }
  for (const n of names) {
    const i = h.findIndex((x) => x.includes(n));
    if (i >= 0) return i;
  }
  return -1;
}

const domainOf = (v: string) => {
  const d = v.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(d) ? d : null;
};
const sessionOf = (link: string) => /session_[0-9a-f-]{36}/i.exec(link)?.[0] ?? null;

export type ImportResult = { sheet: string; rows: number; added: number; existing: number; noCrisp: number; bad: number };

export async function importSheet(url: string, by: string): Promise<ImportResult> {
  const sa = SA();
  if (!sa) throw new UpsellError("Server chưa có service account (URSP_SHEET_SA_JSON).", 409);
  const id = /\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/.exec(url)?.[1];
  if (!id) throw new UpsellError("Không đọc được link Google Sheet.", 422);
  const gid = Number(/[#?&]gid=(\d+)/.exec(url)?.[1] ?? NaN);

  let meta: { sheets: { properties: { sheetId: number; title: string } }[] };
  try {
    meta = await sheetsWrite(id, "?fields=sheets.properties(sheetId,title)", sa, undefined, "GET");
  } catch (err) {
    throw new UpsellError(
      `Không mở được sheet — chia sẻ sheet cho ${importSheetEmail() ?? "service account"} (quyền Viewer) rồi thử lại. (${err instanceof Error ? err.message : err})`,
      403,
    );
  }
  const tab = meta.sheets.find((s) => s.properties.sheetId === gid) ?? meta.sheets[0];
  const title = tab.properties.title;
  const got = await sheetsWrite<{ values?: string[][] }>(id, `/values/${encodeURIComponent(`'${title.replace(/'/g, "''")}'!A1:Z3000`)}`, sa, undefined, "GET");
  const [header = [], ...rows] = got.values ?? [];
  const cDomain = column(header, "store domain", "domain", "shop domain", "store");
  const cName = column(header, "ten store", "store name", "ten shop", "name");
  const cCrisp = column(header, "link crisp", "crisp", "ticket");
  const cPrio = column(header, "muc uu tien", "priority");
  const cEmail = column(header, "email");
  if (cDomain < 0) throw new UpsellError(`Sheet "${title}" không có cột Store domain.`, 422);

  const cfg = await getNffSettings();
  const p = await db();
  const out: ImportResult = { sheet: title, rows: 0, added: 0, existing: 0, noCrisp: 0, bad: 0 };
  for (const r of rows) {
    const domain = domainOf(String(r[cDomain] ?? ""));
    if (!domain) {
      if (String(r[cDomain] ?? "").trim()) out.bad++;
      continue;
    }
    out.rows++;
    const name = cName >= 0 ? String(r[cName] ?? "").trim() || null : null;
    const link = cCrisp >= 0 ? String(r[cCrisp] ?? "").trim() : "";
    const sid = sessionOf(link);
    if (!sid) out.noCrisp++;
    const ins = await p.query<{ id: string }>(
      `insert into nff_targets (store_domain, store_name, email, session_id, ticket_link, status, message, source, note)
       values ($1, $2, $3, $4, $5, 'pending', $6, $7, $8) on conflict (store_domain) do nothing returning id`,
      [
        domain,
        name,
        cEmail >= 0 ? String(r[cEmail] ?? "").trim() || null : null,
        sid,
        sid ? link : null,
        composeMessage({ store_name: name, store_domain: domain }, cfg),
        `Sheet · ${title}`,
        cPrio >= 0 ? String(r[cPrio] ?? "").trim() || null : null,
      ],
    );
    if (ins.rows[0]) {
      out.added++;
      await logEvent(ins.rows[0].id, "queued", by, { from: `Sheet · ${title}` });
    } else out.existing++;
  }
  return out;
}
