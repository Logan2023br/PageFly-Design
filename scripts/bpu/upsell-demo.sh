#!/usr/bin/env bash
# ==========================================================================
# A sample lead, built with fake files, landed in "Chờ duyệt page".
#
#     PFD_BASE=https://pagefly-design.pagefly.io PFD_API_KEY=… scripts/bpu/upsell-demo.sh
#
# Walks the same calls BPU Ops and BPU Builder make: install → lead →
# building → upload two pages. The lead id is fixed per day, so a second run
# the same day answers 409 on status/upload while the first sits in review —
# that is the state machine refusing, not a failure. Needs curl and zip.
# ==========================================================================
set -euo pipefail
BASE="${PFD_BASE:-http://localhost:3000}"
KEY="${PFD_API_KEY:?set PFD_API_KEY = UPSELL_API_KEY on the server}"
DOMAIN="${DEMO_DOMAIN:-demo-ziru-chocolates.myshopify.com}"
LEAD="${DEMO_LEAD:-L$(TZ=Asia/Ho_Chi_Minh date +%y%m%d)DEMO}"
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
H=(-H "X-API-Key: $KEY" -H "Content-Type: application/json")

echo "== install + lead ($LEAD, $DOMAIN)"
curl -fsS "${H[@]}" -X POST "$BASE/api/upsell/installs" -d @- <<JSON
{"installs":[{"store_domain":"$DOMAIN","installed_at":"$NOW","store_name":"ZIRU CHOCOLATES","email":"owner@ziru.example",
 "phone":"+56 9 1234 5678","country":"CL","timezone":"America/Santiago","shopify_plan":"Basic","pf_plan":"Free",
 "app_status":"installed","onboarding_intent":"create/ai","storefront":"Open","product_count":"24",
 "category_hint":"Chocolate, Gift box","email_type":"Business","lead_score":9,
 "score_reasons":"Basic +1; Email theo tên miền riêng +2; Có phone +1; Tên store riêng +1; 24 sản phẩm +2; Storefront đang mở +1; Onboarding create +1",
 "lead":true,"skip_reason":"","rechecked":false,"synced_at":"$NOW"}]}
JSON
echo
curl -fsS "${H[@]}" -X POST "$BASE/api/upsell/leads" -d @- <<JSON
{"leads":[{"lead_id":"$LEAD","store_domain":"$DOMAIN","store_name":"ZIRU CHOCOLATES","email":"owner@ziru.example",
 "phone":"+56 9 1234 5678","country":"CL","timezone":"America/Santiago","shopify_plan":"Basic","lead_score":9,
 "score_reasons":"Basic +1; Email theo tên miền riêng +2; …","category_hint":"Chocolate, Gift box",
 "onboarding_intent":"create/ai","product_count":"24","group":"test","status":"new",
 "plan_at_send":"Free","price_at_send":0,"pages_at_send":0}]}
JSON
echo

echo "== builder: building"
curl -sS "${H[@]}" -X POST "$BASE/api/upsell/leads/$LEAD/status" -d '{"status":"building"}'; echo

echo "== builder: upload"
# Written to a file first, then titled with sed: bash 3.2 (macOS) misparses a
# heredoc inside a function body.
cat > "$TMP/tpl.html" <<'HTML'
<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;font-family:Georgia,serif;color:#2b1a12;background:#fbf6f0}
.hero{padding:96px 24px;text-align:center;background:linear-gradient(135deg,#3b2316,#7a4a2c);color:#fff}
.hero h1{font-size:clamp(32px,6vw,64px);margin:0 0 12px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:20px;padding:48px 24px;max-width:1100px;margin:auto}
.card{background:#fff;border-radius:14px;padding:20px;box-shadow:0 6px 24px rgba(0,0,0,.06)}.card div{height:160px;border-radius:10px;background:#e9d8c6;margin-bottom:12px}</style></head>
<body><section class="hero"><h1>__TITLE__</h1><p>Handmade Chilean chocolate · demo page</p></section>
<section class="grid"><div class="card"><div></div>Dark 70%</div><div class="card"><div></div>Milk and sea salt</div><div class="card"><div></div>Gift box</div></section></body></html>
HTML
sed 's/__TITLE__/ZIRU Chocolates/' "$TMP/tpl.html" > "$TMP/page1.html"
sed 's/__TITLE__/Gift Box Collection/' "$TMP/tpl.html" > "$TMP/page2.html"
( cd "$TMP" && printf '{"type":"page","title":"demo"}' > page.json && zip -q demo.pagefly page.json )

curl -sS -X POST "$BASE/api/upsell/designs" -H "X-API-Key: $KEY" \
  -F lead_id="$LEAD" -F store_domain="$DOMAIN" -F store_name="ZIRU CHOCOLATES" \
  -F category="Chocolate" -F language="en" \
  -F page1_type=home -F page1_title="Home — ZIRU" -F page2_type=collection -F page2_title="Gift boxes" \
  -F build_note="Demo: dùng tông nâu socola, ảnh sản phẩm thật thay bằng khối màu." \
  -F page1_html=@"$TMP/page1.html" -F page1_pagefly=@"$TMP/demo.pagefly" \
  -F page2_html=@"$TMP/page2.html" -F page2_pagefly=@"$TMP/demo.pagefly"
echo
echo "== open: $BASE/admin/upsell/leads/$LEAD"
