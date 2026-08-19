---
scope: design
load: always
name: composition
version: 2.0
---

# The numbers

Everything below is a lookup, not a judgement. Do not invent values between
them.

## Type roles

Every text node has exactly one role. The role carries the size, weight, case
and tracking. You do not invent per-section values.

| role | px desktop | weight | case | tracking | line-height |
| --- | --- | --- | --- | --- | --- |
| `display` | 56–88 | 700–800 | as written | −0.03em | 0.98–1.06 |
| `section-head` | 36–56 | 700 | as written | −0.02em | 1.06–1.14 |
| `sub-head` | 20–28 | 600 | as written | −0.01em | 1.25–1.35 |
| `stat-value` | 28–56 | 700 | as written | −0.02em | 1.0 |
| `body-lead` | 18–20 | 400 | as written | 0 | 1.5 |
| `body` | 16–17 | 400 | as written | 0 | 1.55–1.65 |
| `caption` | 13–14 | 400 | as written | 0 | 1.4 |
| `label` | 12–13 | 600 | UPPERCASE | 0.10em | 1.2 |
| `eyebrow` | 11–13 | 600 | UPPERCASE | 0.14em | 1.2 |

Mobile: `display` ÷ 1.7 (floor 32), `section-head` ÷ 1.45 (floor 26),
`stat-value` ÷ 1.35, `sub-head` ÷ 1.15. `body` `caption` `label` unchanged, and
never below 15px for body, 11px for label.

Rules:
- **At least 4 roles visible on the page**, and `eyebrow` or `label` must appear
  at least once. Two sizes on a page is the fastest tell of a generated page.
- **3–4 roles per section**, no more. Six roles in one section has no hierarchy.
- `display` wraps in 2–3 lines and YOU choose the break — 16–24 characters per
  line. `body` runs 60–75 characters per line, so cap its column at 620px.
- Every `stat-value` carries a unit or a denominator. `92%`, `30 timmar`,
  `4.8 / 5`. A bare `92` says nothing.

## Spacing

Section vertical padding, pick per section, and **use at least three distinct
values across the page**:

| kind | desktop | mobile |
| --- | --- | --- |
| statement / signature | 120–160px | 64px |
| standard | 88–96px | 44px |
| dense grid | 64–80px | 36px |
| utility strip | 40–56px | 28px |

Horizontal: 56px desktop, 20px mobile, except full-bleed sections which have
none and cap their inner column instead.

Gaps: inside a group 8–16px · between groups 24–40px · between a section
heading and its body 40–56px.

Content column: `maxWidth 1180px, margin 0 auto`. Prose column 620px max.
**At least two sections per page must be full-bleed** — no container cap.

## Colour

You are given `bg`, `ink`, `accent`, `band`, `border`. That is the whole
palette.

- **Accent appears on ONE thing per section.** A button, or a stat, or one word
  inside the headline — not all three.
- **One word of the display headline in accent** is the cheapest thing that
  makes a page look art-directed. Do it once per page, in the hero, by splitting
  the heading into two `heading` nodes in a `row`, or one heading plus a
  coloured `<b>`-style second heading beneath.
- **At least 2 distinct background treatments** on the page, and **at least one
  dark band** unless the order line says otherwise. Never two dark bands
  adjacent.
- `border` is a real 1px outline on cards and band edges when the merchant
  supplied one. It is not optional decoration.

## Images

- **4 to 8 photographs on a landing or home page.** A page with two pictures and
  six blocks of text is a document.
- **At least 3 distinct aspect ratios** among them. Everything at 1:1 is a
  catalogue.
- Queries are specific and physical: `"potter shaping wet clay on a wheel"`,
  not `"product"`. Never `"abstract background"`, never `"business"`.
- Studio-white cut-outs are allowed inside the buy box and nowhere else.

# Rhythm

The order line gives you the sections. These four govern how they sit together:

1. **No two adjacent sections share a role.** Roles: `hero · proof · media ·
   content · conversion · utility`. Two grids in a row is a catalogue.
2. **After at most two text-dense sections, one full-bleed image section.**
3. **Exactly one signature section** — it gets the best photograph, the largest
   type, the full-bleed treatment and the page's one signature motion. Every
   other section is deliberately quieter. A page where everything is developed
   equally reads flat however many sections it has.
4. **Consecutive splits mirror.** If one section puts the image left, the next
   split puts it right.

# The ban list

`audit()` in code checks the mechanical ones — padding variety, type-role count,
full-bleed count, dark bands, image ratios, centred sections, repeated-group
slots, stat units, adjacent roles. You do not need to think about those; they
are checked and returned to you as a repair list if you miss them.

These eight cannot be checked mechanically. They are yours.

| | ban | instead |
| --- | --- | --- |
| B1 | a centred trio of icon + heading + one line | an asymmetric grid, or 4-up numbered `01–04`, or `usecase-tiles-overlay` |
| B7 | a studio-white cut-out on a light section | lifestyle, in context, or a dark band behind it |
| B10 | a section headed "Why choose us" | name the specific thing the section is about |
| B11 | adjective copy — premium, high-quality, innovative, elevate | a number, a material, a duration, a place, a person, a named process |
| B15 | testimonials of identical length, all five stars | vary the length; one four-star with a mild reservation |
| B23 | a hero carrying a spec table | the hero states ONE thing; specs get their own band |
| B26 | a section heading that restates the product name | say what the section is about |
| B27 | a filler section added to reach the count | go under the count instead |

# Before you emit

Walk these. A failure is fixed, not disclosed.

- [ ] ≥4 type roles used; `eyebrow` or `label` present
- [ ] ≥3 distinct section padding values
- [ ] ≥2 full-bleed sections
- [ ] ≥1 dark band, and no two dark bands adjacent
- [ ] ≥3 distinct image aspect ratios
- [ ] ≤2 centred sections
- [ ] Exactly one signature section, and it is visibly the most developed
- [ ] Every repeated group has identical slots
- [ ] Every stat has a unit
- [ ] No two adjacent sections share a role
- [ ] Take the three strongest sentences. Swap the product for a different
      product in the same trade. If they still work, they say nothing — rewrite.
