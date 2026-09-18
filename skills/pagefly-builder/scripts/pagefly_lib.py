# -*- coding: utf-8 -*-
"""PageFly .pagefly authoring library.

Element model (see references/export-format.md):
- flat items[] with children-by-id; styles[] linked via style.id == item.id
- custom classes carried on data.classGlobalStyling (rendered verbatim into the class attr)
- design skin belongs in customCSS scoped under #__pf; behavior in customJS

Usage:
    from pagefly_lib import Page, col, row, FILLW, HUG
    pg = Page()
    hero = pg.SEC("pu-hero", [pg.H("h1", "Title")], "background:#111;padding:60px 0;", col(16), "Hero")
    pg.E("Layout", children=[hero]);  # ... wrap in Layout+Body via pg.finish()
    pg.write("out.pagefly", "My Page", custom_css=CSS, custom_js=JS)
"""
import json, zipfile, base64, uuid, re, os

TS = "2026-08-09T05:30:00.000Z"
PAGEFLY_VERSION = "4.26.3.59"

# sizing shorthands for the flex-layout vars the Flex editor reads
FILLW = ("align-self: stretch; flex-basis: unset; height: fit-content; "
         "--pf-flex-layout-width: fill; --pf-flex-layout-height: hug;")
HUG = ("width: fit-content; flex-basis: unset; height: fit-content; "
       "--pf-flex-layout-width: hug; --pf-flex-layout-height: hug;")


def col(gap=0, align="flex-start", justify="flex-start"):
    return ("display: flex; flex-flow: column; justify-content: %s; align-items: %s; gap: %spx; "
            "--pf-flex-layout-direction: vertical; --pf-flex-layout-reverse: no;"
            ) % (justify, align, gap)


def row(gap=0, justify="flex-start", align="center", wrap=False):
    return ("display: flex; flex-flow: %s; justify-content: %s; align-items: %s; gap: %spx; "
            "--pf-flex-layout-direction: %s; --pf-flex-layout-reverse: no;") % (
        "row wrap" if wrap else "row", justify, align, gap, "wrap" if wrap else "horizontal")


# ── icons ──────────────────────────────────────────────────────────────────────
# Common thin-stroke glyphs (24-box unless noted). Add project-specific glyphs by
# passing raw `inner` markup to icon_uri(); keep everything base64 (validator!).
GLYPHS = {
    "truck": ('<path d="M3 7h11v10H3zM14 10h4l3 3v4h-7z"/><circle cx="7" cy="18" r="1.6"/><circle cx="17.5" cy="18" r="1.6"/>', 24),
    "shield": ('<path d="M12 3l7 3v6c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6z"/><path d="M9 12l2 2 4-4"/>', 24),
    "return": ('<path d="M4 12a8 8 0 108-8"/><path d="M4 5v5h5"/>', 24),
    "mail": ('<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M4 7l8 6 8-6"/>', 24),
    "search": ('<circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/>', 24),
    "user": ('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>', 24),
    "cart": ('<path d="M5 7h14l-1.2 13H6.2z"/><path d="M9 7a3 3 0 016 0"/>', 24),
    "burger": ('<path d="M4 7h16M4 12h16M4 17h16"/>', 24),
    "close": ('<path d="M6 6l12 12M18 6L6 18"/>', 24),
    "check": ('<path d="M4 12l5 5L20 6"/>', 24),
    "heart": ('<path d="M12 20s-7-4.4-7-9a4 4 0 017-2.6A4 4 0 0119 11c0 4.6-7 9-7 9z"/>', 24),
    "star8": ('<path d="M12 3l2.6 5.6L20 9.4l-4 4.1.9 5.9L12 16.6 7.1 19.4l.9-5.9-4-4.1 5.4-.8z"/>', 24),
    "gift": ('<path d="M4 9h16v11H4z"/><path d="M4 9l2-4h12l2 4M12 5v15"/>', 24),
    "home": ('<path d="M4 20V9l8-5 8 5v11z"/><path d="M9 20v-6h6v6"/>', 24),
    "arrow": ('<path d="M5 12h14M13 6l6 6-6 6"/>', 24),
    "phone": ('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z"/>', 24),
    "clock": ('<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/>', 24),
    "pin": ('<path d="M12 21s-6.5-5.6-6.5-10.5a6.5 6.5 0 0113 0C18.5 15.4 12 21 12 21z"/><circle cx="12" cy="10.5" r="2.2"/>', 24),
    "insta": ('<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17" cy="7" r="1"/>', 24),
    "fb": ('<path d="M14 8h3V4h-3a4 4 0 00-4 4v2H8v4h2v6h4v-6h3l1-4h-4V8.8c0-.5.4-.8 1-.8z"/>', 24),
    "tiktok": ('<path d="M14 4v10.5a3.5 3.5 0 11-3-3.46"/><path d="M14 4c.6 2.5 2.2 3.9 5 4"/>', 24),
}


def icon_uri(glyph_or_inner, color="#000", sw=1.5, box=24):
    """base64 SVG data URI. glyph_or_inner: a GLYPHS key or raw inner SVG markup."""
    if glyph_or_inner in GLYPHS:
        inner, box = GLYPHS[glyph_or_inner]
    else:
        inner = glyph_or_inner
    s = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" fill="none" '
         'stroke="%s" stroke-width="%s">%s</svg>') % (box, box, color, sw, inner)
    return "data:image/svg+xml;base64," + base64.b64encode(s.encode()).decode()


def behaviors(*names, cfg=None):
    """Assemble ready-made customJS from scripts/behaviors.js modules.

    behaviors("fonts", "anchors", "reveal", "drawer",
              cfg={"fonts": "family=Marcellus&family=Jost:wght@300;400;500;600",
                   "anchors": {"pu-cats": "kategorien"},
                   "countdown": {".pu-launch": "2026-12-31T00:00:00"}})

    Modules key off standard classes (see SKILL.md behavior table); "core" is
    always included. Output is guaranteed free of the HTML-tag characters the
    PageFly validator rejects.
    """
    src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                            "behaviors.js"), encoding="utf-8").read()
    mods = dict(re.findall(r"/\*MODULE ([a-z-]+)\*/\n(.*?)\n/\*END\*/", src, re.S))
    unknown = [n for n in names if n not in mods]
    assert not unknown, "unknown behavior modules %r; available: %s" % (unknown, sorted(mods))
    picked = [mods["core"]] + [mods[n] for n in names if n != "core"]
    body = "\n".join(picked)
    js = ("(function(){\n'use strict';\nvar CFG = %s;\nfunction init(){\n%s\n}\n"
          "if(document.readyState === 'loading'){"
          "document.addEventListener('DOMContentLoaded', init);}else{init();}\n})();"
          ) % (json.dumps(cfg or {}, ensure_ascii=False), body)
    assert "<" not in js, "behavior JS contains the forbidden less-than character"
    return js


class Page:
    def __init__(self, prefix="pu"):
        self.items, self.styles = [], []
        self.prefix = prefix
        self._auto_classes = set()
        self._auto_seq = {}

    # ── core node factory ─────────────────────────────────────────────────────
    # Container types that MUST carry a styles[] row (the editor's layout state and
    # the canvas both read styles[], and customCSS-only layout has repeatedly shipped
    # broken sections). FB()/SEC() auto-default; raw E() containers are validated.
    CONTAINER_TYPES = {"FlexBlock", "FlexSection", "Form2", "Popup", "ProductBox",
                       "CollectionBox", "ArticleBox", "MailChimpBox", "SearchFormBox",
                       "ContentList2", "ContentListItem", "SlideshowSlide"}

    def E(self, type_, cls=None, data=None, css=None, children=None, name=None):
        node = {"__v": 0, "children": [c["id"] for c in (children or [])],
                "createdAt": TS, "data": {}, "styles": [], "type": type_,
                "updatedAt": TS, "id": str(uuid.uuid4())}
        if data: node["data"].update(data)
        if name: node["data"]["name"] = name
        # every element carries a class so later CSS/JS can target it without
        # rebuilding; auto-name anything the caller left unnamed
        if cls is None and type_ not in ("Body", "Layout"):
            slug = type_.lower().replace(".", "-")
            n = self._auto_seq.get(slug, 0) + 1
            self._auto_seq[slug] = n
            cls = "%s-%s-%d" % (self.prefix, slug, n)
            self._auto_classes.add(cls)
        if cls: node["data"]["classGlobalStyling"] = cls
        if not node["data"]: del node["data"]
        self.items.append(node)
        if css:
            if isinstance(css, str): css = {"all": {"&": css}}
            self.styles.append({"__v": 0, "createdAt": TS, "id": node["id"],
                                "styles": json.dumps(css), "type": type_, "updatedAt": TS})
        return node

    # ── convenience builders ──────────────────────────────────────────────────
    def SEC(self, cls, children, outer_css, inner_css, name, container_width=1220):
        """FlexSection: outer & = full-bleed band (bg/padding); inner = content column."""
        return self.E("FlexSection", cls=cls, name=name,
                      data={"container": True, "containerWidth": container_width,
                            "sectionName": name},
                      children=children,
                      css={"all": {"&": outer_css,
                                   "& > .pf-flex-section": "max-width: %dpx; %s" % (container_width, inner_css)}})

    def P(self, text, cls=None, css=None, name=None):
        return self.E("Paragraph4", cls=cls, css=css, name=name,
                      data={"value": text, "editable": True, "placeholder": "Enter text..."})

    def H(self, tag, text, cls=None, css=None):
        return self.E("Heading2", cls=cls, css=css,
                      data={"value": text, "tag": tag, "editable": True,
                            "placeholder": "Enter text..."})

    def BTN(self, text, cls=None, href=None, css=None, icon=None, popup_target=None):
        """Button2. icon: FA name -> native Icon2 child (iconPos right).
        popup_target: id of a Popup item -> click opens that popup."""
        d = {"value": text, "buttonType": "text", "btnStyle": "plain",
             "placeholder": "Enter text here..."}
        kids = []
        if icon:
            d.update({"buttonType": "iconWithText", "showIcon": True, "iconPos": "right"})
            kids = [self.E("Icon2", data={"icon": icon})]
        if popup_target:
            d.update({"clickAction": "popup", "popupContent": "element",
                      "popupTargetId": popup_target})
        elif href:
            d.update({"clickAction": "url", "href": href, "linkTarget": "_self"})
        return self.E("Button2", cls=cls, data=d, css=css, children=kids)

    def FB(self, cls=None, children=None, css=None, data=None, name=None):
        """FlexBlock. css defaults to a full-width column so the element is NEVER
        layout-less in the editor; pass explicit css (string or breakpoint dict)
        for rows/grids — grids are plain CSS in styles[]:
            css={"all": {"&": FILLW + " display:grid; grid-template-columns:repeat(4,1fr); gap:26px;"},
                 "mobile": {"&": "grid-template-columns:repeat(2,1fr); gap:14px;"}}"""
        if css is None:
            css = FILLW + " " + col(0)
        return self.E("FlexBlock", cls=cls, children=children, css=css, data=data, name=name)

    def ICO(self, glyph, color, size, sw=1.5, cls=None, mt=0, href=None, name=None):
        """Standalone icon as a real Image5 element (exact SVG, color baked in).
        NEVER model icons as CSS masks/pseudo-elements — they garble on live."""
        d = {"src": icon_uri(glyph, color, sw), "loading": "eager",
             "name": name or ("Icon " + str(glyph)[:20])}
        if href:
            d.update({"clickAction": "url", "href": href, "linkTarget": "_self"})
        css = {"all": {"&": HUG + " width: %spx; height: %spx; flex: none;%s" % (
                           size, size, (" margin-top: %spx;" % mt) if mt else ""),
                       "& img": "width: 100%; height: 100%; display: block;"}}
        return self.E("Image5", cls=cls, data=d, css=css)

    def IMG(self, src, cls=None, css=None, alt=None, href=None, name=None, loading="lazy"):
        d = {"src": src, "loading": loading, "imgQuality": "auto", "name": name or "Image"}
        if alt: d["alt"] = alt
        if href: d.update({"clickAction": "url", "href": href, "linkTarget": "_self"})
        return self.E("Image5", cls=cls, data=d, css=css)

    def finish(self, sections):
        """Wrap sections in Layout + Body (call once, with all top-level sections)."""
        layout = self.E("Layout", children=sections)
        return self.E("Body", children=[layout])

    # ── validation + packaging ────────────────────────────────────────────────
    @staticmethod
    def _css_selectors(css):
        """Yield selector strings of every top-level/media rule (comments stripped)."""
        css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
        for m in re.finditer(r"([^{};]+)\{", css):
            s = m.group(1).strip()
            if not s or s.startswith("@"):
                continue
            yield s

    @staticmethod
    def scope_css(css):
        """Prefix '#__pf ' onto every unscoped selector (repair helper)."""
        css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
        def fix(m):
            sel = m.group(1)
            if sel.strip().startswith("@") or "#__pf" in sel or ":root" in sel.strip()[:6]:
                return m.group(0)
            parts = [p.strip() for p in sel.split(",")]
            return ", ".join("#__pf " + p if "#__pf" not in p else p for p in parts) + "{"
        return re.sub(r"([^{};]+)\{", fix, css)

    def lint(self, custom_css=""):
        """Cross-checks that catch 'ships-but-looks-broken' output. Returns warnings."""
        warns = []
        styled = {st["id"] for st in self.styles}
        # element custom classes never mentioned in customCSS (typo / missing skin)
        el_tokens = set()
        for it in self.items:
            for t in (it.get("data", {}).get("classGlobalStyling", "") or "").split():
                if not t.startswith("pf-"):
                    el_tokens.add(t)
        for t in sorted(el_tokens):
            if t in self._auto_classes:
                continue  # auto-assigned targeting hooks need no skin
            if ("." + t) not in custom_css:
                warns.append("class '%s' is on elements but has NO rule in customCSS" % t)
        # customCSS classes that exist on no element (drift/typo the other way);
        # strip attribute selectors and url()s first so [data-pf-type="Form2.Field"]
        # does not read as a .Field class
        css_no_attr = re.sub(r"\[[^\]]*\]|url\([^)]*\)", "", custom_css)
        css_tokens = set(re.findall(r"\.([A-Za-z][A-Za-z0-9_-]+)", css_no_attr))
        runtime = {"in", "open", "pu-anim", "is-stuck", "copied", "show",
                   "pu-marquee-track", "pu-cd-days", "pu-cd-hours", "pu-cd-mins",
                   "pu-cd-secs", "pu-copy-code", "pf-flex-section",
                   "pf-accordion-body", "pf-accordion-icon", "pfa", "pfaV4", "pfa-arrow"}
        for t in sorted(css_tokens - el_tokens - runtime):
            if not t.startswith("pf-"):
                warns.append("customCSS styles '.%s' but no element carries that class" % t)
        # custom properties defined on bare :root leak into the theme
        if re.search(r":root\s*\{[^}]*--", custom_css):
            warns.append("CSS custom properties defined on :root leak globally - define them on #__pf")
        return warns

    def validate(self, custom_css="", custom_js=""):
        ids = [it["id"] for it in self.items]
        assert len(ids) == len(set(ids)), "duplicate item ids"
        idset = set(ids)
        for it in self.items:
            for c in it["children"]:
                assert c in idset, "dangling child %s in %s" % (c, it["type"])
        child_ids = {c for it in self.items for c in it["children"]}
        roots = [it for it in self.items if it["id"] not in child_ids]
        assert len(roots) == 1 and roots[0]["type"] == "Body", (
            "root must be a single Body (call finish()), got %r" % [r["type"] for r in roots])
        by_id = {it["id"]: it for it in self.items}
        for st in self.styles:
            assert st["id"] in idset and by_id[st["id"]]["type"] == st["type"], "style/type mismatch"
            parsed = json.loads(st["styles"])
            assert all(k in ("all", "laptop", "tablet", "mobile") for k in parsed), \
                "bad breakpoint key in %s" % st["type"]
        # every container must carry layout in styles[] - customCSS-only layout has
        # shipped broken pages (editor canvas AND live both collapsed)
        styled = {st["id"] for st in self.styles}
        bare = [it["type"] for it in self.items
                if it["type"] in self.CONTAINER_TYPES and it["id"] not in styled]
        assert not bare, ("%d container elements have no styles[] row (layout MUST live in "
                          "styles[], not only customCSS): %r" % (len(bare), bare[:8]))
        for label, code in (("customCSS", custom_css), ("customJS", custom_js)):
            bad = re.findall(r"<[^>]*>", code)
            assert not bad, "%s contains HTML-tag-like text (validator rejects): %r" % (label, bad[:3])
            assert "%3C" not in code and "%3c" not in code, label + " contains encoded '<'"
        # every customCSS rule must be scoped under #__pf (bare selectors collide with
        # the theme and are the #1 cause of 'looks different on the real store')
        unscoped = [s[:60] for s in self._css_selectors(custom_css)
                    if "#__pf" not in s and not s.startswith(":root")
                    and s not in ("from", "to") and not s.rstrip().endswith("%")]
        assert not unscoped, ("%d customCSS selectors are not scoped under #__pf "
                              "(use Page.scope_css() to repair): %r" % (len(unscoped), unscoped[:6]))
        for w in self.lint(custom_css):
            print("LINT:", w)

    def doc(self, custom_css="", custom_js=""):
        return {"customJS": custom_js.strip(), "customCSS": custom_css.strip(),
                "pageflyVersion": PAGEFLY_VERSION, "editorVersion": "Flex",
                "items": self.items, "styles": self.styles,
                "type": "page", "globalSectionData": []}

    def write(self, path, page_name, custom_css="", custom_js=""):
        self.validate(custom_css, custom_js)
        payload = json.dumps(self.doc(custom_css, custom_js), ensure_ascii=False)
        with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr("1 - %s.json" % page_name, payload)
        print("OK: %d items, %d styles -> %s (%d KB json)" % (
            len(self.items), len(self.styles), path, len(payload.encode("utf-8")) // 1024))
