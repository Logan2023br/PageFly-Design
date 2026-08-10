# PageFly element knowledge

A reference for the PageFly gen-2 element model: what each element is, what fields it takes, what may
be nested inside what, and how a page document is shaped.

Written for people building templates who do not read the application source.

## Start here

| File | What it answers | How it is produced |
| --- | --- | --- |
| [`page-json.md`](page-json.md) | How a page document is structured: the node shape, how nesting is expressed, where settings and CSS live | Hand-written |
| [`fields.md`](fields.md) | Every gen-2 element, every field, allowed values, what each field does, which parts are styleable | Generated |
| [`nesting.md`](nesting.md) | Which elements may sit inside which containers | Generated |

Read `page-json.md` first. The other two assume you know the document shape.

## Coverage

```
 95 element types with full field documentation
419 fields, every one carrying a description
241 elements in the nesting table
```

## How to trust these files

**The two generated files are derived, not written.** `fields.md` comes from the element-knowledge
registry that drives PageFly's AI editing agent. `nesting.md` is computed from the editor's own
drag-and-drop rule by evaluating it for every ordered pair of element types, so it reports what the
editor actually permits rather than someone's summary of it.

Each generated file records the source commit it was built from, in its header.

**Both state their own gaps.** Where a rule could not be resolved, the file says so and names the
affected elements instead of quietly omitting them. Read those sections; they are short and they matter.

**`page-json.md` is hand-written and can fall behind the product.** Every claim in it names the source
file that verifies it, so any statement can be re-checked. If it disagrees with the editor, the editor
is right.

## Two things that surprise people

**A page is a flat array, not nested JSON.** Nesting is expressed by id references. `page-json.md`
covers this first for that reason.

**Some elements do not hold their own text.** A button's label lives in a separate child node. `fields.md`
records, per element, whether copy lives on the element itself or on a child.

## Regenerating

The generators live in the PageFly application repository and read its source directly, so they are not
included here. Regenerating means running them there and copying the two generated files across.

## Scope

This describes gen-2 elements. Legacy element generations are excluded from `fields.md` and are marked as
out of scope in its header; `nesting.md` includes them, since the editor's nesting rule applies to both.
