---
name: pagefly-builder
description: Build Shopify PageFly pages from any design source (HTML file, screenshot, or written spec) into an importable .pagefly file, using real gen-2 Flex-editor elements. Use when asked to create, convert, clone, or reverse-engineer a design into PageFly, build a .pagefly file, or edit/extend an existing PageFly export.
---

# PageFly page builder

Convert a design into a `.pagefly` file that imports cleanly into PageFly (Flex editor, gen-2
elements) and stays fully editable. Every rule below was verified against real imports — follow
them exactly; the failure modes are silent or cryptic.

## Reference files (read on demand, not all at once)

| File | When to read |
| --- | --- |
| `references/export-format.md` | FIRST, always — the .pagefly container + JSON model + live-DOM mapping |
| `references/kitchen-sink-1-tree.txt` | Real JSON shapes: core elements (Tabs, Accordion, Slideshow, Table, Form, ProductBox, CountDown, Progress...) |
| `references/kitchen-sink-2-tree.txt` | Real JSON shapes: Popup, ProductList2, CollectionListing2, ArticleList2, MailChimp, SearchForm, Custom.HTML, gen-1 Button |
| `references/fields.md` | Per-element data fields + allowed values + styleable selectors (95 types) — grep for the `## <Type>` section you need |
| `references/nesting.md` | Which element may sit inside which container — check before inventing a hierarchy |
| `references/page-json.md` | `data` vs `options` slots, styleData semantics |

99 element types have real shapes in the two kitchen-sink trees. **Copy shapes from there** rather
than inventing `data` payloads. The 15 types without samples (QRCode, Vimeo3, SoundCloud, Insta3,
FBLikeButton2, FBPageBox2, TwitterFeed2, GMapBasicV2, ProductVendor, ProductDynamicCheckout,
CollectionDescription, ArticleContent, DividerIcon, DividerSymbol, MediaListItem2) are simple
leaves — build them from `fields.md` alone.

## Workflow

1. **Decompose the design** into a flat element tree: `Body → Layout → FlexSection` (one per
   full-width band) `→ FlexBlock / content elements`. Match each visual block to a real element
   type (check `nesting.md`). Text → Heading2 (`tag` h1–h6) / Paragraph4; links & buttons →
   Button2; FAQ → Accordion3; forms → Form2 (or MailChimpBox / SearchFormBox); product/collection/
   blog grids → ProductList2 / CollectionListing2 / ArticleList2 with a `useContext:true` Box
   template inside. Custom.HTML (`data.code`) is a last resort; avoid Liquid.
2. **Write a Python build script** using `scripts/pagefly_lib.py` (helpers: `Page`, `E/P/H/BTN/FB/
   SEC/ICO`, `col/row`, `FILLW/HUG`, validation, zip writer).

   **Class naming convention** — every element gets a class (it is how CSS/JS reach elements later
   without rebuilding; `classGlobalStyling` carries them):
   - Sections: `pu-<section>` (`pu-hero`, `pu-faq`). Blocks/roles: `pu-<section>-<role>`
     (`pu-hero-copy`, `pu-prod-grid`). Shared components: `pu-btn pu-btn-gold`, `pu-chip`.
   - Anything you leave unnamed gets an auto class `pu-<type>-<n>` from the lib, so no element is
     ever untargetable — but prefer semantic names for everything a human might restyle.
   - Behavior classes from the table below are RESERVED — attach them exactly as spelled.
   - Custom page prefix: `Page(prefix="xx")`.
3. **ALL layout lives in `styles[]`, customCSS is skin only.** This is the doctrine — a build that
   put layout in customCSS shipped with overlapping text and collapsed sections.
   - Every container gets flex/grid in its own styles: `FB()` defaults to a full-width column;
     rows via `row()`; grids as plain CSS in the styles dict, with responsive breakpoint keys:
     `css={"all": {"&": FILLW+" display:grid; grid-template-columns:repeat(4,1fr); gap:26px;"},
     "mobile": {"&": "grid-template-columns:repeat(2,1fr); gap:14px;"}}`
   - Two-column section bands go on the section's inner container:
     `"& > .pf-flex-section": "display:grid; grid-template-columns:1fr .92fr; gap:56px; align-items:center;"`
   - Spacing between siblings (gaps, margin-top rhythm) belongs in styles[] too.
   - customCSS handles ONLY: colors, typography, borders/shadows, pseudo-elements, hover states,
     and skin-level media tweaks. Every selector scoped under `#__pf`; CSS variables defined on
     `#__pf` (never bare `:root` — they leak into the theme).
4. **Behavior with customJS — assemble from the behavior pack, don't hand-write.**
   `from pagefly_lib import behaviors` gives you tested, validator-safe modules keyed off the
   reserved classes:

   ```python
   custom_js = behaviors("fonts", "anchors", "reveal", "drawer", "card-link",
       cfg={"fonts": "family=Marcellus&family=Jost:wght@300;400;500;600",
            "anchors": {"pu-cats": "kategorien", "pu-faq": "faq"},
            "countdown": {".pu-launch": "2026-12-31T00:00:00"}})
   ```

   | Module | Reserved classes | What it does |
   | --- | --- | --- |
   | `fonts` | — (cfg.fonts = Google Fonts query) | injects the font link |
   | `anchors` | — (cfg.anchors = {class: id}) | assigns DOM ids for #links |
   | `reveal` | `pu-rv` (+ auto `pu-anim` gate) | scroll-reveal, editor-safe, staggered |
   | `drawer` | `pu-burger` `pu-drawer` `pu-drawer-close` `pu-scrim` | mobile off-canvas menu |
   | `card-link` | `pu-card` | card click → inner `a[href]` (nested-anchor workaround) |
   | `sticky` | `pu-sticky` → toggles `is-stuck` | styled sticky/shrink headers |
   | `count-up` | `pu-count` | animates the number found in the element's text |
   | `countdown` | container per cfg.countdown; children `pu-cd-days/hours/mins/secs` | live countdown |
   | `marquee` | `pu-marquee` > `pu-marquee-track` | infinite logo/text scroll, hover-pause |
   | `copy-code` | `pu-copy` (+ optional `pu-copy-code` child) → toggles `copied` | copy discount code |
   | `back-to-top` | `pu-top` → toggles `show` | scroll-to-top button |

   The pack covers the hidden-state rule automatically (reveal gates behind `pu-anim`). Only write
   bespoke JS for behavior the pack lacks — and keep it free of the `<` character.

   If the design has a mobile menu, ALL of these are required: burger element, drawer block, scrim
   block, the `drawer` module, and a dedicated `height:0; overflow:visible` section to host the
   fixed overlays.
5. **Validate + package**: `page.write(path, "Page Name")` — validation is strict and will REJECT
   layout-less containers, unscoped CSS selectors, and HTML-shaped custom code; `Page.scope_css()`
   repairs unscoped CSS. Read every LINT line it prints: "class on elements with no CSS rule" and
   vice-versa usually mean a section will render broken.
6. **Verify**: `python scripts/preview_pagefly.py <file.pagefly> <out.html>` emulates the publish
   pipeline (pf-N_ classes, style compilation, custom code).
   - **With a browser** (Claude Code + Chrome tools): screenshot desktop AND mobile widths,
     compare against the design, iterate. Force-add the `in` class first if reveal animations
     hide content.
   - **Without a browser** (claude.ai / Desktop sandbox): you cannot see your output — do NOT
     trust it blindly. Run the self-review below, then give the user BOTH files (.pagefly +
     preview.html) and tell them to open preview.html locally before importing.

## Self-review checklist (mandatory when you cannot screenshot)

Walk the design section by section and check the generated code answers each question:
1. Does this section's column/grid split exist in `styles[]` (not just customCSS)?
2. Does every text stack have explicit gaps/margins (headings over ledes over lists)?
3. Any dark-on-dark / light-on-light button or text? (check bg vs color pairs you emitted)
4. Do all `-grid`, `-list`, `-row` classes have a matching layout rule?
5. Mobile: does each grid collapse (breakpoint keys present)? Is the nav hidden / burger shown?
6. Fixed overlays (drawer/scrim/popup) present, with their JS wiring?
7. Re-read the LINT output — zero unexplained warnings.

## Hard rules (each one broke a real import or render)

**Container & linkage**
- `.pagefly` = ZIP; entry named `<n> - <page name>.json`; page name comes from the entry name.
- items[] is flat; tree = `children` id arrays; exactly ONE root (`Body`); UUIDs for ids.
- Every styles[] row MUST have `id` == its item's id and matching `type`; payload is a JSON
  **string** `{all|laptop|tablet|mobile: {selector: "css"}}`. Breakpoints compile to: laptop
  1024.5–1199.5px, tablet 767.5–1024.5px, mobile ≤767.5px. `&` → the element itself.
- Repeated content (slides, list items, table cells): copies of the same template slot share one
  `roomId` string.

**CSS specificity trap (verified in preview)**
- Compiled styles[] rules are class-only (`.__pf.__pf_x .pf-N_` ≈ 0,3,0). Any customCSS tag rule
  under `#__pf` carries ID specificity (`#__pf h2` = 1,0,1) and **permanently beats them**.
  So base tag rules (`#__pf h1..h3`, `#__pf p`) may set ONLY font-family/weight/line-height —
  NEVER color or size you also set per-element in styles[] (symptom: dark headings on dark
  sections). Skin colors go in class rules (`#__pf .pu-x`), which outrank base tag rules.
- Absolutely-positioned children (badges, wish buttons) need an explicit `position:relative`
  ancestor in YOUR css — nothing in PageFly's output provides one, and the element flies to the
  page corner without it.

**Custom code validator**
- customCSS/customJS must contain NO `<` in any form — the validator decodes percent-encoding, so
  `%3Csvg` fails with "CSS code cannot contain any HTML tag(s)". Data URIs must be **base64**.
  No HTML tags in CSS comments either. `html{...}` selector → use `:root{...}`.

**Editor vs live**
- The editor canvas injects customCSS but does **not** run customJS. Any JS-dependent initial state
  must fail visible: gate hidden states behind a JS-stamped class
  (`#__pf.pu-anim .pu-rv{opacity:0}`; customJS adds `pu-anim`), never bare `.pu-rv{opacity:0}`.
- Anchor ids for `#links`: sections only get `data-section-id`; assign real DOM ids in customJS
  (`document.querySelector('.pu-cats').id='kategorien'`).
- Google Fonts: inject a `<link>` from customJS (@import mid-stylesheet is unreliable).
- Convert rem → px in CSS (themes change html font-size).

**Icons (user-mandated policy)**
- Native slots first: arrows/icons in buttons = Button2's Icon2 child
  (`showIcon:true, buttonType:"iconWithText", iconPos:"right"`, `icon:"arrow-right"` — FA names
  outside the fields.md advisory list still work). Accordion toggles = `headerIcon` or CSS-only.
- Everything else = **Image5 elements** with `src` = base64 SVG data-URI, stroke color baked in
  (`ICO()` helper). Icon-beside-text = FlexBlock(row)[Image5, Paragraph4].
- NEVER CSS-mask/pseudo-element icons — they garble on the live render.

**DOM hazards**
- Never give a container `clickAction:"url"` when a descendant renders an `<a>` (Button2, linked
  Image5) — nested anchors shatter the parsed DOM. Forward card clicks in customJS instead.
- Fixed overlays (drawers, scrims) need a dedicated section with no transform/backdrop-filter
  ancestors (both create containing blocks); use a `height:0; overflow:visible` section.
- Popup: the element is `Popup` (`popupTriggers` is an ARRAY); a trigger Button2 links to it with
  `clickAction:"popup", popupContent:"element", popupTargetId:"<popup item id>"`.

**Content**
- Text lives in `data.value`; inline `<b>/<em>/<br>` allowed; avoid exotic tags — split styled
  blocks into separate Paragraph4s. Responsive visibility flags go in `options`, not `data`.
- `classGlobalStyling` is the class carrier (multi-token, rendered verbatim). Keep PageFly default
  tokens (`pf-heading-1-h3`, `pf-button-1`, `pf-text-1`, `pf-icon2-1`, `pf-image-1`,
  `pf-container-1 pf-color-scheme-1`) alongside custom classes when theme-linking matters.
- Store-bound elements (StockIndicator `source:"custom"`, hard product/variant ids) are NOT
  portable between stores — prefer `useContext:true` inside Box templates.

## Import notes for the user

- A `page`-type import renders inside the theme layout — theme header/footer will surround it.
- If PageFly rejects the import, diff the custom code for stray `<` first, then re-validate ids.
