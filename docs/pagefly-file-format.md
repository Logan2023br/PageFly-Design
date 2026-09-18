# The `.pagefly` import file

**Why this file exists.** `MD Json PageFly/` documents the PageFly element model — every
element, every field, every legal nesting. It does not document the *container* that a
page is imported from: the zip, its single entry, the top-level keys, or the parallel
`styles` array. That knowledge came from `pagefly-template-builder/`, which is being
removed, and `lib/pagefly/builder.ts` depends on all of it. So it is recorded here.

**Trust level, and the order it now runs in.** There are three sources here and they
do not agree. In descending authority:

1. **`reference/all-elements.pagefly`** — a page the PageFly editor itself exported,
   99 element types, imports clean. It shows what a correct file IS.
2. **`MD Json PageFly/fields.md`** — generated from the application's registry. It
   describes what a field is FOR, and its placement notes describe one authoring path
   among several.
3. **This file** — the container, confirmed by round-tripping.

Where 1 and 2 disagree, 1 wins: `fields.md` says `Tabs3` takes no child nodes and the
editor's own export gives it five. See the last section.

## The container

A `.pagefly` file is a **zip archive holding exactly one entry**, named `1 - <page name>.json`.

```json
{
  "selectedFonts": {},
  "customJS": "",
  "customCSS": "",
  "pageflyVersion": "4.26.3.55",
  "editorVersion": "Flex",
  "items": [ ... ],
  "styles": [ ... ],
  "type": "page",
  "globalSectionData": []
}
```

`customJS` and `customCSS` survive the import and run on preview and live — not in the
editor canvas, which is why JS that "does not work" there usually does work published.

## `items[]`

```json
{ "__v": 0, "id": "<uuid>", "type": "FlexBlock", "data": { ... },
  "children": ["<uuid>", "..."], "styles": [], "createdAt": "ISO", "updatedAt": "ISO" }
```

- Ids are **UUIDs**, not the numeric ids used by the editor's own page document.
- The tree root is `Body` → `Layout` → one or more `FlexSection` → content. Both `Body`
  and `Layout` are required and carry no styles.
- **The per-item `styles` field is always `[]`.** It is a decoy. Real styles live in the
  top-level `styles` array, keyed by the same id.

## `styles[]`

```json
{ "__v": 0, "id": "<same uuid as the item>", "type": "<same type>",
  "styles": "<JSON STRING of the styleData object>", "createdAt": "ISO", "updatedAt": "ISO" }
```

Note the double encoding: `styles` is a **string containing JSON**, not an object. Entries
with no `id` are per-type defaults — do not generate them.

The decoded object is the `styleData` shape the new reference documents:
`{ all: { "&": "css" }, mobile: { "&": "css" } }`.

## Clipboard payload (paste into the editor)

A different serialisation of the same tree, for pasting rather than importing:

```json
{ "pageflyData": [ { "id": 0, "type": "...", "data": {}, "styleData": null, "children": [1, 2] } ] }
```

- **Flat array, numeric ids, bottom-up: leaves first and the root LAST with id 0.**
- Exactly one root. Ids are relative and get renumbered on paste.
- `Dropcap` nodes additionally need a node-level `roomId` string; sibling `ContentListItem`s
  share one `roomId`, since it is a scope id rather than an identity.

## Failure signatures

These fail silently in the editor — it renders an empty block and reports nothing — which
is why `validate()` in the builder is not optional.

| Symptom | Cause |
| --- | --- |
| Paste shows a styled but EMPTY block | malformed children: a duplicate id, or an orphan reference |
| Paste shows nothing at all | an unknown `type` anywhere — the whole payload is rejected |
| A text element is missing after paste | wrong versioned name (`Heading` instead of `Heading2`) |
| Accordion opens to an empty body | content not placed inside `Accordion3.Flex.Content` |
| Custom CSS "not working" | `::hover` instead of `:hover`, or Liquid `{{` eaten on publish |
| JS "broken" | it is the editor: `customJS` runs on preview and live only |
| Text set one letter per line, **in the editor only** | a layout rule was written into `customCSS` — see below |

## Layout may not live in `customCSS`

`customCSS` runs on preview and live and **not in the editor canvas**, so any rule there
that decides where a box ends up is missing from the first place a merchant sees the page.

This is not theoretical. The page's own `max-width`/`width: 100%` cap lived in `customCSS`
as `.pf-design-export { … }`, and every block beneath it is `--pf-flex-layout-width: fill`,
which the engine expands to `flex-grow: 1; flex-basis: 0px`. A chain of those resolves to
nothing unless something states a real width — so in the editor the page had no definite
width at all and text bands came apart one character per line. Preview and live were fine.
Three separate commits "fixed" it by rewriting a `min-width` rule in that same stylesheet.

The floor and the cap now live in each element's own `styleData`, which the editor reads:
`cssAt` and `pageflyFromTree` in `lib/design/toPagefly.ts`, `cssFor` and
`pageFromBreakpoints` in `lib/pagefly/fromDom.ts`. `scripts/test-export.ts` asserts that
neither a `min-width` nor a page cap comes back into `customCSS` on either path.

What belongs in `customCSS`: the webfont `@import`, and resets that stop the host theme's
base styles reaching the tree. If a rule added there would move a box, it is in the wrong
place.

## Liquid

Shopify's Liquid engine consumes `{{` and `{%` on publish. Neither `customJS` nor any
`Custom.HTML` `code` may contain them; the builder rejects both rather than shipping a
page that breaks only once published.

## The reference export, and what it settled

`reference/all-elements.pagefly` is a product page built by hand in the PageFly
editor — 480 items, 99 element types, imports clean. It is the only artefact in
this repository that shows the shape of a correct file rather than describing
one, and it is now the thing `scripts/test-conformance.ts` compares our output
against.

**It overruled the field reference in one place.** `fields.md` says of `Tabs3`:
"single block — emit the type alone, no child nodes; the renderer owns the tab
structure". The editor's own export has `Tabs3` holding a `TabsMenu3`, a
`TabContentWrapper3`, a `DropdownButton` and two loose `TabHeader3`s, with a
heading and a `ProductDescription` inside a panel. The note describes an
authoring path; the file is what opens.

**Five things it settled that nothing else could.**

| | What the file shows |
| --- | --- |
| `className` | PageFly writes it on **none** of 480 elements. It uses `classGlobalStyling`, and its own CSS targets those classes. 42 values carry several classes separated by spaces. |
| Page scope | Custom CSS is scoped `#__pf`, 92 times. `customJS` finds the page with `getElementById('__pf')`. A class we attach can fail to; an id PageFly wraps the page in cannot. |
| `Icon2` | Present on every `Button2`, `TabHeader3`, `Accordion3.Header`, `Form2.Button2` and `ProductATC2` — **even with `showIcon: false`**. "Config, shown by showIcon" reads as optional and is not. |
| `Tabs3` slots | Five, not two: menu, wrapper, `DropdownButton`, and two `TabHeader3` scroll arrows carrying `isNavButton: "start"` / `"end"` where menu headers carry `false`. |
| `TabHeader3.activeTab` | **Nothing.** Two exports of the same page disagree — one has the menu headers at 0,1,2 and the other has all three at 0 — and both import clean. Stale editor state; no reader depends on it. |

**What it did not settle, and the cost of calling that cosmetic.** The report
lists ~36 types that still diverge, most of them missing `classGlobalStyling`,
`name` or `placeholder`. Those three read as editor conveniences and the whole
list was once dismissed on that basis. That dismissal hid a crash for three
turns: `Tabs3` showed "Something went wrong" in the editor, and the report had
been printing `Tabs3 missing: icon, tabMenuLayout, targetStyle` the entire time.

So read a divergence by what the field DOES, never by the company it keeps:

| | Why it mattered |
| --- | --- |
| `Tabs3.tabMenuLayout` | A per-breakpoint object, exactly like `fitted` and `align` beside it. A component that reads `.mobile` off one of those and finds the object absent **throws** — it does not fall back. |
| `Tabs3.icon` | The chevron `DropdownButton` draws. |
| `Tabs3.targetStyle` | How the element finds its own style bucket. |
| `TabsContent3.name` | `"TAB_CONTENT"` — an uppercase literal, identical on every panel in both exports. Every other `name` in an export is prose a merchant typed. This one is the key a panel is looked up BY, and it could not have been guessed from `fields.md`. |
| the two nav `TabHeader3`s | Zero children in both exports. The `Icon2`-is-always-there rule is real for a header in the menu and wrong for a scroll arrow, which draws its own glyph. |

`REPORT=1 npx tsx scripts/test-conformance.ts` ranks the rest. Values are the
report's blind spot: `diff()` compares which keys exist and never what they
hold, so a wrong value passes it. `scripts/test-conformance.ts` asserts the
tabs family's values directly for that reason.

**When a newer export arrives**, replace the file and run the test. A divergence
that appears is either a change in PageFly or a habit of ours that was always
wrong; the version string in the report says which build answered.
