"""niu_ops.py against a REAL PageFly Design server — the contract, proven.

Only AC2, Crisp and storefronts are faked; every PageFly Design call goes over
HTTP to the server at PFD_E2E_BASE, which must run on a throwaway Postgres.

    PFD_E2E_BASE=http://localhost:3100 PFD_E2E_KEY=<UPSELL_API_KEY> pytest scripts/niu/tests/test_e2e.py

Walks one lead the whole way: sync → Builder marks building and uploads →
admin approves (signed in, as on the screen) → send → the customer opens the
page → track sees a reply and an upgrade.
"""
import hashlib
import http.cookiejar
import io
import json
import os
import random
import urllib.error
import urllib.request
import uuid
import zipfile

import pytest

from conftest import FakeWorld, ago, load_script

BASE = os.environ.get("PFD_E2E_BASE", "").rstrip("/")
KEY = os.environ.get("PFD_E2E_KEY", "")
pytestmark = pytest.mark.skipif(not BASE or not KEY, reason="set PFD_E2E_BASE and PFD_E2E_KEY to run against a live server")

BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15"


# ---------------------------------------------------------------- raw HTTP helpers
def call(method, path, body=None, headers=None, opener=None, raw=None, timeout=120):
    h = {"User-Agent": BROWSER_UA, **(headers or {})}
    data = raw
    if body is not None:
        data = json.dumps(body).encode()
        h["Content-Type"] = "application/json"
    req = urllib.request.Request(BASE + path, data=data, method=method, headers=h)
    try:
        r = (opener or urllib.request.build_opener()).open(req, timeout=timeout)
        return r.status, r.headers, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.headers, e.read()


def jcall(method, path, body=None, key=KEY):
    s, _, b = call(method, path, body, {"X-API-Key": key} if key else {})
    return s, json.loads(b or b"{}")


def multipart(fields, files):
    boundary = uuid.uuid4().hex
    out = io.BytesIO()
    for k, v in fields.items():
        out.write(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
    for k, (name, data, ctype) in files.items():
        out.write(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"; filename="{name}"\r\nContent-Type: {ctype}\r\n\r\n'.encode())
        out.write(data)
        out.write(b"\r\n")
    out.write(f"--{boundary}--\r\n".encode())
    return out.getvalue(), f"multipart/form-data; boundary={boundary}"


def fake_pagefly():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("page.json", json.dumps({"type": "page", "items": []}))
    return buf.getvalue()


def fresh_domain():
    """A fresh test-group domain each run, so reruns never collide."""
    salt = random.randrange(10 ** 9)
    for i in range(1000):
        d = f"e2e{salt}x{i}.myshopify.com"
        if int(hashlib.sha1(d.encode()).hexdigest(), 16) % 100 >= 20:
            return d
    raise AssertionError


def lead_by_domain(domain):
    s, j = jcall("GET", "/api/upsell/leads/export?all=1")
    assert s == 200
    return next((l for l in j["leads"] if l["store_domain"] == domain), None)


@pytest.fixture
def live(monkeypatch, tmp_path):
    monkeypatch.setenv("PFD_BASE", BASE)
    monkeypatch.setenv("PFD_API_KEY", KEY)
    monkeypatch.setenv("AC2_TOKEN", "ac2-token")
    monkeypatch.setenv("CRISP_IDENTIFIER", "crisp-id")
    monkeypatch.setenv("CRISP_KEY", "crisp-key")
    monkeypatch.chdir(tmp_path)
    mod = load_script()
    assert mod.PFD == BASE
    world = FakeWorld()
    real_http = mod.http

    def routed(method, url, body=None, headers=None, timeout=25, retries=1):
        if url.startswith(BASE):
            return real_http(method, url, body, headers, timeout=120, retries=retries)
        return world(method, url, json.loads(json.dumps(body)) if body is not None else None)

    monkeypatch.setattr(mod, "http", routed)
    monkeypatch.setattr(mod.time, "sleep", lambda *_: None)
    return mod, world


def test_wrong_key_is_401_everywhere():
    for method, path in [("GET", "/api/upsell/settings"), ("GET", "/api/upsell/installs?since_hours=80"),
                         ("POST", "/api/upsell/leads"), ("GET", "/api/upsell/leads/export?all=1"),
                         ("POST", "/api/upsell/leads/sync"), ("GET", "/api/upsell/queue"),
                         ("POST", "/api/upsell/designs"), ("GET", "/api/upsell/messages?status=approved"),
                         ("POST", "/api/upsell/messages"), ("POST", "/api/upsell/messages/msg_x/result"),
                         ("GET", "/api/upsell/events/export")]:
        assert jcall(method, path, {} if method == "POST" else None, key="wrong-key")[0] == 401, path
        assert jcall(method, path, {} if method == "POST" else None, key="")[0] == 401, path


def test_one_lead_end_to_end(live):
    niu, world = live
    domain = fresh_domain()
    world.stores[domain] = {"shopDomain": domain, "createdAt": ago(0.5), "name": "E2E Chocolates", "email": "owner@e2e-choc.com",
                            "phone": "+84 900", "country": "VN", "timezone": "Asia/Ho_Chi_Minh", "shopifyPlan": "Shopify",
                            "pageflyPlan": "Free", "pageflyPrice": 0, "totalPages": 1, "numPublished": 0, "status": "installed"}
    world.products[domain] = [{"title": f"Bar {i}", "product_type": "Chocolate"} for i in range(12)]

    # 1. sync
    niu.cmd_sync([])
    s, j = jcall("GET", "/api/upsell/installs?since_hours=2")
    assert s == 200 and any(i["store_domain"] == domain and i["lead"] is True for i in j["installs"])
    lead = lead_by_domain(domain)
    assert lead and lead["status"] == "new" and lead["group"] == "test" and lead["lead_score"] >= 6
    lid = lead["lead_id"]

    # 2. Builder: queue → building → upload
    s, j = jcall("GET", "/api/upsell/queue?status=new&limit=50")
    assert s == 200 and any(l["lead_id"] == lid for l in j["leads"])
    s, j = jcall("POST", f"/api/upsell/leads/{lid}/status", {"status": "building"})
    assert s == 200 and j["status"] == "building"
    s, j = jcall("POST", f"/api/upsell/leads/{lid}/status", {"status": "approved"})
    assert s == 422, "the Builder cannot approve"
    html = b"<!doctype html><html><body><h1>E2E home</h1></body></html>"
    body, ctype = multipart(
        {"lead_id": lid, "store_domain": domain, "store_name": "E2E Chocolates", "category": "Chocolate", "language": "en",
         "page1_type": "home", "page1_title": "Home", "page2_type": "product", "page2_title": "Dark bar", "build_note": "e2e"},
        {"page1_html": ("p1.html", html, "text/html"), "page1_pagefly": ("p1.pagefly", fake_pagefly(), "application/octet-stream"),
         "page2_html": ("p2.html", html, "text/html"), "page2_pagefly": ("p2.pagefly", b"not a zip", "application/octet-stream")},
    )
    s, _, b = call("POST", "/api/upsell/designs", raw=body, headers={"X-API-Key": KEY, "Content-Type": ctype})
    assert s == 422 and b"page2_pagefly" in b, "a broken .pagefly is refused with the reason"
    body, ctype = multipart(
        {"lead_id": lid, "store_domain": domain, "page1_type": "home", "page2_type": "product", "build_note": "e2e"},
        {"page1_html": ("p1.html", html, "text/html"), "page1_pagefly": ("p1.pagefly", fake_pagefly(), "application/octet-stream"),
         "page2_html": ("p2.html", html, "text/html"), "page2_pagefly": ("p2.pagefly", fake_pagefly(), "application/octet-stream")},
    )
    s, _, b = call("POST", "/api/upsell/designs", raw=body, headers={"X-API-Key": KEY, "Content-Type": ctype})
    assert s == 201, b
    up = json.loads(b)
    did = up["id"]
    assert up["version"] == 1 and up["url"].endswith(f"/new-page?id={did}") and up["admin_url"].endswith(f"/admin/upsell/leads/{lid}")
    assert lead_by_domain(domain)["status"] == "pending_review"

    # 3. Before the send, a stranger sees "not found"; the preview route refuses too.
    s, _, page = call("GET", f"/new-page?id={did}")
    assert s == 200 and b"find these pages" in page and b"E2E Chocolates" not in page
    assert call("GET", f"/upsell/preview/{did}/1")[0] == 404
    assert call("GET", f"/api/upsell/download/{did}/1")[0] == 404

    # 4. Admin signs in and approves — as on the screen.
    jar = http.cookiejar.CookieJar()
    admin = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    user, pw = os.environ.get("PFD_E2E_ADMIN_USER", "admin"), os.environ.get("PFD_E2E_ADMIN_PASS", "pf123456")
    s, _, _ = call("POST", "/api/auth/admin", {"username": user, "password": pw}, opener=admin)
    assert s == 200, "admin sign-in"
    s, _, page = call("GET", f"/new-page?id={did}", opener=admin)
    assert s == 200 and "Bản xem trước, khách chưa nhận".encode() in page and b"E2E Chocolates" in page
    assert b"owner@e2e-choc.com" not in page and b"+84 900" not in page, "no email or phone on the page"
    s, _, b = call("POST", f"/api/admin/upsell/leads/{lid}", {"action": "approve", "send_mode": "now"}, opener=admin)
    assert s == 200, b
    s, j = jcall("GET", "/api/upsell/messages?status=approved")
    mine = [m for m in j["messages"] if m["lead_id"] == lid]
    assert len(mine) == 1 and mine[0]["kind"] == "initial" and mine[0]["send_mode"] == "now"
    assert mine[0]["lead"]["email"] == "owner@e2e-choc.com" and mine[0]["lead"]["design_url"].endswith(did)
    assert "E2E Chocolates" in mine[0]["content"]

    # 5. send (fake Crisp). Only our message: other approved ones from earlier runs would be "sent" to the fake too.
    world.next_session = f"session_{lid}"
    world.stores[domain]["totalPages"] = 1
    niu.cmd_send([])
    lead = lead_by_domain(domain)
    assert lead["status"] == "sent" and lead["crisp_session"] == f"session_{lid}" and lead["sent_at"]
    assert lead["ticket_link"].endswith(f"/inbox/session_{lid}/") and lead["plan_at_send"] == "Free"
    assert lead["sent_at"].endswith("Z") and "." not in lead["sent_at"], "timestamps in the script's own format"
    msg_id = mine[0]["id"]
    s, j = jcall("POST", f"/api/upsell/messages/{msg_id}/result", {"status": "failed", "error": "late"})
    assert s == 200 and j["changed"] is False and j["status"] == "sent", "result is idempotent"

    # 6. The customer opens it.
    s, h, page = call("GET", f"/new-page?id={did}")
    assert s == 200 and b"We designed 2 pages for" in page and b"E2E Chocolates" in page
    assert b"noindex" in page and b"owner@e2e-choc.com" not in page
    s, h, _ = call("GET", f"/upsell/preview/{did}/1")
    assert s == 200 and h.get("Content-Security-Policy") == "sandbox allow-scripts allow-same-origin"
    assert "noindex" in h.get("X-Robots-Tag", "")
    bot = call("POST", "/api/upsell/events", {"id": did, "type": "view"}, headers={"User-Agent": "Slackbot-LinkExpanding 1.0"})
    assert json.loads(bot[2])["recorded"] is False
    s, _, b = call("POST", "/api/upsell/events", {"id": did, "type": "view"})
    assert json.loads(b)["recorded"] is True
    s, h, b = call("GET", f"/api/upsell/download/{did}/1")
    assert s == 200 and 'filename="' in h.get("Content-Disposition", "") and b[:2] == b"PK"
    s, _, b = call("GET", f"/api/upsell/download/{did}/1", opener=admin)
    assert s == 200
    lead = lead_by_domain(domain)
    assert lead["status"] == "downloaded" and lead["views"] == 1 and lead["downloads"] == 1, "admin download not counted"

    # 7. track: a reply in Crisp and an upgrade in AC2.
    sent_ms = niu.parse_iso(lead["sent_at"]).timestamp() * 1000
    world.crisp_msgs[f"session_{lid}"] = [
        {"from": "operator", "type": "text", "read": True, "timestamp": sent_ms},
        {"from": "user", "type": "text", "content": "These look great!", "timestamp": sent_ms + 60_000},
    ]
    world.stores[domain].update(pageflyPlan="Silver", pageflyPrice=24, totalPages=3)
    world.activities[domain] = [{"type": "SUBSCRIPTION_CHARGE_ACTIVATED", "occurredAt": niu.iso()}]
    niu.cmd_track([])
    lead = lead_by_domain(domain)
    assert lead["status"] == "upgraded" and lead["upgraded"] is True and lead["mrr_added"] == 24
    assert lead["replied"] is True and lead["message_read"] is True and lead["used_page"] is True
    assert any(c["lead_id"] == lid for c in json.load(open("replies_to_classify.json")))

    # A second run: the same reply is not news, and no event is written twice.
    niu.cmd_track([])
    assert not any(c["lead_id"] == lid for c in json.load(open("replies_to_classify.json")))
    s, j = jcall("GET", "/api/upsell/events/export?limit=5000")
    mine = [e for e in j["events"] if e["lead_id"] == lid]
    types = [e["type"] for e in mine]
    assert types.count("replied") == 1 and types.count("upgraded") == 1, types
    assert mine[0]["store_domain"] == domain and {"created_at", "detail", "actor"} <= set(mine[0])

    # 8. Drafts are created once; the follow-up needs approval before it is served.
    s, j = jcall("POST", "/api/upsell/messages", {"messages": [{"lead_id": lid, "kind": "review", "content": "Hi, review?"},
                                                                {"lead_id": lid, "kind": "review", "content": "again"}]})
    assert s == 200 and len(j["created"]) == 1 and len(j["skipped"]) == 1
    s, j = jcall("GET", "/api/upsell/messages?status=approved")
    assert not any(m["lead_id"] == lid for m in j["messages"])

    # 9. apply-sentiment writes the classification back.
    f = "classified.json"
    json.dump([{"lead_id": lid, "sentiment": "Positive", "summary_vi": "Khách khen", "wants_changes": False}], open(f, "w"))
    niu.cmd_apply_sentiment([f])
    s, j = jcall("GET", "/api/upsell/leads/export?all=1")
    L = next(l for l in j["leads"] if l["lead_id"] == lid)
    assert L["sentiment"] == "Positive" and L["feedback_summary"] == "Khách khen"
