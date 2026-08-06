#!/usr/bin/env python3
"""Worked example: a hero section with eyebrow, headline, CTA and three animated
stat cards, emitted BOTH as clipboard JSON and as a .pagefly import file.

Run:  python3 example_build.py
"""
from pagefly_builder import *

# palette (always lift real values from the design; these are from a cream/olive brand)
CREAM = "rgb(243, 238, 225)"; OLIVE = "rgb(31, 42, 16)"; OLIVE_D = "rgb(20, 42, 28)"
GOLD = "rgb(176, 139, 46)"; INK = "rgb(26, 26, 22)"; MUTED = "rgb(107, 103, 89)"
LINE = "rgb(228, 222, 203)"; WHITE = "rgb(255, 255, 255)"
GEORGIA = "Georgia, 'Iowan Old Style', serif"

def stat_card(num, label):
    return FB(
        style={"all": {"&": f"flex-grow: 1; flex-basis: 0px; height: auto; align-self: stretch; "
               f"display: flex; --pf-flex-layout-width: fill; --pf-flex-layout-height: hug; "
               f"--pf-flex-layout-direction: vertical; flex-flow: column; justify-content: center; "
               f"align-items: center; gap: 0px; padding: 18px 12px 20px; background-color: {WHITE}; "
               f"border-style: solid; border-color: {LINE}; border-width: 1px; border-radius: 12px; "
               f"--pf-flex-layout-parent-direction: horizontal;"}},
        children=[
            H2(num, cls="count-up",   # ← JS hook: count-up.js animates this on scroll-in
               style={"all": {"&": f"align-self: stretch; flex-basis: unset; height: fit-content; "
                      f"font-family: {GEORGIA}; font-size: 28px; font-weight: 700; color: {OLIVE_D}; "
                      f"text-align: center; margin: 0px; --pf-flex-layout-width: fill; "
                      f"--pf-flex-layout-height: hug; --pf-flex-layout-parent-direction: vertical;"}}),
            H2(label,
               style={"all": {"&": f"align-self: stretch; flex-basis: unset; height: fit-content; "
                      f"font-size: 11.5px; font-weight: 500; color: {MUTED}; text-align: center; "
                      f"margin: 7px 0px 0px; --pf-flex-layout-width: fill; "
                      f"--pf-flex-layout-height: hug; --pf-flex-layout-parent-direction: vertical;"}}),
        ])

hero = FB(
    style={"all": {"&": f"align-self: stretch; height: fit-content; flex-basis: unset; display: flex; "
           f"--pf-flex-layout-width: fill; --pf-flex-layout-height: hug; "
           f"--pf-flex-layout-direction: vertical; flex-flow: column; justify-content: flex-start; "
           f"align-items: flex-start; gap: 0px; padding: 34px 24px; background-color: {CREAM}; "
           f"--pf-flex-layout-parent-direction: vertical;"},
           "mobile": {"&": "padding: 28px 18px; --pf-flex-layout-parent-direction: vertical;"}},
    children=[
        P4("New here?", style={"all": {"&": f"flex-basis: unset; font-size: 11px; font-weight: 700; "
            f"letter-spacing: 0.14em; text-transform: uppercase; color: {GOLD}; margin-bottom: 6px; "
            f"--pf-flex-layout-parent-direction: vertical;"}}),
        H2("Try it before you commit", style={"all": {"&": f"align-self: stretch; flex-basis: unset; "
            f"height: fit-content; font-family: {GEORGIA}; font-size: 26px; font-weight: 700; "
            f"color: {INK}; margin: 0px 0px 14px; --pf-flex-layout-width: fill; "
            f"--pf-flex-layout-height: hug; --pf-flex-layout-parent-direction: vertical;"}}),
        BTN("Start the trial box", "/products/trial-box",
            style={"all": {"&": f"width: fit-content; flex-basis: unset; height: fit-content; "
                   f"background-color: {OLIVE}; color: {CREAM}; padding: 14px 26px; "
                   f"border-radius: 999px; font-size: 14px; font-weight: 600; text-decoration: none; "
                   f"margin-bottom: 22px; transition: filter 0.18s; --pf-flex-layout-width: hug; "
                   f"--pf-flex-layout-height: hug; --pf-flex-layout-parent-direction: vertical;",
                   "&:hover": "filter: brightness(1.15);"}}),
        FB(style={"all": {"&": "align-self: stretch; height: fit-content; flex-basis: unset; "
                  "display: flex; --pf-flex-layout-width: fill; --pf-flex-layout-height: hug; "
                  "--pf-flex-layout-direction: horizontal; flex-flow: row; justify-content: flex-start; "
                  "align-items: stretch; gap: 0px 12px; --pf-flex-layout-parent-direction: vertical;"}},
           children=[
               stat_card("4.7", "814 verified Google reviews"),
               stat_card("38", "years in animal nutrition"),
               stat_card("100%", "farm-to-bowl ingredient trace"),
           ]),
    ])

COUNT_UP_JS = r"""
(function(){'use strict';
var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var ease=function(t){return 1-Math.pow(1-t,3);},order=0;
function boot(){document.querySelectorAll('.count-up').forEach(function(el){
  if(el.getAttribute('data-cu')==='1')return;
  var m=(el.textContent||'').trim().match(/^([^\d-]*)(-?[\d,]*\.?\d+)(.*)$/);if(!m)return;
  el.setAttribute('data-cu','1');
  var pre=m[1]||'',suf=m[3]||'',val=parseFloat(m[2].replace(/,/g,'')),
      dec=m[2].indexOf('.')>-1?m[2].split('.')[1].length:0,grp=m[2].indexOf(',')>-1;
  var fmt=function(n){var s=dec?n.toFixed(dec):String(Math.round(n));
    if(grp){var q=s.split('.');q[0]=q[0].replace(/\B(?=(\d{3})+(?!\d))/g,',');s=q.join('.');}
    return pre+s+suf;};
  if(reduce)return;el.textContent=fmt(0);
  var io=new IntersectionObserver(function(es){es.forEach(function(e){if(!e.isIntersecting)return;
    io.disconnect();setTimeout(function(){var st=null;
      (function step(ts){if(st===null)st=ts;var t=Math.min(1,(ts-st)/1400);
        el.textContent=fmt(val*ease(t));
        if(t<1)requestAnimationFrame(step);else el.textContent=fmt(val);})(performance.now());
    },(order++%6)*160);});},{threshold:0.4});
  io.observe(el);});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
var n=0,iv=setInterval(function(){boot();if(++n>25)clearInterval(iv);},400);
})();
"""

if __name__ == "__main__":
    # 1) clipboard payload for a single section
    print("clipboard JSON chars:", len(to_clipboard(hero)))

    # 2) full importable page with the JS baked into customJS
    page = Page(name="example_hero", custom_js=COUNT_UP_JS)
    page.add_section(FSECTION([hero]))
    out = page.save(".")
    print("wrote", out)
