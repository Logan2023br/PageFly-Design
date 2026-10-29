# Tiêu chí tổng — bộ premium, không giới hạn ngân sách

> Routine đọc file này từ repo (nhánh main) mỗi lần nhận một bộ — sửa ở đây rồi push là routine dùng bản mới, không cần dán lại đâu cả.
> Ô "Tiêu chí build" trên giao diện là ý tưởng thêm của admin, áp lên trên file này; để trống thì chỉ dùng file này. Ghi chú của từng lượt (ngành, dịp lễ…) áp thêm lên trên cùng.
> Gộp từ "Bộ tiêu chí chất lượng cho Store sets" (21/10/2026): tầng 1 sàn kỹ thuật, tầng 2 chấm 7 tiêu chí, tầng 3 cả bộ, tầng 4 luật từng loại section, ngưỡng của bộ khoá gói Builder.

---

# What we sell

Each set is a **premium set with an unlimited budget** — the best work we can make, as if money were no object: no cap on effort, rounds, tokens or polish. It is a Builder-plan set, so it must pass the **Builder threshold** below, not just the free one. It should make a merchant's store look like a top-tier brand, the kind of site a leading design agency would be proud to ship. If a set would not make a merchant say "this looks expensive" in the first three seconds, it is not finished. When in doubt, cut, refine and polish instead of adding.

# Learn from the best in the market

Before choosing the look, study **3–5 leading brand websites** in the set's industry and adjacent premium brands (for example Aesop, Glossier, Le Labo, Apple, Allbirds, Gentle Monster, Bang & Olufsen, Kinfolk — pick the ones that fit the industry). Note what makes them feel premium: hero composition, type, how products are shown, the motion and 3D, how they sell. Use what you learn as patterns, **never copy** a layout, copy text, logo or image. List the sites you studied in the summary.

A set is checked in 4 tiers. Tier 1 is pass/fail, tier 2 is scored per page, tier 3 is the set as a whole, tier 4 is the rules for each section type. Build to all four from the start — do not design first and patch later.

# The set (tier 3 — all required)

- **Exactly 7 pages**, in this order: Home, Product, Collection, About, Contact, Blog Article, Sale (the promotion landing page).
- **One brand throughout:** one invented store name, one voice, one product line on every page (never jewellery on Home and cosmetics on Product). Real-sounding product names, prices and copy. No lorem ipsum, no "Product name".
- **One industry, nameable as a label** (e.g. "Fine jewellery", "Specialty coffee") — put it first in the set's `blurb`.
- **One visual system** on all 7 pages: same palette, fonts, corner radius, button style, image style.
- **At most 2 font families** for the whole set.
- **A buying journey:** every CTA points somewhere real in the set — Home → Collection, Collection → Product, Sale → Product or Collection.
- **Clearly better than a free set**, and visibly so: something a free set does not have (a signature layout idea, richer product storytelling, a refined motion system, an editorial lookbook section…). Name it in the `blurb`.

# Every set is different

`existing` lists every set we already have. Before designing, read it and choose:

1. **An industry and concept none of them has.** Not just a new name: a different kind of store and customer. If the batch note names an industry, find an angle inside it that no existing set takes.
2. **A look none of them has.** Pick one distinct art direction, from a range like:
   editorial magazine · Swiss / grid-strict · quiet luxury (ivory, serif, airy) · dark luxe (black, gold or metal, high contrast) · brutalist / raw · retro 70s · Japanese minimal · Scandinavian soft · Mediterranean warm · bold colour-blocking · organic / earthy textures · techno-futuristic · art-deco · handcrafted / artisanal · playful pop.
   Make it specific before any HTML: the exact palette (4–6 hex values with their roles), a font pairing (Google Fonts; one display face with character + one readable text face), button and card shapes, the image treatment (full-bleed, framed, duotone, cut-out on colour…), and one signature layout idea that recurs across the set.
3. **Neither the structure nor the style may repeat an existing template.** Structure: no page's section sequence and layouts match the same page of an existing set (`public/collection-sets/<slug>/*.html` holds most of them — compare against the real HTML, not just the names). Style: no same display font, no near-identical palette. If your concept and look are close to an existing blurb, choose again.
4. Write it in the `blurb`: `<industry label> · <look: palette, type, signature layout> · <what makes it worth paying for>`.

# Tier 1 — technical floor (every page, pass/fail)

Required — a page that fails one of these is not done:
- **Content only — no header and no footer.** The page sits inside the merchant's own theme, which already has its header, menu and footer. So no site header or navigation bar, no logo bar, no announcement bar, no mobile menu, and no footer (no footer links, no newsletter-in-footer, no copyright line). The page starts with its first content section (the hero) and ends with its last content section. A newsletter or contact section is fine as a content section, not as a footer.
- Exactly **one H1**, in the first section. Headings never skip a level (no H2 → H4).
- **Every image has an alt** that describes what is actually in it.
- **No placeholder text** ("lorem ipsum", "this is your heading text", "button text") and **no placeholder images**.
- Home and every selling page have a **hero with a headline, a CTA button and an image**.
- **3 to 12 sections** per page.
- Product and Sale **show prices**.
- **Images:** never hotlinked from Unsplash, Pexels or another shop's CDN — only images we may use, and each image's source is listed (see the summary). Compressed, WebP, about 300 KB each at most. No more than 20 images per page.
- **Mobile 375 px:** no horizontal overflow, no overlapping text, no content lost.

Should have:
- Selling pages (Home, Product, Sale) have an **FAQ** and **social proof** (reviews, logos, numbers).
- A **meta title** (≤ 60 characters) and **meta description** (≤ 155 characters) proposed for every page — list them in the summary.
- Product has a **specs table**; FAQs are real questions with real answers.

# Tier 2 — page quality (score each page, 0–10 per criterion)

Score every page on these 7 criteria. **A page's grade is its weakest criterion, never the average.**

1. **Does the page's job** — every section that page type needs, in the right order (a selling page without price or CTA is a 5).
2. **CRO** — all 6: value proposition, social proof, objection handling, risk reversal, transparent pricing, clear CTA — each in the right place in the buying flow.
3. **Voice and copy** — one consistent writer, specific to the industry, usable as-is. Never "superior quality"-style filler.
4. **Layout and hierarchy** — background, density and alignment vary with purpose; the reading flow leads to the CTA. Never 3 same-style sections in a row.
5. **Mobile (375 px)** — every section reflows correctly and the reading flow survives.
6. **Consistency** — one palette, type scale, radius and button style across the page.
7. **Section standard** — every section has everything tier 4 requires of its type.

**Thresholds for this premium set (Builder):** weakest criterion **≥ 8 on Home, Product and Sale**, **≥ 7 on About, Collection, Contact and Blog Article**. Aim higher — these are floors.

**How to score:** score from screenshots at **1440 px desktop and 375 px mobile**. Score each page **3 times independently** (separate subagents if you can, otherwise three separate passes that do not see each other's scores) and take the **median**. A difference under ~1.5 points is noise. If you cannot render the mobile view, leave criterion 5 blank — do not guess — and say so in the summary. Any criterion below threshold: fix the page and score it again. Every page gets **at least 3 full review-and-improve rounds**, and more until it is genuinely premium — tokens and time are not a reason to stop.

# Tier 4 — rules per section type

Images and numbers are samples the merchant will replace, but they must fit the industry and look real.

| Section | Must have | Never |
|---|---|---|
| **Hero** (Home, Sale) | A headline that states the benefit to the customer; exactly 1 primary CTA; a real product image or video; a button colour used nowhere else in the hero | Generic promises ("top quality"); 2–3 equal buttons; decorative images unrelated to the product |
| **Category grid** (Home, Collection) | One distinct image per tile; labels that say what is inside; max 3–4 tiles per row on desktop, 2 on mobile; one intro line | Placeholder images; vague labels; 5+ tiles in a row |
| **Product block** (Product) | Images in order: studio, true scale, lifestyle, close-up; stars with a review count; scannable description; stock and delivery info; 1 primary CTA | A single image; stars without a count; a long description you must scroll to finish |
| **Reviews** (Home, Product) | Every quote signed by a name; every quote has a concrete detail (a number, a time, a situation); equal cards | Three generic praise cards; "4.6" drawn as 5 full stars; invented "Verified" badges |
| **FAQ** (Product, Contact, Sale) | Questions in the customer's voice; the objections that block buying (price, shipping, returns, size, warranty); one idea per question; answers lead with the fact | "Great question!" as an answer; long answers; skipping the price question |
| **Brand story** (About) | Why the brand exists; a real person behind it; at least 1 checkable detail (process, material, where it is made); a photo of a person or the process | A "founded in 2010" timeline; stock photos; a mission line any shop could use |
| **Contact** (Contact) | A specific address or a clear "online only"; at least 1 way to reach us besides a map; opening hours if there is a shop | "Your address here"; a map with no pin |
| **Countdown** (Sale) | A reason for the deadline (the sale's name); one clear end time; a CTA right next to the timer | A timer with no offer; "almost gone" with no date |
| **Article list** (Blog) | Date and author; a cover image; title plus a 1–2 sentence summary; a read-more button | Posts without a date; images unrelated to the post |

Any other section type: give it what that type needs to do its job, by the same logic (a clear purpose, real-looking content, one CTA where it sells).

# Premium craft (on top of the tiers)

- Spacing on an 8-px scale; a clear type scale (display / headings / body / caption); body 16–18 px, line length 60–75 characters, line-height 1.5–1.7.
- One accent colour, used deliberately; text contrast at least WCAG AA.
- Refined dividers, eyebrow labels, numbered sections; one consistent icon set; nothing default-looking.
- Only what PageFly can reproduce (follow the pagefly-builder rules), and the `.pagefly` must render identically to its HTML.

# Motion (required — a premium set must feel alive)

Every set has a **motion system**: designed once with the look, used the same way on all 7 pages. Motion draws the eye to what sells, never decorates for its own sake. Use only the tested pagefly-builder pieces — the `behaviors(...)` pack, `animationHover`, CSS transitions — so it works the same in the PageFly editor and on the live store; never hand-written scroll JS.

Required on every set:
- **Scroll reveal** (`reveal`, class `pu-rv`) on section headings, cards and images — staggered in grids and lists, short (300–700 ms), small distance (16–32 px). Never on the hero headline or the first CTA: those are visible at once.
- **Hover on everything clickable:** buttons (colour or fill sweep + slight lift), links (underline that draws in), product and blog cards (image zoom 1.03–1.06 inside its frame, or `animationHover`), category tiles.
- **Home:** at least one moving strip — a `marquee` of press logos, USPs or the brand line — and `count-up` on any stats row (customers, years, reviews).
- **Product:** gallery thumbnails with a clear active/hover state; add-to-cart button with a hover state that stands out; reviews and FAQ open and close smoothly.
- **Sale:** a live `countdown` next to its CTA (tier 4); a discount code with `copy-code` if there is one.

Then give the set **one signature motion** of its own, matching its art direction, and say it in the `blurb` — e.g. a slow Ken Burns on the hero image (quiet luxury), split-text heading reveal (editorial), a tilt-on-hover product card (techno), a hand-drawn underline on links (artisanal), a horizontal scroll lookbook strip (fashion). Not the same signature as an existing set.

## 3D — when it fits the set

Use **3D depth where it suits the industry and the look** — not on every set, and never just to show off. Choose like the best sites in that industry do:
- Tech, audio, eyewear, sneakers, watches, furniture, beauty bottles: a product that **turns, tilts or floats** — a tilt-on-hover product card with depth (perspective + rotateX/Y), a hero product that rotates a few degrees as you scroll, layered cut-outs moving at different depths.
- Fashion, lifestyle, editorial: **depth through layers** — parallax layers, cards that flip to show details, a stacked-card gallery.
- Quiet luxury, minimal, artisanal: usually **no 3D**, or only a very soft depth (a gentle shadow lift, a slow parallax).

Build 3D with **CSS 3D transforms** (`perspective`, `rotateX/Y`, `translateZ`, `transform-style: preserve-3d`) and the reveal / hover pieces above — these reproduce in PageFly. Do not use WebGL, three.js or 3D model viewers: they are not verified in PageFly and are heavy on mobile. On mobile, 3D becomes a flat, lighter version (no hover-tilt on touch). Say in the summary whether the set uses 3D and why.

Limits:
- Content is fully visible and usable with motion off: honour `prefers-reduced-motion`, and nothing stays hidden if a script fails.
- Smooth: animate only `transform` and `opacity`; no layout jumps, no scroll-jacking, no autoplaying carousels faster than 5 s.
- On mobile (375 px), lighter: shorter distances, no hover-only information.
- At most one looping animation in view at a time.

# Before upload

For each page, after scoring: tier 1 all required lines pass, tier 2 weakest criterion meets its threshold, every section meets tier 4, and the motion list above is in place and matches between the HTML and the `.pagefly`. Then for the set: every tier 3 line passes and the set is clearly different from everything in `existing`. Only then upload.

In the final summary, for each set add: the industry label; each page's 7 tier-2 scores (median) and its weakest criterion; any tier-1 "should have" not met; the proposed meta title and description of each page; the set's signature motion; and the source of every image.
