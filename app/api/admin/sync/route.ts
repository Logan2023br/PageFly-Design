import { timingSafeEqual, createHash } from "node:crypto";
import { z } from "zod";
import { getRepo } from "@/lib/db";
import { readAdminSession } from "@/lib/session";
import { parseCsv, pullSheet, rowsToStores, sheetSource } from "@/lib/sheet";

/* ==========================================================================
   POST /api/admin/sync

   Two callers, two ways to authorise:

   - the admin UI's "Sync now", authorised by the admin session cookie
   - n8n (or any scheduler), authorised by an `x-sync-secret` header

   Three ways to supply data:

   - a body with `rows` (raw sheet values, header first) — the push model, which
     needs no Google credentials on our side because the caller already has them
   - a body with `csv` — the same thing pasted straight out of the spreadsheet,
     which is the fastest way to get a private sheet in without setting up any
     Google access at all
   - an empty body — pull through whatever source is configured

   The push model is the one to prefer with n8n: the sheet holds merchant email
   addresses, and pushing keeps it private instead of requiring a public link.
   ========================================================================== */

const bodySchema = z
  .object({
    rows: z.array(z.array(z.string())).optional(),
    /** Raw CSV or TSV, header row first. Parsed with the same reader the pull
        path uses, so a paste and a fetch cannot disagree. */
    csv: z.string().max(2_000_000).optional(),
  })
  .optional();

function secretMatches(header: string | null): boolean {
  const expected = process.env.SYNC_SECRET;
  if (!expected || !header) return false;
  // Hashed first so the compare is constant time regardless of length.
  const digest = (v: string) => createHash("sha256").update(v).digest();
  return timingSafeEqual(digest(header), digest(expected));
}

export type SyncResponse =
  | { ok: true; stores: number; source: string }
  | { ok: false; error: string };

export async function POST(request: Request) {
  const authorised =
    secretMatches(request.headers.get("x-sync-secret")) ||
    (await readAdminSession());

  if (!authorised) {
    return Response.json(
      { ok: false, error: "Not authorised." } satisfies SyncResponse,
      { status: 401 },
    );
  }

  let body: z.infer<typeof bodySchema>;
  try {
    const text = await request.text();
    body = text ? bodySchema.parse(JSON.parse(text)) : undefined;
  } catch {
    return Response.json(
      { ok: false, error: "Body must be {rows: string[][]} or empty." } satisfies SyncResponse,
      { status: 400 },
    );
  }

  /* Pasting out of Google Sheets yields TAB-separated text, not CSV, and a
     merchant domain contains no tabs — so a tab in the first line is a reliable
     signal, and treating it as CSV would read the whole row as one column. */
  const pasted = body?.csv?.trim();
  const rows: string[][] | null =
    body?.rows ??
    (pasted
      ? pasted.split("\n")[0].includes("\t")
        ? pasted.split(/\r?\n/).map((line) => line.split("\t"))
        : parseCsv(pasted)
      : null);

  if (!rows) {
    const pulled = await pullSheet();
    if (!pulled.ok) {
      return Response.json(
        { ok: false, error: pulled.reason } satisfies SyncResponse,
        { status: 502 },
      );
    }
    /* pullSheet already mapped the rows, so hand them straight over rather than
       re-serialising back into a grid to parse again. */
    await getRepo().upsertStores(pulled.rows.map((r) => r.store));
    return Response.json({
      ok: true,
      stores: pulled.rows.length,
      source: pulled.source,
    } satisfies SyncResponse);
  }

  const mapped = rowsToStores(rows);
  if (mapped.length === 0) {
    return Response.json(
      {
        ok: false,
        error:
          "No usable rows. The first row must be the header and include a Store Domain column.",
      } satisfies SyncResponse,
      { status: 400 },
    );
  }

  await getRepo().upsertStores(mapped.map((r) => r.store));
  return Response.json({
    ok: true,
    stores: mapped.length,
    source: body?.csv ? "paste" : "push",
  } satisfies SyncResponse);
}

/** Where the pull would read from, so the admin UI can show it. */
export async function GET() {
  if (!(await readAdminSession())) {
    return Response.json({ ok: false, error: "Not authorised." }, { status: 401 });
  }
  return Response.json({ ok: true, source: sheetSource() });
}
