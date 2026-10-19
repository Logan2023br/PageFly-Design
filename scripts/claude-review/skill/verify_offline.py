"""Offline check: render every converted page with the PageFly-faithful emulator
(Image5 = bare <img>) and compare section-by-section with its HTML mockup.

Usage: python verify_offline.py <out>/work [--widths 1440,390]
Prints per section: height ref/emu and % of differing pixels; '<<' marks a section to inspect.
Dynamic widgets (ProductList2/ProductBox, forms) render as placeholders here: expect '<<'
on those and verify them on the real render instead.
"""
import json, os, sys, subprocess, zipfile
import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
FREEZE = "*,*::before,*::after{animation:none!important;transition:none!important}"
JS_SECS = """Array.from(document.querySelectorAll('section')).map(s=>{const r=s.getBoundingClientRect();
 return [s.className.split(' ').filter(c=>!/^pf-\\d+_$/.test(c)).slice(0,2).join(' '),Math.round(r.top+scrollY),Math.round(r.height)]})"""

def cap(browser, path, w, png):
    pg = browser.new_page(viewport={'width': w, 'height': 900})
    pg.goto('file://' + os.path.abspath(path), wait_until='networkidle'); pg.wait_for_timeout(1200)
    pg.evaluate("document.querySelectorAll('img').forEach(i=>i.loading='eager')")
    h = pg.evaluate('document.body.scrollHeight'); y = 0
    while y < h: pg.evaluate('window.scrollTo(0,%d)' % y); pg.wait_for_timeout(120); y += 700
    pg.evaluate('window.scrollTo(0,0)'); pg.wait_for_timeout(1500)
    pg.add_style_tag(content=FREEZE)
    pg.evaluate("document.querySelectorAll('[class*=rv]').forEach(e=>e.classList.add('in'));document.querySelectorAll('[style*=translate]').forEach(e=>e.style.translate='')")
    pg.wait_for_timeout(400)
    s = pg.evaluate(JS_SECS); pg.screenshot(path=png, full_page=True); pg.close(); return s

def main(work, widths):
    pairs = json.load(open(os.path.join(work, 'pairs.json')))
    with sync_playwright() as p:
        b = p.chromium.launch()
        for j, h in pairs.items():
            name = os.path.basename(j)[:-5]; pf = os.path.join(work, name + '.pagefly'); emu = os.path.join(work, name + '.emu.html')
            with zipfile.ZipFile(pf, 'w') as z: z.write(j, os.path.basename(j))
            subprocess.run([sys.executable, os.path.join(HERE, 'emu_preview.py'), pf, emu], check=True, capture_output=True)
            for w in widths:
                A = cap(b, h, w, os.path.join(work, '_ref.png')); B = cap(b, emu, w, os.path.join(work, '_emu.png'))
                ia = np.asarray(Image.open(os.path.join(work, '_ref.png')).convert('RGB'), int)
                ib = np.asarray(Image.open(os.path.join(work, '_emu.png')).convert('RGB'), int)
                print('== %s @%d' % (name, w))
                for (n, ya, ha), (_, yb, hb) in zip(A, B):
                    hh = min(ha, hb); a = ia[ya:ya + hh]; c = ib[yb:yb + hh]; hh = min(len(a), len(c))
                    pct = (np.abs(a[:hh] - c[:hh]).sum(2) > 60).mean() * 100 if hh else 100
                    flag = '  <<' if pct > 1.5 or abs(ha - hb) > 2 else ''
                    print('  %-34s h %5d/%-5d diff %5.2f%%%s' % (n, ha, hb, pct, flag))
                if len(A) != len(B): print('  !! section count differs', len(A), len(B))
        b.close()

if __name__ == '__main__':
    a = sys.argv[1:]; widths = [1440, 390]
    if '--widths' in a: i = a.index('--widths'); widths = [int(x) for x in a[i + 1].split(',')]; del a[i:i + 2]
    main(a[0], widths)
