#!/usr/bin/env python3
"""Fixes found while reviewing sets, applied after run_pipeline.py, before verify.

  python3 extra_fixes.py <work dir>      (uses <work>/pairs.json)

1. countdown_wrap: the mockup's CountDown wraps its units (flex-wrap:wrap) so on a
   phone 4 boxes fall into 2 rows; PageFly's CountDown renders one row that overflows
   the screen. Add wrap + centre on the root and on PageFly's real track
   (.pf-countdown__inner) via customCSS.
2. countdown_shadow: a hard offset shadow (box-shadow: X Y 0 C) on the mockup's unit box is
   lost because the number and the label are styled as two halves of one box. Rebuild it
   on the halves: number = right strip (clipped at its bottom), label = right strip + bottom
   strip, so together they draw the one L-shaped shadow.
3. inline_font: editor_parity's `[data-pf-type=Heading2] *{font-family:inherit !important}`
   also wipes a font the mockup gives an inline word (`.pu-h1 em{font-family:Caveat}`):
   the accent words fall back to the heading font. Re-assert those fonts with !important
   (higher specificity, so they win over the parity rule while plain text still inherits).
4. rtl_accordion: on an RTL page (`#__pf{direction:rtl}`) PageFly's Accordion3 still lays the
   header out physically: arrowPos "right" puts the label on the LEFT and the chevron right,
   and the closed glyph points ">" (real render, halawiyat-baghdad). The mockup has the label
   right, chevron left pointing down. Set arrowPos "left", move editor_parity's 40px glyph
   room to the left (keeping the mockup's own right padding), right-align the label and turn
   the closed glyph down.
"""

INLINE = r"(?:em|strong|b|i|span|a|small|mark|u|s)"


def top_rules(css):
    """(selector, body) of rules not nested in @media etc."""
    out, depth, start, i = [], 0, 0, 0
    while i < len(css):
        c = css[i]
        if c == "{":
            if depth == 0: sel = css[start:i]; bstart = i + 1
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                out.append((sel.strip(), css[bstart:i])); start = i + 1
        i += 1
    return out


UNIT_JS = """([base, lab]) => [...document.querySelectorAll('.' + base)].map(cd => {
  const u = cd.firstElementChild; if (!u) return null;
  const l = cd.querySelector('.' + lab); const ls = l ? getComputedStyle(l) : null;
  const sec = cd.closest('section'); const sc = sec ? [...sec.classList].find(c => !c.startsWith('pf-')) : '';
  return {sec: sc || '', sh: getComputedStyle(u).boxShadow, lcolor: ls ? ls.color : '', lop: ls ? ls.opacity : '1'}; })"""


def shadows(html_path, w, base, lab):
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={"width": w, "height": 900})
        pg.goto("file://" + os.path.abspath(html_path)); r = pg.evaluate(UNIT_JS, [base, lab]); b.close(); return r


import json, os, re, sys
from playwright.sync_api import sync_playwright

work = sys.argv[1]
pairs = json.load(open(os.path.join(work, "pairs.json")))
for jpath, hpath in pairs.items():
    jpath = os.path.join(work, os.path.basename(jpath))
    if not os.path.exists(hpath):
        hpath = os.path.join(os.path.dirname(os.path.dirname(work)), "html", os.path.basename(hpath))
    d = json.load(open(jpath)); html = open(hpath, encoding="utf-8", errors="replace").read()
    done = []
    for i in d["items"]:
        if i["type"] != "CountDown": continue
        cls = ((i.get("data") or {}).get("className") or "").split()
        if not cls: continue
        m = re.search(r'<div data-pf-type="CountDown" class="[^"]*\b' + re.escape(cls[0]) + r'\b[^"]*" style="([^"]*)"', html)
        if not m or "flex-wrap:wrap" not in m.group(1).replace(" ", ""): continue
        sel = f"#__pf .{cls[0]}"
        rule = f"{sel},{sel} .pf-countdown__inner{{flex-wrap:wrap!important;justify-content:center!important;row-gap:16px;}}"
        if rule not in d["customCSS"]:
            d["customCSS"] += "\n/* countdown wraps like the mockup */\n" + rule
            done.append(cls[0])
    items = {i["id"]: i for i in d["items"]}
    for cdi in [i for i in d["items"] if i["type"] == "CountDown"]:
        cls = ((cdi.get("data") or {}).get("className") or "").split()
        kids = [items[c] for c in cdi.get("children", []) if c in items]
        num = next((((k.get("data") or {}).get("className") or "").split() for k in kids if k["type"] == "CountdownNumber"), [])
        lab = next((((k.get("data") or {}).get("className") or "").split() for k in kids if k["type"] == "CountdownLabel"), [])
        if not cls or not num or not lab: continue
        sel = "#__pf ." + ".".join(cls)
        for w, mq in ((1440, None), (390, "@media (max-width:767.5px)")):
            for u in shadows(hpath, w, cls[0], lab[0]) or []:
                if not u: continue
                if len(cls) > 1 and u["sec"] and cls[1] != cls[0] + "-" + u["sec"].replace("pu-", "", 1) and u["sec"] not in cls[1]: continue
                m = re.match(r"(rgba?\([^)]*\)|#\w+)\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+0px(?:\s+0px)?$", u["sh"].strip())
                if not m: continue
                c, dx, dy = m.group(1), float(m.group(2)), float(m.group(3))
                if dx <= 0 or dy <= 0: continue
                # an opacity on the label would fade its shadow too: carry it in the text colour instead
                op = float(u.get("lop") or 1); lc = ""
                cm = re.match(r"rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)", u.get("lcolor") or "")
                if op < 1 and cm:
                    a = float(cm.group(4) or 1) * op
                    lc = f"opacity:1!important;color:rgba({cm.group(1)},{cm.group(2)},{cm.group(3)},{a:.3g})!important;"
                rule = (f"{sel} .{num[0]}{{box-shadow:{dx:g}px {dy:g}px 0 {c}!important;clip-path:inset(0 -{dx:g}px 1px 0);}}"
                        f"{sel} .{lab[0]}{{box-shadow:{dx:g}px 0 0 {c},{dx:g}px {dy:g}px 0 {c}!important;clip-path:inset(0 -{dx:g}px -{dy:g}px 0);{lc}}}")
                if mq: rule = mq + "{" + rule + "}"
                if rule not in d["customCSS"]:
                    d["customCSS"] += "\n/* countdown unit shadow, rebuilt on the two halves */\n" + rule
                    done.append("shadow@%d:%s" % (w, cls[-1]))
                break
    if "/* editor parity */" in d["customCSS"] and "/* inline fonts kept */" not in d["customCSS"]:
        keep = []
        for sel, body in top_rules(d["customCSS"].split("/* editor parity */")[0]):
            if sel.startswith("@") or "font-family" not in body: continue
            parts = [p.strip() for p in sel.split(",") if re.search(r"\s" + INLINE + r"(?:[.:\[][^\s]*)?$", p.strip())]
            m = re.search(r"font-family\s*:\s*([^;]+)", body)
            if parts and m and "inherit" not in m.group(1):
                keep.append(",".join(parts) + "{font-family:" + m.group(1).replace("!important", "").strip() + " !important;}")
        if keep:
            d["customCSS"] += "\n/* inline fonts kept */\n" + "\n".join(keep)
            done.append("inline_font:%d" % len(keep))
    if re.search(r"#__pf\s*\{[^}]*direction\s*:\s*rtl", d["customCSS"]) and "/* rtl accordion */" not in d["customCSS"]:
        accs = [i for i in d["items"] if i["type"] == "Accordion3"]
        if accs:
            for a in accs: a["data"]["arrowPos"] = "left"
            for st in d["styles"]:
                if st.get("type") == "Accordion3.Header" or items.get(st["id"], {}).get("type") == "Accordion3.Header":
                    st["styles"] = st["styles"].replace("padding-right:40px;", "padding-left:40px;")
            rules = []
            for sel, body in top_rules(d["customCSS"]):
                if "Accordion3.Header" not in sel or sel.startswith("@") or "padding-right:40px" in body: continue
                m = re.search(r"(?<![-\w])padding\s*:\s*([^;}]+)", body)
                if not m: continue
                v = m.group(1).replace("!important", "").split()
                right = v[1] if len(v) > 1 else v[0]
                rules.append(f"{sel}{{padding-left:40px !important;padding-right:{right} !important;text-align:right;}}")
            for a in accs:
                c = ((a["data"].get("className") or "").split() or [None])[0]
                if c: rules.append(f"#__pf .{c} details:not([open]) > summary .pf-accordion-icon{{transform:rotate(90deg);}}")
            d["customCSS"] += "\n/* rtl accordion */\n" + "\n".join(dict.fromkeys(rules))
            done.append("rtl_accordion:%d" % len(accs))
    if done:
        json.dump(d, open(jpath, "w"), ensure_ascii=False)
    print(os.path.basename(jpath), "countdown_wrap:", done)
