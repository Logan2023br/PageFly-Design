"""Step 1 of the pipeline: fix what real PageFly renders differently from the HTML.

  * Image5: on real PageFly the Image5 root IS the <img> (no wrapper div), so every
    `& img` rule and every `.cls img` CSS rule silently does nothing. Each Image5 is
    wrapped in a FlexBlock that carries the old wrapper styles + classes, and the
    `& img` rules move onto the Image5 root. Result: same DOM shape as the HTML.
  * Class rule: custom classes go to data.className (editor Attributes -> HTML class),
    classGlobalStyling keeps only pf-* presets; auto/numbered names become role names.
  * Fonts: customJS does not run in the editor, so @font-face rules for every Google
    family the page uses are written at the top of customCSS (latin + latin-ext only).

Usage: python image_and_class.py <in.json> <out.json>
"""
import json, re, sys, uuid, urllib.request

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124 Safari/537.36")
ORD = ['zero', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth',
       'tenth', 'eleventh', 'twelfth']
AUTO = re.compile(r'^[a-z]+-(icon2|accordion3[a-z-]*|mediamain3|mediaitem2|medialist2|mailchimp[a-z]*|'
                  r'quantityfield|optionlabel|swatch|[a-z]+\d)-\d+$')
UTILITY = re.compile(r'-(rv|img|zoom|center|sec|anim|float)$')


def deno(x):
    """meaningful stem + trailing counter -> ordinal word (hero-i2 -> hero-img-second)."""
    m = re.fullmatch(r'(.*?[a-z])-?(\d+)', x)
    if not m: return x
    stem, n = m.group(1), int(m.group(2))
    if stem.endswith('-i'): stem += 'mg'
    return '%s-%s' % (stem, ORD[n] if n < len(ORD) else 'no' + str(n).translate(str.maketrans('0123456789', 'abcdefghij')))
KEEP_NUMBERED = re.compile(r'^(pu|au|[a-z]{2})-h[1-6]$')   # heading levels are meaningful


def google_fontface(query):
    """query = 'family=A:wght@400&family=B...' -> compact @font-face CSS (latin subsets)."""
    url = 'https://fonts.googleapis.com/css2?' + query + '&display=swap'
    css = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=30).read().decode()
    blocks = re.findall(r'/\* (latin(?:-ext)?) \*/\s*(@font-face\s*\{[^}]*\})', css)
    return '\n'.join(re.sub(r'\s+', ' ', b) for _, b in blocks)


def font_query(d):
    m = re.search(r'"fonts":\s*"([^"]+)"', d.get('customJS', ''))
    return m.group(1) if m else None


def toks(it):
    return (it.get('data', {}).get('classGlobalStyling') or '').split()


def role_name(it, by, parent):
    t = it['type']; p = by.get(parent.get(it['id']))
    if t == 'Icon2':
        if p and p['type'] in ('Button2', 'MailChimpButton2', 'Form2.Button2', 'ProductATC2'): return 'x-btn-icon'
        if p and p['type'] == 'Accordion3.Header': return 'x-faq-icon'
        return 'x-icon'
    return {'Accordion3.Header': 'x-faq-q', 'Accordion3.Flex.Content': 'x-faq-inner',
            'Accordion3.Content': 'x-faq-body', 'Accordion3.Content.Wrapper': 'x-faq-item',
            'MediaMain3': 'x-pmedia-main', 'MediaItem2': 'x-pmedia-thumb', 'MediaList2': 'x-pmedia-thumbs',
            'MailchimpLabel': 'x-nl-label', 'MailchimpField': 'x-nl-field', 'QuantityField': 'x-qty-field',
            'OptionLabel': 'x-option-label', 'Swatch': 'x-swatch'}.get(t, 'x-' + t.lower().replace('.', '-'))


def process(d, prefix=None):
    items = d['items']; by = {i['id']: i for i in items}
    parent = {c: i['id'] for i in items for c in i['children']}
    S = {s['id']: s for s in d['styles']}
    if prefix is None:   # brand prefix used by the existing classes, e.g. 'pu' / 'au'
        pre = [t.split('-')[0] for i in items for t in toks(i) if not t.startswith('pf-')]
        prefix = max(set(pre), key=pre.count) if pre else 'pg'
    # ---- 1) Image5 wrappers
    new_items, new_styles = [], []
    for it in list(items):
        if it['type'] != 'Image5': continue
        st = S.get(it['id']); sd = json.loads(st['styles']) if st else {}
        wrap, img = {}, {}
        for bp, m in sd.items():
            for sel, css in m.items():
                if sel == '& img': img.setdefault(bp, {})['&'] = css
                elif sel.startswith('& img'): img.setdefault(bp, {})['&' + sel[5:]] = css
                else: wrap.setdefault(bp, {})[sel] = css
        t = toks(it); wid = str(uuid.uuid4())
        w = {'__v': 0, 'children': [it['id']], 'createdAt': it['createdAt'], 'data': {}, 'styles': [],
             'type': 'FlexBlock', 'updatedAt': it['updatedAt'], 'id': wid}
        if t: w['data']['classGlobalStyling'] = ' '.join(t)
        par = by[parent[it['id']]]
        par['children'] = [wid if c == it['id'] else c for c in par['children']]
        parent[it['id']] = wid; parent[wid] = par['id']; by[wid] = w; new_items.append(w)
        new_styles.append({'__v': 0, 'createdAt': it['createdAt'], 'id': wid, 'type': 'FlexBlock',
                           'updatedAt': it['updatedAt'], 'styles': json.dumps(wrap or {'all': {'&': 'display:block;'}})})
        base = [x for x in t if not x.startswith('pf-')]
        spec = [x for x in base if not UTILITY.search(x)]
        stem = (spec or base or [prefix + '-img'])[-1]
        stem = stem if KEEP_NUMBERED.match(stem) or AUTO.match(stem) else deno(stem)
        it['data']['classGlobalStyling'] = stem + '-photo'
        img_css = img or {'all': {'&': 'width:100%; height:100%; display:block;'}}
        if st: st['styles'] = json.dumps(img_css)
        else: new_styles.append({'__v': 0, 'createdAt': it['createdAt'], 'id': it['id'], 'type': 'Image5',
                                 'updatedAt': it['updatedAt'], 'styles': json.dumps(img_css)})
    items.extend(new_items); d['styles'].extend(new_styles)
    # ---- 2) class rule
    renames = {}
    for it in items:
        dt = it.get('data')
        if dt is None: continue
        t = toks(it); preset = [x for x in t if x.startswith('pf-')]; custom = []
        for x in t:
            if x.startswith('pf-'): continue
            if KEEP_NUMBERED.match(x): custom.append(x); continue
            if AUTO.match(x):        # auto name from the builder, e.g. ml-icon2-3
                custom.append(role_name(it, by, parent).replace('x-', prefix + '-', 1))
            elif re.search(r'\d$', x):   # meaningful stem + counter, e.g. hero-i2 -> hero-img-second
                new = deno(x); renames[x] = new; custom.append(new)
            else: custom.append(x)
        if not custom and it['type'] not in ('Body', 'Layout'):
            custom = [role_name(it, by, parent).replace('x-', prefix + '-', 1)]
        if preset: dt['classGlobalStyling'] = ' '.join(preset)
        else: dt.pop('classGlobalStyling', None)
        if custom: dt['className'] = ' '.join(dict.fromkeys(custom))
    css, js = d['customCSS'], d['customJS']
    for a, b in renames.items():
        pat = re.escape(a) + r'(?![\w-])'
        css = re.sub(pat, b, css); js = re.sub(pat, b, js)
    # ---- 3) fonts that also work in the editor
    q = font_query(d)
    if q and '@font-face' not in css:
        try: css = google_fontface(q) + '\n' + css
        except Exception as e: print('WARN font fetch failed:', e)
    d['customCSS'], d['customJS'] = css, js
    return d


if __name__ == '__main__':
    d = json.load(open(sys.argv[1]))
    json.dump(process(d), open(sys.argv[2], 'w'), ensure_ascii=False)
    print('ok', sys.argv[2], len(d['items']), 'items')
