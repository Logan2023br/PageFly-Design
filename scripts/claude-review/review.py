#!/usr/bin/env python3
"""Full review-collection-pages run for one set, in two halves.

  python3 review.py prep <slug> [--redo]   download, take review as Claude, pipeline + extra fixes,
                                           verify_offline, side-by-side PNGs of the sections that
                                           need a human look  -> sets/<slug>/report.json
  python3 review.py verify <slug> [page]   re-run verify (after a manual JSON fix)
  python3 review.py ship <slug> [--reviewing]  re-zip each page from work JSON, validate vs original,
                                           upload to its own page, read back, Claude Done
                                           (--reviewing: leave it "Claude Reviewing" — fixed after the
                                           real render, waiting for a re-import to confirm)
"""
import glob, hashlib, io, json, os, re, shutil, subprocess, sys, time, zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import SK, WORK, req, jreq, get_set, one_json, issues  # noqa

CP = os.path.dirname(os.path.abspath(__file__))
ROOT = WORK

# sections whose content comes from the store (the emulator draws placeholders): judged on the real render
STORE = {"ProductList2", "ArticleList2", "CollectionListing2", "CollectionBox", "ArticleBox", "ArticleTitle",
         "ArticleContent", "Form2", "ContactForm2", "Newsletter2", "ProductTitle", "ProductMedia3",
         "ProductBox", "MailChimpBox", "ProductATC2", "ProductPrice2"}


def sh(*a, **k):
    return subprocess.run(list(a), capture_output=True, text=True, **k)


def paths(slug):
    d = os.path.join(ROOT, slug)
    return d, os.path.join(d, "full", "out", "work")


def page_map(work):
    """work json path -> page slug, from the originals' entry names (never from fuzzy pairing)."""
    d = os.path.dirname(os.path.dirname(os.path.dirname(work))); out = {}
    for f in glob.glob(os.path.join(d, "orig", "*.pagefly")):
        entry = one_json(open(f, "rb").read())
        out[os.path.join(work, entry)] = os.path.basename(f)[:-8]
    pairs = json.load(open(os.path.join(work, "pairs.json")))
    for j, h in pairs.items():  # the pipeline must have paired each page with its own mockup
        j = os.path.join(work, os.path.basename(j))
        hs = os.path.splitext(os.path.basename(h))[0]
        assert hs in (os.path.basename(j)[:-5], out.get(j)), ("bad pairing", j, h)
    return out


def section_types(jpath):
    d = json.load(open(jpath)); items = {i["id"]: i for i in d["items"]}; out = {}
    def walk(i, acc):
        acc.add(i["type"])
        for c in i.get("children", []):
            if c in items: walk(items[c], acc)
    for i in d["items"]:
        if i["type"] == "FlexSection":
            cn = ((i.get("data") or {}).get("className") or "").strip()
            if cn:
                acc = out.setdefault(cn, set()); walk(i, acc)
    return out


def parse_verify(text):
    res = []; page = w = None
    for line in text.splitlines():
        m = re.match(r"== (.*) @(\d+)", line)
        if m: page, w = m.group(1), int(m.group(2)); continue
        m = re.match(r"\s+(.+?)\s+h\s+(\d+)/(\d+)\s+diff\s+([\d.]+)%(\s+<<)?", line)
        if m and m.group(5):
            res.append({"page": page, "w": w, "sec": m.group(1).strip(), "ha": int(m.group(2)), "hb": int(m.group(3)), "pct": float(m.group(4))})
    return res


def classify(work, flagged):
    types = {os.path.basename(j)[:-5]: section_types(j) for j in glob.glob(os.path.join(work, "*.json")) if not j.endswith("pairs.json")}
    look = []; expected = []
    for f in flagged:
        want = set(f["sec"].split()); t = set()
        for cn, ty in types.get(f["page"], {}).items():
            if want <= set(cn.split()): t |= ty
        if f["ha"] == 0 and f["hb"] == 0: f["why"] = "empty layer (0px)"; expected.append(f)
        elif t & STORE: f["why"] = "store data: " + ",".join(sorted(t & STORE)); expected.append(f)
        elif f["pct"] < 3 and abs(f["ha"] - f["hb"]) <= 2: f["why"] = "noise <3%"; expected.append(f)
        else: look.append(f)
    return look, expected


def compare(work, f):
    pm = page_map(work); j = os.path.join(work, f["page"] + ".json")
    html = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(work))), "html", pm[j] + ".html")
    assert os.path.exists(html), html
    tag = re.sub(r"\W+", "_", f"{pm[j]}_{f['sec']}_{f['w']}")
    r = sh(sys.executable, os.path.join(SK, "compare_section.py"), tag, f["sec"].replace(" ", "."), str(f["w"]), html, j[:-5] + ".emu.html", cwd=work, timeout=300)
    return os.path.join(work, f"cmp_{tag}.png") if r.returncode == 0 else "compare failed: " + r.stderr[-200:]


def verify(slug, only=None):
    d, work = paths(slug)
    if only:
        r = sh(os.path.join(CP, "verify_some.sh"), work, only, cwd=d, timeout=1800); text = r.stdout
    else:
        r = sh(sys.executable, os.path.join(SK, "verify_offline.py"), work, cwd=d, timeout=1800); text = r.stdout
    open(os.path.join(d, "verify.txt" if not only else "verify_part.txt"), "w").write(text + r.stderr[-2000:])
    look, expected = classify(work, parse_verify(text))
    for f in look: f["png"] = compare(work, f)
    rep = {"slug": slug, "look": look, "expected": expected}
    json.dump(rep, open(os.path.join(d, "report.json"), "w"), indent=1, ensure_ascii=False)
    return rep


def prep(slug, redo=False):
    s = get_set(slug); sid = s["id"]; rv = s.get("review")
    if rv and rv["reviewer"] != "Claude": return {"slug": slug, "skip": f"{rv['reviewer']} {'Done' if rv.get('doneAt') else 'Reviewing'}"}
    if rv and rv.get("doneAt") and not redo: return {"slug": slug, "skip": "Claude Done"}
    if s["visibility"] == "hidden" or s["access"] == "paid": return {"slug": slug, "skip": f"{s['visibility']}/{s['access']}"}
    d, work = paths(slug)
    keep = os.path.join(d, "orig")
    had_orig = os.path.isdir(keep) and len(os.listdir(keep)) == len(s["pages"])
    for sub in ("full", "html", "ship"): shutil.rmtree(os.path.join(d, sub), ignore_errors=True)
    os.makedirs(os.path.join(d, "html")); os.makedirs(os.path.join(d, "full", "in")); os.makedirs(keep, exist_ok=True)
    t = int(time.time())
    for p in s["pages"]:
        ps = p["slug"]
        c1, html = req("GET", f"/api/collection-pages/{slug}/{ps}.html?v={t}", key=False)
        assert c1 == 200, (ps, c1)
        open(os.path.join(d, "html", ps + ".html"), "wb").write(html)
        if not had_orig:  # first touch: the DB file is the original
            c2, pf = req("GET", f"/api/collection-pages/{slug}/{ps}.pagefly?v={t}", key=False)
            assert c2 == 200 and len(pf) == p["pageflySize"], (ps, c2)
            one_json(pf); open(os.path.join(keep, ps + ".pagefly"), "wb").write(pf)
        shutil.copy(os.path.join(keep, ps + ".pagefly"), os.path.join(d, "full", "in", ps + ".pagefly"))
    code, r = jreq("PUT", f"/api/admin/collection-pages/{sid}/review", {"reviewer": "Claude"})
    assert code == 200 and r.get("ok"), ("take", code, r)
    # name each mockup after its page's JSON entry so the pipeline pairs exactly
    hp = os.path.join(d, "full", "html"); os.makedirs(hp)
    for p in s["pages"]:
        entry = one_json(open(os.path.join(keep, p["slug"] + ".pagefly"), "rb").read())
        shutil.copy(os.path.join(d, "html", p["slug"] + ".html"), os.path.join(hp, entry[:-5] + ".html"))
    # The skill pipeline is NOT idempotent (Image5 wrappers would be added twice). A set the
    # pipeline already went through (its customCSS carries the "editor parity" marker) is taken
    # as it is: only extra_fixes (idempotent) and verify run on it.
    def processed(f):
        z = zipfile.ZipFile(f); return "/* editor parity */" in json.loads(z.read(z.namelist()[0])).get("customCSS", "")
    ins = sorted(glob.glob(os.path.join(d, "full", "in", "*.pagefly")))
    if all(processed(f) for f in ins):
        os.makedirs(work); pairs = {}
        for f in ins:
            z = zipfile.ZipFile(f); n = z.namelist()[0]
            open(os.path.join(work, n), "wb").write(z.read(n))
            pairs[os.path.join(work, n)] = os.path.join(hp, n[:-5] + ".html")
        json.dump(pairs, open(os.path.join(work, "pairs.json"), "w"), indent=1)
        r = subprocess.CompletedProcess([], 0, "already through the pipeline: kept as is\n", "")
    else:
        assert not any(processed(f) for f in ins), "some pages processed, some not — check the originals"
        r = sh(sys.executable, os.path.join(SK, "run_pipeline.py"), "--pagefly", os.path.join(d, "full", "in"),
               "--html", hp, "--out", os.path.join(d, "full", "out"), cwd=d, timeout=1200)
    open(os.path.join(d, "pipeline.txt"), "w").write(r.stdout + r.stderr)
    assert r.returncode == 0, r.stderr[-800:]
    # pairing must be exact: every page once, json <-> its own html
    pm = page_map(work); assert sorted(pm.values()) == sorted(p["slug"] for p in s["pages"]), pm
    fx = sh(sys.executable, os.path.join(CP, "extra_fixes.py"), work, cwd=d)
    rep = verify(slug)
    rep["pipeline"] = r.stdout.strip().splitlines(); rep["extra"] = [l for l in fx.stdout.splitlines() if "[]" not in l]
    json.dump(rep, open(os.path.join(d, "report.json"), "w"), indent=1, ensure_ascii=False)
    return rep


def ship(slug, done_mark=True):
    s = get_set(slug); sid = s["id"]; d, work = paths(slug)
    rv = s.get("review"); assert rv and rv["reviewer"] == "Claude", rv
    if rv.get("doneAt"):  # re-ship of a finished set: take it again so Done gets the new time
        code, r = jreq("PUT", f"/api/admin/collection-pages/{sid}/review", {"reviewer": "Claude"}); assert code == 200, r
    pm = page_map(work); out = os.path.join(d, "ship"); shutil.rmtree(out, ignore_errors=True); os.makedirs(out)
    sizes = {p["slug"]: p for p in s["pages"]}; done = []
    for j, ps in sorted(pm.items(), key=lambda x: x[1]):
        orig = open(os.path.join(d, "orig", ps + ".pagefly"), "rb").read(); entry = one_json(orig)
        assert os.path.basename(j) == entry, (ps, "work json is not this page's entry", os.path.basename(j), entry)
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z: z.write(j, entry)
        new = buf.getvalue(); one_json(new)
        bi, ai = issues(orig), issues(new)
        worse = {k: (bi[k], ai[k]) for k in ai if ai[k] > bi[k]}; assert not worse, (ps, worse)
        open(os.path.join(out, ps + ".pagefly"), "wb").write(new)
        code, r = req("POST", f"/api/admin/collection-pages/{sid}/files?slug={ps}&kind=pagefly", new, "application/octet-stream")
        r = json.loads(r); assert code == 200 and r.get("ok") and r["set"]["id"] == sid, ("upload", ps, code, r)
        assert next(x for x in r["set"]["pages"] if x["slug"] == ps)["pageflySize"] == len(new)
        c, back = req("GET", f"/api/collection-pages/{slug}/{ps}.pagefly?v={time.time()}", key=False)
        assert c == 200 and hashlib.sha256(back).digest() == hashlib.sha256(new).digest(), ("readback", ps)
        done.append(ps)
    if not done_mark:
        return {"slug": slug, "name": s["name"], "pages": done, "done": None}
    code, r = jreq("PUT", f"/api/admin/collection-pages/{sid}/review", {"done": True})
    assert code == 200 and r.get("ok"), ("done", code, r)
    return {"slug": slug, "name": s["name"], "pages": done, "done": r["set"]["review"]}


if __name__ == "__main__":
    cmd, slug = sys.argv[1], sys.argv[2]
    if cmd == "prep": out = prep(slug, "--redo" in sys.argv)
    elif cmd == "verify": out = verify(slug, sys.argv[3] if len(sys.argv) > 3 else None)
    elif cmd == "ship": out = ship(slug, "--reviewing" not in sys.argv)
    print(json.dumps(out, ensure_ascii=False, indent=1))
