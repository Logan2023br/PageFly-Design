#!/usr/bin/env python3
"""Build a reviewed set's delivery folder.

  python3 export.py <slug> <seq>       seq = how many sets already went out (runner.py seq)

Folder: <CR_OUT>/<A>-<B> collection pages/<Set name> _ <size>/   (20 sets per <A>-<B>, starting 21-40)
  <Set name> - All Pages.pagefly     the set as it is now in the database (one import)
  <n> - <Page>.html                  each page's mockup, in set order
  <Set name> - Desktop.jpg           home page mockup, full page at 1440, optimised
  <Set name> - Mobile.jpg            the same at 390
Prints JSON: {"group": "21-40 collection pages", "folder": "<Set name> _ 1.4MB", "files": [...]}
"""
import hashlib, io, json, os, re, shutil, sys, time, zipfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import OUT, WORK, req, get_set  # noqa
from PIL import Image
from playwright.sync_api import sync_playwright

FREEZE = "*,*::before,*::after{animation:none!important;transition:none!important}"


def safe(s): return re.sub(r'[\\/:*?"<>|]+', "-", s).strip()


def shot(html, w, out):
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={"width": w, "height": 900})
        pg.goto("file://" + os.path.abspath(html), wait_until="networkidle")
        pg.add_style_tag(content=FREEZE)
        pg.evaluate("document.querySelectorAll('[class*=rv]').forEach(e=>e.classList.add('in'));"
                    "document.querySelectorAll('img').forEach(i=>i.loading='eager')")
        h = pg.evaluate("document.documentElement.scrollHeight")
        for y in range(0, h, 700): pg.evaluate(f"window.scrollTo(0,{y})"); pg.wait_for_timeout(120)
        pg.evaluate("window.scrollTo(0,0)"); pg.wait_for_timeout(800)
        png = out + ".png"; pg.screenshot(path=png, full_page=True); b.close()
    im = Image.open(png).convert("RGB")
    if w > 1000 and im.width > 1440: im = im.resize((1440, round(im.height * 1440 / im.width)))
    im.save(out, "JPEG", quality=78, optimize=True, progressive=True); os.remove(png)


def size_label(n):
    return f"{n / 1048576:.1f}MB" if n >= 1048576 else f"{max(1, round(n / 1024))}KB"


def main(slug, seq):
    s = get_set(slug); name = safe(s["name"])
    a = 21 + 20 * (seq // 20); group = f"{a}-{a + 19} collection pages"
    tmp = os.path.join(OUT, group, "_building_" + slug); shutil.rmtree(tmp, ignore_errors=True); os.makedirs(tmp)
    code, allpf = req("GET", f"/api/collection-pages/{slug}/all.pagefly?v={time.time()}", key=False)
    assert code == 200, ("all.pagefly", code)
    # the set file must hold exactly the pages shipped (compare JSON content; the server renumbers entry names)
    ship = os.path.join(WORK, slug, "ship")
    if os.path.isdir(ship):
        z = zipfile.ZipFile(io.BytesIO(allpf)); m = {re.sub(r"^\d+ - ", "", n): n for n in z.namelist()}
        for f in os.listdir(ship):
            sz = zipfile.ZipFile(os.path.join(ship, f)); n = sz.namelist()[0]
            k = re.sub(r"^\d+ - ", "", n)
            assert k in m and json.loads(sz.read(n)) == json.loads(z.read(m[k])), ("set file differs from shipped page", f)
    open(os.path.join(tmp, f"{name} - All Pages.pagefly"), "wb").write(allpf)
    pages = sorted(s["pages"], key=lambda p: p["position"])
    for i, p in enumerate(pages, 1):
        src = os.path.join(WORK, slug, "html", p["slug"] + ".html")
        if os.path.exists(src): html = open(src, "rb").read()
        else:
            c, html = req("GET", f"/api/collection-pages/{slug}/{p['slug']}.html", key=False); assert c == 200
        open(os.path.join(tmp, f"{i} - {safe(p['label'])}.html"), "wb").write(html)
    home = os.path.join(tmp, f"1 - {safe(pages[0]['label'])}.html")
    shot(home, 1440, os.path.join(tmp, f"{name} - Desktop.jpg"))
    shot(home, 390, os.path.join(tmp, f"{name} - Mobile.jpg"))
    total = sum(os.path.getsize(os.path.join(tmp, f)) for f in os.listdir(tmp))
    folder = f"{name} _ {size_label(total)}"
    final = os.path.join(OUT, group, folder); shutil.rmtree(final, ignore_errors=True); os.rename(tmp, final)
    print(json.dumps({"group": group, "folder": folder,
                      "files": sorted(os.path.join(final, f) for f in os.listdir(final))}, ensure_ascii=False))


if __name__ == "__main__":
    main(sys.argv[1], int(sys.argv[2]))
