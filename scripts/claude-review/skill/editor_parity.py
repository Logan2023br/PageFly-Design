"""Step 2: make the PageFly editor render like live/HTML.

  * '--pf-flex-layout-width: fill' on a child of a ROW whose CSS does not actually
    grow it: the editor treats fill as flex-grow (live does not) -> declare hug.
  * SVG icons stored as data-URI Image5 -> Custom.HTML with the same inline SVG
    (the editor cannot show data: images; shows a placeholder instead).
  * Accordion header: keep >=40px right padding so the toggle never covers the label.
  * Absolute background layers (inset:0) are anchored to the section, not its inner box.
  * Text descendants inherit the font (editor's inner text nodes otherwise use the
    editor/theme font).
  * ProductATC2 with an Icon2 child: showIcon on. ProductBadge text: --badge (default Sale).
  * QuantityField (<input> of ProductQuantity): theme/browser input margins push it off
    centre and break its height -> margin:0 on the element (styles[]) and in customCSS.

Usage: python editor_parity.py <in.json> <out.json> [--badge "Sale"]
"""
import json, re, sys, base64

ROWISH = re.compile(r'flex-flow:\s*row|--pf-flex-layout-direction:\s*(horizontal|wrap)')


def is_row(p, S):
    st = S.get(p['id'])
    if not st: return False
    a = json.loads(st['styles']).get('all', {})
    css = a.get('& > .pf-flex-section', '') if p['type'] == 'FlexSection' else a.get('&', '')
    return 'display:grid' not in css.replace(' ', '') and bool(ROWISH.search(css))


def first_custom(it):
    c = (it.get('data', {}).get('className') or '').split()
    return c[0] if c else None


def fix(d, badge='Sale'):
    items = d['items']; by = {i['id']: i for i in items}
    parent = {c: i['id'] for i in items for c in i['children']}
    S = {s['id']: s for s in d['styles']}
    rep = {'fill_to_hug': 0, 'icons': 0, 'bg_layers': 0}
    # fill -> hug in rows (keep align-self so the cross axis is unchanged)
    for it in items:
        st = S.get(it['id'])
        if not st or it['id'] not in parent or not is_row(by[parent[it['id']]], S): continue
        sd = json.loads(st['styles']); a = sd.get('all', {}).get('&', '')
        if '--pf-flex-layout-width: fill' in a and not re.search(r'flex:\s*1|flex-grow:\s*[1-9]|(?<![-\w])width:\s*100%', a):
            sd['all']['&'] = a.replace('--pf-flex-layout-width: fill', '--pf-flex-layout-width: hug') + ' width: fit-content;'
            st['styles'] = json.dumps(sd); rep['fill_to_hug'] += 1
    # data-URI svg icons -> Custom.HTML
    for it in items:
        src = it.get('data', {}).get('src', '') if it['type'] == 'Image5' else ''
        if not src.startswith('data:image/svg+xml;base64,'): continue
        svg = base64.b64decode(src.split(',', 1)[1]).decode()
        svg = svg.replace('<svg ', '<svg style="width:100%;height:100%;display:block" aria-hidden="true" ', 1)
        cls = (it['data'].get('className') or it['data'].get('classGlobalStyling') or 'icon').replace('-photo', '-svg')
        it['type'] = 'Custom.HTML'; it['data'] = {'code': svg, 'className': cls}
        if it['id'] in S:
            S[it['id']]['type'] = 'Custom.HTML'
            S[it['id']]['styles'] = json.dumps({'all': {'&': 'width:100%; height:100%; display:block; line-height:0;'}})
        rep['icons'] += 1
    # absolute full-cover layers -> anchor to section
    extra = []
    for it in items:
        st = S.get(it['id'])
        if not st or it['type'] == 'FlexSection': continue
        a = json.loads(st['styles']).get('all', {}).get('&', '').replace(' ', '')
        if 'position:absolute' in a and 'inset:0' in a:
            p = by.get(parent.get(it['id']))
            if p and p['type'] == 'FlexSection' and first_custom(p):
                sel = '#__pf .%s > .pf-flex-section{position:static;}' % first_custom(p)
                if sel not in extra: extra.append(sel); rep['bg_layers'] += 1
    # accordion right padding (CSS rules that pad the header + element style)
    css = d['customCSS']
    for m in re.finditer(r'([^{}]*Accordion3\.Header[^{}]*)\{([^}]*padding[^}]*)\}', css):
        sel = m.group(1).strip()
        if not sel.startswith('@'): extra.append('%s{padding-right:40px;}' % sel)
    for it in items:
        if it['type'] == 'Accordion3.Header':
            st = S.get(it['id'])
            if not st:
                st = {'__v': 0, 'createdAt': it['createdAt'], 'id': it['id'], 'type': it['type'],
                      'updatedAt': it['updatedAt'], 'styles': '{}'}
                d['styles'].append(st); S[it['id']] = st
            sd = json.loads(st['styles']); sd.setdefault('all', {})
            sd['all']['&'] = (sd['all'].get('&', '') + ' padding-right:40px;').strip(); st['styles'] = json.dumps(sd)
        if it['type'] == 'QuantityField':
            st = S.get(it['id'])
            if not st:
                st = {'__v': 0, 'createdAt': it['createdAt'], 'id': it['id'], 'type': it['type'],
                      'updatedAt': it['updatedAt'], 'styles': '{}'}
                d['styles'].append(st); S[it['id']] = st
            sd = json.loads(st['styles']); sd.setdefault('all', {})
            if 'margin:0' not in sd['all'].get('&', '').replace(' ', ''):
                sd['all']['&'] = (sd['all'].get('&', '') + ' margin:0px;').strip()
            st['styles'] = json.dumps(sd); rep['qty_fields'] = rep.get('qty_fields', 0) + 1
        if it['type'] == 'ProductBadge' and badge: it['data']['text'] = badge
        if it['type'] == 'ProductATC2' and it['children']:
            it['data'].update({'showIcon': True, 'iconPos': it['data'].get('iconPos', 'right'),
                               'buttonType': 'iconWithText', 'text': it['data'].get('value', 'Add to cart')})
    if '/* editor parity */' not in css:
        css += ('\n/* editor parity */\n'
                '#__pf [data-pf-type="Paragraph4"] *,#__pf [data-pf-type="Heading2"] *,#__pf [data-pf-type="Button2"] *,'
                '#__pf [data-pf-type="Accordion3.Header"] *{font-family:inherit !important;}\n'
                '#__pf [data-pf-type="QuantityField"]{margin:0 !important;}\n' + '\n'.join(extra) + '\n')
    d['customCSS'] = css
    return rep


if __name__ == '__main__':
    args = sys.argv[1:]; badge = 'Sale'
    if '--badge' in args: i = args.index('--badge'); badge = args[i + 1]; del args[i:i + 2]
    d = json.load(open(args[0])); r = fix(d, badge)
    json.dump(d, open(args[1], 'w'), ensure_ascii=False); print('ok', args[1], r)
