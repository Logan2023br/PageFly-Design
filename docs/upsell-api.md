# Upsell Build Pages — API

Dùng bởi BPU Ops (`scripts/bpu/bpu_ops.py`) và BPU Builder. Mọi route dưới `/api/upsell/*`
(trừ `events` và `download`) cần header `X-API-Key` khớp `UPSELL_API_KEY` trên server.
Sai hoặc thiếu key → `401`. Quá 300 request/phút cho một key → `429`. Không có Postgres → `503`.
Thời gian nhận và trả đều là ISO 8601 UTC, dạng `2026-10-12T03:00:00Z`.

```bash
export PFD_BASE=https://pagefly-design.pagefly.io
export PFD_API_KEY=…            # = UPSELL_API_KEY trên server
H=(-H "X-API-Key: $PFD_API_KEY" -H "Content-Type: application/json")
```

Tạo một lead mẫu có 2 page giả ở tab **Chờ duyệt page**: `scripts/bpu/upsell-demo.sh`.

## Script (BPU Ops)

```bash
# Cài đặt
curl -sS "${H[@]}" "$PFD_BASE/api/upsell/settings"

# Store mới cài: đọc (theo installed_at) và upsert theo store_domain
curl -sS "${H[@]}" "$PFD_BASE/api/upsell/installs?since_hours=80"
curl -sS "${H[@]}" -X POST "$PFD_BASE/api/upsell/installs" \
  -d '{"installs":[{"store_domain":"shop.myshopify.com","installed_at":"2026-10-12T02:00:00Z","lead_score":7,"lead":true}]}'

# Lead: upsert theo lead_id. Lead đã đi xa hơn new/control giữ nguyên status.
curl -sS "${H[@]}" -X POST "$PFD_BASE/api/upsell/leads" \
  -d '{"leads":[{"lead_id":"L261012ABCD","store_domain":"shop.myshopify.com","group":"test","status":"new","lead_score":7}]}'

# Lead đang theo dõi (approved … used, control) tạo trong N ngày; ?all=1 cho sheet
curl -sS "${H[@]}" "$PFD_BASE/api/upsell/leads/export?active=1&tracking_days=30"
curl -sS "${H[@]}" "$PFD_BASE/api/upsell/leads/export?all=1"

# Kết quả theo dõi. Chỉ field có trong request được ghi.
curl -sS "${H[@]}" -X POST "$PFD_BASE/api/upsell/leads/sync" \
  -d '{"leads":[{"lead_id":"L261012ABCD","message_read":true,"current_price":24,"upgraded":true,"upgraded_to":"Silver","mrr_added":24,"status":"upgraded"}]}'

# Nháp follow-up / review (pending_review). Trùng (lead_id, kind) thì bỏ qua.
curl -sS "${H[@]}" -X POST "$PFD_BASE/api/upsell/messages" \
  -d '{"messages":[{"lead_id":"L261012ABCD","kind":"followup1","content":"Hi **Shop**, …"}]}'

# Tin admin đã duyệt, chưa gửi
curl -sS "${H[@]}" "$PFD_BASE/api/upsell/messages?status=approved"

# Báo kết quả gửi (gọi lại lần 2 không đổi gì)
curl -sS "${H[@]}" -X POST "$PFD_BASE/api/upsell/messages/msg_xxx/result" \
  -d '{"status":"sent","sent_at":"2026-10-12T13:05:00Z","crisp_session":"session_…","ticket_link":"https://app.crisp.chat/…","plan_at_send":"Free","price_at_send":0,"pages_at_send":1}'

# Event cho sheet, mới nhất trước
curl -sS "${H[@]}" "$PFD_BASE/api/upsell/events/export?limit=3000"
```

## Builder

```bash
# Lead chờ build: test, ưu tiên cao → điểm cao → cũ nhất. status: new | rebuild_requested | cả hai (mặc định)
curl -sS "${H[@]}" "$PFD_BASE/api/upsell/queue?status=new&limit=2"
curl -sS "${H[@]}" "$PFD_BASE/api/upsell/queue?status=rebuild_requested"
# → mỗi lead có rebuild_note, rebuild_page_types, rebuild_count và current_pages[{slot,type,html_url,pagefly_url}]
#   (tải bằng cùng X-API-Key)

# Đổi trạng thái: chỉ building | error | skipped
curl -sS "${H[@]}" -X POST "$PFD_BASE/api/upsell/leads/L261012ABCD/status" -d '{"status":"building"}'
curl -sS "${H[@]}" -X POST "$PFD_BASE/api/upsell/leads/L261012ABCD/status" -d '{"status":"skipped","error":"Store đang để password"}'

# Upload 2 page (multipart). File .pagefly sai → 422 kèm lý do. Lead đã có design → version mới, giữ id.
curl -sS -X POST "$PFD_BASE/api/upsell/designs" -H "X-API-Key: $PFD_API_KEY" \
  -F lead_id=L261012ABCD -F store_domain=shop.myshopify.com -F store_name="Shop" \
  -F category="Chocolate" -F language=en \
  -F page1_type=home -F page1_title="Home" -F page2_type=product -F page2_title="Best seller" \
  -F build_note="Dùng ảnh sản phẩm thật" \
  -F page1_html=@page1.html -F page1_pagefly=@page1.pagefly \
  -F page2_html=@page2.html -F page2_pagefly=@page2.pagefly \
  -F page1_thumb=@page1.png -F page2_thumb=@page2.png
# → 201 {"id":"Q4JFADCA","url":"…/new-page?id=Q4JFADCA","version":1,"admin_url":"…/admin/upsell/leads/L261012ABCD"}
```

## Công khai (không cần key)

```bash
# Event từ trang khách (bot, admin và quá 30 event/phút/visitor không được tính)
curl -sS -X POST "$PFD_BASE/api/upsell/events" -H "Content-Type: application/json" \
  -d '{"id":"Q4JFADCA","type":"feedback","rating":5,"comment":"Love it"}'

# Tải .pagefly (lượt tải của khách được ghi event download)
curl -sS -OJ "$PFD_BASE/api/upsell/download/Q4JFADCA/1"

# HTML cho iframe, có CSP sandbox; ?v=1 (bản cũ) chỉ cho admin hoặc key
curl -sSI "$PFD_BASE/upsell/preview/Q4JFADCA/1"
```

## Bảo trì

Server tự chạy mỗi 5 phút (`instrumentation.ts`): lead `building` quá 3 giờ trả về hàng đợi,
lần quá hạn thứ 2 chuyển `error`; xoá file design hết hạn quá 60 ngày; gửi Slack đang chờ.
Chạy tay:

```bash
curl -sS "${H[@]}" -X POST "$PFD_BASE/api/upsell/cron"
```

## Triển khai trên VPS

- `.env`: `UPSELL_API_KEY`, `UPSELL_STORAGE_DIR=/var/data/upsell` (thư mục phải ghi được bởi user chạy Node),
  `UPSELL_DEFAULT_TTL_DAYS=30`, `UPSELL_IP_SALT`, nên có `PFD_PUBLIC_URL`.
- nginx: `client_max_body_size 64m;` cho `/api/upsell/designs` (mặc định 1 MB sẽ trả 413).
- Ảnh thumbnail tự chụp khi Builder không gửi PNG cần Playwright (không bắt buộc):
  `npm i playwright && npx playwright install --with-deps chromium`. Không có thì admin xem preview thu nhỏ trực tiếp.
