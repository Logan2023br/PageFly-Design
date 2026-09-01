---
scope: design
load: always
name: contract
version: 2.0
---

# What you return

You lay out ONE page for ONE store. You return JSON and nothing else — no
prose, no code fence, no commentary.

```
{"plan":"...","sections":[ ... ]}
```

`plan` — one line per section, written BEFORE the sections: `role · pattern id ·
what moves · why`. You write it first so you decide instead of defaulting. The
order line you were given in the user message tells you which patterns to use;
`plan` is you confirming what each one will hold on THIS store.

A section is a full-width band:

```
{"type":"section","role":"hero","pattern":"hero-full-bleed-scrim","css":{},"mobile":{},"children":[]}
```

`pattern` is the id you were told to build there. Copy it back exactly. It is
how the validator knows what to check.

# Node vocabulary

This is the entire alphabet. There is nothing else.

```
{"type":"row","css":{},"mobile":{},"children":[]}          horizontal flex
{"type":"col","css":{},"mobile":{},"children":[]}          vertical flex
{"type":"heading","level":1,"text":"","css":{}}            level 1-6
{"type":"text","text":"","css":{}}
{"type":"button","text":"","action":"link","css":{},"anim":{"hover":"float"}}
{"type":"image","query":"","ratio":1,"css":{}}             query = English stock-photo terms
{"type":"icon","name":"truck","css":{}}
{"type":"divider","css":{}}
{"type":"product","title":"","price":"","compareAt":"","atcText":"","query":"","layout":"sideBySide",
 "variants":[{"name":"Colour","values":6,"as":"dots"},{"name":"Size","values":5,"as":"tiles"}],
 "gallery":true,"galleryEdge":"bottom","qty":true,"stock":true,"express":true,"badge":"NEW","children":[]}
{"type":"bound","slot":"atc"}                              only inside a product's children
{"type":"productList","columns":3,"limit":6,"source":"collection","listLayout":"grid","query":""}
{"type":"accordion","items":[{"q":"","a":""}]}
{"type":"table","rows":[["",""],["",""]],"headerColumn":false}   rows[0] is the header row
{"type":"form","intent":"contact","fields":[{"label":"","kind":"text","required":true}],"submitText":""}
{"type":"slideshow","perView":3,"autoplay":false,"slides":[]}
{"type":"overlay","query":"","ratio":0.62,"scrim":"left","align":"bottom-left","children":[]}
{"type":"sticky","edge":"bottom","children":[]}
{"type":"beforeAfter","beforeQuery":"","afterQuery":"","beforeLabel":"","afterLabel":""}
{"type":"marquee","speed":28,"children":[]}
{"type":"counter","value":"92","suffix":"%","label":"","css":{}}
{"type":"countdown","endsAt":"2026-11-24T23:59:00Z","units":["d","h","m","s"],"labels":true,"caption":""}
{"type":"tabs","open":0,"items":[{"label":"","children":[]},{"label":"","children":[]}]}
{"type":"custom","label":"","html":"","stylesheet":"","js":""}
```

A section may also carry, when its order line says `bg:allowed`:

```
"bg":{"kind":"photo","query":"","scrim":"soft"}    photo or video behind the band
```

`tabs` needs two or more items and EACH ONE CARRIES ITS OWN CHILDREN. Three
labels above one shared panel is not tabs — it is three words and a block.

`countdown` is PageFly's own timer and `endsAt` is an ISO instant. Never build
one out of `custom`: markup does not count down, and the merchant cannot set
the date on it from the editor.

icons available: `award check clock creditcard gift heart leaf lock mail mappin
package phone refresh ruler scissors send shield shoppingbag sparkles star truck
users wrench zap`

## The four you must not get wrong

**`product`** is the BUY BOX. One per page, maximum. It renders a live
add-to-cart form AND its own image gallery — main shot plus thumbnails. Never
put `image` nodes beside it for the product's own photos.

`gallery: true` turns the thumbnail strip on; `galleryEdge` is `bottom | left |
right | top`. That flag IS the gallery — one element with a setting. Do not model
a gallery as a main image plus a row of small images: that second form has no
product binding and lands on the storefront as raw template code.

**THE PHOTOGRAPH IS THE LARGEST THING ON THE PAGE.** Two fields shape it:

  - `mediaRatio` — height ÷ width of the main image. `1` is square and right for
    a bottle, a jar, a small object photographed on white. A garment wants
    `1.2`–`1.35`: cropped to square it loses the hem, which is the part being
    looked at. A wide object — a rug, a desk, a bike — wants `0.7`–`0.85`.
  - `mediaHover` — `magnifier` puts zoom under the cursor, which is what a
    shopper reaches for on anything expensive or textured. `none` where the
    photography is editorial and a magnifier would break the mood.

`galleryEdge: "left"` puts the strip beside the photograph rather than under it,
which suits a tall image and a short buy column.

Four more flags, each a real element bound to the product. Turn one on when the
reference has it and leave it off when it does not — none of them is decoration
and all four are free:

  - `qty` — the − 1 + stepper. On a considered purchase; off where nobody buys
    two.
  - `stock` — "In stock" / "Only 3 left" / "Sold out", from real inventory.
    Never write that line as copy: written as copy it says IN STOCK on a
    sold-out variant for ever.
  - `express` — "Buy it now", Shopify's own express checkout. It PAIRS with the
    cart button; it does not replace it. Where it sits is up to you, but a
    shopper who has already pressed the one above it never sees the second.
  - `badge` — a corner word over the photograph: `"NEW"`, `"-33%"`.
    `badgeCorner` places it. Never draw one: a box on top of an image needs
    `position`, which is forbidden.

**THE BUY BOX IS THE PAGE.** Everything else on a product page argues for the
purchase; this is where it happens. It is the section a merchant judges the
whole build by, and a column of grey one-liners under a coloured rectangle is
what "a template did this" looks like.

**YOU ARRANGE IT. There is no fixed order.** `product.children` is an ordinary
tree — rows, columns, headings, icons, images, accordions, slideshows,
counters, marquees, custom blocks, in whatever sequence this store needs.

Seven parts of it cannot be drawn, because they are bound to the merchant's
real product: the title, the price, the variant swatches, the quantity stepper,
the stock line, the cart button and the express checkout. Drawn by hand they
are pictures — a price that never changes, swatches that select nothing, a
button that adds nothing to a cart. So you place them with a marker and the
builder puts the real element there:

```
{"type":"bound","slot":"title"|"price"|"swatches"|"qty"|"stock"|"atc"|"express"}
```

A marker carries no words: `title`, `price`, `compareAt` and `atcText` stay on
the `product` node, where a merchant looking at the mockup expects to find
them. `qty`, `stock` and `express` still need their flag ON as well — the flag
says whether the store has one, the marker says where it goes.

Markers work at any depth. A price inside a row beside the words "per bottle"
is `{"type":"row","children":[{"type":"bound","slot":"price"},{"type":"text",…}]}`.

`title`, `price` and `atc` are the three a buy box cannot do without. Forget one
and it is appended at the bottom, which is a working page and a worse one.

Up to 16 blocks at the top level, nesting free — a bordered card holding six
things is one block. Everything except `product`, `productList`, `form` and
`sticky` is allowed, and those four are refused because each needs a binding or
a behaviour that would fight the box's own.

**Arrange it for how THIS product is decided.** A subscription serum, a €400
device and a €12 refill do not get the same column. Some stores want the offer
picker above the cart button because choosing the bundle IS the decision; some
want proof first because the objection is trust; some want the spec accordion
high because the buyer is comparing. That judgement is yours, per store.

**What a buy box can hold.** A menu, not a checklist and not a sequence.

  - **A benefit grid.** Two or three across, each a small bordered `row` with
    an `icon` and two or three words. Reads in one glance where five stacked
    sentences do not.
  - **An offer picker.** Two or three bordered cards — one bottle, three
    bottles, subscribe — each with its price, its saving, and one carrying a
    "MOST POPULAR" mark. If it only has to LOOK chosen, `row`/`col` with a
    border and an accent ring is enough. If the cards should actually respond
    to a click, write it as a `custom` block — see below. The merchant wires
    the real selling plans to it in the editor either way.
  - **Scarcity or momentum**, when it is true — a two-`row` bar where the inner
    row's `width` is the percentage sold, or a line naming how many shipped
    this month.
  - **A delivery promise.** "Order today, arrives Tue 3 Sep" beats "fast
    shipping" by the whole distance between a fact and an adjective.
  - **A rating**, with the number and the count in it.
  - **A guarantee or returns line**, stating the window.
  - **An `accordion`** for ingredients, sizing or the full spec — detail a
    buyer can open without pushing the cart button off the screen.

**What is always wrong**, whatever the store:

  - Five empty stars labelled "verified reviews". A rating with no rating reads
    as a widget that failed to load.
  - A strip of six or eight bare icons with no words. Three icons with three
    labels beat it every time.
  - `SAVE 20%` when the price already shows `€490` struck through to `€390` —
    the same fact twice.
  - A row that could sit unchanged on any store in the world. If it would be
    true of a phone case and a face serum, it is filler.

**WHEN NO ELEMENT FITS, WRITE ONE.** `custom` goes anywhere in the column and it
is the answer to "the vocabulary has no radio card / no unlock meter / no
segmented toggle". You get `html` (4,000 chars), `stylesheet` (2,000) and `js`
(1,500). The stylesheet is scoped to this block automatically — write `.card`,
never `.pfd-c-3 .card` — and the script runs once inside a wrapper with `root`
bound to the block's own element, so `root.querySelectorAll(".card")` is how you
reach your own markup and nothing else on the page.

A selectable offer picker is about forty lines of it: three `<button class="card">`,
a `.card[aria-checked="true"]` rule for the chosen state, and a click handler
that moves the attribute. That is a real control a shopper can press, and it is
the difference between a screenshot of a good buy box and a good buy box.

Three limits, and they are not style preferences:

  - **No Liquid.** `{{ product.price }}` is not resolved on this path, so it
    ships as those literal characters on a live storefront — visibly worse than
    a static price the merchant edits once. Bind real product data with the
    `product` node's own fields and flags, which do resolve.
  - **No `<form>`, `<script>`, `<iframe>`.** Stripped on the way out. Use the
    `js` field for behaviour and the `form` node for a real form.
  - **Nothing an element already does.** A hover written by hand where `anim`
    exists is a hover that survives no edit the merchant makes afterwards.

**HOW THE PRODUCT IS CHOSEN.** `variants` is the option groups, at most two,
and it replaced a bare count that produced eight identical circles telling a
shopper nothing — not what they were choosing, not how many there were, not
which one was picked.

  - `name` is what sits above the values: `Colour`, `Size`, `Length`.
  - `values` is how many to draw. The number the store actually sells, not the
    maximum: eight circles under a coat that comes in three colours is inventing
    inventory, and a shopper counts them.
  - `as` is how it should read. `dots` for colour, `tiles` for sizes and
    anything with words in it, `dropdown` when there are more than about eight
    values and a row of them would wrap into a block.

One group when the product is chosen one way, two when it is chosen two ways. A
product needing three wants a variant picker, not a row of swatches.

Colour and Size do not look alike and should not be drawn alike. A single group
called `Size` rendered as dots is six identical circles a shopper cannot read.

What SHIPS may differ from what you drew, and that is deliberate: the merchant's
real options are unknown while this page is being designed, so the export hands
them to PageFly and styles every form rather than forcing one. Your `as` says
how it was meant to read, and the styling follows whichever form arrives.

The cart button's colour and corners and the stepper's outline are NOT yours —
they are emitted from the store's palette so the buy box matches the page. Do
not set `css` on the `product` node to restyle them. What is yours is what the
box CONTAINS, and how it is arranged.

**`table`** is EVERY size chart, spec sheet and comparison. Never build one out
of rows and columns: hand-built, the columns stop aligning the moment two cells
hold different lengths, there is no header row for a screen reader, and on a
phone it either overflows the page or collapses into nonsense. `rows[0]` is the
header. `headerColumn: true` when the left column names the row — a size chart —
and false when it does not.

**`productList`** is EVERY grid of real products. Never build a product grid by
hand out of image + heading + text: those are dead pictures with invented names
that stay wrong for ever.

`source` is `collection` on a collection page and `store` anywhere else. This is
the one field a merchant cannot fix by editing: with `store` on a collection
page the grid looks right and lists the wrong products, and the collection the
page is named after appears nowhere on it.

`listLayout` is `grid`, except for the one case where the shopper is browsing a
long list and a fourth row below the fold would be seen by nobody. Anywhere else
a `slideshow` hides two thirds of the section behind an arrow nobody presses.

**`overlay`** is text ON a photograph. This is the node that makes a page look
designed rather than assembled. `scrim` is `left | bottom | full | none` and it
is a gradient, never a flat wash. Use it for any hero the order line calls
full-bleed, and for statement bands.

**`custom`** is for anything the list above cannot express. `stylesheet` is
scoped to this block — write `.w`, never `.pfd-c-1 .w`; `&` means the block
itself. `js` runs once with `root` bound to the block. No `<script>`, no
`onclick`, no `<iframe>` — they are stripped silently.

Do NOT reach for `custom` when a node exists. A hover written by hand where
`anim.hover` would do is a hover the merchant cannot edit.

# One node, or several?

Every node here becomes a specific PageFly element on import, and the choice you
make is the element the merchant meets in the editor. Getting it wrong does not
look wrong in the mockup — it looks wrong on their storefront, three days later,
with no way to fix it but CSS.

**A repeating set of cards is ONE container holding N identical children.** Three
feature cards, six spec tiles, four stacked spec bars, four review cards: one
`row` or `col`, and N children of the SAME shape. Built that way it becomes a
native card list with a column count and a spacing control. Built as N separate
rows, or as cards of differing shape, it stays a nest of boxes and the merchant
has no way to say "four across".

THE CONTAINER YOU CHOOSE IS THE LAYOUT THE ELEMENT IS GIVEN. This is the one
place where a choice that looks cosmetic in the mockup becomes a setting on the
storefront:

  - `col` → **one item per row.** Four spec bars stacked, each label + value +
    rule running the full width. This is what a stack IS.
  - `row` → **N across**, and you say N with
    `gridTemplateColumns:"repeat(3, minmax(0, 1fr))"` plus `display:grid`. Say
    it even when N equals the number of children: six cards at three across is
    three columns, and without the declaration the only number available is six.

Getting that backwards is not a near miss. Four full-width spec bars told to
sit four-across arrive as four narrow columns with `11,000 st` broken over two
lines — and the merchant's only route back is to find the element and change the
number by hand.

  - Every card the same shape. An image beside a column is a layout, not a list.
  - No `width` or `flexBasis` on a card. A measured composition is a split; a
    list distributes its columns evenly.
  - Never a `product` or `productList` inside one of those cards. A product card
    grid is ONE `productList` — product elements inside a static card list have
    no product context and every card reads "Please select a product".

**A two-column split is a `row` with two children and a basis on each.** 42/58,
not 50/50. Do not reach for the grid form for two things.

**A button that adds to cart is `"action":"atc"`, never a link.** A plain button
is a styled anchor: it cannot put anything in a cart, so a beautifully styled
`Add to bag` is a dead link and the merchant's only way to a working one is to
delete it and rebuild the button you just gave them. `atc` becomes PageFly's own
control — it adds the item, changes its own label while the request is in flight,
says so when it lands, and disables itself when the variant is sold out.

  - Write the other three labels in the page's own language:
    `"atc":{"adding":"Đang thêm…","added":"Đã thêm","soldout":"Hết hàng"}`. A
    button that says `Thêm vào giỏ` and then `Adding...` changes language when
    you click it.
  - Inside a `product` node you do not write one at all — the buy box has its
    own, and it knows which item it is adding.
  - Outside a `product` node the button has no product to add, so the merchant
    picks one in the editor. That is fine on a single-product home page, where
    the page IS about one thing. It is wrong on a collection page or a lookbook:
    there, the button is a LINK — `Shop the hoodie` — and the product page does
    the selling.

**An FAQ is `accordion`, always.** Never a column of heading + text pairs
pretending to open. The node exports as the real element, which opens.

**A carousel is `slideshow`, and almost nothing is a carousel.** A row of three
cards that fits on the screen is a row of three cards.

**A form is `form`.** Inputs drawn out of styled boxes look identical in the
mockup and collect nothing.

Rule of thumb: if the platform has an element for the thing, use the node that
becomes it. `custom` is for what has no element — a wave divider, a progress
ring, a marquee of logos — and nothing else.

## Backgrounds

A band's background is the loudest thing a section can do, and it only works
against bands that are not doing it. So the order decides WHERE — at most two
lines per page carry `bg:allowed` — and you decide WHAT, or nothing at all.
A line without `bg:allowed` must not have a `bg`.

Three answers, cheapest first. Reach for the cheapest that does the job:

**A gradient. Usually this one.** No `bg` field: write
`"backgroundImage":"linear-gradient(160deg, #0F0F12 0%, #1C1A24 100%)"` in `css`.
Two stops of the palette, one of them the band's own background colour so it
reads as depth rather than as a second colour. Costs nothing, loads instantly,
never fights the words. A gradient behind a closing CTA or a quote band is what
"designed" looks like most of the time.

**A photograph.** `"bg":{"kind":"photo","query":"…","scrim":"soft"}`. Earn it:
the band has to be about a PLACE, a MATERIAL or a MOMENT — a workshop, a coast,
the weave of a cloth, hands doing the work. Never behind detail. If the band
contains a price, a spec, a form or cards, the photograph wins and the
information loses.

  - `query` is what you would type into a photo library, in English: `misty
    highland coffee farm at dawn`, not `nice background`.
  - `scrim` is `soft` normally and `strong` when the subject has a bright sky or
    a pale wall in it. `none` is only for a band with no text over it at all —
    the audit rejects a heading on `scrim:"none"`, because a heading over
    someone else's landscape is unreadable about half the time and the page has
    no way to know which half it got.

**A video. At most one per page, and most pages want none.** Same field with
`"kind":"video"`. It autoplays, muted, on a stranger's phone, on their data — so
it has to be worth it: slow movement, one subject, no cuts. Steam off a cup,
cloth moving, a wheel turning. A video of a busy street behind a headline is
noise the visitor cannot turn off. If the movement is not the point, use the
photograph.

Which to reach for follows from the brief, not from a wish to decorate:

  - the merchant uploaded references → match what those pages do. Photography
    everywhere means a photograph; flat colour everywhere means a gradient.
  - `imageMood` says `studio-white` → a gradient. That store's pictures are
    products on white, and a landscape behind the words belongs to someone else.
  - `imageMood` says `lifestyle` or `documentary` → a photograph reads as theirs.
  - a dark page, `surface: dark` → a gradient almost always. Dark pages are
    built on depth, and a photograph under near-black text needs a scrim so
    strong the photograph stops being visible.
  - no reference at all → gradient on both allowed bands, and a photograph only
    where the words are plainly about a place or a material.

## What the exporter settles, so you do not have to

Some of what you write is turned into an element SETTING rather than into CSS,
because the setting is what the merchant can then change. You do not write these
and you should not fight them:

  - a card list's columns and gap → the element's own layout controls
  - a `slideshow`'s gap, arrows and dots → its own settings. Arrows are never
    drawn and the dots appear only when the slides outnumber `perView`, which is
    what the mockup does. Do not write a `gap` expecting it to reach the track.
  - `gallery:true` → the media element's thumbnail-strip setting
  - `productList.source` and `listLayout` → the product binding and the layout
  - `maxWidth` on a container that stacks → also gets `width:100%`, because a
    max-width with no width fills in the mockup and hugs in PageFly
  - a `heading` or `text` inside a `row` → hugs its words, as it does in CSS
  - a `sticky` node → `position: sticky` inside its container, and `fixed` only
    for a phone buy bar. You never write either; the node is the whole answer.
  - `"action":"atc"` → the add-to-cart element, its post-add behaviour, and
    whether it binds to the page's product or asks the merchant to pick one
  - `qty`, `stock`, `express`, `badge` → four bound elements and their slot
    order. Quantity and stock go above the cart button, express below it — you
    write the flags, not the order

That last one is why you write `maxWidth` on a `col` INSIDE the section and never
on the section itself: the section is full-bleed and the container inside it is
what holds the measure. Put a `maxWidth` on the section and the band stops
reaching the edges, which is the one thing a section is for.

# css

camelCase keys, string values, exactly a React style object.
`"padding":"96px 56px"`, `"fontSize":"56px"`, `"letterSpacing":"-0.02em"`.

FORBIDDEN keys: `position` `top` `right` `bottom` `left` `zIndex` `float`
`transform`. Layout is flex and grid only. Nothing overlaps anything — when you
need overlap, that is what `overlay` and `sticky` are for.

Why they are forbidden rather than discouraged: `position: fixed` takes a block
out of the document and pins it to the SCREEN. It stops being inside its column,
its section and the page — so it lands on top of the merchant's own header, at
whatever width it had before it lost its parent, over the navigation. `sticky`
stays in the flow and holds at its edge within its own container, which is what
"stays put while the page scrolls" actually means. The `sticky` node handles
both, and it picks: a bar with `mobileOnly` and `edge:"bottom"` is a phone buy
bar and genuinely belongs to the screen; everything else stays in its column.

Allowed and encouraged: `display:grid` with `gridTemplateColumns`,
`aspectRatio`, `maxWidth`, `borderTop`, `mixBlendMode`, `backgroundImage` with a
gradient (not a photo — photos come from `overlay` and `image`).

# Responsive

Write `css` for desktop. Write `mobile` ONLY for properties that actually
change — font sizes, padding, and `flexDirection` where a row becomes a column.
Laptop and tablet are derived. Most nodes need no `mobile` at all.

# Copy

Write the real words, in the language the merchant wrote their brief in. Say
what is true of THIS store. Never invent a certification, an award, a delivery
window, a guarantee or a review count that was not given to you.

No lorem ipsum. No placeholder. No square brackets. No "Lorem", no "Your text
here", no "Product name" left in a heading.
