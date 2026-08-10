# Skills

One file per skill. Every `.md` in this directory is a skill; nothing in the code
names a specific one.

**Swapping a skill is: delete the old file, drop in the new one.** That is the whole
procedure. No import to update, no registry to edit, no build step.

## Scope

A skill may say what it is for, in YAML front matter:

```
---
scope: copy
---
```

| scope | Goes to |
| --- | --- |
| `copy` | the model that rewrites page copy |
| `export` | nothing yet — knowledge for building `.pagefly` files, which this repo does in TypeScript |
| omitted | everywhere |

Scope is not bookkeeping. The first skill here is 18KB about constructing PageFly
payloads; unscoped, it cost 7,000 input tokens on every page of every build and told
a copywriter nothing about the merchant.

A skill is instructions for a model — it does nothing on its own. Today nothing reads
this directory: page generation is deterministic code and never calls a model. These
files become live when AI generation ships, at which point every `.md` here is
concatenated into the system prompt.

## What is here

| File | What it teaches | Affects |
| --- | --- | --- |
| `pagefly-template-builder.md` | building PageFly Flex payloads from a design | the `.pagefly` export, not the mockup |

## Known conflicts

`pagefly-template-builder.md` states `clickAction: "url" \| "none"`. The generated
reference in `MD Json PageFly/fields.md` gives the enum as
`url \| popup \| section \| email \| phone` with an unset default — `"none"` is not a
member, and the exporter stopped emitting it deliberately. Left as written rather than
edited, because a skill is the author's text; but a model following it will reproduce
the bug.

Its `pagefly_builder.py` spec also assumes Python. This repository builds `.pagefly`
files in TypeScript in the browser (`lib/pagefly/builder.ts`), because generation is
client-side and there is no server hop to run a script on. The rules the spec encodes
are right; the language is not, for this codebase.
