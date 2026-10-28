"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BUILD_STEPS, type BuildJob, type BuildJobStatus, type BuildTrigger } from "@/lib/claudeBuildShared";
import { Button, Icon, Panel } from "../../ui";
import { FIELD, api } from "./shared";

/* ==========================================================================
   Claude Build — collection sets built by a Claude routine, on demand.

   "Start build" queues N sets and fires the routine at once (its API
   trigger). While it works, each running set shows where it is — a step line
   (Nhận việc → … → Upload) with the routine's own words under it. Below,
   every set it was asked for, by state: Đang build, Chờ build, Đã build,
   Lỗi / Huỷ — each with its count. A built set is a normal set in the list
   underneath (as Preview), its .html and .pagefly already in.
   ========================================================================== */

type Data = { jobs: BuildJob[]; criteria: string; trigger: BuildTrigger };
type Tab = "running" | "queued" | "done" | "closed";

const TABS: { id: Tab; label: string; statuses: BuildJobStatus[] }[] = [
  { id: "running", label: "Đang build", statuses: ["running"] },
  { id: "queued", label: "Chờ build", statuses: ["queued"] },
  { id: "done", label: "Đã build", statuses: ["done"] },
  { id: "closed", label: "Lỗi / Huỷ", statuses: ["failed", "cancelled"] },
];

const STATUS: Record<BuildJobStatus, { label: string; cls: string }> = {
  running: { label: "Đang build", cls: "border-pf-primary-hi/30 bg-pf-primary/10 text-pf-primary-hi" },
  queued: { label: "Chờ build", cls: "border-pf-warn/30 bg-pf-warn/10 text-pf-warn" },
  done: { label: "Đã build", cls: "border-pf-success/30 bg-pf-success/10 text-pf-success" },
  failed: { label: "Lỗi", cls: "border-pf-danger/30 bg-pf-danger/10 text-pf-danger" },
  cancelled: { label: "Đã huỷ", cls: "border-pf-border bg-pf-card-hi text-pf-muted" },
};

function since(iso: string | null, now: number): string {
  if (!iso || !now) return "";
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return `${s} giây`;
  if (s < 3600) return `${Math.round(s / 60)} phút`;
  return `${Math.floor(s / 3600)} giờ ${Math.round((s % 3600) / 60)} phút`;
}

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }) : "—";

export function ClaudeBuild() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(0);
  const [tab, setTab] = useState<Tab>("running");
  const [starting, setStarting] = useState(false);
  const [count, setCount] = useState(1);
  const [note, setNote] = useState("");
  const [editCriteria, setEditCriteria] = useState(false);
  const [criteria, setCriteria] = useState("");
  const [editToken, setEditToken] = useState(false);
  const [token, setToken] = useState("");
  const [tick, setTick] = useState(0);

  const active = Boolean(data?.jobs.some((j) => j.status === "running" || j.status === "queued"));

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const res = await api<Data>("/api/admin/collection-pages/claude-build");
      if (!alive) return;
      if (res.ok) {
        setData({ jobs: res.jobs, criteria: res.criteria, trigger: res.trigger });
        setNow(Date.now());
        setError(null);
      } else setError(res.error);
    };
    void load();
    /* Fast while something is building, slow otherwise. */
    const t = setInterval(load, active ? 5_000 : 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [active, tick]);

  const post = async (body: unknown) => {
    setBusy(true);
    setError(null);
    const res = await api("/api/admin/collection-pages/claude-build", { method: "POST", body: JSON.stringify(body) });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return false;
    }
    setTick((n) => n + 1);
    return true;
  };

  if (!data)
    return (
      <Panel className="grid gap-1 p-4 text-[12.5px] text-pf-muted">
        <p className="flex items-center gap-2 text-[14px] font-semibold text-pf-text">
          <Icon name="Rocket" size={16} /> Claude Build
        </p>
        {error ?? "Đang tải…"}
      </Panel>
    );

  const counts = Object.fromEntries(TABS.map((t) => [t.id, data.jobs.filter((j) => t.statuses.includes(j.status)).length])) as Record<Tab, number>;
  const running = data.jobs.filter((j) => j.status === "running");
  const rows = data.jobs.filter((j) => TABS.find((t) => t.id === tab)!.statuses.includes(j.status));
  const builtPages = data.jobs.filter((j) => j.status === "done").reduce((n, j) => n + j.pages, 0);

  return (
    <Panel className="grid gap-4 border-pf-primary-hi/30 p-4">
      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-0.5">
          <p className="flex items-center gap-2 text-[14px] font-semibold text-pf-text">
            <Icon name="Rocket" size={16} />
            Claude Build
          </p>
          <p className="text-[12.5px] text-pf-muted">Claude routine dựng bộ collection page theo tiêu chí, rồi tự đưa .html và .pagefly vào đây.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" icon="Pencil" onClick={() => (setCriteria(data.criteria), setEditCriteria(!editCriteria))}>
            Tiêu chí build
          </Button>
          <Button icon="Rocket" onClick={() => setStarting(!starting)} disabled={busy}>
            Start build
          </Button>
        </div>
      </div>

      {/* start form */}
      {starting && (
        <div className="grid gap-2 rounded-pf-md border border-pf-border bg-pf-bg-deep p-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-[12px] text-pf-faint">
              Số bộ cần build
              <input
                type="number"
                min={1}
                max={20}
                value={count}
                onChange={(e) => setCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                className={`${FIELD} w-[110px]`}
              />
            </label>
            <label className="grid min-w-[240px] flex-1 gap-1 text-[12px] text-pf-faint">
              Ghi chú cho lượt này (không bắt buộc) — ngành, phong cách, dịp lễ…
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="VD: 3 bộ skincare, phong cách tối giản" className={FIELD} />
            </label>
            <Button
              icon="Rocket"
              disabled={busy}
              onClick={() =>
                void post({ action: "start", count, note: note.trim() || undefined }).then((ok) => {
                  if (ok) {
                    setStarting(false);
                    setNote("");
                    setTab("running");
                  }
                })
              }
            >
              Bắt đầu build {count} bộ
            </Button>
          </div>
          {!data.criteria.trim() && <p className="text-[12px] text-pf-faint">Chưa có ý tưởng thêm — routine build theo tiêu chí tổng.</p>}
        </div>
      )}

      {/* criteria editor */}
      {editCriteria && (
        <div className="grid gap-2 rounded-pf-md border border-pf-border bg-pf-bg-deep p-3">
          <p className="text-[12px] text-pf-faint">Ý tưởng thêm cho các lần build (không bắt buộc): phong cách, ngành, section hay hiệu ứng bạn muốn thấy… Routine kết hợp phần này với tiêu chí tổng (scripts/claude-build/criteria-premium.md); để trống thì chỉ dùng tiêu chí tổng.</p>
          <textarea value={criteria} onChange={(e) => setCriteria(e.target.value)} className={`${FIELD} min-h-[220px] font-mono text-[12.5px]`} />
          <div className="flex gap-2">
            <Button icon="Check" disabled={busy} onClick={() => void post({ action: "criteria", text: criteria }).then((ok) => ok && setEditCriteria(false))}>
              Lưu tiêu chí
            </Button>
            <Button variant="quiet" onClick={() => setEditCriteria(false)}>
              Huỷ
            </Button>
          </div>
        </div>
      )}

      {/* the routine */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-pf-muted">
        <span className={`size-2 rounded-full ${data.trigger.configured ? "bg-pf-success" : "bg-pf-warn"}`} aria-hidden />
        <span>
          Routine: {data.trigger.lastResult ?? (data.trigger.configured ? "sẵn sàng" : "chưa cấu hình API trigger")}
          {data.trigger.lastFiredAt && ` · ${since(data.trigger.lastFiredAt, now)} trước`}
        </span>
        {data.trigger.session && (
          <a href={data.trigger.session} target="_blank" rel="noreferrer" className="font-semibold text-pf-primary-hi hover:underline">
            Mở phiên Claude
          </a>
        )}
        {data.trigger.configured && (
          <button type="button" disabled={busy} onClick={() => void post({ action: "fire" })} className="font-semibold text-pf-body hover:text-pf-text">
            Gọi lại routine
          </button>
        )}
        {data.trigger.tokenFrom === "env" ? (
          <span className="text-pf-faint">Token: trên server (…{data.trigger.tokenEnd})</span>
        ) : (
          <button type="button" onClick={() => (setToken(""), setEditToken(!editToken))} className="font-semibold text-pf-body hover:text-pf-text">
            {data.trigger.tokenFrom === "panel" ? `Token: …${data.trigger.tokenEnd} · Đổi` : "Nhập trigger token"}
          </button>
        )}
      </div>

      {/* the trigger token, until it is on the VPS */}
      {editToken && data.trigger.tokenFrom !== "env" && (
        <div className="grid gap-2 rounded-pf-md border border-pf-border bg-pf-bg-deep p-3">
          <p className="text-[12px] text-pf-faint">
            Token của API trigger (sk-ant-oat01-…), để “Start build” gọi routine ngay. Lưu trên server, không hiện lại ở đây. Khi đặt
            CLAUDE_BUILD_TRIGGER_TOKEN trên VPS thì biến đó được dùng thay.
          </p>
          <input
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="sk-ant-oat01-…"
            className={`${FIELD} font-mono text-[12.5px]`}
          />
          <div className="flex gap-2">
            <Button icon="Check" disabled={busy || !token.trim()} onClick={() => void post({ action: "token", token }).then((ok) => ok && (setToken(""), setEditToken(false)))}>
              Lưu token
            </Button>
            {data.trigger.tokenFrom === "panel" && (
              <Button variant="ghost" disabled={busy} onClick={() => void post({ action: "token", token: "" }).then((ok) => ok && setEditToken(false))}>
                Xoá token
              </Button>
            )}
            <Button variant="quiet" onClick={() => (setToken(""), setEditToken(false))}>
              Huỷ
            </Button>
          </div>
        </div>
      )}

      {/* counts */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {(
          [
            ["Đang build", counts.running, "text-pf-primary-hi"],
            ["Chờ build", counts.queued, "text-pf-warn"],
            ["Đã build", counts.done, "text-pf-success"],
            ["Lỗi / Huỷ", counts.closed, "text-pf-danger"],
            ["Page đã build", builtPages, "text-pf-text"],
          ] as const
        ).map(([label, n, cls]) => (
          <div key={label} className="rounded-pf-md border border-pf-border bg-pf-bg-deep px-3 py-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-pf-faint">{label}</div>
            <div className={`font-display text-[22px] font-bold ${cls}`}>{n}</div>
          </div>
        ))}
      </div>

      {/* what is being built, step by step */}
      {running.map((j) => (
        <RunningJob key={j.id} job={j} now={now} busy={busy} onCancel={() => void post({ action: "cancel", id: j.id })} />
      ))}

      {/* the list */}
      <div className="grid gap-2">
        <div className="flex flex-wrap gap-1 rounded-xl border border-pf-border bg-pf-surface/60 p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                tab === t.id ? "bg-pf-primary text-white" : "text-pf-muted hover:text-pf-text"
              }`}
            >
              {t.label}
              <span className={`rounded-pf-pill px-1.5 text-[11px] ${tab === t.id ? "bg-white/20" : "bg-pf-card-hi text-pf-faint"}`}>{counts[t.id]}</span>
            </button>
          ))}
        </div>
        {rows.length === 0 ? (
          <p className="px-1 text-[12.5px] text-pf-faint">Không có bộ nào.</p>
        ) : (
          <ul className="grid gap-1.5">
            {rows.map((j) => (
              <JobRow key={j.id} job={j} busy={busy} onCancel={() => void post({ action: "cancel", id: j.id })} onRetry={() => void post({ action: "retry", id: j.id })} />
            ))}
          </ul>
        )}
      </div>
      {error && <p className="text-[12.5px] text-pf-danger">{error}</p>}
    </Panel>
  );
}

function RunningJob({ job, now, busy, onCancel }: { job: BuildJob; now: number; busy: boolean; onCancel: () => void }) {
  const place = BUILD_STEPS.findIndex((s) => s.key === job.step);
  return (
    <div className="grid gap-3 rounded-pf-md border border-pf-primary-hi/30 bg-pf-primary/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13.5px] font-semibold text-pf-text">
          {job.setName ?? "Bộ mới"}
          <span className="ml-2 text-[12px] font-normal text-pf-faint">
            bắt đầu {since(job.startedAt, now)} trước{job.note ? ` · ${job.note}` : ""}
          </span>
        </p>
        <Button size="sm" variant="danger" icon="X" className="border-transparent bg-pf-danger text-white hover:bg-pf-danger/85 disabled:bg-pf-card disabled:text-pf-faint" disabled={busy || job.cancelRequested} onClick={onCancel}>
          {job.cancelRequested ? "Đang dừng…" : "Dừng build"}
        </Button>
      </div>
      <div className="grid gap-1">
        <div className="h-2 overflow-hidden rounded-full bg-pf-bg-deep">
          <div className="h-full rounded-full bg-pf-primary transition-all" style={{ width: `${job.progress}%` }} />
        </div>
        <p className="text-[12px] text-pf-muted">
          {job.progress}% · {BUILD_STEPS[place]?.label ?? "Đang chờ routine"}
          {job.detail ? ` — ${job.detail}` : ""}
        </p>
      </div>
      <ol className="flex flex-wrap gap-x-1 gap-y-2">
        {BUILD_STEPS.map((s, i) => {
          const state = i < place ? "done" : i === place ? "now" : "next";
          return (
            <li key={s.key} className="flex items-center gap-1">
              <span
                className={`inline-flex items-center gap-1 rounded-pf-pill border px-2 py-0.5 text-[11.5px] font-semibold ${
                  state === "done"
                    ? "border-pf-success/30 bg-pf-success/10 text-pf-success"
                    : state === "now"
                      ? "border-pf-primary-hi bg-pf-primary/20 text-pf-text"
                      : "border-pf-border text-pf-faint"
                }`}
              >
                {state === "done" ? <Icon name="Check" size={11} /> : state === "now" ? <Icon name="Loader" size={11} className="animate-spin" /> : null}
                {s.label}
              </span>
              {i < BUILD_STEPS.length - 1 && <Icon name="ChevronRight" size={12} className="text-pf-faint" />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function JobRow({ job, busy, onCancel, onRetry }: { job: BuildJob; busy: boolean; onCancel: () => void; onRetry: () => void }) {
  const [open, setOpen] = useState(false);
  const s = STATUS[job.status];
  return (
    <li className="rounded-pf-md border border-pf-border bg-pf-bg-deep">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-[12.5px]">
        <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-1 font-semibold text-pf-text">
          <Icon name={open ? "ChevronDown" : "ChevronRight"} size={13} />
          {job.setName ?? (job.status === "queued" ? "Bộ chờ build" : "Bộ chưa đặt tên")}
        </button>
        <span className={`rounded-pf-pill border px-2 py-0.5 text-[11px] font-semibold ${s.cls}`}>{s.label}</span>
        {job.status === "done" && <span className="text-pf-muted">{job.pages} page</span>}
        {job.note && <span className="max-w-[320px] truncate text-pf-faint">{job.note}</span>}
        <span className="ml-auto text-pf-faint">
          {job.status === "done" ? `xong ${when(job.finishedAt)}` : job.status === "running" ? `từ ${when(job.startedAt)}` : `tạo ${when(job.createdAt)}`}
        </span>
        {job.setId && (
          <Link href={`/design/admin/collections/${job.setId}`} className="font-semibold text-pf-primary-hi hover:underline">
            Mở bộ
          </Link>
        )}
        {job.setSlug && job.status === "done" && (
          <a href={`/collection-pages/${job.setSlug}`} target="_blank" rel="noreferrer" className="font-semibold text-pf-body hover:text-pf-text">
            Xem trang
          </a>
        )}
        {job.status === "queued" && (
          <Button size="sm" variant="danger" icon="X" className="border-transparent bg-pf-danger text-white hover:bg-pf-danger/85 disabled:bg-pf-card disabled:text-pf-faint" disabled={busy} onClick={onCancel}>
            Huỷ
          </Button>
        )}
        {(job.status === "failed" || job.status === "cancelled") && (
          <Button size="sm" icon="RefreshCw" disabled={busy} onClick={onRetry}>
            Build lại
          </Button>
        )}
      </div>
      {open && (
        <div className="grid gap-1 border-t border-pf-border px-3 py-2 text-[12px]">
          {job.error && <p className="text-pf-danger">Lỗi: {job.error}</p>}
          {job.requestedBy && <p className="text-pf-faint">Yêu cầu bởi {job.requestedBy}</p>}
          {job.log.length === 0 ? (
            <p className="text-pf-faint">Chưa có bước nào.</p>
          ) : (
            <ol className="grid gap-0.5">
              {job.log.map((l, i) => (
                <li key={i} className="text-pf-body">
                  <span className="text-pf-faint">{when(l.at)}</span> · {BUILD_STEPS.find((s) => s.key === l.step)?.label ?? l.step}
                  {l.detail ? ` — ${l.detail}` : ""}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </li>
  );
}
