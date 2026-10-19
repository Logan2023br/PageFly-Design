"""Step 3: countdowns built from Paragraph blocks -> native PageFly CountDown,
styled from measurements of the HTML mockup (desktop 1440 + mobile 390).

Detects a FlexBlock whose children are >=3 unit FlexBlocks, each holding a number
Paragraph4 (1-2 digits) + a label Paragraph4. Each unit becomes: CountdownNumber box
(top half: top border + top padding + number + gap) + CountdownLabel box (bottom half),
so it looks identical whatever DOM PageFly uses inside the widget.

Usage: python countdown.py <in.json> <out.json> <mockup.html> [--end 2026-10-18T00:00:00 --repeat week]
"""
import json, re, sys, os, datetime
from playwright.sync_api import sync_playwright

JS_MEASURE = """(sel) => Array.from(document.querySelectorAll(sel)).map(cd => {
  const units = Array.from(cd.children); const u = units[0], u2 = units[1];
  const r = u.getBoundingClientRect(), r2 = u2.getBoundingClientRect(), cs = getComputedStyle(u);
  const n = u.children[0], l = u.children[1], rn = n.getBoundingClientRect(), rl = l.getBoundingClientRect();
  const f = e => { const c = getComputedStyle(e); return {family:c.fontFamily, size:c.fontSize, weight:c.fontWeight,
     style:c.fontStyle, lh:c.lineHeight, ls:c.letterSpacing, tt:c.textTransform, color:c.color, opacity:c.opacity}; };
  // an ancestor may still be mid scroll-reveal (e.g. transform:scale(.7)): undo it so sizes are the CSS ones
  const k = (u.offsetWidth && r.width) ? u.offsetWidth / r.width : 1;
  return {w:r.width*k, h:r.height*k, gap:Math.max(r2.left - r.right, r.left - r2.right)*k,bw:parseFloat(cs.borderTopWidth), bs:cs.borderTopStyle,
    bc:cs.borderTopColor, bg:cs.backgroundColor, rad:cs.borderTopLeftRadius,
    nTop:(rn.top - r.top)*k, nH:rn.height*k, gapNL:(rl.top - rn.bottom)*k, lH:rl.height*k, lBottom:(r.bottom - rl.bottom)*k,
    num:f(n), lab:f(l)}; })"""


def measure(html, sel, w):
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={'width': w, 'height': 900})
        pg.goto('file://' + os.path.abspath(html), wait_until='networkidle'); pg.wait_for_timeout(1200)
        m = pg.evaluate(JS_MEASURE, sel); b.close(); return m


def next_sunday():
    t = datetime.date.today(); s = t + datetime.timedelta(days=(6 - t.weekday()) or 7)
    return datetime.datetime.combine(s, datetime.time()).isoformat()


def font_css(f):
    return ("font-family:%s;font-size:%s;font-weight:%s;font-style:%s;line-height:%s;letter-spacing:%s;"
            "text-transform:%s;color:%s;opacity:%s;" % (f['family'], f['size'], f['weight'], f['style'],
            f['lh'], f['ls'], f['tt'], f['color'], f['opacity']))


def box_css(cls, m, half):
    pad_x = 2
    if half == 'num':
        pt = m['nTop'] - m['bw']; pb = m['gapNL']
        b = 'border:%spx %s %s;border-bottom:0;border-radius:%s %s 0 0;' % (m['bw'], m['bs'], m['bc'], m['rad'], m['rad'])
        h = 'min-height:%.2fpx;' % (m['nTop'] + m['nH'] + m['gapNL'])
    else:
        pt = 0; pb = m['lBottom'] - m['bw']
        b = 'border:%spx %s %s;border-top:0;border-radius:0 0 %s %s;' % (m['bw'], m['bs'], m['bc'], m['rad'], m['rad'])
        h = 'min-height:%.2fpx;' % (m['lH'] + m['lBottom'])
    return ('box-sizing:border-box;width:%.2fpx;%smargin:0 %.2fpx;padding:%.2fpx %spx %.2fpx;%sbackground:%s;text-align:center;'
            % (m['w'], h, m['gap'] / 2, pt, pad_x, pb, b, m['bg']))


def find_countdowns(d):
    by = {i['id']: i for i in d['items']}; out = []
    for it in d['items']:
        if it['type'] != 'FlexBlock' or len(it['children']) < 3: continue
        units = [by[c] for c in it['children']]
        ok = all(u['type'] == 'FlexBlock' and len(u['children']) == 2 and
                 all(by[c]['type'] == 'Paragraph4' for c in u['children']) and
                 re.fullmatch(r'\d{1,2}', str(by[u['children'][0]]['data'].get('value', '')).strip())
                 for u in units)
        # a numbered list (01 Ha Giang, 02 Ha Long...) has the same shape: the labels must be time units
        UNIT = re.compile(r'^\s*(d|h|m|s|days?|hours?|hrs?|mins?|minutes?|secs?|seconds?|weeks?|wks?|ng[aà]y|gi[oờ]|ph[uú]t|gi[aâ]y|tage?|stunden?|std|minuten?|sekunden?|jours?|heures?|secondes?|d[ií]as?|horas?|minutos?|segundos?|giorni|ore|minuti|secondi|يوم|أيام|ايام|ساعة|ساعات|دقيقة|دقائق|ثانية|ثوان[يٍ]?|日|时|時|分|秒|天|일|시간|분|초)\s*$', re.I)
        if ok:
            labels = [str(by[u['children'][1]]['data'].get('value', '')) for u in units]
            labels = [re.sub(r'<[^>]+>', '', l) for l in labels]
            ok = sum(bool(UNIT.match(l)) for l in labels) >= max(2, len(labels) - 1)
        if ok: out.append(it)
    return out


def cls0(it):
    return ((it['data'].get('className') or it['data'].get('classGlobalStyling') or '').split() or [None])[0]


def convert(d, html, end=None, repeat='week'):
    by = {i['id']: i for i in d['items']}; S = {s['id']: s for s in d['styles']}
    parent = {c: i['id'] for i in d['items'] for c in i['children']}
    cds = find_countdowns(d)
    if not cds: return 0
    css = ['\n/* countdown: native PageFly CountDown, measured from the HTML mockup */']
    seen = {}
    for idx, cd in enumerate(cds):
        cdc = cls0(cd)
        sel = '.' + cdc if cdc else None
        if sel not in seen: seen[sel] = 0
        k = seen[sel]; seen[sel] += 1
        md = measure(html, sel, 1440)[k]; mm = measure(html, sel, 390)[k]
        units = [by[c] for c in cd['children']]
        nc = cls0(by[units[0]['children'][0]]); lc = cls0(by[units[0]['children'][1]])
        labels = [str(by[u['children'][1]]['data'].get('value', '')) for u in units]
        sec = cd
        while sec['type'] != 'FlexSection': sec = by[parent[sec['id']]]
        inst = '%s-%s' % (cdc, (cls0(sec) or 'sec').split('-', 1)[-1])
        # remove paragraph units
        drop = set()
        def rm(x):
            drop.add(x); [rm(c) for c in by[x]['children']]
        for c in cd['children']: rm(c)
        d['items'] = [i for i in d['items'] if i['id'] not in drop]
        d['styles'] = [s for s in d['styles'] if s['id'] not in drop]
        base = dict(createdAt=cd['createdAt'], updatedAt=cd['updatedAt'], __v=0)
        num = dict(base, id=cd['id'][:-4] + 'c0a1', type='CountdownNumber', children=[], styles=[],
                   data={'name': 'Countdown Number', 'className': nc})
        lab = dict(base, id=cd['id'][:-4] + 'c0a2', type='CountdownLabel', children=[], styles=[],
                   data={'name': 'Countdown Label', 'className': lc})
        d['items'] += [num, lab]
        keys = ['d', 'h', 'm', 's'][-len(labels):] if len(labels) <= 4 else ['w', 'd', 'h', 'm', 's']
        td = {u: {'on': False, 'text': t} for u, t in zip(['w', 'd', 'h', 'm', 's'], ['Weeks', 'Days', 'Hours', 'Mins', 'Secs'])}
        for kk, t in zip(keys, labels): td[kk] = {'on': True, 'text': t}
        cd['type'] = 'CountDown'; cd['children'] = [num['id'], lab['id']]
        cd['data'] = {'countdownType': 'specific', 'startTime': (datetime.datetime.fromisoformat(end or next_sunday())
                      - datetime.timedelta(days=7)).isoformat(), 'endType': 'specific', 'endTime': end or next_sunday(),
                      'repeat': repeat, 'redirectUrl': {'on': False}, 'hideIfInactive': False, 'styleCountDown': 'basic',
                      'showColon': False, 'label': {'on': True, 'reverse': False}, 'timeData': td,
                      'targetStyle': 'CountDown', 'className': '%s %s' % (cdc, inst)}
        st = S.get(cd['id']) or dict(base, id=cd['id'], styles='{}')
        if cd['id'] not in S: d['styles'].append(st)
        st['type'] = 'CountDown'
        st['styles'] = json.dumps({'all': {'&': 'width: fit-content; flex-basis: unset; height: fit-content; '
                                         '--pf-flex-layout-width: hug; --pf-flex-layout-height: hug;',
                                         '& .pf-countdown__colon': 'display:none;'}})
        d['styles'] += [dict(base, id=num['id'], type='CountdownNumber', styles=json.dumps({'all': {'&': font_css(md['num'])}, 'mobile': {'&': font_css(mm['num'])}})),
                        dict(base, id=lab['id'], type='CountdownLabel', styles=json.dumps({'all': {'&': font_css(md['lab'])}, 'mobile': {'&': font_css(mm['lab'])}}))]
        p = '#__pf .%s' % inst
        css += ['%s{margin:0 -%.2fpx;}' % (p, md['gap'] / 2),
                '%s .%s{%s%s}' % (p, nc, box_css(nc, md, 'num'), font_css(md['num'])),
                '%s .%s{%s%s}' % (p, lc, box_css(lc, md, 'lab'), font_css(md['lab'])),
                '@media (max-width:767.4999px){%s{margin:0 -%.2fpx;}%s .%s{%s%s}%s .%s{%s%s}}' % (
                    p, mm['gap'] / 2, p, nc, box_css(nc, mm, 'num'), font_css(mm['num']),
                    p, lc, box_css(lc, mm, 'lab'), font_css(mm['lab']))]
        by = {i['id']: i for i in d['items']}; S = {s['id']: s for s in d['styles']}
    d['customCSS'] += '\n'.join(css) + '\n'
    # drop the JS ticker that drove the old paragraph countdown (one IIFE using setInterval)
    for c in {cls0(x) for x in cds if cls0(x)}:
        pat = r"\(function\(\)\{[^\n]*?querySelectorAll\('\.%s'\)[^\n]*?setInterval\([^\n]*?\}\)\(\);\n?" % re.escape(c)
        d['customJS'], k = re.subn(pat, '', d['customJS'])
        if not k: print('NOTE: no ticker JS found for .%s - check customJS by hand' % c)
    return len(cds)


if __name__ == '__main__':
    a = sys.argv[1:]; end = None; rep = 'week'
    if '--end' in a: i = a.index('--end'); end = a[i + 1]; del a[i:i + 2]
    if '--repeat' in a: i = a.index('--repeat'); rep = a[i + 1]; del a[i:i + 2]
    d = json.load(open(a[0])); n = convert(d, a[2], end, rep)
    json.dump(d, open(a[1], 'w'), ensure_ascii=False); print('ok', a[1], 'countdowns', n)
