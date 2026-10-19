#!/bin/bash
# verify_some.sh <work dir> <name substring>  -> verify only matching pages
S="$(cd "$(dirname "$0")" && pwd)/skill"
W=$(realpath "$1"); T=$(mktemp -d)
python3 - "$W" "$2" "$T" <<'P'
import json,os,sys
w,sub,t=sys.argv[1:]
p=json.load(open(os.path.join(w,'pairs.json')))
q={os.path.join(w,os.path.basename(k)):v for k,v in p.items() if sub in os.path.basename(k)}
json.dump(q,open(os.path.join(t,'pairs.json'),'w'))
P
cp "$T/pairs.json" "$W/pairs.sub.json"
python3 - "$W" "$T" <<'P'
import sys,os,shutil
w,t=sys.argv[1:]
# verify reads pairs from work and writes emu files next to the json: run with a pairs file swapped in
shutil.copy(os.path.join(w,'pairs.json'),os.path.join(t,'pairs.full.json'))
shutil.copy(os.path.join(t,'pairs.json'),os.path.join(w,'pairs.json'))
P
cd "$(dirname "$W")" && python3 $S/verify_offline.py "$W"
cp "$T/pairs.full.json" "$W/pairs.json"; rm -rf "$T" "$W/pairs.sub.json"
