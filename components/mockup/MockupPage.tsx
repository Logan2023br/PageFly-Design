"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { MockupBlock, PageMockup } from "@/lib/generate/types";
import { deviceForWidth } from "@/lib/design/derive";
import { DesignRender } from "@/lib/design/render";
import { designTreeSchema, type DesignTree } from "@/lib/design/schema";
import { MockProvider } from "./primitives";
import { stayPut } from "@/lib/stayPut";
import { pinViewportUnits } from "./viewportUnits";
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

/* ==========================================================================
   A TREE MOCKUP IS DRAWN IN THIS DOCUMENT, NOT A FRAME — so a link inside it
   (a custom block's own HTML can carry one) would navigate the APP. Held on
   the way down, like the frame guard in `lib/stayPut.ts` does for documents.
   ========================================================================== */
const hold = {
  onClickCapture(e: React.MouseEvent) {
    const a = (e.target as Element | null)?.closest?.("a[href],area[href]");
    const href = a?.getAttribute("href") ?? "";
    if (a && !(href.startsWith("#") && href.length > 1)) e.preventDefault();
  },
  onSubmitCapture(e: React.FormEvent) {
    e.preventDefault();
  },
};

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
      <div style={surface} {...hold}>
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
      <div style={surface} {...hold}>
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
 * SANDBOXED, WITHOUT SAME-ORIGIN. The document is model output steered by a
 * merchant's brief, and an admin opens other stores' libraries: a same-origin
 * frame would run its scripts with the admin's cookies. In an opaque origin it
 * cannot touch this page, so the height comes the other way — a small script
 * added to the document posts it up, and only messages from this frame's own
 * window are believed.
 */
const HEIGHT_MESSAGE = "pfd-mockup-height";
const REPORT_HEIGHT =
  `<script>(function(){function s(){var d=document,b=d.body,e=d.documentElement;` +
  `var h=Math.max(b?b.scrollHeight:0,e?e.scrollHeight:0);` +
  `if(h>0)parent.postMessage({type:"${HEIGHT_MESSAGE}",h:h},"*")}` +
  `addEventListener("load",s);setTimeout(s,0);` +
  `if(window.ResizeObserver)new ResizeObserver(s).observe(document.documentElement)})();</script>`;

function withHeightReport(html: string): string {
  return /<\/body>/i.test(html) ? html.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${REPORT_HEIGHT}</body>`) : html + REPORT_HEIGHT;
}

function HtmlMockup({ html, width, bg }: { html: string; width: number; bg: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(900);

  /* ====================================================================
     `100vh` MEANS ONE SCREEN, AND THIS FRAME IS NOT ONE.

     The height below is the whole document, so the frame holding it is also
     the viewport FOR it — and a hero asking for `min-height:100vh` gets the
     entire page rather than a screen. One came out 9,801 pixels tall with
     its content aligned to the bottom, which put every word 8,900 pixels
     under the window: the Library showed a dark, empty rectangle for a file
     that opened perfectly in a browser.

     It is a loop as well. A taller frame makes a taller hero makes a taller
     document makes a taller frame.

     So the units are pinned to the device this width belongs to before the
     document is handed over. `vw` is left alone — the frame IS the device
     width, so it already resolves. See `viewportUnits.ts`.
     ==================================================================== */
  /* Links held in place too: a button in a mockup must not walk the frame off
     to a 404. See `lib/stayPut.ts`. */
  const doc = useMemo(() => withHeightReport(stayPut(pinViewportUnits(html, width))), [html, width]);

  /* The document's own reports, re-sent after load and on every resize of it:
     webfonts land late and reflow the page, and a height taken before they
     arrive cuts the last section off. */
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== ref.current?.contentWindow) return;
      const d = e.data as { type?: unknown; h?: unknown } | null;
      if (d?.type === HEIGHT_MESSAGE && typeof d.h === "number" && d.h > 0 && d.h < 200_000) setHeight(Math.ceil(d.h));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <iframe
      ref={ref}
      title="Page mockup"
      srcDoc={doc}
      sandbox="allow-scripts"
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
