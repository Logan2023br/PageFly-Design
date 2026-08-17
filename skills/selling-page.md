---
scope: design
name: selling-page
version: 1.0
---

# A page that sells, not a brochure

A clean page with a hero, some features and an FAQ is a brochure. It is not
wrong; it is unfinished. What separates a store that converts from one that
merely looks tidy is evidence — other people bought this, it arrives, it can be
sent back. That evidence is missing from most generated pages and is the single
biggest gap between them and a real store's homepage.

Apply this to `home`, `product`, `collection`, `lp-*`, `upsell`, `sale`,
`bundle` and `comparison`. Skip it entirely on `password`, `login`, `404`,
`legal`, `dashboard`, `order-tracking`, `blog-article` and `careers` — proof
does not belong on those, and adding it reads as desperation.

## 1. Social proof is not optional

**Every selling page carries at least one review section.** A page with none is
incomplete, no matter how good the rest is.

There is no review element in the vocabulary. Build a card from what exists —
this is the shape, copy it:

```json
{"type":"col","css":{"gap":"12px","padding":"24px","background":"#FFFFFF","borderRadius":"10px","border":"1px solid rgba(0,0,0,.08)"},"children":[
  {"type":"row","css":{"gap":"2px"},"children":[
    {"type":"icon","name":"star","css":{"fontSize":"15px","color":"<accent>"}},
    {"type":"icon","name":"star","css":{"fontSize":"15px","color":"<accent>"}},
    {"type":"icon","name":"star","css":{"fontSize":"15px","color":"<accent>"}},
    {"type":"icon","name":"star","css":{"fontSize":"15px","color":"<accent>"}},
    {"type":"icon","name":"star","css":{"fontSize":"15px","color":"<accent>"}}
  ]},
  {"type":"heading","level":4,"text":"Short verdict, 2-5 words","css":{"fontSize":"15px"}},
  {"type":"text","text":"Two or three sentences in the customer's own words. Specific. Mentions the thing they were worried about and what actually happened.","css":{"fontSize":"14px","lineHeight":"1.6","opacity":"0.8"}},
  {"type":"text","text":"— First name L.","css":{"fontSize":"13px","opacity":"0.6"}}
]}
```

**Three to six cards, in a `row` of 3 columns** (1 on mobile). Above them a
heading and one line carrying the aggregate: `"4.8 / 5 from 2,000+ customers"`.

Write reviews the way customers write:

- Name the objection, then answer it. "I was worried it would be too strong for
  sensitive skin. Three weeks in, no reaction at all."
- One concrete detail per review — a number, a place, a length of time.
- Vary the length. Six reviews of identical length read as invented, because
  they are.
- Never five stars on every card. One four-star with a mild reservation makes
  the other five believable.
- No exclamation marks, no "Amazing product!!!", no marketing voice.

## 2. Numbers, above the reviews

One `row` of three, immediately before or after the review band:

```
92%   would recommend it
88%   buy a second one
4.8   average from 2,000+ reviews
```

Big number in the display face at 34-44px, one muted line under it. This is the
cheapest section on the page and the one a visitor reads first.

## 3. A trust row under the hero

Four items, one `row`, right after the hero — never lower. Icon at 20px, a
2-4 word label, one short line:

```
truck    Free delivery      Orders over $50
shield   2-year warranty    No questions asked
refresh  30-day returns     Return it if it is not right
lock     Secure checkout    Every card, encrypted
```

Use icons from the set: `truck` `shield` `refresh` `lock` `check` `clock`
`creditcard` `package` `award` `heart` `leaf` `sparkles`.

## 4. Price the way a shop prices

Whenever the buy box appears, set `compareAt` above `price`. It exports as a
struck-through original and is the difference between a number and an offer:

```json
{"type":"product","title":"...","price":"$119","compareAt":"$180","atcText":"Add to cart","swatches":4}
```

Both numbers are placeholders and both are replaced on import — PageFly binds
the buy box to a real product in the merchant's store, so what ships is their
title, their price and their own sale price. Write a plausible pair anyway: the
merchant is approving the SHAPE of the buy box, and one showing a single price
does not tell them their sale price will appear.

Keep the pair believable — 25-40% off. `$980` struck through above `$119` reads
as a lie even as a placeholder.

## 5. One dark band

A page in a single tone reads flat however good the copy is. Give **exactly
one** section a dark background — near-black, or the deepest colour in the
palette — with light text on it, and put the reviews or the closing CTA there.

Not two. Two dark bands is a stripe, not an accent.

## 6. Ask more than once

A visitor decides at different depths. On a `home` or `lp-*` page place the
primary action three times: in the hero, once mid-page after the proof, and in
a closing section. Same words every time — a button that says "Shop now" then
"Get yours" then "Order today" reads as three different offers.

The closing section is a heading, one line, one button, and generous padding —
120-160px. Nothing else.

## 7. What cannot be built

There is no form element and no carousel. If the reference or the brief shows a
contact form or a testimonial slider, build the nearest honest thing — a
section with an email address and a heading, or a static row of three cards —
and do not fake the rest. A mockup that shows a form the merchant will not get
is worse than one that never showed it.
