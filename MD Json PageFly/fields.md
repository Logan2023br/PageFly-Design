# PageFly gen-2 element reference

Generated from the element-knowledge oracle at commit `f9bfe45b8e2`. Do not edit by hand:
rerun `scripts/write-element-reference.ts` instead.

**95 element types, 419 fields.**

## Read this first

This is the knowledge the AI editing agent holds about gen-2 elements. It is assembled by hand from
the inspector, the render path and a corpus of shipped templates, so it is an accurate description of
what the agent can reason about, and it is NOT a guarantee that every field the PageFly editor exposes
appears here. Treat a missing field as "unknown", not as "does not exist".

**AI can edit** marks whether the editing agent may write a field today. `no` does not mean the field is
unavailable to you in the editor; it means the agent is held back from it, almost always because the value
is a per-breakpoint object the current write operation would flatten.

Every element also carries `hideOnDesktop`, `hideOnLaptop`, `hideOnTablet` and `hideOnMobile` (booleans,
slot `options`). They are omitted from each table since they never vary.

Gen-1 elements are out of scope: 46 further types (141 total in the registry) are
not listed here.

---

## Accordion3

Collapsible accordion for FAQs / stacked content. Renderer owns the item structure.

- kind: unit
- copy: no directly editable text
- resizable: true

**Fields (5)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `headerIcon` | enum | `(unset)`, `plus`, `arrow`, `chevron` | default empty | yes | Toggle glyph shown on each header (synced to all items). |
| `arrowPos` | enum | `left`, `right` | default `left` | yes | Side the toggle glyph sits on. |
| `activeInFront` | number |  | writes `preopen` too; default `-1` | yes | Index of the item open by default (-1 = all closed, 0 = first). Writes the editor canvas and the published page together. |
| `multiple` | boolean |  | default `false` | yes | Allow multiple items open at once (else accordion closes others). |
| `scrollTop` | boolean |  | default `true` | yes | Scroll the opened item into view. |

**Styleable parts (4)**

- **main** `&` - spacing, background, border
- **header wrapper** `& .pf-header-item-wrapper` - typography, spacing, background, border (the clickable summary/header row.)
- **body** `& .pf-accordion-body` - typography, spacing, background (the expandable content panel.)
- **icon** `& .pf-accordion-icon` - size, color (toggle icon size/colour (arrow uses .pfa-arrow, plus/minus use .pfa-plus/.pfa-minus).)

**Contains (1)**

- `Accordion3.Content.Wrapper` (collection, x1..n) - one per row; holds that row's header and body.

**Page CSS only**

- open-state animation on .pf-accordion-body uses a grid transition — to retheme the open state, target `& details[open] .pf-accordion-body`.

## Accordion3.Content

Body of one accordion row.

- kind: open
- copy: no directly editable text

_No configurable fields. Styling and copy only._

**Styleable parts (1)**

- **root** `&` - typography, color, background, spacing, border

## Accordion3.Content.Wrapper

One accordion row, header plus body.

- kind: open
- copy: no directly editable text

_No configurable fields. Styling and copy only._

**Styleable parts (1)**

- **root** `&` - typography, color, background, spacing, border

## Accordion3.Flex.Content

Body panel of an Accordion3 row.

- kind: open
- copy: no directly editable text

_No configurable fields. Styling and copy only._

**Styleable parts (1)**

- **root** `&` - typography, color, background, spacing, border

## Accordion3.Header

Clickable header of one accordion row.

- kind: unit
- copy: no directly editable text

**Fields (3)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `showIcon` | boolean |  | default `false` | yes | Render the icon child before the label. |
| `label` | string |  |  | yes | The visible label copy for this element. |
| `anchorText` | string |  |  | yes | Anchor name for linking straight to this row. Rendered as `data-pf-anchor`. |

**Styleable parts (3)**

- **root** `&` - typography, color, background, spacing, border
- **hover state** `&:hover` - color, background, border, transform
- **open row** `&[data-active="true"]` - color, background, border, transform (Applies to the row that is currently expanded.)

**Contains (2)**

- `Icon2` (config, shown by `showIcon`, x1)
- `Icon` (config, shown by `showIcon`, x1) - alternative icon generation; same governor.

## ArticleBox

Article context container — nest ArticleTitle, ArticleContent, and ArticleMeta inside it.

- kind: open
- copy: no directly editable text
- resizable: true

**Fields (3, 3 not AI-editable)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `source` | enum | `auto`, `custom` | default `auto` | no | Article source. Use auto for page/parent context, custom for a picked article. |
| `articleId` | string |  | only when source === "custom"; default empty | no | Specific article ID when source is custom. |
| `blogId` | string |  | only when source === "custom"; default empty | no | Blog ID paired with a custom article selection. |

**Styleable parts (1)**

- **main** `&` - spacing, background, border, effects (Container styles only; child article elements inherit this article context.)

## ArticleContent

Dynamic full article body content. Place inside an ArticleBox for inherited article context.

- kind: leaf
- copy: no directly editable text
- resizable: true

**Fields (2, 2 not AI-editable)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `source` | enum | `auto`, `custom` | default `auto` | no | Article source. Use auto inside ArticleBox; custom for a picked article. |
| `articleId` | string |  | only when source === "custom"; default empty | no | Specific article ID when source is custom. |

**Styleable parts (5)**

- **main** `&` - typography, spacing, background, border (Base styles cascade into the rendered article HTML.)
- **paragraphs** `& p` - typography, spacing; written to page custom CSS
- **headings** `& h1, & h2, & h3, & h4, & h5, & h6` - typography, spacing; written to page custom CSS
- **links** `& a` - typography, effects; written to page custom CSS
- **images** `& img` - spacing; written to page custom CSS

## ArticleList2

Grid or slideshow of blog articles; renders its own article cards.

- kind: unit
- copy: no directly editable text
- resizable: true

**Fields (13, 2 not AI-editable)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `blogId` | string |  |  | no | Blog ID used to fetch article posts (omit to bind after insert). |
| `handle` | string |  |  | no | Blog handle alternative to blogId. |
| `limit` | number |  | default `4` | yes | Maximum article count to render. |
| `reverse` | boolean |  | default `false` | yes | Reverse article order (newest/oldest). |
| `hideCurrentBlogPost` | boolean |  | default `false` | yes | Exclude the current article from the list. |
| `listLayout` | enum | `grid`, `slideshow` | per breakpoint; default `slideshow` | yes | Per-device layout {all,laptop,tablet,mobile}; grid vs carousel. |
| `slidesToShow` | number |  | per breakpoint; default `3` | yes | Per-device column count / cards per row {all,laptop,tablet,mobile} (drives grid columns, NOT a `columns` field). |
| `slidesToScroll` | number |  | per breakpoint; default `1` | yes | Per-device slideshow items advanced per scroll {all,laptop,tablet,mobile}. |
| `spacing` | string |  | per breakpoint; default `30px` | yes | Per-device gap between cards {all,laptop,tablet,mobile}. This is the ONLY channel - shares `StyledSlideshow` (web/core/src/shared/ui/slideshow/styles.tsx) with ContentList2, which has no `gap` CSS property anywhere; spacing is a padding-var applied per slide, render-probe verified on the shared base, not inferred (BACKLOG.md BG). |
| `fillLastRow` | boolean |  | per breakpoint; default `false` | yes | Per-device: stretch the last grid row {all,laptop,tablet,mobile}. |
| `align` | enum | `lt`, `ct`, `rt` | default `lt` | yes | Card alignment class suffix. |
| `navStyle` | enum | `none`, `nav-style-1`, `nav-style-2`, `nav-style-3`, `nav-style-4`, `nav-style-5` | only when listLayout === "slideshow"; default `nav-style-1` | yes | Slideshow navigation style. |
| `paginationStyle` | enum | `none`, `pagination-style-1`, `pagination-style-2`, `pagination-style-3` | only when listLayout === "slideshow"; default `pagination-style-1` | yes | Slideshow pagination style. |

**Styleable parts (3)**

- **main** `&` - spacing, background, border, effects (Outer article list. Style the card on the ArticleBox node (its `&`), not here.)
- **slider arrows** `& .pf-slider-prev, & .pf-slider-next` - background, border, color, size (Prev/next carousel arrows (shared slideshow nav). Only when listLayout is slideshow.)
- **slider nav dots** `& .pf-slider-nav button` - background, border, color (Pagination dots/buttons (shared slideshow nav).)

**Contains (1)**

- `ArticleBox` (collection, x1) - the card template repeated for every article; editing it changes every card.

**Placement rules**

- Any grid or slideshow of blog posts is ArticleList2 — on a blog/article page AND in a "Latest from our blog" block on a home, landing or product page. ContentList2 is the wrong wrapper for posts: it gives its children no article context. Nest EXACTLY ONE `ArticleBox` card template — the renderer repeats that one card across every post, so never hand-build N ArticleBoxes.
- Card recipe, in order: ArticleTitle → optional ArticleMeta (author / publish date) → optional ArticleContent (the excerpt). Place ArticleList2 as a DIRECT child of FlexSection, never inside an ArticleBox.
- There is NO dynamic article-image element (no Article counterpart to ProductMedia3). A card thumbnail can only be one `Image5`, which renders the SAME static picture on every post — add it only when the brief clearly wants a thumbnail, and prefer a text-only card otherwise.
- Defaults to a grid. For "slideshow"/"carousel"/"slider" set `listLayout:"slideshow"` as a TOP-LEVEL field on the block. Set `data.slidesToShow` = cards per row (2-4).

## ArticleMeta

Dynamic article metadata text such as author and publish date.

- kind: leaf
- copy: no directly editable text
- resizable: true

**Fields (7, 2 not AI-editable)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `source` | enum | `auto`, `custom` | default `auto` | no | Article source. Use auto inside ArticleBox; custom for a picked article. |
| `articleId` | string |  | only when source === "custom"; default empty | no | Specific article ID when source is custom. |
| `text` | string |  | default `Visibility date by Author` | yes | Metadata template using Author and Visibility date tokens. |
| `dateFormat` | enum | `MMM dd, yyyy`, `dd/MM/yyyy`, `MM/dd/yyyy`, `yyyy/MM/dd`, `E dd/MM/yyyy`, `E dd/MM/yy`, `dd MMMM, yyyy` | default `MMM dd, yyyy` | yes | Publish date display format. |
| `showTime` | boolean |  | default `false` | yes | Include publish time in metadata. |
| `timeFormat` | string |  | only when showTime === true; default `true` | yes | Time format token (e.g. 12/24h). |
| `showTimeZone` | boolean |  | only when showTime === true; default `false` | yes | Include store timezone in metadata. |

**Styleable parts (2)**

- **main** `&` - typography, spacing, background, border, effects
- **syntax tags** `& .syntax-tag` - typography, spacing; written to page custom CSS (Editor token spans for author/date placeholders.)

## ArticleTitle

Dynamic article title. Place inside an ArticleBox for inherited article context.

- kind: leaf
- copy: no directly editable text
- resizable: true

**Fields (4, 2 not AI-editable)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `source` | enum | `auto`, `custom` | default `auto` | no | Article source. Use auto inside ArticleBox; custom for a picked article. |
| `articleId` | string |  | only when source === "custom"; default empty | no | Specific article ID when source is custom. |
| `tag` | enum | `h1`, `h2`, `h3`, `h4`, `h5`, `h6` | default `h3` | yes | HTML heading tag for article title. |
| `linkToArticle` | boolean |  | default `false` | yes | Wrap title in a link to the article page. |

**Styleable parts (3)**

- **main** `&` - typography, spacing, background, border, effects
- **link** `& a` - typography, effects; written to page custom CSS (Only exists when linkToArticle is true.)
- **link hover** `& a:hover` - typography, effects; written to page custom CSS (Only exists when linkToArticle is true.)

## Button2

Call-to-action button; label is supplied through content.value. For an icon/arrow, nest ONE Icon2 child (its content.icon is the FontAwesome name, e.g. "arrow-right") and set data.showIcon:true plus data.iconPos. The nested Icon2 is a real node with its own id — style it directly. No child = plain text button.

- kind: unit
- copy: `value` on this element
- resizable: true
- accepts a click destination

**Fields (6)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `animationHover` | enum | `float`, `shadow`, `grow`, `glow`, `float-shadow`, `grow-shadow` |  | yes | Canned hover motion. Use instead of a hand-written hover rule. |
| `buttonType` | enum | `text`, `icon`, `iconWithText` | default `iconWithText` | yes | What the button renders: text only, icon only, or icon + text. |
| `showIcon` | boolean |  | default `false` | yes | Render the icon (requires buttonType icon\|iconWithText). |
| `iconPos` | enum | `left`, `right`, `top` | only when buttonType === "iconWithText"; default `left` | yes | Icon position relative to the label. |
| `btnStyle` | string |  | default `plain` | yes | Button style preset (e.g. plain, primary, outline). |
| `clickAction` | enum | `(unset)`, `url`, `popup`, `section`, `email`, `phone` | default empty | yes | Button click behavior. |

**Styleable parts (4)**

- **root** `&` - typography, spacing, background, border, color, transform
- **hover** `&:hover` - background, border, color, transform
- **text** `& span` - typography, color
- **icon** `& .pfa, & .pfaV4, & svg` - typography, color, spacing

**Contains (2)**

- `Icon` (config, shown by `showIcon`, x1) - also requires buttonType `icon` or `iconWithText`.
- `Icon2` (config, shown by `showIcon`, x1) - alternative icon generation; same governor. also requires buttonType `icon` or `iconWithText`.

**Placement rules**

- A text button is `content.value`, no children. For an icon/arrow button, nest ONE `Icon2` child (its `content.icon` = FontAwesome name, e.g. `arrow-right`) and set `data.showIcon:true` + `data.iconPos` ("left"|"right"). The Icon2 is a real node you can style.
- A bare text link such as "View all →" / "See more →" is a Button2 too — set `data.btnStyle:"plain"` and, for the arrow, nest the Icon2 as above (`content.icon:"arrow-right"`, `data.iconPos:"right"`). Never model a text link as Custom.HTML.

## CollectionBox

Collection context container; nest collection children inside it.

- kind: open
- copy: no directly editable text
- resizable: true

**Fields (2, 2 not AI-editable)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `source` | enum | `auto`, `custom` | default `auto` | no | Collection source. Use auto on collection pages; use custom only with collectionId. |
| `collectionId` | string |  | only when source === "custom" | no | Selected Shopify collection ID when source is custom. |

**Styleable parts (1)**

- **main** `&` - background, spacing, border, layout; owns flex layout (gap, justify, align, direction) (Container box styles for the collection scope.)

## CollectionDescription

Dynamic collection description bound to the nearest collection context.

- kind: leaf
- copy: no directly editable text
- resizable: true

**Fields (8, 2 not AI-editable)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `source` | enum | `auto`, `custom` | default `auto` | no | Collection source. Use auto for current collection; use custom only with collectionId. |
| `collectionId` | string |  | only when source === "custom" | no | Selected Shopify collection ID when source is custom. |
| `tag` | enum | `p`, `div` | default `p` | yes | Wrapper tag for the description text. |
| `length` | number |  | only when compact === true; default `30` | yes | Truncation length (words) when compact is on. |
| `compact` | boolean |  | default `false` | yes | Truncate long description with a read-more toggle. |
| `showButton` | boolean |  | only when compact === true; default `true` | yes | Show the read-more/less toggle. |
| `more` | string |  | only when compact === true | yes | Read-more label text. |
| `less` | string |  | only when compact === true | yes | Read-less label text. |

**Styleable parts (1)**

- **main** `&` - typography, spacing, color (Root rich text wrapper.)

## CollectionListing2

Grid or slideshow of whole store collections.

- kind: unit
- copy: no directly editable text
- resizable: true

**Fields (12, 2 not AI-editable)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `source` | enum | `all`, `custom` | default `all` | no | Collection source: all store collections, or a hand-picked custom set. |
| `collectionIds` | string |  | only when source === "custom" | no | Selected Shopify collection ID(s) when source is custom. |
| `limit` | number |  | default `4` | yes | Maximum collections to render. |
| `hideCurrentProduct` | boolean |  | default `false` | yes | Legacy seed setting; leave false for collection index sections. |
| `listLayout` | enum | `grid`, `slideshow` | per breakpoint; default `slideshow` | yes | Per-device layout {all,laptop,tablet,mobile}; grid vs carousel. |
| `slidesToShow` | number |  | per breakpoint; default `3` | yes | Per-device column count / items per row {all,laptop,tablet,mobile} (this drives grid columns, NOT a `columns` field). |
| `slidesToScroll` | number |  | per breakpoint; default `1` | yes | Per-device slideshow items advanced per scroll {all,laptop,tablet,mobile}. |
| `spacing` | string |  | per breakpoint; default `30px` | yes | Per-device gap between items {all,laptop,tablet,mobile}. This is the ONLY channel - shares `StyledSlideshow` (web/core/src/shared/ui/slideshow/styles.tsx) with ContentList2, which has no `gap` CSS property anywhere; spacing is a padding-var applied per slide, render-probe verified on the shared base, not inferred (BACKLOG.md BG). |
| `fillLastRow` | boolean |  | per breakpoint; default `false` | yes | Per-device: stretch the last grid row to full width {all,laptop,tablet,mobile}. |
| `align` | enum | `lt`, `ct`, `rt`, `lm`, `cm`, `rm`, `lb`, `cb`, `rb` | default `lt` | yes | Item alignment class suffix. |
| `navStyle` | enum | `none`, `nav-style-1`, `nav-style-2`, `nav-style-3`, `nav-style-4`, `nav-style-5` | only when listLayout === "slideshow"; default `nav-style-1` | yes | Slideshow navigation style. |
| `paginationStyle` | enum | `none`, `pagination-style-1`, `pagination-style-2`, `pagination-style-3` | only when listLayout === "slideshow"; default `pagination-style-1` | yes | Slideshow pagination style. |

**Styleable parts (3)**

- **main** `&` - spacing (Root collection listing. Style the card on the CollectionBox node (its `&`), not here.)
- **slider arrows** `& .pf-slider-prev, & .pf-slider-next` - background, border, color, size (Prev/next carousel arrows (shared slideshow nav). Only when listLayout is slideshow.)
- **slider nav dots** `& .pf-slider-nav button` - background, border, color (Pagination dots/buttons (shared slideshow nav).)

**Placement rules**

- Grid/slider of the store's REAL collections, rendered dynamically — each card is one whole collection (its live image + title), NOT a product. Use ONLY to auto-list collections the merchant actually has set up. For "the products IN this collection" use `ProductList2` with `source:auto` instead.
- Nest EXACTLY ONE `CollectionBox` card template (e.g. CollectionImage4 + CollectionTitle); the renderer repeats that one card across every collection. Set `data.slidesToShow` = cards per row (2-4).
- NOT for a hand-picked "shop by category" / lookbook grid of image cards with your OWN labels + links (a VISUAL grid — the store may have no matching collections, so this element renders blank). Build that as a STATIC `ContentList2` grid of `FlexBlock` cards (`Image5` + a `Heading2` label; `Image5` `data.clickAction:"url"` carries the link). Plain `Image5` renders on any page and gets a real photo filled in — never fake a collection card with `Custom.HTML`.

## CollectionTitle

Dynamic collection title bound to the nearest collection context.

- kind: leaf
- copy: no directly editable text
- resizable: true

**Fields (4, 2 not AI-editable)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `source` | enum | `auto`, `custom` | default `auto` | no | Collection source. Use auto for current collection; use custom only with collectionId. |
| `collectionId` | string |  | only when source === "custom" | no | Selected Shopify collection ID when source is custom. |
| `tag` | enum | `h1`, `h2`, `h3`, `h4`, `h5`, `h6` | default `h3` | yes | Heading level for the title. |
| `linkToCollection` | boolean |  | default `false` | yes | Wrap the title in a link to the collection page. |

**Styleable parts (1)**

- **main** `&` - typography, spacing, color (Root text element.)

## CompactButton

Small icon-style button used inside compact controls.

- kind: leaf
- copy: no directly editable text

**Fields (7)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `iconPos` | enum | `left`, `right` | default `left` | yes | Which side of the label the icon sits on. |
| `iconSize` | number |  | default `16` | yes | Expand/collapse icon height in px. |
| `buttonType` | enum | `text`, `icon`, `iconWithText` | default `text` | yes | What the button renders: text only, icon only, or icon + text. |
| `expandText` | string |  | default `View more` | yes | Label shown while the content is collapsed. |
| `collapseText` | string |  | default `View less` | yes | Label shown while the content is expanded. |
| `expandIcon` | string |  | default `angle-down` | yes | FontAwesome glyph shown next to the expand label. Only rendered when `buttonType` is `icon` or `iconWithText`. A directional icon (angle/chevron down) reads best. |
| `collapseIcon` | string |  | default `angle-up` | yes | FontAwesome glyph shown next to the collapse label. Only rendered when `buttonType` is `icon` or `iconWithText`. A directional icon (angle/chevron up) reads best. |

**Styleable parts (1)**

- **root** `&` - typography, color, background, spacing, border

## ContentList2

Repeating card grid or slideshow for feature cards, testimonials, galleries, and icon/text rows.

- kind: unit
- copy: no directly editable text
- resizable: true

**Fields (11)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `listLayout` | enum | `grid`, `slideshow` | per breakpoint | yes | Per-device layout. Default { all:grid, laptop:grid, tablet:grid, mobile:grid }. |
| `slidesToShow` | number |  | per breakpoint | yes | Per-device visible columns/items. Default { all:3, laptop:3, tablet:3, mobile:1 }. |
| `slidesToScroll` | number |  | per breakpoint | yes | Per-device items advanced per carousel navigation. Default { all:3, laptop:3, tablet:3, mobile:1 }. |
| `spacing` | string |  | per breakpoint | yes | Per-device gap between repeated items. Default slideshow spacing { all:30px, laptop:30px, tablet:30px, mobile:16px }. This is the ONLY channel: the item wrapper (`StyledSlideshow`, web/core/src/shared/ui/slideshow/styles.tsx) has no `gap` CSS property anywhere, in any listLayout mode - spacing is a padding-var applied to each `.pf-slide` (`&[style*="--s-xs"] > .pf-slider > .pf-slide { padding: var(--s-xs) }`), driven entirely by this setting. A CSS `gap` write is a guaranteed no-op here, render-probe verified, not inferred (BACKLOG.md BG). |
| `displayPartialItems` | boolean |  | per breakpoint; only when listLayout device value is slide | yes | Per-device partial-slide visibility. Default false on all devices. |
| `maxHeight` | boolean |  | default `true` | yes | Equal-height slideshow/card behavior. |
| `navStyle` | enum | `none`, `nav-style-1`, `nav-style-2`, `nav-style-3`, `nav-style-4`, `nav-style-5` | default `none` | yes | Carousel arrow style. |
| `paginationStyle` | enum | `none`, `pagination-style-1`, `pagination-style-2`, `pagination-style-3` | default `none` | yes | Carousel pagination style. |
| `fillLastRow` | boolean |  | per breakpoint | yes | Per-device fill-last-row flag. Default false on all devices. |
| `stretch` | boolean |  | default `true` | yes | Stretch repeated item height. |
| `align` | enum | `lt`, `ct`, `rt`, `lm`, `cm`, `rm`, `lb`, `cb`, `rb` | default `ct` | yes | Item alignment. |

**Styleable parts (5)**

- **root** `&` - spacing, background, border, effects (Style the card on the FlexBlock/Image5 node (its `&`), not here.)
- **alignment wrapper** `& [class*="pf-c-"]` - layout; owns flex layout (gap, justify, align, direction) (Native list wrapper. Never set `display`/`grid-template-*` here (esp. `display:contents`) — it collapses the native grid. Columns come from `data.slidesToShow`.)
- **equal-height wrapper** `& .pf-r-eh` - layout; owns flex layout (gap, justify, align, direction) (Native equal-height row. Never set `display`/`grid-template-*` here (esp. `display:contents`) — it flattens the row and cards stack 1-per-row.)
- **slider arrows** `& .pf-slider-prev, & .pf-slider-next` - background, border, color, size (Prev/next carousel arrows (shared slideshow nav). Only when listLayout is slide + navStyle set.)
- **slider nav dots** `& .pf-slider-nav button` - background, border, color (Pagination dots/buttons (shared slideshow nav).)

**Contains (1)**

- `ContentListItem` (collection, x1..n) - one card per repeated entry; each holds its own free content.

**Placement rules**

- STATIC content cards only — pick this when ONE card holds only Image5/Heading2/Paragraph4/Icon2. The moment a card shows a product's title or price, it is a PRODUCT card: use `ProductList2` with ONE ProductBox template instead (its renderer repeats that card across every product). A custom button label, a tags line, or a "Sale" badge does NOT keep it here — that judgement is about whether a Product* element is present, nothing else. Product* elements placed inside a ContentList2 FlexBlock have no product context and render "Please select a product" on every card.
- Blog posts are the same story: a card carrying an article title, date/author line or excerpt is an ARTICLE card — use `ArticleList2` with ONE ArticleBox template, on a blog/article page and on a "Latest from our blog" block anywhere else alike. Article* elements inside a ContentList2 have no article context, so pairing an ArticleBox with ContentList2 loses the post binding.
- Slot/repeater — nest one child per card: one `FlexBlock` per card (Heading2 + Paragraph4 + optional Image5/Icon2), OR one `Image5` per cell for a photo grid. A "grid of photos" is ContentList2 (one Image5 per card), NOT Slideshow.
- Defaults to a grid. Set `data.slidesToShow` = columns per row.
- Columns and grid-vs-slider are DATA (`data.slidesToShow`, `listLayout`), rendered natively — never hand-roll a CSS grid in the style phase (`display:grid`/`grid-template-columns` on `&`, or `display:contents` on the `.pf-r-eh` / `pf-c-` wrappers). That overrides the native grid and collapses every card to one per row.

## ContentListItem

One repeated item of a Content List; may share styling with siblings via a room.

- kind: open
- copy: no directly editable text
- resizable: true
- accepts a click destination

**Fields (1)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `animationHover` | enum | `float`, `shadow`, `grow`, `glow`, `float-shadow`, `grow-shadow` |  | yes | Canned hover motion. Use instead of a hand-written hover rule. |

**Styleable parts (1)**

- **root** `&` - typography, color, background, spacing, border

## CountDown

Countdown timer widget with labels and optional redirect.

- kind: unit
- copy: no directly editable text

**Fields (14)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `countdownType` | enum | `specific`, `first`, `every` | default `specific` | yes | Start mode: specific time, or first/every visit. |
| `startTime` | string |  |  | yes | ISO start time for specific countdowns. |
| `repeat` | enum | `never`, `hour`, `day`, `week`, `month` | default `never` | yes | Restart cadence after elapsed. |
| `endType` | enum | `specific`, `period` | default `period` | yes | End by specific endTime or duration period. |
| `endTime` | string |  |  | yes | ISO end time when endType is specific. |
| `endPeriod` | number |  | default `0` | yes | Duration in seconds when endType is period. |
| `redirectUrl` | string |  |  | yes | Object { on, url, linkTarget? }; redirects when countdown ends. |
| `hideIfInactive` | boolean |  | default `false` | yes | Hide timer when inactive/ended. |
| `styleCountDown` | enum | `basic` | default `basic` | yes | Countdown visual style. |
| `showColon` | boolean |  | default `true` | yes | Show colon separators. |
| `label` | string |  |  | yes | Object { on, reverse }; controls label visibility and position. |
| `timeData` | string |  |  | yes | Object w/d/h/m/s each { on, text }; controls visible units and labels. |
| `targetStyle` | string |  | default `CountDown` | yes | Internal style target. |
| `fullWidth` | boolean |  |  | yes | Use block width layout when present. |

**Styleable parts (1)**

- **root** `&` - size, spacing, background, border

**Contains (2)**

- `CountdownNumber` (slot, xn) - one per time unit shown.
- `CountdownLabel` (slot, xn) - one per time unit; shown by the parent `label.on` sub-field, which is not writable here.

## CountdownLabel

Unit label (days, hours) under a countdown number.

- kind: leaf
- copy: no directly editable text

_No configurable fields. Styling and copy only._

**Styleable parts (1)**

- **root** `&` - typography, color, background, spacing, border

## CountdownNumber

Numeric segment of a countdown timer.

- kind: leaf
- copy: no directly editable text

_No configurable fields. Styling and copy only._

**Styleable parts (1)**

- **root** `&` - typography, color, background, spacing, border

## Custom.HTML

Raw HTML or Liquid block; use only when standard elements cannot model the markup.

- kind: leaf
- copy: no directly editable text

**Fields (1)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `code` | string |  | default empty | yes | Raw HTML/Liquid markup to render (element data key is "code"). |

**Styleable parts (1)**

- **root** `&` - spacing, background, border, typography

**Placement rules**

- Last resort — only when NO standard element fits. Map common asks to their native element first: product image (with NEW/SALE badge) → ProductMedia3 (data.showBadge); product category/brand line → ProductVendor; product title → ProductTitle; price → ProductPrice2; "View all →" / "See more →" text link → Button2; star rating / badge text → Paragraph4; bullet list → List2; data table → Table2. Reach here ONLY for a layout none can model — e.g. an editorial media mosaic or a bespoke spec block.
- Express ONE self-contained widget in plain-English `content.intent` — never a whole section, and never describe sibling elements that already exist as their own nodes. A code phase authors + validates the fragment; one that fails is dropped.

## Divider2

Visual separator / horizontal rule between sections or content blocks.

- kind: unit
- copy: no directly editable text
- resizable: true

**Fields (4)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `dividerType` | enum | `plain`, `icon`, `text`, `symbol` | default `plain` | yes | Plain rule, or a rule broken by a centered icon/text/symbol. |
| `symbol` | number |  | only when dividerType === "symbol" || dividerType === "icon"; default `1` | yes | Symbol/icon identifier shown in the divider. |
| `symbolColor` | string |  | only when dividerType !== "default"; default `rgb(145, 157, 169)` | yes | Colour of the divider symbol/icon. |
| `contentPos` | enum | `left`, `center`, `right` | only when dividerType !== "default"; default `center` | yes | Position of the icon/text/symbol along the rule. |

**Styleable parts (1)**

- **main** `&` - border, color, spacing, size (line thickness/colour via border; width/margin for length + spacing.)

**Contains (5)**

- `DividerIcon2` (config, shown by `dividerType`, x1) - shown when dividerType is `icon`.
- `DividerIcon` (config, shown by `dividerType`, x1) - older icon generation; shown when dividerType is `icon`.
- `DividerText` (config, shown by `dividerType`, x1) - shown when dividerType is `text`; carries the divider copy.
- `DividerSymbol2` (config, shown by `dividerType`, x1) - shown when dividerType is `symbol`.
- `DividerSymbol` (config, shown by `dividerType`, x1) - older symbol generation; shown when dividerType is `symbol`.

## DividerIcon

Icon rendered inside a legacy divider.

- kind: leaf
- copy: no directly editable text
- resizable: true

_No configurable fields. Styling and copy only._

**Styleable parts (1)**

- **root** `&` - typography, color, background, spacing, border

## DividerIcon2

Icon rendered inside a Divider2.

- kind: leaf
- copy: no directly editable text

_No configurable fields. Styling and copy only._

**Styleable parts (1)**

- **root** `&` - typography, color, background, spacing, border

## DividerSymbol

Decorative symbol shown at the centre of a divider.

- kind: unit
- copy: no directly editable text
- resizable: true

_No configurable fields. Styling and copy only._

**Styleable parts (1)**

- **root** `&` - color, typography, spacing (symbol size follows font-size; colour follows color.)

## DividerSymbol2

Decorative symbol shown in the middle of a divider.

- kind: leaf
- copy: no directly editable text

**Fields (2)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `symbol` | number |  | default `1` | yes | Which symbol from the built-in set to show. |
| `symbolSize` | string |  | per breakpoint; default `40px` | yes | Symbol size per breakpoint. |

**Styleable parts (1)**

- **root** `&` - typography, color, background, spacing, border

## DividerText

The label rendered inside a text divider.

- kind: leaf
- copy: `value` on this element

_No configurable fields. Styling and copy only._

**Styleable parts (1)**

- **root** `&` - typography, color, background, spacing, border

## Dropcap

Decorative leading character of a paragraph, styled independently from the body copy.

- kind: leaf
- copy: `value` on this element

_No configurable fields. Styling and copy only._

**Styleable parts (1)**

- **root** `&` - typography, color, background, spacing, border

## DropdownButton

Collapsed-navigation control for a Tabs3 header.

- kind: leaf
- copy: no directly editable text

_No configurable fields. Styling and copy only._

**Styleable parts (1)**

- **root** `&` - typography, color, background, spacing, border

## FBLikeButton2

Facebook Like button iframe.

- kind: unit
- copy: no directly editable text

**Fields (9)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `AppID` | string |  | default empty | yes | Facebook app ID. |
| `href` | string |  |  | yes | URL to like/share. |
| `layout` | enum | `standard`, `button`, `button_count`, `box_count` | default `button_count` | yes | Facebook layout. |
| `action` | enum | `like`, `recommend` | default `like` | yes | Button action. |
| `size` | enum | `small`, `large` | default `large` | yes | Button size. |
| `share` | boolean |  | default `true` | yes | Show share button. |
| `showFaces` | boolean |  | default `true` | yes | Show facepile for standard layout. |
| `width` | number |  |  | yes | Saved width field; iframe renders width 100%. |
| `loading` | enum | `lazy`, `standard` |  | yes | Iframe loading mode. |

**Styleable parts (1)**

- **root** `&` - size, spacing, background, border

## FBPageBox2

Facebook Page plugin iframe.

- kind: unit
- copy: no directly editable text

**Fields (11)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `AppID` | string |  | default empty | yes | Facebook app ID. |
| `href` | string |  | default `https://www.facebook.com/pageflyapp` | yes | Facebook page URL. |
| `tabs1` | boolean |  | default `true` | yes | Show timeline tab. |
| `tabs2` | boolean |  | default `false` | yes | Show events tab. |
| `tabs3` | boolean |  | default `false` | yes | Show messages tab. |
| `small_header` | boolean |  | default `false` | yes | Use small header. |
| `adapt_container_width` | boolean |  | default `true` | yes | Fit container width. |
| `hide_cover` | boolean |  | default `false` | yes | Hide cover photo. |
| `show_facepile` | boolean |  | default `true` | yes | Show friend facepile. |
| `width` | number |  | default `340` | yes | Plugin width. |
| `height` | number |  | default `500` | yes | Plugin height. |

**Styleable parts (1)**

- **root** `&` - size, spacing, background, border

## FlexBlock

Generic flex container — groups children into horizontal columns, vertical stacks, or wrapped layouts.

- kind: open
- copy: no directly editable text
- resizable: true

**Fields (8)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `bgType` | enum | `standard`, `video`, `parallax` | default `standard` | yes | Legacy background mode; style phase owns actual background rendering. |
| `clickAction` | enum | `(unset)`, `url`, `popup`, `section`, `email`, `phone` |  | yes | Optional click behavior for the whole block. |
| `href` | string |  | default empty | yes | URL used when clickAction is url. |
| `linkTarget` | enum | `_self`, `_blank` | default `_self` | yes | Link target for URL actions. |
| `section` | string |  | default empty | yes | Target section id for section scroll action. |
| `mailTo` | string |  | default empty | yes | Email address for email action. |
| `phone` | string |  | default empty | yes | Phone number for phone action. |
| `popupContent` | enum | `element`, `youtube`, `vimeo`, `video`, `shopify`, `image` | default `youtube` | yes | Popup content source. |

**Styleable parts (1)**

- **main** `&` - spacing, background, border, layout, visibility, transform; owns flex layout (gap, justify, align, direction) (Main element is also the flex container; composer owns flex layout vars here.)

## FlexSection

Section root — background + outer padding on the main element, flex layout on the inner container.

- kind: open
- copy: no directly editable text
- resizable: true

**Fields (16)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `container` | boolean |  | default `true` | yes | Constrain section content to container width. |
| `containerWidth` | number |  | default `1170` | yes | Section container max width in pixels. |
| `parallax` | boolean |  | default `false` | yes | Legacy parallax toggle. |
| `parallaxBg` | string |  | default empty | yes | Parallax background image URL. |
| `parallaxSpeed` | number |  | default `4` | yes | Parallax scroll speed. |
| `parallaxRev` | boolean |  | default `false` | yes | Reverse parallax direction. |
| `src` | string |  | default empty | yes | Legacy background image URL. |
| `videoBg` | string |  | default empty | yes | Background video URL. |
| `bgType` | enum | `standard`, `video`, `parallax` | default `standard` | yes | Background rendering mode. |
| `sectionName` | string |  | default empty | yes | Merchant-facing section label. |
| `filterColor` | string |  | default `rgba(0,0,0,0)` | yes | Overlay color for image/video/parallax backgrounds. |
| `backgroundVideoLoading` | enum | `lazy`, `standard` | default `lazy` | yes | Background video loading strategy. |
| `backgroundImageLoading` | enum | `lazy`, `preload`, `standard` |  | yes | Background image loading strategy. |
| `isStickyBar` | boolean |  | default `false` | yes | Pin section as sticky bar in view mode. |
| `stickyPosition` | enum | `top`, `bottom` | default `bottom` | yes | Sticky bar viewport edge. |
| `triggerSectionId` | string |  | default empty | yes | Optional section id that reveals sticky bar after scroll past it. |

**Styleable parts (2)**

- **main** `&` - background, spacing, border, transform (Full-bleed wrapper: background/padding/border only. No max-width/margin here (breaks full-bleed) — those go on the flex container below.)
- **flex container** `& > .pf-flex-section` - max-width, layout; owns flex layout (gap, justify, align, direction) (Content-width layer. Centering built in — set max-width here to constrain content (no margin needed). Composer owns flex vars.)

## Form2

Shopify data form (contact / customer signup) — owns form type, tags, and submit/confirm behaviour.

- kind: open
- copy: no directly editable text
- resizable: true

**Fields (7)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `formType` | enum | `customer`, `contact`, `new_comment` | default `customer` | yes | Shopify form endpoint: customer (account/newsletter), contact, or new_comment (blog article comment). |
| `tags` | string |  | default empty | yes | Comma-separated tags applied to the created customer/contact. |
| `showConfirm` | boolean |  | default `true` | yes | Show a confirmation message after a successful submit. |
| `successMessage` | string |  | only when showConfirm === true; default `Thank you for your submissions!` | yes | Message shown on successful submit. |
| `errorMessage` | string |  | default `Sorry, the submission can not be sent! Please try again later!` | yes | Message shown on a failed submit. |
| `noteMessage` | string |  | default `Please note, comments must be approved before they are published.` | yes | Helper note shown under the form (contact forms). |
| `redirect` | string |  |  | yes | Object { on:boolean, url:string, delay:number } — redirect after submit. |

**Styleable parts (4)**

- **root** `&` - spacing, background, border (Wrapper: background/padding/border only. The fields are laid out by the form below.)
- **form** `& > form` - layout; owns flex layout (gap, justify, align, direction) (Flex container. Layout properties go here; on & they are valid CSS that changes nothing.)
- **field input** `& input` - background, border, color, typography (The rendered field <input>s (email / text). Style border/background/focus color here.)
- **submit button** `& button` - background, border, color (The submit <button>. Unstyled by default — set background-color to the section accent so it is not a bare native button.)

**Contains (2)**

- `Form2.Field` (collection, x1..n) - one per input the form collects.
- `Form2.Button2` (slot, x1) - the submit button.

## Form2.Button2

Submit button of a Form2; label copy lives on the element.

- kind: unit
- copy: `value` on this element
- resizable: true

**Fields (3)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `buttonType` | enum | `text`, `icon`, `iconWithText` | default `text` | yes | What the button renders: text only, icon only, or icon + text. |
| `showIcon` | boolean |  | default `false` | yes | Render the icon child before the label. |
| `animationHover` | enum | `float`, `shadow`, `grow`, `glow`, `float-shadow`, `grow-shadow` |  | yes | Canned hover motion. Use instead of a hand-written hover rule. |

**Styleable parts (2)**

- **root** `&` - typography, color, background, spacing, border
- **hover state** `&:hover` - color, background, border, transform

**Contains (2)**

- `Icon2` (config, shown by `showIcon`, x1) - also requires buttonType `icon` or `iconWithText`.
- `Icon` (config, shown by `showIcon`, x1) - alternative icon generation; same governor. also requires buttonType `icon` or `iconWithText`.

## Form2.Field

One field wrapper in a Form2, grouping label and input.

- kind: unit
- copy: no directly editable text
- resizable: true

**Fields (2)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `label` | string |  |  | yes | The visible label copy for this element. |
| `required` | boolean |  | default `false` | yes | Make this field mandatory before the form can be submitted. |

**Styleable parts (1)**

- **root** `&` - typography, color, background, spacing, border

**Contains (2)**

- `FormLabel` (slot, x1) - always present; shown by the parent `label.on` sub-field, which is not writable here.
- `FormInput` (slot, x1)

## FormInput

The input control inside a form field.

- kind: leaf
- copy: no directly editable text
- **cannot be styled on its own** - its look is set on the parent `Form2`

**Fields (2)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `required` | boolean |  | default `false` | yes | Make this field mandatory before the form can be submitted. |
| `inputType` | number |  | default `0` | yes | The kind of input control this field renders: 0 single-line text, 1 multi-line text, 2 email, 3 single choice (radio), 4 checkbox, 5 dropdown, 6 number, 7 date, 8 time (FIELD_TYPES, web/core/src/elements/shopify/form/defines.tsx). Writing 3 or 5 without also writing `choices` leaves the field with no options; writing 4 without `checkboxLabel` leaves it unlabeled. |

**Styleable parts (1)**

- **root** `&` - typography, color, background, spacing, border

## FormLabel

Label text for one Form2 field.

- kind: unit
- copy: no directly editable text

_No configurable fields. Styling and copy only._

**Styleable parts (1)**

- **root** `&` - typography, color, background, spacing, border

## GMapBasicV2

Google Maps basic iframe embed.

- kind: unit
- copy: no directly editable text
- resizable: true

**Fields (5)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `location` | string |  | default `NewYork` | yes | Map query/location string. |
| `zoom` | number |  | default `14` | yes | Map zoom level. |
| `mapType` | enum | `m`, `k` | default `m` | yes | Google map type parameter. |
| `height` | number |  | default `450` | yes | Iframe height in pixels. |
| `loading` | enum | `lazy`, `standard` | default `lazy` | yes | Iframe loading mode. |

**Styleable parts (1)**

- **root** `&` - size, spacing, background, border

## HTML.Video3

Self-hosted HTML5 video (MP4 URL); play/loop/mute/controls behaviour.

- kind: unit
- copy: no directly editable text
- resizable: true

**Fields (7)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `src` | string |  | default empty | yes | Video file URL (MP4/WebM). |
| `placeholder` | string |  | default empty | yes | Poster image URL shown before playback. |
| `autoplay` | boolean |  | default `false` | yes | Start playing automatically (muted is required by most browsers). |
| `loop` | boolean |  | default `false` | yes | Restart the video when it ends. |
| `mute` | boolean |  | default `false` | yes | Mute audio (needed for reliable autoplay). |
| `controls` | boolean |  | default `false` | yes | Show the native playback controls. |
| `autoCustomize` | boolean |  | per breakpoint; default `false` | yes | Per-device autoplay/customize toggle {all,laptop,tablet,mobile}. |

**Styleable parts (1)**

- **root** `&` - size, spacing, border

## Heading2

Titles, headlines, and section headers; text content is supplied through content.value.

- kind: unit
- copy: `value` on this element
- resizable: true
- accepts a click destination

**Fields (5)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `tag` | enum | `h1`, `h2`, `h3`, `h4`, `h5`, `h6` | default `h3` | yes | Semantic heading level (SEO + default size). |
| `showIcon` | boolean |  | default `false` | yes | Render a leading icon before the heading text. |
| `iconPos` | enum | `left`, `right`, `top` | only when showIcon === true; default `left` | yes | Icon position relative to the text. |
| `iconVerticalAlign` | enum | `top`, `middle` | only when showIcon === true; default `middle` | yes | Vertical alignment of the icon against the text. |
| `clickAction` | enum | `(unset)`, `url`, `popup`, `section`, `email`, `phone` | default empty | yes | Optional click behavior for a linked heading. |

**Styleable parts (4)**

- **root** `&` - typography, spacing, color, transform
- **text** `& span` - typography, color
- **icon** `& i, & svg` - typography, color, spacing
- **link wrapper** `& a[data-link="inherit"]` - typography, color

**Contains (2)**

- `Icon` (config, shown by `showIcon`, x1)
- `Icon2` (config, shown by `showIcon`, x1) - alternative icon generation; same governor.

## Icon

Small symbolic glyph used for checkmarks, feature bullets, and social links.

- kind: leaf
- copy: no directly editable text
- resizable: true
- accepts a click destination

**Fields (1)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `icon` | string |  |  | yes | Icon name, e.g. `check`, `envelope`, `chevron-right`. Swap it to change the glyph. |

**Styleable parts (2)**

- **root** `&` - typography, color, background, spacing, border
- **hover state** `&:hover` - color, background, border, transform

## Icon2

Small symbolic icon for checkmarks, features, badges, and social glyphs.

- kind: leaf
- copy: no directly editable text
- accepts a click destination

**Fields (2)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `icon` | string |  | default `star` | yes | FontAwesome icon name (kebab-case). Pick from: truck, shield-halved, leaf, award, star, heart, gift, tags, bolt, gem, circle-check, check, clock, fire, crown, thumbs-up, rocket, wand-magic-sparkles, medal, handshake, globe, lock, shield, headset, arrows-rotate, box, boxes-stacked, cart-shopping, bag-shopping, money-bill, credit-card, percent, calendar, envelope, phone, location-dot, users, comment, quote-left, sun, seedling, recycle, wrench, gear, certificate, hand-holding-heart, earth-americas. Use the closest match to the feature. |
| `clickAction` | enum | `(unset)`, `url`, `email`, `phone`, `section`, `popup` | default empty | yes | Optional click behavior for the icon. |

**Styleable parts (1)**

- **root** `&` - typography, color, spacing, transform

**Placement rules**

- Rating rows / repeated icons: when several Icon2 form one rating or icon row (e.g. a 5-star rating on a testimonial card), wrap them together in ONE `horizontal` FlexBlock (`width:"hug"`) so the icons sit side by side. Emitting them as direct children of a `vertical` card stacks the stars top-to-bottom.

## Image5

Photos, illustrations, product shots, and decorative imagery; src/alt come from content.

- kind: leaf
- copy: no directly editable text
- resizable: true
- accepts a click destination

**Fields (9)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `src` | string |  |  | yes | Image URL. Point it at another asset to swap the picture. |
| `title` | string |  | default empty | yes | Image title tooltip shown on hover. |
| `loading` | enum | `lazy`, `eager` | default `lazy` | yes | Native image loading strategy (lazy below the fold, eager for hero). |
| `imgQuality` | enum | `auto`, `high`, `medium`, `low` | default `auto` | yes | Shopify CDN image quality / srcset tier. |
| `clickAction` | enum | `(unset)`, `url`, `popup`, `lightbox`, `section`, `email`, `phone` | default empty | yes | Optional click behavior for linked images. |
| `linkTarget` | enum | `_self`, `_blank` | only when clickAction === "url"; default `_self` | yes | Whether the link opens in the same tab or a new tab. |
| `popupContent` | enum | `youtube`, `video`, `vimeo`, `shopify`, `image` | only when clickAction === "popup" | yes | Which media the popup shows: a YouTube video, an uploaded HTML video, a Vimeo video, store content, or an image. |
| `popupWidth` | string |  | only when clickAction === "popup"; default `854px` | yes | Popup width, a number with unit "px" (0-1500) or "%" (0-100), e.g. "854px" or "80%". |
| `popupHeight` | string |  | only when clickAction === "popup"; default `480px` | yes | Popup height, a number with unit "px" (0-1500) or "%" (0-100), e.g. "480px" or "60%". |

**Styleable parts (2)**

- **root** `&` - size, spacing, border, transform
- **img** `& img` - size, border, transform (The <img> element itself — target for object-fit/border-radius. The placeholder uses inline styles, no class.)

**Placement rules**

- The default choice for ANY image — hero shots, banners, and image-CARD grids (category tiles, "shop by category", lookbook cells). A real photo is filled from `content.alt`, so give a specific alt. Do NOT reach for `CollectionListing2`/`ProductList2`/`Custom.HTML` just to show pictures.
- A grid of image cards = a STATIC `ContentList2` (listLayout grid, `slidesToShow` = cards per row), one `FlexBlock` per card holding `Image5` + an optional `Heading2` label — each card DISTINCT (not one repeated template). A linked card sets `Image5` `data.clickAction:"url"`; the merchant fills the URL after insert.

## ImageComparison

Before/after image comparison slider for transformations, product results, renovations, and visual proof.

- kind: unit
- copy: no directly editable text
- resizable: true

**Fields (12)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `beforeImageUrl` | string |  | default empty | yes | Before image URL; image fill may populate it. |
| `beforeImageAlt` | string |  | default empty | yes | Before image alt text and image search query. |
| `beforeImageTitle` | string |  | default empty | yes | Before image title tooltip. |
| `afterImageUrl` | string |  | default empty | yes | After image URL; image fill may populate it. |
| `afterImageAlt` | string |  | default empty | yes | After image alt text and image search query. |
| `afterImageTitle` | string |  | default empty | yes | After image title tooltip. |
| `imgQuality` | enum | `auto`, `high`, `medium`, `low` | default `auto` | yes | Shopify CDN image quality / srcset tier. |
| `loading` | enum | `lazy`, `preload`, `standard` | default `lazy` | yes | Native image loading strategy. |
| `initialPosition` | number |  | default `50` | yes | Initial slider handle position, 0-100 percent. |
| `handleStyle` | enum | `circle`, `line`, `arrow` | default `circle` | yes | Visual style for draggable comparison handle. |
| `labelVisible` | boolean |  | default `true` | yes | Legacy label visibility flag. |
| `direction` | enum | `horizontal`, `vertical` | default `horizontal` | yes | Horizontal compares left/right; vertical compares top/bottom. |

**Styleable parts (6)**

- **root** `&` - size, spacing, border, effects
- **content** `& .pf-ba-content` - size, border, overflow
- **before image** `& .pf-ba-before img` - size, border, transform
- **after image** `& .pf-ba-after img` - size, border, transform
- **handle** `& .pf-ba-handle` - size, background, border, effects
- **handle circle** `& .pf-ba-handle-circle` - size, background, border, color

**Placement rules**

- Emit only ImageComparison for new section generation. Do not emit BeforeAfter or ImageComparison.* badge child types; those exist only for legacy/editor data.
- Set beforeImageAlt and afterImageAlt to descriptive search phrases; the image filler can resolve URLs when beforeImageUrl/afterImageUrl are blank.

## Insta3

Instagram media feed grid/slideshow.

- kind: unit
- copy: no directly editable text
- resizable: true

**Fields (13)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `token` | string |  |  | yes | Instagram access token/resource binding. |
| `limit` | number |  |  | yes | Maximum media items to render. |
| `hasAccess` | boolean |  |  | yes | Whether Instagram integration has access. |
| `imageHeight` | number |  | per breakpoint | yes | Per-device image height. Used when maxHeight is enabled. |
| `maxHeight` | boolean |  |  | yes | Equal image height flag. |
| `listLayout` | enum | `grid`, `slideshow` | per breakpoint | yes | Per-device layout. |
| `slidesToShow` | number |  | per breakpoint | yes | Per-device visible media count. |
| `slidesToScroll` | number |  | per breakpoint | yes | Per-device media advanced per navigation. |
| `spacing` | string |  | per breakpoint | yes | Per-device gap between media items. This is the ONLY channel - shares `StyledSlideshow` (web/core/src/shared/ui/slideshow/styles.tsx) with ContentList2, which has no `gap` CSS property anywhere; spacing is a padding-var applied per slide, render-probe verified on the shared base, not inferred (BACKLOG.md BG). |
| `displayPartialItems` | boolean |  | per breakpoint | yes | Per-device partial-slide visibility. |
| `navStyle` | enum | `none`, `nav-style-1`, `nav-style-2`, `nav-style-3`, `nav-style-4`, `nav-style-5` |  | yes | Carousel arrow style. |
| `paginationStyle` | enum | `none`, `pagination-style-1`, `pagination-style-2`, `pagination-style-3` |  | yes | Carousel pagination style. |
| `loading` | enum | `lazy`, `standard` |  | yes | Media loading mode. |

**Styleable parts (1)**

- **root** `&` - size, spacing, background, border

## List2

Bulleted/numbered list of short items (features, benefits). Item rows are supplied via content.items (string[]); marker style/position are CSS on the root, not data.

- kind: unit
- copy: no directly editable text
- resizable: true

**Fields (2)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `lineSpacing` | string |  | per breakpoint; default `10px` | yes | Per-device vertical gap between list items {all,laptop,tablet,mobile}. |
| `textIndent` | string |  | per breakpoint; default `0px` | yes | Per-device indent between marker and item text {all,laptop,tablet,mobile}. |

**Styleable parts (3)**

- **list container** `&` - typography, spacing, color
- **list item** `& > li` - typography, spacing, color
- **marker** `& > li::marker` - typography, color

**Contains (1)**

- `List2.Item2` (collection, x1..n) - one node per row.

**Placement rules**

- Rows go in `content:{ items:["…","…"] }` — one string per row. Do NOT hand-build `List2.Item2` children.

## List2.Item2

One item of a List2; carries its own copy and may link.

- kind: unit
- copy: `value` on this element
- accepts a click destination

**Fields (2)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `listIcon` | boolean |  | default `false` | yes | Render the bullet icon before this item. |
| `label` | string |  |  | yes | The visible label copy for this element. |

**Styleable parts (1)**

- **root** `&` - typography, color, background, spacing, border

**Contains (2)**

- `Icon` (config, shown by `listIcon`, x1)
- `Icon2` (config, shown by `listIcon`, x1) - alternative icon generation; same governor.

## MailChimpBox

Mailchimp newsletter signup form — email capture posting to a Mailchimp list action URL. For a generic Shopify-native newsletter use Form2 instead (this one ships a gray default button + generic placeholder that only the selectors below can restyle).

- kind: unit
- copy: no directly editable text
- resizable: true

**Fields (2)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `action` | string |  | default empty | yes | Mailchimp form action URL (the list embed endpoint). |
| `layout` | enum | `horizontal`, `vertical` | default `horizontal` | yes | Stack the email field + submit button inline or stacked. |

**Styleable parts (3)**

- **root** `&` - spacing, background, border, layout; owns flex layout (gap, justify, align, direction)
- **email input** `& input` - background, border, color, typography (The rendered <input>. Target it here — the .pf-no-border class is shared across unrelated elements, never key off it.)
- **submit button** `& button` - background, border, color (Button default is var(--pf-sample-color) (#5d6b82 fixed gray) — set background-color here to the section accent so it stops reading as gray.)

## MediaItem2

One item in a media gallery, with hover and selected states.

- kind: leaf
- copy: no directly editable text

_No configurable fields. Styling and copy only._

**Styleable parts (3)**

- **root** `&` - typography, color, background, spacing, border
- **hover state** `&:hover` - color, background, border, transform
- **selected state** `&[data-active="true"]` - color, background, border, transform

## MediaList2

Thumbnail list of product media.

- kind: unit
- copy: no directly editable text

**Fields (2)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `navStyle` | enum | `none`, `nav-style-1`, `nav-style-2`, `nav-style-3`, `nav-style-4`, `nav-style-5` | default `none` | yes | Previous/next arrow treatment. `none` hides the arrows. |
| `slidesToShow` | number |  | per breakpoint | yes | How many items are visible at once, per breakpoint. |

**Styleable parts (1)**

- **root** `&` - typography, color, background, spacing, border

**Contains (2)**

- `MediaListItem2` (collection, xn) - one per product media.
- `MediaItem2` (collection, xn) - older item generation; same purpose.

## MediaListItem2

A single product-media thumbnail with hover and selected states.

- kind: leaf
- copy: no directly editable text

_No configurable fields. Styling and copy only._

**Styleable parts (3)**

- **root** `&` - typography, color, background, spacing, border
- **hover state** `&:hover` - color, background, border, transform
- **selected thumbnail** `&[data-active="true"]` - color, background, border, transform (Applies to the currently selected thumbnail.)

## OptionLabel

Name of one variant option group.

- kind: leaf
- copy: no directly editable text

_No configurable fields. Styling and copy only._

**Styleable parts (1)**

- **root** `&` - typography, color, background, spacing, border

## Paragraph4

Body copy and supporting descriptions; text/html content is supplied through content.value.

- kind: unit
- copy: `value` on this element
- resizable: true

**Fields (7)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `dropcap` | boolean |  | default `false` | yes | Enable a large decorative first letter. |
| `compact` | boolean |  | default `false` | yes | Clamp the copy and show the expand/collapse control held by the CompactButton child. |
| `dropcapStyle` | string |  | only when dropcap === true; default `none` | yes | Drop-cap style preset. |
| `dropcapColor` | string |  | only when dropcap === true | yes | Drop-cap text colour. |
| `dropcapBackground` | string |  | only when dropcap === true | yes | Drop-cap background colour. |
| `dropcapFontSize` | string |  | only when dropcap === true | yes | Drop-cap font size. |
| `dimensions` | string |  | only when dropcap === true | yes | Drop-cap box width/height/line-height (square). |

**Styleable parts (1)**

- **root** `&` - typography, spacing, color, transform

**Contains (2)**

- `Dropcap` (config, shown by `dropcap`, x1)
- `CompactButton` (config, shown by `compact`, x1)

## Popup

Modal overlay container for click, delay, or scroll triggered offers, newsletters, notices, and promos.

- kind: open
- copy: no directly editable text
- resizable: true

**Fields (16)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `popupTriggers` | enum | `click-only`, `delay`, `scroll`, `exit-intent` | default `click-only` | yes | Trigger list; use click-only unless brief asks automatic popup behavior. |
| `popupDelay` | number |  | default `5` | yes | Delay in seconds before opening. |
| `popupScrollPercent` | number |  | default `50` | yes | Page scroll percentage that opens popup when scroll trigger is enabled. |
| `popupFrequencyMode` | enum | `always`, `session`, `days` | default `always` | yes | How often storefront should show the popup. |
| `popupFrequencyDays` | number |  | default `1` | yes | Cooldown days for days frequency mode. |
| `popupOverlayColor` | string |  | default `rgba(0,0,0,0.5)` | yes | Backdrop color. Style phase may also style overlay selector. |
| `popupOverlayBlur` | string |  | default `0px` | yes | Backdrop blur CSS length. |
| `popupCloseOnOverlay` | boolean |  | default `true` | yes | Click backdrop to close popup. |
| `popupShowCloseBtn` | boolean |  | default `true` | yes | Show close button. |
| `popupPosition` | enum | `center`, `top`, `bottom` | default `center` | yes | Dialog vertical position inside overlay. |
| `popupAnimation` | string |  | default empty | yes | Entrance animation key. |
| `popupMaxWidth` | string |  | default `600px` | yes | Dialog max width. |
| `popupName` | string |  | default empty | yes | Internal editor label. |
| `popupBgColor` | string |  | default empty | yes | Dialog background color. |
| `popupBorderRadius` | string |  | default empty | yes | Dialog border radius. |
| `popupShadow` | string |  | default `none` | yes | Dialog box-shadow. |

**Styleable parts (4)**

- **hidden anchor** `&` - visibility (Also matches the dialog in edit mode because both carry the popup data-pf-id. Overlay color/blur are data settings, not selector styling.)
- **dialog** `&.pf-popup-dialog, &[data-pf-popup-dialog="true"]` - size, spacing, background, border, effects
- **close button** `& .pf-popup-close` - size, spacing, background, border, color
- **body** `& .pf-popup-body` - spacing, layout; owns flex layout (gap, justify, align, direction)

**Placement rules**

- Open container — nest normal content inside it (Heading2, Paragraph4, Image5, Button2, Form2, etc.). Keep popup content compact: one clear offer/message + one primary CTA.
- For section generation, prefer click-only unless the merchant explicitly asks for timed/scroll popup behavior.

## ProductATC2

Add-to-cart button bound to the nearest product context.

- kind: unit
- copy: `value` on this element
- resizable: true

**Fields (13, 2 not AI-editable)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `animationHover` | enum | `float`, `shadow`, `grow`, `glow`, `float-shadow`, `grow-shadow` |  | yes | Canned hover motion. Use instead of a hand-written hover rule. |
| `source` | enum | `auto`, `custom` | default `auto` | no | Product source. Use auto inside ProductBox/page context; use custom only with productId. |
| `productId` | string |  | only when source === "custom" | no | Selected Shopify product ID when source is custom. |
| `action` | enum | `same`, `cart`, `checkout`, `link` | default `same` | yes | Post-add-to-cart checkout/navigation action. |
| `text` | string |  | default `Add to Cart` | yes | Button label. |
| `adding` | string |  | default `Adding...` | yes | Text while add-to-cart request is pending. |
| `added` | string |  | default `Thank you!` | yes | Text after item is added. |
| `soldout` | string |  | default `Sold out` | yes | Text shown when selected variant is sold out. |
| `showIcon` | boolean |  | default `false` | yes | Show icon child in button. |
| `iconPos` | enum | `left`, `right` | only when showIcon === true; default `left` | yes | Icon position when showIcon is enabled. |
| `targetStyle` | string |  | default empty | yes | Target style marker used by legacy button styling. |
| `link` | string |  | default empty | yes | Checkout/redirect link used by selected action. |
| `buttonType` | enum | `text`, `icon`, `iconWithText` | default `text` | yes | Button content mode. |

**Styleable parts (4)**

- **main** `&` - typography, spacing, background, border (Root button (the <button> itself). The PRIMARY CTA — solid, high-contrast, full-width.)
- **hover** `&:hover` - typography, background, border (Hover state for the add-to-cart button.)
- **disabled** `&[disabled]` - typography, background, border (Sold-out / unavailable state. The component ships `opacity: 0.7; pointer-events: none` here (product-atc2/index.tsx:103); a merchant asking for a clearer sold-out button is asking for this selector. Attribute form, NOT `:disabled` - that is what the element writes.)
- **icon** `& i, & svg` - size, color, spacing (Icon inside the button (rendered as <i> or <svg> after v4.12). The root IS the <button> — there is no .pf-product-form wrapper.)

**Contains (2)**

- `Icon2` (config, shown by `showIcon`, x1) - also requires buttonType `icon` or `iconWithText`.
- `Icon` (config, shown by `showIcon`, x1) - alternative icon generation; same governor. also requires buttonType `icon` or `iconWithText`.

**Placement rules**

- Buy-box CTA row: put this primary button (`width:"fill"`) and a small icon button (e.g. wishlist heart, `width:"hug"`) in ONE `horizontal` FlexBlock so the CTA spans the row and the icon sits as a compact square beside it. Never give the icon button `width:"fill"`.
- Place ProductDynamicCheckout (express checkout) on its own row BELOW this button, `width:"fill"`.

## ProductBadge

Sale or custom badge shown over product media.

- kind: leaf
- copy: no directly editable text

**Fields (1)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `text` | string |  |  | yes | Badge text template. Contains placeholder markup, e.g. `<div class="syntax-tag">Discount</div>%, only <div class="syntax-tag">Stock</div> left` - the `<div class="syntax-tag">...</div>` wrapper marks the token PageFly substitutes with the real discount percent or stock count at render. Preserve that wrapper markup verbatim around any token kept; do not write plain text over it or the substitution breaks. Live inspector control confirmed: `ControlledBadgeText` / `BadgeText`, `dataKey: 'text'` (features/inspector/elements/shopify/product/product-image.tsx). Copy rule: this is a commercial claim surface - never introduce a discount, scarcity, or guarantee not already present. |

**Styleable parts (1)**

- **root** `&` - typography, color, background, spacing, border

## ProductBox

Product context container for one dynamic product; nest product children inside it.

- kind: open
- copy: no directly editable text
- resizable: true

**Fields (3, 3 not AI-editable)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `source` | enum | `auto`, `custom` | default `auto` | no | Product source. Use auto inside product page/ProductList context; use custom only with productId. |
| `productId` | string |  | only when source === "custom" | no | Selected Shopify product ID when source is custom. |
| `defaultVariantId` | string |  | only when source === "custom" | no | Selected default variant ID for live ProductBox form. |

**Styleable parts (2)**

- **main** `&` - background, spacing, border (Wrapper: background/padding/border only. The children are laid out by the form below, not by this element.)
- **product form** `& > form` - layout; owns flex layout (gap, justify, align, direction) (Flex container. Layout properties go here; on & they are valid CSS that changes nothing.)

## ProductDescription

Dynamic product description bound to the nearest product context.

- kind: leaf
- copy: no directly editable text
- resizable: true

**Fields (10, 2 not AI-editable)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `source` | enum | `auto`, `custom` | default `auto` | no | Product source. Use auto inside ProductBox/page context; use custom only with productId. |
| `productId` | string |  | only when source === "custom" | no | Selected Shopify product ID when source is custom. |
| `type` | enum | `content` | default `content` | yes | Product text field rendered by this element. |
| `tag` | enum | `p`, `div` | default `p` | yes | HTML tag for product description wrapper. |
| `length` | number |  | default `30` | yes | Compact description word/length limit. |
| `compact` | boolean |  | default `false` | yes | Trim description and show more/less toggle. |
| `showButton` | boolean |  | only when compact === true; default `true` | yes | Show more/less button when compact is enabled. |
| `more` | string |  | only when compact === true; default empty | yes | Read more button text. |
| `less` | string |  | only when compact === true; default empty | yes | Read less button text. |
| `linkToProduct` | boolean |  | default `false` | yes | Wrap description with product link when enabled. |

**Styleable parts (1)**

- **main** `&` - typography, spacing, color (Root rich text wrapper.)

## ProductDynamicCheckout

Dynamic checkout button bound to the nearest product context.

- kind: leaf
- copy: no directly editable text
- resizable: true

**Fields (4, 2 not AI-editable)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `source` | enum | `auto`, `custom` | default `auto` | no | Product source. Use auto inside ProductBox/page context; use custom only with productId. |
| `productId` | string |  | only when source === "custom" | no | Selected Shopify product ID when source is custom. |
| `value` | string |  | default `Buy it now` | yes | Fallback placeholder label in editor and data-value in live view. |
| `placeholder` | string |  |  | yes | Editor placeholder text for dynamic checkout. |

**Styleable parts (2)**

- **main** `&` - spacing (Root dynamic checkout wrapper.)
- **unbranded button** `& .shopify-payment-button__button--unbranded` - background, border, color, typography, spacing (The express checkout button (unbranded fallback). Style as the SECONDARY CTA, complementing ProductATC2 (e.g. white/outlined when ATC is solid black) with the same width + radius.)

**Placement rules**

- Express checkout — place on its own row BELOW ProductATC2, `width:"fill"`. Pairs with (does not replace) ProductATC2 on a full product-detail buy box.

## ProductList2

Self-contained grid or slideshow of multiple products.

- kind: unit
- copy: no directly editable text
- resizable: true

**Fields (22, 4 not AI-editable)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `tag` | enum | `h1`, `h2`, `h3`, `h4` |  | yes | Heading level used for each product title. This is the SEO outline rather than its visual size; use font-size for how big it looks. |
| `source` | enum | `all`, `auto`, `custom`, `related` | default `all` | no | Product list source: all products, current collection auto, custom collection, or related products. |
| `collectionId` | string |  | only when source === "custom" | no | Selected Shopify collection ID when source is custom. |
| `relatedProductId` | string |  | only when source === "related" | no | Selected Shopify product ID used to fetch related products. |
| `limit` | number |  | default `4` | yes | Maximum products to render/load. |
| `collectionIds` | string |  |  | no | Selected collection IDs used by filter/condition flows. |
| `loadingMode` | enum | `none`, `pagination`, `loadMore` | default `none` | yes | Grid pagination/loading mode. |
| `hideCurrentProduct` | boolean |  | default `false` | yes | Hide current product from list when available. |
| `enabledFilter` | boolean |  | default `false` | yes | Enable product filter controls for a collection list. |
| `enabledSort` | boolean |  | default `false` | yes | Enable product sort controls for a collection list. |
| `listLayout` | enum | `grid`, `slideshow` | per breakpoint; default `slideshow` | yes | Per-device layout; runtime LIST_LAYOUT values are GRID=0 and SLIDE=1. |
| `slidesToShow` | number |  | per breakpoint; default `3` | yes | Per-device column count/items visible; supports all/laptop/tablet/mobile. This is grid column count, not columns. |
| `slidesToScroll` | number |  | per breakpoint; default `1` | yes | Per-device slideshow items to scroll; must be <= slidesToShow. |
| `spacing` | string |  | per breakpoint; default `30px` | yes | Per-device gap between product items; supports all/laptop/tablet/mobile. This is the ONLY channel - shares `StyledSlideshow` (web/core/src/shared/ui/slideshow/styles.tsx) with ContentList2, which has no `gap` CSS property anywhere (the one `gap: 24px` in this element's own styles.ts is on an unrelated filter-sidebar/grid split, not the item spacing); spacing is a padding-var applied per slide, render-probe verified on the shared base, not inferred (BACKLOG.md BG). |
| `displayPartialItems` | boolean |  | per breakpoint; default `false` | yes | Per-device slideshow partial item peek. |
| `navStyle` | enum | `none`, `nav-style-1`, `nav-style-2`, `nav-style-3`, `nav-style-4`, `nav-style-5` | only when listLayout === "slideshow"; default `nav-style-1` | yes | Slideshow navigation style. |
| `paginationStyle` | enum | `none`, `pagination-style-1`, `pagination-style-2`, `pagination-style-3` | only when listLayout === "slideshow"; default `pagination-style-1` | yes | Slideshow pagination style. |
| `maxHeight` | boolean |  | default `true` | yes | Equalize/max product card height. |
| `fillLastRow` | boolean |  | per breakpoint; default `false` | yes | Per-device grid option to fill last row. |
| `align` | enum | `lt`, `ct`, `rt`, `lm`, `cm`, `rm`, `lb`, `cb`, `rb` | default `lt` | yes | Product item alignment class suffix. |
| `nav` | boolean |  | only when listLayout === "slideshow"; default `true` | yes | Legacy alias for slideshow navigation visibility; prefer navStyle for style. |
| `pagination` | boolean |  | default `true` | yes | Legacy alias for pagination visibility/loading controls; prefer loadingMode/paginationStyle. |

**Styleable parts (4)**

- **main** `&` - spacing (Root product list. Style the card on the ProductBox node (its `&`), not here.)
- **slider nav buttons** `& .pf-slider-nav button` - background, border, color (Slideshow pagination/navigation buttons (dots).)
- **slider arrows** `& .pf-slider-prev, & .pf-slider-next` - background, border, color, size (Prev/next carousel arrows (shared slideshow nav). Only when listLayout is slideshow.)
- **grid wrapper** `& .pf-r-dg` - layout, spacing; owns flex layout (gap, justify, align, direction) (Grid wrapper for product cards.)

**Contains (1)**

- `ProductBox` (collection, x1) - the card template repeated for every product; editing it changes every card.

**Placement rules**

- Nest EXACTLY ONE `ProductBox` card template — the renderer repeats that one card across every product, so never hand-build N ProductBoxes. Every card carries ProductMedia3 → ProductTitle → ProductPrice2 as its core; a card missing ProductTitle ships a product with no name and is incomplete, however editorial the design brief sounds. Optional additions keep this slot order: ProductVendor (the small category/brand line) between the image and the title, ProductATC2 after the price. Every card element is native — never reach for Custom.HTML here.
- Place ProductList2 as a DIRECT child of FlexSection, never inside a ProductBox.
- For a "NEW"/"SALE" corner badge on the card image, set `ProductMedia3 data.showBadge:true` + `data.badgePosition` — there is NO standalone badge element; a separate badge node is dropped. Restyle the badge into a pill via the `badge` selector in ProductMedia3 knowledge.
- For a small product-category / tags line on the card (e.g. "apparel · caps · illustrated"), there is no dynamic product-tags element — emit ONE `Paragraph4` between the image and the title and have the style phase render it as chips: small muted text, or per-tag pill backgrounds via the paragraph background + inline-block spacing. It is static placeholder text, the same on every card (it does not bind to each product's real tags); only add it when the design clearly shows a tags row.
- Defaults to a grid. For "slideshow"/"carousel"/"slider" set `listLayout:"slideshow"` as a TOP-LEVEL field on the block. Set `data.slidesToShow` = cards per row (2-4).
- Also the right pick for "the products IN this collection" on a COLLECTION page — `source:auto` binds to the current collection's products (NOT CollectionListing2, which lists whole collections as cards). Store-wide bestsellers/featured use the same element with the default source.

## ProductMedia3

Dynamic product media gallery bound to the nearest product context.

- kind: unit
- copy: no directly editable text
- resizable: true

**Fields (15, 2 not AI-editable)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `source` | enum | `auto`, `custom` | default `auto` | no | Product source. Use auto inside ProductBox/page context; use custom only with productId. |
| `productId` | string |  | only when source === "custom" | no | Selected Shopify product ID when source is custom. |
| `showBadge` | boolean |  | default `false` | yes | Show sale/product badge child overlay. |
| `buttonSize` | string |  | default `24px` | yes | Media navigation button size CSS value. |
| `imageNavigation` | boolean |  | default `true` | yes | Enable media image navigation controls. |
| `enableImageMagnifier` | boolean |  | default `true` | yes | Allow magnifier option for media hover behavior. |
| `enableImageListSetting` | boolean |  | default `true` | yes | Allow thumbnail media list settings. |
| `onHover` | enum | `NEXT_IMAGE`, `LAST_IMAGE`, `RANDOM_IMAGE`, `ALL_IMAGE` | default `NEXT_IMAGE` | yes | Hover image sequence behavior; runtime enum values 0-3. |
| `imageSource` | enum | `variant`, `featured`, `default-variant` | default `default-variant` | yes | Which product media image source to show first. |
| `hoverAction` | enum | `NONE`, `MAGNIFIER`, `HOVER` | default `NONE` | yes | Media hover action; runtime enum values 0-2. |
| `clickAction` | enum | `NONE`, `LINK_TO_PRODUCT`, `SHOW_FULLSCREEN` | default `NONE` | yes | Media click action; runtime enum values 0-2. |
| `badgePosition` | enum | `TOP_LEFT`, `TOP_RIGHT`, `BOTTOM_LEFT`, `BOTTOM_RIGHT` | default `TOP_LEFT` | yes | Badge overlay position; runtime enum values 0-3. |
| `showList` | boolean |  | per breakpoint; default `false` | yes | Per-device thumbnail list visibility; supports all/laptop/tablet/mobile with unset inheritance. |
| `mediaListSize` | string |  | per breakpoint; default `50px` | yes | Per-device thumbnail media list item size CSS value. |
| `listPosition` | enum | `TOP`, `RIGHT`, `BOTTOM`, `LEFT` | per breakpoint; default `BOTTOM` | yes | Per-device thumbnail list position; runtime enum values 0-3. |

**Styleable parts (9)**

- **main** `&` - spacing, border (Root media element.)
- **main media** `& .pf-main-media` - spacing, border (Main media wrapper.)
- **media slider track** `& .splide__track` - spacing, border (Main-media Splide slider track.)
- **media slide** `& .splide__slide` - spacing, border (Individual media slide.)
- **media wrapper** `& .pf-media-wrapper` - spacing, border (Image/video wrapper.)
- **media image** `& .pf-media-wrapper img` - size, border, transform (The product <img> itself — target for object-fit/aspect-ratio. Set object-fit:cover; width:100%; height:100% so the photo fills the media box, and put aspect-ratio on the root & to shape it (1/1 square is a safe product default). Use object-fit:contain only for logo/transparent art.)
- **thumbnail list** `& .pf-r-dg` - spacing, border (Thumbnail list container (grid layout when showList is on).)
- **nav buttons** `& .splide__arrow--prev, & .splide__arrow--next` - background, border, color (Gallery previous/next buttons (Splide arrows).)
- **badge** `& [data-pf-type="ProductBadge"]` - background, color, typography, spacing, border (Sale/discount badge overlay (only when data.showBadge is on). Style it into a pill — e.g. background:#1a1a1a; color:#fff; padding:4px 10px; border-radius:4px; font-size:12px. Position is owned by data.badgePosition, not CSS.)

**Contains (3)**

- `MediaMain3` (slot, x1) - the large main image.
- `MediaList2` (slot, x1) - the thumbnail strip; shown per breakpoint by the parent `showList` object, which is not writable here.
- `ProductBadge` (config, shown by `showBadge`, x1)

**Placement rules**

- The dynamic product image for BOTH a product CARD (single image, the default — `showList:false`) and a full PDP gallery (set `showList:true` for the thumbnail strip). Use this for the image inside a ProductList2 card; do NOT reach for Custom.HTML to render a product photo.
- A product's main image WITH a thumbnail strip = ONE ProductMedia3 with `data.showList:true` + `data.listPosition:"BOTTOM"` (or "LEFT"/"RIGHT") — the built-in thumbnail list IS the strip. NEVER model it as a main ProductMedia3 (showList:false) plus a separate thumbnail element or Custom.HTML/Liquid gallery — that renders raw Liquid. One product, one ProductMedia3.
- For a "NEW"/"SALE" corner badge over the image, set `data.showBadge:true` + `data.badgePosition` (TOP_LEFT default) — the badge is built in, not a separate element. To restyle it (pill shape, colour, border) target the `badge` selector below; the badge has no node id of its own, so the style phase reaches it through this descendant selector on the media node.
- Custom.HTML is ONLY for a mosaic of DIFFERENT non-product images with no product binding (e.g. an editorial lookbook). A product's own media — main image, thumbnails, or both — is always this ProductMedia3, never Custom.HTML.

## ProductPrice2

Dynamic product price bound to the nearest product context.

- kind: unit
- copy: no directly editable text
- resizable: true

**Fields (4, 2 not AI-editable)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `pricePosition` | string |  |  | yes | Where the compare-at price sits relative to the selling price. |
| `source` | enum | `auto`, `custom` | default `auto` | no | Product source. Use auto inside ProductBox/page context; use custom only with productId. |
| `productId` | string |  | only when source === "custom" | no | Selected Shopify product ID when source is custom. |
| `type` | enum | `combined_price`, `price`, `compare_at_price` | default `combined_price` | yes | Price render mode for ProductPrice2 wrapper/items. |

**Styleable parts (3)**

- **main** `&` - typography, spacing, color (Root price element.)
- **price** `& [data-product-type='price']` - typography, color (Current/selling price item. Styled by data-attribute, NOT a class (no .pf-product-price-* classes exist).)
- **compare-at price** `& [data-product-type='compare_at_price']` - typography, color (Compare-at (original) price item — target for strike-through / muted styling.)

**Contains (1)**

- `ProductPrice2Item` (slot, x2) - first is the price, second the compare-at price; the wrapper `type` setting decides which show.

## ProductPrice2Item

A single price line (regular, sale, or saving) within a product price group.

- kind: leaf
- copy: no directly editable text

_No configurable fields. Styling and copy only._

**Styleable parts (1)**

- **root** `&` - typography, color, background, spacing, border

## ProductQuantity

Quantity selector bound to the nearest product context.

- kind: unit
- copy: no directly editable text
- resizable: true

**Fields (5, 2 not AI-editable)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `source` | enum | `auto`, `custom` | default `auto` | no | Product source. Use auto inside ProductBox/page context; use custom only with productId. |
| `productId` | string |  | only when source === "custom" | no | Selected Shopify product ID when source is custom. |
| `showButton` | boolean |  | default `true` | yes | Show increment/decrement quantity buttons. |
| `defaultQuantity` | number |  | default `1` | yes | Initial quantity value. |
| `size` | number |  |  | yes | Quantity input size/width value used by quantity renderer. |

**Styleable parts (4)**

- **main** `&` - spacing, border (Root quantity control.)
- **input** `& input` - typography, border, background (Quantity input field.)
- **button** `& button` - typography, border, background (Increment/decrement buttons.)
- **button disabled** `& button[disabled]` - typography, border, background (Decrement at the minimum, increment at stock limit. The component ships `opacity: 0.2` here (product-quantity/style.ts:47), which is faint; a merchant asking for a clearer limit state means this. The DISABLED part is the button, never the root.)

**Contains (2)**

- `QuantityButton` (config, shown by `showButton`, x2) - the decrease and increase controls; both appear or neither does.
- `QuantityField` (slot, x1) - the number input; always present.

## ProductTitle

Dynamic product title bound to the nearest product context.

- kind: leaf
- copy: no directly editable text
- resizable: true

**Fields (5, 2 not AI-editable)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `source` | enum | `auto`, `custom` | default `auto` | no | Product source. Use auto inside ProductBox/page context; use custom only with productId. |
| `productId` | string |  | only when source === "custom" | no | Selected Shopify product ID when source is custom. |
| `type` | enum | `title` | default `title` | yes | Product text field rendered by this element. |
| `tag` | enum | `h1`, `h2`, `h3`, `h4`, `h5`, `h6`, `p`, `div` | default `h3` | yes | HTML tag for product title. |
| `linkToProduct` | boolean |  | default `false` | yes | Wrap title with link to product when enabled. |

**Styleable parts (1)**

- **main** `&` - typography, spacing, color (Root text element.)

## ProductVariantSwatches

Variant selector swatches bound to the nearest product context.

- kind: unit
- copy: no directly editable text
- resizable: true

**Fields (12, 2 not AI-editable)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `source` | enum | `auto`, `custom` | default `auto` | no | Product source. Use auto inside ProductBox/page context; use custom only with productId. |
| `productId` | string |  | only when source === "custom" | no | Selected Shopify product ID when source is custom. |
| `combined` | boolean |  | default `true` | yes | Combine options into variant-level selector. |
| `showPrice` | boolean |  | only when combined === true; default `true` | yes | Show variant price in combined selector. |
| `layout` | enum | `horizontal`, `vertical` | default `vertical` | yes | Variant/option layout direction. |
| `optionsSpacing` | string |  | per breakpoint; default `16px` | yes | Per-device spacing between option groups; supports all/laptop/tablet/mobile. |
| `swatchesSpacing` | string |  | per breakpoint; default `16px` | yes | Per-device spacing between option values; supports all/laptop/tablet/mobile. |
| `label` | boolean |  | only when combined === false; default `true` | yes | Show option name label when combined is disabled. |
| `labelPosition` | enum | `top`, `left` | only when combined === false && label === true; default `top` | yes | Option name label position. |
| `display` | enum | `dropdown`, `radio`, `label`, `color`, `image`, `variant` | default `dropdown` | yes | UNIFORM fallback display for EVERY option group — used only when `useOptionSwatches:false`, OR for an option the merchant configured no swatch for. It is one global mode; it cannot render colour-dots for a Colour option and tiles for a Size option at once. With `useOptionSwatches:true` (default) each option instead takes the merchant's own per-option swatch type (Colour→colour, Size→its configured tiles/dropdown), so a mixed Colour+Size product renders correctly — prefer that for any product whose options you don't control. Values: dropdown=select (universal-safe); radio=round radio + text (universal-safe); label=bordered rectangular tiles, renders colour-names AND sizes as text (mostly safe; use for a KNOWN size-only grid like "S M L" / "34 36 38"); color=colour dots (ONLY when EVERY option is a colour — a non-colour value like size "34" has no colour and falls back to a width-collapsed broken text label); image=image squares (same caveat as colour); variant=combined variant tiles (only when combined is true). For a size-button grid choose "label", not "radio". |
| `soldOut` | string |  | default `Sold out` | yes | Sold-out option text. |
| `useOptionSwatches` | boolean |  | only when combined === false; default `true` | yes | When true (default) the per-option display comes from the merchant's configured swatch metafield, and the "display" setting is ignored. Set false to force the "display" mode you choose here — required when you want a specific look (e.g. label tiles for a size grid) regardless of merchant config. |

**Styleable parts (12)**

- **main** `&` - spacing (Root variant swatches wrapper.)
- **select** `& .pf-variant-select` - typography, border, background (Dropdown variant selector.)
- **radio** `& .pf-vs-radio` - typography, border, background (Radio variant option (V2 swatches), round radio + text. For rectangular size-grid tiles use display:"label" + the label-swatch selectors instead. NOT .pf-variant-radio (V1).)
- **radio swatch selected** `& .pf-vs-radio > input[type="radio"]:checked + label` - border, background, color (Active/selected radio option (checked radio state).)
- **color swatch** `& .pf-vs-color` - border, background (Color swatch option.)
- **square swatch** `& .pf-vs-square` - border, background (Square (image/label) swatch option.)
- **label swatch** `& .pf-vs-label` - typography, border, background (Text-label swatch option. Selected state is the separate "label swatch selected" selector — there is NO .pf-active class.)
- **label swatch selected** `& .pf-vs-label > input[type="radio"]:checked + label` - border, background, color (Active/selected text-label swatch (checked radio state). Use to highlight the chosen variant.)
- **color swatch selected** `& .pf-vs-color > input[type="radio"]:checked + label` - border, background, color (Active/selected color swatch (checked radio state).)
- **square swatch selected** `& .pf-vs-square > input[type="radio"]:checked + label` - border, background, color (Active/selected square swatch (checked radio state).)
- **label swatch unavailable** `& .pf-vs-label > input[type="radio"]:disabled + label` - border, background, color (Sold-out text-label swatch (disabled radio state). Ships `opacity: 0.4`. Use to make unavailable sizes read as unavailable rather than merely faint.)
- **square swatch unavailable** `& .pf-vs-square > input[type="radio"]:disabled + label` - border, background, color (Sold-out square/image swatch (disabled radio state). Ships `opacity: 0.4`.)

**Contains (2)**

- `Swatch` (collection, xn) - one per selectable option value.
- `OptionLabel` (collection, xn) - one per option group.

**Placement rules**

- Emit exactly ONE per product — never two swatch blocks for the same product.
- A product-listing/collection card binds to WHATEVER product resolves at runtime; its real options are unknown at authoring time and most merchant products carry BOTH a Colour AND a Size option. Do NOT force `display:"color"` there — colour mode fits an all-colour product only, so the Size option collapses into broken 1-character swatches. Default to `useOptionSwatches:true` (the merchant's per-option swatch config renders each option correctly), or set `display:"label"` (bordered tiles render colour-names AND sizes cleanly). Reserve `display:"color"` + `useOptionSwatches:false` for a product you KNOW is colour-only.
- For a KNOWN size-only product (its only option is the size — "S M L" / "34 36 38") set `data:{ combined:false, useOptionSwatches:false, display:"label" }`: `combined:false` splits each option into its own group, `display:"label"` renders rectangular bordered tiles, and `useOptionSwatches:false` forces that look regardless of merchant config (without it `display` is ignored). Never `display:"radio"` (round radios) for a size grid. Do NOT use this on a Colour+Size product — there `useOptionSwatches:true` renders each option in its right form.

## ProductVendor

Dynamic product vendor/brand name bound to the nearest product context.

- kind: leaf
- copy: no directly editable text
- resizable: true

**Fields (5, 2 not AI-editable)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `source` | enum | `auto`, `custom` | default `auto` | no | Product source. Use auto inside ProductBox/page context; use custom only with productId. |
| `productId` | string |  | only when source === "custom" | no | Selected Shopify product ID when source is custom. |
| `type` | enum | `vendor` | default `vendor` | yes | Product text field rendered by this element. |
| `text` | string |  | default `<div class="syntax-tag" contenteditable="false">Vendor name</div>` | yes | Editor placeholder/rich text fallback. |
| `tag` | enum | `p`, `div` | default `p` | yes | HTML tag for product vendor text. |

**Styleable parts (1)**

- **main** `&` - typography, spacing, color (Root text element.)

## ProgressBox2

Container for Progress2 content and action settings.

- kind: unit
- copy: no directly editable text
- resizable: true

_No configurable fields. Styling and copy only._

**Styleable parts (1)**

- **root** `&` - size, spacing, background, border

**Placement rules**

- Single block — emit the type alone, no child nodes. Fill via `content.items:[{label,percent}]`.

## QRCode

QR code image generated from text/URL data.

- kind: unit
- copy: no directly editable text

**Fields (2)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `data` | string |  | default `https://pagefly.io` | yes | Text or URL encoded into QR code. |
| `alt` | string |  | default `PageFly - Advanced Shopify Page Builder` | yes | Image alt text. |

**Styleable parts (1)**

- **root** `&` - size, spacing, background, border

## QuantityButton

Decrease or increase control beside a quantity input.

- kind: leaf
- copy: no directly editable text

**Fields (2)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `action` | enum | `decrease`, `increase` | default `decrease` | yes | Which direction this control steps the quantity. The pair is authored together; changing one to match the other leaves the merchant with two identical buttons. |
| `percent` | number |  | per breakpoint; default `30` | yes | Glyph size as a percentage of the control, per breakpoint. |

**Styleable parts (1)**

- **root** `&` - typography, color, background, spacing, border

## QuantityField

Numeric quantity input beside the add-to-cart control.

- kind: leaf
- copy: no directly editable text

_No configurable fields. Styling and copy only._

**Styleable parts (1)**

- **root** `&` - typography, color, background, spacing, border

## SearchFormBox

Storefront search box — submits a query to the shop search results page.

- kind: unit
- copy: no directly editable text
- resizable: true

**Fields (1)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `product` | boolean |  | default `false` | yes | Scope the search to products only (adds the product type filter). |

**Styleable parts (1)**

- **root** `&` - spacing, background, border, layout; owns flex layout (gap, justify, align, direction)

## Slideshow

Carousel of slides for hero rotators, image galleries, or testimonial sliders.

- kind: unit
- copy: no directly editable text
- resizable: true

**Fields (11)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `autoPlay` | boolean |  | default `false` | yes | Automatically advance slides. |
| `autoPlayDelay` | number |  | default `3000` | yes | Autoplay delay in milliseconds. |
| `loop` | boolean |  | default `false` | yes | Loop slideshow when reaching end. |
| `slidesToShow` | number |  | per breakpoint | yes | Per-device visible slides. Default 1 on all devices. |
| `slidesToScroll` | number |  | per breakpoint | yes | Per-device slides advanced per navigation. Default 1 on all devices. |
| `displayPartialItems` | boolean |  | per breakpoint | yes | Per-device partial-slide visibility. Default false on all devices. |
| `gutter` | number |  | per breakpoint | yes | Per-device slide gutter. Default 0 on all devices. |
| `maxHeight` | boolean |  | default `true` | yes | Resize slides to common height. |
| `pauseOnHover` | boolean |  | default `false` | yes | Pause autoplay on hover. |
| `navStyle` | enum | `none`, `nav-style-1`, `nav-style-2`, `nav-style-3`, `nav-style-4`, `nav-style-5` | default `nav-style-1` | yes | Arrow navigation style. |
| `paginationStyle` | enum | `none`, `pagination-style-1`, `pagination-style-2`, `pagination-style-3` | default `pagination-style-1` | yes | Dot pagination style. |

**Styleable parts (5)**

- **root** `&` - spacing, background, border (Style each slide on the Image5 node (its `&`), not here.)
- **pagination** `& .pf-slider-nav` - spacing, color
- **dot** `& .pf-slider-nav button` - size, spacing, background, border
- **active dot** `& .pf-slider-nav button.active` - background, border
- **arrows** `& .pf-slider-prev, & .pf-slider-next` - spacing, background, border, color

**Contains (1)**

- `SlideshowSlide` (collection, x1..n) - one per slide; each holds its own free content.

**Placement rules**

- Slot/repeater — nest ONE child per slide; the composer wraps each in one `Image5` per slide (give each a descriptive `alt`). Use Slideshow only when the brief says carousel/slider/slideshow; a plain "grid of photos" is ContentList2.

## SlideshowSlide

One slide of a Slideshow, holding its own content stack.

- kind: open
- copy: no directly editable text
- resizable: true

_No configurable fields. Styling and copy only._

**Styleable parts (1)**

- **root** `&` - typography, color, background, spacing, border

## SoundCloud

Responsive SoundCloud player embed.

- kind: unit
- copy: no directly editable text
- resizable: true

**Fields (4)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `src` | string |  | default `https://soundcloud.com/different-heaven/mtc-different-heaven-remix` | yes | SoundCloud track URL. |
| `autoplay` | boolean |  | default `false` | yes | Autoplay outside edit mode. |
| `buyButton` | boolean |  | default `false` | yes | Show buy button. |
| `username` | boolean |  | default `false` | yes | Show track owner username. |

**Styleable parts (1)**

- **root** `&` - size, spacing, background, border

## StockIndicator

Stock/inventory indicator bound to the nearest product context.

- kind: leaf
- copy: no directly editable text
- resizable: true

**Fields (11, 2 not AI-editable)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `source` | enum | `auto`, `custom` | default `auto` | no | Product source. Use auto inside ProductBox/page context; use custom only with productId. |
| `productId` | string |  | only when source === "custom" | no | Selected Shopify product ID when source is custom. |
| `threshold` | number |  | default `5` | yes | Quantity threshold used to classify low stock. |
| `displayOption` | enum | `always`, `showIfUnder` | default `always` | yes | When to show the stock indicator. |
| `visibilityThreshold` | number |  | only when displayOption === "showIfUnder"; default `5` | yes | Only show when quantity is below this value. |
| `inStockText` | string |  | default empty | yes | Template text for in-stock status; supports {quantity}, {title}, {vendor}, {price}, {compare_price}, {saved_amount}, {saved_percentage}. |
| `lowStockText` | string |  | default empty | yes | Template text for low-stock status; supports stock variables. |
| `outOfStockText` | string |  | default empty | yes | Template text for out-of-stock status; supports stock variables. |
| `inStockColor` | string |  | default empty | yes | Text color for in-stock status; defaults to #22c55e. |
| `lowStockColor` | string |  | default empty | yes | Text color for low-stock status; defaults to #f97316. |
| `outOfStockColor` | string |  | default empty | yes | Text color for out-of-stock status; defaults to #ef4444. |

**Styleable parts (1)**

- **main** `&` - typography, spacing, color (Root stock message element.)

## Swatch

One selectable variant option value.

- kind: leaf
- copy: no directly editable text

_No configurable fields. Styling and copy only._

**Styleable parts (1)**

- **root** `&` - typography, color, background, spacing, border

## TabContentWrapper3

Wrapper holding every Tabs3 panel.

- kind: unit
- copy: no directly editable text

_No configurable fields. Styling and copy only._

**Styleable parts (1)**

- **root** `&` - typography, color, background, spacing, border

**Contains (1)**

- `TabsContent3` (collection, x1..n) - one panel per tab, in the same order as the labels.

## TabHeader3

Clickable tab label in a Tabs3 header row.

- kind: unit
- copy: `value` on this element
- **cannot be styled on its own** - its look is set on the parent `Tabs3`

**Fields (3)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `showIcon` | boolean |  | default `false` | yes | Render the icon child before the label. |
| `iconPos` | enum | `left`, `right` | default `left` | yes | Which side of the label the icon sits on. |
| `activeTab` | number |  |  | yes | Which tab is open when the page loads, counting from 1. |

**Styleable parts (1)**

- **root** `&` - typography, color, background, spacing, border

**Contains (1)**

- `Icon2` (config, shown by `showIcon`, x1)

## Table2

Data table for size charts, specs, and comparisons. Cell data is supplied via content.rows.

- kind: unit
- copy: no directly editable text
- resizable: true

**Fields (4)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `rowHeaders` | number |  | only when rowHeadersPosition === "enable"; default `1` | yes | Number of leading header rows. |
| `columnHeadersPosition` | enum | `left`, `disable` | default `left` | yes | Show a left header column or disable column headers. |
| `columnHeaders` | number |  | only when columnHeadersPosition === "left"; default `1` | yes | Number of leading header columns. |
| `columnsWidth` | enum | `fill`, `hug` | per breakpoint; default `fill` | yes | Per-device column sizing {all,laptop,tablet,mobile}. |

**Styleable parts (3)**

- **table wrapper** `&` - size, spacing, background, border
- **table** `& .pf-table-inner` - size, spacing, background, border
- **cell content** `& .pf-table-cell-inner` - typography, spacing, background, border, color

**Contains (4)**

- `Table2.RowHeader` (slot, x1)
- `Table2.ColumnHeader` (slot, x1)
- `Table2.ColumnBody` (slot, x1)
- `Table2.Body` (slot, x1)

**Placement rules**

- Cells go in `content:{ rows:[[header…],[row…]] }` (string[][]) — `rows[0]` is the header row; use merchant-supplied values verbatim when given. Row/column counts derive from `rows`; do not set them.

## Table2.Body

The body of a table, holding its rows.

- kind: open
- copy: no directly editable text

_No configurable fields. Styling and copy only._

**Styleable parts (1)**

- **root** `&` - typography, color, background, spacing, border

## Table2.Cell

One table cell.

- kind: open
- copy: no directly editable text

_No configurable fields. Styling and copy only._

**Styleable parts (1)**

- **root** `&` - typography, color, background, spacing, border

## Table2.Column

One table column.

- kind: open
- copy: no directly editable text
- resizable: true

_No configurable fields. Styling and copy only._

**Styleable parts (1)**

- **root** `&` - typography, color, background, spacing, border

## Table2.ColumnBody

The body cells of one table column.

- kind: open
- copy: no directly editable text

_No configurable fields. Styling and copy only._

**Styleable parts (1)**

- **root** `&` - typography, color, background, spacing, border

## Table2.ColumnHeader

The header column of a table.

- kind: open
- copy: no directly editable text

_No configurable fields. Styling and copy only._

**Styleable parts (1)**

- **root** `&` - typography, color, background, spacing, border

## Table2.Row

One table row.

- kind: open
- copy: no directly editable text

_No configurable fields. Styling and copy only._

**Styleable parts (1)**

- **root** `&` - typography, color, background, spacing, border

## Table2.RowHeader

The header row of a table.

- kind: open
- copy: no directly editable text

_No configurable fields. Styling and copy only._

**Styleable parts (1)**

- **root** `&` - typography, color, background, spacing, border

## Tabs3

Tabbed content panels (CSS radio-state switching). Renderer owns tab structure.

- kind: unit
- copy: no directly editable text
- resizable: true

**Fields (5)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `activeFront` | number |  | writes `active` too; default `0` | yes | Index of the tab open by default (0 = first). Writes the editor canvas and the published page together. |
| `headerPosition` | enum | `top`, `bottom`, `left`, `right` | per breakpoint; default `top` | yes | Per-device tab-bar position {all,laptop,tablet,mobile}. |
| `align` | enum | `start`, `center`, `end` | per breakpoint; default `start` | yes | Per-device header alignment {all,laptop,tablet,mobile}. |
| `fitted` | boolean |  | per breakpoint; default `false` | yes | Per-device stretch headers to fill the bar {all,laptop,tablet,mobile}. |
| `icon` | string |  | default `angle-down` | yes | Glyph shown on tab headers (e.g. on mobile collapse). |

**Styleable parts (5)**

- **main** `&` - spacing, background, border
- **headers wrapper** `& .tab3-headers-wrapper` - spacing, layout, background; owns flex layout (gap, justify, align, direction) (the tab header bar.)
- **tab label** `& [data-pf-type="TabsMenu3"] > label` - typography, spacing, background, border (individual tab buttons (inactive state).)
- **content container** `& .pf-tab3-content-container` - spacing, background (the panel area below the headers.)
- **nav buttons** `& .pf-tab-prev-btn, & .pf-tab-next-btn` - color, background, size (scroll navigation arrows (hidden on mobile/tablet).)

**Contains (4)**

- `TabsMenu3` (slot, x1) - the header row holding the tab labels.
- `TabContentWrapper3` (slot, x1) - holds every tab panel.
- `DropdownButton` (slot, x1) - the collapsed-navigation control.
- `TabHeader3` (collection, x1..n) - one clickable label per tab.

**Placement rules**

- Single block — emit the type alone, no child nodes. Fill via `content.items:[{label,content}]`; the renderer owns the tab structure.

**Page CSS only**

- active-tab styling is a sibling-state rule: `& .pf-tab-radio:checked ~ ...` — emit it as page custom-css, not element-style, since it depends on the generated radio id/index.

## TabsContent3

One Tabs3 panel body.

- kind: open
- copy: no directly editable text

_No configurable fields. Styling and copy only._

**Styleable parts (1)**

- **root** `&` - typography, color, background, spacing, border

## TabsMenu3

Header row holding the tab labels of a Tabs3.

- kind: unit
- copy: no directly editable text

**Fields (1)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `activeTab` | number |  |  | yes | Which tab is open when the page loads, counting from 1. |

**Styleable parts (1)**

- **root** `&` - typography, color, background, spacing, border

**Contains (1)**

- `TabHeader3` (collection, x1..n) - one clickable label per tab.

## TwitterFeed2

Embedded Twitter/X timeline.

- kind: unit
- copy: no directly editable text

**Fields (4)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `twitterLink` | string |  |  | yes | Twitter/X timeline URL. |
| `width` | number |  |  | yes | Timeline width in pixels. |
| `height` | number |  |  | yes | Timeline height in pixels. |
| `loading` | enum | `lazy`, `standard` |  | yes | Widget loading mode. |

**Styleable parts (1)**

- **root** `&` - size, spacing, background, border

## Vimeo3

Responsive Vimeo video embed.

- kind: unit
- copy: no directly editable text
- resizable: true

**Fields (9)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `src` | string |  | default `https://vimeo.com/380219212` | yes | Vimeo URL; renderer parses video ID from this first. |
| `videoID` | string |  | default `380219212` | yes | Fallback Vimeo video ID when src parsing fails. |
| `loop` | boolean |  | default `false` | yes | Loop video. |
| `autoplay` | boolean |  | default `false` | yes | Autoplay in view mode. |
| `mute` | boolean |  | default `false` | yes | Mute playback. |
| `portrait` | boolean |  | default `false` | yes | Show Vimeo portrait. |
| `byline` | boolean |  | default `false` | yes | Show Vimeo byline. |
| `title` | boolean |  | default `false` | yes | Show Vimeo title. |
| `lazyLoading` | boolean |  |  | yes | Legacy inspector loading flag; keep if present in saved data. |

**Styleable parts (1)**

- **root** `&` - size, spacing, background, border

## Youtube4

Responsive YouTube video embed.

- kind: unit
- copy: no directly editable text
- resizable: true

**Fields (11)**

| Field | Type | Allowed values | Notes | AI can edit | What it does |
| --- | --- | --- | --- | --- | --- |
| `src` | string |  |  | yes | YouTube URL; renderer parses video ID from this first. |
| `videoID` | string |  |  | yes | Fallback YouTube video ID when src parsing fails. |
| `startTime` | number |  | default `0` | yes | Start time in seconds. |
| `endTime` | number |  |  | yes | End time in seconds (unset by default); used only when greater than startTime. |
| `autoplay` | boolean |  | default `false` | yes | Autoplay in view mode. |
| `loop` | boolean |  | default `false` | yes | Loop video by passing playlist=videoID. |
| `mute` | boolean |  | default `false` | yes | Mute playback. |
| `controls` | boolean |  | default `false` | yes | Show YouTube controls. |
| `loading` | enum | `lazy`, `standard` |  | yes | Content loading mode used for lazy srcDoc behavior. |
| `lazyLoading` | boolean |  |  | yes | Legacy inspector loading flag; keep if present in saved data. |
| `autoCustomize` | boolean |  |  | yes | Responsive customize flag; keep if present in saved data. |

**Styleable parts (3)**

- **root** `&` - size, spacing, border, transform
- **iframe wrapper** `& .pf-iframe-wrapper` - size, spacing, border
- **iframe** `& .pf-ifr` - size, border

