"""Run the whole conversion for a set: every page JSON in a .pagefly (or a folder of
.pagefly files) is fixed and paired with its HTML mockup, then repackaged one file per page.

Usage: python run_pipeline.py --pagefly <set.pagefly|dir> --html <dir|zip> --out <dir> [--badge Sale] [--end ISO]
Writes <out>/<Page Title>.pagefly (one per page), <out>/<Set> - All Pages.pagefly (whole set, one import),
<out>/work/<page>.json and <out>/work/pairs.json. Re-run build_set_file.py after any manual JSON fix.
"""
import argparse, glob, json, os, re, sys, zipfile, tempfile, difflib
sys.path.insert(0, os.path.dirname(__file__))
import image_and_class, editor_parity, countdown, product_gallery, build_set_file

ap = argparse.ArgumentParser()
ap.add_argument('--pagefly', required=True); ap.add_argument('--html', required=True)
ap.add_argument('--out', required=True); ap.add_argument('--badge', default='Sale'); ap.add_argument('--end')
a = ap.parse_args()
work = os.path.join(a.out, 'work'); os.makedirs(work, exist_ok=True)
tmp = tempfile.mkdtemp()

def unzip_all(path, dst):
    files = [path] if os.path.isfile(path) else glob.glob(os.path.join(path, '*'))
    for f in files:
        if zipfile.is_zipfile(f): zipfile.ZipFile(f).extractall(dst)
        elif f.endswith(('.json', '.html')): os.system('cp "%s" "%s"' % (f, dst))
jd = os.path.join(tmp, 'json'); hd = os.path.join(tmp, 'html'); os.makedirs(jd); os.makedirs(hd)
unzip_all(a.pagefly, jd); unzip_all(a.html, hd)
jsons = sorted(glob.glob(os.path.join(jd, '**', '*.json'), recursive=True))
htmls = sorted(glob.glob(os.path.join(hd, '**', '*.html'), recursive=True))

def key(s):
    s = os.path.splitext(os.path.basename(s))[0].lower()
    s = re.sub(r'^\d+\s*-\s*', '', s); s = s.split(' - ')[-1]
    return re.sub(r'[^a-z]', '', s.replace('page', '').replace('us', ''))
pairs = {}
for j in jsons:
    best = max(htmls, key=lambda h: difflib.SequenceMatcher(None, key(j), key(h)).ratio())
    pairs[j] = best
for j, h in pairs.items():
    d = json.load(open(j))
    image_and_class.process(d)
    rep = editor_parity.fix(d, a.badge)
    n = countdown.convert(d, h, a.end)
    g = product_gallery.apply(d, h)
    name = os.path.basename(j)[:-5]
    wj = os.path.join(work, name + '.json'); json.dump(d, open(wj, 'w'), ensure_ascii=False)
    title = name.split(' - ', 1)[1] if ' - ' in name else name
    out = os.path.join(a.out, title + '.pagefly')
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z: z.write(wj, name + '.json')
    print('%-32s <- %-28s %s countdowns=%d galleries=%d' % (title, os.path.basename(h), rep, n, g))
json.dump({os.path.join(work, os.path.basename(j)): h for j, h in pairs.items()}, open(os.path.join(work, 'pairs.json'), 'w'), indent=1)

src_zip = a.pagefly if os.path.isfile(a.pagefly) and zipfile.is_zipfile(a.pagefly) else None
print('set file:', build_set_file.build(work, a.out, src_zip))
