/* ==========================================================================
   Every PageFly element, by name.

   GENERATED FROM `MD Json PageFly/fields.md` by `scripts/gen-elements.ts`, not
   typed out. That file is produced from PageFly's own registry, so a hand-kept
   copy is a copy that goes stale the first time the platform ships an element —
   and it goes stale silently, which is the worst kind: the dropdown simply does
   not offer the thing the operator is looking at.

   Used by Training Design's section tab: an operator files reference
   screenshots against the element they are a reference FOR, and the build looks
   them up by that name. The name is the join, which is why it has to be the
   platform's own name rather than a friendly label — "product detail" is a
   phrase, `ProductBox` is a thing the exporter can emit.
   ========================================================================== */

export const PAGEFLY_ELEMENTS = [
  "Accordion3",
  "Accordion3.Content",
  "Accordion3.Content.Wrapper",
  "Accordion3.Flex.Content",
  "Accordion3.Header",
  "ArticleBox",
  "ArticleContent",
  "ArticleList2",
  "ArticleMeta",
  "ArticleTitle",
  "Button2",
  "CollectionBox",
  "CollectionDescription",
  "CollectionListing2",
  "CollectionTitle",
  "CompactButton",
  "ContentList2",
  "ContentListItem",
  "CountDown",
  "CountdownLabel",
  "CountdownNumber",
  "Custom.HTML",
  "Divider2",
  "DividerIcon",
  "DividerIcon2",
  "DividerSymbol",
  "DividerSymbol2",
  "DividerText",
  "Dropcap",
  "DropdownButton",
  "FBLikeButton2",
  "FBPageBox2",
  "FlexBlock",
  "FlexSection",
  "Form2",
  "Form2.Button2",
  "Form2.Field",
  "FormInput",
  "FormLabel",
  "GMapBasicV2",
  "Heading2",
  "HTML.Video3",
  "Icon",
  "Icon2",
  "Image5",
  "ImageComparison",
  "Insta3",
  "List2",
  "List2.Item2",
  "MailChimpBox",
  "MediaItem2",
  "MediaList2",
  "MediaListItem2",
  "OptionLabel",
  "Paragraph4",
  "Popup",
  "ProductATC2",
  "ProductBadge",
  "ProductBox",
  "ProductDescription",
  "ProductDynamicCheckout",
  "ProductList2",
  "ProductMedia3",
  "ProductPrice2",
  "ProductPrice2Item",
  "ProductQuantity",
  "ProductTitle",
  "ProductVariantSwatches",
  "ProductVendor",
  "ProgressBox2",
  "QRCode",
  "QuantityButton",
  "QuantityField",
  "SearchFormBox",
  "Slideshow",
  "SlideshowSlide",
  "SoundCloud",
  "StockIndicator",
  "Swatch",
  "TabContentWrapper3",
  "TabHeader3",
  "Table2",
  "Table2.Body",
  "Table2.Cell",
  "Table2.Column",
  "Table2.ColumnBody",
  "Table2.ColumnHeader",
  "Table2.Row",
  "Table2.RowHeader",
  "Tabs3",
  "TabsContent3",
  "TabsMenu3",
  "TwitterFeed2",
  "Vimeo3",
  "Youtube4",
] as const;

export type PageflyElement = (typeof PAGEFLY_ELEMENTS)[number];

export function isPageflyElement(name: string): boolean {
  return (PAGEFLY_ELEMENTS as readonly string[]).includes(name);
}

/**
 * The elements a SECTION reference is plausibly about.
 *
 * Offered first in the dropdown, with the full list under it. Not a
 * restriction: an operator who has a reference for `Table2` should be able to
 * file it, and the ones below are only the ones they will reach for most.
 *
 * `Accordion3.Content.Wrapper` and `QuantityButton` are in the full list
 * because the platform has them, and out of this one because nobody has a
 * screenshot of a slot.
 */
export const COMMON_SECTION_ELEMENTS: readonly string[] = [
  "ProductBox",
  "ProductList2",
  "ProductMedia3",
  "ContentList2",
  "Slideshow",
  "Accordion3",
  "Form2",
  "Table2",
  "CollectionListing2",
  "ArticleList2",
  "ImageComparison",
  "CountDown",
  "Tabs3",
  "FlexSection",
];
