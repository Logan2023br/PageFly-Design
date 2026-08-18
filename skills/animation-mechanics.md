---
scope: export
name: animation-mechanics
version: 1.0
---

<!--
  scope: export means NO model receives this file whole, and that is deliberate.

  It is 18,000 tokens. Sent with every page it would quadruple the prompt, and
  DeepSeek bills its own reasoning against the same ceiling as its answer — more
  to weigh is more thinking, which is exactly what pushed a build past 32,000
  tokens and returned truncated JSON.

  Instead `lib/design/animationPicker.ts` reads this file and sends the handful
  of patterns that suit the page being built. Edit freely: add a pattern, delete
  one, replace the file. The picker matches on the `### name` headings, so
  nothing here needs to know the picker exists.
-->

# Web Animation Pattern Reference

Every entry: what starts it, what actually moves, and the values that make it
read correctly. Written to be implemented from, not admired.

---

## 1. SCROLL-TRIGGERED REVEAL

Fires once when an element crosses into the viewport. Detection is an
IntersectionObserver with `threshold: 0.15` and `rootMargin: "0px 0px -10% 0px"`
so the element is meaningfully on screen before it starts. Observer disconnects
after firing — re-animating on every scroll pass is a defect, not a feature.

### `fade-in`
**Trigger:** element enters viewport.
**Mechanism:** `opacity` transitions 0 → 1. Nothing else moves.
**Values:** 400–600ms, `ease-out`. No delay on the first element of a section.
**Note:** the weakest of the family; use only when movement would be distracting, e.g. behind text the reader is already looking at.

### `fade-up`
**Trigger:** element enters viewport.
**Mechanism:** `opacity` 0 → 1 and `transform: translateY(24px)` → `translateY(0)` run together. The upward drift implies the content is arriving from below, matching the direction the reader is scrolling.
**Values:** distance 20–40px, duration 500–700ms, `cubic-bezier(0.16, 1, 0.3, 1)`. Distance above 60px reads as flying in and looks dated.
**Note:** the default reveal. If only one reveal is used on a page, it is this one.

### `fade-in-left`
**Trigger:** element enters viewport.
**Mechanism:** `opacity` 0 → 1 with `translateX(-32px)` → 0.
**Values:** 500–700ms, `ease-out`.
**Note:** direction must match layout logic — use on content that sits on the left half. Alternating left/right on consecutive rows for no reason is a common misuse.

### `fade-in-right`
**Trigger:** element enters viewport.
**Mechanism:** mirror of the above, `translateX(32px)` → 0.
**Values:** identical timing to its left counterpart so a mirrored pair feels symmetrical.

### `scale-in`
**Trigger:** element enters viewport.
**Mechanism:** `transform: scale(0.94)` → `scale(1)` with `opacity` 0 → 1. The element appears to settle forward into place.
**Values:** start scale 0.92–0.96, 450–650ms, `ease-out`. Below 0.9 it reads as popping and cheapens the surface.
**Note:** works on media and cards, not on body text — scaling type causes visible reflow blur mid-transition.

### `blur-in`
**Trigger:** element enters viewport.
**Mechanism:** `filter: blur(8px)` → `blur(0)` alongside `opacity` 0 → 1, often with a small `scale(1.02)` → 1 so the blur feels like a camera focusing.
**Values:** blur 6–12px, 600–800ms, `ease-out`.
**Note:** expensive to composite. Limit to one or two hero elements; a page of blur-in reveals stutters on mid-range phones.

### `stagger-reveal`
**Trigger:** parent container enters viewport.
**Mechanism:** each child runs its own reveal (usually `fade-up`), each delayed by an increasing offset. The delay is computed from the child's index: `delay = index * step`. The eye is led across the group in reading order rather than being hit with all of it at once.
**Values:** step 60–120ms. Cap total stagger at ~600ms — for a 12-item grid, either reduce the step or stagger by row instead of by item, or the last item arrives long after the reader has moved on.
**Note:** stagger direction should follow reading order. Staggering a 4-column grid item-by-item produces a diagonal sweep, which is usually the intended effect; staggering right-to-left fights the reader.

### `clip-reveal`
**Trigger:** element enters viewport.
**Mechanism:** `clip-path: inset(0 100% 0 0)` → `inset(0 0 0 0)`, wiping the element open from one edge. The element itself never moves or fades — it is uncovered.
**Values:** 600–900ms, `cubic-bezier(0.77, 0, 0.175, 1)`. Slower than a fade because the eye tracks the moving edge.
**Note:** the wipe direction should match the language direction and the section's alignment. Works especially well on full-bleed images and on headline lines.

### `mask-reveal`
**Trigger:** element enters viewport.
**Mechanism:** an SVG or CSS mask shape animates from a small or offset position to covering the whole element, so the image appears through a growing aperture — a circle expanding, a diagonal band sweeping, a brand shape opening.
**Values:** 700–1000ms, `ease-out`.
**Note:** the mask shape carries brand meaning. An arbitrary shape reads as an effect; a shape drawn from the logo or product silhouette reads as design.

### `curtain-reveal`
**Trigger:** element enters viewport.
**Mechanism:** a solid coloured panel sits over the content and translates away — `translateY(0)` → `translateY(-100%)` or horizontally — exposing what is underneath. Two-panel variants split from the centre outward.
**Values:** 700–900ms, `cubic-bezier(0.77, 0, 0.175, 1)`. The panel colour is the accent or a neutral from the palette, never black by default.
**Note:** the content beneath must already be laid out and visible in the DOM; the panel hides it visually, so a JS failure leaves content readable.

### `line-draw`
**Trigger:** SVG enters viewport.
**Mechanism:** the path's `stroke-dasharray` is set to its total length and `stroke-dashoffset` animates from that length to 0, so the stroke appears to be drawn by an invisible pen.
**Values:** duration proportional to path length, roughly 1ms per 2px, clamped 800–2000ms. `ease-in-out`.
**Note:** requires `getTotalLength()` at runtime. Multi-path illustrations chain with a stagger so lines draw in a plausible order.

### `counter-up`
**Trigger:** the number enters viewport.
**Mechanism:** a `requestAnimationFrame` loop interpolates from 0 (or a floor value) to the target, writing the rounded value into the element each frame. Easing is applied to the interpolation, not to CSS, so the count decelerates as it lands.
**Values:** 1200–2000ms, ease-out interpolation. Preserve the unit and any formatting — thousands separators, currency, decimals — on every frame, not just the last, or the layout jumps as digits are added.
**Note:** reserve the final width with `font-variant-numeric: tabular-nums` and a min-width, otherwise the surrounding layout shifts throughout the count. Only ever animate a real measured figure.

### `progress-bar-fill`
**Trigger:** bar enters viewport.
**Mechanism:** the inner fill element's `width` or `transform: scaleX()` animates from 0 to the target percentage. `scaleX` with `transform-origin: left` is preferred because it composites on the GPU.
**Values:** 800–1400ms, `ease-out`. Pair with a `counter-up` on the adjacent label so number and bar land together.

### `flip-in`
**Trigger:** element enters viewport.
**Mechanism:** `perspective` is set on the parent; the child animates `rotateX(-20deg)` → `rotateX(0)` (or `rotateY`) with opacity, so it appears to swing into the picture plane.
**Values:** perspective 800–1200px, start angle 15–25deg, 500–700ms, `ease-out`.
**Note:** angles above 45deg cross into novelty and break text legibility mid-animation.

---

## 2. SCROLL-DRIVEN

Progress is bound to scroll position rather than fired once — scrolling back
runs the animation backwards. Implemented natively with CSS `animation-timeline:
view()` / `scroll()`, or with a scroll handler reading progress and writing a
CSS variable. All scroll reads must be batched in a single
`requestAnimationFrame` loop; per-element scroll listeners cause layout thrash.

### `parallax-background`
**Trigger:** continuous, while the section is in view.
**Mechanism:** the background layer translates vertically at a fraction of the scroll delta, so it lags behind the foreground and reads as further away.
**Values:** speed factor 0.2–0.35 of scroll distance. Higher factors smear text placed over the image and cause visible edge gaps unless the background is oversized by at least the total travel distance.
**Note:** requires the background element be taller than its container by the travel amount, or the top or bottom edge exposes mid-scroll.

### `parallax-layers`
**Trigger:** continuous.
**Mechanism:** three or more layers each translate at a different fraction — background slowest, midground medium, foreground at or slightly above scroll speed. The differential creates depth without any 3D transform.
**Values:** e.g. 0.15 / 0.35 / 0.6. Keep ratios distinct enough to be perceived; 0.3 and 0.35 read as one layer.

### `parallax-depth-of-field`
**Trigger:** continuous.
**Mechanism:** extends `parallax-layers` by also animating `filter: blur()` per layer as a function of its depth, and often `scale`. Layers further from the focal plane blur more, mimicking a camera lens.
**Values:** blur 0px on the focal layer, 2–6px on the furthest. Blur is expensive — restrict to two or three layers and give each `will-change: filter`.

### `sticky-scroll-section`
**Trigger:** section top reaches viewport top.
**Mechanism:** the section is `position: sticky; top: 0` inside a taller wrapper. The page continues to scroll through the wrapper's extra height while the section stays fixed; that scroll distance drives an internal animation. When the wrapper's end is reached the section unpins and normal scrolling resumes.
**Values:** wrapper height = `100vh × (number of internal states)`. Three states means a 300vh wrapper.
**Note:** the pinned region must be genuinely worth the height it steals. Pinning for a single fade wastes two screens of scrolling.

### `scrollytelling`
**Trigger:** each narrative step crosses a trigger line.
**Mechanism:** a pinned visual on one side (chart, map, product) responds to a column of text steps scrolling past on the other. Each step's entry sets the visual to a corresponding state; leaving in reverse restores the previous state.
**Values:** trigger line at 50% viewport height. Steps at least 80vh apart so states do not fire in quick succession.
**Note:** every state must be reachable and correct when entered from either direction. Building only forward transitions is the standard failure.

### `horizontal-scroll-section`
**Trigger:** section pins at viewport top.
**Mechanism:** a `sticky-scroll-section` whose internal animation is `transform: translateX()` on a wide track. Vertical scroll distance maps linearly to horizontal travel, so the page scrolls sideways without hijacking the scrollbar.
**Values:** wrapper height ≈ track width, so 1px of vertical scroll produces 1px of horizontal movement.
**Note:** provide real horizontal touch/drag on mobile as well; mapping vertical scroll to horizontal movement on a phone feels broken.

### `scroll-scrub-video`
**Trigger:** continuous while in view.
**Mechanism:** scroll progress sets `video.currentTime` directly, or indexes into a pre-extracted image sequence drawn to a canvas. The sequence approach is far more reliable — browsers do not seek video smoothly enough for frame-accurate scrubbing.
**Values:** 60–150 frames for a full-viewport sequence. Preload all frames before enabling the effect; a partially loaded sequence stutters.
**Note:** heavy. Budget several MB. Provide a static poster and skip the effect entirely on slow connections.

### `scroll-progress-bar`
**Trigger:** any scroll.
**Mechanism:** a fixed 2–4px bar at the viewport top with `transform: scaleX()` set to `scrollTop / (scrollHeight - innerHeight)`.
**Values:** no transition on the transform — it should track the scroll exactly; easing makes it lag and feel broken.

### `image-sequence-spin`
**Trigger:** continuous while in view.
**Mechanism:** `scroll-scrub-video` applied to a turntable photography sequence, so the product rotates as the reader scrolls.
**Values:** 36–72 frames for one revolution. Loop seamlessly so the first and last frame match.

### `sticky-image-swap`
**Trigger:** each text block crosses the trigger line.
**Mechanism:** the media column is `position: sticky` and stays in place; text blocks scroll past beside it. Each block's entry cross-fades the sticky media to its paired image.
**Values:** cross-fade 300–400ms. Stack both images and animate opacity rather than swapping `src`, which flashes.
**Note:** on mobile this must collapse to alternating image/text pairs — a sticky image with text scrolling under it does not work in a single column.

### `pin-and-reveal`
**Trigger:** section pins.
**Mechanism:** a `sticky-scroll-section` whose internal states each reveal one more list item, so a set of points accumulates on screen as the reader scrolls.
**Values:** one viewport height of scroll per item.

### `scroll-driven-colour-shift`
**Trigger:** continuous.
**Mechanism:** the page or section background interpolates between palette colours as a function of overall scroll progress, usually by writing an interpolated value into a CSS custom property each frame.
**Values:** interpolate in OKLCH or LAB, not sRGB — sRGB interpolation passes through muddy greys between saturated colours.
**Note:** text colour must be re-derived at each step or contrast fails somewhere in the middle of the transition.

### `smooth-scroll`
**Trigger:** any scroll input.
**Mechanism:** native scrolling is intercepted; a virtual scroll position is eased toward the real one each frame (`current += (target - current) * lerp`) and the content is translated to match.
**Values:** lerp factor 0.075–0.12. Lower is smoother but introduces perceptible lag.
**Note:** breaks anchor links, scroll restoration, `position: fixed`, and accessibility tooling unless each is explicitly re-implemented. High cost, mostly aesthetic benefit.

### `scroll-snap`
**Trigger:** scroll ends near a boundary.
**Mechanism:** pure CSS — `scroll-snap-type: y mandatory` on the container, `scroll-snap-align: start` on children. The browser settles the viewport to the nearest boundary.
**Values:** use `proximity` rather than `mandatory` when sections vary in height; `mandatory` traps readers on sections taller than the viewport.

### `zoom-on-scroll`
**Trigger:** continuous while in view.
**Mechanism:** hero media `transform: scale()` interpolates from 1 to about 1.15 as the section scrolls past, inside `overflow: hidden`.
**Values:** end scale 1.1–1.2. Set `transform-origin` to the image's subject, not the default centre, or the composition drifts off-frame.

---

## 3. HOVER & MICRO-INTERACTION

Pointer-driven, so all of these must have a defined non-hover equivalent for
touch and keyboard. Apply only to elements that are actually interactive —
hover motion on a heading or a paragraph is a bug.

### `hover-lift`
**Trigger:** pointer enters.
**Mechanism:** `transform: translateY(-2px)` with a shadow that grows slightly, implying the element rose toward the reader.
**Values:** 2–4px, 150–200ms, `ease-out`. Exit transition should be equal or slightly slower.

### `hover-grow`
**Trigger:** pointer enters.
**Mechanism:** `transform: scale(1.02–1.04)`.
**Values:** 180–250ms, `ease-out`. Above 1.05 the element crowds its neighbours and the grid looks unstable.
**Note:** on cards inside a grid, scale the inner content and keep the outer cell fixed, otherwise neighbours reflow.

### `hover-shadow`
**Trigger:** pointer enters.
**Mechanism:** `box-shadow` blur and spread increase without any movement.
**Values:** 200ms. On dark backgrounds shadow is nearly invisible — use a border or glow instead.

### `hover-glow`
**Trigger:** pointer enters.
**Mechanism:** a coloured `box-shadow` with large blur and no offset, in the accent colour, so the element appears backlit.
**Values:** blur 20–40px, accent at 25–45% alpha, 200ms.
**Note:** only legible on dark surfaces. On light backgrounds it reads as a rendering fault.

### `hover-image-swap`
**Trigger:** pointer enters a product card.
**Mechanism:** two images stacked in the same box; the second is `opacity: 0` and cross-fades to 1 on hover.
**Values:** 250–350ms. Both images must be preloaded or the first hover shows a blank frame.
**Note:** every product in the grid needs a genuine second image. Falling back to repeating the first image makes the interaction look broken.

### `image-zoom-on-hover`
**Trigger:** pointer enters the frame.
**Mechanism:** the image scales inside a fixed `overflow: hidden` frame, so the crop tightens without the frame changing size.
**Values:** scale 1.05–1.08, 400–600ms, `ease-out`. Deliberately slower than button hovers — it reads as a camera push, not a click response.

### `magnifier`
**Trigger:** pointer moves over a product image.
**Mechanism:** a lens region follows the cursor and displays a high-resolution version of the image, positioned so the point under the cursor maps to the centre of the lens. Either an inset lens or a panel beside the image.
**Values:** 2–3× magnification. Requires a source image at least 2× the displayed size or the zoom shows compression artefacts.

### `underline-slide`
**Trigger:** pointer enters a link.
**Mechanism:** a pseudo-element bar at the baseline animates `transform: scaleX(0)` → `scaleX(1)` with `transform-origin: left`. On exit, origin flips to right so it retracts the way it came.
**Values:** 250ms, `ease-out`.

### `text-swap-hover`
**Trigger:** pointer enters.
**Mechanism:** two copies of the label are stacked in a clipped box; on hover both translate vertically by 100%, so the first exits upward as the second enters from below.
**Values:** 250–350ms, `cubic-bezier(0.65, 0, 0.35, 1)`. Both copies must be identical width or the button resizes mid-swap.

### `magnetic-button`
**Trigger:** pointer within a proximity radius, before entering.
**Mechanism:** the button translates a fraction of the vector between its centre and the cursor, so it appears attracted. On leave it springs back to origin.
**Values:** radius 60–100px, pull factor 0.2–0.35, spring return ~400ms.
**Note:** offsets the true click target from the visual one. Keep pull small enough that the button never moves more than about a third of its own width.

### `cursor-follower`
**Trigger:** any pointer movement.
**Mechanism:** the native cursor is hidden or kept, and a fixed element is eased toward the pointer position each frame. State changes — growing over links, showing a label over media — are driven by hover handlers on targets.
**Values:** lerp 0.15–0.2.
**Note:** must be disabled entirely on touch. If the native cursor is hidden, any JS failure leaves the reader with no pointer at all.

### `spotlight-hover`
**Trigger:** pointer moves within a card.
**Mechanism:** pointer coordinates are written to CSS custom properties on the card; a `radial-gradient` background positioned at those coordinates creates a light that follows the cursor.
**Values:** radius 200–400px, highlight at 6–12% white on dark surfaces.
**Note:** update the properties inside a `requestAnimationFrame`, not directly in the mousemove handler.

### `tilt-3d`
**Trigger:** pointer moves within the element.
**Mechanism:** cursor position relative to the element's centre maps to `rotateX` and `rotateY` under a `perspective`, so the card leans toward the pointer. Often paired with a gloss layer that shifts with the tilt.
**Values:** perspective 800–1000px, max rotation 6–12deg, 100–200ms transition to smooth jitter.
**Note:** blurs text on some renderers at higher angles. Return to rest on pointer leave with a slightly longer duration.

### `ripple`
**Trigger:** click or tap.
**Mechanism:** a circle is inserted at the exact click coordinates inside the element and animates scale outward while fading, then is removed.
**Values:** scale to cover the element's diagonal, 500–600ms, `ease-out`. Element needs `overflow: hidden` and `position: relative`.

### `icon-morph`
**Trigger:** state change — menu opened, item toggled.
**Mechanism:** either two SVG paths cross-fading with rotation, or a single path whose `d` attribute is interpolated between two shapes with the same node count.
**Values:** 250–350ms. Path interpolation requires equal point counts in both shapes; otherwise use transforms on separate strokes (the hamburger-to-X pattern rotates two bars and hides a third).

### `border-draw`
**Trigger:** pointer enters.
**Mechanism:** an SVG rect overlay with `stroke-dasharray` equal to its perimeter animates `stroke-dashoffset` to 0, tracing the border. CSS-only variants animate two or four pseudo-element edges in sequence.
**Values:** 400–600ms, `ease-out`.

### `shine-sweep`
**Trigger:** pointer enters.
**Mechanism:** a narrow skewed white gradient band translates across the element from one edge to the other, under `overflow: hidden`.
**Values:** band 20–30% of element width, skew about −20deg, 600–800ms, peak alpha 15–25%.
**Note:** at high opacity this reads as a cheap advert. Keep it barely perceptible.

### `colour-fill-sweep`
**Trigger:** pointer enters.
**Mechanism:** a pseudo-element background scales or translates in from one edge to fill the button; the label sits above it and may switch colour at the midpoint.
**Values:** 300–400ms, `cubic-bezier(0.65, 0, 0.35, 1)`. Exit should retract from the opposite edge, not simply reverse, so repeated hovers feel directional.
**Note:** the label colour must stay legible against both the start and end backgrounds throughout, not only at the endpoints.

---

## 4. CAROUSEL / SLIDER

Track-based components. Everything below moves a track by transform, exposes
navigation, and must handle keyboard, touch, and reduced-motion.

### `slideshow`
**Trigger:** navigation control, or a timer.
**Mechanism:** one slide occupies the full viewport width; the track translates by exactly one slide width per step, or slides cross-fade in place.
**Values:** 400–600ms slide transition; autoplay interval no less than 5s.
**Note:** if slides contain sentences, autoplay must be off — moving text away mid-read is the single most-complained-about carousel behaviour.

### `carousel-peek`
**Trigger:** navigation, drag, or swipe.
**Mechanism:** slide width is set so a fractional slide is visible at the track edge — `slidesToShow: 3.2` shows three full slides and 20% of the fourth. The partial slide is the affordance that tells the reader more content exists.
**Values:** peek fraction 0.15–0.35. Mobile 1.1–1.25.
**Note:** a carousel showing exactly N slides with no peek is indistinguishable from a static grid, and readers do not discover the remaining items.

### `marquee`
**Trigger:** none — runs continuously on load.
**Mechanism:** the content is duplicated at least once and the track translates by exactly the width of one copy, then resets instantly. Because the second copy is identical and now sits where the first was, the reset is invisible and the loop appears endless.
**Values:** 20–60s per cycle depending on width; `linear` timing only — any easing makes the loop visibly pulse.
**Note:** duplicate enough copies to overflow the viewport at all breakpoints, or a gap appears on wide screens. Pause on hover when items are links.

### `marquee-on-scroll`
**Trigger:** page scroll.
**Mechanism:** a `marquee` whose translate offset is additionally driven by scroll delta, and whose direction flips with scroll direction. Scroll velocity is often mapped to a temporary speed boost that eases back to base speed.
**Values:** base speed as marquee; scroll contribution 0.3–0.8px per px scrolled; boost decay 400–800ms.

### `logo-marquee`
**Trigger:** continuous.
**Mechanism:** a `marquee` carrying partner or press logos, normally rendered greyscale at reduced opacity, returning to full colour on hover.
**Values:** logos normalised to equal *optical* height rather than equal box height — a wide wordmark and a square badge at the same box height look mismatched.

### `coverflow`
**Trigger:** navigation or drag.
**Mechanism:** each slide's distance from centre maps to `scale`, `rotateY`, `opacity`, and `z-index`, so side slides recede and angle inward while the centre slide is flat and full size.
**Values:** perspective 1000–1500px, side rotation 25–45deg, side scale 0.8–0.9.
**Note:** halves the usable area of side slides. Suitable for images, not for cards containing text.

### `stacked-card-slider`
**Trigger:** navigation, drag, or scroll.
**Mechanism:** slides are absolutely stacked with small progressive `translateY` and `scale` offsets so the pile is visible. Advancing animates the top card away — up, or off to one side with rotation — while the cards below shift forward one step.
**Values:** step offset 8–16px, step scale 0.04, exit 400–600ms.

### `drag-slider`
**Trigger:** pointer or touch drag.
**Mechanism:** pointer delta translates the track 1:1 during the drag. On release, remaining velocity is applied and decays each frame until it stops or snaps to the nearest slide. Dragging past either end applies a resistance factor so the track rubber-bands.
**Values:** friction 0.92–0.95 per frame; edge resistance 0.3–0.5.
**Note:** the drag threshold must be tuned so vertical page scroll still works when the gesture starts inside the track.

### `thumbnail-sync-gallery`
**Trigger:** thumbnail click, or main image navigation.
**Mechanism:** two linked tracks. Selecting a thumbnail moves the main track to that index; moving the main track updates the active thumbnail and scrolls the thumbnail strip to keep it in view.
**Values:** main transition 300–400ms; thumbnail active state marked by border or opacity, not by size change, which shifts the strip.

### `autoplay-progress-dots`
**Trigger:** autoplay timer.
**Mechanism:** the active dot contains a fill that animates from 0 to 100% width over exactly the autoplay interval, so the reader can see when the next slide is due. Interaction resets the fill and usually cancels autoplay entirely.
**Values:** fill duration equals interval, `linear`.

### `vertical-carousel`
**Trigger:** navigation, wheel, or vertical drag.
**Mechanism:** identical to a horizontal track but translating on Y.
**Note:** competes directly with page scroll. Only viable inside a pinned section or a fixed-height panel where page scroll is already suspended.

### `testimonial-rotator`
**Trigger:** timer or navigation.
**Mechanism:** quotes cross-fade in place rather than sliding, because quotes vary in length and sliding highlights the height difference.
**Values:** 400ms cross-fade, 6–8s interval. Set the container to the tallest quote's height, or the surrounding layout jumps on every change.

---

## 5. MEDIA & IMAGE

### `before-after-slider`
**Trigger:** drag on the handle, or pointer move across the frame.
**Mechanism:** two images are stacked in a fixed frame at identical size. The top image's `clip-path: inset(0 X% 0 0)` is driven by the handle position, so moving the handle reveals more or less of the underlying image. A vertical divider line and grab handle sit at that position.
**Values:** handle starts at 50%. Keyboard arrows must move it in 5% steps; without that the component is inaccessible.
**Note:** the two photographs must share crop, distance, lighting, and white balance. A mismatched pair reads as dishonest and is worse than showing no comparison.

### `before-after-fade`
**Trigger:** pointer enters the frame.
**Mechanism:** the "after" image cross-fades over the "before" on hover.
**Values:** 400–600ms.
**Note:** no touch equivalent — provide a tap-to-toggle fallback on mobile.

### `video-background`
**Trigger:** autoplay on load.
**Mechanism:** a muted, looping, inline video is object-fit-covered behind content, with a scrim overlay so text above it stays legible.
**Values:** scrim 25–45% depending on footage. Always supply a `poster` frame, `preload="none"` or lazy loading, and a static image fallback.
**Note:** must be muted to autoplay at all. Keep the file under a few MB and under 10s; a long clip is bandwidth spent on something nobody watches twice.

### `video-on-hover`
**Trigger:** pointer enters.
**Mechanism:** a still is displayed by default; on hover a short muted loop begins playing in the same box, cross-fading over the still.
**Values:** load the video only on first hover, not on page load.

### `lightbox`
**Trigger:** click on a thumbnail.
**Mechanism:** an overlay covers the viewport with the full-size image centred; next and previous controls step through the set. Focus moves into the overlay and is trapped there; Escape closes and returns focus to the originating thumbnail.
**Values:** overlay fade 200–300ms, image scale-in from 0.96.
**Note:** body scroll must be locked while open, and the scroll position restored on close.

### `masonry-load-in`
**Trigger:** grid enters viewport, or new items load.
**Mechanism:** items are positioned into a masonry layout, then revealed with a `stagger-reveal`. When items are added or filtered, existing items animate to new positions using the FLIP technique — measure first position, apply the new layout, invert with a transform, then play the transform to zero.
**Values:** stagger 40–80ms, reposition 400–500ms.

### `image-comparison-grid`
**Trigger:** hover or scroll.
**Mechanism:** two or three images share one interaction state so they change together, letting the reader compare the same variable across multiple examples.
**Values:** all panels transition simultaneously with identical timing; any offset destroys the comparison.

### `ken-burns`
**Trigger:** element in view.
**Mechanism:** a slow simultaneous `scale` and `translate` over a still image inside `overflow: hidden`, giving a static photograph the feeling of a moving camera.
**Values:** scale 1 → 1.08 over 8–20s, `linear` or a very gentle ease. Movement must be slow enough to be felt but not watched.
**Note:** set `transform-origin` toward the subject so the push moves into the photo rather than away from it.

### `lazy-blur-up`
**Trigger:** image load.
**Mechanism:** a tiny placeholder — an inline base64 image of about 20px wide, or a solid dominant colour — is displayed scaled up and blurred. When the full image finishes decoding it cross-fades over the placeholder and the blur is removed.
**Values:** placeholder blur 10–20px, cross-fade 300–400ms.
**Note:** the placeholder must occupy the final aspect ratio so no layout shift occurs on swap.

### `sprite-360-viewer`
**Trigger:** horizontal drag.
**Mechanism:** a sequence of turntable frames; drag distance maps to frame index, wrapping at both ends so rotation is continuous.
**Values:** 36–72 frames, roughly 8–15px of drag per frame. Preload the full set before enabling drag.

### `hotspot-image`
**Trigger:** click or hover on a marker.
**Mechanism:** markers are absolutely positioned in percentage coordinates over the image so they stay correct at all sizes. Activating one opens a callout with a title and short text, anchored to the marker and flipped to stay inside the frame near edges.
**Values:** markers pulse subtly on load to be noticed, then stop after two cycles.

### `image-trail`
**Trigger:** pointer movement across a section.
**Mechanism:** as the pointer travels beyond a distance threshold, the next image from a set is placed at that position, scaled in, then fades and scales out after a short life. Several remain visible at once, forming a trail.
**Values:** distance threshold 100–150px, image life 600–1000ms, maximum 6–10 concurrent.

### `duotone-hover`
**Trigger:** pointer enters.
**Mechanism:** the image is displayed under an SVG duotone filter or a blended colour layer; on hover the filter is removed or the blend layer fades out, restoring full colour.
**Values:** 400–500ms.

---

## 6. TEXT & TYPOGRAPHY

Every pattern here must leave the original text in the accessibility tree. Split
text into wrapper spans at runtime and mark the decorative structure
`aria-hidden`, keeping an intact copy for screen readers.

### `split-text-reveal`
**Trigger:** element enters viewport.
**Mechanism:** the text is split into per-word or per-character spans; each animates with a small `fade-up` on a stagger.
**Values:** per-word stagger 25–50ms, per-character 12–25ms. Per-character is only appropriate for short display headings — on a paragraph it takes far too long and reads as a gimmick.

### `line-mask-reveal`
**Trigger:** element enters viewport.
**Mechanism:** text is split into visual lines, each wrapped in an `overflow: hidden` container. Each line's inner span translates from `translateY(100%)` to 0, so lines rise out from behind their own edge.
**Values:** per-line stagger 80–120ms, 600–800ms each, `cubic-bezier(0.16, 1, 0.3, 1)`.
**Note:** line splitting must be recalculated on resize, because line breaks change with width.

### `typewriter`
**Trigger:** element enters viewport.
**Mechanism:** characters are appended one at a time on an interval, usually with a blinking caret element after the text.
**Values:** 30–60ms per character, with slight randomisation to avoid a mechanical rhythm; caret blink 500–600ms.
**Note:** reserve the final height in advance, or the block grows line by line and pushes the page down as it types.

### `word-rotator`
**Trigger:** timer.
**Mechanism:** one word in a sentence cycles through a list. The word sits in a clipped container; the outgoing word translates up and out while the incoming one enters from below. The container width animates to the new word's width so surrounding text does not jump.
**Values:** 2–3s per word, 300–400ms transition, width transition matched to the same duration.

### `kinetic-typography`
**Trigger:** scroll, or continuous.
**Mechanism:** oversized type is the subject rather than a label — it may translate horizontally as a marquee, scale with scroll, rotate, or have words move independently. Frequently combined with `clip-reveal` and mix-blend modes over imagery.
**Values:** type large enough to bleed past the viewport edge; movement slow and continuous rather than reactive.

### `variable-font-morph`
**Trigger:** hover, scroll, or continuously.
**Mechanism:** `font-variation-settings` axes — weight, width, optical size, or custom axes — are interpolated, so letterforms change shape without any layout swap.
**Values:** transition 300–600ms. Width axis changes reflow the line; weight changes mostly do not.
**Note:** requires an actual variable font file. Faux-bolding a static font produces no animation.

### `gradient-text-sweep`
**Trigger:** continuous, or on hover.
**Mechanism:** a linear gradient background is clipped to the text with `background-clip: text` and `color: transparent`; the `background-position` animates so the gradient travels across the letterforms.
**Values:** background sized 200–300% of the text width, 2–4s cycle, `linear`.
**Note:** transparent text can defeat contrast checks and some high-contrast modes. Keep the gradient's darkest stop above the contrast threshold.

### `text-scramble`
**Trigger:** element enters viewport, or hover.
**Mechanism:** each character position first cycles through random glyphs, then resolves to its true character; resolution progresses left to right so the word appears to decode.
**Values:** 40–60ms per scramble frame, each character resolving after 8–20 frames offset by index.
**Note:** use a monospace font or fixed-width container, otherwise the text width jitters while scrambling.

### `highlight-sweep`
**Trigger:** phrase enters viewport.
**Mechanism:** a pseudo-element behind the phrase animates `scaleX(0)` → `scaleX(1)` from the left, imitating a marker stroke. Often given a slight rotation and irregular edges to look hand-drawn.
**Values:** 500–700ms, `ease-out`, highlight sits at roughly 60% of the line height and is vertically offset toward the baseline.

### `outline-to-fill`
**Trigger:** scroll progress across the element.
**Mechanism:** text is rendered with `-webkit-text-stroke` and transparent fill; a filled duplicate is layered above it and revealed by an animated `clip-path` or `background-clip` mask tied to scroll.
**Values:** stroke 1–2px; fill progresses with scroll rather than on a timer.

---

## 7. NAVIGATION & LAYOUT

### `sticky-header-shrink`
**Trigger:** `scrollY` crosses a threshold.
**Mechanism:** a class is toggled on the header; CSS transitions reduce height, padding, and logo scale, and usually add a background and hairline border that were absent at the top of the page.
**Values:** threshold 40–80px, transition 200–300ms. Apply hysteresis — expand only below a lower threshold than the one that collapsed it — or the header flickers when the reader hovers around the boundary.

### `hide-on-scroll-down`
**Trigger:** scroll direction change.
**Mechanism:** scrolling down past a minimum distance translates the header out by its own height; any upward scroll brings it back immediately.
**Values:** minimum distance 8–12px to ignore trackpad jitter; transition 250–300ms. Always show the header when `scrollY` is near 0.

### `sticky-atc-bar`
**Trigger:** the hero section leaves the viewport.
**Mechanism:** a fixed bar containing product name, price, and one primary action animates in from the bottom or top edge. It is absent on first paint and appears only after the reader has scrolled past the main buy area.
**Values:** slide 250–350ms. Bar height 56–72px; add its height to the page's bottom padding so it never covers the footer.
**Note:** one action only. A sticky bar with three buttons defeats its purpose.

### `mega-menu-reveal`
**Trigger:** hover or focus on a top-level item, with a short intent delay.
**Mechanism:** a full-width panel animates open — height or clip-path, plus a fade — and its columns stagger in. Closing needs an exit delay so a diagonal mouse path toward the panel does not dismiss it.
**Values:** open delay 100–150ms, close delay 200–300ms, panel 250–350ms, column stagger 40ms.
**Note:** must also open on keyboard focus and close on Escape.

### `off-canvas-drawer`
**Trigger:** button click.
**Mechanism:** a panel translates in from an edge while a scrim fades in behind it. Body scroll is locked, focus moves into the drawer and is trapped; Escape or a scrim click closes it and returns focus to the trigger.
**Values:** panel 300–350ms `ease-out`, scrim 200ms. Panel width 380–440px desktop, 85–90vw mobile.

### `fullscreen-overlay-menu`
**Trigger:** menu button.
**Mechanism:** an overlay covers the viewport, usually with a `clip-path` or curtain reveal, then menu items stagger in. The trigger icon morphs to a close icon.
**Values:** overlay 400–500ms, item stagger 60–80ms.

### `accordion`
**Trigger:** header click.
**Mechanism:** the panel animates between collapsed and expanded height. `grid-template-rows: 0fr → 1fr` on a wrapper transitions correctly to auto height in modern browsers; the older approach measures `scrollHeight` and animates `max-height` to that exact value.
**Values:** 300–400ms, `ease-out`. Chevron rotates 180deg over the same duration.
**Note:** `max-height` set to an arbitrary large value produces a delay before short panels appear to move — the transition spends time covering height that does not exist.

### `tabs-with-slide-indicator`
**Trigger:** tab selection.
**Mechanism:** the active tab's position and width are measured and written to CSS custom properties; a single indicator element transitions `translateX` and `width` to those values, so it slides between tabs rather than reappearing.
**Values:** 250–350ms, `cubic-bezier(0.65, 0, 0.35, 1)`. Re-measure on resize and on font load.

### `scroll-spy-nav`
**Trigger:** section boundaries crossing a line.
**Mechanism:** IntersectionObservers on each section update which nav item carries the active state; the indicator then moves as in `tabs-with-slide-indicator`.
**Values:** `rootMargin: "-45% 0px -45% 0px"` so the active section is the one crossing the viewport middle rather than merely visible.

### `back-to-top-fab`
**Trigger:** `scrollY` exceeds roughly one viewport height.
**Mechanism:** a fixed button fades and scales in; clicking scrolls to top with `behavior: smooth`.
**Values:** 200ms fade with `scale(0.9)` → 1.
**Note:** must not overlap a sticky ATC bar — offset it above.

### `bento-grid-hover`
**Trigger:** pointer enters a cell.
**Mechanism:** the hovered cell scales or expands slightly while siblings dim, focusing attention without changing the grid's overall geometry.
**Values:** cell scale 1.02, sibling opacity to 0.6, 250–300ms.
**Note:** expand via transform, not by changing grid spans — changing spans reflows the entire grid and every other cell jumps.

### `filter-morph-grid`
**Trigger:** filter or sort change.
**Mechanism:** the FLIP technique. Record every item's current bounding box, apply the new filtered layout, immediately transform each item back to its old position, then animate all transforms to zero in one frame. Removed items fade and scale out; new items fade in after the reposition completes.
**Values:** reposition 400–500ms, `ease-out`; exit 200ms before the move, entry 200ms after.

---

## 8. BACKGROUND & AMBIENT

Runs without user input, so it must be cheap and must never compete with
content. All of these need a `prefers-reduced-motion` off-switch.

### `animated-gradient`
**Trigger:** continuous.
**Mechanism:** a large linear or conic gradient with `background-size` at 300–400% animates its `background-position` on an infinite loop, so colours drift through the element.
**Values:** 8–20s cycle, `ease-in-out`, `alternate` direction so there is no jump at the loop point.

### `aurora-blur`
**Trigger:** continuous.
**Mechanism:** several large radial-gradient blobs in different palette colours are absolutely positioned, given a heavy `filter: blur(80–140px)`, and slowly translated and scaled on offset loops. Overlaps produce shifting colour fields.
**Values:** 3–5 blobs, 15–30s cycles at different durations so the pattern never visibly repeats.
**Note:** expensive to composite. Give each blob `will-change: transform` and never animate the blur radius itself.

### `particle-field`
**Trigger:** continuous, often cursor-reactive.
**Mechanism:** points are drawn to a canvas each frame with small velocities and wrapped at edges. Nearby points may be connected with lines whose opacity falls off with distance; the cursor acts as an attractor or repulsor.
**Values:** 40–120 particles at desktop, far fewer on mobile. Connection radius 100–150px.

### `noise-grain-overlay`
**Trigger:** continuous.
**Mechanism:** a tiled noise texture — an SVG `feTurbulence` or a small PNG — is overlaid at low opacity, and its `background-position` is stepped between a few positions so the grain flickers like film.
**Values:** opacity 3–8%, step every 100–150ms between 4–8 positions. Must be `pointer-events: none`.

### `blob-morph`
**Trigger:** continuous.
**Mechanism:** an SVG path's `d` attribute is interpolated between several organic shapes that share the same node count, producing continuous deformation.
**Values:** 6–10s per morph step, `ease-in-out`, looping through 3–5 shapes.

### `wave-divider-animation`
**Trigger:** continuous.
**Mechanism:** two or three SVG wave paths of differing amplitude are layered at a section boundary and translated horizontally at different speeds, each looping by exactly one wavelength so the motion is seamless.
**Values:** 10–25s per cycle, `linear`.
**Note:** listed again as `animated-wave-divider` in category 13, alongside the static divider shapes it is normally chosen from.

### `spotlight-follow`
**Trigger:** pointer movement anywhere on the page.
**Mechanism:** a fixed radial gradient centred on pointer coordinates, written through CSS custom properties, lightening whatever sits beneath it.
**Values:** radius 300–600px, 4–10% white on dark backgrounds, lerped rather than snapped to the cursor.

### `liquid-distortion`
**Trigger:** pointer movement, or continuous.
**Mechanism:** the image is rendered as a WebGL texture; a fragment shader offsets UV coordinates using a displacement map driven by time and pointer position, warping the image like a liquid surface.
**Values:** displacement strength kept low — heavy warping obscures the product.
**Note:** requires a WebGL context and a shader pipeline. Always provide a plain `<img>` fallback.

### `glassmorphism-blur`
**Trigger:** static, but the effect only reads when content moves behind it.
**Mechanism:** `backdrop-filter: blur()` with a translucent background and a light hairline border, over scrolling content.
**Values:** blur 12–24px, background 6–14% white, border 10–20% white.
**Note:** one of the most expensive properties on the page. Never apply to a large area that is also being transformed.

### `starfield-parallax`
**Trigger:** scroll.
**Mechanism:** several layers of small dots translate at different fractions of scroll — the `parallax-layers` mechanism applied to point fields rather than images.
**Values:** 3 layers at 0.1 / 0.25 / 0.5, with smaller and dimmer dots on the slowest layer.

---

## 9. FEEDBACK & STATE

Confirms that the system received an action and is doing something. Timing here
is about perceived responsiveness, not decoration.

### `skeleton-loader`
**Trigger:** data request starts.
**Mechanism:** grey blocks matching the final content's shape and position occupy the space until real content arrives, then are replaced.
**Values:** show only if loading exceeds ~200ms — for faster responses the skeleton flashes and feels worse than nothing.
**Note:** the skeleton must match the real layout's dimensions. A mismatch produces a visible jump at swap, which is the exact problem the skeleton exists to prevent.

### `shimmer`
**Trigger:** while a skeleton is displayed.
**Mechanism:** a diagonal light gradient translates repeatedly across the skeleton blocks, signalling activity rather than a frozen interface.
**Values:** 1.2–2s per sweep, `linear`, band 30–40% of block width.

### `spinner`
**Trigger:** indeterminate wait.
**Mechanism:** an element or SVG arc rotates continuously; SVG variants also animate `stroke-dasharray` so the arc's length pulses.
**Values:** 600–1000ms per rotation, `linear`. Delay appearance by 150–300ms so quick responses never show it.

### `toast`
**Trigger:** an action completes.
**Mechanism:** a small panel slides and fades in from a screen edge, waits, then leaves the same way. Multiple toasts stack with offset; new ones push older ones along.
**Values:** enter 200–300ms, hold 3–5s, exit 200ms. Hovering pauses the dismissal timer.
**Note:** announce via an `aria-live` region, or the message is invisible to screen readers.

### `add-to-cart-fly`
**Trigger:** add-to-cart click.
**Mechanism:** a clone of the product image is positioned over the original, then animated along a curved path — typically a Bézier or a two-stage transform — to the cart icon while shrinking and fading. On arrival the clone is removed and the cart badge bumps.
**Values:** 600–800ms, `ease-in-out`. Clone must be `position: fixed` and `pointer-events: none`.
**Note:** the actual cart update must not wait for the animation. Visual and state are independent.

### `cart-badge-bump`
**Trigger:** cart count changes.
**Mechanism:** the badge scales up and back — 1 → 1.3 → 1 — often with a brief colour flash, drawing the eye to a change that happens far from where the reader clicked.
**Values:** 300–400ms, spring or `ease-out` with overshoot.

### `success-checkmark-draw`
**Trigger:** successful completion.
**Mechanism:** an SVG circle draws via `stroke-dashoffset`, then the tick path draws after it. Two sequential `line-draw` animations.
**Values:** circle 400ms, tick 250ms starting at 300ms. Total under 800ms — success confirmation should not delay the next step.

### `shake-on-error`
**Trigger:** validation failure.
**Mechanism:** a short horizontal keyframe oscillation — for example `translateX` through 0, −8, 8, −5, 5, 0 — usually with the border switching to the error colour.
**Values:** 400–500ms total.
**Note:** never the only error signal. Pair with text and `aria-invalid`.

### `inline-validation`
**Trigger:** field blur, or typing after a first failed submit.
**Mechanism:** border colour and a status icon transition as validity changes; the message expands beneath the field with a height transition rather than appearing instantly, so the layout shift is smooth.
**Values:** 200ms colour, 250ms message expand.
**Note:** validating on every keystroke from the first character marks a field invalid before the reader has finished typing it.

### `confetti`
**Trigger:** a genuine milestone — order placed, goal reached.
**Mechanism:** many small elements are spawned at an origin with randomised velocity, rotation, and colour, then updated each frame under gravity and drag until they leave the viewport or their life expires.
**Values:** 60–150 pieces, 2–3s life. Canvas rather than DOM nodes above about 50 pieces.
**Note:** once per session at most, and only for events the reader actually considers a win.

### `button-loading-state`
**Trigger:** submit.
**Mechanism:** the button's width is locked to its current value, the label fades out and a spinner fades in, and the button becomes disabled — which also blocks double submission.
**Values:** 150–200ms swap. Locking the width first is what stops the button collapsing to the spinner's size.

### `optimistic-ui`
**Trigger:** an action whose success is highly likely.
**Mechanism:** the interface updates immediately as if the request succeeded, in a subtly provisional state. On confirmation the provisional styling is removed; on failure the change is reverted with a brief error animation and a toast.
**Values:** provisional state at 70–85% opacity. Revert must be visible enough that the reader notices their action did not take effect.

---

## 10. 3D & WEBGL

### `3d-model-viewer`
**Trigger:** drag to orbit, scroll or pinch to zoom.
**Mechanism:** a GLTF/GLB model is loaded into a WebGL scene with lighting and an environment map. Drag maps to orbital camera rotation with damping; the model may auto-rotate slowly until first interaction, which signals that it is interactive.
**Values:** damping 0.05–0.1, auto-rotate 0.5–2 deg/s. Models under 2–3MB with compressed textures.
**Note:** show a poster image until the model is ready, and fall back to it entirely where WebGL is unavailable.

### `ar-quick-look`
**Trigger:** button tap on a mobile device.
**Mechanism:** hands the model to the operating system's AR viewer — USDZ for iOS Quick Look, GLB with Scene Viewer on Android — which places it in the camera view at real-world scale.
**Note:** the model must be scaled in real units or the product appears the wrong size in the room. The button should be hidden on unsupported devices, not shown and broken.

### `webgl-shader-hero`
**Trigger:** continuous, often pointer-reactive.
**Mechanism:** a full-viewport WebGL canvas runs a fragment shader per pixel per frame, generating gradients, noise fields, or fluid simulations driven by time and pointer uniforms.
**Values:** render at a reduced resolution and upscale on low-power devices; cap the frame rate when the tab is not visible.
**Note:** a real GPU cost on every frame the page is open. Must degrade to a static gradient.

### `scroll-driven-3d-camera`
**Trigger:** page scroll.
**Mechanism:** scroll progress drives a camera along a predefined path through a 3D scene, with lookAt targets and lighting keyed to scroll milestones.
**Values:** camera position interpolated with damping so the movement stays smooth even when the scroll input is coarse.
**Note:** the heaviest pattern in common use. Requires an asset budget and a real fallback path, not an afterthought.

### `physics-cards`
**Trigger:** load, drag, or pointer proximity.
**Mechanism:** a 2D physics engine gives each element a body with mass, restitution, and friction; the engine steps each frame and the resulting positions and rotations are written back as transforms. Elements collide, stack, and settle.
**Values:** fixed timestep 1/60s; sleep bodies once they settle to stop burning CPU.
**Note:** unpredictable final positions. Never use for content that must be read in a specific order.

### `cloth-simulation`
**Trigger:** pointer movement, or continuous.
**Mechanism:** a mesh of mass points connected by distance constraints is integrated each frame under gravity and pointer force, then rendered in WebGL with the fabric texture applied.
**Values:** grid 20×20 to 40×40; several constraint-solver iterations per frame for stability.

### `css-3d-cube`
**Trigger:** hover, click, or timer.
**Mechanism:** six faces are positioned with `translateZ` and `rotate` under `transform-style: preserve-3d` on a parent with `perspective`. Rotating the parent turns the whole solid.
**Values:** perspective 800–1200px, rotation 600–800ms `ease-in-out`.
**Note:** no WebGL required, and text on the faces stays selectable and readable.

---

## 11. COMMERCE-SPECIFIC

### `variant-swatch-swap`
**Trigger:** colour or option selection.
**Mechanism:** selecting a variant cross-fades the main product media to that variant's image set and updates price, availability, and the gallery thumbnails together, in one state change.
**Values:** 250–350ms cross-fade. Preload the first image of every variant so the first selection is instant.
**Note:** media, price, and stock must update in the same frame. Staggered updates let the reader see a mismatched combination.

### `size-guide-drawer`
**Trigger:** "size guide" link.
**Mechanism:** an `off-canvas-drawer` or modal containing the measurement table and a diagram showing where each measurement is taken.
**Note:** must not lose the reader's variant selection when it closes.

### `bundle-builder`
**Trigger:** any option toggle.
**Mechanism:** each selection recalculates the running total; the price element animates with a `counter-up` between the old and new figure rather than swapping instantly, and any savings line updates alongside it.
**Values:** counter 300–500ms. Always animate between the two real values, never from zero.

### `quantity-price-tier`
**Trigger:** quantity crosses a break point.
**Mechanism:** the newly active tier row highlights — background and border transition to the accent — while the previously active one returns to rest, and the unit price animates to the new figure.
**Values:** 300ms highlight. A brief pulse on the tier that just activated draws attention to the change.

### `free-shipping-progress`
**Trigger:** cart total changes.
**Mechanism:** a bar fills toward the threshold and a label states the remaining amount. On reaching the threshold the bar completes, the label switches to a success message, and a small celebration cue may fire.
**Values:** fill 400–600ms `ease-out`, label cross-fade 200ms.

### `countdown-timer`
**Trigger:** page load.
**Mechanism:** the remaining interval is recalculated from a fixed end timestamp each second and the digits are updated; changing digits often flip or slide rather than swapping.
**Values:** update once per second. Digits in tabular figures with fixed width so the layout never shifts.
**Note:** the deadline must be real and server-derived. A timer that resets on refresh damages trust more than the urgency gains.

### `stock-urgency-pulse`
**Trigger:** stock below a threshold.
**Mechanism:** the indicator's opacity or scale oscillates gently on a slow loop, or pulses two or three times then stops.
**Values:** 1.5–2s per cycle, subtle amplitude. Limit to a few cycles rather than looping forever.
**Note:** only from a real inventory figure.

### `recently-bought-toast`
**Trigger:** timed intervals after page load.
**Mechanism:** a small panel slides in from a corner showing a recent order — product, location, and elapsed time — then dismisses itself.
**Values:** first after 15–30s, then every 30–60s, maximum 3–5 per session.
**Note:** must be sourced from real orders. Fabricated notifications are deceptive and, in several jurisdictions, unlawful.

### `quick-view-modal`
**Trigger:** a control on a product card.
**Mechanism:** a modal opens with images, variants, and add-to-cart, letting the reader buy without leaving the collection grid. Scroll position in the grid is preserved on close.
**Values:** open 250–350ms with a scale-in from 0.96.

### `sticky-buy-box`
**Trigger:** the buy panel would otherwise scroll out of view.
**Mechanism:** the buy column is `position: sticky` within the product section, staying visible while long-form content scrolls beside it, and unpinning at the section's end.
**Values:** `top` offset equal to any sticky header height plus 16–24px.

### `wishlist-heart-pop`
**Trigger:** save toggle.
**Mechanism:** the icon scales up and back with overshoot while the fill transitions from outline to solid; small particles may burst outward briefly.
**Values:** 350–450ms spring. The state change must persist and be reflected immediately.

### `compare-drawer`
**Trigger:** a product is added to comparison.
**Mechanism:** a tray slides up from the bottom edge holding selected product thumbnails, a count, and a compare action. Adding a product animates its thumbnail into the tray.
**Values:** tray 300ms slide, thumbnail insert 250ms. Add the tray height to page bottom padding while it is open.

---

## 12. PAGE TRANSITION & LOADING

### `page-transition-fade`
**Trigger:** internal navigation.
**Mechanism:** navigation is intercepted; the outgoing page fades out, the new content is fetched and swapped, then the incoming page fades in. Scroll position resets between the two halves so the reader never sees the jump.
**Values:** out 200–250ms, in 250–300ms. Total under 500ms or navigation feels slower than a normal page load.
**Note:** requires client-side routing or a swap library. The URL must update and the back button must work identically.

### `curtain-page-transition`
**Trigger:** internal navigation.
**Mechanism:** a full-viewport panel wipes across to cover the page, the swap happens behind it, then it wipes away to reveal the new page. The covered interval is where fetching happens, hiding the latency.
**Values:** cover 400–500ms, hold as long as the fetch needs up to a cap, reveal 400–500ms.
**Note:** if the fetch exceeds the cap, show progress on the panel rather than holding a blank cover indefinitely.

### `shared-element-transition`
**Trigger:** navigating from a grid item to its detail page.
**Mechanism:** the shared image's position and size are measured on both pages; it is animated from the source rect to the destination rect while the rest of the outgoing page fades and the incoming page's remaining content fades in behind it. FLIP applied across a navigation.
**Values:** 400–500ms, `cubic-bezier(0.16, 1, 0.3, 1)`.
**Note:** the element must be identifiable on both pages, and the destination layout must be measurable before the animation begins.

### `preloader-percentage`
**Trigger:** initial page load.
**Mechanism:** a branded cover screen displays a counter driven by real asset-loading progress; on completion it reveals the page, often with a `curtain-reveal`.
**Values:** never fake the progress. If assets load quickly the preloader should disappear quickly — a minimum display time exists only to prevent a flash, not to show off the screen.
**Note:** delays first contentful paint by definition. Justified only when the page genuinely cannot render usefully until heavy assets arrive.

### `view-transition-api`
**Trigger:** navigation or DOM update.
**Mechanism:** the browser snapshots the old and new states and cross-fades between them natively. Elements tagged with matching `view-transition-name` values morph between their two positions, giving shared-element transitions without manual measurement.
**Values:** customised through the `::view-transition-*` pseudo-elements.
**Note:** degrades to an instant swap where unsupported, which is a safe fallback.

---

## 13. SECTION DIVIDER & EDGE SHAPE

The boundary between two sections, rendered as a shape rather than a straight
line. Most of these are static — they are listed here because they belong to the
same vocabulary and because several have motion variants.

Shared implementation notes for the whole category: the SVG must carry
`preserveAspectRatio="none"` and `width: 100%`, so the shape stretches to any
viewport width instead of scaling proportionally and cropping. Give the wrapper
an explicit height and `overflow: hidden`; with auto height the shape distorts
differently at every breakpoint. The divider's fill must match the adjacent
section's background exactly — a 1px seam appears if the two are even slightly
different, and it is more visible than it sounds. Place the SVG with `display:
block` to kill the inline-element baseline gap beneath it.

### `wave-divider`
**Trigger:** none — static.
**Mechanism:** a single SVG path describing one or two sine-like crests sits at the top or bottom edge of a section, filled with the neighbouring section's colour so the boundary reads as a curve rather than a line. The path is drawn to overshoot both horizontal ends so the curve never terminates visibly inside the viewport.
**Values:** height 60–140px desktop, 40–80px mobile. Amplitude around 25–40% of the wrapper height; flatter than that reads as a rendering error rather than a deliberate shape.
**Note:** flip vertically with `transform: scaleY(-1)` for the opposite edge rather than authoring a second path, so both edges stay in sync when the shape is revised.

### `layered-wave-divider`
**Trigger:** none — static.
**Mechanism:** two to four wave paths are stacked in the same wrapper, each phase-shifted horizontally and vertically relative to the one below, and each at a lower opacity. Where the translucent layers overlap they darken, producing depth and a sense of overlapping planes without any gradient. The topmost layer is normally the solid one that meets the next section's background.
**Values:** 3 layers is the common case — opacities around 100% / 40% / 20%. Phase offset 40–120px horizontally between layers; vertical offset 8–20px. All layers share one `viewBox` and one `preserveAspectRatio` value.
**Note:** if the layers do not share a viewBox they scale independently and their phase relationship changes with viewport width, which destroys the effect at some breakpoints and not others — a bug that passes desktop review and fails on tablet.

### `tilt-divider`
**Trigger:** none — static.
**Mechanism:** the section boundary is a straight diagonal, produced with `clip-path: polygon()` on the section itself rather than an added SVG. No extra element is required.
**Values:** angle 2–6deg. Above about 8deg the triangular dead space at one side becomes large enough that content has to be inset to avoid it.
**Note:** the clip removes anything outside it, including box shadows, so shadowed cards near the edge will be cut.

### `curve-divider`
**Trigger:** none — static.
**Mechanism:** a single convex or concave arc across the full width, either as an SVG path or as an oversized element with a large `border-radius` positioned so only its curve is visible.
**Values:** rise 40–100px. Convex (bulging into the section above) reads as the lower section pushing up; concave reads as the upper section resting down.

### `zigzag-divider`
**Trigger:** none — static.
**Mechanism:** a repeating triangular path, or a CSS `linear-gradient` in two directions with `background-size` set to the tooth width, tiled across the boundary.
**Values:** tooth width 20–60px, height 10–30px. The width must divide evenly into common viewport widths or the last tooth is clipped mid-point, which is immediately visible.

### `torn-paper-divider`
**Trigger:** none — static.
**Mechanism:** an irregular hand-drawn path with small random variation along its length, imitating a torn edge. Often doubled with a slightly offset lighter copy behind it to suggest paper thickness.
**Values:** variation amplitude 4–12px over a 1200–1600px wide path. Truly random per-render variation looks wrong — the irregularity must be authored once and reused, because real torn paper has a consistent character.

### `arrow-divider`
**Trigger:** none — static.
**Mechanism:** the boundary dips to a point at the horizontal centre, forming a wide shallow arrow indicating the direction of reading.
**Values:** depth 30–60px, centred. Off-centre variants should align the point to the content grid rather than to an arbitrary position.

### `blob-divider`
**Trigger:** none — static.
**Mechanism:** an asymmetric organic path with several crests of differing amplitude and wavelength, so the edge reads as hand-made rather than mathematical.
**Values:** 3–5 control crests across the width. Avoid any repeating interval — the moment a viewer detects the repeat it stops reading as organic.

### `overlap-divider`
**Trigger:** none — static.
**Mechanism:** the following section is pulled upward with a negative `margin-top` and given a higher stacking order, so it sits over the preceding one. Frequently combined with a radius or a shaped top edge on the overlapping section.
**Values:** overlap 40–120px. The overlapped section needs matching extra bottom padding, or its last content row is covered.

### `book-fold-divider`
**Trigger:** none — static.
**Mechanism:** two triangles meet at the horizontal centre, one slightly darker, imitating the fold of a spread page.
**Values:** total height 40–80px; the darker half at 4–8% black over the base colour.

### `animated-wave-divider`
**Trigger:** continuous.
**Mechanism:** the motion variant of `layered-wave-divider`. Each layer is duplicated horizontally and translated at its own speed, looping by exactly one wavelength so the reset is invisible. Because the layers move at different rates, their overlaps shift continuously and the boundary appears to undulate.
**Values:** 10–25s per cycle per layer, `linear` only, with each layer at a different duration and at least one moving in the opposite direction. Every layer must be at least twice the viewport width, or a gap appears at the loop point on wide screens.
**Note:** the same entry as `wave-divider-animation` in category 8; kept here because the divider family is where it is usually chosen from. Suspend it under `prefers-reduced-motion` — continuous ambient motion at a section boundary is a common trigger for motion sensitivity.

### `parallax-divider`
**Trigger:** page scroll.
**Mechanism:** the layers of a `layered-wave-divider` translate horizontally by different fractions of scroll distance, so the boundary shifts as the reader moves rather than on a timer.
**Values:** layer factors 0.05–0.2 of scroll distance. Small values — the divider should be noticed only in peripheral vision.

---

## 14. PROGRESS & DATA VISUALISATION

Rendering a real quantity. Everything in this category shares two rules: the
figure must be a genuine measurement, and the animation must run from the
previous real value to the new one — never from zero when a previous value was
already on screen, which misrepresents the change.

### `radial-progress-ring`
**Trigger:** element enters viewport.
**Mechanism:** an SVG circle has `stroke-dasharray` set to its full circumference (`2πr`) and `stroke-dashoffset` animated from that circumference down to `circumference × (1 − percentage)`. The stroke therefore appears to draw around the arc to the correct proportion. The whole circle is rotated `-90deg` so the arc begins at twelve o'clock instead of three. A second, full circle sits underneath at low opacity as the track. The figure is centred inside with absolute positioning or an SVG `<text>` element.
**Values:** 800–1400ms, `ease-out`, so the arc decelerates as it lands. `stroke-linecap: round` for a softer terminal; `butt` for a technical look. Stroke width 6–12% of the radius. Pair with `counter-up` on the number so digit and arc finish together — a completed arc beside a still-counting number looks broken.
**Note:** `stroke-dashoffset` must be computed from the actual rendered radius, not a hardcoded circumference, or the arc is wrong at any size other than the one it was authored at.

### `semi-circle-gauge`
**Trigger:** element enters viewport.
**Mechanism:** the `radial-progress-ring` mechanism applied to a 180deg arc: `stroke-dasharray` is set so only half the circle is drawable, and the element is rotated so the arc runs left to right across the top. Frequently paired with a needle that rotates from the minimum to the value.
**Values:** arc 800–1200ms; needle rotation over the same duration with a slight overshoot and settle, imitating a physical instrument.

### `segmented-progress`
**Trigger:** element enters viewport, or a value change.
**Mechanism:** a fixed number of discrete cells; cells fill one at a time with a short stagger rather than a continuous sweep. Reading a count of filled cells is faster than judging the length of a continuous bar.
**Values:** 5–10 segments, 60–100ms stagger, each cell 150–250ms. A partially filled final cell is acceptable only if the underlying value genuinely has that resolution.

### `stacked-bar-grow`
**Trigger:** chart enters viewport.
**Mechanism:** each segment of the stack animates its width or height in sequence, so the composition builds from the base outward and the reader sees how the parts sum.
**Values:** 300–400ms per segment, 100–150ms stagger between them.

### `pie-sweep`
**Trigger:** chart enters viewport.
**Mechanism:** each slice's arc is drawn by animating `stroke-dashoffset` on a circle with a large stroke width, or by interpolating the arc's end angle in the path data. Slices sweep in sequence around the circle from twelve o'clock.
**Values:** total sweep 800–1200ms across all slices, not per slice.
**Note:** slices under about 5% are unreadable regardless of animation; group them into an "other" segment rather than animating something nobody can measure.

### `sparkline-draw`
**Trigger:** enters viewport.
**Mechanism:** a small unlabelled trend line drawn with the `line-draw` mechanism — `stroke-dasharray` set to the path length, `stroke-dashoffset` animated to zero.
**Values:** 600–1000ms, `ease-out`. No axes and no labels; the sparkline conveys shape, and any figure it needs belongs in adjacent text.

### `bar-chart-grow`
**Trigger:** chart enters viewport.
**Mechanism:** each bar animates `transform: scaleY()` from 0 to 1 with `transform-origin: bottom` — a transform rather than a height change, so it composites on the GPU and does not trigger layout on every frame. Bars stagger in category order.
**Values:** 500–700ms per bar, 60–100ms stagger, `ease-out`. Value labels fade in after their bar completes rather than scaling with it, which would distort the text.
**Note:** the axis and gridlines must be drawn at their final positions before the bars grow, or the whole chart appears to inflate.

### `line-chart-draw`
**Trigger:** chart enters viewport.
**Mechanism:** the series path draws itself with `stroke-dashoffset`; data point markers fade in progressively behind the drawing head so they appear as the line reaches them. Any area fill beneath the line fades in after the stroke completes.
**Values:** line 1000–1600ms `ease-in-out`; markers timed to the line's progress, not on an independent stagger, or they arrive before the line reaches them.

### `map-region-fill`
**Trigger:** map enters viewport.
**Mechanism:** each region path transitions its fill colour from the base to its data-derived value, staggered geographically — outward from a centre, or in ranked order.
**Values:** 400–600ms per region, 30–60ms stagger. With many regions, stagger by group rather than individually or the sequence takes far too long.

### `heatmap-fade-in`
**Trigger:** grid enters viewport.
**Mechanism:** cells fade from empty to their intensity colour, staggered by row and column so the fill sweeps diagonally across the grid.
**Values:** 200–300ms per cell, 15–30ms stagger per step.
**Note:** interpolate the colour scale in OKLCH or LAB rather than sRGB; sRGB interpolation passes through desaturated greys and makes mid-range values look like missing data.
