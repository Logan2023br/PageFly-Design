"use client";

import { useEffect, useState } from "react";

/* ==========================================================================
   EN / VI — the admin screen in English or in Vietnamese, beside the bell.

   One switch, two sides. EN puts every Vietnamese (and Japanese, Chinese,
   Korean, Arabic, Thai, Russian…) text on the screen into English; VI puts
   every foreign text — a customer's Japanese reply, an English sentence —
   into Vietnamese. Pressing the side that is on turns it off: the screen as
   it was written. The choice is kept per browser.

   It reads the screen's text nodes, sends what needs it to
   /api/admin/translate (Haiku), and writes the answer in place, keeping the
   original to put back. Whatever React draws later (a new tab, a refreshed
   list) is caught by a MutationObserver and translated too. Answers are
   cached in the browser, so a screen seen before switches at once.
   Inputs, code and anything inside [data-no-translate] are left alone.
   ========================================================================== */

type Target = "en" | "vi";
const PREF = "pfd-admin-translate";
/* v2: v1 kept a failed answer (the original) as if it were the translation. */
const CACHE = (t: Target) => `pfd-admin-translate-cache-v2-${t}`;
const MAX_CACHE = 4000;

const VI = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i;
const FOREIGN = /[぀-ヿ㐀-鿿豈-﫿가-힯؀-ۿ฀-๿Ѐ-ӿ]/;
const EN_WORDS = /\b(the|and|to|is|are|you|your|please|can|could|my|this|that|it|for|of|with|we|i|not|be|have|do|on|in)\b/gi;
const SKIP_TEXT = /^[\s\d.,:;/\-–—·•()[\]%#@+×x$€¥₫|<>=~*'"!?]*$|^\S+@\S+\.\S+$|^(https?:\/\/|www\.)\S+$|^[\w-]+(\.[\w-]+)+(\/\S*)?$/i;
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "CODE", "PRE", "KBD", "SVG", "TEMPLATE"]);

function needs(text: string, target: Target): boolean {
  if (text.length < 2 || text.length > 4000 || SKIP_TEXT.test(text)) return false;
  if (FOREIGN.test(text)) return true;
  if (target === "en") return VI.test(text);
  /* to Vietnamese: an English sentence, not a label or a name */
  return !VI.test(text) && text.split(/\s+/).length >= 3 && (text.match(EN_WORDS)?.length ?? 0) >= 1;
}

/* ---- the browser's cache ------------------------------------------------- */

const memo: Record<Target, Map<string, string> | null> = { en: null, vi: null };
function cacheOf(t: Target): Map<string, string> {
  if (memo[t]) return memo[t]!;
  let m = new Map<string, string>();
  try {
    m = new Map(Object.entries(JSON.parse(localStorage.getItem(CACHE(t)) ?? "{}") as Record<string, string>));
  } catch {
    /* none */
  }
  return (memo[t] = m);
}
function saveCache(t: Target) {
  const m = cacheOf(t);
  while (m.size > MAX_CACHE) m.delete(m.keys().next().value!);
  try {
    localStorage.removeItem(`pfd-admin-translate-cache-${t}`);
    localStorage.setItem(CACHE(t), JSON.stringify(Object.fromEntries(m)));
  } catch {
    /* full or blocked: the memory copy still works */
  }
}

/* ---- the screen ----------------------------------------------------------- */

type Rec = { orig: string; shown: string };
const recs = new WeakMap<Text, Rec>();
const touched = new Set<Text>();

function skipped(node: Text): boolean {
  for (let el = node.parentElement; el; el = el.parentElement) {
    if (SKIP_TAGS.has(el.tagName.toUpperCase()) || el.isContentEditable || el.hasAttribute("data-no-translate")) return true;
  }
  return false;
}

function textNodes(): Text[] {
  const out: Text[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n as Text);
  return out;
}

/** Put every translated node back as it was written. */
function restore() {
  for (const node of touched) {
    const rec = recs.get(node);
    if (rec && node.isConnected && node.nodeValue === rec.shown) node.nodeValue = rec.orig;
    recs.delete(node);
  }
  touched.clear();
}

const split = (s: string) => {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s)!;
  return { lead: m[1], core: m[2], tail: m[3] };
};

/* A text the server could not translate is asked again only after a while,
   not on every re-render. */
const failedAt = new Map<string, number>();
const RETRY_MS = 5 * 60_000;

let running = false;
/** Translates what is on screen; resolves to an error message, or null. */
async function pass(target: Target, live: () => boolean): Promise<string | null> {
  if (running) return null;
  running = true;
  try {
    const cache = cacheOf(target);
    const want: { node: Text; orig: string }[] = [];
    for (const node of textNodes()) {
      const value = node.nodeValue ?? "";
      const rec = recs.get(node);
      if (rec && value === rec.shown) continue;
      if (skipped(node)) continue;
      const { core } = split(value);
      if (!needs(core, target)) continue;
      want.push({ node, orig: value });
    }
    const now = Date.now();
    const missing = [
      ...new Set(want.map((w) => split(w.orig).core).filter((c) => !cache.has(c) && now - (failedAt.get(c) ?? 0) > RETRY_MS)),
    ];
    for (let i = 0; i < missing.length; i += 100) {
      const texts = missing.slice(i, i + 100);
      const res = await fetch("/api/admin/translate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ target, texts }),
      }).catch(() => null);
      const body = res ? ((await res.json().catch(() => null)) as { translations?: (string | null)[]; error?: string } | null) : null;
      if (!res?.ok || !body?.translations) return body?.error ?? (res ? `Lỗi ${res.status}` : "Không gọi được máy chủ");
      texts.forEach((t, k) => {
        const done = body.translations![k];
        if (typeof done === "string" && done) cache.set(t, done);
        else failedAt.set(t, Date.now());
      });
    }
    if (missing.length) saveCache(target);
    if (!live()) return null;
    for (const { node, orig } of want) {
      if (!node.isConnected || node.nodeValue !== orig) continue;
      const { lead, core, tail } = split(orig);
      const done = cache.get(core);
      if (!done || done === core) continue;
      const shown = lead + done + tail;
      recs.set(node, { orig, shown });
      touched.add(node);
      node.nodeValue = shown;
    }
    return null;
  } finally {
    running = false;
  }
}

export function PageTranslator() {
  const [target, setTarget] = useState<Target | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PREF);
      /* read once on mount; the server cannot know the browser's choice */
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved === "en" || saved === "vi") setTarget(saved);
    } catch {
      /* blocked: off */
    }
  }, []);

  useEffect(() => {
    if (!target) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const run = () => {
      setBusy(true);
      void pass(target, () => live).then((err) => {
        if (!live) return;
        setBusy(false);
        setError(err);
      });
    };
    run();
    const obs = new MutationObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, 400);
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => {
      live = false;
      obs.disconnect();
      if (timer) clearTimeout(timer);
      restore();
      setError(null);
    };
  }, [target]);

  const pick = (t: Target) => {
    const next = target === t ? null : t;
    setTarget(next);
    try {
      if (next) localStorage.setItem(PREF, next);
      else localStorage.removeItem(PREF);
    } catch {
      /* not kept */
    }
  };

  const side = (t: Target, label: string, title: string) => (
    <button
      type="button"
      aria-pressed={target === t}
      title={target === t ? "Tắt dịch — về chữ gốc" : title}
      onClick={() => pick(t)}
      className={`min-w-[40px] rounded-full px-3 py-2 text-[13px] font-bold transition-colors ${
        target === t ? "bg-pf-text text-pf-bg" : "text-pf-body/80 hover:text-pf-text"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div
      data-no-translate
      title={error ?? undefined}
      role="group"
      aria-label="Dịch trang"
      className={`flex h-11 items-center rounded-full border p-[3px] backdrop-blur ${error ? "border-pf-danger/60" : "border-pf-border"} bg-pf-bg/90`}
    >
      {side("en", "EN", "Dịch trang sang tiếng Anh")}
      {side("vi", "VI", "Dịch trang sang tiếng Việt")}
      {busy && <span className="mx-1.5 size-2 animate-pulse rounded-full bg-pf-primary-hi" aria-label="Đang dịch" />}
      {error && !busy && (
        <span className="mx-1.5 size-2 rounded-full bg-pf-danger" role="img" aria-label={error} />
      )}
    </div>
  );
}
