"use client";

import { useEffect, useState } from "react";
import type { ClaudeReviewState } from "@/lib/claudeReview";
import { Button, Icon, Panel } from "../../ui";
import { api } from "./shared";

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
const STALE_MS = 25 * 60_000;

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

export function ClaudeReview() {
  const [state, setState] = useState<ClaudeReviewState | null>(null);
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

  const act = async (action: "start" | "stop") => {
    setBusy(true);
    const res = await api<{ state: ClaudeReviewState }>("/api/admin/collection-pages/claude-review", {
      method: "POST",
      body: JSON.stringify({ action }),
    });
    if (res.ok) {
      setState(res.state);
      setNow(Date.now());
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
  const total = finished + state.queue.length + (state.current ? 1 : 0);
  const pct = total ? Math.round((finished / total) * 100) : 0;
  const left = state.queue.length + (state.current ? 1 : 0);
  const eta = state.avgSecs && left ? duration(state.avgSecs * left) : null;
  const counts = state.done.reduce<Record<string, number>>((m, d) => ((m[d.result] = (m[d.result] ?? 0) + 1), m), {});
  const active = state.status === "running" || state.status === "requested" || state.status === "stopping";

  const headline =
    state.status === "requested"
      ? `Requested ${ago(state.requestedAt, now)} — Claude picks it up within the hour`
      : state.status === "running"
        ? stale
          ? `No word from Claude for ${ago(state.heartbeatAt, now).replace(" ago", "")} — the run may have stopped; the next hourly check resumes it`
          : `Running · last update ${ago(state.heartbeatAt, now)}`
        : state.status === "stopping"
          ? "Stopping after the current set"
          : state.status === "finished"
            ? "Finished — every set has been reviewed"
            : state.status === "stopped"
              ? "Stopped"
              : "Not running";

  return (
    <Panel className="grid gap-3 border-pf-primary-hi/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-0.5">
          <p className="flex items-center gap-2 text-[14px] font-semibold text-pf-text">
            <Icon name="Sparkles" size={16} />
            Claude Review
          </p>
          <p className="text-[12.5px] text-pf-muted">{headline}</p>
        </div>
        <div className="flex items-center gap-2">
          {active ? (
            <Button variant="ghost" icon="X" onClick={() => void act("stop")} disabled={busy || state.status === "stopping"}>
              {state.status === "requested" ? "Cancel" : "Stop"}
            </Button>
          ) : (
            <Button icon="Sparkles" onClick={() => void act("start")} disabled={busy}>
              Claude Review
            </Button>
          )}
        </div>
      </div>

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
            {state.queue[0] && (
              <p className="text-pf-body">
                <span className="text-pf-faint">Next:</span> {state.queue[0].name}
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
                {state.queue.map((q, i) => (
                  <p key={q.slug} className="text-[12.5px] text-pf-body">
                    <span className="text-pf-faint">{i + 1}.</span> {q.name}
                  </p>
                ))}
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
      {error && <p className="text-[12.5px] text-red-400">{error}</p>}
    </Panel>
  );
}
