"use client";

import { memo } from "react";
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
