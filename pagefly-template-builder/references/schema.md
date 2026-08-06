# PageFly Flex Editor — JSON Schema Reference

Everything here was confirmed against a live PageFly 4.26.x store (Flex editor) by
actual paste/import testing. Trust this over guesses.

## The two formats

### 1. Clipboard payload (paste into editor)

```json
{"pageflyData":[ <node>, <node>, ... ]}
```

- **Flat array**, not nested. Each node: `{"id": <int>, "type": "...", "data": {...},
  "styleData": {...}|null, "children": [<int ids>]}`
- Order is **bottom-up**: leaves first, **root LAST with id 0**. IDs are relative
  (renumbered on paste); root = the node no other node references.
- Exactly ONE root. Paste target = whatever element is selected in the editor.
- `Dropcap` nodes additionally need a node-level `"roomId": "<string>"` (any value not
  colliding with an id). Sibling `ContentListItem`s share ONE roomId (it's a scope id).

### 2. `.pagefly` file (page import)

A **zip archive** containing exactly one entry named `1 - <pagename>.json`:

```json
{
  "selectedFonts": {"Fraunces": {...}, ...},   // Google-font descriptors
  "customJS": "…page-level JS…",               // RESTORED on import (verified)
  "customCSS": "…page-level CSS…",             // RESTORED on import (verified)
  "pageflyVersion": "4.26.3.55",
  "editorVersion": "Flex",
  "items":  [ ... ],                            // nodes, UUID ids
  "styles": [ ... ],                            // parallel style array
  "type": "page",
  "globalSectionData": []
}
```

- `items[]` node: `{"__v":0, "id":"<uuid>", "type":"…", "data":{…}, "children":["<uuid>"…],
  "styles":[], "createdAt":"ISO", "updatedAt":"ISO"}`. The per-item `styles` field is
  ALWAYS `[]` — a decoy. Real styles live in the top-level `styles[]` array.
- `styles[]` entry: `{"__v":0, "id":"<same uuid as item>", "type":"<item type>",
  "styles":"<JSON-STRING of the styleData object>", "createdAt", "updatedAt"}`.
  Note the double encoding: `styles` is a *string* containing JSON.
  Entries **without** `id` are per-type defaults — leave them out when generating.
- Tree root: `Body` → `Layout` → `FlexSection`(s) → content. Both Body and Layout are
  required and carry no styles.
- Page-level `customJS` runs on live/preview and **survives import** — put shared JS
  there, not in a hidden Custom.HTML (both work, but customJS is cleaner).

## Element vocabulary (confirmed types)

Layout: `FlexSection` `FlexBlock`
Text: `Heading2` `Paragraph4` (data: `value`, `editable:true`, `placeholder`)
Media: `Image5` `Icon2` (data.icon = Font Awesome name: `check`, `xmark`,
  `cart-shopping`, `chevron-right`, `angle-down`, `angle-up`, `star`, `envelope`…)
Buttons: `Button2` (data: `value`, `buttonType:"text"`, `href`, `clickAction:"url"|"none"`,
  plus inert default blobs `youtubeData/htmlVideoData/vimeoData/popupImageData` — copy
  them verbatim from an existing node) · `CompactButton` · `Dropcap`
Product (must live inside `ProductBox`, which renders a `<form>` → style layout via
  `& > form`, not `&`): `ProductMedia3` `MediaMain3` `MediaList2` `MediaItem2`
  `ProductBadge` `ProductTitle` `ProductPrice2` `ProductPrice2Item` `ProductDescription`
  `ProductVariantSwatches` `OptionLabel` `Swatch` `ProductQuantity` `QuantityButton`
  `QuantityField` `ProductATC2` `ProductViewDetails2`
Interactive: `Tabs3` family, `Accordion3` family, `Slideshow`/`SlideshowSlide`,
  `ContentList2`/`ContentListItem`, `Custom.HTML` (data.code), `HTML.Video3`, `Youtube4`,
  `ImageComparison`(+`.Badge`), `Popup`, MailChimp family.

Dotted types (`Accordion3.Header`, `Custom.HTML`, `ImageComparison.Badge`) are
namespaced — valid ONLY inside their parent family.

## Fixed slot tables (do not add/remove)

| Parent | Required children (exact order) |
|---|---|
| `ProductBox` | `[ProductMedia3, FlexBlock(info column)]` |
| `ProductPrice2` | `[ProductPrice2Item(price), ProductPrice2Item(compare_at_price)]` — hide one with `display:none`, don't delete |
| `ProductQuantity` | `[QuantityButton, QuantityField, QuantityButton(action:"increase")]` |
| `ProductVariantSwatches` | `[OptionLabel, Swatch]` |
| `Accordion3` | N × `Accordion3.Content.Wrapper` → each `[Accordion3.Header, Accordion3.Content]` → Content holds `[Accordion3.Flex.Content]` → **real content goes in Flex.Content** (4 tiers) |
| `Tabs3` | `[TabsMenu3, TabContentWrapper3, DropdownButton, TabHeader3(isNavButton:"start"), TabHeader3(isNavButton:"end")]` — the last three are controls, NOT tabs. Real tabs: TabHeader3 with `isNavButton:false` inside TabsMenu3, count must equal TabsContent3 count |
| `ContentList2` | N × `ContentListItem` only (data: `slidesToShow/slidesToScroll/displayPartialItems/listLayout` — all per-breakpoint objects) |
| `Popup` | one content FlexBlock; popup config lives in Popup.data |

Optional slots (fine to omit → `children: []`): Heading2's Icon2, Paragraph4's
Dropcap+CompactButton, Button2/ProductATC2's Icon2.

## styleData

```json
{"all": {"&": "css;…", "&:hover": "…", "& [data-pf-type=\"QuantityButton\"]": "…"},
 "laptop": {...}, "tablet": {...}, "mobile": {...}}
```

- Raw CSS pass-through — shorthand works, custom properties work, `!important` works.
- Confirmed selectors: `&`, `&:hover`, `&:active`, `&::after`, `&::-webkit-scrollbar`,
  `&.is-active` (JS-toggled classes), `&[data-active="true"]`, `& > form`, `& > div img`,
  `& [data-pf-type="…"]`. Internal classes (`.pf-slider`, `.tab3-*`) work but break on
  PageFly upgrades — avoid in anything long-lived.
- Layout engine custom props: `--pf-flex-layout-width: hug|fill|fixed`,
  `--pf-flex-layout-height`, `--pf-flex-layout-direction: horizontal|vertical|wrap`,
  `--pf-flex-layout-reverse`, and the denormalized
  `--pf-flex-layout-parent-direction` (MUST mirror parent's direction per breakpoint).
- `styleData: null` is legal (inherit/defaults).
- Breakpoint `all` is the base; others override. Editor writes redundant laptop/tablet
  copies — harmless, don't bother replicating.

## data extras

- `data.className` → real CSS class on the rendered element (JS hooks). Multiple
  classes space-separated. `data.id` → element id (avoid; classes suffice).
- `classGlobalStyling` (`pf-text-1`, `pf-heading-1-h3`, `pf-button-1`…) = shared theme
  styles. Copy from existing exports; never invent.
- Responsive can live in `data` too (per-breakpoint objects like `slidesToShow`) —
  element-specific, check an existing export when unsure.

## Runtime facts (for customJS)

- `window.__pageflyProducts[productId]` exists on every PageFly product page: variants
  (id/title/option1/**price in cents**), selected_or_first_available_variant, images…
- Variant radios: `[data-pf-type="ProductVariantSwatches"] input[type="radio"]` — group
  by `name` per swatch instance; set `.checked`, call `.click()`, dispatch `input` +
  `change` (bubbles) to drive PageFly's own handlers.
- ProductBox renders `<form action="/cart/add">`; duplicate `ProductQuantity` in one
  form = two `quantity` fields = wrong cart quantities. One per form.

## Failure signatures (diagnose by symptom)

| Symptom | Cause |
|---|---|
| Paste shows styled but EMPTY block | malformed children (duplicate key / orphan ids) |
| Paste shows nothing at all | unknown `type` somewhere — whole payload rejected |
| Text element missing on paste | wrong versioned name (`Heading` vs `Heading2`) |
| Accordion opens but body empty | content not inside `Accordion3.Flex.Content` |
| Style block visible in editor, gone on live | placeholder min-size (`data-element-placeholder`) — editor-only affordance |
| Custom CSS "not working" | `::hover` typo (must be `:hover`), or Liquid ate `{{` |
| JS "broken" | it's the editor — JS only runs on preview/live |
