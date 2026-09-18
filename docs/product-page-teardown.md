# One product page, taken apart

**What this is.** A real export, opened and read element by element against
`MD Json PageFly/fields.md` — the field list generated from PageFly's own
registry. The page is `product-3` for `mxhxua-6i.myshopify.com`, built
2026-09-18, and it is the page the editor shows three faults on.

**Why it is written down.** One fault is in code that knowingly contradicts the
reference, with a comment saying so; one has already been repaired once against
this same symptom and is back; one is a gap the last repair did not reach. That is worth a document
rather than a commit message, because the same reasoning will otherwise be
applied to the next element.

---

## 1 · The path, end to end

```
merchant's brief            free text, written by the merchant
      ↓  lib/ai/designServer.ts          DeepSeek writes JSON
design tree                 OUR vocabulary — 24 node types, lib/design/schema.ts
      ↓  lib/design/render.tsx           → the mockup on screen
      ↓  lib/design/toPagefly.ts         → PageFly elements + styleData
      ↓  lib/pagefly/builder.ts          → composites (tabs, accordion, table…)
.pagefly                    zip, one JSON entry
      ↓  merchant imports
PageFly editor
```

**Where a defect can live, and they are not the same place.**

| Layer | Writes | A defect here looks like |
|---|---|---|
| DeepSeek | the design tree | a section missing, wrong copy, a silly layout |
| `toPagefly` | leaf elements + CSS | right elements, wrong size or colour |
| `builder` | composites | the right words inside an element that will not render |

**All three faults below are in `builder.ts`.** None of them is DeepSeek's, and
no prompt change fixes any of them — the model asked for a `tabs` node and a
`form` node, which is all its vocabulary lets it do; what those become is
decided by code.

---

## 2 · What came out

412 items, 367 style rows, 45.6 KB zipped.

```
 144  Paragraph4          11  FlexSection          2  ProductBox
 104  FlexBlock           10  Image5               2  ProductMedia3
  13  Custom.HTML          9  Accordion3.*×4       2  MediaList2
  13  Heading2             7  Divider2             1  Tabs3
                           7  MediaListItem2       1  Form2
                           6  Button2              1  ProductList2
                           5  SlideshowSlide       1  CountDown
                           4  ProductPrice2Item    1  ImageComparison
                           3  TabHeader3           1  ProductVariantSwatches
                           3  TabsContent3         1  ProductDynamicCheckout
```

**This part is right.** The page is built out of PageFly's own elements, not out
of FlexBlocks pretending to be them: a real `ProductBox` with a real
`ProductMedia3` gallery, a real `ProductVariantSwatches`, a real
`ProductDynamicCheckout`, a real `CountDown`, a real `ImageComparison`. Two
`ProductBox`es, eleven sections, a 9-row size table. A merchant can open any of
it in the editor and change it with the controls that element ships with.

The design work is sound too — the brief asked for an editorial product page and
the mockup is one. The faults below are all in the last hundred metres.

---

## 3 · Fault 1 — Tabs: "Something went wrong"

**What the reference says.** `fields.md`, under `Tabs3`, Placement rules:

> Single block — emit the type alone, **no child nodes**. Fill via
> `content.items:[{label,content}]`; **the renderer owns the tab structure.**

**What was emitted.** The full tree, by hand:

```
Tabs3
  TabsMenu3            data.activeTab = 1
    TabHeader3 ×3      data = { value: "Maatentabel", activeTab: 1 }
  TabContentWrapper3
    TabsContent3 ×3    the panels, with the size table inside
```

**Three separate contradictions in that tree.**

1. **Child nodes at all.** The renderer owns this structure and generates its own
   radio inputs — `fields.md` says active-tab styling depends on "the generated
   radio id/index". A hand-built tree collides with the one it makes.
2. **`DropdownButton` is missing.** `Tabs3` declares four things it contains:
   `TabsMenu3`, `TabContentWrapper3`, **`DropdownButton`** (the collapsed-nav
   control) and `TabHeader3`. Three were emitted.
3. **`TabHeader3.value` is not a field.** Its three fields are `showIcon`,
   `iconPos`, `activeTab`. `value` is accepted, stored, and does nothing — the
   same trap `page-json.md` describes for visibility flags.

**It was done on purpose.** `builder.ts:785` says so:

> `fields.md` also carries a placement note saying to emit `Tabs3` alone and
> fill `content.items`, which is a different authoring path for label-and-text
> tabs; **it cannot carry a table or an image**, and the tabs this product
> designs do.

That reasoning has one unverified premise — that `content.items` cannot carry a
table — and the whole decision rests on it.

**What can be checked without an import.** `content.items` is a real authoring
pattern, used by exactly three elements in the whole reference:

| Line | Element | Shape |
|---|---|---|
| 1143 | a bulleted list | `string[]` |
| 1774 | a progress bar | `[{label, percent}]` |
| 2161 | `Tabs3` | `[{label, content}]` |

The other two take plain scalars, so the guess is a reasonable one. But `content`
appears in **no field table and in `page-json.md`'s node shape not at all** — that
file lists `type`, `id`, `children`, `data`, `options`, `styleData` and no
fourth slot. So what `content` accepts is genuinely unknown from the documents,
and `[{label, content}]` could be a string, HTML, or a subtree.

**Which makes this the thing to test first, and it cannot be answered from the
file.** Build one page with a tabs section both ways, import both, look:

- `content` takes rich content → follow the rule, delete the tree, done.
- `content` takes a string only → `Tabs3` cannot hold a size table at all, and
  the honest answer is to stop using it for one: stack the panels, or build the
  tab strip out of FlexBlocks and `Custom.HTML`, which render whatever they are
  given and have no renderer of their own to collide with.

Either way the other two contradictions below — the missing `DropdownButton` and
`TabHeader3.value` — are unambiguous and should go regardless of how that test
comes out.

**And the governing rule was already written down.** `docs/pagefly-file-format.md`:

> If the two ever disagree about an element's `type` or fields,
> `MD Json PageFly/fields.md` wins; it is generated from the application's own
> registry.

---

## 4 · Fault 2 — clicking a form input — NOT DIAGNOSED

**A first reading of this said `Form2.Field.label` should be a string, because
the field table says string and an object is written. That reading was wrong,
and the code says why.** `builder.ts:1288`:

> Written as a bare string, `label.on` is undefined, so every label was hidden —
> the imported form showed three inputs carrying PageFly's own placeholder text
> and no Name, Email or Message anywhere. Clicking one opened a settings panel
> reading a sub-field off a string and the editor answered "Something went
> wrong".

The string was tried. It failed, and it failed at the same click. The object is
what fixed it, together with two other corrections made at the same time:
`FormLabel` was given a style entry, and `FormInput` was deliberately left
without one because `fields.md` marks it "cannot be styled on its own".

So the form has already been repaired once, against this exact symptom, and the
symptom is back. **Guessing a fourth shape for `label` would be the third guess
on one element.** What can be said without guessing:

**Two things in the file contradict the reference, and neither is proven to be
the cause.**

1. `Form2.Field.label` carries `value` as well as `text`. The comment above it
   asks for exactly this test — "when an import confirms which one PageFly
   reads, delete the other" — and the import has happened, but it shows only
   that both were shipped, not which is read.
2. `FormLabel` is given `data: { label }`. The reference says of it: **"copy: no
   directly editable text"** and **"No configurable fields. Styling and copy
   only."** An element with no fields is being handed one. By `page-json.md`'s
   rule an undocumented key is "accepted, stored, and does nothing" — so this is
   suspicious rather than damning.

**How to settle it, in one import.** Build one page with four variants of the
same one-field form and import them together:

| # | `Form2.Field.label` | `FormLabel` data |
|---|---|---|
| A | `{ on, text, value }` — as now | `{ label }` — as now |
| B | `{ on, text, value }` | `{}` |
| C | `{ on, text }` | `{}` |
| D | `"E-mailadres"` | `{}` |

Click the input on each. The one that survives is the shape; the rest get
deleted along with the guessing. Ten minutes, and it ends a question that has
now cost three attempts.

---

## 5 · Fault 3 — text one character per line, again

**174 of 412 elements carry no `min-width`.** By type:

```
Paragraph4 ×66   FlexSection ×11   Accordion3.* ×36   MediaListItem2 ×7
SlideshowSlide ×5   FlexBlock ×4   ProductPrice2Item ×4
```

The floor added in `The stylesheet the editor never reads` lives in `cssAt`, and
`cssAt` only sees **design-tree nodes**. Every element a composite builds —
table cells, accordion rows, media list items, product price parts — is
constructed directly in `builder.ts` and never passes through it.

Visible in the editor as `STOFGEWICHT`, `SAMENSTELLING` and PageFly's own
`Please select a product in General → Product source` running down the page a
letter at a time.

**The table rows are fine** — `tableAsFlex` gives each row `min-width: 880px`,
which is the fix from `SPECIFICATION, one letter at a time`. It is the cells
inside other composites that have nothing.

**FIXED.** `withFloor` in `builder.ts` now writes the floor into every style a
composite emits, on the same split `cssAt` uses: boxes and pictures `0`,
anything carrying words `min-content`.

It never CREATES a style entry, and that restraint is the whole of the risk.
Forty-five elements in this export carry none, and two of them must never carry
one — `fields.md` marks `FormInput` and `TabHeader3` "cannot be styled on its
own", and giving `FormInput` a style once answered "Something went wrong" on the
first click and took the page with it. Those 45 keep whatever PageFly gives
them; the other 129 get the floor.

---

## 5b · Two rules added while reading this

Neither is a defect in the file. Both are shapes the file is allowed to have and
should not be.

**The product-detail band is the buy box and nothing else.** Section 1 of this
page carries 110 elements: a five-slide `slideshow` of the dress, AND a
`ProductBox` buried five FlexBlocks deep which has its own `ProductMedia3`
gallery of six. The page shows the product twice — once in an element bound to
the merchant's real media, once in one bound to nothing. A merchant changing the
product in Shopify would watch half their own opening screen stay as it was.

The contract said *"never put `image` nodes beside it"*, which named the one
shape somebody had got wrong before; a slideshow is the same mistake in a
different element. It now names galleries rather than `image`, and `audit.ts`
reports a `slideshow`, `image` or `beforeAfter` in the band that holds the buy
box — **only** that band, because the rest of a product page is meant to be full
of photographs.

**No filter or sort on a collection page.** Not a style preference. PageFly's
catalogue does contain `ProductFilterAndSort`, `FilterButton`, `FilterOption`
and a dozen more — they appear 180 times in `nesting.md`. **Not one of them has
a documented field.** Ninety-six elements carry a field table; none of those do.
There is no documented way to say what a facet filters on, what a sort sorts by,
or which collection either reads, so a filter rail built out of rows and buttons
is exactly as connected to the store as a photograph of one. A build shipped
`CLEAR ALL` beside three collapsed facets above a grid that ignored all of them.

---

## 6 · What is NOT wrong

Worth stating, because three faults in one screenshot reads worse than it is.

- **The elements are right.** Native `ProductBox`, `ProductMedia3`,
  `ProductVariantSwatches`, `ProductDynamicCheckout`, `CountDown`,
  `ImageComparison` — not FlexBlocks with CSS pretending to be them.
- **The Form2 styling is right.** `FormInput` "cannot be styled on its own — its
  look is set on the parent `Form2`", and the file styles it exactly that way:
  `& [data-pf-type="FormInput"]` on the Form2.
- **The accordion nesting is right.** Content sits in
  `Accordion3.Flex.Content`, which is the placement the format doc names as a
  known failure when it is wrong.
- **`ProductBox data = {}` is not a bug.** An unbound product box is correct for
  a template; the merchant picks the product on import. The editor's
  "Please select a product" is that message, working.
- **The design is good.** Eleven sections, a real editorial composition, a size
  table with three tabs, a fabric story, verified-review stats. It answers the
  brief.

---

## 7 · The fix list, in order

| # | Fault | Where | First step |
|---|---|---|---|
| 1 | Tabs render fails | `builder.ts` `TABS()` | **Import one page both ways and look.** `content` is in no field table and in no node shape, so nothing in the file says what it takes. Then either delete the tree, or stop using `Tabs3` for rich panels. Drop `TabHeader3.value` and add `DropdownButton` either way. |
| 2 | Form inspector fails | `builder.ts:1306` | **Not diagnosed — do not guess a fourth time.** Import the four-variant page in §4 and read the answer off it. |
| 3 | Text collapses | `builder.ts` composites | **Done** — `withFloor`, on styles that already exist. |

**Fault 1 needs an import to settle it**, and that is the same ten-minute loop
`test-export.ts` was written around: build a page with one tabs section both
ways, import both, look. Nothing in the file can answer it — the renderer's
behaviour is not in the file.

---

## 8 · And the prompt

**None of this is fixed by changing what DeepSeek is told.** The model writes a
design tree in a vocabulary of 24 node types; it asked for `tabs` and `form`,
which is all it can ask for. Every fault above is in the code that turns those
two words into PageFly elements.

The prompt is the right place for a different class of problem — a section
missing, weak copy, a layout that does not answer the brief. This page has none
of those. Changing the prompt to work around a renderer fault would mean telling
the model to stop asking for tabs, which trades a fixable bug for a worse page.
