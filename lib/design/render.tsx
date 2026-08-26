"use client";

import { createContext, Fragment, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { cleanBlock, previewJs } from "./customBlock";
import { MOTION_CSS, motionClasses } from "./motion";
import { readableInk } from "../styleTokens";
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
  /** background-video URL per query. At most one per page. */
  videos: Record<string, string>;
  /**
   * The page's palette, for the composites this file draws itself.
   *
   * Everything the design builds by hand arrives with its own `css`, so for
   * most of this file the palette is already in the tree. The buy box is not:
   * its cart button, stepper and stock line are drawn here, and they were drawn
   * in fixed colours — a near-black button and `rgba(0,0,0,.16)` borders, which
   * on a dark page are a button you cannot see and borders that are not there.
   *
   * The mockup must match the export. `toPagefly.ts` now emits these controls
   * in the accent, so drawing them differently here would make the preview a
   * picture of a page the merchant is not going to get.
   */
  palette: { accent: string; border: string; radius: number } | null;
};

const DesignCtx = createContext<Ctx>({
  device: "all",
  images: {},
  videos: {},
  palette: null,
});

function useDesign() {
  return useContext(DesignCtx);
}

/**
 * The bound parts of the buy box currently being drawn, by name.
 *
 * A context rather than a prop because a `bound` marker may sit at any depth of
 * the column a design arranged — a price inside a row beside the words "per
 * bottle" is two levels down, and threading a prop through every container in
 * this file to reach it would be threading it through containers that will
 * never carry one. Null everywhere outside a buy box, which is what makes a
 * stray marker on a landing page draw nothing.
 */
const BoundCtx = createContext<Record<string, ReactNode> | null>(null);

function Bound({ slot }: { slot: string }) {
  const slots = useContext(BoundCtx);
  return <>{slots?.[slot] ?? null}</>;
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
        /* The same cap the export applies. A ratio is a shape, not a size: the
           2 that gives a neat portrait in a three-column grid gives nearly
           three screens of one picture across a full-bleed band. The image
           inside already covers, so the cap crops rather than squashes. */
        maxHeight: "100vh",
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
  const { device, images, palette } = useDesign();
  const stacked = node.layout === "stacked" || device === "mobile";
  const src = images[node.query];

  /* The buy box is the one composite this file draws rather than reads, so it
     is the one place the palette has to be applied by hand. The fallbacks are
     what every page got before the palette arrived here — correct on white,
     which is the only surface they were ever written for. */
  const atcBg = palette?.accent ?? "#111114";
  const rule = palette?.border ?? "rgba(0,0,0,.16)";
  const radius = palette?.radius ?? 0;

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
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        <div
          data-pf="product-media"
          style={{
            position: "relative",
            width: "100%",
            aspectRatio: "1 / 1",
            background: "#E8E8EC",
            overflow: "hidden",
          }}
        >
          {src && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          )}
          {/* The corner badge. On the export it is ProductBadge shown by the
              media element's own flag and placed by `badgePosition`; here it is
              the same four corners, so the two agree on where it sits. */}
          {node.badge?.trim() && (
            <span
              data-pf="product-badge"
              style={{
                position: "absolute",
                top: node.badgeCorner?.startsWith("TOP") ? 10 : undefined,
                bottom: node.badgeCorner?.startsWith("BOTTOM") ? 10 : undefined,
                left: node.badgeCorner?.endsWith("LEFT") ? 10 : undefined,
                right: node.badgeCorner?.endsWith("RIGHT") ? 10 : undefined,
                padding: "5px 10px",
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: ".08em",
                textTransform: "uppercase",
                background: "#111114",
                color: "#fff",
              }}
            >
              {node.badge.trim()}
            </span>
          )}
        </div>

        {/* The thumbnail strip, when the gallery flag is on. On the export it is
            ProductMedia3's own `showList`; drawn here so the mockup shows the
            same page. Off on a phone in both readers. */}
        {node.gallery && device !== "mobile" && (
          <div
            data-pf="product-thumbs"
            style={{
              display: "flex",
              gap: 8,
              flexDirection:
                node.galleryEdge === "left" || node.galleryEdge === "right"
                  ? "column"
                  : "row",
            }}
          >
            {Array.from({ length: 4 }, (_, i) => (
              <span
                key={i}
                style={{
                  width: 64,
                  aspectRatio: "1 / 1",
                  background: "#E8E8EC",
                  border: i === 0 ? "1px solid currentColor" : "1px solid rgba(0,0,0,.12)",
                  overflow: "hidden",
                }}
              />
            ))}
          </div>
        )}
      </div>

      <BuyColumn node={node} rule={rule} atcBg={atcBg} radius={radius} />
    </div>
  );
}

/**
 * The buy column — the seven bound parts, and whatever the design put between
 * them.
 *
 * Split out of `Product` because it is now two shapes rather than one: an
 * arrangement the design wrote, or this file's own order when it wrote none.
 * Kept byte-for-byte identical to the export's two shapes, or the mockup is a
 * picture of a page the merchant will not receive — which is the failure this
 * whole file exists to prevent.
 */
function BuyColumn({
  node,
  rule,
  atcBg,
  radius,
}: {
  node: Extract<DesignNode, { type: "product" }>;
  rule: string;
  atcBg: string;
  radius: number;
}) {
  const slots: Record<string, ReactNode> = {
    title: (
        <div data-pf="product-title" style={{ fontSize: 28, fontWeight: 600, lineHeight: 1.2 }}>
          {node.title}
        </div>
    ),
    price: (
        <div data-pf="product-price" style={{ display: "flex", gap: 10, alignItems: "baseline", fontSize: 20 }}>
          <span>{node.price}</span>
          {node.compareAt && (
            <span style={{ opacity: 0.5, textDecoration: "line-through", fontSize: 16 }}>
              {node.compareAt}
            </span>
          )}
        </div>
    ),
    swatches: node.swatches > 0 && (
          <div data-pf="product-swatches" style={{ display: "flex", gap: 8 }}>
            {Array.from({ length: node.swatches }, (_, i) => (
              <span
                key={i}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 999,
                  border: `1px solid ${rule}`,
                  background: `hsl(${(i * 47) % 360} 34% 72%)`,
                }}
              />
            ))}
          </div>
    ),
    qty: node.qty && (
          <div data-pf="product-qty" style={{ display: "flex", width: "fit-content" }}>
            {["−", "1", "+"].map((glyph, i) => (
              <span
                key={i}
                style={{
                  display: "grid",
                  placeItems: "center",
                  width: i === 1 ? 56 : 40,
                  height: 40,
                  border: `1px solid ${rule}`,
                  marginLeft: i === 0 ? 0 : -1,
                }}
              >
                {glyph}
              </span>
            ))}
          </div>
    ),
    stock: node.stock && (
          <span
            data-pf="product-stock"
            style={{
              fontSize: 12.5,
              letterSpacing: ".06em",
              textTransform: "uppercase",
              color: "#22c55e",
            }}
          >
            In stock
          </span>
    ),
    atc: (
        <span
          data-pf="product-atc"
          style={{
            display: "inline-block",
            textAlign: "center",
            padding: "15px 22px",
            background: atcBg,
            color: readableInk(atcBg),
            borderRadius: radius || undefined,
            fontWeight: 600,
          }}
        >
          {node.atcText}
        </span>
    ),
    express: node.express && (
          <span
            data-pf="product-express"
            style={{
              display: "inline-block",
              textAlign: "center",
              padding: "13px 22px",
              border: `1px solid ${rule}`,
              borderRadius: radius || undefined,
              fontWeight: 600,
            }}
          >
            Buy it now
          </span>
    ),
  };

  const FIXED = ["title", "price", "swatches", "qty", "stock", "atc", "express"];
  const REQUIRED = ["title", "price", "atc"];

  const column = { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 14 } as const;

  if (!node.children?.length)
    return (
      <div style={column}>
        {FIXED.map((name) => (
          <Fragment key={name}>{slots[name]}</Fragment>
        ))}
        {/* The design's own rows, under the buy controls. Same position as the
            export puts them, and only on this path — a design that arranged the
            column put its rows where it wanted them. */}
        {(node.extras ?? []).map((child, i) => (
          <Node key={i} node={child} />
        ))}
      </div>
    );

  /* Which bound parts the arrangement asked for, at any depth. What it did not
     ask for and cannot do without is appended: a buy box with no cart button is
     not a buy box, and dropping the page over it would cost far more than a
     button in the wrong place. */
  const asked = new Set<string>();
  const seek = (list: DesignNode[]): void => {
    for (const n of list) {
      if (n.type === "bound") asked.add(n.slot);
      const kids = (n as { children?: DesignNode[] }).children;
      if (Array.isArray(kids)) seek(kids);
    }
  };
  seek(node.children);

  return (
    <BoundCtx.Provider value={slots}>
      <div style={column}>
        {node.children.map((child, i) => (
          <Node key={i} node={child} />
        ))}
        {REQUIRED.filter((r) => !asked.has(r)).map((name) => (
          <Fragment key={name}>{slots[name]}</Fragment>
        ))}
        {/* Both shapes filled is two shapes written, not one meant to be
            discarded — see the note in `toPagefly.productBox`. */}
        {(node.extras ?? []).map((child, i) => (
          <Node key={`x${i}`} node={child} />
        ))}
      </div>
    </BoundCtx.Provider>
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

/**
 * The same accordion the merchant will get, not a picture of one.
 *
 * It used to render every answer open and inert — readable, but a lie in both
 * directions: the exported Accordion3 carries `activeInFront: -1`, so on the
 * real page nothing is open until it is clicked, and `multiple: false`, so
 * opening one closes the last. A merchant approving a mockup where all four
 * answers sit visible was approving a page that does not exist.
 *
 * Both of those defaults are read from the exporter rather than chosen here.
 * If they change there, this has to change with them.
 */
function Accordion({ node, cls }: { node: Extract<DesignNode, { type: "accordion" }>; cls?: string }) {
  const { device, palette } = useDesign();
  /* `null` rather than a number: -1 would work, but the exporter's -1 means
     "none" and reusing it here invites the two to be compared as if they were
     the same kind of value. */
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div data-pf="accordion" className={cls} style={{ width: "100%", ...sx(node, device) }}>
      {node.items.map((item, i) => {
        const isOpen = open === i;
        return (
          <div
            key={i}
            data-pf="accordion-item"
            /* From the palette, like the export's — a black hairline is
               invisible on a near-black page, in both readers. */
            style={{ borderBottom: `1px solid ${palette?.border ?? "rgba(0,0,0,.12)"}` }}
          >
            <button
              type="button"
              data-pf="accordion-header"
              aria-expanded={isOpen}
              /* One at a time, because the export says `multiple: false`.
                 Clicking the open one closes it — the same as on the page. */
              onClick={() => setOpen(isOpen ? null : i)}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 16,
                padding: "18px 0",
                /* A <button> brings the UA's font, colour, background and
                   alignment with it, and every one of those is wrong here: this
                   has to look exactly like the row it replaced. */
                width: "100%",
                border: 0,
                background: "none",
                color: "inherit",
                font: "inherit",
                fontWeight: 600,
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              <span>{item.q}</span>
              <span style={{ opacity: 0.4, transition: "transform .2s ease", transform: isOpen ? "rotate(45deg)" : "none" }}>
                +
              </span>
            </button>

            {/* Height animated through grid rather than max-height: a guessed
                max-height either clips a long answer or coasts through empty
                space on a short one, and PageFly's own accordion animates the
                same way (see fields.md on `& .pf-accordion-body`). */}
            <div
              data-pf="accordion-body"
              style={{
                display: "grid",
                gridTemplateRows: isOpen ? "1fr" : "0fr",
                transition: "grid-template-rows .28s cubic-bezier(.22,1,.36,1)",
              }}
            >
              <div style={{ overflow: "hidden" }}>
                <div style={{ paddingBottom: 18, opacity: 0.72, lineHeight: 1.6 }}>
                  {item.a}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * A block the model wrote itself — markup, style and script.
 *
 * The mockup runs it. Showing a grey box labelled "custom" would tell the
 * merchant nothing about whether to approve the page, and this is the one node
 * type whose whole purpose is to look like something the vocabulary cannot
 * describe.
 *
 * Sanitised through the same module the export uses, so what runs here and what
 * runs on the storefront came from one decision about what is allowed.
 */
function CustomBlock({ node, cls }: { node: Extract<DesignNode, { type: "custom" }>; cls?: string }) {
  const { device } = useDesign();
  const ref = useRef<HTMLDivElement>(null);

  /* Index is per-render rather than per-page here: the preview only needs the
     block's own styles to be distinct from its neighbours', and useId gives
     that without threading a counter through every component. */
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const clean = useMemo(() => cleanBlock(node, 0), [node]);
  const className = `pfd-c-${uid}`;
  const css = useMemo(
    () => clean.css.replaceAll(".pfd-c-0", `.${className}`),
    [clean.css, className],
  );

  useEffect(() => {
    if (!node.js?.trim() || !ref.current) return;
    /* Run against THIS element rather than a document query: four device frames
       render the same page at once, and a document-wide lookup would find the
       desktop one from inside the phone. */
    try {
      /* Through `previewJs`, so the observers and timers the block registers are
         guarded too. The bare form guarded only the setup: a block that armed an
         IntersectionObserver and read `.style` off a null query threw from inside
         the callback, on every scroll, and the preview carried a permanent error
         badge for a wave divider. */
      new Function("root", previewJs(node.js))(ref.current);
    } catch (err) {
      /* A decoration that throws must not take the preview with it — but it
         should say so, or the next person debugs the page instead of the block. */
      console.warn("[custom block] setup failed:", err);
    }
  }, [node.js]);

  return (
    <div
      ref={ref}
      data-pf="custom"
      data-label={node.label}
      className={[className, cls].filter(Boolean).join(" ")}
      style={{ width: "100%", ...sx(node, device) }}
    >
      {css && <style>{css}</style>}
      <div dangerouslySetInnerHTML={{ __html: clean.html }} />
    </div>
  );
}

/**
 * The form, drawn as it will behave.
 *
 * Inert on purpose: the mockup is a picture, and a form that accepted a click
 * here would suggest it had sent something. The exported Form2 is the live one.
 */
function Form({ node, cls }: { node: Extract<DesignNode, { type: "form" }>; cls?: string }) {
  const { device } = useDesign();
  return (
    <div
      data-pf="form"
      className={cls}
      style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%", ...sx(node, device) }}
    >
      {node.fields.map((f, i) => (
        <label key={i} style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 13, opacity: 0.75 }}>
            {f.label}
            {f.required && <span style={{ opacity: 0.5 }}> *</span>}
          </span>
          <div
            style={{
              border: "1px solid rgba(0,0,0,.16)",
              borderRadius: 6,
              padding: "12px 14px",
              /* A message field is taller in PageFly too — inputType 1 is the
                 multi-line control, not a styling choice made here. */
              minHeight: f.kind === "message" ? 96 : undefined,
            }}
          />
        </label>
      ))}
      <div
        data-pf="form-submit"
        style={{
          alignSelf: "flex-start",
          borderRadius: 6,
          padding: "13px 26px",
          background: "currentColor",
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        <span style={{ mixBlendMode: "difference", color: "#FFFFFF" }}>{node.submitText}</span>
      </div>
    </div>
  );
}

/**
 * The carousel, showing its first `perView` slides side by side.
 *
 * Static. Arrows and dots are drawn because the exported Slideshow has them and
 * a mockup without them would understate the height the section takes, but they
 * do not move: a mockup that could be scrolled invites the merchant to check
 * slide four instead of approving the page.
 */
function Slides({ node, cls }: { node: Extract<DesignNode, { type: "slideshow" }>; cls?: string }) {
  const { device } = useDesign();
  const per = device === "mobile" ? 1 : device === "tablet" ? Math.min(2, node.perView) : node.perView;
  const shown = node.slides.slice(0, per);

  return (
    <div data-pf="slideshow" className={cls} style={{ width: "100%", ...sx(node, device) }}>
      <div style={{ display: "flex", gap: 24, alignItems: "stretch" }}>
        {shown.map((slide, i) => (
          <div key={i} style={{ flex: 1, minWidth: 0 }}>
            <Node node={slide} />
          </div>
        ))}
      </div>
      {node.slides.length > per && (
        <div style={{ display: "flex", justifyContent: "center", gap: 7, paddingTop: 22 }}>
          {node.slides.slice(0, Math.ceil(node.slides.length / per)).map((_, i) => (
            <span
              key={i}
              style={{ width: 7, height: 7, borderRadius: 999, background: "currentColor", opacity: i === 0 ? 0.75 : 0.22 }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Text on a photograph — the node the whole schema change exists for.
 *
 * The scrim is a gradient over the image in the same background stack, not a
 * separate overlay div: one element means the mockup and the export are the
 * same construction rather than two things that happen to look alike.
 */
function Overlay({ node, cls }: { node: Extract<DesignNode, { type: "overlay" }>; cls?: string }) {
  const { device, images } = useDesign();
  const src = images[node.query];
  const scrim = SCRIM[node.scrim] ?? "";
  const align = ALIGN[node.align] ?? ALIGN["bottom-left"];

  return (
    <div
      data-pf="overlay"
      className={cls}
      style={{
        display: "flex",
        width: "100%",
        /* Height ÷ width, against THIS box — not `ratio * 100vw`, which is the
           same number only when the overlay is full-bleed and made every tile in
           a three-across grid a full screen tall. `minHeight: min-content` is
           the floor that keeps text taller than the shape from being clipped.
           Kept identical to the export's rule in `toPagefly.ts`. */
        aspectRatio: `1 / ${node.ratio}`,
        minHeight: "min-content",
        maxHeight: "100vh",
        backgroundImage: [scrim, src ? `url("${src}")` : ""].filter(Boolean).join(", "),
        backgroundSize: "cover",
        backgroundPosition: "center",
        /* Visible while the photograph loads and if it never does. Light text
           on nothing is invisible; light text on grey is legible. */
        backgroundColor: "#3A3A42",
        ...align,
        ...sx(node, device),
      }}
    >
      {node.children.map((child, i) => (
        <Node key={i} node={child} />
      ))}
    </div>
  );
}

const SCRIM: Record<string, string> = {
  left: "linear-gradient(90deg, rgba(0,0,0,.72) 0%, rgba(0,0,0,.45) 38%, rgba(0,0,0,0) 68%)",
  bottom: "linear-gradient(0deg, rgba(0,0,0,.75) 0%, rgba(0,0,0,.35) 34%, rgba(0,0,0,0) 62%)",
  full: "linear-gradient(0deg, rgba(0,0,0,.45) 0%, rgba(0,0,0,.45) 100%)",
  none: "",
};

const ALIGN: Record<string, CSSProperties> = {
  "bottom-left": { alignItems: "flex-end", justifyContent: "flex-start" },
  center: { alignItems: "center", justifyContent: "center" },
  "top-left": { alignItems: "flex-start", justifyContent: "flex-start" },
};

/**
 * A bar pinned to an edge.
 *
 * `sticky` rather than `fixed` in the mockup: four device frames render the
 * same page at once, and a fixed bar would pin itself to the browser window
 * rather than to the frame it belongs to — one bar over all four pages.
 */
function Sticky({ node, cls }: { node: Extract<DesignNode, { type: "sticky" }>; cls?: string }) {
  const { device } = useDesign();
  if (node.mobileOnly && device !== "mobile") return null;

  /* The buy-bar case, and only that case, belongs to the VIEWPORT: a bar pinned
     across the bottom of a phone is meant to leave the flow. Everything else
     belongs to its container — see `stickyCss` in toPagefly, which is the same
     rule, because the two have to agree. Exported as `fixed`, a spec rail left
     its column and landed on the store's own header. */
  const pinned = node.mobileOnly && node.edge === "bottom";

  return (
    <div
      data-pf="sticky"
      className={cls}
      style={{
        position: pinned ? "fixed" : "sticky",
        [node.edge]: 0,
        ...(pinned ? { left: 0, right: 0, zIndex: 60 } : { zIndex: 20 }),
        /* A sticky flex child that is stretched cannot stick — it is already as
           tall as the row, so it has nowhere to hold. This is the declaration
           that makes `position: sticky` work at all inside a flex container, and
           leaving it out is how a sticky rail silently behaves like a static
           one. */
        ...(pinned ? null : { alignSelf: "flex-start" as const }),
        display: "flex",
        alignItems: "center",
        gap: 16,
        width: "100%",
        ...sx(node, device),
      }}
    >
      {node.children.map((child, i) => (
        <Node key={i} node={child} />
      ))}
    </div>
  );
}

/** Two photographs and a handle. Static — the handle shows where it sits. */
function BeforeAfter({ node, cls }: { node: Extract<DesignNode, { type: "beforeAfter" }>; cls?: string }) {
  const { device, images } = useDesign();
  const before = images[node.beforeQuery];
  const after = images[node.afterQuery];

  return (
    <div
      data-pf="before-after"
      className={cls}
      style={{ display: "flex", width: "100%", gap: 2, ...sx(node, device) }}
    >
      {[
        [before, node.beforeLabel],
        [after, node.afterLabel],
      ].map(([src, label], i) => (
        <div key={i} style={{ flex: 1, minWidth: 0, position: "relative" }}>
          <div style={{ width: "100%", aspectRatio: "1 / 0.75", background: "#E8E8EC", overflow: "hidden" }}>
            {src && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            )}
          </div>
          <span
            style={{
              display: "inline-block",
              marginTop: 8,
              fontSize: 12,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              opacity: 0.7,
            }}
          >
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * A row that travels sideways.
 *
 * The track is duplicated here as it is in the export, so the loop has
 * something to arrive as the first copy leaves. A marquee built from one copy
 * shows a gap once per pass and the gap is the thing people notice.
 */
function Marquee({ node, cls }: { node: Extract<DesignNode, { type: "marquee" }>; cls?: string }) {
  const { device } = useDesign();
  const track = (
    <div style={{ display: "flex", flex: "0 0 auto", gap: 48 }}>
      {node.children.map((child, i) => (
        <Node key={i} node={child} />
      ))}
    </div>
  );
  return (
    <div
      data-pf="marquee"
      className={cls}
      style={{ display: "flex", overflow: "hidden", width: "100%", ...sx(node, device) }}
    >
      {track}
      {track}
    </div>
  );
}

/**
 * A number, shown at its final value.
 *
 * Static in the mockup on purpose: a counter that animates every time the
 * merchant scrolls past it makes the page feel busy in a way the live page will
 * not, because there it runs once.
 */
function Counter({ node, cls }: { node: Extract<DesignNode, { type: "counter" }>; cls?: string }) {
  const { device } = useDesign();
  return (
    <div data-pf="counter" className={cls} style={{ ...sx(node, device) }}>
      <div style={{ fontSize: 44, fontWeight: 700, lineHeight: 1, letterSpacing: "-0.03em" }}>
        {node.prefix}
        {node.value}
        {node.suffix}
      </div>
      {node.label && <div style={{ marginTop: 8, fontSize: 13, opacity: 0.7 }}>{node.label}</div>}
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
    case "bound":
      return <Bound slot={node.slot} />;

    case "product":
      return <Product node={node} cls={cls} />;
    case "productList":
      return <ProductGrid node={node} cls={cls} />;
    case "accordion":
      return <Accordion node={node} cls={cls} />;
    case "form":
      return <Form node={node} cls={cls} />;
    case "custom":
      return <CustomBlock node={node} cls={cls} />;
    case "slideshow":
      return <Slides node={node} cls={cls} />;
    case "overlay":
      return <Overlay node={node} cls={cls} />;
    case "sticky":
      return <Sticky node={node} cls={cls} />;
    case "beforeAfter":
      return <BeforeAfter node={node} cls={cls} />;
    case "marquee":
      return <Marquee node={node} cls={cls} />;
    case "counter":
      return <Counter node={node} cls={cls} />;
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

/** The scrim over a background photograph, matching FlexSection's filterColor. */
const BAND_SCRIM: Record<string, string> = {
  none: "rgba(0,0,0,0)",
  soft: "rgba(0,0,0,0.42)",
  strong: "rgba(0,0,0,0.62)",
};

/**
 * A band, and its background photograph or video.
 *
 * The video is a real `<video>`, autoplaying, muted and looping, with the
 * photograph as its poster — because that is exactly what the exported page
 * does. A mockup that showed a still where the storefront plays a video would
 * be the same class of lie as a mockup that showed thumbnails the import did
 * not have.
 *
 * The scrim is a separate layer rather than a gradient in the background stack,
 * because PageFly's `filterColor` is a flat wash over the whole band and the
 * two have to agree. It sits under the content and over the media.
 */
function Section({ section }: { section: DesignSection }) {
  const { device, images, videos } = useDesign();
  const classes = motionClasses(section.anim);

  const bg = section.bg;
  const photo = bg?.query ? images[bg.query] : undefined;
  const video = bg?.kind === "video" && bg.query ? videos?.[bg.query] : undefined;
  const scrim = BAND_SCRIM[bg?.scrim ?? "soft"];
  const hasMedia = Boolean(photo || video);

  return (
    <section
      data-pf="section"
      data-role={section.role}
      className={classes.join(" ") || undefined}
      style={{
        width: "100%",
        ...(hasMedia
          ? { position: "relative", overflow: "hidden", isolation: "isolate" as const }
          : null),
        ...sx(section, device),
      }}
    >
      {hasMedia && (
        <>
          {video ? (
            <video
              src={video}
              poster={photo}
              autoPlay
              muted
              loop
              playsInline
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                zIndex: 0,
              }}
            />
          ) : (
            <div
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                backgroundImage: `url("${photo}")`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                zIndex: 0,
              }}
            />
          )}
          <div aria-hidden style={{ position: "absolute", inset: 0, background: scrim, zIndex: 1 }} />
        </>
      )}
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
 * The timer is a safety net, not part of the effect. Once `.pfd-motion-ready` is set,
 * reveal styles rest at `opacity: 0`, so anything the observer fails to reach —
 * a frame clipped by the stage, a device the merchant has not scrolled to —
 * would be an invisible page rather than a still one. After a second and a
 * half, everything shows.
 */
function useReveal(root: React.RefObject<HTMLDivElement | null>, tree: DesignTree) {
  useEffect(() => {
    const host = root.current;
    if (!host) return;

    const targets = () => Array.from(host.querySelectorAll<HTMLElement>(".pfd-reveal:not(.pfd-revealed)"));
    const showAll = () => targets().forEach((el) => el.classList.add("pfd-revealed"));

    /* Nothing is hidden until `.pfd-motion-ready` says so — the same gate the exported
       page uses, for the same reason. Set here rather than in the markup so a
       preview whose effects never run shows a complete page instead of an
       empty one. */
    if (typeof IntersectionObserver === "undefined") return;
    document.documentElement.classList.add("pfd-motion-ready");

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("pfd-revealed");
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
  videos = {},
  palette = null,
}: {
  tree: DesignTree;
  device: Device;
  images?: Record<string, string>;
  videos?: Record<string, string>;
  /** the page's own palette; see `Ctx.palette` for what needs it and why */
  palette?: { accent: string; border: string; radius: number } | null;
}) {
  const root = useRef<HTMLDivElement>(null);
  useReveal(root, tree);

  return (
    <DesignCtx.Provider value={{ device, images, videos, palette }}>
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
