# Định dạng file .pagefly & mapping sang live DOM

Tài liệu reverse-engineering, rút ra từ việc mổ xẻ cặp file:

- `export-pages-2026-8-9-4-52-43.pagefly` — file export từ editor (page "all element", chứa đủ ~70 loại element gen-2)
- `Hew Kick Off.html` — chính page đó sau khi publish, lưu từ live view

Mọi khẳng định dưới đây đều được kiểm chứng trực tiếp trên 2 file này (PageFly `4.26.3.59`, editor `Flex`).
Đọc kèm repo `pf-elements-json-knowledge/` (fields.md = field của từng element, nesting.md = element nào
lồng được vào element nào).

---

## 1. Container: .pagefly là file ZIP

```
export-pages-2026-8-9-4-52-43.pagefly
└── 1 - all element.json        ← "<số thứ tự> - <tên page>.json", mỗi page một entry
```

Muốn tạo file import được: zip một (hoặc nhiều) file JSON đặt tên theo pattern trên, đổi đuôi thành `.pagefly`.
Tên page khi import lấy từ tên entry.

## 2. JSON top-level

```json
{
  "customJS": "",
  "customCSS": "",
  "pageflyVersion": "4.26.3.59",
  "editorVersion": "Flex",
  "type": "page",
  "items": [ ...294 node... ],
  "styles": [ ...258 bản ghi CSS... ],
  "globalSectionData": []
}
```

- `items` — mảng PHẲNG toàn bộ element. Cây được biểu diễn bằng tham chiếu id, không lồng JSON.
- `styles` — CSS per-element, tách khỏi items (khác với shape "catalog" trong `page-json.md`
  vốn để `styleData` ngay trên node — export format là biến thể riêng).
- `customJS`/`customCSS` — string, chèn nguyên văn vào page.
- `globalSectionData` — [] nếu không dùng global section.

## 3. items[] — shape của một node

```json
{
  "id": "9c08aa95-629c-49aa-8b73-8908ebcee58e",   // UUID string, unique trong page
  "type": "FlexSection",                            // tên element, xem fields.md
  "children": ["08aa9562-9c39-4a0b-...", ...],     // id các con, THEO THỨ TỰ RENDER
  "data": { "classGlobalStyling": "pf-container-1 pf-color-scheme-1", ... },
  "styles": [],                                     // luôn rỗng trong export (CSS nằm ở mảng styles top-level)
  "roomId": "1",                                    // CHỈ có trên element trong repeated content — xem §6
  "__v": 0, "createdAt": "...", "updatedAt": "..."  // metadata Mongo, giá trị batch, không mang nghĩa
}
```

Điểm cần nhớ:

- **Root là node không bị ai tham chiếu trong `children`** — luôn là `Body`. Cây chuẩn:
  `Body → Layout → FlexSection (mỗi section một dải full-width) → ...`. Vị trí node trong mảng
  KHÔNG quyết định layout; chỉ `children` quyết định.
- **`data` là settings riêng của element** — đúng theo bảng trong `fields.md`. Text nằm ở `data.value`
  (Heading2, Paragraph4, Button2, TabHeader3...). Element không có setting gì vẫn nên có
  `data.classGlobalStyling` (xem §5).
- **Icon nằm ở `data.icon`** (vd `"check"`); thiếu thì render icon mặc định (star). Icon của Button/Heading
  là node `Icon2` con, không phải field của cha.
- **Image5 không có src trong sample** → render SVG placeholder. Ảnh thật sẽ nằm trong `data`
  (src/link fields theo fields.md).
- Slot `options` (hideOnDesktop/Laptop/Tablet/Mobile) không xuất hiện trong sample này nhưng theo
  `page-json.md` là slot ngang hàng `data` — visibility PHẢI ghi vào `options`, ghi vào `data` bị nuốt.
- id trong file export sinh theo kiểu sliding-window trên một chuỗi hex (các id gối nhau từng cặp ký tự) —
  chỉ là cách generator của PageFly chạy; **khi tự build chỉ cần UUID unique là đủ**.

## 4. styles[] — CSS per-element

```json
{
  "id": "9c08aa95-629c-49aa-8b73-8908ebcee58e",  // == id của item mà nó style
  "type": "FlexSection",                           // == type của item đó
  "styles": "{\"all\":{\"& > .pf-flex-section\":\"display: flex; ...\"},\"mobile\":{\"& > .pf-flex-section\":\"flex-flow: column;\"}}",
  "__v": 0, "createdAt": "...", "updatedAt": "..."
}
```

- **Liên kết duy nhất: `style.id == item.id`** (kiểm chứng 160/160 khớp). Trong file export còn 98 bản ghi
  KHÔNG có `id` — phần lớn trùng lặp nội dung theo cặp; không có cách nào bám vào item (không khớp
  timestamp, không khớp thứ tự) → coi là rác của exporter. **Khi tự build: mọi style đều phải có `id`.**
- `styles` là **JSON string** (double-encoded), shape: `{breakpoint: {selector: "css string"}}`.
- Breakpoint keys và media query tương ứng khi publish:

  | Key | Media query trên live |
  | --- | --- |
  | `all` | `@media all` (base/desktop) |
  | `laptop` | `(min-width:1024.5px) and (max-width:1199.4999px)` |
  | `tablet` | `(min-width:767.5px) and (max-width:1024.4999px)` |
  | `mobile` | `(max-width:767.4999px)` |

  `all` là base, breakpoint hẹp chỉ override phần khai báo thêm.
- Selector tương đối theo `&` (= chính element). Các selector thực tế gặp trong sample:
  `&`, `&:hover`, `&[data-active="true"]`, `& > .pf-flex-section` (FlexSection), `& > .pf-table-cell-inner`
  (Table2.Cell), `& > form` (Form2), `& > .pf-slider` (Slideshow), `& [data-pf-type="TabHeader3"]`,
  `& [data-pf-type="Accordion3.Header"]`, `& .pf-countdown__colon`, `& [data-pf-type="QuantityButton"]`,
  `& > div img`… Selector hợp lệ per-element xem mục "Styleable parts" trong `fields.md`.
- Layout kiểu Figma của editor Flex đi qua CSS variables trong chính chuỗi CSS:
  `--pf-flex-layout-width: fill|hug`, `--pf-flex-layout-height`, `--pf-flex-layout-direction: vertical|horizontal`,
  `--pf-flex-layout-parent-direction`, `--pf-flex-layout-reverse` — kèm CSS thật tương ứng
  (`display:flex; flex-flow:column; justify-content...; align-items...; gap...`). Editor đọc các biến này
  để hiện đúng trạng thái Fill/Hug/Fixed; live chỉ cần CSS thật, nhưng nên ghi cả hai để file import
  còn edit được đúng.
- Exporter có lỗi vặt được tolerate: chuỗi CSS thiếu `;` cuối, thậm chí dính chữ `undefined`
  (`"font-size: inherit; undefined"`) — importer/publisher không chết vì mấy lỗi này.

## 5. classGlobalStyling — Global Styles của shop

`data.classGlobalStyling` gắn element vào global style preset: `pf-heading-1-h3`, `pf-button-1`,
`pf-text-1`, `pf-icon2-1`, `pf-image-1`, `pf-container-1`, `pf-color-scheme-1`…

- Trên live các class này chỉ CÓ CSS nếu shop define global style tương ứng; trong sample chỉ
  `pf-color-scheme-N` có CSS (bộ CSS variables `--pf-scheme-bg-color`, `--pf-scheme-text-color`… trong
  `styles.css` của app embed).
- Convention mặc định theo loại: heading → `pf-heading-1-h<n>`, button → `pf-button-1`, text/dropcap →
  `pf-text-1`, icon → `pf-icon2-1`, image → `pf-image-1`, section → `pf-container-1 pf-color-scheme-1`.
  Khi build ngược cứ gắn đúng convention này để element ăn theme của shop đích.

## 6. roomId — repeated content (slides, list items, table cells)

60/294 item mang `roomId` (string "1"…"11"). Quan sát:

- Chỉ xuất hiện trên element nằm TRONG container lặp: `SlideshowSlide`, `ContentListItem`, `Table2.Cell`
  (và nội dung của chúng).
- **Các bản copy của cùng một "slot" template dùng chung một roomId**: 8 ảnh của 8 slide đều `roomId:"1"`;
  mỗi slot trong ContentListItem (image / paragraph / dropcap / 2 heading) là một roomId riêng, lặp đủ
  3 bản; nội dung bảng gom về room "11".
- Trên live DOM, element trong room render class `rid-N` (room-relative id, tái sử dụng giữa các bản copy)
  thay cho `pf-N_` toàn cục — CSS của chúng vì thế áp cho MỌI bản copy cùng slot.
- Khi build ngược: nội dung lặp → gán cùng roomId cho các bản copy cùng slot, mỗi slot một giá trị,
  đếm tăng dần trong page. Element ngoài repeated content: không có field này.

## 7. Element JSON → live DOM như thế nào

Wrapper: `<div id="__pf" class="__pf __pf_<pageHash>" data-pf-editor-version="gen-2">` — `<pageHash>`
sinh lúc publish từ page id, KHÔNG nằm trong file export.

Mỗi node render thành đúng một element DOM (một số có wrapper phụ nội bộ):

```html
<section data-section-id="pf-629c" data-pf-type="FlexSection"
         class="sc-jwZJYP kKkRHp pf-11_ pf-container-1 pf-color-scheme-1">
  <div class="pf-flex-section"> ...children... </div>
</section>

<h3 data-pf-type="Heading2" class="sc-cMa-dPg gqnfAG pf-94_ pf-heading-1-h3">Heading title</h3>
<a  data-pf-type="Button2"  class="sc-jztuXx gHBAiw pf-101_ pf-button-1">Button Text</a>
<svg data-pf-type="Icon2"   class="sc-eXrZXP jkkZa-d pf-93_ pf-icon2-1" viewBox="0 0 576 512">…</svg>
```

Giải phẫu class list:

| Class | Nguồn | Vai trò |
| --- | --- | --- |
| `sc-xxxx yyyy` | styled-components, cố định theo type + version | CSS nền của element (bundle sẵn trong `<style>` đầu trang) |
| `pf-N_` | đánh số lúc publish theo thứ tự mảng item server-side | Hook cho CSS per-element từ `styles[]` |
| `rid-N` | thay `pf-N_` cho element trong room | CSS dùng chung mọi bản copy của slot |
| `pf-heading-1-h3`… | `data.classGlobalStyling` | Global style của shop |
| `data-pf-type` | `type` của node | 1:1 với JSON — dùng để đối chiếu design ↔ JSON |

CSS per-element được compile thành:

```css
@media all { .__pf.__pf_<hash> .pf-11_ > .pf-flex-section { display:flex; max-width:1100px; ... } }
@media (max-width:767.4999px) { .__pf.__pf_<hash> .pf-11_ > .pf-flex-section { flex-flow:column; } }
```

tức là: `&` trong style JSON → `.__pf.__pf_<hash> .pf-<n>_`, breakpoint → media query theo bảng §4.
`pf-N_`, `rid-N`, `sc-*`, page hash đều là **sản phẩm publish, không cần (và không thể) ghi vào file export**.

Chi tiết render đáng nhớ:

- `data-section-id="pf-<nhóm-2-của-UUID>"` — vd id `9c08aa95-629c-...` → `pf-629c`.
- Tabs3 là CSS-only: bộ `<input type="radio" name="pf-tabs-<8-ký-tự-đầu-id>">` + label; active tab do
  `data.activeTab` quyết định input nào `checked`.
- Heading2 render đúng tag theo global class (`pf-heading-1-h3` → `<h3>`); Button2 → `<a>`;
  Icon2 → `<svg>` inline (path tra từ icon set theo `data.icon`).
- Image5 thiếu src → SVG placeholder ngay trong DOM.

## 8. Recipe: build ngược một design thành .pagefly

1. **Phân rã design thành cây element** — chọn type theo `fields.md`, kiểm tra quan hệ cha–con hợp lệ bằng
   `nesting.md`. Khung chuẩn: `Body → Layout → FlexSection* → (FlexBlock | element)...`
2. **Sinh UUID cho từng node**, dựng `items[]` phẳng: node cha liệt kê con trong `children` đúng thứ tự
   hiển thị. Leaf để `children: []`, `styles: []`.
3. **Điền `data`** theo fields.md: text vào `value`, icon vào `icon`, `classGlobalStyling` theo convention §5.
   Visibility responsive (nếu cần) vào `options`, không vào `data`.
4. **Repeated content** (slideshow, content list, table): nhân bản subtree cho từng bản copy, mỗi slot
   template một `roomId` chung cho mọi bản copy (§6).
5. **Dựng `styles[]`**: mỗi node cần CSS → một bản ghi `{id: <item id>, type: <item type>, styles: "<JSON string>"}`.
   Base vào `all`, override vào `laptop/tablet/mobile`. Với container flex nhớ ghi kèm bộ biến
   `--pf-flex-layout-*` cho editor. Selector đặc thù (FlexSection `& > .pf-flex-section`, Table cell
   `& > .pf-table-cell-inner`, Form `& > form`…) phải đúng thì CSS mới ăn.
6. **Bọc top-level** như §2 (`type:"page"`, `editorVersion:"Flex"`, `pageflyVersion` hiện hành,
   `globalSectionData: []`), timestamp/`__v` điền giá trị bất kỳ hợp lệ.
7. **Đóng gói**: ghi thành `1 - <Tên page>.json`, zip lại, đổi đuôi `.pagefly`, import trong PageFly →
   page hiện trong editor, chỉnh sửa được như thường.

Sanity-check trước khi giao: mỗi id trong mọi `children` phải tồn tại; đúng một root `Body`; mọi style
có `id` trỏ tới item thật và `type` khớp; chuỗi `styles` parse được thành `{bp:{sel:css}}`.

## 9. Kitchen-sink #2 (`lastfillele.pagefly` + `last fill element.html`)

Export bổ sung 2026-08-09 phủ nốt các element context/list/embed. Cây shape thật đầy đủ của CẢ HAI
kitchen-sink nằm ở `reference/kitchen-sink-1-tree.txt` và `reference/kitchen-sink-2-tree.txt` —
khi build element nào, copy shape từ đó. Phát hiện mới:

- **Popup + trigger liên kết chéo bằng id**: Button2 mở popup có
  `data: {clickAction:"popup", popupContent:"element", popupTargetId:"<id của item Popup>"}`.
  Popup element: `popupTriggers` là **mảng** (vd `["delay"]`, kèm `popupTrigger` string legacy),
  popupFrequencyMode/popupDelay/popupMaxWidth/popupBgColor/popupBorderRadius/popupShadow...
  Trên live: popup render thành `div[data-pf-popup-element][data-pf-popup-id="<id>"]` + một
  `<style id="pf-popup-style-<id>">` riêng; nút trigger mang `data-pf-popup-target="<id>"`.
- **ProductList2** = `{displayPartialItems:{all,laptop,tablet,mobile}, limit, source:"all", useContext:false, button:"icon", type:"title", tag:"h3"}`,
  style có selector `& > .pf-slider`. Con: MỘT `ProductBox {useContext:true}` làm template
  (bên trong: ProductMedia3 → MediaMain3 + MediaList2/MediaItem2 + ProductBadge, ProductTitle,
  ProductPrice2 (+ 2 ProductPrice2Item: price + compare_at_price), ProductATC2 + Icon2).
  ProductBox style dùng `& > form`. Live render slider với `data-slider={...}` config.
- **CollectionListing2** `{limit: 8}` → con: `CollectionBox {useContext:true}` → CollectionImage4
  (`source:"auto", useContext:true, linkToCollection`) + CollectionTitle.
- **ArticleList2** `{navStyle:"none", paginationStyle:"none", listLayout:{all:0,...}, blogId:"gid://shopify/Blog/<id>"}`
  → `ArticleBox` → ArticleImage4/ArticleTitle (`linkToArticle:true`)/ArticleMeta/ArticleExcerpt.
- **StockIndicator** (source:"custom") nhúng nguyên payload sản phẩm Shopify vào data:
  productId, variantId, title, handle, featuredImage{...}, variants[], url... → element loại này
  **gắn chặt store**, muốn portable phải để `useContext:true` trong ProductBox context.
- **MailChimp family**: MailChimpBox (style trên `&` là form flex) → MailchimpField
  (`label:{on,text,position}`) → MailchimpLabel + MailChimpSingleInput
  (`placeholder, fieldName:"mailchimp[email]", inputType:1, id:"field-<8hex>"`) + MailChimpButton2
  (`text` + `value`, buttonType iconWithText, con Icon2). Live render `<form method="POST">`.
- **SearchFormBox family**: SearchFormBox → SearchFormField (`label:{on:false,...}`) →
  SearchFormLabel + SearchFormInput (`id:"field-<8hex>"`) + SearchFormButton2 (con Icon2
  `icon:"sistrix"` — tên FA ngoài list advisory vẫn hợp lệ).
- **Custom.HTML**: nội dung nằm ở `data.code` (string HTML/Liquid thô) — sample này để rỗng.
- **Gen-1 vẫn sống**: Button (con: Icon + Text, text nằm ở node `Text {value}`) xuất hiện trong
  popup. Đúng như page-json.md mô tả ("button không tự chứa label").
- Exporter quirk mới: breakpoint styles chứa `--pf-flex-layout-parent-direction: undefined` —
  vô hại, được tolerate.

**Độ phủ hiện tại: 99 loại element đã có shape thật** (2 kitchen-sink gộp lại). Còn 15 loại có docs
trong fields.md nhưng chưa có sample (đều là leaf embed/đơn giản, rủi ro thấp khi build từ docs):
ArticleContent, CollectionDescription, DividerIcon, DividerSymbol, FBLikeButton2, FBPageBox2,
GMapBasicV2, Insta3, MediaListItem2, ProductDynamicCheckout, ProductVendor, QRCode, SoundCloud,
TwitterFeed2, Vimeo3.

## 10. Đối chiếu với pf-elements-json-knowledge

| | Shape "catalog" (page-json.md) | Shape file export .pagefly |
| --- | --- | --- |
| id | số | UUID string |
| CSS | `styleData` object ngay trên node | mảng `styles[]` riêng, link qua `id`, payload là JSON **string** |
| root | `items[0]` | node không bị tham chiếu (nằm cuối mảng trong sample) |
| slot khác | `data`/`options` giống nhau | thêm `roomId`, metadata Mongo |

`fields.md` (field từng element) và `nesting.md` (quy tắc lồng) áp dụng nguyên vẹn cho cả hai shape —
chúng mô tả `data` và quan hệ cha–con, phần không đổi giữa hai định dạng.
