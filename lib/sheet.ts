import "server-only";

import { createSign } from "node:crypto";
import type { StoreRecord } from "./db/types";

/* ==========================================================================
   The allowlist sheet.

   Three ways in, because the sheet is private and which one is acceptable is
   the operator's call, not ours:

   1. SHEET_SERVICE_ACCOUNT_JSON + ALLOWLIST_SHEET_ID — a Google service account
      reads the sheet directly. The sheet stays private; share it with the
      service account's email as Viewer. This is the recommended path.

   2. ALLOWLIST_SHEET_CSV_URL — any URL returning CSV, including a
      File > Share > Publish to web CSV link.
      NOTE: publishing THIS sheet to the web exposes merchant email addresses to
      anyone who finds the URL. Use it for a scratch copy, not the real list.

   3. POST /api/admin/sync — n8n (or anything else) pushes rows in. Nothing here
      needs Google credentials at all, which suits a setup that already has an
      authenticated Google node.

   Whichever is used, rows land in the same mapper and are cached in Postgres, so
   a sign-in never depends on Google being reachable at that moment.
   ========================================================================== */

export const SHEET_ID =
  process.env.ALLOWLIST_SHEET_ID ??
  "13gh6ymdVQLzeQARArytZWqWmNA6uAd4Si_kaum1fOcw";

export const SHEET_TAB = process.env.ALLOWLIST_SHEET_TAB ?? "User Beta";

export type SheetSource = "service-account" | "csv-url" | "none";

export function sheetSource(): SheetSource {
  if (process.env.SHEET_SERVICE_ACCOUNT_JSON) return "service-account";
  if (process.env.ALLOWLIST_SHEET_CSV_URL) return "csv-url";
  return "none";
}

/* ---- domain normalisation ------------------------------------------------ */

/**
 * One canonical form for a domain, applied to both the sheet value and whatever
 * the merchant types. Without this, "MyStore.myshopify.com/" and
 * "https://mystore.myshopify.com" are three different stores and the allowlist
 * misses two of them.
 */
export function normalizeDomain(input: string): string {
  let value = input.trim().toLowerCase();
  value = value.replace(/^[a-z]+:\/\//, "");
  value = value.replace(/^www\./, "");
  value = value.split(/[/?#]/)[0];
  return value.replace(/\.+$/, "");
}

/* ---- CSV ----------------------------------------------------------------- */

/** Full CSV parse: quoted fields, embedded commas, newlines and "" escapes.
    A split(",") would break on the very first store name containing a comma. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }

    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") field += ch;
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/* ---- header matching ---------------------------------------------------- */

/** Accent- and case-insensitive, so "Quốc gia" matches "quoc gia" and the
    sheet's existing "Reivew" typo matches too. */
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/* Columns are matched by name, not position, so inserting a column in the sheet
   does not silently shift every field by one. The sheet's "Reivew" spelling is
   listed alongside the correct one on purpose. */
const COLUMNS = {
  domain: ["storedomain", "domain", "store", "shopdomain"],
  email: ["email", "mail"],
  storeName: ["tenstore", "storename", "name"],
  shopifyPlan: ["shopifyplan", "plan"],
  currentPlan: ["goihientai", "currentplan", "package"],
  daysUsed: ["songaydadung", "daysused", "days"],
  country: ["quocgia", "country"],
  userType: ["typeuser", "usertype", "type"],
  status: ["status", "trangthai"],
  pages: ["sopage", "pages", "pagecount"],
  review: ["reivew", "review", "stars", "rating"],
  comment: ["comment", "nhanxet", "feedback"],
} as const;

type ColumnKey = keyof typeof COLUMNS;

function indexHeaders(header: string[]): Partial<Record<ColumnKey, number>> {
  const folded = header.map(fold);
  const out: Partial<Record<ColumnKey, number>> = {};
  for (const [key, aliases] of Object.entries(COLUMNS) as [
    ColumnKey,
    readonly string[],
  ][]) {
    /* Exact match first. A "contains" pass alone would let "sopage" also match
       a hypothetical "sopagedaxoa", and the first column would win by accident. */
    let at = folded.findIndex((h) => aliases.includes(h));
    if (at === -1)
      at = folded.findIndex((h) => aliases.some((a) => h.startsWith(a)));
    if (at !== -1) out[key] = at;
  }
  return out;
}

const DEFAULT_PAGE_LIMIT = Number(process.env.DEFAULT_PAGE_LIMIT ?? 30);

/** "09/30" -> 30. A bare "12" is read as a limit, not as usage. */
function readPageLimit(cell: string | undefined): number {
  if (!cell) return DEFAULT_PAGE_LIMIT;
  const parts = cell.split("/");
  const limit = Number(parts[parts.length - 1]?.replace(/[^\d]/g, ""));
  return Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_PAGE_LIMIT;
}

function readInt(cell: string | undefined): number | null {
  if (!cell) return null;
  const n = Number(cell.replace(/[^\d-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export type SheetRow = { store: StoreRecord; review: number | null; comment: string | null };

/** Rows -> records. Exported so the push endpoint and the pull path share it. */
export function rowsToStores(rows: string[][]): SheetRow[] {
  if (rows.length < 2) return [];
  const at = indexHeaders(rows[0]);
  if (at.domain === undefined) return [];

  const out: SheetRow[] = [];
  const seen = new Set<string>();

  for (const row of rows.slice(1)) {
    const cell = (key: ColumnKey) => {
      const i = at[key];
      return i === undefined ? undefined : row[i]?.trim();
    };

    const domain = normalizeDomain(cell("domain") ?? "");
    // A blank domain is an empty spreadsheet row, of which there are hundreds.
    if (!domain || seen.has(domain)) continue;
    seen.add(domain);

    out.push({
      store: {
        domain,
        email: cell("email") ?? null,
        storeName: cell("storeName") ?? null,
        shopifyPlan: cell("shopifyPlan") ?? null,
        currentPlan: cell("currentPlan") ?? null,
        daysUsed: readInt(cell("daysUsed")),
        country: cell("country") ?? null,
        userType: cell("userType") ?? null,
        status: cell("status") ?? null,
        pageLimit: readPageLimit(cell("pages")),
        firstSeenAt: null,
        lastSeenAt: null,
        blocked: false,
      },
      review: readInt(cell("review")),
      comment: cell("comment") ?? null,
    });
  }
  return out;
}

/* ---- service account ---------------------------------------------------- */

/** Signs the assertion Google expects and trades it for an access token. Done
    by hand because a full Google SDK is a large dependency for one RSA sign. */
async function serviceAccountToken(): Promise<string> {
  const raw = process.env.SHEET_SERVICE_ACCOUNT_JSON!;
  const key = JSON.parse(raw) as { client_email: string; private_key: string };

  const now = Math.floor(Date.now() / 1000);
  const b64 = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj))
      .toString("base64url");

  const unsigned =
    b64({ alg: "RS256", typ: "JWT" }) +
    "." +
    b64({
      iss: key.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    });

  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  const jwt = `${unsigned}.${signer.sign(key.private_key, "base64url")}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok)
    throw new Error(`Google rejected the service account: ${res.status}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

async function fetchViaServiceAccount(): Promise<string[][]> {
  const token = await serviceAccountToken();
  const range = encodeURIComponent(`${SHEET_TAB}!A1:Z1000`);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}`,
    { headers: { authorization: `Bearer ${token}` }, cache: "no-store" },
  );
  if (!res.ok) throw new Error(`Sheets API returned ${res.status}`);
  const body = (await res.json()) as { values?: string[][] };
  return body.values ?? [];
}

async function fetchViaCsv(url: string): Promise<string[][]> {
  const res = await fetch(url, { cache: "no-store", redirect: "follow" });
  if (!res.ok) throw new Error(`CSV source returned ${res.status}`);
  const text = await res.text();
  /* A private sheet answers 401 with an HTML sign-in page. Without this check it
     would parse as one nonsense row and read as "the allowlist is empty", which
     locks every merchant out and looks like a code bug. */
  if (/^\s*<(!doctype|html)/i.test(text))
    throw new Error(
      "That URL returned a sign-in page, not CSV — the sheet is not readable without credentials.",
    );
  return parseCsv(text);
}

export type PullResult =
  | { ok: true; rows: SheetRow[]; source: SheetSource }
  | { ok: false; reason: string; source: SheetSource };

/** Pull the sheet through whichever source is configured. */
export async function pullSheet(): Promise<PullResult> {
  const source = sheetSource();
  try {
    if (source === "service-account")
      return { ok: true, rows: rowsToStores(await fetchViaServiceAccount()), source };
    if (source === "csv-url")
      return {
        ok: true,
        rows: rowsToStores(
          await fetchViaCsv(process.env.ALLOWLIST_SHEET_CSV_URL!),
        ),
        source,
      };
    return {
      ok: false,
      source,
      reason:
        "No sheet source configured. Set SHEET_SERVICE_ACCOUNT_JSON (recommended) " +
        "or ALLOWLIST_SHEET_CSV_URL, or push rows to /api/admin/sync.",
    };
  } catch (err) {
    return { ok: false, source, reason: (err as Error).message };
  }
}
