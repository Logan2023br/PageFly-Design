"""Shared fixtures: load bpu_ops.py fresh, and fake every service it talks to.

`http` is the script's single door to the network, so replacing it routes
every call — PageFly Design, AC2, Crisp, a store's products.json — to the
fakes below. Nothing here touches the network.
"""
import importlib.util
import json
import pathlib
import urllib.parse
from datetime import datetime, timedelta, timezone

import pytest

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "bpu_ops.py"
GOOD_KEY = "good-key-0123456789abcdef"


def load_script():
    spec = importlib.util.spec_from_file_location("bpu_ops_under_test", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def ago(hours):
    return iso(datetime.now(timezone.utc) - timedelta(hours=hours))


class FakePFD:
    """PageFly Design's API contract, in memory. Shapes follow the server."""

    def __init__(self, key=GOOD_KEY):
        self.key = key
        self.settings = {"score_threshold": 6, "control_percent": 20, "min_products": 1, "max_builds_per_run": 2,
                         "followup1_hours": 48, "followup2_hours": 96, "send_hour_start": 9, "send_hour_end": 19,
                         "tracking_days": 30, "install_lookback_hours": 3, "pic": "Logan",
                         "review_url": "https://apps.shopify.com/pagefly#modal-show=ReviewListingModal",
                         "initial_message_template": "", "slack_webhook_url": ""}
        self.installs = {}
        self.leads = {}
        self.export = []          # what leads/export answers (tests set it)
        self.messages = []        # drafts created via POST /messages
        self.approved = []        # what messages?status=approved answers
        self.claimed = set()      # ids a claim=1 call handed out (the server holds them)
        self.hour = lambda tz: 12 # the customer's local hour, as the server works it out
        self.results = {}         # id -> result body
        self.synced = []          # every lead posted to leads/sync
        self.events = []
        self.calls = []

    def __call__(self, method, path, body, headers):
        self.calls.append((method, path))
        if headers.get("X-API-Key") != self.key:
            return 401, {"error": "Invalid or missing X-API-Key."}
        u = urllib.parse.urlparse(path)
        q = dict(urllib.parse.parse_qsl(u.query))
        p = u.path
        if method == "GET" and p == "/api/upsell/settings":
            return 200, {"settings": dict(self.settings)}
        if p == "/api/upsell/installs":
            if method == "GET":
                return 200, {"installs": list(self.installs.values())}
            for i in body["installs"]:
                self.installs[i["store_domain"]] = {**self.installs.get(i["store_domain"], {}), **i}
            return 200, {"ok": True, "upserted": len(body["installs"]), "invalid": 0}
        if method == "POST" and p == "/api/upsell/leads":
            for l in body["leads"]:
                self.leads[l["lead_id"]] = l
            return 200, {"ok": True, "created": [l["lead_id"] for l in body["leads"]], "updated": [], "skipped": []}
        if method == "GET" and p == "/api/upsell/leads/export":
            return 200, {"leads": self.export}
        if method == "POST" and p == "/api/upsell/leads/sync":
            self.synced.extend(body["leads"])
            return 200, {"ok": True, "updated": len(body["leads"]), "unknown": [], "status_ignored": []}
        if p == "/api/upsell/messages":
            if method == "GET":
                if q.get("status") != "approved":
                    return 400, {}
                if q.get("claim") != "1":
                    return 200, {"messages": self.approved}
                # claim=1: what can go out now, each handed out once
                st = self.settings
                free = [m for m in self.approved if m["id"] not in self.claimed and m["id"] not in self.results]
                ready = [m for m in free if m["send_mode"] == "now"
                         or st["send_hour_start"] <= self.hour(m["lead"]["timezone"]) < st["send_hour_end"]]
                self.claimed.update(m["id"] for m in ready)
                return 200, {"messages": ready, "waiting": len(free) - len(ready)}
            created, skipped = [], []
            for m in body["messages"]:
                dupe = m["kind"] != "custom" and any(x["lead_id"] == m["lead_id"] and x["kind"] == m["kind"] for x in self.messages)
                (skipped if dupe else created).append(m)
                if not dupe:
                    self.messages.append(m)
            return 200, {"ok": True, "created": [f"msg_{i}" for i, _ in enumerate(created)], "skipped": skipped}
        if method == "POST" and p.startswith("/api/upsell/messages/") and p.endswith("/result"):
            mid = p.split("/")[4]
            self.results.setdefault(mid, body)
            return 200, {"ok": True, "changed": True, "id": mid, "status": body["status"]}
        if method == "GET" and p == "/api/upsell/events/export":
            return 200, {"events": self.events}
        return 404, {"error": f"no route {method} {p}"}


class FakeWorld:
    """AC2 + storefront products + Crisp."""

    def __init__(self):
        self.stores = {}      # domain -> AC2 store
        self.activities = {}  # domain -> [activity]
        self.products = {}    # domain -> [product] or an int status
        self.crisp_msgs = {}  # session -> [message]
        self.crisp_calls = []
        self.next_session = "session_new_1"

    def __call__(self, method, url, body):
        u = urllib.parse.urlparse(url)
        if u.netloc == "ac2.pagefly.io":
            rest = u.path[len("/api/app-data/stores"):]
            if rest == "":
                return 200, {"items": list(self.stores.values())}
            parts = rest.strip("/").split("/")
            st = self.stores.get(parts[0])
            if len(parts) == 2 and parts[1] == "activities":
                return 200, {"items": self.activities.get(parts[0], [])}
            return (200, st) if st else (404, {})
        if u.path == "/products.json":
            got = self.products.get(u.netloc, 404)
            return (got, {}) if isinstance(got, int) else (200, {"products": got})
        if u.netloc == "api.crisp.chat":
            path = u.path.split("/website/", 1)[1].split("/", 1)[1]
            self.crisp_calls.append((method, "/" + path, body))
            if method == "POST" and path == "conversation":
                return 201, {"error": False, "data": {"session_id": self.next_session}}
            if method == "GET" and path.endswith("/messages"):
                sid = path.split("/")[1]
                return 200, {"error": False, "data": self.crisp_msgs.get(sid, [])}
            return 200, {"error": False, "data": {}}
        return 0, {"_error": f"unexpected url {url}"}


@pytest.fixture
def bpu(monkeypatch, tmp_path):
    monkeypatch.setenv("PFD_API_KEY", GOOD_KEY)
    monkeypatch.setenv("AC2_TOKEN", "ac2-token")
    monkeypatch.setenv("CRISP_IDENTIFIER", "crisp-id")
    monkeypatch.setenv("CRISP_KEY", "crisp-key")
    monkeypatch.chdir(tmp_path)
    mod = load_script()
    pfd, world = FakePFD(), FakeWorld()

    def fake_http(method, url, body=None, headers=None, timeout=25, retries=1):
        # round-trip through JSON, as the wire would
        body = json.loads(json.dumps(body)) if body is not None else None
        if url.startswith(mod.PFD):
            s, j = pfd(method, url[len(mod.PFD):], body, headers or {})
        else:
            s, j = world(method, url, body)
        return s, json.loads(json.dumps(j))

    monkeypatch.setattr(mod, "http", fake_http)
    monkeypatch.setattr(mod.time, "sleep", lambda *_: None)
    mod.FAKE_PFD, mod.FAKE_WORLD = pfd, world
    return mod
