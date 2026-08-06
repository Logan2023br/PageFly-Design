#!/usr/bin/env python3
"""PageFly page/section builder.

Composes PageFly nodes, validates the tree, and emits either:
  • clipboard JSON  ({"pageflyData":[...]} — paste into the editor), or
  • a .pagefly file (zip with "1 - <name>.json" — Pages → Import).

Schema knowledge lives in references/schema.md. This module enforces the rules that
break silently when violated (duplicate ids, orphan children, double parents, wrong
slot children, Liquid tokens in code).

Typical use:

    from pagefly_builder import *

    hero = FB(cls=None, style={"all": {"&": "…"}}, children=[
        P4("EYEBROW", {"all": {"&": "…"}}),
        H2("Big headline", {"all": {"&": "…"}}),
        BTN("Shop now", "/collections/all", {"all": {"&": "…"}}),
    ])
    print(to_clipboard(hero))                      # paste-ready JSON

    page = Page(name="my_landing", custom_js=open("app.js").read())
    page.add_section(FSECTION([hero]))
    page.save(".")                                  # writes my_landing.pagefly
"""
from __future__ import annotations
import json, uuid, zipfile, datetime, re, os

# ───────────────────────────── node constructors ─────────────────────────────
# Nodes are plain dicts with a private "_kids" list of child node dicts; ids are
# assigned at build time so composition order never matters.

_BTN_BLOBS = {
    "youtubeData": {"loop": False, "autoplay": False, "controls": False,
                    "mute": False, "videoID": "PtZir36SIMk"},
    "htmlVideoData": {"loop": False, "autoplay": False, "controls": False, "mute": False},
    "vimeoData": {"ratio": 56.25, "loop": False, "portrait": False, "byline": False,
                  "title": False, "autoplay": False, "controls": True, "mute": False},
    "popupImageData": {"objectFit": "contain", "objectPosition": "center center"},
}

def _node(type_, data=None, style=None, children=None, room=None):
    n = {"type": type_, "data": data or {}, "styleData": style, "_kids": children or []}
    if room is not None:
        n["roomId"] = str(room)
    return n

def FB(style=None, children=None, cls=None):
    """FlexBlock. Set display:flex + --pf-flex-layout-* in the style yourself."""
    d = {}
    if cls: d["className"] = cls
    return _node("FlexBlock", d, style, children)

def FSECTION(children=None, style=None):
    return _node("FlexSection", {"classGlobalStyling": "pf-container-2"}, style, children)

def H2(value, style=None, cls=None):
    d = {"value": value, "editable": True, "placeholder": "Enter heading..."}
    if cls: d["className"] = cls
    return _node("Heading2", d, style, [])          # light form: no Icon2 slot

def P4(value, style=None, cls=None):
    d = {"value": value}
    if cls: d["className"] = cls
    return _node("Paragraph4", d, style, [])        # light form: no Dropcap/CompactButton

def ICON(name, style=None, cls=None):
    d = {"icon": name} if name else {}
    if cls: d["className"] = cls
    return _node("Icon2", d, style, [])

def BTN(value, href, style=None, cls=None, click="url", children=None):
    d = {"value": value, "buttonType": "text", "href": href, "clickAction": click,
         "placeholder": "Enter text here...", **_BTN_BLOBS}
    if cls: d["className"] = cls
    return _node("Button2", d, style, children or [])

def IMG(src, style=None, cls=None, width=None, height=None):
    d = {"name": "Image", "loading": "lazy", "imgQuality": "auto", "linkTarget": "_self"}
    if src: d["src"] = src
    if width: d["width"] = width
    if height: d["height"] = height
    if cls: d["className"] = cls
    return _node("Image5", d, style, [])

def CUSTOM_HTML(code, style=None, cls=None):
    d = {"code": code}
    if cls: d["className"] = cls
    return _node("Custom.HTML", d, style or {"all": {"&": "width: 100%;"}}, [])

def RAW(type_, data=None, style=None, children=None, room=None):
    """Escape hatch for any confirmed type not wrapped above (Accordion3, Tabs3,
    ContentList2, Product* …). Slot rules from schema.md still apply and are
    validated where possible."""
    return _node(type_, data, style, children, room)

# ─────────────────────────── flatten + validation ───────────────────────────

_SLOT_RULES = {
    "ProductPrice2": ["ProductPrice2Item", "ProductPrice2Item"],
    "ProductQuantity": ["QuantityButton", "QuantityField", "QuantityButton"],
    "ProductVariantSwatches": ["OptionLabel", "Swatch"],
    "Accordion3.Content.Wrapper": ["Accordion3.Header", "Accordion3.Content"],
    "Accordion3.Content": ["Accordion3.Flex.Content"],
}
_NAMESPACED_PARENT = {  # dotted child type -> allowed ancestor family prefix
    "Accordion3.": "Accordion3",
    "ImageComparison.": "ImageComparison",
}

def _flatten(root):
    """Assign relative int ids bottom-up; root gets 0 and goes last."""
    order, out = [], []
    def walk(n):
        for k in n["_kids"]:
            walk(k)
        order.append(n)
    walk(root)
    ids = {}
    next_id = 1
    for n in order:
        ids[id(n)] = 0 if n is root else next_id
        if n is not root: next_id += 1
    # Dropcap roomIds: auto-assign clear of the id range
    room_seq = 9000
    for n in order:
        if n["type"] == "Dropcap" and "roomId" not in n:
            n["roomId"] = str(room_seq); room_seq += 1
    for n in order:
        entry = {"id": ids[id(n)], "type": n["type"], "data": n["data"],
                 "styleData": n["styleData"],
                 "children": [ids[id(k)] for k in n["_kids"]]}
        if "roomId" in n: entry["roomId"] = n["roomId"]
        out.append(entry)
    return out

def validate(nodes):
    ids = [n["id"] for n in nodes]
    assert len(ids) == len(set(ids)), "duplicate id"
    byid = {n["id"]: n for n in nodes}
    kids = [c for n in nodes for c in n["children"]]
    assert len(kids) == len(set(kids)), "a node has two parents"
    orphans = [c for c in kids if c not in byid]
    assert not orphans, f"orphan child refs: {orphans}"
    roots = [i for i in ids if i not in set(kids)]
    assert roots == [0], f"expected single root id 0, got {roots}"
    assert nodes[-1]["id"] == 0, "root must be the LAST array element"
    for n in nodes:
        kt = [byid[c]["type"] for c in n["children"]]
        rule = _SLOT_RULES.get(n["type"])
        if rule:
            assert kt == rule, f"{n['type']} slots must be {rule}, got {kt}"
        if n["type"] == "Dropcap":
            assert "roomId" in n, "Dropcap requires roomId"
        for prefix, family in _NAMESPACED_PARENT.items():
            for c in n["children"]:
                ct = byid[c]["type"]
                if ct.startswith(prefix):
                    assert n["type"].startswith(family), \
                        f"{ct} must live inside the {family} family"
        code = (n.get("data") or {}).get("code", "")
        if code:
            assert "{{" not in code and "{%" not in code, \
                "Liquid tokens in Custom.HTML code — Shopify will eat them on publish"
    # dropcap roomIds must not collide with node ids
    rooms = [int(n["roomId"]) for n in nodes
             if n["type"] == "Dropcap" and str(n.get("roomId", "")).isdigit()]
    assert not (set(rooms) & set(ids)), "Dropcap roomId collides with a node id"
    return True

# ───────────────────────────── clipboard output ─────────────────────────────

def to_clipboard(root) -> str:
    nodes = _flatten(root)
    validate(nodes)
    return json.dumps({"pageflyData": nodes}, ensure_ascii=False, separators=(",", ":"))

# ─────────────────────────────── page / .pagefly ─────────────────────────────

def _now():
    return datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"

class Page:
    """Full-page container that serializes to a .pagefly import file."""

    def __init__(self, name, custom_js="", custom_css="", selected_fonts=None,
                 pagefly_version="4.26.3.55"):
        assert "{{" not in custom_js and "{%" not in custom_js, "Liquid tokens in customJS"
        self.name = name
        self.custom_js = custom_js
        self.custom_css = custom_css
        self.selected_fonts = selected_fonts or {}
        self.version = pagefly_version
        self.sections = []          # FlexSection node dicts

    def add_section(self, section):
        assert section["type"] == "FlexSection", "add_section takes a FSECTION(...)"
        self.sections.append(section)

    def _materialize(self):
        ts = _now()
        items, styles = [], []
        def emit(n, parent_children):
            nid = str(uuid.uuid4())
            item = {"__v": 0, "id": nid, "type": n["type"], "children": [],
                    "styles": [], "createdAt": ts, "updatedAt": ts}
            if n["data"]: item["data"] = n["data"]
            if "roomId" in n: item["roomId"] = n["roomId"]
            items.append(item)
            parent_children.append(nid)
            if n["styleData"] is not None:
                styles.append({"__v": 0, "id": nid, "type": n["type"],
                               "styles": json.dumps(n["styleData"], ensure_ascii=False),
                               "createdAt": ts, "updatedAt": ts})
            for k in n["_kids"]:
                emit(k, item["children"])
        body = {"__v": 0, "id": str(uuid.uuid4()), "type": "Body", "children": [],
                "styles": [], "createdAt": ts, "updatedAt": ts}
        layout = {"__v": 0, "id": str(uuid.uuid4()), "type": "Layout", "children": [],
                  "styles": [], "createdAt": ts, "updatedAt": ts}
        body["children"].append(layout["id"])
        items.extend([body, layout])
        for s in self.sections:
            emit(s, layout["children"])
        return items, styles

    def _validate_items(self, items, styles):
        ids = {i["id"] for i in items}
        child = [c for i in items for c in i["children"]]
        assert len(child) == len(set(child)), "double-parented item"
        assert not [c for c in child if c not in ids], "orphan child ref"
        from collections import Counter
        roots = [i for i in items if i["id"] not in set(child)]
        assert len(roots) == 1 and roots[0]["type"] == "Body", "single Body root required"
        for s in styles:
            assert s["id"] in ids, "style entry points at missing item"
            json.loads(s["styles"])   # must be valid JSON-string
        return True

    def build(self):
        items, styles = self._materialize()
        self._validate_items(items, styles)
        return {"selectedFonts": self.selected_fonts, "customJS": self.custom_js,
                "customCSS": self.custom_css, "pageflyVersion": self.version,
                "editorVersion": "Flex", "items": items, "styles": styles,
                "type": "page", "globalSectionData": []}

    def save(self, out_dir="."):
        page = self.build()
        out = os.path.join(out_dir, f"{self.name}.pagefly")
        with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr(f"1 - {self.name}.json",
                       json.dumps(page, ensure_ascii=False, separators=(",", ":")))
        # round-trip verification
        with zipfile.ZipFile(out) as z:
            back = json.loads(z.read(z.namelist()[0]).decode("utf-8"))
        for k in ("selectedFonts", "customJS", "customCSS", "pageflyVersion",
                  "editorVersion", "items", "styles", "type", "globalSectionData"):
            assert k in back, f"schema key missing after round-trip: {k}"
        return out

def repackage(src_pagefly_or_json, out_path, custom_js=None, custom_css=None):
    """Load an existing export, optionally swap customJS/customCSS, re-emit."""
    if src_pagefly_or_json.endswith(".pagefly"):
        with zipfile.ZipFile(src_pagefly_or_json) as z:
            page = json.loads(z.read(z.namelist()[0]).decode("utf-8"))
    else:
        page = json.load(open(src_pagefly_or_json, encoding="utf-8"))
    if custom_js is not None:
        assert "{{" not in custom_js and "{%" not in custom_js
        page["customJS"] = custom_js
    if custom_css is not None:
        page["customCSS"] = custom_css
    name = os.path.splitext(os.path.basename(out_path))[0]
    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr(f"1 - {name}.json",
                   json.dumps(page, ensure_ascii=False, separators=(",", ":")))
    return out_path
