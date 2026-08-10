# The `.pagefly` import file

**Why this file exists.** `MD Json PageFly/` documents the PageFly element model — every
element, every field, every legal nesting. It does not document the *container* that a
page is imported from: the zip, its single entry, the top-level keys, or the parallel
`styles` array. That knowledge came from `pagefly-template-builder/`, which is being
removed, and `lib/pagefly/builder.ts` depends on all of it. So it is recorded here.

**Trust level.** Everything below was confirmed by round-tripping real files through the
builder and unzipping the result, but it has NOT been re-checked against the new
reference — the new reference does not cover it. If the two ever disagree about an
element's `type` or fields, `MD Json PageFly/fields.md` wins; it is generated from the
application's own registry. This file is only authoritative about the container.

**Still unverified.** No real `.pagefly` exported from a live store has been compared
against what this builder produces. Until one is, treat the container shape as
"works in testing", not "known correct".

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

## Liquid

Shopify's Liquid engine consumes `{{` and `{%` on publish. Neither `customJS` nor any
`Custom.HTML` `code` may contain them; the builder rejects both rather than shipping a
page that breaks only once published.
