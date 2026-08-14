---
scope: design
name: design-rulebook
version: 1.0
---

# PageFly Design Rulebook

You are generating a page that must be indistinguishable from one a senior
human designer built. This file is the standard you are held to. It is not
inspiration — every rule here is checkable, and a page that violates the
BAN LIST in §1 is rejected regardless of how good the rest of it is.

## §0 — How to read this file

**Precedence, highest first.** When two rules conflict, the higher one wins.

1. Merchant's explicit instruction in the brief
2. §1 BAN LIST (never overridden by taste)
3. §9 industry row for the brief's `vertical`
4. §7 archetype arc
5. §6 page-type minimums
6. §2 type system, §4 motion budget
7. §5 pattern specs
8. Your own judgment

**Two hard gates before you emit anything.** Run §10. If a gate fails, fix it
and re-run. Do not emit a page that fails a gate with an apology attached.

**When information is missing, do not invent it.** No fake statistics, no
invented certifications, no "n=120" without a source, no award badges. A
section with no real content is deleted, not filled with placeholder claims.
Deleting it and going one section shorter is always the better choice.

---

## §1 — THE BAN LIST: what "basic" looks like

This is the most important section in the file. Each ban is a specific,
recognisable pattern that marks a page as machine-made. For each: what it is,
why it reads as amateur, what to do instead.

### B1 — The centred feature trio
**Banned:** a row of 3 (or 4) equal-width cards, each with a small centred
icon, a bold heading, and two lines of body copy. Optional light border or
soft shadow. Centred section heading above it.
**Why:** this is the single most common layout in template-generated pages. It
carries no information a list wouldn't, gives every point identical weight, and
is instantly recognisable as a default.
**Instead:** decide which of the three points is actually the strongest and give
it 60% of the space with a real image. Demote the other two to a compact
two-column text pair beneath, or fold them into a spec grid. Unequal weight is
the entire point — see `feature-hero-plus-two` (§5).

### B2 — Every section centred
**Banned:** section heading centred, subheading centred beneath it, content
centred below that, on every section of the page.
**Why:** centring is a statement. Used once it emphasises; used eight times it
means nothing, and the page loses any left edge for the eye to track.
**Instead:** at most **2 centred sections per page** — typically one statement
band and the final CTA. Everything else is left-aligned to a shared grid edge.

### B3 — Uniform section chrome
**Banned:** every section with the same padding, same background colour, same
max-width container, same gap.
**Why:** a page with no rhythm reads as a document, not a designed surface.
**Instead:** alternate. Every page needs at least **2 full-bleed sections**
(one of them not the hero) and at least **2 distinct background treatments**
(e.g. surface / ink-dark / image-backed). Padding varies by section role:
statement bands get 120–160px vertical, dense grids 80–96px, tight utility rows
48–64px.

### B4 — Non-uniform children in a repeated group
**Banned:** in any repeated set — stats, cards, steps, list items — one item
missing an icon, one with a different heading size, one whose text runs to a
different width, one with an extra line.
**Why:** this is the loudest possible amateur signal, and it is a structural
error, not a taste one. A human designer physically cannot produce it because
they build one item and duplicate it.
**Instead:** every item in a repeated group carries **exactly the same slots**.
If one item has no icon, no item has an icon. If one has a 2-line body, size all
bodies to the longest and accept the ragged bottoms, or cut the long one.
Build the item once, then repeat.

### B5 — Two-size typography
**Banned:** a page whose entire type system is "big heading" + "body", with
sub-headings set at body size in bold.
**Why:** hierarchy needs at least 4 visible levels for a reader to navigate
without reading. Two levels means everything is either a title or undifferentiated.
**Instead:** §2. Minimum **4 type roles visible per page**, and an `eyebrow` or
`label` role present somewhere — that small, tracked, uppercase layer is one of
the fastest ways a page reads as professionally set.

### B6 — Uniform image treatment
**Banned:** every image the same aspect ratio (usually 4:3 or 1:1), same corner
radius, same size, all inside the container, none bleeding, no crop variety.
**Why:** real designed pages vary crop aggressively — a tall portrait next to a
wide letterbox is what creates visual interest without any decoration.
**Instead:** per page, use **at least 3 different aspect ratios** from
{0.5 wide-cinematic, 0.66, 0.75, 1.0, 1.25, 1.4 tall-portrait}. At least one
image bleeds past the container edge. Product cut-outs on flat colour do not
count toward image variety.

### B7 — Studio product shot on a white section
**Banned:** a product photographed on a white or grey seamless background,
placed on a white or light section.
**Why:** it is a catalogue asset, not a page asset. The product floats with no
scale reference and no context.
**Instead:** context photography — product in use, in an environment, held, worn,
installed. White-background cut-outs are permitted **only** inside a buy box,
variant swatch, or comparison table cell.

### B8 — Decorative accent colour
**Banned:** accent colour applied inconsistently — two of three icons tinted,
one heading word coloured for no reason, a random underline.
**Why:** an accent is a signal. Inconsistent application destroys the signal and
looks like an unfinished pass.
**Instead:** **one accent job per section, stated.** Either (a) all icons in this
section, (b) one word or phrase in the heading, (c) the CTA only, or (d) a rule /
divider. Never two of these in the same section. Exception: `spec-grid` and
`stat-strip`, where accent goes on **all** icons and nothing else.

### B9 — Gradient-button-on-white-card SaaS default
**Banned:** purple/blue linear-gradient buttons, gradient headline text, glassy
white cards with 12px radius and a soft blue shadow, floating on a light grey
page.
**Why:** it is a 2018 template look with no relationship to any product.
**Instead:** derive from the brand palette. Flat accent fill or outline. Gradients
only when the brief's style is `y2k`, `glass`, or `tech`, and then on a
background or a large surface, never on a small button and never on body text.

### B10 — "Why choose us"
**Banned:** a section literally headed "Why Choose Us", "Our Benefits", "Why
Us?", "What Sets Us Apart", or "Our Features".
**Why:** it announces marketing. The content underneath is always generic
because the heading invited generic content.
**Instead:** name the actual claim as the heading. Not "Why Choose Us" but
"Rebuilt for 46 minutes in the air". The heading should be falsifiable.

### B11 — Adjective copy
**Banned:** "Quality you can trust" · "Elevate your everyday" · "Premium
materials" · "Every frame, flawless" · "Designed with you in mind" ·
"Experience the difference" · "Unmatched performance" · "Crafted to perfection".
**Why:** these sentences survive if you swap the product for any other product.
That is the test they fail.
**Instead:** every claim carries a number, a material, a process, a duration, a
place, or a named person. If you cannot attach one of those six, delete the line
rather than pad it. `stat-value` slots take measured values with units.

### B12 — Emoji as iconography
**Banned:** 🚀 ✨ 💎 🔥 as section icons or bullets, in any style.
**Instead:** the icon set. If no icon fits the concept, use no icon — an
un-iconned list is fine; a mismatched emoji is not.

### B13 — Uniform radius and shadow
**Banned:** the same border-radius on every element and a soft drop shadow on
every container.
**Why:** shadow-on-everything flattens hierarchy; it says nothing is more
elevated than anything else.
**Instead:** radius from the style token, applied to **media and interactive
surfaces only** — not to sections, not to text blocks. Shadow on at most
**2 element types per page**, and never on a section.

### B14 — Symmetric 50/50 splits throughout
**Banned:** every two-column section split exactly down the middle.
**Instead:** asymmetry as default — 58/42, 62/38, 66/34, or 40/60 with the text
column narrower than the media. A true 50/50 is allowed once per page, when the
two sides are genuinely peer content (e.g. a before/after pair).

### B15 — The identical testimonial trio
**Banned:** three same-size quote cards, each with a circular avatar, a name, a
5-star row, and 2 lines of quote.
**Instead:** one quote large enough to read as a statement (28–40px, in a
full-bleed band) plus a denser wall of shorter real reviews beneath; or a
masonry wall of unequal-height cards with customer photos. Star rows only when
there is a real aggregate rating and a real count.

### B16 — Stats without units or denominators
**Banned:** "10K+ Happy Customers", "99% Satisfaction", "5 Star Rated", "#1
Choice".
**Instead:** units always ("46 minutes", "1000 W", "150 kg", "3 years"). Rates
carry a denominator or are dropped. Superlatives require a named source.

### B17 — Repeated identical CTA
**Banned:** the same button label and styling repeated 4+ times down the page.
**Instead:** at most **2 primary CTA instances** (one near the top, one closing
band) plus a sticky bar. Intermediate CTAs use a different, quieter form — text
link with arrow, or an in-section secondary action with a different label.

### B18 — Icon-bullet list where a grid belongs
**Banned:** 6+ measurable facts presented as a vertical icon+heading+paragraph
list.
**Instead:** `spec-grid` (§5). Vertical lists are for sequential or narrative
content only — steps, FAQs, timeline.

### B19 — Uniform gap
**Banned:** the same gap value (usually 24px) between every element at every
level.
**Instead:** gap encodes relatedness. Inside a group 8–16px, between groups
32–48px, between a section's major columns 56–80px. If a reader cannot tell
which label belongs to which value by spacing alone, the spacing is wrong.

### B20 — No large type anywhere
**Banned:** a page whose largest type is 32–40px.
**Why:** scale is free and is most of what makes a page feel designed.
**Instead:** the `display` role on the hero is **56px minimum on desktop**, and
at least one non-hero section carries type at 40px+.

### B21 — Text-only coloured band
**Banned:** a section that is a flat brand-colour rectangle with a centred
sentence and nothing else.
**Instead:** if the statement deserves a full band, give it an image background
with a scrim, or oversized type that fills the band, or a real quote with
attribution. A coloured rectangle with 12 words in it is wasted height.

### B22 — Four-section page
**Banned:** hero → features → testimonials → CTA.
**Instead:** §6 minimums. That skeleton is the default shape of an unconsidered
page and a reader learns nothing from it.

### B23 — Hero carrying specs
**Banned:** a hero crowded with 4 spec chips, 2 badges, 3 CTAs, a rating row,
and a countdown.
**Instead:** the hero does **one** job — one claim, one image, one primary CTA,
optionally one trust line. Specs belong in section 2. A hero with more than 30
words of copy is over-loaded.

### B24 — Autoplaying carousel of things to read
**Banned:** auto-advancing slideshow whose slides contain sentences.
**Why:** it moves the content away from the reader mid-sentence.
**Instead:** carousels hold images or short labelled items only, advance on
interaction, and only exist when there are ≥5 peer items (§4).

### B25 — Every section container-width
**Banned:** `container: true` on all sections, so the page is one column of
1170px from top to bottom with nothing touching the viewport edges.
**Instead:** at least 2 sections set `container: false` and run full-bleed —
typically the hero, one image band, and the closing CTA.

### B26 — Section heading that restates the product name
**Banned:** "Our Products", "The Collection", "About the Product", "Features",
"Specifications", "Gallery".
**Instead:** headings say something. "Specifications" → "Every number, measured".
"Gallery" → the location or the story. Label-headings are permitted only on
utility pages (§6: shipping, size-guide, faq) where scanning matters more than
voice.

### B27 — Filler section to hit a count
**Banned:** adding a newsletter box, a logo strip with fake logos, or a "follow
us" band purely to reach the section minimum.
**Instead:** if you cannot fill the minimum with real content, go under the
minimum and say nothing about it. §6 minimums assume real content exists.

---

## §2 — Type system

### Roles

Every text node has one of these roles. Roles carry the size, weight, case, and
tracking — you do not invent per-section values.

| Role | Desktop | Weight | Case | Tracking | Line-height | Use |
| --- | --- | --- | --- | --- | --- | --- |
| `display` | 56–88 | 700–800 | as written | −0.03em | 0.95–1.05 | hero H1, one statement band |
| `section-head` | 36–56 | 700 | as written | −0.02em | 1.05–1.15 | section H2 |
| `sub-head` | 20–28 | 600 | as written | −0.01em | 1.25–1.35 | H3 inside a section |
| `stat-value` | 28–44 | 700 | as written | −0.02em | 1.0 | measured numbers |
| `body-lead` | 18–20 | 400 | as written | 0 | 1.5 | one paragraph under a display/head |
| `body` | 16–17 | 400 | as written | 0 | 1.55–1.65 | all other prose |
| `caption` | 13–14 | 400–500 | as written | 0 | 1.4 | under stats, under images |
| `label` | 12–13 | 600 | UPPERCASE | 0.08–0.14em | 1.2 | stat labels, tile labels |
| `eyebrow` | 12–13 | 600 | UPPERCASE | 0.12–0.16em | 1.2 | above a section-head |
| `button` | 14–16 | 600 | as written or UPPER | 0–0.06em | 1 | CTA text |

### Rules

- **Max 2 families per page.** One display family, one text family. A third is
  allowed only as `MONO` used exclusively on `label`/`caption`.
- **3–4 roles per section**, not more. A section using 6 roles has no hierarchy.
- **4+ roles visible per page**, and `eyebrow` or `label` must appear at least
  once (B5).
- **Measure:** `body` 60–75 characters per line — cap the text column, do not let
  prose run the full container. `display` 16–24 characters per line, which
  usually means it wraps in 2–3 lines and you choose the break.
- **Optical alignment:** when an icon sits beside a heading, align the icon's
  optical centre to the heading's cap-height, not its line box. When items in a
  group have icons, every item's text starts at the same x — including the ones
  whose icon is absent (there are none, per B4).
- **Mobile:** `display` ÷ 1.7 (min 32), `section-head` ÷ 1.45 (min 26),
  `stat-value` ÷ 1.35, `sub-head` ÷ 1.15. `body`, `caption`, `label` unchanged —
  never below 15px for body, never below 11px for label.
- **Numerals:** tabular figures for anything in a grid or table so columns align.

---

## §3 — Font library

All families below are on Google Fonts. Add whichever you use to the webfont
stylesheet — a family named but not loaded silently falls back and the page
loses its voice.

### Display families

| Family | Character | Best weights | Use for |
| --- | --- | --- | --- |
| `Anton` | ultra-condensed poster | 400 only | spec-led, streetwear, bold, sport |
| `Archivo Black` | heavy geometric | 400 only | neubrutalist, bold, sport |
| `Archivo Narrow` | condensed workhorse | 600 700 | spec-led, industrial, mobility |
| `Barlow Condensed` | technical condensed | 600 700 | tools, auto, moto, sport |
| `Bebas Neue` | condensed caps | 400 only | streetwear, events, fitness |
| `Oswald` | condensed, slightly humanist | 500 600 700 | outdoor, hunting, team sport |
| `Space Grotesk` | quirky-technical | 500 700 | tech, electronics, saas, gaming |
| `Sora` | precise geometric | 600 700 | tech, smart-home, clinical beauty |
| `Outfit` | clean geometric | 600 700 800 | subscription, saas, modern d2c |
| `Manrope` | neutral confident | 700 800 | b2b, consultative, finance |
| `Syne` | wide expressive | 700 800 | y2k, creator, art |
| `Unbounded` | display geometric, loud | 700 800 | y2k, retro, playful |
| `Bricolage Grotesque` | contemporary editorial | 600 700 | editorial, agency, press |
| `Playfair Display` | high-contrast serif | 600 700 | luxury, jewelry, fragrance |
| `Bodoni Moda` | extreme-contrast serif | 500 700 | luxury fashion, high jewelry |
| `DM Serif Display` | warm high-contrast | 400 only | beauty, bakery, editorial |
| `Instrument Serif` | modern literary | 400 only | craft, coffee, editorial |
| `Fraunces` | soft-serif with wonk | 500 600 700 | craft, organic, handmade, food |
| `Cormorant Garamond` | delicate old-style | 500 600 | luxury, wine, fine dining |
| `Marcellus` | inscriptional | 400 only | real estate, hospitality, spa |
| `Newsreader` | reading serif | 500 600 | editorial, nonprofit, long-form |
| `Baloo 2` | rounded friendly | 600 700 | kids, toys, pets |
| `Fredoka` | soft display | 500 600 | kids, playful, party |
| `Lilita One` | chunky playful | 400 only | toys, snacks, events |

### Text families

`Inter` (default neutral) · `Plus Jakarta Sans` (warm neutral) · `Work Sans`
(humanist) · `Karla` (quirky humanist, pairs with serifs) · `Jost` (geometric,
pairs with luxury serifs) · `Figtree` (friendly neutral) · `Public Sans`
(institutional) · `IBM Plex Sans` (technical) · `Nunito` (rounded) ·
`Quicksand` (soft rounded) · `Lora` (reading serif body) · `Spectral` (reading
serif body) · `JetBrains Mono` / `IBM Plex Mono` (labels, specs, code)

### Pairings by archetype and style

Pick one row. Do not mix rows.

| # | Display | Text | Label | Fits |
| --- | --- | --- | --- | --- |
| P1 | Archivo Narrow 700 UPPER | Inter 400 | Inter 600 UPPER 0.12em | spec-led · mobility · tools · industrial · `tech` `dark` `bold` |
| P2 | Anton 400 | Inter 400 | JetBrains Mono 500 UPPER | spec-led loud · sport · streetwear · `bold` `dark` |
| P3 | Space Grotesk 700 | IBM Plex Sans 400 | IBM Plex Mono 500 UPPER | electronics · gaming · saas · `tech` `glass` |
| P4 | Sora 700 | Inter 400 | Inter 600 UPPER 0.14em | smart-home · clinical beauty · devices · `minimal` `tech` |
| P5 | Barlow Condensed 700 UPPER | Work Sans 400 | Work Sans 600 UPPER | auto · moto · hunting · `bold` `retro` |
| P6 | DM Serif Display 400 | Jost 400 | Jost 500 UPPER 0.16em | skincare · cosmetics · fragrance · `luxury` `minimal` |
| P7 | Fraunces 600 | Karla 400 | Karla 600 UPPER 0.1em | craft · coffee · organic food · `organic` `handmade` |
| P8 | Instrument Serif 400 | Inter 400 | Inter 500 UPPER 0.12em | specialty food · editorial d2c · `editorial` |
| P9 | Bodoni Moda 500 | Jost 300 UPPER | Jost 500 UPPER 0.2em | high fashion · fine jewelry · `luxury` |
| P10 | Playfair Display 700 | Lora 400 | Jost 600 UPPER | wine · hospitality · bakery · `luxury` `editorial` |
| P11 | Cormorant Garamond 600 | Karla 400 | Karla 500 UPPER 0.18em | fine wine · spa · perfumery · `luxury` |
| P12 | Manrope 800 | Inter 400 | Inter 600 UPPER 0.1em | b2b · finance · medical · office · `minimal` `tech` |
| P13 | Outfit 700 | Figtree 400 | Figtree 600 UPPER | subscription · pet · cleaning · `playful` `minimal` |
| P14 | Archivo Black 400 | Archivo 400 | Archivo 700 UPPER | neubrutalist · streetwear · POD |
| P15 | Bebas Neue 400 | Plus Jakarta Sans 400 | Plus Jakarta Sans 600 UPPER | fitness · events · activewear · `bold` |
| P16 | Oswald 600 | Work Sans 400 | Work Sans 600 UPPER | outdoor · camping · team sport · `bold` `retro` |
| P17 | Baloo 2 700 | Nunito 400 | Nunito 700 UPPER | toys · baby · kids apparel · `playful` |
| P18 | Fredoka 600 | Quicksand 500 | Quicksand 700 UPPER | pets · snacks · party · `playful` |
| P19 | Bricolage Grotesque 700 | Inter 400 | Inter 600 UPPER | agency · press · portfolio · `editorial` |
| P20 | Newsreader 600 | Inter 400 | Inter 600 UPPER 0.12em | nonprofit · long-form · courses · `editorial` |
| P21 | Marcellus 400 | Jost 400 | Jost 500 UPPER 0.16em | real estate · resort · clinic · `luxury` `minimal` |
| P22 | Syne 800 | Space Grotesk 400 | Space Grotesk 600 UPPER | y2k · creator · art · `y2k` `retro` |
| P23 | Unbounded 700 | Figtree 400 | Figtree 700 UPPER | y2k · gaming merch · `y2k` `playful` |
| P24 | Jost 600 UPPER 0.06em | Inter 400 | Inter 500 UPPER 0.14em | scandi · home · lighting · `scandi` `minimal` |

### Pairing rules

- Display and text must differ in **either** classification (serif/sans) **or**
  width (condensed/normal). Two normal-width sans families is not a pairing, it
  is an accident.
- Condensed display families must be set UPPERCASE at `display` and
  `section-head` size or they look weak. Normal-width display families should
  not be uppercase above 40px.
- Never set a serif display below 20px — use the text family for `sub-head` if
  the serif is high-contrast (Bodoni, Playfair, Cormorant).
- `MONO` on `label` is a strong, cheap professional signal for spec-led, tech,
  and craft. Never use mono for `body`.

---

## §4 — Motion

### What PageFly actually supports

Only build motion from this list. Anything else must be verified in the element
reference before you use it; an unsupported field is dropped silently and the
page ships with dead markup.

| Capability | Where | Values |
| --- | --- | --- |
| Canned hover motion | Button, Image, Icon, ProductATC, cards | `float` `shadow` `grow` `glow` `float-shadow` `grow-shadow` |
| Sticky bar | FlexSection | `isStickyBar` + `stickyPosition: top\|bottom` + `triggerSectionId` |
| Parallax background | FlexSection | `parallax` + `parallaxBg` + `parallaxSpeed` + `parallaxRev` |
| Video background | FlexSection | `bgType: video` + `videoBg` + `filterColor` + `backgroundVideoLoading: lazy` |
| Carousel / slideshow | Slideshow, ProductList, MediaList | `slidesToShow` / `slidesToScroll` per breakpoint |
| Accordion open/close | Accordion | built-in grid transition + `scrollTop` |
| Hover image swap | Image, ProductImage | `onHover: NEXT_IMAGE \| LAST_IMAGE \| RANDOM_IMAGE \| ALL_IMAGE` |
| Image magnifier | ProductMedia | `enableImageMagnifier` |
| Before/after drag | before-after element | drag handle, styleable `.pf-ba-handle` |
| Popup | Popup | `popupTriggers: click-only \| delay \| scroll \| exit-intent` + `popupScrollPercent` + `popupAnimation` |
| Custom hover | any element with `&:hover` | `transform`, colour, border — write your own transition |

**Scroll-entrance reveal (fade-up on enter viewport) is not in the element
reference.** Do not assume it exists. If it is achieved via page custom CSS/JS,
two constraints are absolute:

- Custom JS runs on the **published page only, not in editor preview**. A
  merchant previewing the page will see no motion. Never let the page depend on
  it.
- **Never ship an element at `opacity: 0` waiting for JS.** If the script fails
  or is blocked, the content is permanently invisible. Entrance motion is a
  progressive enhancement layered on content that is already visible and
  correctly positioned.

### Budget

- **Max 3 motion types per page.** A page with six kinds of movement reads
  cheaper than a page with none.
- Motion serves one of three jobs: **reveal state** (accordion, hover swap),
  **signal interactivity** (hover on clickable things), or **hold a decision in
  reach** (sticky CTA). Motion with no job is deleted.
- `prefers-reduced-motion` is respected for anything you hand-write.

### Per-capability rules

**Hover motion (`animationHover`)**
- Only on elements that are clickable. Hover motion on a heading, a stat, or a
  paragraph is a bug.
- `grow` → image cards, product cards, category tiles. Scale 1.02–1.04, never more.
- `float` or `shadow` → buttons.
- `float-shadow` / `grow-shadow` → use sparingly; on light backgrounds only.
- `glow` → **only** when style is `dark`, `tech`, `y2k`, or `glass`. Glow on a
  light background is a defect.
- Pick one hover motion per element class and use it consistently across the page.

**Sticky bar**
- The highest-value motion in PageFly. Set `triggerSectionId` to the hero's id so
  the bar appears after the hero scrolls past — never visible on first paint.
- `stickyPosition: bottom` on mobile-first commerce; `top` when it carries
  navigation as well as an action.
- Contents: product name (short), price, one primary action. Nothing else.
- **Required** for spec-led and offer/subscription product pages. **Banned** on
  craft/origin and lookbook homepages, where it interrupts a slow browsing rhythm,
  and on all utility pages.

**Parallax**
- **Max 1 section per page.**
- `parallaxSpeed` 2–3. The default 4 is too fast and text over it smears.
- Only on a statement band with ≤12 words over it, or a pure image break with no
  text at all.
- Banned on any section with 3+ lines of copy, on any section containing a form
  or a CTA, and entirely in `minimal`, `scandi`, and `editorial` styles.
- Always pair with `filterColor` when text sits over it.

**Video background**
- Hero only. One per page.
- Requires `filterColor` at 25–45% opacity so text stays readable, plus a poster
  image, plus `backgroundVideoLoading: lazy`.
- Only when the merchant has real footage. Never with stock footage that does not
  show the actual product.
- Banned in `minimal`, `scandi`, `luxury` unless the brief explicitly asks.

**Carousel / slideshow**
- Only when there are **≥5 peer items**. With 3–4 items a grid shows everything;
  a carousel hides two-thirds to gain an arrow.
- Items must be images or short labelled tiles. Never sentences (B24).
- Advance on interaction. If an autoplay field exists, leave it off for anything
  readable; autoplay is acceptable only for a pure image marquee with no text.
- `slidesToShow` must show a **partial next slide** on desktop (e.g. 3.2) so the
  reader knows there is more. A carousel that looks like a static grid is a trap.
- Mobile `slidesToShow: 1` or `1.15`.

**Accordion**
- FAQ, spec tables with many rows, size charts. Not for primary selling content —
  content behind a click is content most readers never see.
- First item open by default only when it answers the most common objection.

**Hover image swap (`onHover`)**
- `NEXT_IMAGE` on product cards is **required** for lookbook archetypes — it is
  the one motion fashion shoppers expect.
- `ALL_IMAGE` only on grids of ≤4 cards; it is heavy.
- Requires that every product actually has a second image. If not, no swap.

**Before/after drag**
- Efficacy archetype and renovation/construction case studies only.
- Requires genuinely comparable images: same crop, same lighting, same distance.
  Mismatched pairs read as dishonest and are worse than no comparison.

**Popup**
- Default `click-only`.
- `delay` or `scroll` only when the brief asks for a capture mechanic; if used,
  `popupScrollPercent` ≥ 50 so it never fires before the reader has seen the offer.
- `exit-intent` only on explicit instruction.
- Never on a page whose primary job is a form (contact, wholesale, lead-gen).

### Motion set by archetype

| Archetype | Required | Allowed | Banned |
| --- | --- | --- | --- |
| A spec-led | sticky bar | hover `grow` on tiles, carousel ≥5 usecases, accordion specs, 1 video-bg hero | parallax under text, glow on light |
| B efficacy-led | before/after drag, accordion FAQ | hover `shadow` on buttons, carousel on reviews | parallax, video bg, exit-intent popup |
| C lookbook-led | hover `NEXT_IMAGE` on cards | image carousel, hover `grow` on tiles | parallax, sticky bar on home, accordion on selling content |
| D craft/origin | — | 1 parallax on origin band, hover `grow` (subtle) | sticky bar, autoplay, glow, popup |
| E consultative | sticky CTA (quote/booking) | accordion, before/after on case studies, logo carousel | video bg, y2k glow, exit-intent |
| F offer/subscription | sticky price bar, accordion FAQ | hover `float` on plan cards, carousel on unboxing | parallax, autoplay text |
| G occasion-led | — | UGC carousel, hover `grow` on tiles, video-bg hero with real footage | parallax under text, exit-intent |

---

## §5 — Section pattern library

Build sections from these. Inventing a layout from scratch is how pages end up
in §1. Each spec gives the tree, the measurements, and the failure mode.

Notation: indentation = nesting. `56/42` = flex-basis ratio.

### Hero patterns

**`hero-split-asymmetric`**
Text column 42%, media 58%. Media is a context photo, ratio 0.8–1.0, bleeds to
the right viewport edge (section `container: false`, text column padded to grid).
Text: `eyebrow` → `display` (2–3 lines, you choose the break) → `body-lead`
(≤22 words) → 1 primary CTA → optional one-line trust `caption`.
Section min-height 78vh desktop. Vertical centring of the text column against
the media, not against the section.
*Fails when:* text column too wide (>520px) so `display` wraps to 4 lines.

**`hero-full-bleed-scrim`**
Section `container: false`, background image, `filterColor` scrim. Content in a
column capped at 640px, positioned left-40%-down or bottom-left, never dead
centre unless the image is symmetrical. `display` at 64–88. Max 1 CTA.
Scrim: linear gradient from 65% opacity at the text edge to 0 at the far edge —
a flat 40% overlay across the whole image kills the photograph.
*Fails when:* the image has busy detail behind the text and no gradient scrim.

**`hero-centered-statement`**
Single centred column, 720px max. `eyebrow` → `display` 72–88 → `body-lead` →
CTA pair (primary + text link). Below it, a full-bleed image band 0.4 ratio,
bleeding off both edges. Requires a strong single claim; weak copy centred large
is worse than weak copy small.
*Uses one of the 2 permitted centred sections (B2).*

**`hero-product-lead`**
Media 55% left (product in context, ratio 1.0), buy column 45% right: product
title `section-head`, price `stat-value`, variant controls, quantity, ATC,
3 short trust `caption` lines with icons. This is the only hero where a
white-background cut-out is allowed.

**`hero-editorial-stack`**
`eyebrow` centred small → `display` in a serif at 72–96, left-aligned, hanging
past the container's left edge by 24–48px → full-bleed image 0.42 ratio →
two-column intro text beneath (60/40, text left).
For craft, editorial, and long-form. Slow, confident, no CTA above the image.

### Proof / spec patterns

**`spec-grid-4x2`** — *the signature section for spec-led industries*
```
section  padding 96px 0  container false
  col    maxWidth 1200  margin 0 auto  padding 0 40px
    row  gap 72px  align flex-start
      col  basis 260  → eyebrow + section-head + one body line (≤18 words)
      grid cols 4  mobileCols 2  gap 44px 32px
        stat ×8  → icon 24px accent · stat-value · label
      col  basis 320  → media ratio 0.72, radius token
```
Exactly **6 or 8** stats. Never 5 or 7 — a ragged final row is the tell.
Accent on **all** icons, nothing else in this section (B8 exception).
`stat-value` carries a unit. `label` is a technical noun, not a benefit.
Mobile: 2 columns, media moves below, left column above.
*Fails when:* stats become a vertical list (B18), or a stat has no unit (B16).

**`stat-strip-3up`**
Full-bleed band, dark or accent-tinted, 3 stats across at `stat-value` 40–56
with `label` beneath. No icons, no borders, no cards — the numbers carry it.
Padding 72px vertical. Use once per page maximum.

**`feature-hero-plus-two`** — *the replacement for the banned feature trio (B1)*
```
row  gap 56  align stretch
  col basis 58%  → media ratio 0.75 + sub-head + body   ← the strongest feature
  col basis 42%  gap 40
    → two stacked items, each: label + sub-head + body (no image)
```
The 58% item gets the image because it earned it. Never give all three images.

**`feature-split-alternating`**
Text 40% / media 60%, then the next instance mirrors to media 40% / text 60%.
Text side: `eyebrow` → `sub-head` → `body` (≤45 words) → optional 3-item
inline `label` row → text-link CTA. Media ratio alternates too (0.75 then 1.15).
Use in pairs, never three in a row.
*Fails when:* consecutive instances do not mirror (B14 territory).

**`comparison-table`**
Sticky header row. First column is the row label at `label`; your column is
accent-tinted and 1.15× wider than the others. Check/cross glyphs from the icon
set, never emoji. 5–8 rows; more goes behind an accordion. Include at least one
row where a competitor wins — a table where you win every row is not read as
information.

**`spec-rail-sticky`**
Long-form spec content in the left 62%, a sticky summary card in the right 38%
holding price + ATC + 4 key specs. For high-consideration spec-led product pages.

### Image / atmosphere patterns

**`usecase-tiles-overlay`** — *the signature section for occasion-led and
spec-led lifestyle proof; this is the pattern from the reference design*
```
section  container false  padding 88px 0
  → section-head, centred, with ONE accent phrase inside it   (B8 option b)
  strip  items 5  gap 0 or 2px  bleed true
    media each: ratio 0.85, skew -6deg (or 0), scrim bottom 0→70%
      overlay: label (UPPERCASE, tracked 0.18em, white)
               caption (2 lines max, 88% white)
```
4–6 tiles. Every tile has **exactly** the same overlay slots (B4). Labels are
single words or two — place names, terrain, occasion, age range.
Photos must differ in setting, not just in crop. Five photos of the same room
is one photo.
Mobile: horizontal scroll with `slidesToShow: 1.2`, skew removed.
*Fails when:* text sits on the image with no scrim, or the tiles are captioned
below the image instead of over it — that turns it into a plain gallery.

**`lookbook-strip`**
3–6 images, unequal widths (e.g. 1.4 / 1 / 1 / 1.8 flex ratios), gap 4–8px,
full-bleed both edges, no captions or 2-word captions in `label`.
Ratios must vary: mix at least one portrait with one wide.

**`full-bleed-quote-band`**
Image background + scrim, one quote at 32–44px in the display family, attribution
in `label` beneath. Max 25 words. This is where a real testimonial goes (B15).

**`gallery-masonry-3`**
3 columns, unequal heights, natural aspect ratios preserved. 6–9 images.
No lightbox unless the images carry detail worth zooming.

**`before-after-pair`**
Two images, true 50/50 (the sanctioned exception to B14), or the drag element.
`label` on each side. Same crop, lighting, and distance or do not use it.

### Content patterns

**`process-steps`**
3 or 4 steps horizontally, each: large step numeral in `stat-value` at 25%
opacity behind or beside the content, `sub-head`, `body` ≤25 words, and **its own
image** — steps without images are a numbered list, not a section.
Connect with a hairline rule between steps, not arrows.

**`ingredient-list`** — *signature section for efficacy-led*
3–5 rows, each: macro photo of the ingredient (ratio 1.0, 96–120px, radius
full or token) + name in `sub-head` + concentration in `label` + one line of
mechanism in `body`. Concentration is required; if unknown, the row is dropped.

**`routine-steps`**
2–3 columns for AM/PM or step order. Each column: `label` (time of day),
product image, `sub-head`, `body` ≤20 words, quantity/duration in `caption`.

**`story-band`**
Portrait photograph (ratio 0.8–1.0, 40% width) + text 60% capped at 620px:
`eyebrow` → `sub-head` → 2 short paragraphs → signature or name in `label`.
Named human, real photo. A story band with a stock photo is worse than no story.

**`origin-band`**
Wide landscape image (ratio 0.4) full-bleed, with a 3-item `label`+`caption` row
beneath: place, year, method. Optionally a map.

**`size-fit-guide`**
Table with tabular numerals, plus one diagram image showing where each
measurement is taken. Units in both cm and in.

**`deep-dive-split`**
Single feature, text 38% / media 62%, media ratio 0.62 bleeding one edge.
Text: `label` → `sub-head` → `body` ≤50 words → 2–3 `stat` inline.
The most detailed feature explanation on the page. Use 1–2 per page.

### Conversion patterns

**`plan-comparison`**
2–3 plan cards. Middle card 1.08× scale, accent border, and a `label` badge —
and it must be the plan you actually want sold. Each card: plan name `sub-head`,
price `stat-value` + billing period `caption`, 4–6 feature rows with check icons,
one CTA. Identical slot count across cards (B4).

**`bundle-picker`**
2–4 bundle options as selectable rows, not cards: radio + bundle name + savings
in accent `label` + strikethrough original + bundle price `stat-value`. The
recommended row is pre-selected and tinted.

**`whats-inside-grid`**
Grid of 4–8 items from a real unboxing photograph, each with `label` + `caption`.
Rendered mockups are not acceptable here.

**`social-proof-wall`**
One large featured review (`full-bleed-quote-band` style or a wide card) plus a
masonry of 6–9 short real reviews with unequal heights. Customer photos where
they exist. Aggregate rating and count in a single `label` line above.

**`guarantee-row`**
3–5 items, icon + `label` + one `caption` line, in a tight band 48–64px padding,
divided by hairlines, no cards. Returns window, warranty term, shipping
threshold, support hours. Terms must be real numbers.

**`faq-accordion`**
6–10 questions. Questions written in the customer's voice ("Will it fit a 26in
frame?"), not the brand's ("What about compatibility?"). First item closed
unless it answers the top objection.

**`cta-band-full`**
Full-bleed, `container: false`, dark or accent background or image+scrim.
`display` or `section-head` at 44–64, one line of `body-lead`, one primary CTA,
optional secondary text link. 120–160px vertical padding. This is one of the 2
permitted centred sections.

**`certification-logo-row`**
Real logos only, greyscale at 60% opacity, uniform optical height (not uniform
box height — logos need individual scaling to look level), 5–7 items,
`label` header above.

**`lead-form-split`**
Form 45% / value-recap 55%. Form fields ≤5. Every field justified — a field you
will not use is a conversion cost. Submit button label states the outcome
("Get the quote"), not the action ("Submit").

---

## §6 — Page types: minimum sections and signature section

**Signature section** = the one section on this page type that gets
disproportionate design investment. It should be the most visually developed
thing on the page: the best photography, the largest type, the full-bleed
treatment, the only motion. Every page needs exactly one. A page where every
section is equally polished reads as flat.

**Minimum** assumes real content exists. Under-shoot rather than pad (B27).

| Page type | Min | Target | Signature section | Never |
| --- | --- | --- | --- | --- |
| `home` | 7 | 7–9 | industry-specific (§9) | more than 9; a spec dump; a full product catalogue |
| `collection` | 5 | 5–6 | `usecase-tiles-overlay` or filter-led header | long prose above the grid |
| `product` | 8 | 8–11 | `spec-grid` (A/E) · `ingredient-list` (B) · `lookbook-strip` (C) | hero with no buy action reachable |
| `about` | 6 | 6–8 | `story-band` with real portrait | stock office photography; "our mission" platitudes |
| `contact` | 3 | 3–4 | `lead-form-split` | a form with 8 fields; no address or hours |
| `faq` | 3 | 3–4 | `faq-accordion` | decorative hero; more than 20 questions unsegmented |
| `reviews` | 4 | 4–5 | `social-proof-wall` | identical quote cards (B15) |
| `size-guide` | 3 | 3–4 | `size-fit-guide` with diagram | a table with no diagram |
| `shipping` | 3 | 3–4 | rates table | marketing copy; vague windows |
| `store-locator` | 3 | 3–4 | map + list split | a list with no map |
| `comparison` | 5 | 5–6 | `comparison-table` | a table where you win every row |
| `quiz` | 4 | 4–5 | question card with progress | more than 6 questions |
| `upsell` | 4 | 4–5 | `bundle-picker` | fake countdown timers |
| `thank-you` | 3 | 3–4 | order-status / next-steps band | a hard second sell above the order info |
| `membership` | 6 | 6–8 | `plan-comparison` | hidden pricing |
| `wholesale` | 6 | 6–7 | `lead-form-split` + volume table | retail-style hero |
| `gift-card` | 4 | 4–5 | denomination picker | no delivery-timing information |
| `careers` | 5 | 5–6 | `story-band` (team) + role list | stock "diverse team" photography |
| `press` | 4 | 4–5 | asset download grid | logos without downloadable files |
| `sustainability` | 6 | 6–8 | `stat-strip-3up` with sourced figures | unsourced claims; green gradients as proof |
| `coming-soon` | 3 | 3 | `hero-full-bleed-scrim` + email capture | a full navigation |
| `404` | 1 | 1–2 | one witty band + 3 useful links | a search box as the only exit |
| `password` | 1 | 1 | single centred band | anything else |
| `login` `dashboard` `order-tracking` | 2 | 2–3 | the form/table itself | decorative hero; motion |
| `lp-launch` | 7 | 7–9 | `hero-full-bleed-scrim` or video hero | navigation that leaks off the page |
| `lp-lead-gen` | 5 | 5–6 | `lead-form-split` above the fold | more than 5 fields; competing CTAs |
| `lp-bfcm` | 5 | 5–7 | offer band with real terms | fake scarcity; unreadable strike-through pricing |
| `lp-event` | 6 | 6–7 | agenda + speaker grid | no date, time zone, or venue in the hero |
| `lp-app` | 6 | 6–8 | device-framed feature `deep-dive-split` | screenshots without device frames or context |
| `lp-discount` | 4 | 4–5 | code + terms band | terms in 10px grey |
| `lp-influencer` | 5 | 5–6 | `story-band` (the creator, real photo) | brand-voice copy in a creator's page |
| `lp-advertorial` | 6 | 6–8 | long-form `story-band` + inline proof | fake editorial mastheads |
| `lp-waitlist` | 3 | 3–4 | capture band + one proof section | a full product page pretending to be a waitlist |

---

## §7 — Archetypes and homepage arcs

Each vertical maps to one archetype (§9). The arc is the default section order.
Deviate only for a reason stated in the vertical row. **★** marks the signature
section.

### A — Spec-led
*Proof is measurement. The buyer scans numbers before reading sentences.*
```
1  hero-full-bleed-scrim        product in a demanding real environment
2  spec-grid-4x2            ★  6 or 8 measured values — second position is deliberate
3  usecase-tiles-overlay        4–6 contexts, text over image
4  deep-dive-split              biggest feature, media right
5  deep-dive-split              second feature, media left (mirrored)
6  comparison-table             vs previous model or vs the old way
7  social-proof-wall
8  cta-band-full + guarantee-row
```

### B — Efficacy-led
*Proof is mechanism and result over time.*
```
1  hero-split-asymmetric        claim with a time horizon ("visible in 4 weeks")
2  problem-band                 3 items naming the actual problem
3  ingredient-list          ★  actives with concentrations
4  before-after-pair            real, comparable
5  routine-steps                AM/PM, dose, duration
6  stat-strip-3up               trial figures with sample size, or omit entirely
7  social-proof-wall
8  faq-accordion                allergies, pregnancy, layering
9  cta-band-full + guarantee-row
```

### C — Lookbook-led
*Proof is desire. Total page word count under 250.*
```
1  hero-full-bleed-scrim    ★  one editorial image, ≤6 words over it
2  lookbook-strip               unequal widths, full-bleed
3  category-tiles                3 tiles, image-led
4  product-row-4                image + name + price only, no descriptions
5  story-band                    material or atelier, macro photography
6  social-proof-wall (UGC)       real customer photos
7  guarantee-row                 size, shipping, returns
```
Image-to-section ratio ≥1.5. If you are writing paragraphs, you are off-brief.

### D — Craft / origin-led
*Proof is provenance and process. Slow rhythm, serif voice.*
```
1  hero-editorial-stack          raw material or hands at work
2  origin-band               ★  place, year, method
3  process-steps                 4 steps, each with its own photograph
4  product-row-3                 SKUs with sensory notes
5  story-band                    named maker, real portrait
6  how-to-band                   brewing, pairing, care
7  bundle-picker                 trial set
8  cta-band-full
```

### E — Consultative-led
*Proof is competence and process. The action is an enquiry, not a cart.*
```
1  hero-split-asymmetric         value proposition + enquiry CTA
2  stat-strip-3up                years, projects, certifications — real numbers only
3  catalogue-grid                ranges or service lines
4  comparison-table              tiers, materials, or grades
5  process-steps                 how working together goes
6  case-study-split          ★  one real project, before/after, named client
7  certification-logo-row
8  lead-form-split
```

### F — Offer / subscription-led
*Proof is clarity of terms. The unfamiliar model must be explained before it is sold.*
```
1  hero-product-lead             price or plan visible immediately
2  process-steps (3)         ★  how it works — mandatory in position 2
3  plan-comparison               2–3 tiers, the intended one marked
4  whats-inside-grid             real unboxing photograph
5  flexibility-band              pause, skip, cancel, swap — answers the main fear
6  social-proof-wall
7  faq-accordion                 billing, delivery, cancellation
8  cta-band-full
```

### G — Occasion-led
*Proof is recognition — the buyer seeing their own situation.*
```
1  hero-full-bleed-scrim         a real moment, real people or animals
2  usecase-tiles-overlay     ★  by age, occasion, size, or season
3  safety-quality-band           certifications and materials (mandatory for kids/pets)
4  product-row-4
5  gift-occasion-band            wrapping, cards, timing
6  social-proof-wall (UGC)
7  cta-band-full
```

---

## §8 — Universal composition rules

Apply to every page regardless of type or industry.

1. **No two adjacent sections share a role.** Two grids in a row is a catalogue.
2. **After at most 2 text-dense sections, a full-bleed image band.**
3. **First and last sections are full-bleed.** Middle sections alternate
   container on/off.
4. **Consecutive splits mirror.** Media left, then media right. No exceptions.
5. **At least 2 background treatments per page**, at least one of them dark or
   image-backed.
6. **Aspect-ratio variety ≥3** distinct values per page (B6).
7. **One signature section per page** (§6), and it is visibly the most developed.
8. **At most 2 centred sections** (B2).
9. **At most 2 primary CTA instances** plus the sticky bar (B17).
10. **Padding varies by role:** statement 120–160px · standard 88–96px ·
    dense grid 72–80px · utility row 48–64px. Never one value throughout.
11. **Vertical balance in splits:** if the text column is much shorter than the
    media, either grow the text (add a stat row or a secondary link) or crop the
    media shorter. Do not leave a tall empty gap under short text — that gap is
    the most visible sign of an unfinished layout.
12. **Mobile is a re-order, not a squeeze.** Multi-column splits stack with the
    media first when the media is the argument (lookbook, occasion) and text
    first when the claim is the argument (spec, consultative). Grids drop to 2
    columns, never 1, for stats.

---

## §9 — Industry directions

Columns: **Arch** = archetype · **Style** = preferred `visualStyle` ids in order
· **Font** = pairing from §3 · **Signature** = the homepage section to invest in ·
**Motion** = beyond the archetype default · **Ban** = patterns that are wrong for
this industry.

### Apparel & accessories

| Vertical | Arch | Style | Font | Signature | Motion | Ban |
| --- | --- | --- | --- | --- | --- | --- |
| fashion-apparel | C | editorial, minimal, luxury | P9 / P19 | `hero-full-bleed-scrim` | `NEXT_IMAGE` required | spec-grid, ingredient-list, comparison-table |
| footwear | C | streetwear, bold, minimal | P14 / P2 | `lookbook-strip` | `grow` on cards | ingredient-list, origin-band |
| jewelry-watches | C | luxury, editorial, minimal | P9 / P11 | `full-bleed-quote-band` or macro `gallery-masonry-3` | magnifier on product media | playful motion, glow, neubrutalist |
| bags-accessories | C | minimal, editorial, scandi | P24 / P8 | `deep-dive-split` on interior/capacity | `ALL_IMAGE` on ≤4 cards | before/after |
| eyewear | C | minimal, editorial, tech | P6 / P24 | face-shape `usecase-tiles-overlay` | try-on carousel | parallax |
| kids-apparel | C+G | playful, organic, scandi | P17 / P13 | `usecase-tiles-overlay` by age | `grow` on tiles | luxury serif display, dark |

### Beauty, health & wellness

| Vertical | Arch | Style | Font | Signature | Motion | Ban |
| --- | --- | --- | --- | --- | --- | --- |
| skincare | B | minimal, luxury, organic | P6 / P4 | `ingredient-list` | before/after required | spec-grid, streetwear, glow |
| cosmetics | B+C | bold, luxury, playful | P6 / P22 | shade-range `lookbook-strip` | swatch hover swap | before/after on colour cosmetics |
| haircare | B | organic, minimal, editorial | P7 / P6 | `before-after-pair` | drag handle | spec-grid |
| fragrance | C | luxury, editorial, minimal | P11 / P9 | `story-band` on the note pyramid | none beyond hover | before/after, stat grids, spec language |
| supplements | B | minimal, tech, organic | P4 / P12 | `ingredient-list` with dosages | accordion on studies | before/after body imagery, unsourced claims |
| personal-care-devices | A+B | tech, minimal | P4 / P1 | `spec-grid-4x2` | sticky bar | organic hand-drawn styling |
| intimate-wellness | B | minimal, organic, editorial | P6 / P20 | `faq-accordion` (privacy, safety) | none | explicit imagery, playful, before/after |

### Food & beverage

| Vertical | Arch | Style | Font | Signature | Motion | Ban |
| --- | --- | --- | --- | --- | --- | --- |
| coffee-tea | D | organic, editorial, handmade | P7 / P8 | `origin-band` | 1 parallax on origin | spec-grid, sticky bar, tech |
| specialty-food | D | organic, editorial, handmade | P8 / P7 | `process-steps` | subtle hover | comparison-table |
| snacks-confectionery | D+G | playful, retro, bold | P18 / P23 | `usecase-tiles-overlay` | carousel on flavours | luxury serif, clinical |
| bakery-desserts | D | handmade, organic, editorial | P10 / P7 | macro `gallery-masonry-3` | none | spec-grid, dark tech |
| alcohol | D | luxury, editorial, retro | P10 / P11 | `origin-band` + tasting notes | 1 parallax | playful, y2k, discount urgency |
| meal-kits | F | playful, organic, minimal | P13 / P7 | `process-steps` (how it works) | sticky price bar | luxury serif, spec-grid |
| health-food | B+D | organic, minimal | P7 / P4 | `ingredient-list` | accordion nutrition | before/after body imagery |

### Home & living

| Vertical | Arch | Style | Font | Signature | Motion | Ban |
| --- | --- | --- | --- | --- | --- | --- |
| furniture | E+C | scandi, minimal, editorial | P24 / P8 | room `gallery-masonry-3` | dimension accordion, `grow` | spec-grid as hero proof, glow |
| home-decor | C | editorial, scandi, handmade | P8 / P24 | `lookbook-strip` (styled rooms) | `NEXT_IMAGE` | comparison-table, spec-grid |
| bedding-textiles | E+B | scandi, minimal, organic | P24 / P7 | material `deep-dive-split` (thread, weave) | accordion care | dark tech, glow |
| kitchenware | D+E | scandi, minimal, handmade | P24 / P7 | `process-steps` (making) or use `deep-dive-split` | `grow` | y2k, urgency |
| lighting | E+C | scandi, minimal, luxury | P24 / P21 | ambience `gallery-masonry-3` (day/night pairs) | before/after day-night | playful |
| home-improvement | E | minimal, bold, tech | P12 / P5 | `case-study-split` before/after | drag handle | luxury serif |
| cleaning-household | F+B | playful, minimal, organic | P13 / P7 | `before-after-pair` | drag handle, sticky bar | luxury, editorial serif |

### Electronics & tech

| Vertical | Arch | Style | Font | Signature | Motion | Ban |
| --- | --- | --- | --- | --- | --- | --- |
| consumer-electronics | A | tech, dark, minimal | P3 / P4 | `spec-grid-4x2` | sticky bar, 1 video hero | organic, handmade, serif display |
| audio | A | dark, tech, editorial | P3 / P1 | `spec-grid-4x2` + frequency `deep-dive-split` | sticky bar | playful, y2k |
| phone-accessories | A | minimal, tech, bold | P1 / P3 | compatibility `comparison-table` | sticky bar, `grow` | luxury serif, origin-band |
| computer-gaming | A | dark, tech, y2k | P3 / P23 | `spec-grid-4x2` | glow permitted, video hero | scandi, organic, luxury |
| smart-home | A | tech, minimal, glass | P4 / P3 | ecosystem `deep-dive-split` | accordion compatibility | handmade, retro |
| drones-cameras | A | dark, tech, bold | P1 / P2 | sample-output band (real footage) + `spec-grid-4x2` | video hero with real footage | studio-white product photography outside the buy box |

### Sport, outdoor & mobility

| Vertical | Arch | Style | Font | Signature | Motion | Ban |
| --- | --- | --- | --- | --- | --- | --- |
| fitness-equipment | A | bold, dark, tech | P15 / P2 | `spec-grid-4x2` | sticky bar | luxury serif, before/after body imagery |
| activewear | C+A | bold, streetwear, minimal | P15 / P2 | `lookbook-strip` in motion | `NEXT_IMAGE` | ingredient-list, origin-band |
| outdoor-camping | G+A | organic, bold, retro | P16 / P7 | `usecase-tiles-overlay` by terrain | carousel, video hero | luxury, glass, y2k |
| cycling-ebike | A | bold, dark, tech | P1 / P2 | `usecase-tiles-overlay` by terrain + `spec-grid-4x2` | sticky bar required | ingredient-list, before/after, studio-white hero |
| ev-mobility | A | tech, dark, minimal | P1 / P4 | `spec-grid-4x2` (range, charge) | sticky bar | handmade, retro |
| water-sports | G+A | bold, organic, retro | P16 / P15 | `usecase-tiles-overlay` by condition | video hero | luxury serif, clinical |
| hunting-fishing | A+G | retro, bold, organic | P5 / P16 | `spec-grid-4x2` | none beyond hover | y2k, glass, playful |
| team-sports | G+A | bold, streetwear | P15 / P14 | `usecase-tiles-overlay` by position/level | carousel | luxury, scandi |

### Kids, pets & hobby

| Vertical | Arch | Style | Font | Signature | Motion | Ban |
| --- | --- | --- | --- | --- | --- | --- |
| baby-gear | G+E | scandi, organic, minimal | P17 / P24 | safety-quality-band + `comparison-table` (stages) | accordion standards | dark, glow, urgency mechanics |
| toys-games | G | playful, retro, bold | P17 / P24* | age `usecase-tiles-overlay` | `grow`, carousel | luxury serif, dark tech |
| pet-supplies | G+F | playful, organic, minimal | P18 / P13 | size/breed `usecase-tiles-overlay` | UGC carousel | luxury, clinical, dark |
| art-craft | D | handmade, organic, retro | P7 / P22 | `process-steps` (what you can make) | `grow` on projects | tech, glass, spec-grid |
| music-instruments | D+A | editorial, dark, retro | P8 / P3 | sound-sample band + `spec-grid` | audio player, magnifier | playful, y2k |
| books-stationery | D+C | editorial, minimal, handmade | P20 / P24 | `gallery-masonry-3` (interior spreads) | `NEXT_IMAGE` | spec-grid, urgency |
| collectibles | C+D | dark, retro, editorial | P8 / P22 | `gallery-masonry-3` with condition `label`s | magnifier required | playful, glass |

*P24 with a rounded text family substituted.

### Auto, tools & industrial

| Vertical | Arch | Style | Font | Signature | Motion | Ban |
| --- | --- | --- | --- | --- | --- | --- |
| auto-parts | A+E | bold, dark, tech | P5 / P1 | fitment `comparison-table` (make/model/year) | sticky bar, accordion fitment | luxury serif, playful |
| moto-powersports | A | bold, dark, retro | P5 / P2 | `usecase-tiles-overlay` by riding type | video hero, sticky bar | scandi, glass |
| tools-hardware | A | bold, tech, minimal | P5 / P1 | `spec-grid-4x2` (torque, capacity) | sticky bar | luxury, playful |
| industrial-b2b | E | minimal, tech, corporate-neutral | P12 / P1 | spec/catalogue table + `lead-form-split` | accordion specs | video hero, glow, y2k |
| medical-dental | E+B | minimal, tech | P12 / P4 | `certification-logo-row` + `spec-grid` | accordion regulatory | playful, urgency, before/after without consent notice |
| office-professional | E | minimal, scandi, tech | P12 / P24 | `comparison-table` (models/tiers) | accordion | y2k, streetwear |

### Digital, services & causes

| Vertical | Arch | Style | Font | Signature | Motion | Ban |
| --- | --- | --- | --- | --- | --- | --- |
| saas-app | F+A | tech, minimal, glass | P3 / P13 | device-framed `deep-dive-split` | `grow` on plan cards, sticky pricing | organic, handmade, origin-band |
| online-course | F | editorial, minimal, bold | P20 / P13 | curriculum `process-steps` + instructor `story-band` | accordion syllabus | luxury serif, urgency countdowns |
| digital-download | F | minimal, bold, y2k | P13 / P22 | preview `gallery-masonry-3` | `grow`, magnifier | origin-band, ingredient-list |
| agency-service | E | editorial, minimal, neubrutalist | P19 / P14 | `case-study-split` | `grow` on case cards | spec-grid, stock imagery |
| local-service | E | organic, minimal, handmade | P7 / P21 | booking `lead-form-split` + map | none | video hero, glow |
| events-tickets | G | bold, streetwear, y2k | P15 / P23 | line-up / agenda grid | carousel, video hero | luxury serif, minimal restraint |
| travel-hospitality | C+G | luxury, editorial, organic | P21 / P10 | `gallery-masonry-3` of the property | 1 parallax, carousel | spec-grid, urgency, glow |
| membership-community | F | editorial, playful, minimal | P20 / P13 | `plan-comparison` + member `story-band` | accordion, sticky pricing | luxury serif, spec-grid |
| nonprofit-cause | E+G | editorial, organic, minimal | P20 / P7 | `stat-strip-3up` with sourced figures + `story-band` | none | glossy stock, urgency mechanics, glow |
| real-estate | E+C | luxury, minimal, editorial | P21 / P24 | property `gallery-masonry-3` + floorplan | magnifier, 1 parallax | playful, y2k, urgency |
| finance-insurance | E | minimal, tech, corporate-neutral | P12 / P4 | `comparison-table` + `process-steps` | accordion disclosures | video hero, glow, playful, urgency |

---

## §10 — Output gates

Run both before emitting. A failure is fixed, not disclosed.

### Gate 1 — Structural (mechanical, no judgment)

- [ ] Section count meets the §6 minimum for this page type, or the page is
      deliberately shorter with no filler present
- [ ] Every repeated group has identical slots across all items (B4)
- [ ] Every `stat-value` carries a unit (B16)
- [ ] Every font size maps to a §2 role; no ad-hoc sizes
- [ ] `display` ≥56px desktop; at least one non-hero section ≥40px (B20)
- [ ] ≥4 type roles used on the page; `eyebrow` or `label` present (B5)
- [ ] ≤2 type families (or 3 with mono confined to `label`/`caption`)
- [ ] ≥2 sections with `container: false` (B25)
- [ ] ≥2 distinct background treatments (B3)
- [ ] ≥3 distinct aspect ratios among images (B6)
- [ ] No two adjacent sections share a role (§8.1)
- [ ] Consecutive splits mirror (§8.4)
- [ ] ≤2 centred sections (B2)
- [ ] ≤2 primary CTA instances (B17)
- [ ] ≤3 motion types; each has a job (§4)
- [ ] Padding takes ≥3 distinct values across sections (§8.10)
- [ ] No element ships at `opacity: 0` (§4)
- [ ] Exactly one signature section, and it is the most developed (§6)

### Gate 2 — The ban sweep

Walk B1–B27 and answer for each: *is this present?* Any yes is fixed before
output. Pay closest attention to the four that appear most often in generated
pages:

- **B1** centred feature trio
- **B4** non-uniform repeated group
- **B11** adjective copy with no number, material, process, duration, place, or person
- **B7** studio-white product shot on a light section

### Gate 3 — The substitution test

Take the three strongest sentences on the page. Swap the product for a
different product in the same industry. If the sentences still work, they are
saying nothing — rewrite them until they break.
