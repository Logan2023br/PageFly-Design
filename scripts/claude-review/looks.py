"""python3 looks.py <slug>... — the sections verify_offline flagged that need a human look."""
import json, os, sys
for s in sys.argv[1:]:
    d = json.load(open(os.path.join(os.environ.get("CR_WORK", "/tmp/claude-review"), s, "report.json")))
    print(f'### {s}: look={len(d["look"])} expected={len(d["expected"])} extra={d.get("extra")}')
    for f in d["look"]:
        print("  ", f["page"], f["w"], f["sec"], f'{f["pct"]}%', f'{f["ha"]}/{f["hb"]}', f.get("png", ""))
