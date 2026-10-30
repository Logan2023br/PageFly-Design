#!/usr/bin/env python3
"""BPU (Build Page Upsell) ops script.

Run by the "BPU Ops" Claude scheduled task every hour. Deterministic work only;
Claude handles the judgment steps (Mixpanel intents, reply classification).

Commands (run in this order):
  sync            New installs from AC2 -> products.json -> score -> PageFly Design (installs + leads)
                  Optional: --intents intents.json  ({"shop.myshopify.com": "create/ai", ...} or
                  {"shop.myshopify.com": {"intent": "create/ai", "product_type": "Necklace"}} — product_type from
                  Mixpanel onboarding_v1_product_selected, the line of business for a password-protected store)
  track           AC2 plan/pages, Crisp read/replies, follow-up drafts -> PageFly Design.
                  Writes replies_to_classify.json for Claude.
  apply-sentiment classified.json  ([{"lead_id","sentiment","summary_vi","wants_changes"}]) -> sync + review drafts
  send            Send messages approved in PageFly Design admin via Crisp (customer business hours)
  sheet           Mirror PageFly Design data into the Google Sheet (needs GOOGLE_SA_JSON)

Env: AC2_TOKEN (or N8N_AC2_URL + N8N_AC2_KEY to read AC2 through the n8n proxy), CRISP_IDENTIFIER, CRISP_KEY, PFD_API_KEY, optional PFD_BASE, CRISP_WEBSITE_ID,
     GOOGLE_SA_JSON (service-account JSON, raw or base64), SHEET_ID.
Only the standard library is needed, except `sheet` (pip install google-auth requests).
"""
import base64, hashlib, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request
from datetime import datetime, timedelta, timezone

PFD = os.environ.get("PFD_BASE", "https://pagefly-design.pagefly.io").rstrip("/")
AC2 = "https://ac2.pagefly.io/api/app-data/stores"
CRISP_WID = os.environ.get("CRISP_WEBSITE_ID", "7cd1799e-e8eb-476e-8cb7-33778fc41c2a")
CRISP = f"https://api.crisp.chat/v1/website/{CRISP_WID}"
CRISP_SENDER = {"type": "website", "user_id": "11c92319-89c1-42be-b4da-2bf5e40568c3", "nickname": "PageFly Team",
                "avatar": "https://image.crisp.chat/avatar/operator/11c92319-89c1-42be-b4da-2bf5e40568c3/120/?avatar=https%3A%2F%2Fstorage.crisp.chat%2Fusers%2Favatar%2Foperator%2F61a991f5c29c8c00%2F83c74eca5527aaa97d9821735a6a1e_90vs0g.png"}
SHEET_ID = os.environ.get("SHEET_ID", "1qH3yMamu2V1FUGcMeWeRV7SLf-eR97-wet5B84djUCA")
UA = "Mozilla/5.0 (compatible; PageFly-BPU/1.0)"
LOG = []


def log(*a):
    msg = " ".join(str(x) for x in a)
    LOG.append(msg)
    print(msg, file=sys.stderr)


# ---------------------------------------------------------------- HTTP
def http(method, url, body=None, headers=None, timeout=25, retries=1):
    data = json.dumps(body).encode() if body is not None else None
    h = {"User-Agent": UA, "Accept": "application/json"}
    if data is not None:
        h["Content-Type"] = "application/json"
    h.update(headers or {})
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, data=data, method=method, headers=h)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                raw = r.read().decode("utf-8", "replace")
                try:
                    return r.status, json.loads(raw) if raw else {}
                except ValueError:
                    return r.status, {"_raw": raw[:500]}
        except urllib.error.HTTPError as e:
            raw = e.read().decode("utf-8", "replace")
            if e.code >= 500 and attempt < retries:
                time.sleep(2)
                continue
            try:
                return e.code, json.loads(raw)
            except ValueError:
                return e.code, {"_raw": raw[:500]}
        except Exception as e:  # network
            if attempt < retries:
                time.sleep(2)
                continue
            return 0, {"_error": str(e)}


def env(name, required=True):
    v = os.environ.get(name, "")
    if required and not v:
        sys.exit(f"Missing env {name}")
    return v


def pfd(method, path, body=None):
    s, j = http(method, PFD + path, body, {"X-API-Key": env("PFD_API_KEY")})
    if s >= 300 or s == 0:
        log(f"PFD {method} {path} -> {s} {str(j)[:200]}")
    return s, j


def ac2(path="", query=None):
    """AC2 read-only. Uses the n8n proxy when N8N_AC2_URL is set (AC2 token stays in n8n), else AC2_TOKEN directly."""
    proxy = os.environ.get("N8N_AC2_URL", "")
    if proxy:
        q = dict(query or {}, path=path)
        s, j = http("GET", f"{proxy}?{urllib.parse.urlencode(q)}", headers={"X-BPU-Key": env("N8N_AC2_KEY")})
    else:
        q = dict(query or {}, token=env("AC2_TOKEN"))
        s, j = http("GET", f"{AC2}{path}?{urllib.parse.urlencode(q)}")
    return j if s == 200 and isinstance(j, dict) else {}


def crisp(method, path, body=None):
    auth = base64.b64encode(f"{env('CRISP_IDENTIFIER')}:{env('CRISP_KEY')}".encode()).decode()
    return http(method, CRISP + path, body, {"Authorization": "Basic " + auth, "X-Crisp-Tier": "plugin"})


# ---------------------------------------------------------------- time helpers
def now_utc():
    return datetime.now(timezone.utc)


def iso(dt=None):
    return (dt or now_utc()).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_iso(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00")).astimezone(timezone.utc)
    except ValueError:
        return None


def hours_since(s):
    d = parse_iso(s)
    return (now_utc() - d).total_seconds() / 3600 if d else 0


def vn(s):
    d = parse_iso(s) if isinstance(s, str) else s
    return (d + timedelta(hours=7)).strftime("%Y-%m-%d %H:%M") if d else ""


def settings():
    s, j = pfd("GET", "/api/upsell/settings")
    cfg = (j or {}).get("settings", {}) if s == 200 else {}
    d = {"score_threshold": 6, "control_percent": 20, "min_products": 1, "followup1_hours": 24, "followup2_hours": 48,
         "send_hour_start": 9, "send_hour_end": 19, "tracking_days": 30, "install_lookback_hours": 3, "pic": "Logan",
         "review_url": "https://apps.shopify.com/pagefly#modal-show=ReviewListingModal"}
    for k, v in cfg.items():
        d[k] = v
    for k in ["score_threshold", "control_percent", "min_products", "followup1_hours", "followup2_hours",
              "send_hour_start", "send_hour_end", "tracking_days", "install_lookback_hours"]:
        d[k] = float(d[k])
    return d


def chunks(lst, n=200):
    for i in range(0, len(lst), n):
        yield lst[i:i + n]


# ---------------------------------------------------------------- scoring
FREE_MAIL = re.compile(r"@(gmail|googlemail|yahoo|ymail|hotmail|outlook|live|msn|icloud|me|aol|proton(mail)?|gmx|yandex|mail\.ru|qq|163|126|zoho|privaterelay\.appleid)\.", re.I)
DEFAULT_NAME = re.compile(r"^(my store( \d+)?|minha loja|mi tienda|ma boutique|mein shop|il mio negozio|moja prodavnica( \d+)?|mijn winkel|我的商店|bys-user-store.*)$", re.I)
TEST_DOMAIN = re.compile(r"^(bys-user-store|zd-store|stg-|test-)|-test(\.|$)", re.I)


def fetch_products(domain):
    s, j = http("GET", f"https://{domain}/products.json?limit=250", timeout=15, retries=0)
    if s == 200 and isinstance(j, dict) and "products" in j:
        return j["products"], "Open"
    if s in (401, 403, 302) or (s == 200 and "_raw" in j):
        return [], "Password"
    return [], f"Error {s}"


def score_store(st, intent, products, storefront, cfg, product_type=""):
    sc, why = 0, []
    plan = str(st.get("shopifyPlan") or "").lower()
    if re.search(r"grow|advanced|plus|professional|unlimited|shopify$", plan):
        sc += 3; why.append(f"Shopify {st.get('shopifyPlan')} +3")
    elif "basic" in plan and "development" not in plan:
        sc += 1; why.append("Basic +1")
    if re.search(r"trial|development|partner|staff|affiliate|frozen|paused", plan):
        sc -= 2; why.append(f"{st.get('shopifyPlan')} -2")
    email = str(st.get("email") or "")
    etype = "None" if not email else ("Personal" if FREE_MAIL.search(email) else "Business")
    if etype == "Business":
        sc += 2; why.append("Email theo tên miền riêng +2")
    if st.get("phone"):
        sc += 1; why.append("Có phone +1")
    name = str(st.get("name") or "").strip()
    if not name or DEFAULT_NAME.match(name):
        sc -= 1; why.append("Tên store mặc định -1")
    else:
        sc += 1; why.append("Tên store riêng +1")
    if TEST_DOMAIN.search(st.get("shopDomain", "")):
        sc -= 2; why.append("Domain dạng store test -2")
    if re.search(r"rebuild|import|connector", intent or ""):
        sc += 2; why.append(f"Onboarding {intent} +2")
    elif "create" in (intent or ""):
        sc += 1; why.append("Onboarding create +1")
    if len(products) >= 10:
        sc += 2; why.append(f"{len(products)} sản phẩm +2")
    elif products:
        sc += 1; why.append(f"{len(products)} sản phẩm +1")
    if storefront == "Open":
        sc += 1; why.append("Storefront đang mở +1")
    cnt = {}
    for p in products:
        k = (p.get("product_type") or "").strip()
        if k:
            cnt[k] = cnt.get(k, 0) + 1
    cat = ", ".join(k for k, _ in sorted(cnt.items(), key=lambda x: -x[1])[:3]) or \
          " / ".join(str(p.get("title", ""))[:40] for p in products[:3])
    # A password-protected store still gets pages: example products in its line
    # of business, which Mixpanel's onboarding product_type may name.
    if storefront == "Password":
        # A store still behind its password is usually a merchant building it
        # right now — the moment pages help most. It cannot earn the open
        # storefront (+1) or public products (+1/+2) points, so it gets them
        # back here rather than losing to every store that already launched.
        sc += 2; why.append("Store đang dựng (để password) +2: dựng page mẫu")
        if not cat:
            cat = product_type
    skip = ""
    if st.get("status") and st.get("status") != "installed":
        skip = f"App {st.get('status')}"
    elif storefront != "Password" and len(products) < cfg["min_products"]:
        skip = "No public products"
    elif sc < cfg["score_threshold"]:
        skip = f"Score < {int(cfg['score_threshold'])}"
    return sc, why, cat, etype, skip


def lead_id_for(domain):
    h = int(hashlib.sha1(domain.encode()).hexdigest(), 16)
    b36, n = "", h % 36 ** 4
    for _ in range(4):
        b36 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"[n % 36] + b36; n //= 36
    return "L" + (now_utc() + timedelta(hours=7)).strftime("%y%m%d") + b36, h


# ---------------------------------------------------------------- commands
def cmd_sync(args):
    cfg = settings()
    intents = {}
    if "--intents" in args:
        try:
            intents = json.load(open(args[args.index("--intents") + 1]))
        except Exception as e:
            log("intents file unreadable:", e)
    s, known = pfd("GET", f"/api/upsell/installs?since_hours=80")
    if s != 200:
        sys.exit("Cannot read installs from PageFly Design")
    known = {i["store_domain"]: i for i in known.get("installs", [])}
    stores = ac2(query={"limit": 300}).get("items", [])
    by_domain = {x["shopDomain"]: x for x in stores}
    cutoff = now_utc() - timedelta(hours=cfg["install_lookback_hours"])
    todo = [(x, False) for x in stores if x.get("createdAt") and parse_iso(x["createdAt"]) >= cutoff and x["shopDomain"] not in known]
    # re-check stores without public products at ~24h and ~72h after install
    for d, r in known.items():
        if r.get("lead") or not re.search(r"products|Password", r.get("skip_reason") or ""):
            continue
        h = hours_since(r.get("installed_at"))
        if 24 <= h < 25 or 72 <= h < 73:
            todo.append((by_domain.get(d) or ac2(f"/{d}") or {"shopDomain": d}, True))
    installs, leads = [], []
    for st, recheck in todo:
        d = st.get("shopDomain")
        if not d:
            continue
        # intents.json: {domain: "create/ai"} or {domain: {"intent": …, "product_type": …}}
        got = intents.get(d) or {}
        got = got if isinstance(got, dict) else {"intent": got}
        intent = got.get("intent") or (known.get(d) or {}).get("onboarding_intent") or ""
        ptype = str(got.get("product_type") or "").strip()
        ptype = "" if ptype.lower() == "unknown" else ptype
        products, storefront = fetch_products(d)
        sc, why, cat, etype, skip = score_store(st, intent, products, storefront, cfg, ptype)
        installs.append({"store_domain": d, "installed_at": st.get("createdAt") or (known.get(d) or {}).get("installed_at"),
                         "store_name": st.get("name", ""), "email": st.get("email", ""), "phone": str(st.get("phone") or ""),
                         "country": st.get("country", ""), "timezone": st.get("timezone", ""), "shopify_plan": st.get("shopifyPlan", ""),
                         "pf_plan": st.get("pageflyPlan", ""), "app_status": st.get("status", ""), "onboarding_intent": intent,
                         "storefront": storefront, "product_count": "250+" if len(products) >= 250 else str(len(products)),
                         "category_hint": cat, "email_type": etype, "lead_score": sc, "score_reasons": "; ".join(why),
                         "lead": not skip, "skip_reason": skip, "rechecked": recheck, "synced_at": iso()})
        if not skip:
            lid, h = lead_id_for(d)
            group = "control" if h % 100 < cfg["control_percent"] else "test"
            leads.append({"lead_id": lid, "store_domain": d, "store_name": st.get("name", ""), "email": st.get("email", ""),
                          "phone": str(st.get("phone") or ""), "country": st.get("country", ""), "timezone": st.get("timezone", ""),
                          "shopify_plan": st.get("shopifyPlan", ""), "lead_score": sc, "score_reasons": "; ".join(why),
                          "category_hint": cat, "onboarding_intent": intent, "product_count": installs[-1]["product_count"],
                          "group": group, "status": "control" if group == "control" else "new",
                          "plan_at_send": st.get("pageflyPlan") or "Free", "price_at_send": float(st.get("pageflyPrice") or 0),
                          "pages_at_send": int(st.get("totalPages") or 0)})
    for c in chunks(installs):
        pfd("POST", "/api/upsell/installs", {"installs": c})
    for c in chunks(leads):
        pfd("POST", "/api/upsell/leads", {"leads": c})
    print(json.dumps({"checked": len(installs), "new_leads": len([l for l in leads if l["group"] == "test"]),
                      "control": len([l for l in leads if l["group"] == "control"]),
                      "leads": [f"{l['store_domain']} ({l['lead_score']}, {l['group']})" for l in leads]}, ensure_ascii=False))


FU1 = ("{hi}\n\nJust a quick reminder: the 2 pages I designed for your store are still waiting for you. "
       "They're ready to import, so you can publish them as they are or tweak them in PageFly.\n\n"
       "👉 [See your 2 pages]({link})\n\nFeel free to customize these pages in the PageFly editor to make them your own. If you have any questions, just reply here.\n\n"
       "Best regards,\n**{pic} – PageFly Support**")
FU2 = ("{hi}\n\n{seen}If anything stops you from using them (import steps, design, or something missing), tell me and I will sort it out for you. "
       "Importing takes about a minute: download the .pagefly file, then import it in PageFly.\n\n"
       "👉 [Open your pages]({link})\n\nBest regards,\n**{pic} – PageFly Support**")
REVIEW = ("{hi}\n\nThank you for the kind words, it means a lot to our team! 🙌\n\n"
          "If PageFly has been helpful so far, would you mind leaving us a quick review on the Shopify App Store? "
          "It takes about 30 seconds and helps other merchants find us.\n\n👉 [Leave a review]({review})\n\n"
          "And if you need anything else for your pages, just reply here.\n\nBest regards,\n**{pic} – PageFly Support**")


def greet(lead):
    n = str(lead.get("store_name") or "").strip()
    return f"Hi **{n}**," if n else "Hi there,"


def cmd_track(args):
    cfg = settings()
    s, j = pfd("GET", f"/api/upsell/leads/export?active=1&tracking_days={int(cfg['tracking_days'])}")
    if s != 200:
        sys.exit("Cannot read leads from PageFly Design")
    leads = j.get("leads", [])
    sync, drafts, to_classify, events = [], [], [], 0
    pre_send = {"new", "building", "pending_review", "rebuild_requested", "approved", "rejected"}
    for L in leads:
        d, lid = L["store_domain"], L["lead_id"]
        st = ac2(f"/{d}")
        acts = ac2(f"/{d}/activities", {"limit": 50}).get("items", [])
        up = {"lead_id": lid}
        if st.get("shopDomain"):
            up.update({"app_status": st.get("status"), "uninstalled_at": st.get("uninstalledAt"),
                       "current_plan": st.get("pageflyPlan"), "current_price": float(st.get("pageflyPrice") or 0),
                       "pages_now": int(st.get("totalPages") or 0), "published_now": int(st.get("numPublished") or 0)})
            base_price = float(L.get("price_at_send") or 0)
            base_time = parse_iso(L.get("sent_at") if L.get("group") == "test" and L.get("sent_at") else L.get("created_at")) or now_utc()
            if up["current_price"] > base_price and not L.get("upgraded"):
                acts2 = sorted([a for a in acts if a.get("type") == "SUBSCRIPTION_CHARGE_ACTIVATED"
                                and (parse_iso(a.get("occurredAt")) or base_time) >= base_time],
                               key=lambda a: a["occurredAt"], reverse=True)
                up.update({"upgraded": True, "upgraded_at": acts2[0]["occurredAt"] if acts2 else iso(),
                           "upgraded_to": st.get("pageflyPlan"), "mrr_added": up["current_price"] - base_price})
            if L.get("group") == "test" and L.get("downloads", 0) > 0 and up["pages_now"] > int(L.get("pages_at_send") or 0):
                up["used_page"] = True
            if up.get("app_status") == "uninstalled":
                up["status"] = "uninstalled"
            elif up.get("upgraded") or L.get("upgraded"):
                up["status"] = "upgraded"
            elif up.get("used_page") and L.get("status") not in pre_send:
                up["status"] = "used"
        # Crisp read receipt + replies
        sid = L.get("crisp_session")
        if sid:
            cs, cj = crisp("GET", f"/conversation/{sid}/messages")
            msgs = cj.get("data") if isinstance(cj, dict) and isinstance(cj.get("data"), list) else []
            sent_ts = (parse_iso(L.get("sent_at")) or now_utc()).timestamp() * 1000
            if any(m.get("from") == "operator" and m.get("type") == "text" and m.get("read") for m in msgs):
                up["message_read"] = True
            replies = [m for m in msgs if m.get("from") == "user" and m.get("type") == "text" and float(m.get("timestamp", 0)) >= sent_ts]
            if replies:
                last_at = iso(datetime.fromtimestamp(float(replies[-1]["timestamp"]) / 1000, timezone.utc))
                up["replied"] = True
                if last_at != L.get("last_reply_at"):
                    text = "\n".join(str(m.get("content", "")) for m in replies[-5:])[:1500]
                    up.update({"last_reply_at": last_at, "last_reply_text": text[:500]})
                    to_classify.append({"lead_id": lid, "store": L.get("store_name") or d, "text": text})
        sync.append(up)
        # follow-up drafts (need admin approval in PageFly Design before sending)
        if L.get("group") != "test" or not sid or L.get("status") in ("uninstalled", "upgraded", "rejected"):
            continue
        have = set(L.get("message_kinds") or [])
        fill = {"hi": greet(L), "link": L.get("design_url", ""), "pic": cfg["pic"], "review": cfg["review_url"]}
        # rating-based review ask
        if (L.get("rating") or 0) >= 4 and "review" not in have and not L.get("reviewed_app") and L.get("sentiment") != "Negative":
            drafts.append({"lead_id": lid, "kind": "review", "content": REVIEW.format(**fill)})
        if up.get("upgraded") or up.get("replied") or L.get("replied"):
            continue
        hrs = hours_since(L.get("sent_at"))
        if int(L.get("unique_views") or 0) == 0 and hrs >= cfg["followup1_hours"] and "followup1" not in have:
            drafts.append({"lead_id": lid, "kind": "followup1", "content": FU1.format(**fill)})
        elif int(L.get("downloads") or 0) == 0 and hrs >= cfg["followup2_hours"] and "followup2" not in have:
            seen = "I saw you had a look at the pages I designed for your store. " if int(L.get("unique_views") or 0) else ""
            drafts.append({"lead_id": lid, "kind": "followup2", "content": FU2.format(seen=seen, **fill)})
    for c in chunks(sync):
        pfd("POST", "/api/upsell/leads/sync", {"leads": c})
    for c in chunks(drafts):
        pfd("POST", "/api/upsell/messages", {"messages": c})
    json.dump(to_classify, open("replies_to_classify.json", "w"), ensure_ascii=False, indent=1)
    print(json.dumps({"tracked": len(leads), "upgraded_now": [u["lead_id"] for u in sync if u.get("upgraded")],
                      "drafts": [f"{x['lead_id']}:{x['kind']}" for x in drafts], "replies_to_classify": len(to_classify)}, ensure_ascii=False))


def cmd_apply_sentiment(args):
    cfg = settings()
    items = json.load(open(args[0])) if args else []
    if not items:
        print(json.dumps({"applied": 0})); return
    s, j = pfd("GET", "/api/upsell/leads/export?active=1&tracking_days=60")
    by_id = {l["lead_id"]: l for l in j.get("leads", [])}
    sync, drafts = [], []
    for it in items:
        L = by_id.get(it["lead_id"], {})
        summary = (it.get("summary_vi") or "") + (" [Khách muốn chỉnh sửa page]" if it.get("wants_changes") else "")
        sync.append({"lead_id": it["lead_id"], "sentiment": it.get("sentiment", "Neutral"), "feedback_summary": summary,
                     "wants_changes": bool(it.get("wants_changes"))})
        if it.get("sentiment") == "Positive" and L and "review" not in set(L.get("message_kinds") or []) and not L.get("reviewed_app"):
            fill = {"hi": greet(L), "pic": cfg["pic"], "review": cfg["review_url"]}
            drafts.append({"lead_id": it["lead_id"], "kind": "review", "content": REVIEW.format(**fill)})
    pfd("POST", "/api/upsell/leads/sync", {"leads": sync})
    if drafts:
        pfd("POST", "/api/upsell/messages", {"messages": drafts})
    print(json.dumps({"applied": len(sync), "review_drafts": len(drafts)}))


def cmd_send(args):
    """Send what can go out now. The server picks it (Gửi ngay, or inside the
    customer's hours) and holds each message for this run (claim=1), so this
    run and another one at the same time never send the same message twice.
    Asks again until nothing is left: a message approved while this run is
    sending goes out in the same run."""
    cfg = settings()
    sent, failed, waiting = [], [], 0

    def fail(m, error):  # report it, and keep the reason for this run's output
        pfd("POST", f"/api/upsell/messages/{m['id']}/result", {"status": "failed", "error": error})
        failed.append({"id": m["id"], "lead_id": m.get("lead_id"), "error": error})

    for _ in range(5):
        s, j = pfd("GET", "/api/upsell/messages?status=approved&claim=1")
        if s != 200:
            sys.exit("Cannot read approved messages")
        waiting = j.get("waiting") or 0
        batch = j.get("messages", [])
        if not batch:
            break
        for m in batch:
            send_one(m, cfg, sent, fail)
    print(json.dumps({"sent": sent, "failed": failed, "waiting_for_business_hours": waiting}))


def send_one(m, cfg, sent, fail):
    L = m.get("lead") or {}
    if not L.get("email"):
        fail(m, "No email"); return
    sid = L.get("crisp_session")
    result = {"status": "sent", "sent_at": iso()}
    if not sid:  # first message: new conversation
        cs, cj = crisp("POST", "/conversation", {})
        sid = (cj.get("data") or {}).get("session_id") if isinstance(cj, dict) else None
        if not sid:
            fail(m, f"Crisp create {cs}"); return
        name = L.get("store_name") or "Merchant"
        crisp("PATCH", f"/conversation/{sid}/meta", {"email": L["email"], "nickname": name,
                                                     "subject": f"We designed 2 pages for {name}"})
        st = ac2(f"/{L.get('store_domain')}")
        result.update({"crisp_session": sid, "ticket_link": f"https://app.crisp.chat/website/{CRISP_WID}/inbox/{sid}/",
                       "plan_at_send": st.get("pageflyPlan") or "Free", "price_at_send": float(st.get("pageflyPrice") or 0),
                       "pages_at_send": int(st.get("totalPages") or 0)})
    ms, mj = crisp("POST", f"/conversation/{sid}/message", {"type": "text", "from": "operator", "origin": "chat",
                                                           "content": m["content"], "user": CRISP_SENDER})
    if ms >= 300 or (isinstance(mj, dict) and mj.get("error")):
        fail(m, f"Crisp message {ms}"); return
    if m.get("kind") == "initial":
        crisp("POST", f"/conversation/{sid}/message", {"type": "note", "from": "operator", "origin": "chat",
              "content": f"BPU auto-build program (2 free pages). Lead {m['lead_id']}. Preview: {L.get('design_url')}. "
                         f"If the customer replies, please mention {cfg['pic']}.", "user": {"type": "website", "nickname": "PageFly Team"}})
    crisp("PATCH", f"/conversation/{sid}/state", {"state": "resolved"})
    pfd("POST", f"/api/upsell/messages/{m['id']}/result", result)
    sent.append(f"{m['lead_id']}:{m.get('kind')}")
    time.sleep(1)


# ---------------------------------------------------------------- Google Sheet mirror
LEADS_COLS = [("Lead ID", "lead_id"), ("Added At", "created_at"), ("Store Domain", "store_domain"), ("Store Name", "store_name"),
              ("Email", "email"), ("Country", "country"), ("Timezone", "timezone"), ("Shopify Plan", "shopify_plan"),
              ("Lead Score", "lead_score"), ("Score Reasons", "score_reasons"), ("Category Hint", "category_hint"), ("Group", "group"),
              ("Status", "status"), ("Plan At Send", "plan_at_send"), ("Price At Send", "price_at_send"), ("Pages At Send", "pages_at_send"),
              ("Published At Send", "published_at_send"), ("Build Started At", "build_started_at"), ("Built At", "built_at"),
              ("Page 1 Type", "page1_type"), ("Page 2 Type", "page2_type"), ("Design ID", "design_id"), ("Design Link", "design_url"),
              ("Sent At", "sent_at"), ("Crisp Session", "crisp_session"), ("Ticket Link", "ticket_link"), ("Message Read", "message_read"),
              ("Link Views", "unique_views"), ("First View At", "first_view_at"), ("Downloads", "downloads"),
              ("First Download At", "first_download_at"), ("CTA Clicks", "cta_clicks"), ("Design Rating", "rating"),
              ("Pages Now", "pages_now"), ("Published Now", "published_now"), ("Used Page", "used_page"), ("Current Plan", "current_plan"),
              ("Current Price", "current_price"), ("Upgraded", "upgraded"), ("Upgraded At", "upgraded_at"), ("Upgraded To", "upgraded_to"),
              ("MRR Added", "mrr_added"), ("Follow-up 1 At", "followup1_at"), ("Follow-up 2 At", "followup2_at"), ("Replied", "replied"),
              ("Last Reply At", "last_reply_at"), ("Last Reply Text", "last_reply_text"), ("Sentiment", "sentiment"),
              ("Feedback Summary", "feedback_summary"), ("Review Asked At", "review_asked_at"), ("Reviewed", "reviewed_app"),
              ("App Status", "app_status"), ("Uninstalled At", "uninstalled_at"), ("Last Checked", "last_synced_at"), ("Error", "error"),
              ("Notes", "internal_notes")]
INSTALL_COLS = [("Synced At", "synced_at"), ("Installed At", "installed_at"), ("Store Domain", "store_domain"), ("Store Name", "store_name"),
                ("Email", "email"), ("Phone", "phone"), ("Country", "country"), ("Timezone", "timezone"), ("Shopify Plan", "shopify_plan"),
                ("PF Plan", "pf_plan"), ("App Status", "app_status"), ("Onboarding Intent", "onboarding_intent"), ("Storefront", "storefront"),
                ("Product Count", "product_count"), ("Category Hint", "category_hint"), ("Email Type", "email_type"), ("Lead Score", "lead_score"),
                ("Score Reasons", "score_reasons"), ("Lead", "lead"), ("Skip Reason", "skip_reason")]
EVENT_COLS = [("Time", "created_at"), ("Store Domain", "store_domain"), ("Lead ID", "lead_id"), ("Event", "type"),
              ("Detail", "detail"), ("Source", "actor")]
TIME_KEYS = re.compile(r"(_at|^created_at)$")


def to_cell(k, v):
    if v is None:
        return ""
    if isinstance(v, bool):
        return "Yes" if v else ""
    if k == "status":
        return {"rebuild_requested": "REBUILD"}.get(str(v), str(v).upper())
    if k == "group":
        return str(v).capitalize()
    if isinstance(v, str) and TIME_KEYS.search(k) and re.match(r"\d{4}-\d{2}-\d{2}T", v):
        return vn(v)
    if isinstance(v, (dict, list)):
        return json.dumps(v, ensure_ascii=False)[:500]
    return v


def rows(items, cols):
    return [[c for c, _ in cols]] + [[to_cell(k, it.get(k)) for _, k in cols] for it in items]


def cmd_sheet(args):
    raw = os.environ.get("GOOGLE_SA_JSON", "")
    if not raw:
        print(json.dumps({"sheet": "skipped (no GOOGLE_SA_JSON)"})); return
    try:
        info = json.loads(raw)
    except ValueError:
        info = json.loads(base64.b64decode(raw))
    from google.oauth2 import service_account
    from google.auth.transport.requests import AuthorizedSession
    creds = service_account.Credentials.from_service_account_info(info, scopes=["https://www.googleapis.com/auth/spreadsheets"])
    sess = AuthorizedSession(creds)
    base = f"https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}"
    _, L = pfd("GET", "/api/upsell/leads/export?all=1")
    _, I = pfd("GET", "/api/upsell/installs?since_hours=2160")
    _, E = pfd("GET", "/api/upsell/events/export?limit=3000")
    data = {"Leads": rows(L.get("leads", []), LEADS_COLS), "Installs": rows(sorted(I.get("installs", []), key=lambda x: x.get("installed_at") or "", reverse=True), INSTALL_COLS),
            "Events": rows(E.get("events", []), EVENT_COLS)}
    for tab, vals in data.items():
        sess.post(f"{base}/values/{urllib.parse.quote(tab)}!A2:ZZ:clear")
        r = sess.put(f"{base}/values/{urllib.parse.quote(tab)}!A1", params={"valueInputOption": "RAW"},
                     json={"values": vals})
        if r.status_code >= 300:
            log("sheet", tab, r.status_code, r.text[:200])
    print(json.dumps({tab: len(v) - 1 for tab, v in data.items()}))


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    cmd, rest = sys.argv[1], sys.argv[2:]
    {"sync": cmd_sync, "track": cmd_track, "apply-sentiment": cmd_apply_sentiment, "send": cmd_send, "sheet": cmd_sheet}[cmd](rest)
