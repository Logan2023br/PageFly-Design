"""Step 4: product detail media (main photo frame + thumbnail strip) (ProductMedia3 = MediaMain3 + MediaList2 > MediaItem2)
styled from the HTML mockup's gallery, measured at desktop 1440 and mobile 390.

Without this, the real thumbnail strip renders at each photo's natural size (ragged row,
no grid, no active state) because MediaList2/MediaItem2 ship with no style.
Measured from the mockup's [data-pf-type="MediaList2"] (its children = thumbnails):
columns, gap, margin-top, thumbnail aspect-ratio / radius / opacity / object-fit, and the
active thumbnail's outline/opacity; the main photo's aspect-ratio from MediaMain3.

Writes (PageFly contract, from get_pagefly_guide):
  ProductMedia3.data  showList {all:true...}, listPosition {all:2} (strip below)
  MediaList2.data     slidesToShow per device = columns, navStyle none; style & margin-top/gap
  MediaItem2 styles   & (thumb box) + & img (photo) + &[data-active="true"] (selected)
  MediaMain3 styles   & > div img: aspect-ratio + --pf-aspect-ratio-type/value (inspector)
plus the same rules in customCSS via the elements' classes (belt and braces).

Usage: python product_gallery.py <in.json> <out.json> <mockup.html>
"""
import json, os, re, sys
from playwright.sync_api import sync_playwright

JS = """() => {
  const L = document.querySelector('[data-pf-type="MediaList2"]'); if (!L) return null;
  const kids = Array.from(L.children); if (!kids.length) return null;
  const cs = getComputedStyle(L), lr = L.getBoundingClientRect();
  const tops = kids.map(k => Math.round(k.getBoundingClientRect().top));
  const cols = tops.filter(t => t === tops[0]).length;
  const k0 = kids[0], k1 = kids[1] || kids[0], im0 = k0.querySelector('img') || k0, im1 = k1.querySelector('img') || k1;
  const r0 = im0.getBoundingClientRect(), r1 = k1.getBoundingClientRect(), rk0 = k0.getBoundingClientRect();
  const c0 = getComputedStyle(im0), c1 = getComputedStyle(im1);
  const prev = L.previousElementSibling, pr = prev ? prev.getBoundingClientRect() : null;
  const M = document.querySelector('[data-pf-type="MediaMain3"] img'), mr = M ? M.getBoundingClientRect() : null;
  const MR = document.querySelector('[data-pf-type="MediaMain3"]'), PM = document.querySelector('[data-pf-type="ProductMedia3"]');
  const cm = M ? getComputedStyle(M) : null, cr = MR ? getComputedStyle(MR) : null, cp = PM ? getComputedStyle(PM) : null;
  const box = c => c ? {rad: c.borderRadius, bg: c.backgroundColor, border: c.borderTopWidth + ' ' + c.borderTopStyle + ' ' + c.borderTopColor,
                        shadow: c.boxShadow, ov: c.overflow} : null;
  return {cols, gap: kids.length > 1 ? Math.max(r1.left - rk0.right, rk0.left - r1.right) : 0, mt: pr ? lr.top - pr.bottom : parseFloat(cs.marginTop),
    ratio: (r0.width / r0.height).toFixed(4), rad: c1.borderRadius, op: c1.opacity, fit: c1.objectFit,
    act: {op: c0.opacity, outline: c0.outlineWidth + ' ' + c0.outlineStyle + ' ' + c0.outlineColor,
          off: c0.outlineOffset, border: c0.borderTopWidth + ' ' + c0.borderTopStyle + ' ' + c0.borderTopColor},
    main: mr ? (mr.width / mr.height).toFixed(4) : null, mainImg: box(cm), mainRoot: box(cr), mediaRoot: box(cp)};
}"""


def measure(html, w):
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={'width': w, 'height': 900})
        pg.goto('file://' + os.path.abspath(html), wait_until='networkidle'); pg.wait_for_timeout(1200)
        m = pg.evaluate(JS); b.close(); return m


def ratio_str(r):
    r = float(r)
    for a, b in ((1, 1), (4, 5), (3, 4), (2, 3), (5, 4), (4, 3), (3, 2), (16, 9), (9, 16), (5, 7)):
        if abs(r - a / b) < 0.02: return '%d / %d' % (a, b)
    return '%.4f / 1' % r


def frame_css(b):
    if not b: return ''
    out = []
    if b['rad'] not in ('0px', ''): out.append('border-radius:%s;' % b['rad'])
    if b['bg'] not in ('rgba(0, 0, 0, 0)', 'transparent'): out.append('background-color:%s;' % b['bg'])
    if not b['border'].startswith('0px'): out.append('border:%s;' % b['border'])
    if b['shadow'] != 'none': out.append('box-shadow:%s;' % b['shadow'])
    if out or b['ov'] == 'hidden': out.append('overflow:hidden;')
    return ''.join(out)


def thumb_css(m):
    act = 'opacity:%s;outline:%s;outline-offset:%s;' % (m['act']['op'], m['act']['outline'], m['act']['off'])
    if not m['act']['border'].startswith('0px'): act += 'border:%s;' % m['act']['border']
    return ('aspect-ratio:%s;object-fit:%s;overflow:hidden;border-radius:%s;opacity:%s;cursor:pointer;transition:opacity .3s;'
            % (ratio_str(m['ratio']), m['fit'], m['rad'], m['op'])), act


def style_rec(it, styles):
    for s in styles:
        if s['id'] == it['id']: return s
    s = {'__v': 0, 'createdAt': it['createdAt'], 'id': it['id'], 'type': it['type'], 'updatedAt': it['updatedAt'], 'styles': '{}'}
    styles.append(s); return s


def apply(d, html):
    by = {i['id']: i for i in d['items']}
    parent = {c: i['id'] for i in d['items'] for c in i['children']}
    def in_list(x):   # product CARDS inside a ProductList2 are not the PDP gallery
        while x in parent:
            x = parent[x]
            if by[x]['type'] == 'ProductList2': return True
        return False
    def shows_list(pm):
        v = pm['data'].get('showList', False)
        return any(x is True for x in v.values()) if isinstance(v, dict) else bool(v)
    media = [i for i in d['items'] if i['type'] == 'ProductMedia3' and not in_list(i['id']) and shows_list(i)
             and any(by[c]['type'] == 'MediaList2' for c in i['children'])]
    if not media: return 0
    md, mm = measure(html, 1440), measure(html, 390)
    if not md: print('NOTE: mockup has no MediaList2 gallery - nothing measured'); return 0
    mm = mm or md
    css = ['\n/* product gallery: measured from the HTML mockup */']
    for pm in media:
        pm['data']['listPosition'] = {'all': 2, 'laptop': 'unset', 'tablet': 'unset', 'mobile': 'unset'}
        pc = (pm['data'].get('className') or 'pu-pm-media').split()[0]
        fr = frame_css(md.get('mediaRoot'))
        if fr:
            s = style_rec(pm, d['styles']); sd = json.loads(s['styles']); a = sd.setdefault('all', {})
            a['&'] = (a.get('&', '') + ' ' + fr).strip(); s['styles'] = json.dumps(sd)
            css.append('#__pf .%s{%s}' % (pc, fr))
        for c in pm['children']:
            ch = by[c]
            if ch['type'] == 'MediaMain3' and md.get('main'):
                r = ratio_str(md['main'])
                s = style_rec(ch, d['styles']); sd = json.loads(s['styles']); a = sd.setdefault('all', {})
                a['& > div img'] = ('width:100%%; object-fit:cover; --pf-aspect-ratio-type:%s; --pf-aspect-ratio-value:%s; aspect-ratio:%s; %s'
                                    % (r, r, r, frame_css(md.get('mainImg'))))
                fr = frame_css(md.get('mainRoot'))
                if fr: a['&'] = (a.get('&', '') + ' ' + fr).strip()
                s['styles'] = json.dumps(sd)
                mc = (ch['data'].get('className') or 'pu-pmedia-main').split()[0]
                css.append('#__pf .%s > div img{aspect-ratio:%s;object-fit:cover;width:100%%;%s}' % (mc, r, frame_css(md.get('mainImg'))))
                if fr: css.append('#__pf .%s{%s}' % (mc, fr))
            if ch['type'] != 'MediaList2': continue
            ch['data'].update({'navStyle': 'none',
                               'slidesToShow': {'all': md['cols'], 'laptop': md['cols'], 'tablet': md['cols'], 'mobile': mm['cols']}})
            lc = (ch['data'].get('className') or 'pu-pmedia-thumbs').split()[0]
            s = style_rec(ch, d['styles'])
            s['styles'] = json.dumps({'all': {'&': 'margin-top:%.2fpx; gap:%.2fpx; column-gap:%.2fpx;' % (md['mt'], md['gap'], md['gap'])},
                                      'mobile': {'&': 'margin-top:%.2fpx; gap:%.2fpx; column-gap:%.2fpx;' % (mm['mt'], mm['gap'], mm['gap'])}})
            box_d, act_d = thumb_css(md); box_m, act_m = thumb_css(mm)
            for it_id in ch['children']:
                it = by[it_id]
                ic = (it['data'].get('className') or 'pu-pmedia-thumb').split()[0]
                s = style_rec(it, d['styles'])
                s['styles'] = json.dumps({'all': {'&': box_d, '& img': 'width:100%%; height:100%%; object-fit:%s; aspect-ratio:%s; display:block;' % (md['fit'], ratio_str(md['ratio'])),
                                                  '&[data-active="true"]': act_d},
                                          'mobile': {'&': box_m, '&[data-active="true"]': act_m}})
                sel = '#__pf .%s' % ic
                if sel not in ''.join(css):
                    css += ['#__pf .%s{margin-top:%.2fpx;gap:%.2fpx;column-gap:%.2fpx;}' % (lc, md['mt'], md['gap'], md['gap']),
                            '%s{%s}' % (sel, box_d),
                            '%s img{width:100%%;height:100%%;object-fit:%s;aspect-ratio:%s;display:block;}' % (sel, md['fit'], ratio_str(md['ratio'])),
                            '%s[data-active="true"]{%s}' % (sel, act_d),
                            '@media (max-width:767.4999px){#__pf .%s{margin-top:%.2fpx;gap:%.2fpx;column-gap:%.2fpx;}%s{%s}%s[data-active="true"]{%s}}'
                            % (lc, mm['mt'], mm['gap'], mm['gap'], sel, box_m, sel, act_m)]
    d['customCSS'] += '\n'.join(css) + '\n'
    print('gallery:', {'cols': md['cols'], 'gap': md['gap'], 'thumb': ratio_str(md['ratio']), 'main': md.get('main') and ratio_str(md['main']),
                       'main-frame': frame_css(md.get('mainImg')) or frame_css(md.get('mainRoot')) or '-', 'media-frame': frame_css(md.get('mediaRoot')) or '-'})
    return len(media)


if __name__ == '__main__':
    d = json.load(open(sys.argv[1])); n = apply(d, sys.argv[3])
    json.dump(d, open(sys.argv[2], 'w'), ensure_ascii=False); print('ok', sys.argv[2], 'galleries', n)
