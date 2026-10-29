"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { AdminNotice } from "@/lib/adminNotifications";
import { Icon } from "../ui";

/* ==========================================================================
   The notices: while an admin page is open, every 30 seconds it asks what
   happened — a new upgrade or a customer's reply in Build 2 page or Store set
   upsell, a Claude Build set finished or failed. Each new one is
   - said out loud in Vietnamese, with a chime, when the sound is on;
   - shown as a card in the corner for a few seconds;
   - kept in the bell's list (the last 48 hours), counted on the bell until
     the list is opened.

   A browser plays sound only after a click on the page, so the sound is
   switched on by the button in the sidebar (and remembered). Everything that
   was already there when the page first opened on this browser is marked
   heard and seen, not read out; the ids are shared by every open admin tab,
   so one tab speaks, not three.

   <AdminNotifier /> polls and holds the sound switch; <NotificationBell />
   reads the same list. The shell mounts one of each.
   ========================================================================== */

const SOUND_KEY = "pfd-sound";
const HEARD_KEY = "pfd-notices-heard";
const SEEN_KEY = "pfd-notices-seen";
const POLL_MS = 30_000;

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private window: the sound still works, it just forgets */
  }
};
const idSet = (key: string): Set<string> | null => {
  const raw = read(key);
  if (raw === null) return null;
  try {
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
};
const saveIds = (key: string, s: Set<string>) => write(key, JSON.stringify([...s].slice(-500)));

/* ---- the shared list ------------------------------------------------------ */

const CHANGE = "pfd-notices-change";
let notices: AdminNotice[] = [];
let unseen = 0;
const EMPTY: AdminNotice[] = [];

function recount() {
  const seen = idSet(SEEN_KEY) ?? new Set<string>();
  unseen = notices.filter((n) => !seen.has(n.id)).length;
}
function publish(next: AdminNotice[]) {
  notices = next;
  recount();
  window.dispatchEvent(new Event(CHANGE));
}
const subscribe = (cb: () => void) => {
  /* another tab opened the list: its "seen" lands here through storage */
  const onStorage = (e: StorageEvent) => {
    if (e.key === SEEN_KEY) {
      recount();
      cb();
    } else if (e.key === SOUND_KEY) cb();
  };
  window.addEventListener(CHANGE, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE, cb);
    window.removeEventListener("storage", onStorage);
  };
};
function markAllSeen() {
  const seen = idSet(SEEN_KEY) ?? new Set<string>();
  for (const n of notices) seen.add(n.id);
  saveIds(SEEN_KEY, seen);
  recount();
  window.dispatchEvent(new Event(CHANGE));
}

/* ---- sound ---------------------------------------------------------------- */

function chime(tone: AdminNotice["tone"]) {
  try {
    const ctx = new AudioContext();
    const notes = tone === "celebrate" ? [523, 659, 784, 1047] : tone === "done" ? [659, 880] : tone === "reply" ? [880, 988, 880] : [330, 247];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      const t = ctx.currentTime + i * 0.14;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.18, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.4);
    });
    setTimeout(() => void ctx.close(), notes.length * 140 + 600);
  } catch {
    /* no Web Audio: the voice alone */
  }
}

function speak(text: string) {
  if (!("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "vi-VN";
  const vi = window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith("vi"));
  if (vi) u.voice = vi;
  u.rate = 1;
  window.speechSynthesis.speak(u);
}

const ICON: Record<AdminNotice["tone"], string> = { celebrate: "🎉", done: "✅", reply: "💬", error: "⚠️" };
const BORDER: Record<AdminNotice["tone"], string> = {
  celebrate: "border-pf-warn/50",
  done: "border-pf-success/50",
  reply: "border-pf-primary/50",
  error: "border-pf-danger/50",
};

const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (m < 1) return "vừa xong";
  if (m < 60) return `${m} phút trước`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} giờ trước` : `${Math.round(h / 24)} ngày trước`;
};

/* ---- the poller and the sound switch -------------------------------------- */

export function AdminNotifier() {
  const on = useSyncExternalStore(subscribe, () => read(SOUND_KEY) === "on", () => false);
  const [cards, setCards] = useState<AdminNotice[]>([]);
  const onRef = useRef(on);

  useEffect(() => {
    onRef.current = on;
  }, [on]);

  useEffect(() => {
    /* voices load late in Chrome; asking once warms the list */
    if ("speechSynthesis" in window) window.speechSynthesis.getVoices();
  }, []);

  useEffect(() => {
    let live = true;
    const load = async () => {
      const r = await fetch("/api/admin/notifications").catch(() => null);
      if (!live || !r?.ok) return;
      const b = (await r.json().catch(() => null)) as { notices?: AdminNotice[] } | null;
      const list = b?.notices ?? [];
      const heard = idSet(HEARD_KEY);
      if (heard === null) {
        /* first time on this browser: what is there is old news */
        const ids = new Set(list.map((n) => n.id));
        saveIds(HEARD_KEY, ids);
        if (idSet(SEEN_KEY) === null) saveIds(SEEN_KEY, ids);
        publish(list);
        return;
      }
      publish(list);
      const fresh = list.filter((n) => !heard.has(n.id));
      if (!fresh.length) return;
      for (const n of fresh) heard.add(n.id);
      saveIds(HEARD_KEY, heard);
      setCards((c) => [...c, ...fresh].slice(-5));
      for (const n of fresh) setTimeout(() => setCards((c) => c.filter((x) => x.id !== n.id)), 15_000);
      if (onRef.current) {
        chime(fresh[0].tone);
        setTimeout(() => fresh.forEach((n) => speak(n.text)), 700);
      }
    };
    void load();
    const t = setInterval(() => void load(), POLL_MS);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);

  const toggle = () => {
    const next = !on;
    onRef.current = next;
    write(SOUND_KEY, next ? "on" : "off");
    window.dispatchEvent(new Event(CHANGE));
    if (next) {
      chime("done");
      speak("Đã bật thông báo âm thanh.");
    } else if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  };

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={on}
        title={on ? "Đang bật: đọc to khi có user upgrade mới, khách phản hồi hoặc Claude Build xong" : "Bật để nghe thông báo khi có user upgrade mới, khách phản hồi hoặc Claude Build xong"}
        className={`flex shrink-0 items-center gap-2 rounded-pf-md px-3 py-2 text-[13px] font-semibold transition-colors ${
          on ? "text-pf-success" : "text-pf-faint hover:text-pf-text"
        }`}
      >
        <Icon name={on ? "Bell" : "BellOff"} size={15} />
        Âm thanh: {on ? "Bật" : "Tắt"}
      </button>
      {cards.length > 0 && (
        <div role="status" aria-live="polite" className="fixed bottom-4 right-4 z-50 grid w-[min(360px,calc(100vw-32px))] gap-2">
          {cards.map((n) => (
            <div key={n.id} className={`flex items-start gap-2 rounded-pf-card border bg-pf-bg-deep p-3 text-[13px] text-pf-text shadow-2xl shadow-black/60 ${BORDER[n.tone]}`}>
              <span aria-hidden className="text-[16px]">
                {ICON[n.tone]}
              </span>
              <div className="flex-1">
                <p>{n.text}</p>
                {n.detail && <p className="mt-1 line-clamp-3 text-[12px] italic text-pf-muted">“{n.detail}”</p>}
              </div>
              <button type="button" aria-label="Đóng" onClick={() => setCards((c) => c.filter((x) => x.id !== n.id))} className="text-pf-faint hover:text-pf-text">
                <Icon name="X" size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ---- the bell ------------------------------------------------------------- */

export function NotificationBell() {
  const list = useSyncExternalStore(subscribe, () => notices, () => EMPTY);
  const count = useSyncExternalStore(subscribe, () => unseen, () => 0);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  /* Opening the list is reading it; what arrives while it is open is read too. */
  useEffect(() => {
    if (open && count > 0) markAllSeen();
  }, [open, count]);

  const newest = [...list].reverse();
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={count > 0 ? `Thông báo, ${count} mới` : "Thông báo"}
        className="relative grid size-9 place-items-center rounded-pf-md border border-pf-border bg-pf-bg-deep text-pf-text transition-colors hover:border-pf-primary-hi/50"
      >
        <Icon name="Bell" size={16} />
        {count > 0 && (
          <span className="absolute -right-2 -top-2 min-w-[20px] rounded-pf-pill bg-pf-danger px-1.5 text-center text-[11px] font-bold leading-[20px] text-white">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-50 grid max-h-[70vh] w-[min(400px,calc(100vw-32px))] grid-rows-[auto_1fr] overflow-hidden rounded-pf-card border border-pf-primary-hi/30 bg-pf-bg-deep shadow-2xl shadow-black/70">
          <div className="flex items-center justify-between border-b border-pf-border px-4 py-2.5">
            <span className="text-[13px] font-semibold text-pf-text">Thông báo</span>
            <span className="text-[11.5px] text-pf-faint">48 giờ qua</span>
          </div>
          {newest.length === 0 ? (
            <p className="px-4 py-6 text-center text-[12.5px] text-pf-faint">Chưa có thông báo nào.</p>
          ) : (
            <ul className="overflow-y-auto">
              {newest.map((n) => {
                const body = (
                  <>
                    <span aria-hidden className="text-[15px]">
                      {ICON[n.tone]}
                    </span>
                    <span className="grid flex-1 gap-0.5">
                      <span className="text-[12.5px] text-pf-text">{n.text}</span>
                      {n.detail && <span className="line-clamp-2 text-[12px] italic text-pf-muted">“{n.detail}”</span>}
                      <span className="text-[11px] text-pf-faint">{ago(n.at)}</span>
                    </span>
                  </>
                );
                const cls = "flex items-start gap-2.5 border-b border-pf-border/60 px-4 py-2.5 last:border-b-0";
                return (
                  <li key={n.id}>
                    {n.href ? (
                      <Link href={n.href} onClick={() => setOpen(false)} className={`${cls} hover:bg-pf-card-hi`}>
                        {body}
                      </Link>
                    ) : (
                      <div className={cls}>{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
