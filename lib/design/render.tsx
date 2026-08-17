"use client";

import { createContext, useContext, useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { MOTION_CSS, motionClasses } from "./motion";
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

function Heading({ node, cls }: { node: Extract<DesignNode, { type: "heading" }>; cls?: string }) {
  const { device } = useDesign();
  const Tag = `h${node.level}` as "h1";
  /* Browsers give headings a margin the tree never asked for, and PageFly's
     Heading2 has none. Zeroing it here is not a style decision, it is removing
     one the tree did not make. */
  return (
    <Tag style={{ margin: 0, ...sx(node, device) }} data-pf="heading" className={cls}>
      {node.text}
    </Tag>
  );
}

function Text({ node, cls }: { node: Extract<DesignNode, { type: "text" }>; cls?: string }) {
  const { device } = useDesign();
  return (
    <p style={{ margin: 0, ...sx(node, device) }} data-pf="text" className={cls}>
      {node.text}
    </p>
  );
}

function Button({ node, cls }: { node: Extract<DesignNode, { type: "button" }>; cls?: string }) {
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
      data-pf="button" className={cls}
    >
      {node.text}
    </span>
  );
}

function Photo({ node, cls }: { node: Extract<DesignNode, { type: "image" }>; cls?: string }) {
  const { device, images } = useDesign();
  const src = images[node.query];
  const style = sx(node, device);

  return (
    <div
      data-pf="image" className={cls}
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

function Divider({ node, cls }: { node: Extract<DesignNode, { type: "divider" }>; cls?: string }) {
  const { device } = useDesign();
  return (
    <div
      data-pf="divider" className={cls}
      style={{ width: "100%", height: 1, background: "currentColor", opacity: 0.14, ...sx(node, device) }}
    />
  );
}

function Icon({ node, cls }: { node: Extract<DesignNode, { type: "icon" }>; cls?: string }) {
  const { device } = useDesign();
  const style = sx(node, device);
  const Glyph = ICONS[node.name.toLowerCase().replace(/[^a-z]/g, "")];
  const size = Number(style.fontSize ?? 24) || 24;

  if (!Glyph)
    return <span data-pf="icon" className={cls} style={{ display: "inline-block", ...style }} />;

  /* `data-icon` is how the exporter gets the real SVG markup: lucide builds
     these components from data it does not re-expose, so the rendered element
     is the only place the paths exist. Reading them off the staged DOM by name
     is cheaper and more honest than shipping a second copy of the icon set. */
  return (
    <span
      data-pf="icon" className={cls}
      data-icon={node.name.toLowerCase().replace(/[^a-z]/g, "")}
      style={{ display: "inline-flex", ...style }}
    >
      <Glyph size={size} strokeWidth={1.6} />
    </span>
  );
}

/* ---- composites --------------------------------------------------------- */

function Product({ node, cls }: { node: Extract<DesignNode, { type: "product" }>; cls?: string }) {
  const { device, images } = useDesign();
  const stacked = node.layout === "stacked" || device === "mobile";
  const src = images[node.query];

  return (
    <div
      data-pf="product" className={cls}
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
function ProductGrid({ node, cls }: { node: Extract<DesignNode, { type: "productList" }>; cls?: string }) {
  const { device, images } = useDesign();
  const src = images[node.query];
  const columns = device === "mobile" ? 1 : device === "tablet" ? Math.min(2, node.columns) : node.columns;
  const shown = Math.min(node.limit, columns * 2);

  return (
    <div
      data-pf="product-list" className={cls}
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

function Accordion({ node, cls }: { node: Extract<DesignNode, { type: "accordion" }>; cls?: string }) {
  const { device } = useDesign();
  return (
    <div data-pf="accordion" className={cls} style={{ width: "100%", ...sx(node, device) }}>
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

/**
 * The motion classes go into each component and land on its own root element.
 *
 * Not onto a wrapper: a wrapper div around a flex child changes which element
 * the parent's `gap`, `flex` and `align-items` apply to, so the page would lay
 * out differently the moment a node was given motion. Not by cloning either —
 * these are components rather than DOM elements, so a cloned `className` would
 * be a prop nobody reads, and the mockup would sit still while the exported
 * page moved. That is the one failure this whole feature exists to prevent.
 */
function Node({ node }: { node: DesignNode }) {
  const { device } = useDesign();
  const cls = motionClasses(node.anim).join(" ") || undefined;

  switch (node.type) {
    case "heading":
      return <Heading node={node} cls={cls} />;
    case "text":
      return <Text node={node} cls={cls} />;
    case "button":
      return <Button node={node} cls={cls} />;
    case "image":
      return <Photo node={node} cls={cls} />;
    case "divider":
      return <Divider node={node} cls={cls} />;
    case "icon":
      return <Icon node={node} cls={cls} />;
    case "product":
      return <Product node={node} cls={cls} />;
    case "productList":
      return <ProductGrid node={node} cls={cls} />;
    case "accordion":
      return <Accordion node={node} cls={cls} />;
    case "row":
    case "col":
      return (
        <div
          data-pf={node.type}
          className={cls}
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
  const classes = motionClasses(section.anim);
  return (
    <section
      data-pf="section"
      data-role={section.role}
      className={classes.join(" ") || undefined}
      style={{ width: "100%", ...sx(section, device) }}
    >
      {section.children.map((child, i) => (
        <Node key={i} node={child} />
      ))}
    </section>
  );
}

/**
 * Runs the same reveal the exported page runs.
 *
 * Scoped to this preview's own subtree rather than the document, because four
 * device frames are on screen at once and each one is a separate copy of the
 * page — a document-wide observer would reveal the mobile frame's sections when
 * the desktop frame's scrolled past.
 *
 * The timer is a safety net, not part of the effect. Once `.pfa-ready` is set,
 * reveal styles rest at `opacity: 0`, so anything the observer fails to reach —
 * a frame clipped by the stage, a device the merchant has not scrolled to —
 * would be an invisible page rather than a still one. After a second and a
 * half, everything shows.
 */
function useReveal(root: React.RefObject<HTMLDivElement | null>, tree: DesignTree) {
  useEffect(() => {
    const host = root.current;
    if (!host) return;

    const targets = () => Array.from(host.querySelectorAll<HTMLElement>(".pfa-r:not(.pfa-in)"));
    const showAll = () => targets().forEach((el) => el.classList.add("pfa-in"));

    /* Nothing is hidden until `.pfa-ready` says so — the same gate the exported
       page uses, for the same reason. Set here rather than in the markup so a
       preview whose effects never run shows a complete page instead of an
       empty one. */
    if (typeof IntersectionObserver === "undefined") return;
    document.documentElement.classList.add("pfa-ready");

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("pfa-in");
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.08 },
    );

    targets().forEach((el) => io.observe(el));
    const net = window.setTimeout(showAll, 1500);

    return () => {
      io.disconnect();
      window.clearTimeout(net);
    };
    /* Re-runs when the tree changes: regenerating one page replaces its nodes,
       and the new ones were never observed. */
  }, [root, tree]);
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
  const root = useRef<HTMLDivElement>(null);
  useReveal(root, tree);

  return (
    <DesignCtx.Provider value={{ device, images }}>
      <div ref={root} style={{ display: "contents" }}>
        {/* The exported page's stylesheet, verbatim. Injected per preview rather
            than once globally so a preview that is unmounted takes its styles
            with it; duplicate identical rules cost nothing. */}
        <style>{MOTION_CSS}</style>
        {tree.sections.map((s, i) => (
          <Section key={i} section={s} />
        ))}
      </div>
    </DesignCtx.Provider>
  );
}
