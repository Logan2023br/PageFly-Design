# BPU Ops — `bpu_ops.py`

Script mà Claude scheduled task **BPU Ops** chạy mỗi giờ. Chỉ làm phần việc
có thể lặp lại chính xác (gọi API, chấm điểm, soạn tin theo mẫu); phần cần phán
đoán (intent từ Mixpanel, phân loại phản hồi) là việc của Claude.

**PageFly Design là nơi lưu dữ liệu chính.** Google Sheet chỉ là bản sao ghi lại
mỗi giờ bằng lệnh `sheet`.

**Không tin nào tới khách mà chưa được admin duyệt.** Script chỉ *soạn* tin
(`POST /api/upsell/messages` → `pending_review`) và chỉ *gửi* những tin admin đã
duyệt (`GET /api/upsell/messages?status=approved`).

Chỉ cần thư viện chuẩn của Python (3.9+). Riêng `sheet` cần `google-auth` và
`requests` — xem `requirements.txt`.

## Lệnh — chạy theo thứ tự này

| Lệnh | Làm gì | API PageFly Design |
|---|---|---|
| `sync [--intents intents.json]` | Lấy store mới cài từ AC2 (trong `install_lookback_hours`), đọc `products.json`, chấm điểm, đẩy vào PageFly Design. Store để password vẫn thành lead (Builder dựng page mẫu theo ngành); store mở mà chưa có sản phẩm được chấm lại ở mốc ~24h và ~72h. `intents.json`: `{"shop.myshopify.com": "create/ai"}` hoặc `{"shop.myshopify.com": {"intent": "create/ai", "product_type": "Necklace"}}`. `product_type` lấy từ event Mixpanel `onboarding_v1_product_selected` (theo `shopify_domain`, bỏ `unknown`), dùng làm ngành hàng cho store để password | `GET /api/upsell/settings`, `GET /api/upsell/installs?since_hours=80`, `POST /api/upsell/installs`, `POST /api/upsell/leads` |
| `track` | Với mỗi lead đang theo dõi: plan/số page từ AC2, đã đọc + phản hồi từ Crisp, nâng cấp, gỡ app; soạn follow-up 1 (48h chưa mở link), follow-up 2 (96h chưa tải), xin review (rating ≥ 4). Ghi `replies_to_classify.json` cho Claude phân loại. | `GET /api/upsell/leads/export?active=1&tracking_days=N`, `POST /api/upsell/leads/sync`, `POST /api/upsell/messages` |
| `apply-sentiment classified.json` | Nhận kết quả Claude phân loại: `[{"lead_id","sentiment","summary_vi","wants_changes"}]`. Ghi vào lead; phản hồi `Positive` thì soạn tin xin review. | `GET /api/upsell/leads/export?active=1&tracking_days=60`, `POST /api/upsell/leads/sync`, `POST /api/upsell/messages` |
| `send` | Gửi qua Crisp các tin admin đã duyệt, trong giờ hành chính của khách (`send_hour_start`–`send_hour_end`, theo timezone của store) — trừ tin "Duyệt & gửi ngay". Tin đầu tiên mở hội thoại Crisp mới. Báo kết quả từng tin. | `GET /api/upsell/messages?status=approved`, `POST /api/upsell/messages/:id/result` |
| `sheet` | Ghi đè 3 tab Leads / Installs / Events của Google Sheet bằng dữ liệu PageFly Design. Bỏ qua nếu không có `GOOGLE_SA_JSON`. | `GET /api/upsell/leads/export?all=1`, `GET /api/upsell/installs?since_hours=2160`, `GET /api/upsell/events/export?limit=3000` |

Mỗi lệnh in một dòng JSON tóm tắt ra stdout; lỗi gọi API in ra stderr.

```bash
export PFD_API_KEY=…   # = UPSELL_API_KEY trên server
python3 scripts/bpu/bpu_ops.py sync --intents intents.json
python3 scripts/bpu/bpu_ops.py track
python3 scripts/bpu/bpu_ops.py apply-sentiment classified.json
python3 scripts/bpu/bpu_ops.py send
python3 scripts/bpu/bpu_ops.py sheet
```

## Biến môi trường

| Biến | Bắt buộc | Ý nghĩa |
|---|---|---|
| `PFD_API_KEY` | có | Gửi trong header `X-API-Key`. Phải bằng `UPSELL_API_KEY` của server PageFly Design. |
| `PFD_BASE` | không | Mặc định `https://pagefly-design.pagefly.io`. Đổi sang `http://localhost:3000` khi thử ở máy. |
| `AC2_TOKEN` | có (`sync`, `track`, `send`) | Token AC2 (`https://ac2.pagefly.io/api/app-data/stores`). |
| `CRISP_IDENTIFIER`, `CRISP_KEY` | có (`track`, `send`) | Plugin token Crisp (Basic auth, tier `plugin`). |
| `CRISP_WEBSITE_ID` | không | Mặc định `7cd1799e-e8eb-476e-8cb7-33778fc41c2a`. |
| `GOOGLE_SA_JSON` | chỉ `sheet` | JSON service account, nguyên văn hoặc base64. Sheet phải share quyền Editor cho email của service account. |
| `SHEET_ID` | không | Mặc định là sheet BPU hiện tại. |

Các ngưỡng (điểm, % đối chứng, giờ follow-up, giờ gửi, PIC, link review…) không
nằm ở đây — script đọc chúng từ `GET /api/upsell/settings`, sửa trong
**Admin → Upsell Build Pages → Cài đặt**.

## Test

```bash
python3 -m venv .venv && .venv/bin/pip install -r scripts/bpu/requirements.txt
.venv/bin/pytest scripts/bpu/tests -q
```

- `tests/test_bpu_ops.py` — giả lập toàn bộ (PageFly Design, AC2, Crisp,
  `products.json`) trong bộ nhớ; không gọi mạng. Kiểm tra script gọi đúng
  đường dẫn với đúng tên field.
- `tests/test_e2e.py` — chạy script với **server PageFly Design thật**
  (AC2/Crisp vẫn giả lập). Bị bỏ qua nếu không đặt `PFD_E2E_BASE`:

```bash
# server: npx next dev -p 3100 với DATABASE_URL (Postgres), UPSELL_API_KEY=…, PFD_PUBLIC_URL=http://localhost:3100
PFD_E2E_BASE=http://localhost:3100 PFD_E2E_KEY=<UPSELL_API_KEY> \
  .venv/bin/pytest scripts/bpu/tests/test_e2e.py -q
```

Test e2e đăng nhập admin bằng `ADMIN_USERNAME`/`ADMIN_PASSWORD` (mặc định
`admin` / `pf123456`; đặt `PFD_E2E_ADMIN_USER`/`PFD_E2E_ADMIN_PASS` nếu khác) để
bấm duyệt — đúng như người duyệt làm trên màn hình. **Chỉ chạy với database
dùng để test**: nó tạo lead, design và tin nhắn thật.
