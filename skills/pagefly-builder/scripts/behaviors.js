/* PageFly behavior pack.
   Each module sits between "MODULE name" / "END" markers and is assembled by
   pagefly_lib.behaviors(). Activation is class-based (see SKILL.md table);
   per-page settings come from the CFG object behaviors() injects.
   IMPORTANT: this file must never contain the "less-than" character - PageFly's
   custom-code validator rejects anything HTML-shaped. Use forEach, flipped
   comparisons (b greater-than a) and string building instead. */

/*MODULE core*/
var pf = document.getElementById('__pf');
function qsa(sel, root){ return Array.prototype.slice.call((root||document).querySelectorAll(sel)); }
function on(el, ev, fn){ if(el) el.addEventListener(ev, fn); }
/*END*/

/*MODULE fonts*/
(function(){
  if(!CFG.fonts || document.getElementById('pu-fonts')) return;
  var l = document.createElement('link');
  l.id = 'pu-fonts'; l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?' + CFG.fonts + '&display=swap';
  document.head.appendChild(l);
})();
/*END*/

/*MODULE anchors*/
(function(){
  var map = CFG.anchors || {};
  Object.keys(map).forEach(function(k){
    var el = document.querySelector('.' + k);
    if(el && !document.getElementById(map[k])) el.id = map[k];
  });
})();
/*END*/

/*MODULE reveal*/
(function(){
  var els = qsa('.pu-rv');
  if(!els.length) return;
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)){
    els.forEach(function(el){ el.classList.add('in'); });
    return;
  }
  if(pf) pf.classList.add('pu-anim');
  var io = new IntersectionObserver(function(entries){
    entries.forEach(function(en){
      if(en.isIntersecting){ en.target.classList.add('in'); io.unobserve(en.target); }
    });
  }, {threshold: 0.12, rootMargin: '0px 0px -40px 0px'});
  els.forEach(function(el, i){
    el.style.transitionDelay = (Math.min(i % 5, 4) * 60) + 'ms';
    io.observe(el);
  });
  setTimeout(function(){ els.forEach(function(el){ el.classList.add('in'); }); }, 2500);
})();
/*END*/

/*MODULE drawer*/
(function(){
  var burger = document.querySelector('.pu-burger'),
      drawer = document.querySelector('.pu-drawer'),
      scrim = document.querySelector('.pu-scrim'),
      close = document.querySelector('.pu-drawer-close');
  if(!drawer) return;
  function setOpen(o){
    drawer.classList.toggle('open', o);
    if(scrim) scrim.classList.toggle('open', o);
    document.body.style.overflow = o ? 'hidden' : '';
  }
  on(burger, 'click', function(){ setOpen(true); });
  on(close, 'click', function(){ setOpen(false); });
  on(scrim, 'click', function(){ setOpen(false); });
  qsa('a', drawer).forEach(function(a){ on(a, 'click', function(){ setOpen(false); }); });
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape') setOpen(false); });
})();
/*END*/

/*MODULE card-link*/
(function(){
  qsa('.pu-card').forEach(function(card){
    on(card, 'click', function(e){
      if(e.target.closest('a')) return;
      var a = card.querySelector('a[href]');
      if(a) window.location.href = a.getAttribute('href');
    });
  });
})();
/*END*/

/*MODULE sticky*/
(function(){
  var els = qsa('.pu-sticky');
  if(!els.length) return;
  function tick(){
    var y = window.scrollY || document.documentElement.scrollTop;
    els.forEach(function(el){ el.classList.toggle('is-stuck', y > 8); });
  }
  window.addEventListener('scroll', tick, {passive: true});
  tick();
})();
/*END*/

/*MODULE count-up*/
(function(){
  var els = qsa('.pu-count');
  if(!els.length || !('IntersectionObserver' in window)) return;
  function animate(el){
    var raw = el.textContent;
    var m = raw.replace(/[,.\s]/g, '').match(/\d+/);
    if(!m) return;
    var target = parseInt(m[0], 10);
    var prefix = raw.slice(0, raw.indexOf(m[0][0]));
    var suffix = raw.slice(raw.lastIndexOf(m[0][m[0].length - 1]) + 1);
    var start = null, dur = 1200;
    function step(ts){
      if(!start) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      p = 1 - Math.pow(1 - p, 3);
      el.textContent = prefix + Math.round(target * p).toLocaleString() + suffix;
      if(1 > p) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  var io = new IntersectionObserver(function(entries){
    entries.forEach(function(en){
      if(en.isIntersecting){ animate(en.target); io.unobserve(en.target); }
    });
  }, {threshold: 0.6});
  els.forEach(function(el){ io.observe(el); });
})();
/*END*/

/*MODULE countdown*/
(function(){
  var conf = CFG.countdown || {};
  Object.keys(conf).forEach(function(sel){
    var el = document.querySelector(sel);
    if(!el) return;
    var end = new Date(conf[sel]).getTime();
    if(isNaN(end)) return;
    function pad(n){ return (9 >= n ? '0' : '') + n; }
    function put(cls, v){
      var t = el.querySelector('.' + cls);
      if(t) t.textContent = v;
    }
    function tick(){
      var d = Math.max(0, end - Date.now());
      var days = Math.floor(d / 86400000),
          hrs = Math.floor(d / 3600000) % 24,
          min = Math.floor(d / 60000) % 60,
          sec = Math.floor(d / 1000) % 60;
      if(el.querySelector('.pu-cd-days') || el.querySelector('.pu-cd-hours')){
        put('pu-cd-days', pad(days)); put('pu-cd-hours', pad(hrs));
        put('pu-cd-mins', pad(min)); put('pu-cd-secs', pad(sec));
      } else {
        el.textContent = pad(days) + ':' + pad(hrs) + ':' + pad(min) + ':' + pad(sec);
      }
      if(d > 0) setTimeout(tick, 1000);
    }
    tick();
  });
})();
/*END*/

/*MODULE marquee*/
(function(){
  var els = qsa('.pu-marquee');
  if(!els.length) return;
  if(!document.getElementById('pu-marquee-style')){
    var st = document.createElement('style');
    st.id = 'pu-marquee-style';
    st.textContent = '@keyframes pu-marquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}' +
      '#__pf .pu-marquee{overflow:hidden}' +
      '#__pf .pu-marquee .pu-marquee-track{display:inline-flex;white-space:nowrap;animation:pu-marquee var(--pu-marquee-speed,28s) linear infinite;will-change:transform}' +
      '#__pf .pu-marquee:hover .pu-marquee-track{animation-play-state:paused}';
    document.head.appendChild(st);
  }
  els.forEach(function(el){
    var track = el.querySelector('.pu-marquee-track') || el.firstElementChild;
    if(!track) return;
    track.classList.add('pu-marquee-track');
    track.innerHTML = track.innerHTML + track.innerHTML;
  });
})();
/*END*/

/*MODULE copy-code*/
(function(){
  qsa('.pu-copy').forEach(function(btn){
    on(btn, 'click', function(){
      var src = btn.querySelector('.pu-copy-code') || btn;
      var txt = src.textContent.trim();
      function done(){
        btn.classList.add('copied');
        setTimeout(function(){ btn.classList.remove('copied'); }, 1600);
      }
      if(navigator.clipboard){ navigator.clipboard.writeText(txt).then(done); }
      else {
        var ta = document.createElement('textarea');
        ta.value = txt; document.body.appendChild(ta); ta.select();
        try{ document.execCommand('copy'); }catch(e){}
        document.body.removeChild(ta); done();
      }
    });
  });
})();
/*END*/

/*MODULE back-to-top*/
(function(){
  var btn = document.querySelector('.pu-top');
  if(!btn) return;
  function tick(){
    var y = window.scrollY || document.documentElement.scrollTop;
    btn.classList.toggle('show', y > 600);
  }
  window.addEventListener('scroll', tick, {passive: true});
  on(btn, 'click', function(){ window.scrollTo({top: 0, behavior: 'smooth'}); });
  tick();
})();
/*END*/
