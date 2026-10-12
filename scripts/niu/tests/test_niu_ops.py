"""niu_ops.py against fakes of every API it calls.

What these pin down is the CONTRACT: which paths the script calls, with which
field names, and what it does with the answers. The server implements the
same names (app/api/upsell/*); a rename on either side fails here.
"""
import hashlib
import json

import pytest

from conftest import ago


def h100(domain):
    return int(hashlib.sha1(domain.encode()).hexdigest(), 16) % 100


def domain_in_group(control, prefix):
    for i in range(1000):
        d = f"{prefix}{i}.myshopify.com"
        if (h100(d) < 20) == control:
            return d
    raise AssertionError("no domain found")


def good_store(domain, **kw):
    st = {"shopDomain": domain, "createdAt": ago(1), "name": "Ziru Chocolates", "email": "owner@ziru.cl",
          "phone": "+56 9 1234", "country": "CL", "timezone": "America/Santiago", "shopifyPlan": "Shopify",
          "pageflyPlan": "Free", "pageflyPrice": 0, "totalPages": 1, "status": "installed"}
    st.update(kw)
    return st


def products(n, kind="Chocolate"):
    return [{"title": f"Bar {i}", "product_type": kind} for i in range(n)]


INSTALL_FIELDS = {"store_domain", "installed_at", "store_name", "email", "phone", "country", "timezone", "shopify_plan",
                  "pf_plan", "app_status", "onboarding_intent", "storefront", "product_count", "category_hint", "email_type",
                  "lead_score", "score_reasons", "lead", "skip_reason", "rechecked", "synced_at"}
LEAD_FIELDS = {"lead_id", "store_domain", "store_name", "email", "phone", "country", "timezone", "shopify_plan", "lead_score",
               "score_reasons", "category_hint", "onboarding_intent", "product_count", "group", "status", "plan_at_send",
               "price_at_send", "pages_at_send"}


# ---------------------------------------------------------------- sync
def test_sync_posts_installs_and_leads(niu, capsys):
    w = niu.FAKE_WORLD
    test_d = domain_in_group(False, "ziru")
    ctrl_d = domain_in_group(True, "cacao")
    weak_d, pw_d, old_d = "my-store-123.myshopify.com", "locked.myshopify.com", "old.myshopify.com"
    w.stores = {
        test_d: good_store(test_d),
        ctrl_d: good_store(ctrl_d, name="Cacao House"),
        weak_d: good_store(weak_d, name="My Store", email="x@gmail.com", phone="", shopifyPlan="Basic"),
        pw_d: good_store(pw_d, name="Locked"),
        old_d: good_store(old_d, createdAt=ago(10)),  # outside install_lookback_hours
    }
    w.products = {test_d: products(12), ctrl_d: products(3), weak_d: products(1), pw_d: 401}

    niu.cmd_sync(["--intents", "missing.json"])
    pfd = niu.FAKE_PFD

    assert ("GET", "/api/upsell/installs?since_hours=80") in pfd.calls
    assert set(pfd.installs) == {test_d, ctrl_d, weak_d, pw_d}, "old install is outside the lookback"
    for row in pfd.installs.values():
        assert set(row) == INSTALL_FIELDS
    assert pfd.installs[pw_d]["storefront"] == "Password" and pfd.installs[pw_d]["skip_reason"] == "Password, no public products"
    assert pfd.installs[weak_d]["lead"] is False and pfd.installs[weak_d]["skip_reason"].startswith("Score <")
    assert pfd.installs[test_d]["category_hint"] == "Chocolate" and pfd.installs[test_d]["email_type"] == "Business"

    by_domain = {l["store_domain"]: l for l in pfd.leads.values()}
    assert set(by_domain) == {test_d, ctrl_d}
    for l in by_domain.values():
        assert set(l) == LEAD_FIELDS
        assert l["lead_id"].startswith("L") and len(l["lead_id"]) == 11
    assert by_domain[test_d]["group"] == "test" and by_domain[test_d]["status"] == "new"
    assert by_domain[ctrl_d]["group"] == "control" and by_domain[ctrl_d]["status"] == "control"
    assert by_domain[test_d]["plan_at_send"] == "Free" and by_domain[test_d]["price_at_send"] == 0.0

    out = json.loads(capsys.readouterr().out)
    assert out["checked"] == 4 and out["new_leads"] == 1 and out["control"] == 1


def test_sync_skips_known_and_rechecks_at_24h(niu):
    w, pfd = niu.FAKE_WORLD, niu.FAKE_PFD
    pfd.installs = {
        "known.myshopify.com": {"store_domain": "known.myshopify.com", "installed_at": ago(1), "lead": True, "skip_reason": ""},
        "empty.myshopify.com": {"store_domain": "empty.myshopify.com", "installed_at": ago(24.5), "lead": False,
                                "skip_reason": "No public products"},
    }
    w.stores = {"known.myshopify.com": good_store("known.myshopify.com"),
                "empty.myshopify.com": good_store("empty.myshopify.com", createdAt=ago(24.5))}
    w.products = {"empty.myshopify.com": products(4)}
    niu.cmd_sync([])
    posted = [c for c in pfd.calls if c == ("POST", "/api/upsell/installs")]
    assert len(posted) == 1
    assert pfd.installs["empty.myshopify.com"]["rechecked"] is True
    assert pfd.installs["empty.myshopify.com"]["lead"] is True


# ---------------------------------------------------------------- track
def tracked(lead_id, domain, **kw):
    L = {"lead_id": lead_id, "store_domain": domain, "store_name": "Ziru", "group": "test", "status": "sent",
         "sent_at": ago(50), "created_at": ago(60), "crisp_session": f"session_{lead_id}", "price_at_send": 0,
         "pages_at_send": 1, "unique_views": 0, "downloads": 0, "rating": None, "message_kinds": ["initial"],
         "design_url": "https://pfd.test/new-page?id=Q4JFADCA", "upgraded": None, "replied": None,
         "last_reply_at": None, "reviewed_app": None, "sentiment": None}
    L.update(kw)
    return L


def test_track_syncs_outcomes_and_drafts(niu, capsys):
    w, pfd = niu.FAKE_WORLD, niu.FAKE_PFD
    pfd.export = [
        tracked("LA", "a.myshopify.com"),                                          # 50h, never opened -> followup1
        tracked("LB", "b.myshopify.com", unique_views=1, rating=5),               # rated 5 -> review
        tracked("LC", "c.myshopify.com", unique_views=1, downloads=1),            # upgraded in AC2
        tracked("LD", "d.myshopify.com", unique_views=1),                          # replied in Crisp
        tracked("LE", "e.myshopify.com", sent_at=ago(100), message_kinds=["initial", "followup1"]),  # 100h, had followup1 -> followup2
        tracked("LF", "f.myshopify.com", group="control", crisp_session=None, status="control"),
    ]
    for d in "abcdef":
        w.stores[f"{d}.myshopify.com"] = good_store(f"{d}.myshopify.com", totalPages=1, numPublished=0)
    w.stores["c.myshopify.com"].update(pageflyPlan="Silver", pageflyPrice=24, totalPages=3)
    w.activities["c.myshopify.com"] = [{"type": "SUBSCRIPTION_CHARGE_ACTIVATED", "occurredAt": ago(2)}]
    sent_ms = (niu.parse_iso(pfd.export[3]["sent_at"]).timestamp() + 3600) * 1000
    w.crisp_msgs["session_LD"] = [
        {"from": "operator", "type": "text", "read": True, "timestamp": sent_ms - 7200 * 1000},
        {"from": "user", "type": "text", "content": "Love it, thanks!", "timestamp": sent_ms},
    ]

    niu.cmd_track([])
    assert ("GET", "/api/upsell/leads/export?active=1&tracking_days=30") in pfd.calls
    synced = {u["lead_id"]: u for u in pfd.synced}
    assert set(synced) == {"LA", "LB", "LC", "LD", "LE", "LF"}
    assert synced["LC"]["upgraded"] is True and synced["LC"]["status"] == "upgraded"
    assert synced["LC"]["mrr_added"] == 24 and synced["LC"]["upgraded_to"] == "Silver"
    assert synced["LC"]["used_page"] is True
    assert synced["LD"]["replied"] is True and synced["LD"]["message_read"] is True
    assert synced["LD"]["last_reply_text"] == "Love it, thanks!"
    for u in synced.values():
        assert {"app_status", "current_plan", "current_price", "pages_now", "published_now"} <= set(u)

    kinds = sorted(f"{m['lead_id']}:{m['kind']}" for m in pfd.messages)
    assert kinds == ["LA:followup1", "LB:review", "LE:followup2"]
    fu1 = next(m for m in pfd.messages if m["kind"] == "followup1")
    assert fu1["content"].startswith("Hi **Ziru**,") and "https://pfd.test/new-page?id=Q4JFADCA" in fu1["content"]
    review = next(m for m in pfd.messages if m["kind"] == "review")
    assert "apps.shopify.com/pagefly" in review["content"]

    classify = json.load(open("replies_to_classify.json"))
    assert [c["lead_id"] for c in classify] == ["LD"]
    out = json.loads(capsys.readouterr().out)
    assert out["upgraded_now"] == ["LC"] and out["replies_to_classify"] == 1


def test_track_does_not_reclassify_a_known_reply(niu):
    """`last_reply_at` comes back in exactly the format the script writes it,
    so an old reply compares equal and is not classified again."""
    w, pfd = niu.FAKE_WORLD, niu.FAKE_PFD
    L = tracked("LD", "d.myshopify.com", unique_views=1, replied=True)
    reply_ts = (niu.parse_iso(L["sent_at"]).timestamp() + 3600)
    L["last_reply_at"] = niu.iso(niu.datetime.fromtimestamp(reply_ts, niu.timezone.utc))
    pfd.export = [L]
    w.stores["d.myshopify.com"] = good_store("d.myshopify.com")
    w.crisp_msgs["session_LD"] = [{"from": "user", "type": "text", "content": "hi", "timestamp": reply_ts * 1000}]
    niu.cmd_track([])
    assert json.load(open("replies_to_classify.json")) == []


# ---------------------------------------------------------------- apply-sentiment
def test_apply_sentiment(niu, tmp_path):
    pfd = niu.FAKE_PFD
    pfd.export = [tracked("LP", "p.myshopify.com"), tracked("LQ", "q.myshopify.com", message_kinds=["initial", "review"])]
    f = tmp_path / "classified.json"
    f.write_text(json.dumps([
        {"lead_id": "LP", "sentiment": "Positive", "summary_vi": "Khách khen", "wants_changes": False},
        {"lead_id": "LQ", "sentiment": "Positive", "summary_vi": "Lại khen", "wants_changes": True},
    ]))
    niu.cmd_apply_sentiment([str(f)])
    assert ("GET", "/api/upsell/leads/export?active=1&tracking_days=60") in pfd.calls
    synced = {u["lead_id"]: u for u in pfd.synced}
    assert synced["LP"] == {"lead_id": "LP", "sentiment": "Positive", "feedback_summary": "Khách khen", "wants_changes": False}
    assert synced["LQ"]["feedback_summary"].endswith("[Khách muốn chỉnh sửa page]")
    assert [(m["lead_id"], m["kind"]) for m in pfd.messages] == [("LP", "review")]


# ---------------------------------------------------------------- send
def outgoing(mid, kind="initial", mode="window", tz="Asia/Ho_Chi_Minh", email="owner@ziru.cl", sid=None):
    return {"id": mid, "lead_id": f"L_{mid}", "kind": kind, "content": f"Hi **Ziru**, {mid}", "send_mode": mode,
            "approved_at": ago(1), "lead": {"store_domain": "ziru-cl.myshopify.com", "store_name": "ZIRU", "email": email,
                                            "timezone": tz, "crisp_session": sid,
                                            "design_url": "https://pfd.test/new-page?id=Q4JFADCA"}}


def test_send_respects_hours_and_reports(niu, monkeypatch, capsys):
    w, pfd = niu.FAKE_WORLD, niu.FAKE_PFD
    monkeypatch.setattr(niu, "local_hour", lambda tz: 3 if tz == "Night/Zone" else 12)
    w.stores["ziru-cl.myshopify.com"] = good_store("ziru-cl.myshopify.com", pageflyPlan="Free", pageflyPrice=0, totalPages=2)
    pfd.approved = [
        outgoing("m_night", tz="Night/Zone"),                         # waits
        outgoing("m_now", mode="now", tz="Night/Zone"),               # sends anyway
        outgoing("m_noemail", email=""),                              # fails
        outgoing("m_fu", kind="followup1", sid="session_existing"),   # existing conversation
    ]
    niu.cmd_send([])
    out = json.loads(capsys.readouterr().out)
    assert out["waiting_for_business_hours"] == 1
    assert sorted(out["sent"]) == ["L_m_fu:followup1", "L_m_now:initial"]
    assert out["failed"] == ["m_noemail"]

    assert "m_night" not in pfd.results
    assert pfd.results["m_noemail"] == {"status": "failed", "error": "No email"}
    r = pfd.results["m_now"]
    assert r["status"] == "sent" and r["crisp_session"] == "session_new_1"
    assert r["ticket_link"].endswith("/inbox/session_new_1/")
    assert r["plan_at_send"] == "Free" and r["price_at_send"] == 0.0 and r["pages_at_send"] == 2
    assert set(pfd.results["m_fu"]) == {"status", "sent_at"}, "a follow-up does not reset the send baseline"

    posts = [c for c in w.crisp_calls if c[0] == "POST"]
    assert ("POST", "/conversation", {}) in posts
    notes = [b for m, p, b in posts if p.endswith("/message") and b["type"] == "note"]
    assert len(notes) == 1 and "L_m_now" in notes[0]["content"], "only the first message carries the internal note"


def test_send_reports_crisp_failure(niu, monkeypatch):
    monkeypatch.setattr(niu, "local_hour", lambda tz: 12)
    pfd, w = niu.FAKE_PFD, niu.FAKE_WORLD
    pfd.approved = [outgoing("m1")]
    real = type(w).__call__

    def broken(self, method, url, body):
        if url.endswith("/conversation") and method == "POST":
            return 500, {"error": True}
        return real(self, method, url, body)

    monkeypatch.setattr(type(w), "__call__", broken)
    niu.cmd_send([])
    assert pfd.results["m1"]["status"] == "failed" and pfd.results["m1"]["error"] == "Crisp create 500"


# ---------------------------------------------------------------- auth
def test_wrong_key_is_logged_and_stops(niu, monkeypatch):
    niu.FAKE_PFD.key = "a-different-key-entirely"
    with pytest.raises(SystemExit) as e:
        niu.cmd_sync([])
    assert "Cannot read installs" in str(e.value)
    assert any("-> 401" in line for line in niu.LOG)
    assert ("POST", "/api/upsell/installs") not in niu.FAKE_PFD.calls


def test_settings_from_server_override_defaults(niu):
    niu.FAKE_PFD.settings.update({"followup1_hours": 24, "pic": "Mai"})
    cfg = niu.settings()
    assert cfg["followup1_hours"] == 24.0 and cfg["pic"] == "Mai" and cfg["send_hour_start"] == 9.0
