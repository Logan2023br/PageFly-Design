"""Shared bits of the Claude Review runner: the API, the work folder, file checks.

Environment:
  COLLECTIONS_API_KEY   the collections key (X-API-Key). Required.
  PFD_BASE              default https://pagefly-design.pagefly.io
  CR_WORK               work folder, default /tmp/claude-review
  CR_OUT                where finished folders are built, default /mnt/user-data/outputs/claude-review
"""
import io, json, os, time, urllib.error, urllib.request, zipfile

BASE = os.environ.get("PFD_BASE", "https://pagefly-design.pagefly.io")
KEY = os.environ.get("COLLECTIONS_API_KEY", "").strip()
HERE = os.path.dirname(os.path.abspath(__file__))
SK = os.path.join(HERE, "skill")  # review-collection-pages scripts, with this repo's fixes
WORK = os.environ.get("CR_WORK", "/tmp/claude-review")
OUT = os.environ.get("CR_OUT", "/mnt/user-data/outputs/claude-review")


def req(method, path, body=None, ctype=None, key=True):
    if key and not KEY: raise SystemExit("COLLECTIONS_API_KEY is not set")
    h = {"User-Agent": "claude-review-runner"}
    if key: h["X-API-Key"] = KEY
    if ctype: h["Content-Type"] = ctype
    r = urllib.request.Request(BASE + path, data=body, method=method, headers=h)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(r, timeout=120) as resp:
                return resp.status, resp.read()
        except urllib.error.HTTPError as e:
            if e.code in (429, 502, 503, 504) and attempt < 3:
                time.sleep(10 * (attempt + 1)); continue
            return e.code, e.read()
        except Exception:
            if attempt < 3: time.sleep(10); continue
            raise


def jreq(method, path, obj=None):
    code, b = req(method, path, json.dumps(obj).encode() if obj is not None else None,
                  "application/json" if obj is not None else None)
    try: return code, json.loads(b)
    except Exception: return code, {"raw": b[:300].decode("utf-8", "replace")}


def all_sets():
    code, d = jreq("GET", "/api/admin/collection-pages")
    assert code == 200 and d.get("ok"), (code, d)
    return sorted(d["sets"], key=lambda s: s["position"])


def get_set(slug):
    for s in all_sets():
        if s["slug"] == slug: return s
    raise SystemExit(f"no set {slug}")


def one_json(data):
    z = zipfile.ZipFile(io.BytesIO(data))
    names = [n for n in z.namelist() if n.endswith(".json")]
    assert len(names) == 1, names
    json.loads(z.read(names[0]))
    return names[0]


def issues(data):
    """Structural problems the pagefly-builder validator checks; shipping must not add any."""
    z = zipfile.ZipFile(io.BytesIO(data)); d = json.loads(z.read(z.namelist()[0]))
    items = d.get("items", []); ids = {i["id"] for i in items}; sids = {x["id"] for x in d.get("styles", [])}
    n = {"dup_id": len(items) - len(ids), "missing_child": 0, "missing_style": 0, "custom_in_global": 0, "no_class": 0}
    for i in items:
        n["missing_child"] += sum(c not in ids for c in i.get("children", []))
        n["missing_style"] += sum(x not in sids for x in i.get("styles", []) if isinstance(x, str))
        data_ = i.get("data") or {}
        g = data_.get("classGlobalStyling") or []
        if isinstance(g, str): g = g.split()
        n["custom_in_global"] += sum(not c.startswith("pf-") for c in g)
        if i.get("type") not in ("Body", "Layout") and not data_.get("className"): n["no_class"] += 1
    return n
