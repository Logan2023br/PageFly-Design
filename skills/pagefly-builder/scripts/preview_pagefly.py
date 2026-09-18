# -*- coding: utf-8 -*-
"""Emulate PageFly's publish pipeline: render a .pagefly to a standalone HTML preview.

Usage: python preview_pagefly.py <file.pagefly> <out.html>

Approximates the live DOM (pf-N_ class assignment, styles[] compilation into
media queries, customCSS/customJS injection) so the page can be eyeballed and
screenshotted before importing. Not pixel-authoritative for complex widgets
(sliders, product lists render as static boxes) but faithful for layout/skin.
"""
import zipfile, json, html, sys

if len(sys.argv) < 3:
    print(__doc__); sys.exit(1)
SRC, OUT = sys.argv[1], sys.argv[2]

z = zipfile.ZipFile(SRC)
doc = json.loads(z.read(z.namelist()[0]))
items = doc["items"]; styles = doc["styles"]
by_id = {it["id"]: it for it in items}
child_ids = {c for it in items for c in it["children"]}
root = next(it for it in items if it["id"] not in child_ids)

pf_num, counter = {}, [1]
def assign(iid):
    pf_num[iid] = counter[0]; counter[0] += 1
    for c in by_id[iid]["children"]: assign(c)
assign(root["id"])

MQ = {"all": None, "laptop": "(min-width:1024.5px) and (max-width:1199.4999px)",
      "tablet": "(min-width:767.5px) and (max-width:1024.4999px)", "mobile": "(max-width:767.4999px)"}
buckets = {k: [] for k in MQ}
for st in styles:
    n = pf_num.get(st["id"])
    if n is None: continue
    for bp, sels in json.loads(st["styles"]).items():
        for sel, css in sels.items():
            buckets.setdefault(bp, []).append("%s{%s}" % (sel.replace("&", ".__pf .pf-%d_" % n), css))
compiled = []
for bp, rules in buckets.items():
    if not rules or bp not in MQ: continue
    body = "\n".join(rules)
    compiled.append(body if MQ[bp] is None else "@media %s{\n%s\n}" % (MQ[bp], body))
COMPILED_CSS = "\n".join(compiled)

def cls_of(it):
    c = (it.get("data") or {}).get("classGlobalStyling", "")
    return ("pf-%d_ %s" % (pf_num[it["id"]], c)).strip()

def render(iid):
    it = by_id[iid]; t = it["type"]; d = it.get("data") or {}
    kids = "".join(render(c) for c in it["children"])
    a = 'data-pf-type="%s" class="%s"' % (t, cls_of(it))
    if t in ("Body", "Layout"):
        return '<div %s>%s</div>' % (a, kids)
    if t == "FlexSection":
        return '<section %s><div class="pf-flex-section">%s</div></section>' % (a, kids)
    if t == "FlexBlock":
        if d.get("clickAction") == "url" and d.get("href"):
            return '<a %s href="%s">%s</a>' % (a, d["href"], kids)
        return '<div %s>%s</div>' % (a, kids)
    if t == "Paragraph4":
        return '<p %s><span>%s</span></p>' % (a, d.get("value", ""))
    if t == "Heading2":
        tag = d.get("tag", "h3")
        return '<%s %s>%s</%s>' % (tag, a, d.get("value", ""), tag)
    if t in ("Button2", "ProductATC2", "Form2.Button2", "MailChimpButton2", "SearchFormButton2"):
        href = ' href="%s"' % d["href"] if d.get("href") else ""
        icon = kids if d.get("showIcon") else ""
        return '<a %s%s>%s%s</a>' % (a, href, d.get("value", ""), icon)
    if t == "Accordion3":
        return '<div %s>%s</div>' % (a, kids)
    if t == "Accordion3.Content.Wrapper":
        hdr = by_id[it["children"][0]]; content = by_id[it["children"][1]]
        binner = "".join(render(c) for c in content["children"])
        return ('<details class="%s"><summary data-pf-type="Accordion3.Header" class="%s" data-active="false">%s'
                '<span class="pf-accordion-icon"></span></summary>'
                '<div class="pf-accordion-body"><div>%s</div></div></details>'
                ) % (cls_of(it), cls_of(hdr), hdr["data"].get("label", ""), binner)
    if t in ("Form2", "MailChimpBox", "SearchFormBox", "ProductBox"):
        return '<div %s><form action="#" onsubmit="return false">%s</form></div>' % (a, kids)
    if t in ("Form2.Field", "MailchimpField", "SearchFormField"):
        inp = next((by_id[c] for c in it["children"]
                    if by_id[c]["type"] in ("FormInput", "MailChimpSingleInput", "SearchFormInput")), None)
        ph = (inp.get("data") or {}).get("placeholder", "") if inp else ""
        return '<div %s><input type="text" placeholder="%s"></div>' % (a, html.escape(ph))
    if t == "Image5":
        src = d.get("src", "")
        if src and d.get("clickAction") == "url" and d.get("href"):
            return '<a %s href="%s"><img src="%s"></a>' % (a, d["href"], src)
        if src:
            return '<div style="display:block" %s><img src="%s"></div>' % (a, src)
        return '<div style="display:block" %s></div>' % a
    if t == "Icon2":
        return ('<svg %s viewBox="0 0 448 512" xmlns="http://www.w3.org/2000/svg">'
                '<path fill="currentColor" d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>') % a
    if t == "Custom.HTML":
        return '<div %s>%s</div>' % (a, d.get("code", ""))
    # product widgets: static placeholders so a ProductBox previews meaningfully
    if t == "MediaMain3":
        src = d.get("src", "")
        img = '<img src="%s" style="width:100%%;display:block">' % src if src else \
              '<div style="aspect-ratio:1/1;background:#ddd"></div>'
        return '<div %s>%s</div>' % (a, img)
    if t == "MediaList2":
        cells = "".join('<div style="aspect-ratio:1;background:#e5e0d5;border:1px solid #ccc"></div>' for _ in range(4))
        return ('<div %s style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:16px">%s</div>') % (a, cells)
    if t == "ProductBadge":
        return '<span %s>Sale</span>' % a
    if t == "ProductTitle":
        return '<h2 %s>Premium Gebetsteppich - Sajjada</h2>' % a
    if t == "ProductPrice2":
        return '<div %s>%s</div>' % (a, kids)
    if t == "ProductPrice2Item":
        val = "64,99 €" if d.get("type") == "compare_at_price" else "49,99 €"
        return '<span %s>%s</span>' % (a, val)
    if t == "ProductVariantSwatches":
        pills = "".join('<span class="pf-vs-label" style="display:inline-block;margin:0 8px 8px 0">%s</span>' % v
                        for v in ("Gray", "Green", "White", "Black"))
        return '<div %s><div style="font-size:11px;text-transform:uppercase;letter-spacing:.14em;margin-bottom:10px">Farbe</div>%s</div>' % (a, pills)
    if t == "ProductDescription":
        return '<p %s>Produktbeschreibung aus Shopify erscheint hier auf der Live-Seite.</p>' % a
    if t == "ProductQuantity":
        return '<div %s style="display:inline-flex;align-items:center">%s</div>' % (a, kids)
    if t == "QuantityButton":
        sym = "+" if (d.get("action") == "increase") else "–"
        return '<button %s type="button">%s</button>' % (a, sym)
    if t == "QuantityField":
        return '<input %s type="number" value="1" style="width:44px;text-align:center">' % a
    if t in ("ProductMedia3", "ProductViewDetails2", "OptionLabel", "Swatch"):
        return '<div %s>%s</div>' % (a, kids)
    if t in ("FormLabel", "FormInput", "MailchimpLabel", "MailChimpSingleInput",
             "SearchFormLabel", "SearchFormInput"):
        return ""
    return '<div %s>%s</div>' % (a, kids)

page = """<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>pagefly preview</title>
<style>body{margin:0}
%s
%s
.__pf details>.pf-accordion-body{display:none}
.__pf details[open]>.pf-accordion-body{display:block}
.__pf summary{list-style:none}
.__pf summary::-webkit-details-marker{display:none}
</style></head>
<body><div id="__pf" class="__pf">%s</div>
<script>%s</script>
<script>
document.querySelectorAll('.__pf details').forEach(function(dt){
  dt.addEventListener('toggle',function(){
    dt.querySelector('summary').setAttribute('data-active', dt.open?'true':'false');
  });
});
</script>
</body></html>""" % (COMPILED_CSS, doc["customCSS"], render(root["id"]), doc["customJS"])

open(OUT, "w", encoding="utf-8").write(page)
print("wrote", OUT)
