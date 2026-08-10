# The shape of a PageFly page

**Hand-written, not generated.** The two companion files in this folder are produced by scripts and
regenerate on demand. This one is written from the source and can fall behind it. If something here
contradicts the editor, the editor is right.

Every claim below was checked against the code rather than recalled. The check is named in each section
so you can re-verify it.

## A page is a flat list, not a nested tree

This is the single fact that surprises everyone. A PageFly page is stored as **one flat array of items**.
Nesting is expressed by **id references**, not by nesting the JSON.

```js
[
  { type: 'Button', id: 41, children: [42, 43],
    data: { btnStyle: 'plain', buttonType: 'text', showIcon: false, url: '' },
    styleData: { all: { '&': 'display: inline-flex;' } } },

  { type: 'Icon', id: 42,
    data: { icon: 'star' },
    styleData: { all: { '&': 'font-size: inherit;' } } },

  { type: 'Text', id: 43,
    data: { value: 'Shop now', placeholder: 'Enter text here...' } },
]
```

`items[0]` is the root. `children` holds the ids of other entries in the same array, in render order.

> Checked: `features/catalog/get-catalog-data.ts` ("Flat array, numeric ids, items[0] is the root"),
> and every seed in `features/catalog/data/v4.16.0/catalog-data/`.

Two consequences worth internalising:

- **Order of the array does not determine layout.** `children` does. An item can sit anywhere in the array.
- **A button does not contain its own label.** The `Text` node at id 43 does. This is why editing button
  copy means editing a different node than the one you selected. `fields.md` records which elements own
  their copy (`contentVia: self`) and which delegate it to a child (`contentVia: child-text`).

## What one node holds

| Key | What it is |
| --- | --- |
| `type` | The element type. Must be one the catalog knows. |
| `id` | Number, unique within the page. Referenced by the parent's `children`. |
| `children` | Array of ids. Absent on leaf elements. |
| `data` | The element's own settings. This is what `fields.md` documents. |
| `options` | Structural settings, separate from `data`. Responsive visibility lives here. |
| `styleData` | CSS, keyed by breakpoint and then by selector. |

### `data` and `options` are different slots

They are siblings on the node and they are not interchangeable. Responsive visibility
(`hideOnDesktop`, `hideOnLaptop`, `hideOnTablet`, `hideOnMobile`) is read from **`options`**:

```tsx
// stores/element/element-render.tsx
const { hideOnDesktop, hideOnLaptop, hideOnTablet, hideOnMobile } = options || {}
const hideOnClasses =
  (hideOnDesktop ? ' pf-lg-hide' : '') + (hideOnLaptop ? ' pf-md-hide' : '') +
  (hideOnTablet  ? ' pf-sm-hide' : '') + (hideOnMobile ? ' pf-hide'    : '')
```

Writing a visibility flag into `data` is not an error you will see. It is accepted, stored, and does
nothing. `fields.md` names the slot for every field for exactly this reason.

> Checked: `stores/element/element-render.tsx:62-67`. The four classes above are appended in the shared
> render path, so every element type supports all four regardless of what else it declares.

### `styleData` is breakpoint, then selector, then CSS

```js
styleData: {
  all:    { '&': 'padding: 24px;', '& .pf-accordion-body': 'font-size: 16px;' },
  mobile: { '&': 'padding: 12px;' },
}
```

- Breakpoint keys are exactly **`all`**, **`laptop`**, **`tablet`**, **`mobile`**.
- `all` is the base. A narrower breakpoint overrides it; it does not replace the whole rule.
- Selector keys are ampersand-relative. `&` is the element itself, `& .pf-accordion-body` a part inside it.
- The value is a **CSS string**, not an object.

Which selectors an element actually has is not free-form. `fields.md` lists them per element under
"Styleable parts", with what each one is for. Writing a selector the element does not own produces CSS
that either does nothing or loses to a more specific rule.

> Checked: `TREATMENT_STYLE_DEVICES` in `web/shared/constants/treatment-style-policy.ts` for the key set,
> and `features/flymate/composer/style-merge.ts` for the `styleData[device][selector]` access shape.

## What may go inside what

Not covered here. `nesting.md` in this folder is generated from the editor's own drag-and-drop rule and
lists, per container, exactly which element types it accepts. Use that rather than guessing from examples.

## What this file deliberately does not tell you

- **Global styling, page settings and theme integration.** A page document carries more than its items;
  only the item shape is described here.
- **How ids are allocated.** They are unique within a page and that is all you need to author one.
- **Whether a field exists.** `fields.md` is the field list, and it carries its own caveat: it describes
  what the AI editing agent knows, which is a large subset of the editor rather than provably all of it.
