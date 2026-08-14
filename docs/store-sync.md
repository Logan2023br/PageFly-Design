# Getting a new store into the app

A store has to exist in the `stores` table before its owner can sign in. There
are three ways in, and which one to use depends on what writes the sheet — not
on preference.

| Path | Delay | Use when |
| --- | --- | --- |
| **n8n calls the app directly** | seconds | n8n is what adds the row. This is the one to use. |
| Apps Script, `onChange` trigger | seconds | a person types into the sheet |
| Apps Script, 10-minute timer | up to 10 min | anything else, including n8n |
| Admin → Add a store | immediate | one-off, by hand |

## Why n8n should call the app directly

Google's `onChange` and `onEdit` triggers **do not fire for rows written through
the Sheets API**. n8n writes through the Sheets API. So with Apps Script alone, a
row that n8n appends is not seen until the ten-minute timer next runs — the
sheet is up to date and the app is up to ten minutes behind it, with nothing on
either side reporting a disagreement.

Calling the app from n8n removes the wait and one whole moving part: no Apps
Script, no triggers, no Google quota. The sheet stays the record; it just stops
being the messenger.

## The n8n node

Add an **HTTP Request** node immediately after the Google Sheets node that
appends the row.

```
Method   POST
URL      https://pagefly-design.pagefly.io/api/admin/sync

Headers
  x-sync-secret   <the same value as SYNC_SECRET on the server>
  content-type    application/json

Body (JSON)
```

```json
{
  "rows": [
    ["Store Domain", "Email", "Tên store", "Plan"],
    [
      "{{ $json['Store Domain'] }}",
      "{{ $json['Email'] }}",
      "{{ $json['Tên store'] }}",
      "{{ $json['Plan'] }}"
    ]
  ]
}
```

Notes on the payload:

- **The header row is required.** Columns are matched by name, never by
  position, so a column inserted in the sheet does not silently shift every
  field by one. Without a header there is nothing to match against and the
  request is rejected with a 400 that says so.
- **Send only the new row.** This is an upsert keyed on domain; there is no need
  to resend the sheet. Extra columns the app does not use (`Time`, `Code Store`,
  `Ticket`) are accepted and ignored, so passing the whole row is fine too.
- **The header names can be English or Vietnamese**, with or without accents —
  `Tên store`, `Ten store` and `Store name` all match.

Expected reply:

```json
{ "ok": true, "stores": 1, "source": "push" }
```

A wrong secret or none gives `401`. Point the n8n node's error handling at that:
a silent 401 means stores stop arriving and nothing says why.

## What a sync writes

Every column in the sheet overwrites what is in the database, **including
`page_limit`**. A quota raised by hand in the admin is reset by the next sync.
If a store needs a different allowance, it has to come from the sheet.

`first_seen_at` and `last_seen_at` are never touched — those are what the app
observed, and the sheet has no business overwriting them.

Rows removed from the sheet do **not** remove the store. Sync only adds and
updates.

## Page limit

Every store gets `DEFAULT_PAGE_LIMIT` (`lib/pageCatalog.ts`), currently **10**.

The `Plan` column is stored and shown in the admin table but decides nothing: a
row reading `10-slot` or `30-slot` describes what the merchant bought in
PageFly, which is a different thing from how many mockups this tool gives them.

A sheet with an explicit `Số page` / `Pages` column overrides the default for
those rows — that is a stated allowance rather than one inferred from a label.

## Secret

`SYNC_SECRET` on the server, and the same value wherever the caller lives.
Rotating it means changing both; until both change, syncs 401.
