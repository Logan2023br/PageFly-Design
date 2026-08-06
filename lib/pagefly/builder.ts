import { zipSync, strToU8 } from "fflate";

/* ==========================================================================
   PageFly page builder — TypeScript port of
   pagefly-template-builder/scripts/pagefly_builder.py

   Ported rather than shelled out to because generation is client-side: the
   export has to produce a Blob the browser downloads, with no server hop and
   no Python runtime. The schema rules below are the ones that fail SILENTLY in
   the PageFly editor (it renders an empty block and reports nothing), so the
   validator is not optional — see pagefly-template-builder/references/schema.md.
   ========================================================================== */

export type StyleData = Record<string, Record<string, string>> | null;

/** Composition-time node. `_kids` holds real child nodes; ids are assigned at
    build time so the order things are composed in never matters. */
export type PFNode = {
  type: string;
  data: Record<string, unknown>;
  styleData: StyleData;
  _kids: PFNode[];
  roomId?: string;
};

/* Button2 carries these inert blobs in every real export. Copied verbatim —
   the editor expects the keys to exist. */
const BTN_BLOBS = {
  youtubeData: {
    loop: false,
    autoplay: false,
    controls: false,
    mute: false,
    videoID: "PtZir36SIMk",
  },
  htmlVideoData: { loop: false, autoplay: false, controls: false, mute: false },
  vimeoData: {
    ratio: 56.25,
    loop: false,
    portrait: false,
    byline: false,
    title: false,
    autoplay: false,
    controls: true,
    mute: false,
  },
  popupImageData: { objectFit: "contain", objectPosition: "center center" },
};

function node(
  type: string,
  data: Record<string, unknown> = {},
  styleData: StyleData = null,
  kids: PFNode[] = [],
): PFNode {
  return { type, data, styleData, _kids: kids };
}

/* ---- node constructors -------------------------------------------------- */

export function FB(styleData: StyleData, kids: PFNode[] = [], cls?: string) {
  return node("FlexBlock", cls ? { className: cls } : {}, styleData, kids);
}

export function FSECTION(kids: PFNode[] = [], styleData: StyleData = null) {
  return node(
    "FlexSection",
    { classGlobalStyling: "pf-container-2" },
    styleData,
    kids,
  );
}

export function H2(value: string, styleData: StyleData, cls?: string) {
  const d: Record<string, unknown> = {
    value,
    editable: true,
    placeholder: "Enter heading...",
  };
  if (cls) d.className = cls;
  return node("Heading2", d, styleData, []); // light form — no Icon2 slot
}

export function P4(value: string, styleData: StyleData, cls?: string) {
  const d: Record<string, unknown> = { value };
  if (cls) d.className = cls;
  return node("Paragraph4", d, styleData, []); // light form — no Dropcap slot
}

export function BTN(
  value: string,
  href: string,
  styleData: StyleData,
  cls?: string,
) {
  const d: Record<string, unknown> = {
    value,
    buttonType: "text",
    href,
    clickAction: href ? "url" : "none",
    placeholder: "Enter text here...",
    ...BTN_BLOBS,
  };
  if (cls) d.className = cls;
  return node("Button2", d, styleData, []);
}

export function IMG(src: string, styleData: StyleData, cls?: string) {
  const d: Record<string, unknown> = {
    name: "Image",
    loading: "lazy",
    imgQuality: "auto",
    linkTarget: "_self",
  };
  if (src) d.src = src;
  if (cls) d.className = cls;
  return node("Image5", d, styleData, []);
}

export function CUSTOM_HTML(code: string, styleData?: StyleData, cls?: string) {
  const d: Record<string, unknown> = { code };
  if (cls) d.className = cls;
  return node(
    "Custom.HTML",
    d,
    styleData ?? { all: { "&": "width: 100%;" } },
    [],
  );
}

/* ---- flatten + validate ------------------------------------------------- */

export type FlatNode = {
  id: number;
  type: string;
  data: Record<string, unknown>;
  styleData: StyleData;
  children: number[];
  roomId?: string;
};

/** Bottom-up ids; root gets 0 and must be the LAST array element. */
export function flatten(root: PFNode): FlatNode[] {
  const order: PFNode[] = [];
  const walk = (n: PFNode) => {
    for (const k of n._kids) walk(k);
    order.push(n);
  };
  walk(root);

  const ids = new Map<PFNode, number>();
  let next = 1;
  for (const n of order) ids.set(n, n === root ? 0 : next++);

  return order.map((n) => {
    const out: FlatNode = {
      id: ids.get(n)!,
      type: n.type,
      data: n.data,
      styleData: n.styleData,
      children: n._kids.map((k) => ids.get(k)!),
    };
    if (n.roomId !== undefined) out.roomId = n.roomId;
    return out;
  });
}

const SLOT_RULES: Record<string, string[]> = {
  ProductPrice2: ["ProductPrice2Item", "ProductPrice2Item"],
  ProductQuantity: ["QuantityButton", "QuantityField", "QuantityButton"],
  ProductVariantSwatches: ["OptionLabel", "Swatch"],
  "Accordion3.Content.Wrapper": ["Accordion3.Header", "Accordion3.Content"],
  "Accordion3.Content": ["Accordion3.Flex.Content"],
};

export function validate(nodes: FlatNode[]): void {
  const ids = nodes.map((n) => n.id);
  if (ids.length !== new Set(ids).size) throw new Error("duplicate id");

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const kids = nodes.flatMap((n) => n.children);
  if (kids.length !== new Set(kids).size)
    throw new Error("a node has two parents");

  const orphans = kids.filter((c) => !byId.has(c));
  if (orphans.length) throw new Error(`orphan child refs: ${orphans}`);

  const childSet = new Set(kids);
  const roots = ids.filter((i) => !childSet.has(i));
  if (roots.length !== 1 || roots[0] !== 0)
    throw new Error(`expected single root id 0, got ${roots}`);
  if (nodes[nodes.length - 1].id !== 0)
    throw new Error("root must be the LAST array element");

  for (const n of nodes) {
    const rule = SLOT_RULES[n.type];
    if (rule) {
      const kt = n.children.map((c) => byId.get(c)!.type);
      if (kt.join("|") !== rule.join("|"))
        throw new Error(`${n.type} slots must be ${rule}, got ${kt}`);
    }
    // Shopify's Liquid engine eats these on publish.
    const code = (n.data?.code as string | undefined) ?? "";
    if (code.includes("{{") || code.includes("{%"))
      throw new Error("Liquid tokens in Custom.HTML code");
  }
}

export function toClipboard(root: PFNode): string {
  const nodes = flatten(root);
  validate(nodes);
  return JSON.stringify({ pageflyData: nodes });
}

/* ---- .pagefly page ------------------------------------------------------ */

type Item = {
  __v: 0;
  id: string;
  type: string;
  children: string[];
  styles: never[];
  createdAt: string;
  updatedAt: string;
  data?: Record<string, unknown>;
  roomId?: string;
};

type StyleEntry = {
  __v: 0;
  id: string;
  type: string;
  styles: string;
  createdAt: string;
  updatedAt: string;
};

export type PageFlyFile = {
  selectedFonts: Record<string, unknown>;
  customJS: string;
  customCSS: string;
  pageflyVersion: string;
  editorVersion: "Flex";
  items: Item[];
  styles: StyleEntry[];
  type: "page";
  globalSectionData: never[];
};

const PAGEFLY_VERSION = "4.26.3.55";

function uid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  // Deterministic-enough fallback for environments without randomUUID.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function stamp(): string {
  return new Date().toISOString().replace(/(\.\d{3})Z$/, "$1Z");
}

export class Page {
  readonly name: string;
  private customJS: string;
  private customCSS: string;
  private selectedFonts: Record<string, unknown>;
  private sections: PFNode[] = [];

  constructor(opts: {
    name: string;
    customJS?: string;
    customCSS?: string;
    selectedFonts?: Record<string, unknown>;
  }) {
    const js = opts.customJS ?? "";
    if (js.includes("{{") || js.includes("{%"))
      throw new Error("Liquid tokens in customJS");
    this.name = opts.name;
    this.customJS = js;
    this.customCSS = opts.customCSS ?? "";
    this.selectedFonts = opts.selectedFonts ?? {};
  }

  addSection(section: PFNode) {
    if (section.type !== "FlexSection")
      throw new Error("addSection takes an FSECTION(...)");
    this.sections.push(section);
  }

  build(): PageFlyFile {
    const ts = stamp();
    const items: Item[] = [];
    const styles: StyleEntry[] = [];

    const emit = (n: PFNode, parentChildren: string[]) => {
      const id = uid();
      const item: Item = {
        __v: 0,
        id,
        type: n.type,
        children: [],
        styles: [],
        createdAt: ts,
        updatedAt: ts,
      };
      if (Object.keys(n.data).length) item.data = n.data;
      if (n.roomId !== undefined) item.roomId = n.roomId;
      items.push(item);
      parentChildren.push(id);

      /* Note the double encoding: the top-level `styles` array holds the real
         styles, and its `styles` field is a JSON *string*. The per-item
         `styles: []` is a decoy the format requires. */
      if (n.styleData !== null) {
        styles.push({
          __v: 0,
          id,
          type: n.type,
          styles: JSON.stringify(n.styleData),
          createdAt: ts,
          updatedAt: ts,
        });
      }
      for (const k of n._kids) emit(k, item.children);
    };

    // Required tree root: Body → Layout → FlexSection(s). Both carry no styles.
    const body: Item = {
      __v: 0,
      id: uid(),
      type: "Body",
      children: [],
      styles: [],
      createdAt: ts,
      updatedAt: ts,
    };
    const layout: Item = {
      __v: 0,
      id: uid(),
      type: "Layout",
      children: [],
      styles: [],
      createdAt: ts,
      updatedAt: ts,
    };
    body.children.push(layout.id);
    items.push(body, layout);
    for (const s of this.sections) emit(s, layout.children);

    this.validateItems(items, styles);

    return {
      selectedFonts: this.selectedFonts,
      customJS: this.customJS,
      customCSS: this.customCSS,
      pageflyVersion: PAGEFLY_VERSION,
      editorVersion: "Flex",
      items,
      styles,
      type: "page",
      globalSectionData: [],
    };
  }

  private validateItems(items: Item[], styles: StyleEntry[]) {
    const ids = new Set(items.map((i) => i.id));
    const child = items.flatMap((i) => i.children);
    if (child.length !== new Set(child).size)
      throw new Error("double-parented item");
    if (child.some((c) => !ids.has(c))) throw new Error("orphan child ref");

    const childSet = new Set(child);
    const roots = items.filter((i) => !childSet.has(i.id));
    if (roots.length !== 1 || roots[0].type !== "Body")
      throw new Error("single Body root required");

    for (const s of styles) {
      if (!ids.has(s.id)) throw new Error("style entry points at missing item");
      JSON.parse(s.styles); // must be a valid JSON string
    }
  }

  /** The .pagefly container is a zip holding exactly one `1 - <name>.json`. */
  toBlob(): Blob {
    const page = this.build();
    const entry = `1 - ${this.name}.json`;
    const zipped = zipSync(
      { [entry]: strToU8(JSON.stringify(page)) },
      { level: 6 },
    );
    // Copy into a fresh buffer so the Blob never aliases fflate's pooled memory.
    return new Blob([new Uint8Array(zipped)], { type: "application/zip" });
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next task so the download has definitely started.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
