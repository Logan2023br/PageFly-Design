/* ==========================================================================
   A MOCKUP IS A PICTURE, AND A PICTURE DOES NOT GO ANYWHERE.

   Every preview this app draws is a real storefront page, and its buttons are
   real links — "Shop costumes" points at `/collections/costumes` on a store
   that is not this one. Clicked inside the frame, the link navigates THE
   FRAME, resolved against this origin, and the merchant is left looking at our
   404 where the page used to be.

   So every link and form inside a preview is held where it is. In-page anchors
   (`#reviews`) still scroll: that is the page moving, not leaving.

   TWO SHAPES, because two kinds of frame:

   - A frame that runs script gets `stayPut`: a listener, registered first in
     `<head>` so it is in place before the page's own scripts, that cancels
     the navigation on the way down (capture phase) — before any handler on the
     button itself could act on it.
   - A frame with `sandbox=""` runs no script at all, so it gets `stayPutStatic`
     instead: `<base target="_blank">` turns every link into a popup, and the
     empty sandbox — no `allow-popups` — refuses every popup. Nothing opens.
   ========================================================================== */

const MARK = "data-stay-put";

const SCRIPT = `<script ${MARK}>(function(){
function stop(e){
  var t=e.target;
  var a=t&&t.closest?t.closest("a[href],area[href]"):null;
  if(!a)return;
  var h=a.getAttribute("href")||"";
  if(h.charAt(0)==="#"&&h.length>1&&!a.target)return;
  e.preventDefault();
}
document.addEventListener("click",stop,true);
document.addEventListener("auxclick",stop,true);
document.addEventListener("submit",function(e){e.preventDefault();},true);
})();</script>`;

/** Put `snippet` first in `<head>`, or first in the document if it has none. */
function inject(html: string, snippet: string): string {
  if (html.includes(MARK)) return html;
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
