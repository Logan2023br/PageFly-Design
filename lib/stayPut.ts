/* ==========================================================================
   A MOCKUP IS A PICTURE, AND A PICTURE DOES NOT GO ANYWHERE.

   Every preview this app draws is a real storefront page, and its buttons are
   real links — "Shop costumes" points at `/collections/costumes` on a store
   that is not this one. Clicked inside the frame, the link navigates THE
   FRAME, resolved against this origin, and the merchant is left looking at our
   404 where the page used to be.

   So nothing inside a preview navigates. In-page anchors (`#reviews`) still
   scroll: that is the page moving, not leaving.

   NOT ONLY LINKS. A category card is clickable all over — the builder's
   `card-link` behaviour (`skills/pagefly-builder/scripts/behaviors.js`) sends
   `window.location.href` to the card's link when the picture or the title is
   pressed, and no `<a>` is ever clicked. So the frame-that-runs-script guard
   works at four levels:

   1. Clicks on links are cancelled, and forms do not submit.
   2. The card's click handler is never attached: `addEventListener` refuses a
      `click` listener on a `.pu-card`. It is the only thing the builder's
      runtime sends anywhere by script — checked against every showcase file —
      and the card keeps its hover and everything else.
   3. The Navigation API's `navigate` event, cancelled for anything that is not
      a hash change — the catch-all for any other script. ONLY WHERE THE FRAME
      HAS AN ORIGIN: Chrome does not fire it in a `sandbox="allow-scripts"`
      frame, which is every preview on the public pages. It covers the app's
      own mockups, which are unsandboxed `srcDoc`.
   4. `window.open` does nothing, so a script cannot get round it with a tab.

   TWO SHAPES, because two kinds of frame:

   - A frame that runs script gets `stayPut`: the guard above, registered first
     in `<head>` so it is in place before the page's own scripts.
   - A frame with `sandbox=""` runs no script at all, so it gets `stayPutStatic`
     instead: `<base target="_blank">` turns every link into a popup, and the
     empty sandbox — no `allow-popups` — refuses every popup. Nothing opens,
     and with no script there is no `location.href` to worry about.
   ========================================================================== */

const MARK = "data-stay-put";

const SCRIPT = `<script ${MARK}>(function(){
var nav=window.navigation;
if(nav&&nav.addEventListener)nav.addEventListener("navigate",function(e){
  if(!e.hashChange&&e.cancelable)e.preventDefault();
});
var add=EventTarget.prototype.addEventListener;
EventTarget.prototype.addEventListener=function(type,fn,opt){
  if(type==="click"&&this&&this.classList&&this.classList.contains("pu-card"))return;
  return add.call(this,type,fn,opt);
};
function link(e){
  var t=e.target;
  var a=t&&t.closest?t.closest("a[href],area[href]"):null;
  if(!a)return;
  var h=a.getAttribute("href")||"";
  if(h.charAt(0)==="#"&&h.length>1&&!a.target)return;
  e.preventDefault();
}
add.call(document,"click",link,true);
add.call(document,"auxclick",link,true);
add.call(document,"submit",function(e){e.preventDefault();},true);
window.open=function(){return null;};
})();</script>`;

/** An earlier guard, so a file written by an older version is upgraded. */
const OLD = new RegExp(`<script ${MARK}>[\\s\\S]*?</script>|<base ${MARK}[^>]*>`, "g");

/** Put `snippet` first in `<head>`, or first in the document if it has none. */
function inject(html: string, snippet: string): string {
  html = html.replace(OLD, "");
  const head = /<head\b[^>]*>/i.exec(html);
  if (head) {
    const at = head.index + head[0].length;
    return html.slice(0, at) + snippet + html.slice(at);
  }
  return snippet + html;
}

/** For a preview frame that runs script. Idempotent. */
export function stayPut(html: string): string {
  return inject(html, SCRIPT);
}

/** For a preview frame with `sandbox=""`, where no script runs. Idempotent. */
export function stayPutStatic(html: string): string {
  return inject(html, `<base ${MARK} target="_blank">`);
}
