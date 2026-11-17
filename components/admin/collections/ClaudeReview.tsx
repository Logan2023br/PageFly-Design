"use client";

import { useEffect, useState } from "react";
import type { ClaudeReviewState } from "@/lib/claudeReview";
import { Button, Icon, Panel } from "../../ui";
import { FoldTitle, api, useFolded } from "./shared";

/* ==========================================================================
   Claude Review — the button that asks for an automated review run, and the
   run's progress: the set on the bench and its step, how many are done, what
   is left, what comes next and roughly when it ends.

   The button only ASKS. A scheduled Claude task looks at the request about once
   an hour, so a run can take up to an hour to start; the panel says so. The
   numbers come from the runner itself (PUT /claude-review), polled here.
   ========================================================================== */

const POLL_MS = 15_000;
/** a "running" run with no heartbeat for this long has died */
const STALE_MS = 12 * 60_000;

function ago(iso: string | null, now: number) {
  if (!iso || !now) return "";
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return `${(s / 3600).toFixed(1)} h ago`;
}

function duration(secs: number) {
  const m = Math.round(secs / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min`;
}

const RESULT: Record<string, { label: string; cls: string }> = {
  done: { label: "Done", cls: "text-emerald-400" },
  reimport: { label: "Import again", cls: "text-amber-400" },
  skipped: { label: "Skipped", cls: "text-pf-faint" },
  failed: { label: "Failed", cls: "text-red-400" },
};

/** A set the admin can pick for a review. */
export type ReviewPick = { slug: string; name: string; reviewable: boolean; why?: string; reviewed: boolean };

export function ClaudeReview({ sets = [] }: { sets?: ReviewPick[] }) {
  const [state, setState] = useState<ClaudeReviewState | null>(null);
  const [picking, setPicking] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [folded, flip] = useFolded("claude-review");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [allErrors, setAllErrors] = useState(false);
  /* the clock, read when the state arrives — not during render */
  const [now, setNow] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const res = await api<{ state: ClaudeReviewState }>("/api/admin/collection-pages/claude-review");
      if (!alive) return;
      if (res.ok) {
        setState(res.state);
        setNow(Date.now());
        setError(null);
      } else setError(res.error);
    };
    void load();
    const t = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const act = async (action: "start" | "stop" | "disable" | "enable" | "pause" | "resume", slug?: string, slugs?: string[]) => {
    setBusy(true);
    const res = await api<{ state: ClaudeReviewState }>("/api/admin/collection-pages/claude-review", {
      method: "POST",
      body: JSON.stringify(slugs ? { action, slugs } : slug ? { action, slug } : { action }),
    });
    if (res.ok) {
      setState(res.state);
      setNow(Date.now());
      setPicking(false);
    } else setError(res.error);
    setBusy(false);
  };

  if (!state) {
    return error ? (
      <Panel className="p-4 text-[13px] text-pf-muted">Claude Review: {error}</Panel>
    ) : null;
  }

  const stale =
    state.status === "running" && state.heartbeatAt && now - Date.parse(state.heartbeatAt) > STALE_MS;
  const finished = state.done.length;
  const inQueue = !!state.current && state.queue.some((q) => q.slug === state.current?.slug);
  const total = finished + state.queue.length + (state.current && !inQueue ? 1 : 0);
  const pct = total ? Math.round((finished / total) * 100) : 0;
  const left = state.queue.length + (state.current && !inQueue ? 1 : 0);
  const eta = state.avgSecs && left ? duration(state.avgSecs * left) : null;
  const counts = state.done.reduce<Record<string, number>>((m, d) => ((m[d.result] = (m[d.result] ?? 0) + 1), m), {});
  /* the set on the bench is still at the head of the queue — "next" is the one after it */
  const nextUp = state.queue.find((q) => q.slug !== state.current?.slug);
  const active = state.status === "running" || state.status === "requested" || state.status === "stopping";

  const paused = new Set(state.paused ?? []);
  const headline = state.disabled
    ? `Đã tắt ${ago(state.disabled.at, now)}${state.disabled.by ? ` (${state.disabled.by})` : ""} — không chạy gì nữa cho tới khi bật lại`
    : state.status === "requested"
      ? `Requested ${ago(state.requestedAt, now)} — Claude picks it up within the hour`
      : state.status === "running"
        ? stale
          ? `No word from Claude for ${ago(state.heartbeatAt, now).replace(" ago", "")} — the run stopped; press Run now on the routine, or the next hourly check resumes it`
          : `Running · last update ${ago(state.heartbeatAt, now)}`
        : state.status === "stopping"
          ? "Stopping after the current set"
          : state.status === "finished"
            ? "Finished — the sets of this run are reviewed"
            : state.status === "stopped"
              ? "Stopped"
              : "Not running";

  if (folded)
    return (
      <Panel className="flex flex-wrap items-center gap-x-3 gap-y-1 border-pf-primary-hi/30 px-4 py-3">
        <FoldTitle icon="Sparkles" title="Claude Review" folded onFlip={flip} />
        <span className="text-[12.5px] text-pf-muted">
          {headline}
          {total > 0 ? ` · ${finished} / ${total} sets` : ""}
        </span>
      </Panel>
    );

  return (
    <Panel className="grid gap-3 border-pf-primary-hi/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-0.5">
          <FoldTitle icon="Sparkles" title="Claude Review" folded={false} onFlip={flip} />
          <p className="text-[12.5px] text-pf-muted">{headline}</p>
        </div>
        <div className="flex items-center gap-2">
          {state.disabled ? (
            <Button icon="Play" onClick={() => void act("enable")} disabled={busy}>
              Bật lại
            </Button>
          ) : (
            <Button variant="ghost" icon="Pause" onClick={() => void act("disable")} disabled={busy}>
              Tắt hẳn
            </Button>
          )}
          {state.disabled ? null : active ? (
            <Button variant="ghost" icon="X" onClick={() => void act("stop")} disabled={busy || state.status === "stopping"}>
              {state.status === "requested" ? "Cancel" : "Stop"}
            </Button>
          ) : (
            <Button icon="Sparkles" onClick={() => setPicking(!picking)} disabled={busy}>
              Claude Review
            </Button>
          )}
        </div>
      </div>

      {picking && !active && !state.disabled && (
        <Picker sets={sets} busy={busy} onCancel={() => setPicking(false)} onStart={(slugs) => void act("start", undefined, slugs)} />
      )}

      {total > 0 && (
        <>
          <div className="grid gap-1.5">
            <div className="h-2 overflow-hidden rounded-full bg-pf-bg-deep">
              <div className="h-full rounded-full bg-pf-primary transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-[12.5px] text-pf-muted">
              {finished} / {total} sets · {pct}%
              {counts.done ? ` · ${counts.done} done` : ""}
              {counts.reimport ? ` · ${counts.reimport} to import again` : ""}
              {counts.failed ? ` · ${counts.failed} failed` : ""}
              {counts.skipped ? ` · ${counts.skipped} skipped` : ""}
              {eta ? ` · about ${eta} left` : ""}
              {state.avgSecs ? ` · ~${duration(state.avgSecs)} a set` : ""}
            </p>
          </div>

          <div className="grid gap-1 text-[13px]">
            {state.current && (
              <p className="text-pf-text">
                <span className="text-pf-faint">Now:</span> <b>{state.current.name}</b> — {state.current.step}{" "}
                <span className="text-pf-faint">(since {ago(state.current.startedAt, now)})</span>
              </p>
            )}
            {nextUp && (
              <p className="text-pf-body">
                <span className="text-pf-faint">Next:</span> {nextUp.name}
              </p>
            )}
            {state.message && <p className="text-pf-muted">{state.message}</p>}
          </div>

          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="flex items-center gap-1 justify-self-start text-[12.5px] font-semibold text-pf-muted hover:text-pf-text"
          >
            <Icon name={open ? "ChevronDown" : "ChevronRight"} size={14} />
            {open ? "Hide" : "Show"} the list ({finished} finished, {state.queue.length} waiting)
          </button>

          {open && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid content-start gap-1">
                <p className="text-[12px] font-semibold uppercase tracking-wide text-pf-faint">Finished</p>
                {[...state.done].reverse().map((d) => (
                  <p key={d.slug + d.finishedAt} className="text-[12.5px] text-pf-body" title={d.note}>
                    <span className={RESULT[d.result]?.cls}>{RESULT[d.result]?.label}</span> · {d.name}{" "}
                    <span className="text-pf-faint">
                      {new Date(d.finishedAt).toLocaleString()}
                      {d.secs ? ` · ${duration(d.secs)}` : ""}
                      {d.folder ? ` · ${d.folder}` : ""}
                    </span>
                    {d.note && <span className="block text-[12px] text-pf-faint">{d.note}</span>}
                  </p>
                ))}
              </div>
              <div className="grid content-start gap-1">
                <p className="text-[12px] font-semibold uppercase tracking-wide text-pf-faint">Waiting, in order</p>
                {state.queue.map((q, i) => {
                  const p = paused.has(q.slug);
                  return (
                    <p key={q.slug} className="flex items-center gap-2 text-[12.5px] text-pf-body">
                      <span className="text-pf-faint">{i + 1}.</span>
                      <span className={p ? "text-pf-faint line-through" : ""}>{q.name}</span>
                      {p && <span className="text-[11.5px] text-amber-400">Tạm dừng</span>}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void act(p ? "resume" : "pause", q.slug)}
                        className="ml-auto text-[12px] font-semibold text-pf-muted hover:text-pf-text disabled:opacity-50"
                      >
                        {p ? "▶ Tiếp tục" : "⏸ Tạm dừng"}
                      </button>
                    </p>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
      {state.errors?.length > 0 && (
        <div className="grid gap-1.5 rounded-pf-md border border-red-400/30 bg-red-400/5 p-3">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-red-400">
            <Icon name="TriangleAlert" size={15} />
            {state.errors.length} {state.errors.length === 1 ? "error" : "errors"} during the run
          </p>
          {[...state.errors]
            .reverse()
            .slice(0, allErrors ? undefined : 5)
            .map((e, i) => (
              <p key={e.at + i} className="text-[12.5px] text-pf-body">
                <span className="text-pf-faint">{new Date(e.at).toLocaleString()}</span>
                {e.name ? <> · <b>{e.name}</b></> : " · run"} · {e.step}:{" "}
                <span className="whitespace-pre-wrap text-red-300">{e.message}</span>
              </p>
            ))}
          {state.errors.length > 5 && (
            <button
              type="button"
              onClick={() => setAllErrors(!allErrors)}
              className="justify-self-start text-[12.5px] font-semibold text-pf-muted hover:text-pf-text"
            >
              {allErrors ? "Show the latest 5" : `Show all ${state.errors.length}`}
            </button>
          )}
        </div>
      )}
      {(state.history?.length ?? 0) > 0 && (
        <div className="grid gap-1.5">
          <button
            type="button"
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-1 justify-self-start text-[12.5px] font-semibold text-pf-muted hover:text-pf-text"
          >
            <Icon name={showHistory ? "ChevronDown" : "ChevronRight"} size={14} />
            Lịch sử review ({state.history.length} bộ)
          </button>
          {showHistory && <History items={state.history} />}
        </div>
      )}
      {error && <p className="text-[12.5px] text-red-400">{error}</p>}
    </Panel>
  );
}

/** Earlier runs: newest first, grouped by day — when, which set, what came of it. */
function History({ items }: { items: ClaudeReviewState["history"] }) {
  const days = new Map<string, typeof items>();
  for (const d of [...items].sort((a, b) => b.finishedAt.localeCompare(a.finishedAt))) {
    const day = new Date(d.finishedAt).toLocaleDateString("vi-VN");
    days.set(day, [...(days.get(day) ?? []), d]);
  }
  return (
    <div className="grid max-h-[420px] gap-3 overflow-y-auto rounded-pf-md border border-pf-border bg-pf-bg-deep p-3">
      {[...days].map(([day, list]) => (
        <div key={day} className="grid gap-1">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-pf-faint">
            {day} · {list.length} bộ
          </p>
          {list.map((d) => (
            <p key={d.slug + d.finishedAt} className="text-[12.5px] text-pf-body" title={d.note}>
              <span className="text-pf-faint">{new Date(d.finishedAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</span>{" "}
              · <b>{d.name}</b> · <span className={RESULT[d.result]?.cls}>{RESULT[d.result]?.label}</span>
              {d.secs ? <span className="text-pf-faint"> · {duration(d.secs)}</span> : null}
              {d.note && <span className="block text-[12px] text-pf-faint">{d.note}</span>}
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Pick the sets to review: search, tick, start. */
function Picker({ sets, busy, onCancel, onStart }: { sets: ReviewPick[]; busy: boolean; onCancel: () => void; onStart: (slugs: string[]) => void }) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const shown = sets.filter((s) => !q.trim() || `${s.name} ${s.slug}`.toLowerCase().includes(q.trim().toLowerCase()));
  const flip = (slug: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(slug)) n.delete(slug);
      else n.add(slug);
      return n;
    });
  return (
    <div className="grid gap-2 rounded-pf-md border border-pf-border bg-pf-bg-deep p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[13px] font-semibold text-pf-text">Chọn bộ muốn review</p>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm theo tên…"
          className="h-8 min-w-[200px] flex-1 rounded-pf-md border border-pf-border bg-pf-card px-2.5 text-[12.5px] text-pf-text outline-none focus:border-pf-border-hi"
        />
        <button type="button" className="text-[12px] font-semibold text-pf-muted hover:text-pf-text" onClick={() => setPicked(new Set())}>
          Bỏ chọn
        </button>
      </div>
      <div className="grid max-h-[320px] gap-0.5 overflow-y-auto">
        {shown.map((s) => (
          <label
            key={s.slug}
            className={`flex items-center gap-2 rounded px-1.5 py-1 text-[12.5px] ${s.reviewable ? "cursor-pointer text-pf-body hover:bg-pf-card" : "text-pf-faint"}`}
            title={s.why}
          >
            <input type="checkbox" disabled={!s.reviewable} checked={picked.has(s.slug)} onChange={() => flip(s.slug)} />
            <span className="truncate">{s.name}</span>
            {s.reviewed && <span className="text-[11px] text-emerald-400">đã review</span>}
            {!s.reviewable && s.why && <span className="text-[11px]">· {s.why}</span>}
          </label>
        ))}
        {shown.length === 0 && <p className="text-[12.5px] text-pf-faint">Không có bộ nào.</p>}
      </div>
      <div className="flex items-center gap-2">
        <Button icon="Sparkles" disabled={busy || picked.size === 0} onClick={() => onStart([...picked])}>
          Bắt đầu review ({picked.size} bộ)
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Huỷ
        </Button>
        <span className="text-[12px] text-pf-faint">Claude nhận việc trong vòng 1 giờ (lần chạy kế tiếp của routine).</span>
      </div>
    </div>
  );
}
