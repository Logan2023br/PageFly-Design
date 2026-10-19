#!/usr/bin/env python3
"""Which imported page in loganpagefly belongs to which page of a set.

  python3 imports.py <slug>                    -> for each page: its slug and the title key to search
  python3 imports.py <slug> --pick list.json   -> given the list_pages results (JSON array, all pages
                                                  searched), print {page slug: newest matching page id}

An import is titled "<N> - <entry name> - <YYYY-MM-DD HH:MM:SS>", where <entry name> is the page's
JSON entry inside the .pagefly without its leading number, or "<set name> - <page label>"
("Deepa Diwali - Home"); N is only the order in the imported file. Match a key (case-insensitive,
whole title part — never a prefix), keep the newest time.
"""
import json, os, re, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import req, get_set, one_json  # noqa


def keys(slug):
    s = get_set(slug); out = []
    for p in sorted(s["pages"], key=lambda p: p["position"]):
        c, pf = req("GET", f"/api/collection-pages/{slug}/{p['slug']}.pagefly?v={time.time()}", key=False)
        assert c == 200, (p["slug"], c)
        entry = re.sub(r"^\d+ - ", "", one_json(pf)[:-5])
        out.append({"page": p["slug"], "label": p["label"], "key": entry,
                    # an import may be titled by the entry name or by "<set> - <page label>"
                    "keys": sorted({norm(entry), norm(f"{s['name']} - {p['label']}")})})
    return out


def norm(t): return re.sub(r"\s+", " ", t).strip().casefold()


TITLE = re.compile(r"^\d+ - (.+) - (\d{4}-\d{2}-\d{2} \d{1,2}:\d{1,2}:\d{1,2})$")


def stamp(t):
    d, h = t.split(" "); return d + " " + ":".join(x.zfill(2) for x in h.split(":"))


def pick(slug, listed):
    best = {}
    for k in keys(slug):
        cands = []
        for x in listed:
            m = TITLE.match(x.get("title", "").strip())
            if m and norm(m.group(1)) in k["keys"]: cands.append((stamp(m.group(2)), x["id"], x["title"]))
        best[k["page"]] = sorted(cands)[-1][1:] if cands else None
    return best


if __name__ == "__main__":
    slug = sys.argv[1]
    if "--pick" in sys.argv:
        print(json.dumps(pick(slug, json.load(open(sys.argv[sys.argv.index("--pick") + 1]))), ensure_ascii=False, indent=1))
    else:
        print(json.dumps(keys(slug), ensure_ascii=False, indent=1))
