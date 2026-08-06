# PageFly Design

An AI page-mockup generator. A merchant fills in a short brief — what they sell,
a visual style, a store type, a free-form prompt, reference images and which
pages they want — presses **Create pages**, and gets a browsable gallery of
visual mockups for every page requested, previewable at four screen sizes.

**Output is visual only.** No code, HTML, CSS or "view source" affordance is ever
shown to the merchant. This is a design-preview product, not a code-export tool.

---

## Run it

```sh
npm install
npm run dev          # http://localhost:3000  → redirects to /design
```

```sh
npm run build        # production build
npm run lint         # eslint (includes the React Compiler rules)
npx tsc --noEmit     # typecheck
```

Requires Node 20.9+. Next.js 16 (Turbopack), React 19, TypeScript, Tailwind v4,
Framer Motion, zustand, zod, lucide-react, html-to-image. No database, no auth,
no analytics, no paid API. Reference images stay client-side as object URLs and
are revoked on removal and on unmount.

### Sharing the dev server through a tunnel

Next.js 16 refuses cross-origin requests to dev-only assets. Reached through
ngrok or Cloudflare Tunnel the HTML returns 200 while every `/_next/static`
chunk returns **403** — so the page renders and looks perfectly normal, and
nothing on it responds, because React never hydrates. There is no error on
screen; it just goes dead.

Common tunnel domains are listed in `allowedDevOrigins` in `next.config.ts`. Add
your own hostname there if you use something else. It is development-only and
has no effect on `next build`.

### Test hooks

| URL | Effect |
|---|---|
| `/design?pfd-fail=2` | Forces the first two pages to fail, so the partial-failure notice and the scoped retry can be exercised. Mock-only. |

---

## How it is put together

```
app/
├── page.tsx                  → redirects to /design
├── design/page.tsx           → the feature
└── api/generate/route.ts     → POST endpoint, proxies to the mock generator today

components/
├── DesignApp.tsx             → .pfd-root wrapper, MotionConfig, screen switch
├── ProgressSteps.tsx         → Brief → Generate → Results breadcrumb
├── ui.tsx                    → app chrome primitives (Button, Panel, Chip, Stepper…)
├── brief/                    → one file per form section
├── generating/               → the wireframe→mockup morph
├── results/                  → gallery, cards, PNG export, card actions
├── preview/                  → the full-screen overlay + device chrome
└── mockup/
    ├── MockupPage.tsx        → block → component mapping (exhaustive switch)
    ├── MockupThumb.tsx       → a tall page cropped into a card
    ├── primitives.tsx        → Band, Display, Btn, MockImage…
    └── blocks/               → the 34 block components, grouped by family

lib/
├── generate/                 → THE GENERATION SEAM (see docs/generation-contract.md)
├── styleTokens.ts            → styleToTokens(): 15 styles × brand colors → design system
├── pageCatalog.ts            → 45 page types, 6 groups, caps
├── briefOptions.ts           → store types, chips, upload rules
├── validation.ts             → zod Brief schema
├── imageAnalysis.ts          → canvas: downscale + palette extraction (client only)
├── palette.ts                → pure colour merge, safe on the server
├── mockArt.ts                → drawn product silhouettes per vertical
├── refLayout.ts              → layout fingerprint → generation hints (pure)
├── pagefly/
│   ├── builder.ts            → PageFly node/zip builder (port of the skill's Python)
│   └── fromDom.ts            → rendered mockup DOM → .pagefly
├── store.ts                  → zustand: brief + results
└── png.ts                    → client-side capture helpers

styles/tokens.css             → THE BRAND. @theme tokens + .pfd-* helpers.
styles/reset.css              → scoped Preflight stand-in — MUST import in layer(base)
docs/generation-contract.md   → the app ↔ generator boundary
```

### Two things worth knowing before you edit

**1. The brand lives in exactly one file.** `styles/tokens.css` holds every
colour, radius, shadow and type size as Tailwind v4 `@theme` tokens. Nothing else
hardcodes a brand value. Re-skinning is a change to that file alone.

The token values were taken from the pagefly.io homepage reference. Three caveats
recorded honestly:

- The site returned HTTP 429 on every automated fetch, so values were read from
  the screenshot rather than sampled from its CSS. Structure (dark→light→dark
  banding, radial violet hero glow, translucent-bordered cards, violet pill
  CTAs) matched; exact hex values should be confirmed against the live CSS.
- The real typeface could not be confirmed. The fallback pairing is **Plus Jakarta
  Sans** (display) + **Inter** (body). To swap in PageFly's actual font, change
  the two `next/font` calls in `app/layout.tsx` — the `--pf-font-display` /
  `--pf-font-body` token names do not move.
- `--pf-success` is a best guess at the green in the "+29.3%" badge.

**2. Tailwind Preflight is deliberately not imported.** `app/globals.css` imports
`theme.css` and `utilities.css` but skips `preflight.css`, so this feature ships
no global reset and cannot disturb pagefly.io's stylesheet. The scoped equivalent
lives in `styles/reset.css`.

> **`reset.css` must be imported into `layer(base)`.** This is correctness, not
> taste. CSS ranks unlayered rules above every cascade layer, so an unlayered
> scoped reset beats the utilities layer: `border-width: 0` kills `border`,
> `button { padding: 0 }` kills `px-3.5`, `button { background: transparent }`
> kills `bg-pf-primary`, `h1 { font-size: inherit }` kills `text-pf-hero`, and
> `p { margin: 0 }` kills `mx-auto`. Symptoms are borderless unpadded chips,
> invisible buttons, an h1 smaller than its own body copy, and text that will
> not centre. Preflight sits in `base` for exactly this reason.

> The border rule inside that reset is load-bearing in the other direction.
> Without Preflight, Tailwind's `border` utility sets `border-width` but leaves
> `border-style` at its initial `none`, so card borders would be invisible even
> with the layering right. `.pfd-root *` restores `border-style: solid`.

---

## Embedding into pagefly.io

The feature is one component tree under one class. Nothing leaks out.

1. Copy `components/`, `lib/`, `styles/tokens.css` and `styles/reset.css`.
2. Import both once, wherever the host bundles CSS, and keep the layers:
   `@import "…/reset.css" layer(base);` then `@import "…/tokens.css";`.
   `tokens.css` declares only `@theme` tokens plus `.pfd-*` helper classes;
   `reset.css` holds the scoped element reset and must be in `base`.
3. Ensure Tailwind v4 is present and imported **without Preflight**, exactly as
   `app/globals.css` does it. If the host already imports plain
   `@import "tailwindcss"`, its Preflight applies globally; that is the host's
   choice, and this feature still renders correctly either way.
4. Render `<DesignApp />`. It provides its own `.pfd-root` wrapper, `MotionConfig`
   and background texture.
5. Load the two fonts (or swap them for PageFly's) so `--pf-font-display` and
   `--pf-font-body` resolve.
6. `app/layout.tsx` and `app/design/page.tsx` are the local dev harness and are
   **not** part of the embed. `layout.tsx` sets `body { margin: 0 }` inline
   precisely because a global reset was not allowed.

---

## Accounts, Library and admin

The merchant app is gated and now keeps its work. Five surfaces:

| Route | What it is |
|---|---|
| `/design/login` | store-domain entry, checked against the beta allowlist |
| `/design` | the brief → generate → results flow |
| `/design/library` | every deck this store has built, reopenable |
| `/design/admin` | Thống kê — animated counters and charts |
| `/design/admin/users` | the store table, and each store's pages |

### The storage decision: runs are briefs, not pages

A saved deck is **not** stored as pages. Generation is a pure function of the
brief — seeded PRNG only, with no `Math.random` and no `Date.now` anywhere under
`lib/generate`, which was verified rather than assumed. So a run stores the brief
plus each page's variant number, and reopening it replays the generator to get
the same deck back, byte for byte.

That makes a row a few hundred bytes instead of megabytes of markup, needs no
image hosting, and means the Library cannot drift from what the merchant
approved. `lib/runPayload.ts` holds the format.

Reference images travel as hints only (`palette`, `layout`). Their pixels never
reach a mockup — the artwork is drawn from scratch — so the object URL and the
downscaled copy are dropped.

> **Forward note.** Determinism is the whole mechanism. The day generation calls
> a model, a payload stops reproducing anything and a run has to carry its
> generated pages instead. `runs.snapshot` already exists in the schema for
> exactly that, so it is a reader change rather than a migration.

### Tables

`stores` (allowlist cache + observed sign-ins) · `runs` (brief payload, page
count, token spend) · `run_pages` (one row per page, so the Library and the quota
counter read from the same place) · `reviews` (one row per store, enforced by the
primary key).

Postgres in production; a file-backed driver takes over in development so a fresh
clone runs with no credentials. It is never selected in production — quietly
serving a per-instance in-memory store would look exactly like data loss. One
dev-only wrinkle: that driver reads its file once at startup, so editing
`.pfd-dev-db.json` by hand needs a restart.

### The allowlist

The sheet is private, and it contains merchant email addresses, so
publish-to-web is the wrong default. Three sources are supported —
service account, any CSV URL, or an n8n push to `/api/admin/sync` — and all three
land in the same mapper. Columns are matched by folded name rather than by
position, so inserting a column does not shift every field by one, and the
sheet's existing `Reivew` spelling is matched alongside the correct one.

A sign-in reads the database first and only falls back to pulling the sheet for a
domain it has never seen. Google being slow or unreachable therefore cannot lock
out a merchant who is already known.

### What sign-in is and is not

It asks for a store domain, so anyone who knows an allowlisted domain can get in.
That is the specified design and it is reasonable for a gated beta, but it is an
**allowlist, not authentication**, and should not be relied on as one.

Sessions are signed cookies (HMAC, constant-time compare, expiry checked
server-side as well as by the cookie). `SESSION_SECRET` is required in
production with no fallback — a hardcoded default in a public repository is a
forgeable admin cookie. `proxy.ts` (this version of Next renamed `middleware`)
only checks that a cookie *exists*, as a fast redirect; every route that acts on
a session verifies the signature itself.

### Page allowance

The counter in the top-left reads `pagesUsed/pageLimit` from the server on every
load, and again after every build. The limit comes from the sheet's `Số page`
cell (the `30` in `09/30`). Create re-reads the allowance on the click rather
than trusting the last render, so a second tab cannot spend it twice, and refuses
with the specified message when it is gone.

### Reviews

Five minutes after a build, once per store ever. The timer runs from the server's
record of the last build, so it survives a reload instead of restarting. Ratings
are written to the database **first** and forwarded to the n8n webhook second: a
webhook that is down, slow or not yet configured leaves the review saved with
`forwarded = false` for a later retry, rather than losing a merchant's rating.

Token spend is recorded per run and is genuinely `0` today — nothing calls a
model yet. The admin card says so rather than showing a bare zero that reads as
a broken counter.

## Card actions

Hovering a result card reveals two controls.

**Export** downloads that page as a `.pagefly` file — the import format for
PageFly's Flex editor (a zip holding one `1 - <name>.json`). Drop it into
PageFly → Pages → Import and the page opens in the editor.

The export does **not** re-implement the layout. The mockup renders with inline
styles exclusively — 250 `style={{…}}` across the block components, zero
classNames — so the rendered DOM already carries, on every element, the exact
CSS string that produced the picture. `lib/pagefly/fromDom.ts` walks that DOM and
copies `getAttribute("style")` verbatim into `styleData`. **The exported CSS is
the CSS that drew the mockup, not a translation of it**, so there is one layout
and nothing to drift. Drawn artwork (`MockImage` — gradients plus an inline SVG)
goes through as a single `Custom.HTML` node carrying its `outerHTML`, so imagery
is reproduced rather than approximated.

It reuses the same off-screen 1440px stage the PNG export already mounts.

**Import to editor** is deliberately inert: faded, padlocked, `aria-disabled`
rather than `disabled` (a disabled button stops firing pointer events in some
browsers, and the hover message is the entire point of the control right now).

### How closely the import matches the mockup

Everything expressible as CSS is carried over byte-for-byte: colours, padding,
gaps, border widths and radii, font sizes, weights, letter-spacing, flex
structure. Three things are **not** under the file's control, and an import will
differ from the mockup by exactly these:

| | Why |
|---|---|
| **Fonts** | Styles use generic families (`ui-serif`, `ui-rounded`, `"SF Pro Rounded"`). Those resolve to different real fonts per OS, and different metrics re-wrap text, which changes heights down the page. |
| **Host theme CSS** | A PageFly page renders inside a Shopify theme that injects its own base `font-size`, `line-height`, and margins. |
| **Container width** | `pf-container-2` is PageFly's container, not the mockup's 1180px content column. |

The export mitigates the last two with a page-level `customCSS` reset scoped to
`.pf-design-export` and an explicit max-width, but a **pixel-identical** result
cannot be promised across arbitrary themes and machines. Load the same fonts in
the theme to close most of the remaining gap.

**Export all** in the toolbar downloads one `.pagefly` per visible page in
sequence. **Import to editor all** is locked with the same tooltip as the
per-card control.

> Structure note: adding these buttons meant the card could no longer *be* a
> button. A button inside a button is invalid HTML — the browser hoists the inner
> one out of its parent and hydration breaks. The card root is now a `div`, with
> a separate absolutely-positioned button covering the thumbnail as the preview
> target and the actions row layered above it.

> Second structure note: the card root carries no `overflow-hidden`. It used to,
> so the mockup stayed inside the rounded corners — but it also clipped the
> tooltip, which has to reach above the card's top edge, leaving only the arrow
> tip visible. The clip now sits on the thumbnail wrapper, which is the only
> element that needs it, and the actions row is a sibling of that wrapper rather
> than a child. `hover:z-30` on the card keeps the escaped tooltip above its
> neighbours, and the tooltip flips below the button when the card is scrolled
> within 132px of the viewport top.

## Animation inventory

Every animation, and what a `prefers-reduced-motion: reduce` user gets instead.

`MotionConfig reducedMotion="user"` in `DesignApp.tsx` is what actually enforces
this — Framer Motion animates with JS, so the `@media (prefers-reduced-motion)`
block in `tokens.css` covers only CSS transitions and cannot reach it. With that
config, Framer drops transform, layout and scale animation and keeps opacity.
Components owning a looping or long-running animation additionally check
`useReducedMotion()` and are noted below.

| # | Animation | Where | Reduced-motion fallback |
|---|---|---|---|
| 1 | Screen change: fade + 12px rise, exiting screen blurs out | `BriefScreen`, `GeneratingScreen`, `ResultsScreen` | Opacity cross-fade only; no movement or blur |
| 2 | Stepper pill slides between Brief / Generate / Results | `ProgressSteps` (`layoutId`) | Pill jumps to the active step |
| 3 | Style card tap: spring scale to 0.975 | `StylePicker` | No scale; the press still registers |
| 4 | Style card check badge: spring scale-in | `StylePicker` (`layoutId`) | Badge appears instantly |
| 5 | Colour chip add/remove: spring scale + layout reflow | `PromptField` | Chip appears/disappears instantly; list reflows without animation |
| 6 | Upload icon lifts 3px while dragging | `ImageUpload` | Static icon; the border colour still changes on drag |
| 7 | Thumbnail entrance: staggered spring, 35ms apart | `ImageUpload` | All thumbnails appear at once |
| 8 | Group expand/collapse: height + opacity | `PagePicker` | Content shows/hides instantly |
| 9 | Chevron rotates 90° on collapse | `PagePicker` | Rotation applied without transition |
| 10 | Cap warning slides down | `PagePicker` | Appears in place |
| 11 | Sticky bar morphs into the generating state | `StickyBar` (`layoutId`) | Cross-fade, no morph |
| 12 | **Signature: wireframe draw-in.** Rects scale from `scaleX: 0`, staggered 40ms top-to-bottom, following the page's real block recipe | `WireframeMorph` | Wireframe renders complete and static — gated on `useReducedMotion()` |
| 13 | **Signature: violet shimmer sweep**, looping, on the card being built | `WireframeMorph` | Not rendered at all |
| 14 | **Signature: wireframe → mockup cross-dissolve**, opacity + 1.02→1 scale | `WireframeMorph` | Straight opacity swap, no scale |
| 15 | Placeholder cards spring in, staggered 45ms (capped at 600ms total) | `GeneratingScreen` | All cards appear together |
| 16 | Progress bar width eases to the new percentage | `GeneratingScreen` | Width jumps |
| 17 | Status spinner rotates continuously | `GeneratingScreen` | Static icon; the text still updates and is `aria-live` |
| 18 | **Result card hover: the tall page auto-scrolls inside the card** over 7.5s | `ResultCard` | Duration 0 — the scroll still happens, instantly, so the affordance is not lost |
| 19 | Result card hover lift, −4px spring | `ResultCard` | No lift; border and shadow still respond |
| 20 | Scroll-position rail fades in while scrubbing | `ResultCard` | Opacity is preserved, so this still works |
| 21 | Card grid on filter change: opacity only | `ResultsScreen` | Same — nothing to reduce |
| 22 | Preview opens with a 96%→100% spring | `PreviewOverlay` | Fades in with no scale |
| 23 | Overlay backdrop fade + blur | `PreviewOverlay` | Instant |
| 24 | **Device switch: the frame springs from the previous device's size ratio to 1** while the mockup lays out at its true new width | `PreviewOverlay` | Frame appears at the new size instantly; the re-layout is real either way |
| 25 | Device selector pill slides between the four sizes | `PreviewOverlay` (`layoutId`) | Pill jumps |
| 26 | Shortcut hint springs up from the bottom | `PreviewOverlay` | Appears in place |
| 27 | Radial violet hero glow | `tokens.css` `.pfd-glow` | Unchanged — it is a static gradient, it never moved |

Not animated on purpose: the countdown block renders fixed digits. A mockup must
not imply a running timer.

**Removed after testing:** the results grid and its items originally carried
Framer `layout` props, and the card used a shared `layoutId` with the preview
frame. Three nested projection trees fought each other — every card rendered at a
different scale with its label at the wrong size. CSS grid now sizes the cells and
no layout animation wraps the mockup subtree. The device-switch spring was
rebuilt without `layout` for the same reason.

---

## Accessibility and responsive floor

- Works down to 360px. Every grid collapses; the sticky bar wraps; the preview
  toolbar wraps to two rows and hides its labels below `lg`.
- Visible focus everywhere via `.pfd-root :focus-visible` — never removed, only
  restyled.
- The style picker is a real `radiogroup`; page rows are real `checkbox`es; the
  preview is a labelled `role="dialog"` with `aria-modal`.
- Result cards respond to keyboard focus exactly as they do to hover, so the
  auto-scroll is reachable without a mouse.
- Preview shortcuts: `Esc` close · `←` `→` page · `1`–`4` device · `+` `−` zoom ·
  `0` fit · `?` toggle the hint.
- The sticky bar names the single next missing field and scrolls to it, rather
  than dumping a validation summary.

---

## Verified

Checked, not assumed:

- 9-page brief with duplicates → 9 distinct mockups. `3 × BFCM` produce three
  different headlines and hero layouts; `2 × Product` differ in name, price,
  compare-at, review count and colourways.
- Determinism: two identical requests → byte-identical payload across all 9
  pages. Bumping `variant` 0→3 on one page → four visibly different versions
  (headline and layout both change, not just product names).
- Caps: exactly 30 pages accepted and generated; 40 rejected with 422.
- Validation: empty selection, unknown style and malformed hex each rejected 422
  with a usable message.
- No `lorem` / `ipsum` / placeholder strings anywhere in generated output.
- Cascade layers: the scoped reset compiles inside `@layer base`, which Tailwind
  emits before `@layer utilities`, so utilities win. Checked against the built
  CSS, not assumed.
- Vertical detection drives the drawn imagery: ceramics → `home`, running shoes →
  `footwear`, skincare → `beauty`, coffee → `food`, each with its own silhouette
  pool.
- Reference colours change the output: with none, a Minimal page keeps its own
  `#111114` accent; add references whose palette leads with `#2f5d50` and the
  accent becomes `#2f5d50`; add an explicit `#6b2ff7` swatch on top and the
  swatch wins. Verified through the API on all three.
- Reference **structure** changes the output. Same brief, three references:

  | reference | hero | grid | feature | density | blocks | bands |
  |---|---|---|---|---|---|---|
  | none | fullBleed¹ | 4 | 3 | airy | 9 | `LLDLDLDAD` |
  | tall dark hero, 4-up grid, hard alternation, dense | fullBleed | 4 | 4 | tight | 7 | `LDLDLDL` |
  | small text opener, 2-up, airy, 4 sections | centered | 2 | — | airy | 5 | `LLDLD` |

  ¹ from the fallback rotation, not from a reference.
- Uploaded images are **never** used as product imagery. Product and lifestyle
  shots are always drawn. An early version pasted the upload into every slot and
  produced eight copies of the same screenshot.
- No UI file imports `lib/generate/mock.ts` — the seam holds.
- Selection logic: 15 assertions over the store — store type, visual style, page
  toggle, stepper clamping, 30-cap, colour add/dedupe/reject — all pass.
- Tunnel access: with `allowedDevOrigins` set, JS chunks return 200 for ngrok and
  Cloudflare hosts and still 403 for an unlisted one, so the protection holds.
- `.pagefly` export: all **45** page types and all **15** styles build without
  error (6,881 nodes total). Verified by rendering each mockup with
  `react-dom/server`, walking the result in jsdom, and unzipping the output —
  schema keys all present, single `Body` root, `Layout` present, per-item
  `styles` all `[]`, every style entry points at a real item, and every
  `styles` field is a valid JSON string.
- Fidelity spot-check on a Luxury Home page: the exported CSS contains the
  page's own `bg`, `surfaceAlt`, `ink` and `accent` values verbatim, plus its
  uppercase-heading and serif rules.
- `npm run build`, `npx tsc --noEmit` and `npx eslint .` all clean.

Not verified: the mockups have not been eyeballed in a browser during this
session (the Chrome extension was not connected), and the brand tokens could not
be sampled from live CSS — see the caveats above. Both are worth ten minutes
before this goes near production.
