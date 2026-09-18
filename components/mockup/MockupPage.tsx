"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { MockupBlock, PageMockup } from "@/lib/generate/types";
import { deviceForWidth } from "@/lib/design/derive";
import { DesignRender } from "@/lib/design/render";
import { designTreeSchema, type DesignTree } from "@/lib/design/schema";
import { MockProvider } from "./primitives";
import { Footer, NavBar } from "./blocks/chrome";
import { Hero, PasswordGate } from "./blocks/hero";
import {
  BundleBuilder,
  CartSummary,
  CollectionHeader,
  GiftCardPicker,
  ProductDetail,
  ProductGrid,
  SearchResults,
  UpsellOffer,
} from "./blocks/commerce";
import {
  BlogArticle,
  BlogList,
  DataTable,
  FeatureRow,
  ImageSplit,
  ListPanel,
  MediaWall,
  RichText,
} from "./blocks/content";
import { LogoStrip, StatsRow, Testimonials } from "./blocks/social";
import {
  Countdown,
  FaqAccordion,
  LeadForm,
  PricingTiers,
  PromoBanner,
  QuizStep,
  ThankYouPanel,
} from "./blocks/conversion";
import {
  AccountPanel,
  ContactPanel,
  EmptyState,
  OrderTracker,
} from "./blocks/account";

/* ==========================================================================
   Maps a block to its component. Exhaustive over BlockKind — adding a kind to
   lib/generate/types.ts without handling it here is a type error.
   ========================================================================== */

function Block({ block }: { block: MockupBlock }) {
  switch (block.kind) {
    case "nav":
      return <NavBar content={block.content} />;
    case "hero":
      return <Hero content={block.content} />;
    case "logoStrip":
      return <LogoStrip content={block.content} band={block.band} />;
    case "collectionHeader":
      return <CollectionHeader content={block.content} />;
    case "productGrid":
      return <ProductGrid content={block.content} band={block.band} />;
    case "productDetail":
      return <ProductDetail content={block.content} />;
    case "featureRow":
      return <FeatureRow content={block.content} band={block.band} />;
    case "imageSplit":
      return <ImageSplit content={block.content} band={block.band} />;
    case "testimonials":
      return <Testimonials content={block.content} band={block.band} />;
    case "statsRow":
      return <StatsRow content={block.content} band={block.band} />;
    case "promoBanner":
      return <PromoBanner content={block.content} />;
    case "countdown":
      return <Countdown content={block.content} />;
    case "faqAccordion":
      return <FaqAccordion content={block.content} band={block.band} />;
    case "blogList":
      return <BlogList content={block.content} band={block.band} />;
    case "blogArticle":
      return <BlogArticle content={block.content} />;
    case "cartSummary":
      return <CartSummary content={block.content} />;
    case "leadForm":
      return <LeadForm content={block.content} band={block.band} />;
    case "dataTable":
      return <DataTable content={block.content} band={block.band} />;
    case "pricingTiers":
      return <PricingTiers content={block.content} band={block.band} />;
    case "quizStep":
      return <QuizStep content={block.content} />;
    case "accountPanel":
      return <AccountPanel content={block.content} />;
    case "orderTracker":
      return <OrderTracker content={block.content} band={block.band} />;
    case "contactPanel":
      return <ContactPanel content={block.content} band={block.band} />;
    case "mediaWall":
      return <MediaWall content={block.content} band={block.band} />;
    case "richText":
      return <RichText content={block.content} band={block.band} />;
    case "listPanel":
      return <ListPanel content={block.content} band={block.band} />;
    case "emptyState":
      return <EmptyState content={block.content} />;
    case "searchResults":
      return <SearchResults content={block.content} />;
    case "giftCardPicker":
      return <GiftCardPicker content={block.content} />;
    case "bundleBuilder":
      return <BundleBuilder content={block.content} band={block.band} />;
    case "upsellOffer":
      return <UpsellOffer content={block.content} />;
    case "thankYouPanel":
      return <ThankYouPanel content={block.content} />;
    case "passwordGate":
      return <PasswordGate content={block.content} />;
    case "footer":
      return <Footer content={block.content} />;
    default: {
      // Exhaustiveness guard.
      const never: never = block;
      void never;
      return null;
    }
  }
}

/**
 * A whole mockup, laid out for one device width.
 *
 * `width` is the real CSS width the page renders at — the preview scales the
 * frame around this, so switching device genuinely re-lays out every block
 * instead of stretching a picture.
 */
export const MockupPage = memo(function MockupPage({
  page,
  width,
}: {
  page: PageMockup;
  width: number;
}) {
  const surface = {
    width,
    background: page.tokens.bg,
    color: page.tokens.ink,
    fontFamily: page.tokens.fontBody,
  };

  /* A page built in HTML mockup mode is a document, not a tree. It goes in an
     iframe and the two reasons are the whole design of this branch.

     `@media`. The model writes its own breakpoints, and a media query asks the
     VIEWPORT how wide it is — not the box it happens to sit in. Inlined, a
     390px phone preview would answer with the laptop's width and every mobile
     rule would be wrong in a way that looks like the model's fault. An iframe
     IS a viewport, so `width` reaches the query.

     And its CSS is its own. The document arrives with whatever resets and
     `body` rules the model chose; injected into this page they would reach the
     app around it. The frame is the boundary that already exists — the free
     collections use it for the same reason (`lib/collections/pagefly.ts`). */
  if (typeof page.design?.html === "string" && page.design.html.trim() !== "")
    return <HtmlMockup html={page.design.html} width={width} bg={page.tokens.bg} />;

  /* A page the model designed is rendered from its tree instead of its blocks.
     Same surface, same width, so every frame, capture and export path around
     this component is unaffected by which one it got. */
  const tree = designTreeOf(page);
  if (tree)
    return (
      <div style={surface}>
        <DesignRender
          tree={tree}
          device={deviceForWidth(width)}
          images={page.design?.images ?? {}}
          videos={page.design?.videos ?? {}}
          /* For the buy box, which `render.tsx` draws itself rather than reads
             off the tree — and which the export now emits in the accent, so the
             two have to agree. */
          palette={{
            accent: page.tokens.accent,
            border: page.tokens.border,
            radius: page.tokens.radius,
          }}
        />
      </div>
    );

  return (
    <MockProvider tokens={page.tokens} vertical={page.vertical} width={width}>
      <div style={surface}>
        {page.blocks.map((block) => (
          <Block key={block.id} block={block} />
        ))}
      </div>
    </MockProvider>
  );
});

/**
 * One HTML document, drawn at a real device width.
 *
 * HEIGHT IS MEASURED, NOT ASSUMED. Left at a fixed height the iframe would
 * scroll inside itself, and everything outside this component scrolls the page
 * instead — the results card's hover-scroll, Scrub, and the preview frame all
 * move a tall element past a short window. So the frame grows to its content
 * and stays a passive picture, exactly as the tree render does.
 *
 * `srcDoc` keeps it same-origin, which is what makes that measurement legal at
 * all; a cross-origin frame would not hand over `scrollHeight`.
 */
function HtmlMockup({ html, width, bg }: { html: string; width: number; bg: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(900);

  const measure = useCallback(() => {
    const doc = ref.current?.contentDocument;
    if (!doc?.body) return;
    /* `scrollHeight` on both, because a document whose body is floated or
       absolutely positioned reports 0 on one of them and the real figure on the
       other. */
    const h = Math.max(doc.body.scrollHeight, doc.documentElement?.scrollHeight ?? 0);
    if (h > 0) setHeight(h);
  }, []);

  /* Re-measured after load AND on the document's own size changes: webfonts
     land late and reflow the page, and a height taken before they arrive cuts
     the last section off. */
  useEffect(() => {
    const doc = ref.current?.contentDocument;
    if (!doc?.body || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(doc.body);
    return () => ro.disconnect();
  }, [measure, html, width]);

  return (
    <iframe
      ref={ref}
      title="Page mockup"
      srcDoc={html}
      onLoad={measure}
      scrolling="no"
      style={{ width, height, border: 0, display: "block", background: bg }}
    />
  );
}

/**
 * The tree on a page, once, validated.
 *
 * `PageMockup.design.tree` is typed `unknown` so that module stays free of zod
 * — and a deck restored from the Library is JSON that has been round-tripped
 * through a database, so it has genuinely not been checked. Anything that fails
 * renders as the block page it still carries.
 */
function designTreeOf(page: PageMockup): DesignTree | null {
  if (!page.design?.tree) return null;
  const parsed = designTreeSchema.safeParse(page.design.tree);
  return parsed.success ? parsed.data : null;
}
