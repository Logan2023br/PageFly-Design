---
scope: slice
slice: pattern
name: patterns
version: 2.0
---

<!--
  SLICED AT RUNTIME. Only the 4–7 blocks named in the order line are sent.
  Each block is delimited by <!--#id--> … <!--/--> so the loader can address it
  by id. Never send this file whole: 34 patterns is ~4,000 tokens to tell the
  model 28 things that do not apply to the page in front of it.

  Notation:  indentation = nesting.  42/58 = flex-basis ratio.
  Numbers are the spec, not a suggestion. Copy them.
-->

## Hero patterns

<!--#hero-split-asymmetric-->
**hero-split-asymmetric** — the workhorse split, never 50/50.
```
section  padding 96px 56px  container 1180
  row  gap 64  align center   mobile: column, gap 28
    col basis 42%  → eyebrow · display (2-3 lines) · body-lead ≤22 words · 1 button · caption trust line
    image basis 58%  ratio 0.86  in-context photo, not a cut-out
```
Text column max 520px. Vertical-centre the text against the media, not the
section. Alternate the image side against the next split on the page.
*Fails when:* the text column runs wider than 520px and `display` wraps to 4 lines.
<!--/-->

<!--#hero-full-bleed-scrim-->
**hero-full-bleed-scrim** — the one that makes a page look art-directed.
```
section  padding 0  full-bleed
  overlay  query "<lifestyle scene, subject off-centre>"  ratio 0.58  scrim "left"  align "bottom-left"
    col  maxWidth 640  gap 20  padding 88px 56px
      eyebrow · display 64-88 · body-lead ≤20 words · 1 button
```
The scrim is a gradient from 65% at the text edge to 0 at the far edge. A flat
40% wash across the whole image kills the photograph. One CTA, never two.
*Fails when:* content is dead-centre over a busy image with no gradient.
<!--/-->

<!--#hero-centered-statement-->
**hero-centered-statement** — for a single strong claim.
```
section  padding 120px 56px  container 760
  col  align center  gap 22
    eyebrow · display 72-88 · body-lead · row[ button primary · button text-link ]
section  padding 0  full-bleed
  image  ratio 0.40
```
Requires copy strong enough to carry the size. Weak copy centred large is worse
than weak copy small. Uses one of the two permitted centred sections.
<!--/-->

<!--#hero-product-lead-->
**hero-product-lead** — the product page opener.
```
section  padding 64px 56px  container 1180
  product  layout "sideBySide"  swatches 3-6  compareAt set
```
The only hero where a white-background cut-out is allowed, because the buy box
owns the gallery. Put the trust strip immediately under it, never lower.
<!--/-->

<!--#hero-editorial-stack-->
**hero-editorial-stack** — craft, editorial, long-form.
```
section  padding 96px 56px
  col  gap 32
    eyebrow  centred small
    heading  display 72-96  serif  align left  maxWidth 900
  image  ratio 0.42  full-bleed
  row  gap 56  → col 60% body-lead · col 40% caption stack
```
No CTA above the image. Slow and confident.
<!--/-->

<!--#hero-type-only-->
**hero-type-only** — no photograph at all.
```
section  padding 140px 56px  background <dark band>  full-bleed
  col  gap 24  maxWidth 980
    eyebrow · display 80-104 with ONE word in accent · body-lead · button
  marquee  speed 30  → 6 short claim strings
```
For stores whose product does not photograph well, and for launch pages. The
marquee under the type is what stops it reading as an empty page.
<!--/-->

## Proof and specification

<!--#spec-grid-4x2-->
**spec-grid-4x2** — the signature for anything spec-led.
```
section  padding 96px 0  full-bleed
  col  maxWidth 1200  margin 0 auto  padding 0 40px
    row  gap 72  align flex-start
      col basis 260  → eyebrow · section-head · one body line ≤18 words
      grid cols 4  mobileCols 2  gap 44px 32px
        ×8  col → icon 24 accent · stat-value with unit · label
```
Exactly **6 or 8** stats, never 5 or 7 — a ragged final row is the tell. Accent
on all icons and nothing else in this section. `label` is a technical noun, not
a benefit.
<!--/-->

<!--#stat-strip-3up-->
**stat-strip-3up** — cheap, and the first thing a visitor reads.
```
section  padding 72px 56px  background <band>
  row  gap 48  justify space-between  mobile: column
    ×3  col align center → counter value + suffix · caption denominator
```
Three, never four. Each number carries its denominator in the caption:
`from 2,000+ reviews`, not `customers`.
<!--/-->

<!--#spec-bars-->
**spec-bars** — measured values as horizontal bars.
```
section  padding 96px 56px  background <dark>
  col  gap 40  maxWidth 900  margin 0 auto
    eyebrow · section-head
    ×4  col gap 8 → row[ label · stat-value with unit ] · custom bar (fills on reveal)
```
For audio, tools, battery, range, anything with a number a rival also quotes.
The bar fills once on scroll; it does not loop.
<!--/-->

<!--#comparison-table-->
**comparison-table**
```
section  padding 88px 56px  container 1100
  col gap 32 → eyebrow · section-head
  table  rows[0] = header · 6-9 body rows · headerColumn true
```
A `table`, not a grid of rows. The columns have to line up across every row and
a hand-built grid stops doing that as soon as two cells differ in length.
Never win every row. One row where the alternative is better is what makes the
other eight believable.
<!--/-->

<!--#spec-rail-sticky-->
**spec-rail-sticky** — long spec content beside a pinned summary.
```
section  padding 96px 56px  container 1180
  row  gap 64  align flex-start
    col basis 34%  sticky edge "top"  → product name · price · button · 3 caption lines
    col basis 66%  → 4-6 sub-head + body pairs
```
Mobile: the rail becomes a `sticky` bottom bar, not a stacked column.
<!--/-->

<!--#certification-logo-row-->
**certification-logo-row**
```
section  padding 48px 56px  background <band>  full-bleed
  col align center gap 20
    label "Tested and certified"
    marquee speed 34 → 6-10 icon + caption pairs
```
Only when the merchant actually named certifications. Never invent one.
<!--/-->

## Image and atmosphere

<!--#usecase-tiles-overlay-->
**usecase-tiles-overlay** — the highest-value non-hero pattern.
```
section  padding 88px 0  full-bleed
  col maxWidth 1280 margin 0 auto padding 0 40px  gap 40
    row → col[ eyebrow · section-head ] · body-lead 420px
    grid cols 3  mobileCols 1  gap 16
      ×3  overlay ratio 1.15 scrim "bottom" align "bottom-left" → label · sub-head · caption
```
Each tile is a use case, a terrain, an age, a room, a skin type — a way the
buyer sorts themselves. Text sits ON the photo. This is what replaces the
centred icon trio.
<!--/-->

<!--#lookbook-strip-->
**lookbook-strip**
```
section  padding 80px 0  full-bleed
  col gap 28
    row padding 0 56 → eyebrow + section-head · text-link
    slideshow perView 3.2  autoplay false → ×6 image ratio 1.32 + caption
```
Fractional `perView` so a fourth card is half-visible at the right edge — that
is what tells the visitor it scrolls.
<!--/-->

<!--#gallery-masonry-3-->
**gallery-masonry-3**
```
section  padding 88px 56px  container 1240
  grid cols 3  gap 12  mobileCols 2
    ×6-9 image, ratios alternating 1.4 / 0.75 / 1.0
```
Ratios must differ or it is a contact sheet. No captions; the photographs carry it.
<!--/-->

<!--#full-bleed-quote-band-->
**full-bleed-quote-band**
```
section padding 0 full-bleed
  overlay query "<atmosphere, low detail>" ratio 0.42 scrim "full" align "center"
    col maxWidth 820 align center gap 18
      heading display 44-56 → the quote · caption → attribution
```
One per page. The scrim here IS flat, because the image is deliberately quiet.
<!--/-->

<!--#before-after-pair-->
**before-after-pair**
```
section  padding 96px 56px  container 1000
  col gap 32 align center
    eyebrow · section-head · body-lead
    beforeAfter  beforeLabel "..." afterLabel "..."
    caption  → the condition of the test: how long, how many, what was measured
```
The caption is not optional. A before/after with no stated interval is a claim
with no evidence, and in health and beauty it is a compliance problem.
<!--/-->

<!--#split-media-alternating-->
**split-media-alternating** — 2 to 4 consecutive bands, image side flipping.
```
section  padding 88px 56px  container 1180
  row gap 64 align center  mobile: column
    image basis 52%  ratio 0.78
    col basis 48% gap 18 → eyebrow · sub-head 26-32 · body · ×3 check bullets
```
The check bullets are what stop this reading as a brochure. Each is a concrete
outcome, not a feature name.
<!--/-->

## Content and story

<!--#process-steps-->
**process-steps**
```
section  padding 96px 0  full-bleed  background <band>
  col maxWidth 1180 margin 0 auto padding 0 56  gap 44
    col gap 12 → eyebrow · section-head
    grid cols 3  mobileCols 1  gap 32
      ×3  col gap 12 → label "01" in accent · sub-head · body · image ratio 0.7
```
Numbers are `01 02 03`, not `1 2 3`, and they are the accent's job in this
section.
<!--/-->

<!--#ingredient-list-->
**ingredient-list**
```
section  padding 96px 56px  container 1180
  row gap 56 align flex-start
    col basis 40% → eyebrow · section-head · body-lead · image ratio 1.1
    col basis 60% → ×4-6 rows[ label name · caption function ] separated by 1px rules
```
Each row names the substance and what it does. Percentages only if the merchant
gave them.
<!--/-->

<!--#whats-inside-grid-->
**whats-inside-grid** — for kits, bundles and boxes.
```
section  padding 96px 0  full-bleed  background <dark>
  col maxWidth 1200 margin 0 auto padding 0 48 gap 40
    col gap 10 → eyebrow · section-head 44-56 · body-lead
    grid cols 3  mobileCols 1  gap 20
      ×6-9  col gap 14 padding 26 border 1px → label "01" · image ratio 0.9 · sub-head · body
    row padding 22 border 1px → the sequence, e.g. "Prep → Apply → Cure → Remove"
```
Numbering every item is what turns a feature list into an inventory.
<!--/-->

<!--#story-band-->
**story-band**
```
section  padding 120px 56px  container 1080
  row gap 64 align center  mobile: column
    image basis 46% ratio 1.2  → a person or a place, never an office
    col basis 54% gap 20 → eyebrow · section-head · body ×2 paragraphs · caption signature
```
<!--/-->

<!--#origin-band-->
**origin-band**
```
section padding 0 full-bleed
  overlay query "<place, wide, natural light>" ratio 0.5 scrim "left" align "bottom-left"
    col maxWidth 560 gap 16 → eyebrow place name · sub-head · body ≤40 words
```
<!--/-->

<!--#deep-dive-split-->
**deep-dive-split** — one feature, given a whole band.
```
section  padding 110px 56px  container 1180  background <band>
  row gap 72 align center
    col basis 44% → eyebrow · section-head · body-lead · ×3 label+caption pairs in a row
    image basis 56% ratio 0.82
```
<!--/-->

<!--#routine-steps-->
**routine-steps** — morning/evening, day/night, weekly.
```
section padding 88px 56px container 1100
  col gap 36
    row → eyebrow · section-head
    row gap 24 mobile: column
      ×2  col basis 50% gap 16 padding 28 background <band> → label · sub-head · ×3 caption steps
```
<!--/-->

<!--#size-fit-guide-->
**size-fit-guide**
```
section padding 88px 56px container 1080
  row gap 56 align flex-start
    image basis 42% ratio 1.15  → a diagram or a measured photo
    col basis 58% → section-head · body · grid cols 4 of label+caption · accordion 3 items
```
A table with no diagram is a spreadsheet.
<!--/-->

<!--#faq-accordion-->
**faq-accordion**
```
section padding 88px 56px container 1000
  row gap 64 align flex-start  mobile: column
    col basis 34% → eyebrow · section-head · caption "still unsure? <contact>"
    accordion basis 66%  6-8 items
```
Two columns, not one centred stack — that is the difference between an FAQ that
looks designed and one that looks appended. Answers are 2–4 sentences and name a
number, a duration or a policy.
<!--/-->

## Commerce

<!--
  THE SECTIONS THAT SELL. Everything above this heading is editorial — it tells
  a story about a product. These are the product.

  They exist because the library did not have them, and the resolver's arcs did
  not have a slot for them, so a Product page came back as eight editorial bands
  with no buy box and a Collection page came back with nothing from the
  collection on it. No prompt could fix that: the model was never given a slot
  to put a product in.

  Each of these is ONE node. That is deliberate. `product` and `productList`
  expand to PageFly subtrees — ProductBox with its required slot order,
  ProductList2 with exactly one card template — that the builder gets right and
  a hand-built row of images cannot: cards drawn out of image + heading + text
  are dead pictures with invented names, while ProductList2 binds every card to
  a real product with its real title, price and photo.
-->

<!--#product-detail-gallery-->
**product-detail-gallery** — the buy box. The top of a product page, always.
```
section  padding 64px 56px  container 1180
  product  layout "sideBySide"  gallery true  galleryEdge "bottom"
           swatches 3-6  compareAt set  atcText the merchant's own words
```
`gallery true` is not decoration: it turns on the thumbnail strip inside the one
media element, which is how PageFly models a gallery. Never draw a main image
plus a separate row of small images.

The buy column is the densest thing on the page. A bare title-price-cart column
is the clearest tell of a generated product page. Use `extras` — 2 to 4 rows,
and vary them by trade.

Only one thing is forbidden above the title: a DISPLAY heading (56px+). That
costs 90px of vertical and pushes the price under the fold. An eyebrow at 11px
costs 20px and buys the column its category, so it is welcome. Everything BELOW
the cart button — trust rows, measured values, a delivery line — costs the price
nothing and belongs here, not in the next section.

Do not fix a shape. What goes in `extras` comes from the vertical and from the
filed reference for this element, never from this file.
*Fails when:* a display heading is added above the product and the price lands
at 900px.
<!--/-->

<!--#product-detail-wide-->
**product-detail-wide** — gallery across the full width, buy column under it.
```
section  padding 56px 56px  container 1320
  product  layout "stacked"  gallery true  galleryEdge "bottom"
           swatches 3-6  compareAt set
```
For one product photographed well enough to be the page: furniture, a bike, a
rug, anything where the shape matters more than the spec. The stacked layout
gives the photograph the full container and puts price and cart beneath it.
*Fails when:* the product has one square studio photo — use the split instead.
<!--/-->

<!--#collection-grid-3up-->
**collection-grid-3up** — the collection, three across.
```
section  padding 72px 56px  container 1180
  heading level 2  ≤6 words          the collection's own name, not "Our Products"
  productList  columns 3  limit 9  source "collection"  listLayout "grid"
```
`source "collection"` binds the cards to the products in the collection this
page is showing. With the store-wide source a collection page shows the same
products as every other page, and the collection it is named after appears
nowhere on it.

Nine cards, not six: a collection page that shows six products reads as a
curated edit, and a merchant who has forty wants to feel like they have forty.
*Fails when:* the grid is hand-built out of image + heading — those are dead
pictures with invented names.
<!--/-->

<!--#collection-grid-4up-->
**collection-grid-4up** — a dense collection, four across.
```
section  padding 64px 48px  container 1320
  heading level 2  ≤6 words
  text  body-lead ≤22 words            what is in this collection and who for
  productList  columns 4  limit 12  source "collection"  listLayout "grid"
```
For catalogues: apparel, hardware, parts, anything with variants where the
shopper is scanning rather than reading. Four columns needs a wider container
and tighter side padding or the cards go narrow enough to break their titles.
*Fails when:* the store sells six things — four columns of six looks half-built.
<!--/-->

<!--#collection-featured-row-->
**collection-featured-row** — a short, deliberate row. For a home page.
```
section  padding 96px 56px  container 1180
  eyebrow 1-3 words uppercase
  heading level 2  ≤7 words           says what the row IS, not "Featured"
  productList  columns 3  limit 3  source "store"  listLayout "grid"
```
Three products, chosen-looking. This is the one commerce section that belongs on
a home page: a home page's job is to send people somewhere, and three products
with a reason above them do that where a wall of twelve does not.

`source "store"` here, not "collection" — a home page is not showing one
collection.
*Fails when:* the limit is raised past six and the home page becomes a
collection page.
<!--/-->

<!--#collection-carousel-->
**collection-carousel** — more products than the row can hold.
```
section  padding 80px 56px  container 1320
  heading level 2  ≤7 words
  productList  columns 4  limit 12  source "collection"  listLayout "slideshow"
```
The ONE place a carousel is right: the shopper is browsing, the order does not
matter, and a fourth row of cards below the fold gets seen by nobody. Anywhere
else a slider hides two thirds of the content behind an arrow nobody presses.
*Fails when:* used for three cards that already fit on the screen.
<!--/-->

## Conversion

<!--#price-math-band-->
**price-math-band** — the strongest conversion pattern there is.
```
section  padding 120px 56px  background <dark>  full-bleed
  col align center gap 8  maxWidth 720 margin 0 auto
    eyebrow "The math"
    ×3 rows: row justify space-between → label · stat-value 44-72
       "Total value $189" / "Yours $89" / "You save $100"
    caption ≤18 words explaining what is NOT extra
```
Works whenever there is a bundle, a kit, a subscription or a comparison to a
service the buyer already pays for. Numbers right-aligned, same optical size.
<!--/-->

<!--#bundle-picker-->
**bundle-picker**
```
section  padding 96px 56px  container 1080
  col gap 36 align center
    eyebrow · section-head · body-lead
    grid cols 3  mobileCols 1  gap 18
      ×3 col padding 28 border 1px → [flag on the middle one] · sub-head qty · stat-value price · caption struck original · caption saving · button
```
The middle card carries the flag and a 2px accent border. The others are 1px.
<!--/-->

<!--#plan-comparison-->
**plan-comparison** — same shape as bundle-picker, feature rows instead of qty.
```
grid cols 3, each col → label tier · stat-value price · caption cadence · ×5 check rows · button
```
<!--/-->

<!--#social-proof-wall-->
**social-proof-wall**
```
section  padding 96px 0  full-bleed  background <dark>
  col maxWidth 1180 margin 0 auto padding 0 56 gap 36
    col align center gap 10 → section-head · row[ stat-value "4.8" · 5 star icons · caption "from N reviews" ]
    grid cols 3  mobileCols 1  gap 16
      ×6 col padding 24 border 1px gap 12 → 5 star icons · sub-head verdict 2-5 words · body 2-3 sentences · caption "— First name L."
```
Vary the length. One card at four stars with a mild reservation. Never
exclamation marks. Each review names the worry and what actually happened.
<!--/-->

<!--#guarantee-row-->
**guarantee-row** — the trust strip, and it goes directly under the hero.
```
section  padding 44px 56px  background <band>  full-bleed  borderTop 1px  borderBottom 1px
  row gap 40 justify space-between  mobile: grid cols 2
    ×4  row gap 12 align flex-start → icon 20 · col[ label · caption ]
```
Four items. Icon, a 2–4 word label, one short line. Never lower on the page.
<!--/-->

<!--#cta-band-full-->
**cta-band-full**
```
section padding 140px 56px  full-bleed  background <dark or accent-tinted>
  col align center gap 22 maxWidth 720 margin 0 auto
    section-head 44-56 · body-lead ≤20 words · button · caption reassurance
```
Nothing else. This is the page's last section and its generosity of space is
the point.
<!--/-->

<!--#lead-form-split-->
**lead-form-split**
```
section padding 96px 56px container 1080
  row gap 64 align flex-start  mobile: column
    col basis 45% → eyebrow · section-head · body · ×3 label+caption contact facts
    form basis 55%  intent "contact"  3-4 fields
```
Three or four fields. Eight fields is a form nobody finishes.
<!--/-->

<!--#newsletter-inline-->
**newsletter-inline**
```
section padding 64px 56px background <band> full-bleed
  row gap 40 justify space-between align center  mobile: column
    col → sub-head · caption
    form intent "signup" 1 field submitText "..."
```
<!--/-->
