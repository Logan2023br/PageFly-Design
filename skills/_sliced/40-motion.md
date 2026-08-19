---
scope: slice
slice: motion
name: motion
version: 2.0
---

<!--
  SLICED AT RUNTIME — 2 to 4 blocks are sent, chosen by page type and by the
  vertical's motion register.

  This file replaces the 162-pattern research document. Sixteen effects, every
  one of which has been written out in full and ships. A catalogue of effects
  nobody implemented is a catalogue of pages that came back without them.

  Two roads reach the live page:
    · anim.hover / anim.reveal        PageFly fields and the exporter's own
                                      IntersectionObserver — free, editable
    · custom { html, stylesheet, js } everything else

  CSS animation beats JS animation. Keyframes run in the PageFly editor canvas,
  on the live page, and with JavaScript off. Custom JS does NOT run in the
  editor — so anything JS-driven must be VISIBLE in its resting state. Never
  ship an element at opacity 0 that only JS can reveal.
-->

## Budget

One page gets **one signature effect plus two quiet ones**, and hovers.
Three effect types is the ceiling. A page where everything moves has no
emphasis left to spend.

Never animate: the first section (it is on screen before the observer runs),
body copy, a buy box, a form, or anything on `password` `login` `404` `legal`
`cart` `search` `thank-you`.

## The two free fields

<!--#reveal-->
**reveal** — `anim: {"reveal":"fade-up","delay":2}` on any node.
Values `fade · fade-up · slide-left · slide-right · zoom`. `delay` 0–6 in steps
of 80ms.
- statement section, one big idea → `fade-up` on the section
- a row of cards → `reveal` on EACH card with `delay` 0,1,2,3 — never on the row
- two-column split → `slide-left` on one side, `slide-right` on the other
- `zoom` on one full-bleed photograph, at most once per page
At most four revealing sections per page. Never two adjacent sections with the
same value.
<!--/-->

<!--#hover-->
**hover** — `anim: {"hover":"float"}` on buttons and clickable cards only.
| register | value |
| --- | --- |
| electronics, tools, auto, B2B, finance | `shadow` |
| skincare, supplements, medical, jewelry, luxury | `glow` |
| fashion, footwear, home, furniture | `float` |
| food, toys, pets, kids, events | `grow-shadow` |
A hover on a heading, a paragraph, an icon or a static photograph is noise.
<!--/-->

## Signature effects

<!--#counter-up-->
**counter-up** — use the `counter` node, no custom code needed.
`{"type":"counter","value":"92","suffix":"%","label":"would recommend it"}`
Counts from zero when it scrolls in, once. Resting state shows the final number,
so it is correct in the editor and with JS off.
Use on `stat-strip-3up` and `price-math-band`. Never more than one row of them.
<!--/-->

<!--#spec-bar-fill-->
**spec-bar-fill** — a measured value as a bar that fills on reveal.
```json
{"type":"custom","label":"spec bar",
 "html":"<div class='b'><i style='--v:78%'></i></div>",
 "stylesheet":".b{height:3px;background:rgba(255,255,255,.14);overflow:hidden}.b i{display:block;height:100%;width:var(--v);background:var(--pf-accent);transform-origin:left;animation:g .9s cubic-bezier(.22,.61,.36,1) both}@keyframes g{from{transform:scaleX(0)}to{transform:scaleX(1)}}"}
```
Pure CSS, so it runs in the editor. The number always sits beside it as text —
a bar with no number is decoration.
<!--/-->

<!--#marquee-->
**marquee** — use the `marquee` node.
`{"type":"marquee","speed":28,"children":[ …text or icon nodes… ]}`
The builder duplicates the track and pauses on hover. Speed 22–36; below 20 it
is distracting, above 40 it reads as broken.
Use for claim strips, certification rows, flavour lists, ingredient names. One
per page.
<!--/-->

<!--#before-after-drag-->
**before-after-drag** — use the `beforeAfter` node.
`{"type":"beforeAfter","beforeQuery":"…","afterQuery":"…","beforeLabel":"Before","afterLabel":"After 6 weeks"}`
Resting state shows the divider at 50% with both labels visible, so it reads
correctly before any script runs. Always caption it with the interval and what
was measured.
Required on: skincare, haircare, cleaning, home-improvement, lighting (day/night).
<!--/-->

<!--#sticky-buy-bar-->
**sticky-buy-bar** — use the `sticky` node.
```json
{"type":"sticky","edge":"bottom","children":[{"type":"row","children":[…name, price, button…]}]}
```
Mobile only by default. One per page, on product and single-offer landing pages.
Never on a page with no price.
<!--/-->

<!--#image-swap-hover-->
**image-swap-hover** — a card's photo changes on hover.
```json
{"type":"custom","label":"swap card",
 "html":"<figure class='s'><img class='a' src='' alt=''><img class='b' src='' alt=''></figure>",
 "stylesheet":".s{position:relative;overflow:hidden}.s img{width:100%;display:block;transition:opacity .45s ease}.s .b{position:absolute;inset:0;opacity:0}.s:hover .b{opacity:1}"}
```
The only place `position` is allowed, because it is inside a scoped custom
block. Apparel, footwear, home decor. Never on a spec page.
<!--/-->

<!--#shine-sweep-->
**shine-sweep** — one slow highlight across a product shot or a price.
```json
{"stylesheet":".sh{position:relative;overflow:hidden}.sh::after{content:'';position:absolute;top:0;left:-60%;width:40%;height:100%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.28),transparent);animation:sw 4.5s ease-in-out infinite}@keyframes sw{0%,70%{left:-60%}100%{left:120%}}"}
```
Jewelry, watches, luxury, collectibles. Exactly one element per page. Two makes
a page look like a banner ad.
<!--/-->

<!--#stagger-grid-->
**stagger-grid** — cards arriving in sequence.
Not a custom block: put `anim.reveal` + `anim.delay` 0,1,2,3 on each child.
Use on `whats-inside-grid`, `usecase-tiles-overlay`, `social-proof-wall`.
Cap the stagger at 4 steps — a nine-card grid staggered nine times finishes
after the reader has scrolled past.
<!--/-->

<!--#scroll-progress-->
**scroll-progress** — a thin accent rule filling across the top of a long page.
```json
{"type":"custom","label":"progress",
 "html":"<div class='p'><i></i></div>",
 "stylesheet":".p{height:2px;background:rgba(0,0,0,.08)}.p i{display:block;height:100%;width:0;background:var(--pf-accent)}",
 "js":"var b=root.querySelector('i');addEventListener('scroll',function(){var h=document.body.scrollHeight-innerHeight;b.style.width=(h>0?scrollY/h*100:0)+'%'},{passive:true})"}
```
Advertorial and long-form only. Resting width 0 is safe: it is a 2px rule, not
content.
<!--/-->

<!--#countdown-->
**countdown**
```json
{"type":"custom","label":"countdown",
 "html":"<div class='c'><span class='d'>00</span><span class='h'>00</span><span class='m'>00</span><span class='s'>00</span></div>",
 "js":"var e=new Date('<ISO>').getTime();function t(){var d=Math.max(0,e-Date.now()),p=function(n){return(n<10?'0':'')+n};root.querySelector('.d').textContent=p(Math.floor(d/864e5));root.querySelector('.h').textContent=p(Math.floor(d/36e5)%24);root.querySelector('.m').textContent=p(Math.floor(d/6e4)%60);root.querySelector('.s').textContent=p(Math.floor(d/1e3)%60);if(d>0)setTimeout(t,1000)}t()"}
```
Only on `lp-bfcm`, `sale`, `events-tickets`, `coming-soon`, and only when the
merchant named a real deadline. A countdown on an evergreen page is a lie the
visitor notices the second time they come back.
<!--/-->

<!--#parallax-lite-->
**parallax-lite** — a background photograph drifting slower than the page.
```json
{"stylesheet":"&{background-attachment:fixed;background-size:cover}"}
```
CSS-only, no scroll listener, so it costs nothing on the main thread. Disable on
mobile with `@media (max-width:767px){&{background-attachment:scroll}}`.
One per page, on an origin, room or landscape shot. Never behind body copy.
<!--/-->

<!--#magnifier-->
**magnifier** — hover to zoom a detail shot.
```json
{"stylesheet":".z{overflow:hidden}.z img{transition:transform .6s cubic-bezier(.22,.61,.36,1)}.z:hover img{transform:scale(1.18)}"}
```
Jewelry, collectibles, textiles, art. The container clips; only the image moves.
<!--/-->

<!--#accordion-motion-->
**accordion-motion** — the `accordion` node handles its own open/close.
Do not write custom code for an FAQ. Set `headerIcon` behaviour through the node.
<!--/-->

<!--#slideshow-motion-->
**slideshow-motion** — the `slideshow` node.
`perView` fractional (3.2, 2.4) so the next card peeks and the visitor knows it
scrolls. `autoplay:false` for anything with words on it; `true` only for a strip
of images with no copy.
<!--/-->

## Reduced motion — always

Every custom stylesheet ends with this. It is not optional, and in health,
beauty and medical it is a duty of care.

```css
@media (prefers-reduced-motion: reduce){
  *{animation:none!important;transition:none!important}
}
```
