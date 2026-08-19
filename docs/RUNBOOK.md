# Runbook — làm tại local branch, chưa push

Sáu phase. Mỗi phase có **checkpoint**: chưa qua thì đừng sang phase sau.
Phase 0–2 an toàn, revert bằng một lệnh git. Phase 4 là chỗ không quay đầu được,
nên phase 3 phải xong trước.

```bash
git checkout -b design-v2
```

---

## Phase 0 · Đo baseline (làm trước tiên, không bỏ qua)

Không có số "trước" thì mọi thứ sau này chỉ là cảm giác.

**Prompt cho Claude Code:**

> Viết `scripts/baseline.ts`. Nó đọc mọi design tree đã lưu trong DB (bảng runs
> hoặc pages — tự tìm trong `lib/db/`), và với mỗi page tính:
> số padding khác nhau giữa các section · số fontSize khác nhau trên page ·
> % section có `textAlign:center` · page có chứa node `accordion` không ·
> page có ít nhất một section nền tối không · số section không bị giới hạn
> container · số aspect ratio ảnh khác nhau · số section · số node.
> In ra bảng tổng hợp: trung vị, min, max, và % page đạt từng ngưỡng.
> Chỉ đọc, không ghi gì vào DB.

```bash
npx tsx scripts/baseline.ts > baseline-v1.txt
```

**Checkpoint:** có file `baseline-v1.txt` với ≥100 page. Commit nó vào branch —
đây là bằng chứng, không phải file tạm.

---

## Phase 1 · Thay bộ skill (an toàn, chạy được ngay)

```bash
git rm skills/design-rulebook.md skills/animation-mechanics.md \
       skills/pagefly-template-builder.md skills/rulebook2.md \
       skills/selling-page.md

cp ~/Downloads/skills-v2/00-contract.md    skills/
cp ~/Downloads/skills-v2/10-composition.md skills/
cp ~/Downloads/skills-v2/50-copy.md        skills/
cp ~/Downloads/skills-v2/README.md         skills/

# 3 file sliced để trong thư mục con — readdirSync chỉ đọc tầng 1 nên loader
# hiện tại KHÔNG nhìn thấy chúng. Đây là chốt an toàn cho tới phase 2.
mkdir -p skills/_sliced
cp ~/Downloads/skills-v2/20-patterns.md  skills/_sliced/
cp ~/Downloads/skills-v2/30-verticals.md skills/_sliced/
cp ~/Downloads/skills-v2/40-motion.md    skills/_sliced/

cp ~/Downloads/skills-v2/SPEC-rebuild.md .
```

> ⚠️ **Đừng để 3 file sliced ở `skills/` tầng 1 lúc này.** Front matter của
> chúng ghi `scope: slice`; `skills.ts` hiện chỉ hiểu `copy|design|export` nên
> sẽ coi là `all` và **gửi nguyên 12.400 token cho mọi call**. Prompt loãng hơn
> cả v1.

```bash
npm run dev
curl -s localhost:3000/api/health | jq .skills
# phải trả về đúng: ["00-contract","10-composition","50-copy"]
```

**Checkpoint:** build thử 1 page bất kỳ. Nó sẽ **chưa đẹp hơn** — chưa có
pattern và vertical. Nhưng phải:
- không lỗi
- không còn stat strip `92% / 88% / 4.8` (nó nằm trong `selling-page.md` vừa xoá)
- không còn bắt buộc trust row ngay dưới hero

Nếu vẫn thấy đúng bộ xương cũ → skill chưa nạp, kiểm lại `PFD_SKILLS_DIR`.

---

## Phase 2 · `sliceSkill` + chip thành vertical slug

**Prompt cho Claude Code:**

> Đọc `SPEC-rebuild.md`, làm §1 và §8.1. Chỉ hai mục đó.
>
> §1 — trong `lib/ai/skills.ts`: bỏ scope `export`, thêm scope `slice`. File
> `scope: slice` không bao giờ được `loadSkills()` trả về. Thêm
> `sliceSkill(file, ids[])` đọc từ `skills/_sliced/`, trả về chỉ các block giữa
> `<!--#id-->` và `<!--/-->`, theo đúng thứ tự ids truyền vào. Id không tồn tại
> thì bỏ qua và log một lần. Kết quả rỗng trả về chuỗi rỗng, tuyệt đối không
> trả cả file.
>
> §8.1 — mỗi chip trong `SELL_EXAMPLES` phải có slug khớp id trong
> `skills/_sliced/30-verticals.md`. Đổi `SELL_EXAMPLES` thành mảng
> `{label, slug}`. `brief.whatYouSell` lưu label (merchant vẫn gõ tự do được),
> thêm `brief.verticalSlug` lưu slug khi merchant bấm chip. Không đụng
> `detectVertical` — nó vẫn dùng cho free text.
>
> Viết test: `sliceSkill("verticals",["personal-care-devices"])` trả về đúng một
> block chứa chữ `spec-grid-4x2`; `sliceSkill("patterns",["khong-ton-tai"])`
> trả về chuỗi rỗng.

Sau khi Claude Code xong, tự kiểm bằng tay:

```bash
npx tsx -e "import{sliceSkill}from'./lib/ai/skills';\
console.log(sliceSkill('verticals',['footwear']))"
```

**Checkpoint:** in ra đúng 5 dòng của `footwear`, không phải cả file.

Kiểm mapping chip — đây là bug cụ thể nhất trong v1:

```bash
# phải ra footwear, KHÔNG phải general
# và Team sports & racket phải ra team-sports, KHÔNG phải food
```

---

## Phase 3 · Import thử 5 node mới — **việc bạn tự làm tay**

Đây là rủi ro lớn nhất của cả kế hoạch. Làm trước phase 4.

Tôi đã dựng sẵn `node-probe.pagefly`. Trong đó có 5 section, mỗi cái ghi rõ
trên màn hình nó test cái gì và thế nào là pass.

1. PageFly → Pages → **Import** → `node-probe.pagefly`
2. **Publish** (custom JS không chạy trong editor canvas — marquee và counter
   chỉ thấy trên live page)
3. Mở trang live, chấm 5 dòng:

| # | node | PASS nghĩa là | nếu FAIL |
| --- | --- | --- | --- |
| 1 | `overlay` | chữ trắng nằm **trên** ảnh, có gradient tối từ trái | phải dựng bằng `Custom.HTML` — báo tôi để sửa `toPagefly` trong spec |
| 2 | `sticky` | thanh giá dính đáy màn hình khi cuộn | bỏ `isStickyBar`, dùng `custom` với `position:fixed` |
| 3 | `beforeAfter` | có tay kéo tròn, kéo được, hai ảnh đổi nhau | dùng `custom` + `input[type=range]` |
| 4 | `marquee` | chữ chạy phải→trái, dừng khi hover | giảm xuống marquee CSS thuần, bỏ nhân đôi track bằng JS |
| 5 | `counter` | số chạy từ 0 khi cuộn tới | bỏ hiệu ứng, để số tĩnh |

Kiểm thêm 2 việc quan trọng ở section 1:

- Mở editor, xem PageFly nhận ảnh nền từ **`data.src`** hay từ **CSS
  `backgroundImage`** — tôi cố tình đặt cả hai. Cái nào ăn thì `toPagefly` dùng
  cái đó.
- Sửa thử ảnh nền ngay trong editor. Nếu sửa được → merchant tự đổi được, tốt.
  Nếu không → phải đi đường `data.src`.

**Checkpoint:** ghi lại pass/fail của 5 dòng. Gửi tôi kết quả, tôi cập nhật
`SPEC-rebuild.md §3` và `§4` cho khớp thực tế trước khi bạn viết `plan.ts`.

---

## Phase 4 · `plan.ts` + `audit.ts` — làm cùng nhau, không tách

Đây là phần trái tim. Hai file phải lên cùng ngày: một order mà model được phép
phớt lờ thì tệ hơn không có order.

**Prompt cho Claude Code, phần 1:**

> Đọc `SPEC-rebuild.md` §2. Tạo `lib/design/plan.ts` đúng như mô tả:
> type `Order`, hàm `planPage(brief, pageType, seed)`.
> Vertical lấy từ `brief.verticalSlug` khi có, free text mới fallback sang
> `detectVertical`. Arc theo bảng §2.3. Pattern chọn theo seed
> `sha256(domain|pageType|style)` từ danh sách ứng viên của role, đã loại các id
> trong `ban` của vertical. Padding và dark gán sao cho thoả: ≥3 padding khác
> nhau, ≥1 dark, không 2 dark liền nhau, signature nhận `statement`.
>
> Giữ nguyên bảng đếm section trong `sectionPlan.ts`, chỉ bỏ lời gọi
> `detectVertical` trong đó.
>
> Viết test §2.4: `planPage()` với brief rỗng, chạy đủ 66 vertical × 8 page type
> — không lần nào được throw, không lần nào ra order thiếu signature, và mọi
> pattern id trả về phải tồn tại trong `30-verticals.md`/`20-patterns.md`.

**Checkpoint 4a:** test 528 tổ hợp xanh. In thử order của 3 store khác nhau cùng
vertical `skincare` — phải khác nhau ≥40% số slot. Nếu giống hệt thì seed chưa
ăn.

**Prompt cho Claude Code, phần 2:**

> Đọc `SPEC-rebuild.md` §5. Tạo `lib/design/audit.ts` với `audit(tree, order)`
> trả về mảng chuỗi lỗi, mỗi lỗi một dòng model đọc và sửa được.
> Nối vào `designServer.ts`: sau khi tree qua zod, chạy `audit()`. Nếu có lỗi,
> gọi lại model **đúng một lần** với cùng system prompt, tree cũ, và danh sách
> lỗi. Không lặp lần hai. Log số lỗi lần đầu vào run record.

**Checkpoint 4b:** build 3 page. Đọc log `audit()`. Lỗi lặp lại nhiều nhất chỉ
đúng câu nào trong `skills/` mà model không hành động được — sửa câu đó, đừng
sửa code.

**Prompt cho Claude Code, phần 3 — nối prompt:**

> `SPEC-rebuild.md` §7. Trong `designServer.ts` ghép system prompt mới:
> `00-contract` + `10-composition` + `sliceSkill('patterns', order.patternIds)`
> + `sliceSkill('verticals',[order.vertical])` + `sliceSkill('motion', order.motionIds)`.
> User message thêm khối THE ORDER, mỗi section một dòng theo format trong §7.
> Xoá khỏi prompt mọi câu yêu cầu model cân nhắc — tìm và bỏ
> "vary it only with reason", "when unsure, add space", "asymmetry beats symmetry".
> Chưa hạ `maxTokens`.

---

## Phase 5 · Style read của ảnh mẫu

**Prompt cho Claude Code:**

> `SPEC-rebuild.md` §6. Trong `refVision.ts` giữ nguyên section list, thêm khối
> STYLE 8 field. Một call Haiku cho cả build. `heroKind` truyền vào `planPage`
> để override slot hero; 7 field còn lại vào user message dạng facts.

**Checkpoint:** upload lại đúng ảnh Avvoo, build home. Hero phải ra
`hero-full-bleed-scrim` (vì reference là full-bleed), không phải split.

---

## Phase 6 · Đo lại rồi mới push

```bash
# build 20 page mới, đủ nhiều vertical
npx tsx scripts/baseline.ts > baseline-v2.txt
diff <(cat baseline-v1.txt) <(cat baseline-v2.txt)
```

| chỉ số | ngưỡng qua |
| --- | --- |
| ≥3 padding khác nhau | 95% page |
| ≥5 fontSize khác nhau | 95% page |
| page có accordion | **≤55%** — phải là lựa chọn, không phải thói quen |
| page có ≥1 dark band | ≥90% |
| page có ≥2 section full-bleed | ≥90% |
| 2 store cùng vertical trùng slot | ≤60% |
| output token / page | ≤12.000 (v1: ~20.400) |

Chưa qua ngưỡng thì đừng push — quay lại phase 4b, sửa câu chữ trong `skills/`.

```bash
git push -u origin design-v2
```

---

## Nếu phải quay đầu

| phase | lệnh |
| --- | --- |
| 0–2 | `git checkout main -- skills/ lib/ai/skills.ts lib/briefOptions.ts` |
| 4 | đặt `USE_PLAN=false` trong env, `designServer` rơi về prompt cũ — nhớ bảo Claude Code cài cờ này ngay từ đầu phase 4 |
| bất kỳ | `git checkout main` — chưa push nên không ảnh hưởng ai |

---

## Ba điều dễ sai nhất

1. **Thả file sliced vào `skills/` tầng 1 ở phase 1.** Token gấp ba, chất lượng
   giảm, và triệu chứng trông giống "skill mới dở" chứ không giống lỗi cấu hình.
2. **Làm `plan.ts` mà chưa làm `audit.ts`.** Model nhận order rồi làm khác, bạn
   không có cách nào biết.
3. **Hạ `maxTokens` sớm.** Comment trong `designServer.ts` đã ghi lại bài học
   này rồi: trần thấp chỉ khiến page fail nhiều hơn, và một page fail tốn cả
   trần mà không trả về gì. Chỉ hạ sau ba build sạch liên tiếp.
