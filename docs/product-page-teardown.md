# One product page, taken apart

**What this is.** A real export, opened and read element by element against
`MD Json PageFly/fields.md` — the field list generated from PageFly's own
registry. The page is `product-3` for `mxhxua-6i.myshopify.com`, built
2026-09-18, and it is the page the editor shows three faults on.

**Why it is written down.** Two of the three faults are in code that knowingly
contradicts the reference, with a comment saying so. That is worth a document
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

## 4 · Fault 2 — clicking a form input

**What the reference says.**

| Element | Field | Type |
|---|---|---|
| `Form2.Field` | `label` | **string** |
| `Form2.Field` | contains `FormLabel` (slot) | "shown by the parent `label.on` sub-field, **which is not writable here**" |

**What was emitted.**

```json
{ "label": { "on": true, "text": "E-mailadres", "value": "E-mailadres" },
  "required": true }
```

An object where a string is documented — and `label.on`, which the reference
says is not writable. The inspector opens when the field is clicked, reads
`label` expecting a string, and gets an object.

**This one was a guess, and says so.** `builder.ts:1303`:

> the inferred key of the two and an unread extra key costs nothing; **when an
> import confirms which one PageFly reads, delete the other.**

The import has now confirmed it. An unread extra key costs nothing; an unread
extra key **of the wrong type on a documented field** costs the inspector.

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
| 2 | Form inspector fails | `builder.ts:1306` | Write `label` as a plain string. Drop `label.on` — the reference says it is not writable. |
| 3 | Text collapses | `builder.ts` composites | Give the floor to elements built there too, the same rule `cssAt` uses: boxes and pictures `0`, anything carrying words `min-content`. |

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
