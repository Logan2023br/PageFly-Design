import type { Brief } from "./validation";
import { DENSITY_SCALE } from "./styleTokens";
import type {
  BlockKind,
  MockupBlock,
  MockupTokens,
  PageMockup,
} from "./generate/types";
import { STORE_TYPES } from "./briefOptions";

/* ==========================================================================
   FlyMate prompt export.

   A merchant copies this and pastes it into PageFly's FlyMate, which builds the
   page from text. So the prompt is not a summary — it is a build spec. Anything
   left vague is something FlyMate will invent differently from the mockup.

   Three rules shape the format:

   1. Exact values, never adjectives. "#0E0D0B" not "dark". "3px solid #000000"
      not "thick borders". A colour described in words comes back a different
      colour.
   2. Every section, in order, numbered. FlyMate composes top to bottom, and an
      unordered list of features produces a different page each time.
   3. Copy verbatim, in quotes, with an explicit instruction not to rewrite it.
      The headline in the mockup was derived from the merchant's brief; having it
      paraphrased loses the thing they approved.

   The mockup is the source of truth here — everything below is read off
   `PageMockup`, so a prompt can never drift from the page it describes.
   ========================================================================== */

const q = (s: string) => `"${s.replace(/"/g, "'")}"`;

function densityWords(tokens: MockupTokens): string {
  const scale = DENSITY_SCALE[tokens.density];
  switch (tokens.density) {
    case "airy":
      return `airy — generous whitespace, roughly ${Math.round(84 * scale)}px of vertical padding per section`;
    case "tight":
      return `tight — compact, roughly ${Math.round(84 * scale)}px of vertical padding per section, editorial density`;
    default:
      return `balanced — roughly ${Math.round(84 * scale)}px of vertical padding per section`;
  }
}

function imageWords(tokens: MockupTokens): string {
  switch (tokens.imageTreatment) {
    case "warm":
      return "warm and slightly desaturated, as if shot on film";
    case "mono":
      return "black and white, high contrast";
    case "duotone":
      return "duotone, desaturated and slightly darkened";
    case "grain":
      return "soft, muted, with visible grain";
    case "vivid":
      return "saturated and punchy";
    default:
      return "clean and true to colour";
  }
}

function fontWords(stack: string): string {
  if (stack.includes("serif") && !stack.includes("sans")) return "a serif";
  if (stack.includes("mono")) return "a monospace";
  if (stack.includes("rounded")) return "a rounded sans-serif";
  if (stack.includes("Narrow") || stack.includes("Impact"))
    return "a condensed sans-serif";
  return "a geometric sans-serif";
}

/* ==========================================================================
   Per-block descriptions.
   ========================================================================== */

function describeBlock(block: MockupBlock, tokens: MockupTokens): string[] {
  const out: string[] = [];

  switch (block.kind) {
    case "nav": {
      const nav = block.content;
      if (nav.announcement) {
        out.push(
          `Announcement bar across the very top, ${tokens.accent} background with ${tokens.accentInk} text, centered, small and uppercase: ${q(nav.announcement)}.`,
        );
      }
      out.push(
        `Header. Text wordmark ${q(nav.brand)} on the left. Nav links, in this order: ${nav.links.map(q).join(", ")}. On the right: a "Search" link and a cart showing ${q(`Cart (${nav.cartCount})`)}.${nav.ctaLabel ? ` Plus a solid ${tokens.accent} button ${q(nav.ctaLabel)}.` : ""} Collapse to a hamburger below 560px.`,
      );
      return out;
    }

    case "hero": {
      const h = block.content;
      const layout =
        h.layout === "fullBleed"
          ? "Full-bleed hero: one large image spanning the full width, copy overlaid on the bottom-left over a dark gradient scrim"
          : h.layout === "centered"
            ? "Centered hero: copy stacked and centre-aligned, with a wide image below it"
            : "Split hero: copy on the left, image on the right, vertically centred, roughly 50/50";
      out.push(`${layout}.`);
      if (h.eyebrow)
        out.push(
          `  Eyebrow above the headline, uppercase, letter-spaced, in ${tokens.accent}: ${q(h.eyebrow)}.`,
        );
      out.push(`  H1: ${q(h.headline)}.`);
      const words = h.headline.split(" ");
      const hot = words[h.highlight]?.replace(/[^\p{L}\p{N}'-]/gu, "");
      if (h.highlight >= 0 && hot) {
        out.push(
          `  Colour exactly one word of that headline — ${q(hot)} — in ${tokens.accent}. Leave every other word in the normal heading colour.`,
        );
      }
      out.push(`  Sub-copy, one paragraph: ${q(h.sub)}.`);
      out.push(
        `  Primary button, solid ${tokens.accent}: ${q(h.primaryCta)}.${h.secondaryCta ? ` Secondary outlined button next to it: ${q(h.secondaryCta)}.` : ""}`,
      );
      if (h.stat)
        out.push(
          `  Small stat card near the copy: the figure ${q(h.stat.value)} large and in ${tokens.accent}, with the label ${q(h.stat.label)} beneath it.`,
        );
      return out;
    }

    case "logoStrip": {
      const l = block.content;
      out.push(
        `Logo strip, a single centred row.${l.label ? ` Small uppercase label above it: ${q(l.label)}.` : ""} Wordmarks, evenly spaced, at about 40% opacity: ${l.names.map(q).join(", ")}.`,
      );
      return out;
    }

    case "collectionHeader": {
      const h = block.content;
      out.push(`Collection header.`);
      out.push(`  Breadcrumb: ${q(`Home / ${h.title}`)}.`);
      out.push(`  H1: ${q(h.title)}.`);
      out.push(`  Intro paragraph: ${q(h.description)}.`);
      out.push(
        `  Below a divider: filter pills ${h.filters.map(q).join(", ")} on the left; on the right the count ${q(h.resultCount)} and a sort pill ${q(h.sortLabel)}.`,
      );
      return out;
    }

    case "productGrid": {
      const g = block.content;
      out.push(
        `Product grid, ${g.columns} across on desktop, ${Math.min(g.columns, 3)} on tablet, 2 on mobile.${g.title ? ` Section heading: ${q(g.title)}.` : ""}${g.subtitle ? ` Sub-copy: ${q(g.subtitle)}.` : ""}`,
      );
      out.push(
        `  ${g.products.length} cards, each an image above the name and price. Use these exactly:`,
      );
      for (const p of g.products) {
        out.push(
          `    - ${q(p.name)} — ${p.price}${p.compareAt ? `, struck-through was ${p.compareAt}` : ""}${p.badge ? `, corner badge ${q(p.badge)}` : ""}`,
        );
      }
      return out;
    }

    case "productDetail": {
      const p = block.content;
      out.push(`Product detail, two columns on desktop (gallery left, info right).`);
      out.push(
        `  Gallery: one large image with ${p.galleryCount - 1} thumbnails in a row beneath it.`,
      );
      out.push(`  Breadcrumb: ${q(`Home / Shop / ${p.name}`)}.`);
      out.push(`  H1: ${q(p.name)}.`);
      out.push(
        `  ${p.rating} of 5 stars followed by ${q(p.reviewCount)}.`,
      );
      out.push(
        `  Price ${p.price} large${p.compareAt ? `, with ${p.compareAt} struck through beside it` : ""}.`,
      );
      out.push(
        `  ${p.variantLabel} swatches, first one selected: ${p.variants.map(q).join(", ")}.`,
      );
      if (p.sizes)
        out.push(
          `  ${p.sizeLabel} selector with a "Size guide" link on the same row: ${p.sizes.map(q).join(", ")}. Show the last one as sold out (struck through, dimmed).`,
        );
      out.push(
        `  Full-width primary button ${q(p.cta)}, and an outlined button ${q("Buy it now")} beneath it.`,
      );
      out.push(`  Bulleted list under the buttons, each bullet in ${tokens.accent}:`);
      for (const b of p.bullets) out.push(`    - ${q(b)}`);
      return out;
    }

    case "featureRow": {
      const f = block.content;
      out.push(
        `Feature row, ${f.columns} columns.${f.title ? ` Section heading: ${q(f.title)}.` : ""}${f.sub ? ` Sub-copy: ${q(f.sub)}.` : ""}`,
      );
      out.push(
        `  Each column: a small square badge with a two-digit number (01, 02, …) in ${tokens.accent} on a tint of it, then a heading, then a short paragraph.`,
      );
      f.items.forEach((it, i) =>
        out.push(
          `    ${String(i + 1).padStart(2, "0")} — heading ${q(it.title)}, body ${q(it.body)}`,
        ),
      );
      return out;
    }

    case "imageSplit": {
      const s = block.content;
      out.push(
        `Two-column band, image on the ${s.side}, copy on the other side, vertically centred.`,
      );
      if (s.eyebrow) out.push(`  Eyebrow in ${tokens.accent}: ${q(s.eyebrow)}.`);
      out.push(`  Heading: ${q(s.headline)}.`);
      out.push(`  Body: ${q(s.body)}.`);
      if (s.cta) out.push(`  Outlined button: ${q(s.cta)}.`);
      return out;
    }

    case "testimonials": {
      const t = block.content;
      out.push(
        `Testimonials, 3 cards across on desktop, 1 on mobile. Centred section heading: ${q(t.title)}.`,
      );
      out.push(
        `  Each card: star rating, the quote in the normal text colour (not muted), then a small round avatar with the name and role.`,
      );
      for (const it of t.items)
        out.push(
          `    - ${it.rating} stars · ${q(it.quote)} · ${q(it.author)}, ${q(it.role)}`,
        );
      return out;
    }

    case "statsRow": {
      const s = block.content;
      out.push(
        `Stats row, ${s.items.length} across on desktop and 2 on mobile. Each figure large and in ${tokens.accent} with a muted label beneath.`,
      );
      out.push(
        `  ${s.items.map((i) => `${i.value} / ${q(i.label)}`).join("  ·  ")}`,
      );
      return out;
    }

    case "promoBanner": {
      const p = block.content;
      const bg = p.tone === "accent" ? tokens.accent : tokens.ink;
      const fg = p.tone === "accent" ? tokens.accentInk : tokens.bg;
      out.push(
        `Full-width promo band, ${bg} background with ${fg} text. Heading on the left${p.sub ? " with a smaller line beneath it" : ""}, button on the right.`,
      );
      out.push(`  Heading: ${q(p.headline)}.`);
      if (p.sub) out.push(`  Sub-line: ${q(p.sub)}.`);
      out.push(`  Button: ${q(p.cta)}.`);
      return out;
    }

    case "countdown": {
      const cd = block.content;
      out.push(
        `Countdown band, ${tokens.accent} background with ${tokens.accentInk} text, everything centred.`,
      );
      out.push(`  Heading: ${q(cd.headline)}.`);
      out.push(
        `  Four boxes in a row showing 02, 14, 39, 06 with the labels ${cd.units.map(q).join(", ")} beneath them. Static digits — do not wire up a live timer.`,
      );
      if (cd.sub) out.push(`  Sub-line: ${q(cd.sub)}.`);
      return out;
    }

    case "faqAccordion": {
      const f = block.content;
      out.push(
        `FAQ accordion, max width about 760px, centred. Section heading: ${q(f.title)}.`,
      );
      out.push(
        `  ${f.items.length} rows separated by hairlines, a +/− marker on the right of each. Show only row ${f.openIndex + 1} expanded; collapse the rest.`,
      );
      f.items.forEach((it, i) =>
        out.push(`    Q${i + 1} ${q(it.q)} → A ${q(it.a)}`),
      );
      return out;
    }

    case "blogList": {
      const b = block.content;
      out.push(`Journal index. Section heading: ${q(b.title)}.`);
      out.push(
        `  Featured post first, two columns — image left, copy right: tag ${q(b.featured.tag)}, date ${q(b.featured.date)}, heading ${q(b.featured.title)}, excerpt ${q(b.featured.excerpt)}, and a ${tokens.accent} "Read it →" link.`,
      );
      out.push(`  Then a hairline, then a 4-across grid of smaller posts:`);
      for (const p of b.posts)
        out.push(
          `    - ${q(p.tag)} · ${q(p.date)} · ${q(p.title)} · ${q(p.excerpt)}`,
        );
      return out;
    }

    case "blogArticle": {
      const a = block.content;
      out.push(`Article, single column, max width about 700px, centred.`);
      out.push(
        `  Tag pill ${q(a.tag)}, then a byline line ${q(`${a.author} · ${a.date} · ${a.readTime}`)}.`,
      );
      out.push(`  H1: ${q(a.title)}.`);
      out.push(`  A wide image below the title.`);
      out.push(`  Body paragraphs, in this order, in the full text colour:`);
      a.paragraphs.forEach((p, i) => out.push(`    ${i + 1}. ${q(p)}`));
      out.push(
        `  After the second paragraph, a pull quote — large, with a 3px ${tokens.accent} left border: ${q(a.pullQuote)}.`,
      );
      out.push(
        `  Footer row: ${q(`Written by ${a.author}`)} on the left, "Share" and "Copy link" on the right.`,
      );
      return out;
    }

    case "cartSummary": {
      const s = block.content;
      out.push(
        `Cart, two columns on desktop — line items left, summary card right.`,
      );
      out.push(`  H1: ${q(s.title)}.`);
      out.push(`  Line items, each with a thumbnail, name, variant, a − qty + stepper, a "Remove" link, and the price on the right:`);
      for (const it of s.items)
        out.push(
          `    - ${q(it.name)} · ${q(it.variant)} · qty ${it.qty} · ${it.price}`,
        );
      out.push(`  Summary card rows: ${s.rows.map((r) => `${q(r.label)} ${r.value}`).join(", ")}.`);
      out.push(
        `  Then a hairline and the total: ${q(s.total.label)} ${s.total.value}, both bold.`,
      );
      out.push(`  Full-width button ${q(s.cta)} and small print ${q(s.note)}.`);
      return out;
    }

    case "leadForm": {
      const f = block.content;
      out.push(
        f.layout === "centered"
          ? `Lead capture, centred, max width about 520px.`
          : `Lead capture, two columns — copy left, form card right.`,
      );
      if (f.eyebrow) out.push(`  Eyebrow: ${q(f.eyebrow)}.`);
      out.push(`  Heading: ${q(f.headline)}.`);
      out.push(`  Body: ${q(f.body)}.`);
      out.push(
        `  Form fields, in order${f.fields.some((x) => x.wide) ? " (wide ones span both columns)" : ""}: ${f.fields.map((x) => q(x.label) + (x.wide ? " [full width]" : "")).join(", ")}.`,
      );
      out.push(`  Full-width submit button ${q(f.cta)}.`);
      if (f.note) out.push(`  Small print under it: ${q(f.note)}.`);
      return out;
    }

    case "dataTable": {
      const t = block.content;
      out.push(`Comparison table. Section heading: ${q(t.title)}.`);
      if (t.note) out.push(`  Sub-copy: ${q(t.note)}.`);
      out.push(`  Header row: ${t.columns.map(q).join(" | ")}.`);
      for (const row of t.rows) out.push(`    ${row.map(q).join(" | ")}`);
      if (t.booleanCells)
        out.push(
          `  Render "yes" cells as a ${tokens.accent} check and "no" cells as a muted dash.`,
        );
      if (t.highlightColumn >= 0)
        out.push(
          `  Tint column ${t.highlightColumn + 1} with a light wash of ${tokens.accent}.`,
        );
      out.push(`  First column left-aligned and bold; the rest centred.`);
      return out;
    }

    case "pricingTiers": {
      const p = block.content;
      out.push(
        `Pricing, ${p.tiers.length} cards across on desktop and stacked on mobile. Centred heading: ${q(p.title)}.${p.sub ? ` Sub-copy: ${q(p.sub)}.` : ""}`,
      );
      for (const t of p.tiers) {
        out.push(
          `    - ${q(t.name)}: price ${q(t.price)}, period ${q(t.period)}, button ${q(t.cta)}${t.featured ? `, THIS ONE HIGHLIGHTED with a 2px ${tokens.accent} border and a "Most popular" pill overlapping its top edge` : ""}`,
        );
        out.push(`        features: ${t.features.map(q).join(", ")}`);
      }
      return out;
    }

    case "quizStep": {
      const s = block.content;
      out.push(`Quiz step, single column, max width about 620px, centred.`);
      out.push(
        `  Eyebrow ${q(`Step ${s.step} of ${s.total}`)} with ${q(`${Math.round((s.step / s.total) * 100)}%`)} on the right, and a thin ${tokens.accent} progress bar beneath at that fill.`,
      );
      out.push(`  Question as a large heading: ${q(s.question)}.`);
      out.push(`  Radio option cards, option ${s.selected + 1} selected:`);
      for (const o of s.options)
        out.push(`    - ${q(o.label)}${o.hint ? ` — hint ${q(o.hint)}` : ""}`);
      out.push(`  Footer: outlined "Back" left, primary "Next question" right.`);
      return out;
    }

    case "accountPanel": {
      const a = block.content;
      if (a.mode === "auth") {
        out.push(`Sign-in card, max width about 400px, centred.`);
        out.push(
          `  Two-segment tab control at the top, first one active: ${a.tabs.map(q).join(", ")}.`,
        );
        out.push(`  Heading ${q(a.title)}${a.sub ? `, sub-copy ${q(a.sub)}` : ""}.`);
        out.push(
          `  Fields: ${(a.fields ?? []).map((f) => q(f.label)).join(", ")}. Full-width button ${q(a.cta ?? "Sign in")}, and a centred "Forgot your password?" link.`,
        );
        return out;
      }
      out.push(`Account dashboard.`);
      out.push(`  H1 ${q(a.title)}${a.sub ? `, sub-copy ${q(a.sub)}` : ""}.`);
      out.push(`  Tab pills, first active: ${a.tabs.map(q).join(", ")}.`);
      out.push(`  Order rows in a bordered card, hairline between each:`);
      for (const o of a.orders ?? [])
        out.push(
          `    - ${q(o.id)} · ${q(o.date)} · status pill ${q(o.status)} · ${o.total} · "View" button`,
        );
      return out;
    }

    case "orderTracker": {
      const t = block.content;
      out.push(`Order tracking, max width about 780px, centred.`);
      out.push(
        `  Eyebrow ${q(`Order ${t.orderId}`)}, heading ${q(t.eta)}, and an outlined "Contact support" button on the right.`,
      );
      out.push(
        `  Horizontal stepper on desktop, vertical on mobile. Completed steps get a filled ${tokens.accent} dot with a check; upcoming ones an empty outline. The connecting line is ${tokens.accent} only between completed steps.`,
      );
      for (const s of t.steps)
        out.push(
          `    - ${q(s.label)} — ${q(s.detail)} — ${s.done ? "DONE" : "not yet"}`,
        );
      out.push(
        `  Below it, the items in the order: ${t.items.map((i) => `${q(i.name)} ×${i.qty}`).join(", ")}.`,
      );
      return out;
    }

    case "contactPanel": {
      const cp = block.content;
      out.push(`Contact, two columns — details left, form card right.`);
      out.push(`  Heading ${q(cp.headline)}, body ${q(cp.body)}.`);
      out.push(
        `  Detail rows separated by hairlines: ${cp.methods.map((m) => `${q(m.label)} → ${q(m.value)}`).join(", ")}.`,
      );
      if (cp.hasMap) out.push(`  A wide map image below the details.`);
      out.push(
        `  Form fields: ${cp.fields.map((f) => q(f.label) + (f.wide ? " [full width]" : "")).join(", ")}. Full-width button ${q(cp.cta)}.`,
      );
      return out;
    }

    case "mediaWall": {
      const m = block.content;
      out.push(
        `Image wall, 3 across on desktop and 2 on mobile, tight 10px gutters. Centred heading ${q(m.title)}${m.sub ? `, sub-copy ${q(m.sub)}` : ""}.`,
      );
      if (m.handle) out.push(`  A pill under the heading showing ${q(m.handle)}.`);
      out.push(
        `  ${m.tiles.length} tiles, mixed portrait and square${m.tiles.some((t) => t.wide) ? ", with the first one spanning two columns" : ""}.`,
      );
      if (m.shoppable)
        out.push(
          `  Small round ${tokens.accent} "+" button in the bottom-right of each tile.`,
        );
      if (m.tiles.some((t) => t.caption))
        out.push(
          `  Captions overlaid top-left in white on the tiles that have one.`,
        );
      return out;
    }

    case "richText": {
      const r = block.content;
      out.push(`Prose block, single column, max width about 680px.`);
      if (r.eyebrow) out.push(`  Eyebrow: ${q(r.eyebrow)}.`);
      out.push(`  H1: ${q(r.title)}.`);
      out.push(`  Lead paragraph, larger than body: ${q(r.lead)}.`);
      for (const s of r.sections)
        out.push(`  Sub-heading ${q(s.heading)} then ${q(s.body)}.`);
      return out;
    }

    case "listPanel": {
      const l = block.content;
      out.push(
        `List panel in one bordered card, hairline between rows. Heading ${q(l.title)}${l.sub ? `, sub-copy ${q(l.sub)}` : ""}.`,
      );
      for (const r of l.rows)
        out.push(
          `    - ${q(r.primary)} · ${q(r.secondary)}${r.meta ? ` · ${q(r.meta)}` : ""}${r.action ? ` · outlined "${r.action}" button on the right` : ""}`,
        );
      return out;
    }

    case "emptyState": {
      const e = block.content;
      out.push(`Empty state, centred, max width about 520px.`);
      if (e.code)
        out.push(
          `  The code ${q(e.code)} very large in ${tokens.accent} above everything.`,
        );
      out.push(`  Heading ${q(e.headline)}, body ${q(e.body)}.`);
      if (e.searchable)
        out.push(
          `  A pill-shaped search field with placeholder ${q("Search the store")} and a small "Search" button inside it on the right.`,
        );
      out.push(
        `  Buttons: primary ${q(e.cta)}${e.secondaryCta ? ` and outlined ${q(e.secondaryCta)}` : ""}.`,
      );
      return out;
    }

    case "searchResults": {
      const s = block.content;
      out.push(`Search results.`);
      out.push(
        `  Large pill search field at the top showing the query ${q(s.query)}.`,
      );
      out.push(`  Suggestion pills: ${s.suggestions.map(q).join(", ")}.`);
      out.push(`  Result count line: ${q(s.resultCount)}.`);
      out.push(`  Then a product grid, 4 across on desktop:`);
      for (const p of s.products)
        out.push(`    - ${q(p.name)} — ${p.price}`);
      return out;
    }

    case "giftCardPicker": {
      const g = block.content;
      out.push(`Gift card, two columns — card artwork left, form right.`);
      out.push(
        `  Eyebrow ${q("Gift")}, heading ${q(g.headline)}, body ${q(g.body)}.`,
      );
      out.push(
        `  Amount selector as pills, number ${g.selected + 1} selected with a ${tokens.accent} border and tint: ${g.amounts.map(q).join(", ")}.`,
      );
      out.push(
        `  Fields: ${g.fields.map((f) => q(f.label) + (f.wide ? " [full width]" : "")).join(", ")}.`,
      );
      out.push(`  Full-width button ${q(g.cta)}.`);
      return out;
    }

    case "bundleBuilder": {
      const b = block.content;
      out.push(
        `Bundle builder. Centred heading ${q(b.title)}, sub-copy ${q(b.sub)}.`,
      );
      out.push(`  ${b.items.length} product cards across, each already "Selected":`);
      for (const p of b.items) out.push(`    - ${q(p.name)} — ${p.price}`);
      out.push(
        `  Then a summary card tinted with ${tokens.accent}: label ${q(b.totalLabel)}, the figure ${q(b.totalValue)} large, a solid pill ${q(b.savingLabel)} beside it, and a button ${q(b.cta)} on the right.`,
      );
      return out;
    }

    case "upsellOffer": {
      const u = block.content;
      out.push(
        `One-time offer band, full ${tokens.accent} background with ${tokens.accentInk} text. Two columns — product image left, copy right. Max width about 900px.`,
      );
      out.push(`  Eyebrow, uppercase: ${q(u.eyebrow)}.`);
      out.push(`  Heading: ${q(u.headline)}.`);
      out.push(`  Body: ${q(u.body)}.`);
      out.push(
        `  Price ${u.product.price} large, with ${q(u.timerLabel)} beside it.`,
      );
      out.push(
        `  Full-width inverted button ${q(u.cta)}, and a small underlined decline link beneath: ${q(u.decline)}.`,
      );
      return out;
    }

    case "thankYouPanel": {
      const t = block.content;
      out.push(`Confirmation, centred, max width about 640px.`);
      out.push(
        `  A round ${tokens.accent}-tinted badge with a check mark at the top.`,
      );
      out.push(`  H1 ${q(t.headline)}, body ${q(t.body)}.`);
      out.push(`  An outlined pill showing ${q(`Order ${t.orderId}`)}.`);
      out.push(`  Then ${t.steps.length} small cards across, left-aligned inside:`);
      t.steps.forEach((s, i) =>
        out.push(
          `    ${String(i + 1).padStart(2, "0")} — ${q(s.label)} — ${q(s.detail)}`,
        ),
      );
      out.push(`  Primary button ${q(t.cta)}.`);
      return out;
    }

    case "passwordGate": {
      const p = block.content;
      out.push(
        `Password gate. Full-height centred layout with a soft radial ${tokens.accent} glow behind it. No header or footer on this page.`,
      );
      out.push(`  Wordmark ${q(p.brand)} at the top, then an image about 240px wide.`);
      out.push(`  Heading ${q(p.headline)}, body ${q(p.body)}.`);
      out.push(
        `  A single password field and a full-width button ${q(p.cta)}, then small print ${q(p.note)}.`,
      );
      return out;
    }

    case "footer": {
      const f = block.content;
      out.push(`Footer on the alternate background ${tokens.surfaceAlt}.`);
      out.push(
        `  First column: wordmark ${q(f.brand)}, blurb ${q(f.blurb)}${f.newsletterLabel ? `, an email field labelled ${q(f.newsletterLabel)} and a "Subscribe" button` : ""}.`,
      );
      for (const col of f.columns)
        out.push(`  Column ${q(col.title)}: ${col.links.map(q).join(", ")}.`);
      out.push(
        `  Below a hairline: ${q(f.note)} on the left, and "Terms", "Privacy", "Cookies" on the right.`,
      );
      return out;
    }

    default: {
      const never: never = block;
      void never;
      return out;
    }
  }
}

/* ==========================================================================
   The prompt.
   ========================================================================== */

export function buildFlyMatePrompt(
  page: PageMockup,
  brief: Brief | null,
): string {
  const t = page.tokens;
  const storeLabel =
    STORE_TYPES.find((s) => s.id === brief?.storeType)?.label ?? "online store";

  const L: string[] = [];

  const copyOf =
    page.copyTotal && page.copyTotal > 1
      ? ` (variation ${page.copyIndex} of ${page.copyTotal})`
      : "";

  L.push(
    `Build a ${page.label}${copyOf} page for a Shopify ${storeLabel}${brief ? ` selling ${brief.whatYouSell}` : ""}.`,
  );
  L.push("");
  L.push(
    `Follow this spec exactly. Use the hex values as written, keep the sections in the given order, and use the copy verbatim — do not rewrite, shorten or translate any text in quotes.`,
  );

  /* ---- design system --------------------------------------------------- */
  L.push("");
  L.push("## Colours — use these exact values");
  L.push(`- Page background: ${t.bg}`);
  L.push(`- Alternate section background: ${t.surfaceAlt}`);
  L.push(`- Card / panel background: ${t.surface}`);
  L.push(`- Headings and body text: ${t.ink}`);
  L.push(`- Muted / secondary text: ${t.inkMuted}`);
  L.push(`- Accent (buttons, links, highlights): ${t.accent}`);
  L.push(`- Text on top of the accent: ${t.accentInk}`);
  L.push(`- Borders: ${t.borderWidth}px solid ${t.border}`);

  L.push("");
  L.push("## Type");
  L.push(
    `- Headings: ${fontWords(t.fontDisplay)} face, weight ${t.displayWeight}, letter-spacing ${t.tracking}${t.displayCase === "upper" ? ", ALL UPPERCASE" : ", sentence case"}.`,
  );
  L.push(`- Body: ${fontWords(t.fontBody)} face, weight ${t.bodyWeight}.`);
  L.push(
    `- Scale: H1 around ${Math.round(56 * t.scale)}px on desktop, section headings around ${Math.round(34 * t.scale)}px, body around ${Math.round(15 * t.scale)}px.`,
  );

  L.push("");
  L.push("## Shape and spacing");
  L.push(
    t.radius === 0
      ? `- Corners: square. No border radius anywhere — not on cards, buttons, inputs or images.`
      : `- Corners: ${t.radius}px on small elements, ${t.radiusLg}px on cards and images${t.radiusPill ? `, fully rounded pills on buttons` : `, ${t.radius}px on buttons`}.`,
  );
  L.push(`- Spacing: ${densityWords(t)}.`);
  L.push(
    t.shadow === "none"
      ? `- No drop shadows. Separate things with hairline borders and background changes instead.`
      : `- Shadows: ${t.shadow.startsWith("6px") ? "hard offset shadows, no blur" : "soft and low-contrast"}.`,
  );
  L.push(`- Content column: about 1180px max, centred, with generous gutters.`);
  L.push(
    `- Imagery: ${imageWords(t)}. Generate the product and lifestyle photography — do not use grey placeholder boxes.`,
  );

  /* ---- sections -------------------------------------------------------- */
  L.push("");
  L.push(`## Sections — ${page.blocks.length}, in this exact order`);

  /* These blocks name their own background in their description — a promo band
     is its own colour regardless of the alternation it sits in. Labelling them
     as well produced two contradictory backgrounds for one section. */
  const SELF_BACKGROUND: readonly BlockKind[] = [
    "nav",
    "promoBanner",
    "countdown",
    "upsellOffer",
    "passwordGate",
    "footer",
  ];

  const bandLabel = (b: MockupBlock["band"]) =>
    b === "alt"
      ? ` [background ${t.surfaceAlt}]`
      : b === "accent"
        ? ` [background ${t.accent}]`
        : ` [background ${t.bg}]`;

  page.blocks.forEach((block, i) => {
    const lines = describeBlock(block, t);
    if (lines.length === 0) return;
    const label = SELF_BACKGROUND.includes(block.kind)
      ? ""
      : bandLabel(block.band);
    L.push("");
    L.push(`${i + 1}. ${lines[0]}${label}`);
    for (const extra of lines.slice(1)) L.push(`   ${extra}`);
  });

  /* ---- responsive + rules --------------------------------------------- */
  L.push("");
  L.push("## Responsive");
  L.push(
    `- Design for 1440px. At 834px drop multi-column grids by one column; at 390px stack everything to a single column, collapse the nav to a hamburger, and reduce type by about 10%.`,
  );

  L.push("");
  L.push("## Do not");
  L.push(`- Do not add sections that are not listed above.`);
  L.push(`- Do not reorder the sections.`);
  L.push(`- Do not rewrite any quoted copy.`);
  L.push(`- Do not introduce colours outside the list above.`);
  L.push(
    `- Do not colour more than the one highlighted word in the H1 — the rest stays in the heading colour.`,
  );

  /* Quoted copy often already ends in a full stop, and the templates above add
     their own. Collapse the doubles in one pass rather than making every call
     site punctuation-aware. */
  return L.join("\n").replace(/([.!?])"\./g, '$1"');
}
