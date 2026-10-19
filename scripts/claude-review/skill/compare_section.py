"""Side-by-side PNG of one section: python compare_section.py <tag> <section-class> <width> <ref.html> <emu.html> -> cmp_<tag>.png"""
import sys,os
from PIL import Image
from playwright.sync_api import sync_playwright
tag,cls,w=sys.argv[1],sys.argv[2],int(sys.argv[3]); paths=sys.argv[4:6]
ims=[]
with sync_playwright() as p:
    b=p.chromium.launch()
    for path in paths:
        pg=b.new_page(viewport={'width':w,'height':900}); pg.goto('file://'+os.path.abspath(path),wait_until='networkidle')
        pg.add_style_tag(content="*,*::before,*::after{animation:none!important;transition:none!important}")
        pg.evaluate("document.querySelectorAll('.pu-rv').forEach(e=>e.classList.add('in'));document.querySelectorAll('img').forEach(i=>i.loading='eager')")
        el=pg.locator('section.'+cls).nth(int(os.environ.get('NTH','0'))); el.scroll_into_view_if_needed(); pg.wait_for_timeout(2500)
        el.screenshot(path='_s.png'); ims.append(Image.open('_s.png').copy())
    b.close()
W=sum(i.width for i in ims)+10; H=max(i.height for i in ims)
c=Image.new('RGB',(W,H),'red'); x=0
for i in ims: c.paste(i,(x,0)); x+=i.width+10
c.thumbnail((1400,900)); c.save(f'cmp_{tag}.png'); print(c.size)
