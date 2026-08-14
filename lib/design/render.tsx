"use client";

import { createContext, useContext } from "react";
import type { CSSProperties } from "react";
import {
  Award,
  Check,
  Clock,
  CreditCard,
  Gift,
  Heart,
  Leaf,
  Lock,
  Mail,
  MapPin,
  Package,
  Phone,
  RefreshCw,
  Ruler,
  Scissors,
  Send,
  Shield,
  ShoppingBag,
  Sparkles,
  Star,
  Truck,
  Users,
  Wrench,
  Zap,
} from "lucide-react";
import { styleAt, type Device } from "./derive";
import type { DesignNode, DesignSection, DesignTree } from "./schema";

/* ==========================================================================
   The design tree, rendered.

   Deliberately dumb. Every visual decision was made by whoever wrote the tree;
   this file's whole job is to put those declarations on real elements without
   adding any of its own. That is what lets `toPagefly.ts` promise the export
   matches the picture — if this file styled anything on its own initiative,
   the exporter would have to know about it too.

   So: inline styles only, no classNames, no defaults that are not visible in
   the tree. The two exceptions are marked where they occur, and both are
   things PageFly does on its own side as well.
   ========================================================================== */

const ICONS: Record<string, typeof Truck> = {
  award: Award,
  check: Check,
  clock: Clock,
  creditcard: CreditCard,
  gift: Gift,
  heart: Heart,
  leaf: Leaf,
  lock: Lock,
  mail: Mail,
  mappin: MapPin,
  package: Package,
  phone: Phone,
  refresh: RefreshCw,
  refreshcw: RefreshCw,
  ruler: Ruler,
  scissors: Scissors,
  send: Send,
  shield: Shield,
  shoppingbag: ShoppingBag,
  sparkles: Sparkles,
  star: Star,
  truck: Truck,
  users: Users,
  wrench: Wrench,
  zap: Zap,
};

type Ctx = {
  device: Device;
  /** stock photo URL per image query, filled in before render */
  images: Record<string, string>;
};

const DesignCtx = createContext<Ctx>({ device: "all", images: {} });

function useDesign() {
  return useContext(DesignCtx);
}

function sx(node: { css?: Record<string, unknown>; mobile?: Record<string, unknown> }, device: Device): CSSProperties {
  return styleAt(node as never, device) as CSSProperties;
}

/* ---- leaves ------------------------------------------------------------- */

function Heading({ node }: { node: Extract<DesignNode, { type: "heading" }> }) {
  const { device } = useDesign();
  const Tag = `h${node.level}` as "h1";
  /* Browsers give headings a margin the tree never asked for, and PageFly's
     Heading2 has none. Zeroing it here is not a style decision, it is removing
     one the tree did not make. */
  return (
    <Tag style={{ margin: 0, ...sx(node, device) }} data-pf="heading">
      {node.text}
    </Tag>
  );
}

function Text({ node }: { node: Extract<DesignNode, { type: "text" }> }) {
  const { device } = useDesign();
  return (
    <p style={{ margin: 0, ...sx(node, device) }} data-pf="text">
      {node.text}
    </p>
  );
}

function Button({ node }: { node: Extract<DesignNode, { type: "button" }> }) {
  const { device } = useDesign();
  /* A real <button> would inherit the UA's font and background. PageFly's
     Button2 is a styled anchor, so this matches that, not the browser. */
  return (
    <span
      style={{
        display: "inline-block",
        textDecoration: "none",
        cursor: "pointer",
        ...sx(node, device),
      }}
      data-pf="button"
    >
      {node.text}
    </span>
  );
}

function Photo({ node }: { node: Extract<DesignNode, { type: "image" }> }) {
  const { device, images } = useDesign();
  const src = images[node.query];
  const style = sx(node, device);

  return (
    <div
      data-pf="image"
      style={{
        width: "100%",
        aspectRatio: `1 / ${node.ratio}`,
        overflow: "hidden",
        /* Visible while the photo loads and if it never does. A grey box reads
           as "a photo belongs here", which is true, and it is what the merchant
           will replace anyway. */
        background: "#E8E8EC",
        ...style,
      }}
    >
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      )}
    </div>
  );
}

function Divider({ node }: { node: Extract<DesignNode, { type: "divider" }> }) {
  const { device } = useDesign();
  return (
    <div
      data-pf="divider"
      style={{ width: "100%", height: 1, background: "currentColor", opacity: 0.14, ...sx(node, device) }}
    />
  );
}

function Icon({ node }: { node: Extract<DesignNode, { type: "icon" }> }) {
  const { device } = useDesign();
  const style = sx(node, device);
  const Glyph = ICONS[node.name.toLowerCase().replace(/[^a-z]/g, "")];
  const size = Number(style.fontSize ?? 24) || 24;

  if (!Glyph)
    return <span data-pf="icon" style={{ display: "inline-block", ...style }} />;

  /* `data-icon` is how the exporter gets the real SVG markup: lucide builds
     these components from data it does not re-expose, so the rendered element
     is the only place the paths exist. Reading them off the staged DOM by name
     is cheaper and more honest than shipping a second copy of the icon set. */
  return (
    <span
      data-pf="icon"
      data-icon={node.name.toLowerCase().replace(/[^a-z]/g, "")}
      style={{ display: "inline-flex", ...style }}
    >
      <Glyph size={size} strokeWidth={1.6} />
    </span>
  );
}

/* ---- composites --------------------------------------------------------- */

function Product({ node }: { node: Extract<DesignNode, { type: "product" }> }) {
  const { device, images } = useDesign();
  const stacked = node.layout === "stacked" || device === "mobile";
  const src = images[node.query];

  return (
    <div
      data-pf="product"
      style={{
        display: "flex",
        flexDirection: stacked ? "column" : "row",
        gap: 40,
        width: "100%",
        ...sx(node, device),
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          data-pf="product-media"
          style={{ width: "100%", aspectRatio: "1 / 1", background: "#E8E8EC", overflow: "hidden" }}
        >
          {src && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          )}
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
        <div data-pf="product-title" style={{ fontSize: 28, fontWeight: 600, lineHeight: 1.2 }}>
          {node.title}
        </div>
        <div data-pf="product-price" style={{ display: "flex", gap: 10, alignItems: "baseline", fontSize: 20 }}>
          <span>{node.price}</span>
          {node.compareAt && (
            <span style={{ opacity: 0.5, textDecoration: "line-through", fontSize: 16 }}>
              {node.compareAt}
            </span>
          )}
        </div>
        {node.swatches > 0 && (
          <div data-pf="product-swatches" style={{ display: "flex", gap: 8 }}>
            {Array.from({ length: node.swatches }, (_, i) => (
              <span
                key={i}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 999,
                  border: "1px solid rgba(0,0,0,.18)",
                  background: `hsl(${(i * 47) % 360} 34% 72%)`,
                }}
              />
            ))}
          </div>
        )}
        <span
          data-pf="product-atc"
          style={{
            display: "inline-block",
            textAlign: "center",
            padding: "14px 22px",
            background: "#111114",
            color: "#fff",
            fontWeight: 600,
          }}
        >
          {node.atcText}
        </span>
      </div>
    </div>
  );
}

/* The mockup of a live grid: the same card repeated, so the merchant sees the
   shape they will get. The photo is one stock image standing in for every
   product, because the real ones only exist once this is in their store. */
function ProductGrid({ node }: { node: Extract<DesignNode, { type: "productList" }> }) {
  const { device, images } = useDesign();
  const src = images[node.query];
  const columns = device === "mobile" ? 1 : device === "tablet" ? Math.min(2, node.columns) : node.columns;
  const shown = Math.min(node.limit, columns * 2);

  return (
    <div
      data-pf="product-list"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gap: 24,
        width: "100%",
        ...sx(node, device),
      }}
    >
      {Array.from({ length: shown }, (_, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ width: "100%", aspectRatio: "1 / 1", background: "#E8E8EC", overflow: "hidden" }}>
            {src && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            )}
          </div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Product name</div>
          <div style={{ fontSize: 15, opacity: 0.75 }}>$00.00</div>
        </div>
      ))}
    </div>
  );
}

function Accordion({ node }: { node: Extract<DesignNode, { type: "accordion" }> }) {
  const { device } = useDesign();
  return (
    <div data-pf="accordion" style={{ width: "100%", ...sx(node, device) }}>
      {node.items.map((item, i) => (
        <div key={i} data-pf="accordion-item" style={{ borderBottom: "1px solid rgba(0,0,0,.12)" }}>
          <div
            data-pf="accordion-header"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 16,
              padding: "18px 0",
              fontWeight: 600,
            }}
          >
            <span>{item.q}</span>
            <span style={{ opacity: 0.4 }}>+</span>
          </div>
          {/* Open, because a mockup of a closed accordion is a list of one-line
              rows and tells the merchant nothing about the answer copy. */}
          <div data-pf="accordion-body" style={{ paddingBottom: 18, opacity: 0.72, lineHeight: 1.6 }}>
            {item.a}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---- containers --------------------------------------------------------- */

function Node({ node }: { node: DesignNode }) {
  const { device } = useDesign();

  switch (node.type) {
    case "heading":
      return <Heading node={node} />;
    case "text":
      return <Text node={node} />;
    case "button":
      return <Button node={node} />;
    case "image":
      return <Photo node={node} />;
    case "divider":
      return <Divider node={node} />;
    case "icon":
      return <Icon node={node} />;
    case "product":
      return <Product node={node} />;
    case "productList":
      return <ProductGrid node={node} />;
    case "accordion":
      return <Accordion node={node} />;
    case "row":
    case "col":
      return (
        <div
          data-pf={node.type}
          style={{
            display: "flex",
            flexDirection: node.type === "row" ? "row" : "column",
            ...sx(node, device),
          }}
        >
          {node.children.map((child, i) => (
            <Node key={i} node={child} />
          ))}
        </div>
      );
  }
}

function Section({ section }: { section: DesignSection }) {
  const { device } = useDesign();
  return (
    <section data-pf="section" data-role={section.role} style={{ width: "100%", ...sx(section, device) }}>
      {section.children.map((child, i) => (
        <Node key={i} node={child} />
      ))}
    </section>
  );
}

export function DesignRender({
  tree,
  device,
  images = {},
}: {
  tree: DesignTree;
  device: Device;
  images?: Record<string, string>;
}) {
  return (
    <DesignCtx.Provider value={{ device, images }}>
      {tree.sections.map((s, i) => (
        <Section key={i} section={s} />
      ))}
    </DesignCtx.Provider>
  );
}
