# Upsell Collection Pages 2 ⇄ sheet "User Testing" (n8n)

Admin: `/design/admin/collections/upsell2`. Code: `lib/ucp2/`.

The invite is sent on Crisp by another flow, which also writes one row per store
into the **User Testing** tab of the *Pagefly Design* sheet
(`1byMQnpxP1GKeoQhTe2pP5SarEEM_2KnwWVR_gmoBusU`). PageFly Design has no Google
credentials; n8n moves the data both ways.

All calls: base `https://pagefly-design.pagefly.io`, header `X-API-Key:` the
upsell API key (`UPSELL_API_KEY`, the same one BPU Ops uses).

## 1. New rows → PageFly Design

Right after the flow appends a row (or on a schedule, with the whole tab):

```
POST /api/ucp2/rows
Content-Type: application/json

[ { "Time": "2026-11-05 22:02:54", "Code Store": "PDRQLX4A",
    "Store Domain": "limit48.myshopify.com", "Email": "…", "Tên store": "…",
    "Plan": "Free", "Ticket": "https://app.crisp.chat/website/…/inbox/session_…/",
    "Type User": "Resolved - Collection Pages" }, … ]
```

The items of a Google Sheets "Get rows" node can be posted as they are. `Time`
is read as Vietnam time. A row is keyed by the Crisp session in `Ticket`, so
posting the same rows again changes nothing. Answer:
`{ received, added, updated, skipped: [{ row, reason }] }`.

## 2. Outcomes → the sheet

Every 10–30 minutes:

```
GET /api/ucp2/rows?since=<ISO time of the previous pull>
```

Answer: `{ columns: [...], rows: [{ "Ticket", "Store Domain", "session_id",
"PFD Đã đọc", "PFD Click link", "PFD Số click", "PFD Tải template",
"PFD Phản hồi", "PFD Nội dung phản hồi", "PFD Nâng cấp", "PFD Review",
"PFD Gỡ app", "PFD Cập nhật" }] }` — only rows that changed since `since`
(all of them without it). Then Google Sheets **Update row**, *column to match
on* = `Ticket`, mapping each `PFD …` field to the column of the same name
(M:V of User Testing, headers already in row 1).

## 3. The link in the message

Use `https://pagefly-design.pagefly.io/go/{Code Store}` instead of a bare link.
The click is counted on that row, then the customer goes on to Collection
pages, or to `?to=` when it is a path on this site or a `pagefly.io` address,
e.g. `/go/PDRQLX4A?to=https://free-service.pagefly.io/?s=limit48.myshopify.com`.
A link that does not go through `/go` (prnt.sc, a bare URL) cannot be counted.

## What is tracked, and how often

Every 2 minutes, a batch of rows sent in the last 60 days:

- read / delivered, replies — Crisp, every 20 minutes per row
- review — `app_review` on the customer's Crisp conversations, every 6 hours;
  5★ already at the first look on the day of the message is shown as
  "5★ từ trước", not counted as a review
- upgrade — AC2: on Free in the sheet, paid now (at AC2's charge time)
- uninstall — AC2, after the message
- template downloaded — the Collection pages download form, same domain, after the message
- click — `/go/…`, link previews (Slack, WhatsApp…) not counted
