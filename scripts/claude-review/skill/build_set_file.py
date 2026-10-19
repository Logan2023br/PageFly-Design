"""Build ONE .pagefly holding every page of the set, so Tu can import the whole set at once.

Mirrors the structure of the source set file exactly: same entry names, same order, all
entries at the zip root (no folders), deflate. Without a source set file the entries are
'<n> - <Set> - <Page>.json' in page-number order. Then re-reads the file and checks it.

Usage: python build_set_file.py <out>/work <out> [source_set.pagefly]
"""
import glob, json, os, re, sys, zipfile


def build(work, out_dir, src_zip=None):
    pages = {os.path.basename(f): f for f in glob.glob(os.path.join(work, '*.json')) if not f.endswith('pairs.json')}
    if src_zip:
        names = [i.filename for i in zipfile.ZipFile(src_zip).infolist() if i.filename.endswith('.json')]
        missing = [n for n in names if n not in pages]
        if missing: raise SystemExit('pages missing from work/: %s' % missing)
    else:
        names = sorted(pages, key=lambda n: int(re.match(r'(\d+)', n).group(1)) if re.match(r'\d+', n) else 99)
    first = names[0][:-5]
    set_name = first.split(' - ')[1] if first.count(' - ') >= 2 else 'Set'
    out = os.path.join(out_dir, '%s - All Pages.pagefly' % set_name)
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for n in names: z.write(pages[n], n)
    # check: archive ok, same entries/order, every page parses and is internally consistent
    chk = zipfile.ZipFile(out); assert chk.testzip() is None
    assert [i.filename for i in chk.infolist()] == names and all('/' not in n for n in names)
    for n in names:
        d = json.loads(chk.read(n)); ids = {i['id'] for i in d['items']}
        for k in ('items', 'styles', 'customCSS', 'customJS'): assert k in d, (n, k)
        if src_zip: assert set(d) == set(json.loads(zipfile.ZipFile(src_zip).read(n))), n
        assert all(c in ids for i in d['items'] for c in i['children']), n
        assert all(s['id'] in ids for s in d['styles']), n
        assert sum(1 for i in d['items'] if i['type'] == 'Body') == 1, n
    return '%s (%d pages, %d KB)' % (out, len(names), os.path.getsize(out) // 1024)


if __name__ == '__main__':
    print(build(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None))
