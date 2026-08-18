---
scope: design
name: rulebook2
version: 1.0
---

# Motion and section rhythm

## 1. Motion

Any node may carry an `anim` object. Both keys are optional.

```json
{ "type": "button", "text": "Shop now", "anim": { "hover": "float" } }
{ "type": "section", "role": "proof", "anim": { "reveal": "fade-up" } }
{ "type": "col", "anim": { "reveal": "fade-up", "delay": 2 } }
```

- `hover` — one of `float` · `shadow` · `grow` · `glow` · `float-shadow` · `grow-shadow`. Works on any node.
- `reveal` — one of `fade` · `fade-up` · `slide-left` · `slide-right` · `zoom`. Plays once when the node scrolls into view.
- `delay` — 0–6, steps of 80ms. Only meaningful alongside `reveal`, and only to stagger siblings.

Nothing else animates. Do not write `transition`, `animation`, `@keyframes` or `transform` into `css` — `transform` is stripped and the rest will not survive export.

### When to use hover

Every button that leads somewhere gets a hover. Which one depends on what is being sold:

| Trade | Hover | Why |
|---|---|---|
| electronics, tools, auto, B2B, SaaS, finance | `shadow` | precision reads as a surface lifting, not a shape growing |
| skincare, supplements, medical, jewelry, luxury | `glow` | soft light; a jumping button undercuts a premium price |
| fashion, footwear, home decor, furniture | `float` | quiet, and it never distorts a photograph |
| food, coffee, alcohol, toys, pets, kids, events | `grow-shadow` | warmth is allowed to be physical |
| everything else | `float` | |

Cards in a grid that a visitor clicks — a product card, a blog card, a category tile — get the same hover as the buttons. Nothing else does. A hover on a heading, a paragraph, an icon or a static photograph is noise.

### When PageFly has no such animation

The two fields above are the ones PageFly ships. They are not the ceiling.

**If an effect belongs on the page and neither field can express it, write it.**
A `custom` node takes `html`, `stylesheet` and `js`, and all three reach the
real page — the markup as a Custom.HTML element, the stylesheet on the page's
own stylesheet, the script in its custom JS. That is how a wave divider between
bands, a count-up from 0 to 92%, a marquee of logos, a progress ring or a
gradient border gets built.

```json
{"type":"custom","label":"wave divider",
 "html":"<svg class='w' viewBox='0 0 1200 120' preserveAspectRatio='none'><path d='…'/></svg>",
 "stylesheet":".w{width:200%;animation:drift 18s linear infinite} @keyframes drift{from{transform:translateX(0)}to{transform:translateX(-50%)}}"}
```

Four things to know before writing one:

- **The stylesheet is scoped for you.** Write `.w`, never `.pfd-c-1 .w`. An `&`
  on its own means the block's own element. Two blocks may both call something
  `.card` without colliding.
- **`js` runs once, with `root` already bound** to this block's element. Do not
  query the document — four device frames render the same page at once.
- **CSS animation beats JS animation.** `@keyframes` runs in the PageFly editor,
  on the live page, and with JavaScript disabled. A script does not run in the
  editor at all.
- **No `<script>` tags, no `onclick`, no `<iframe>`.** They are stripped, and
  the block ships without them rather than failing — so the effect quietly
  breaks instead of announcing itself.

Do not reach for `custom` when a field exists. A hover written by hand where
`hover: "float"` would do is a hover the merchant cannot change in the editor.

### When to use reveal

Give `reveal` to **sections below the fold only**. Never to the first section: it is on screen before the observer runs, so a hero that reveals is a hero that flickers.

- Statement sections, one big idea → `fade-up`
- A row of cards, features or steps → put `reveal` on each card with `delay` 0,1,2,3 rather than on the section, so they arrive in sequence
- A two-column block where image and text sit side by side → `slide-left` on one, `slide-right` on the other
- `zoom` is for a single full-bleed photograph, at most once per page
- `fade` when the section is dense and anything else would be busy

Cap it. **At most four revealing sections per page**, and never two adjacent sections with the same reveal value. A page where everything slides in has no emphasis left to spend.

Skip motion entirely when the merchant's brief asks for calm, clinical, editorial, minimal or medical, and on `password`, `login`, `404`, `dashboard`, `order-tracking`, `thank-you` and `legal` pages.

## 2. Section rhythm

The count for this page is given in the user message. These four rules matter more than the number:

1. **No two adjacent sections share a role.** Two grids in a row is a catalogue, not a page. Roles are: hero · proof · media · content · conversion · utility.
2. **After at most two text-dense sections, one full-bleed image section.**
3. **Exactly one signature section** — it gets the best photograph, the largest type, the full-bleed treatment. A page where every section is developed equally reads flat no matter how many it has.
4. **Vertical padding takes at least three distinct values** across the page: statement 120–160px · standard 88–96px · dense grid 72–80px · utility row 48–64px. One padding value throughout is the fastest way an otherwise correct page still looks machine-made.

Count only sections in normal flow. Sticky bars, popups, announcement bars, header and footer do not count.

Eight identical sections is still a basic page. Seven with rhythm is not.
