"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { AdminNotice } from "@/lib/adminNotifications";
import { Icon } from "../ui";

/* ==========================================================================
   The sound notice: while an admin page is open, every 30 seconds it asks
   what happened — a new upgrade in Build 2 page or Store set upsell, a Claude
   Build set finished or failed — and says it out loud in Vietnamese, with a
   chime and a card in the corner.

   A browser plays sound only after a click on the page, so the sound is
   switched on by the button in the sidebar (and remembered). Everything that
   was already there when the page opened is marked heard, not read out; the
   ids heard are shared by every open admin tab, so one tab speaks, not three.
   ========================================================================== */

const SOUND_KEY = "pfd-sound";
const HEARD_KEY = "pfd-notices-heard";
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
const heardIds = (): Set<string> | null => {
  const raw = read(HEARD_KEY);
  if (raw === null) return null;
  try {
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
};
const saveHeard = (s: Set<string>) => write(HEARD_KEY, JSON.stringify([...s].slice(-500)));

function chime(tone: AdminNotice["tone"]) {
  try {
    const ctx = new AudioContext();
    const notes = tone === "celebrate" ? [523, 659, 784, 1047] : tone === "done" ? [659, 880] : [330, 247];
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

/* The on/off switch lives in localStorage, shared by every admin tab. */
const SOUND_EVENT = "pfd-sound-change";
const subscribeSound = (cb: () => void) => {
  window.addEventListener("storage", cb);
  window.addEventListener(SOUND_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(SOUND_EVENT, cb);
  };
};

export function AdminNotifier() {
  const on = useSyncExternalStore(subscribeSound, () => read(SOUND_KEY) === "on", () => false);
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
      const notices = b?.notices ?? [];
      const heard = heardIds();
      if (heard === null) {
        /* first time on this browser: what is there is old news */
        saveHeard(new Set(notices.map((n) => n.id)));
        return;
      }
      const fresh = notices.filter((n) => !heard.has(n.id));
      if (!fresh.length) return;
      for (const n of fresh) heard.add(n.id);
      saveHeard(heard);
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
    window.dispatchEvent(new Event(SOUND_EVENT));
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
        title={on ? "Đang bật: đọc to khi có user upgrade mới hoặc Claude Build xong" : "Bật để nghe thông báo khi có user upgrade mới hoặc Claude Build xong"}
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
            <div
              key={n.id}
              className={`flex items-start gap-2 rounded-pf-card border bg-pf-card p-3 text-[13px] text-pf-text shadow-lg ${
                n.tone === "error" ? "border-pf-danger/50" : n.tone === "celebrate" ? "border-pf-warn/50" : "border-pf-success/50"
              }`}
            >
              <span aria-hidden className="text-[16px]">
                {n.tone === "celebrate" ? "🎉" : n.tone === "done" ? "✅" : "⚠️"}
              </span>
              <p className="flex-1">{n.text}</p>
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
