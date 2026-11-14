# Tiêu chí tổng — bộ premium, không giới hạn ngân sách

> Routine đọc file này từ repo (nhánh main) mỗi lần nhận một bộ — sửa ở đây rồi push là routine dùng bản mới, không cần dán lại đâu cả.
> Ô "Tiêu chí build" trên giao diện là ý tưởng thêm của admin, áp lên trên file này; để trống thì chỉ dùng file này. Ghi chú của từng lượt (ngành, dịp lễ…) áp thêm lên trên cùng.
> Gộp từ "Bộ tiêu chí chất lượng cho Store sets" (21/10/2026): tầng 1 sàn kỹ thuật, tầng 2 chấm 7 tiêu chí, tầng 3 cả bộ, tầng 4 luật từng loại section, ngưỡng của bộ khoá gói Builder.

---

# What we sell

Each set is a **premium set with an unlimited budget** — the best work we can make, as if money were no object: no cap on effort, rounds, tokens or polish. It is a Builder-plan set, so it must pass the **Builder threshold** below, not just the free one. It should make a merchant's store look like a top-tier brand, the kind of site a leading design agency would be proud to ship. If a set would not make a merchant say "this looks expensive" in the first three seconds, it is not finished. When in doubt, cut, refine and polish instead of adding.

# Which market — choose it first

Every set is built for **one market** chosen before the concept. The mix follows where PageFly's stores are (AC2, 14/11/2026: 559k stores — English-speaking ~43%, Europe ~19%, emerging markets ~24%, Asia & Middle East ~7%), weighted by who pays for a premium set. Out of every 10 sets:

| Slot | Market | Count per 10 | Language of the copy | Style and direction (a starting point — the local research decides) |
|---|---|---|---|---|
| EN | English-speaking: US, UK, Canada, Australia — one country per set, vary it between EN sets | 3 | English of that country (US or British spelling, its idioms) | US: bold, benefit-led, heavy social proof, Klarna/Afterpay. UK: refined, understated, editorial. AU/CA: relaxed, outdoorsy, sustainable. Biggest categories: beauty/skincare, fashion, home, supplements/wellness, pets, outdoor. $, £, C$ or A$ |
| FR-IT | France or Italy — one per set | 1 | French or Italian | Elegant, editorial, heritage and savoir-faire / artigianalità; restrained colour, refined serifs, lots of white space. Fashion, fragrance, artisanal food. € written the local way (29,90 €) |
| DE-NL-NORDIC | Germany, Netherlands, Sweden, Denmark or Norway — one per set | 1 | That country's language | Functional, calm, precise, grid-strict; muted natural palette; facts and specs up front, trust and quality seals, clear returns. Furniture, design objects, outdoor. € / kr |
| IN-PK | India or Pakistan — one per set | 1 | English, as Indian/Pakistani e-commerce writes it (₹ / Rs, lakh, sizes S–XXL and free-size), with Hindi or Urdu words where the brands there use them (product names, festival lines) | Rich colour and pattern, festive (Diwali, Eid, wedding season), jewellery and ethnic wear shown on people; mobile-first and light; cash on delivery and a WhatsApp contact |
| LATAM-TR | Brazil, Mexico, Colombia or Turkey — one per set | 1 | Brazilian Portuguese, Spanish (Latin American) or Turkish | Warm, bold colour, energetic, people-first imagery; mobile-first; instalment prices (R$ "em até 12x", "meses sin intereses", "taksit"), Pix / OXXO cues |
| JP | Japan | 2 | Japanese | Minimal yet information-dense, careful hierarchy, small precise type, soft palette, seasonal cues; detailed specs and gift wrapping (ギフト包装); ¥ with 税込. Tea, ceramics, skincare, stationery, fashion |
| GULF | UAE or Saudi Arabia — one per set | 1 | Arabic (right-to-left), with English product names where brands there keep them | Luxury, gold/black or sand tones, oud and fragrance, modest fashion, gifting; generous imagery; AED / SAR, cash on delivery, Tabby/Tamara instalments |

**How to choose:** read `existing` and count the sets per slot — by the market tag at the start of each `blurb`. A set without a tag (the older ones, and US/UK/AU/CA tags) counts by its currency and look; if that is unclear, count it as EN. Then pick the slot furthest below its share (target = its count per 10 × (number of sets + 1) / 10, minus what it already has); on a tie, the slot with the larger count per 10, then the one higher in the table. If the batch note or the admin's criteria name a market or a country, that wins.

**Every set, whatever the market:**
- **All copy in the market's language** (the column above) — headlines, buttons, product names and descriptions, reviews, FAQ, blog article, image alts, meta title and description. Written as a native copywriter in that country would write it for a premium brand, never translated word for word from English. The `<html lang>` matches it. The admin-facing `blurb` and the summary stay in English/Vietnamese.
- **Style fits that market's taste** — not a global template with a local language on top. The look, density, imagery, colour and the way it sells come from the leading brands in that country (see below). The people, places and occasions in the photos belong to that market — real to someone who lives there, never a cliché of it.
- **Local commerce cues throughout:** currency and price format, the payment methods and instalments people there use, shipping and returns as stores there phrase them, sizes and units, the holidays and seasons they shop for.
- **Fonts that cover the language** — check the Google Fonts subsets before choosing: Latin Extended for Turkish, Polish, Portuguese, Scandinavian; a Japanese face (e.g. Noto Sans/Serif JP, Zen Kaku Gothic, Shippori Mincho) for JP; an Arabic face (e.g. Noto Kufi Arabic, Tajawal, IBM Plex Sans Arabic) for GULF. The 2-family limit still holds — pair the local face with one Latin face at most.
- **GULF is right-to-left:** `dir="rtl"`, layout mirrored (text start on the right, arrows and carousels reversed). Follow the pagefly-builder rules for RTL; if a piece cannot be mirrored in PageFly, choose a layout that does not need it.
- **Headlines and buttons fit the language** — German, French and Portuguese run 20–30% longer than English, Japanese and Arabic need more line height. No text baked into images.
- **Light on mobile**, and lightest of all for IN-PK and LATAM-TR: their customers shop on mid-range phones over slow networks — no video background, motion on `transform`/`opacity` only, images within the tier 1 limits.

# Learn from the best in the market — then go beyond it

**Research before any idea.** Find the **5–8 best online stores in the set's market and industry**: the ones customers there actually buy from and that people in the trade hold up as the best (category leaders, fast-growing DTC brands, Awwwards / Shopify-showcase picks from that country). Look at them on their local site, in the local language — e.g. Japan: Aesop JP, Muji, Shiseido, Kinto, Beams; France: Sézane, Diptyque, Maison Kitsuné, Jacquemus; Germany: Hessnatur, Manufactum, Armedangels; India: Sabyasachi, FabIndia, Nykaa; Brazil: Farm Rio, Granado, Osklen; Gulf: Ajmal, Arabian Oud, Ounass. At most one global brand, and only if it is big in that market.

For each one, screenshot Home and a Product page at 1440 px and 375 px (with a headless browser if one is available; otherwise read the page's HTML and describe it) and write down:
- the **hero**: what fills the first screen, how the product is shown, where the price, offer and CTA sit;
- the **sections** in order, and which ones are **unusual** — the ones a basic template does not have;
- the **selling devices**: social proof, urgency, bundles, guarantees, size or shade help, payment and delivery cues;
- the **look**: type, colour, image style, density, motion.

Put the screenshots and notes together as a **reference board** in the brief. Learn the patterns, then make something of our own that is at least as good: **never copy** a layout, text, logo or image.

# The creative bar — fashionable, distinctive, makes people buy

The test for every selling page (Home, Product, Sale): **a shopper from that market looks at the first screen and wants the product right now** — it looks like the most fashionable brand in its category this year, and the way to buy is obvious.

**Distinctive sections, not a basic template.** A page made only of hero → 3 cards → image/text → testimonials → newsletter is a fail. Each selling page has **at least 3 sections that a basic template does not have**, and Home, Product and Sale do not share the same ones. Choose what fits the industry and the market, for example:
- shop-the-look / lookbook with product hotspots; a horizontal-scroll editorial strip;
- before/after slider; shade, size or fit finder; a "which one is for you" quiz-style picker;
- ingredient, material or origin explorer (tabs or a map); a "how it is made" step timeline with photos;
- comparison table (us vs the usual alternative); a routine or bundle builder with a bundle price;
- UGC / customer-photo wall; press-quote marquee; a stats row with count-up;
- a scent, flavour or texture profile chart; a "complete the set" / frequently-bought-together block; a sticky add-to-cart bar on mobile.
Every one of them must be buildable in PageFly (pagefly-builder rules) and do a selling job — never decoration. Name the set's distinctive sections in the `blurb`.

**Conversion built in from the first screen:**
- Above the fold on Home and Product: the product (on a person or in use, not floating alone), the benefit headline, the price or offer, one strong CTA, and a social-proof line (stars with a count, a press name, a number of customers).
- The buying journey has no dead ends: every section ends in a next step; the Product page answers price, delivery, returns, size/shade and payment before the shopper has to ask.
- Proof is specific (named reviews with a detail, real-looking numbers); urgency is honest (a dated offer, real stock), never fake.
- The local cues that make that market trust a shop (payment logos, instalments, cash on delivery, local delivery times, the return promise) sit next to the CTA.

**SEO, in the market's language:**
- Each page targets one **primary search phrase people in that market type in their language** (e.g. JP 「オーガニック 化粧水」, FR "huile d'olive bio", DE "Leinen Bettwäsche") plus 2–3 related ones. It appears in the H1, the meta title (≤ 60 characters), the meta description (≤ 155), the first paragraph and at least one H2 — naturally, never stuffed. List them in the summary.
- One H1, headings in order, real text (never text in images), descriptive alt text in the market's language, internal links between the set's pages with descriptive anchor text, FAQ written as the questions people search.
- Fast: hero image ≤ 200 KB, every image sized for its frame, no layout shift; light on mobile.

**Never the "AI template" look.** None of these, which the first sets all fell into:
- a vertical numbered rail down the left edge with dots; mono uppercase eyebrow labels like "01 — …" on every section;
- the split hero (big headline left, picture right) as the default — choose the hero from the reference board and do not repeat the previous set's hero type (full-bleed photo, editorial collage, centred hero product, text over image, lookbook grid, video/image sequence…);
- a grotesk + mono font pairing; every card with the same radius and border; a row of 4 identical cards on every page;
- flat vector illustrations or drawn products standing in for photography;
- filler copy ("elevate your", "crafted with care", "superior quality").

**Photography, not illustration.** A premium store sells with photos. Every set has one consistent **photo direction** (light, colour grade, backgrounds, models, props) from the brief, shown on all 7 pages: the same products look the same on every page, and the people and places belong to the market. Images are made and hosted as the routine instructions say ("Images"); never a stock photo that does not show this brand's product, never an unrelated landscape.

# The set (tier 3 — all required)

- **Exactly 7 pages**, in this order: Home, Product, Collection, About, Contact, Blog Article, Sale (the promotion landing page).
- **One brand throughout:** one invented store name, one voice, one product line on every page (never jewellery on Home and cosmetics on Product). Real-sounding product names, prices and copy. No lorem ipsum, no "Product name".
- **One market** (from "Which market" above) and **one industry, nameable as a label** (e.g. "Fine jewellery", "Specialty coffee") — put both first in the set's `blurb`, market then industry.
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
4. Write it in the `blurb` (in English): `<market slot> (<country, language>) · <industry label> · <look: palette, type, signature layout> · <what makes it worth paying for>` — e.g. `FR-IT (France, French) · Artisanal fragrance · ivory and oxblood, Didone serif, asymmetric editorial grid · signature: split-text reveal`.

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

Also for the set: every word a customer sees is in the market's language, the look fits that market, its currency and commerce cues are used throughout, and no headline or button overflows in that language (GULF: mirrored right-to-left).

In the final summary, for each set add: the market slot and why it was chosen (the counts per slot); the industry label; each page's 7 tier-2 scores (median) and its weakest criterion; any tier-1 "should have" not met; the proposed meta title and description of each page; the set's signature motion; and the source of every image.
