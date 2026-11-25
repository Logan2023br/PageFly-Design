"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BUILD_STEPS, type BuildJob, type BuildJobStatus, type BuildTrigger } from "@/lib/claudeBuildShared";
import { Button, Icon, Panel } from "../../ui";
import { FIELD, FoldTitle, api, useFolded } from "./shared";

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
type Tab = "running" | "export" | "queued" | "done" | "closed";

const TABS: { id: Tab; label: string; statuses: BuildJobStatus[] }[] = [
  { id: "running", label: "Đang build", statuses: ["running"] },
  { id: "export", label: "Chờ upload .pagefly", statuses: ["export"] },
  { id: "queued", label: "Chờ build", statuses: ["queued"] },
  { id: "done", label: "Đã build", statuses: ["done"] },
  { id: "closed", label: "Lỗi / Huỷ", statuses: ["failed", "cancelled"] },
];

const STATUS: Record<BuildJobStatus, { label: string; cls: string }> = {
  running: { label: "Đang build", cls: "border-pf-primary-hi/30 bg-pf-primary/10 text-pf-primary-hi" },
  export: { label: "Chờ upload .pagefly", cls: "border-pf-primary-hi/40 bg-pf-card-hi text-pf-text" },
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
  const [folded, flip] = useFolded("claude-build");
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
          <Icon name="Rocket" size={16} /> Claude Build Premium
        </p>
        {error ?? "Đang tải…"}
      </Panel>
    );

  const counts = Object.fromEntries(TABS.map((t) => [t.id, data.jobs.filter((j) => t.statuses.includes(j.status)).length])) as Record<Tab, number>;
  const running = data.jobs.filter((j) => j.status === "running");
  const waiting = data.jobs.filter((j) => j.status === "export");
  const rows = data.jobs.filter((j) => TABS.find((t) => t.id === tab)!.statuses.includes(j.status));
  const builtPages = data.jobs.filter((j) => j.status === "done").reduce((n, j) => n + j.pages, 0);

  if (folded)
    return (
      <Panel className="flex flex-wrap items-center gap-x-3 gap-y-1 border-pf-primary-hi/30 px-4 py-3">
        <FoldTitle icon="Rocket" title="Claude Build Premium" folded onFlip={flip} />
        <span className="text-[12.5px] text-pf-muted">
          Đang build {counts.running}
          {counts.export ? ` · Chờ upload .pagefly ${counts.export}` : ""} · Chờ build {counts.queued} · Đã build {counts.done}
          {counts.closed ? ` · Lỗi / huỷ ${counts.closed}` : ""}
        </span>
      </Panel>
    );

  return (
    <Panel className="grid gap-4 border-pf-primary-hi/30 p-4">
      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-0.5">
          <FoldTitle icon="Rocket" title="Claude Build Premium" folded={false} onFlip={flip} />
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
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={Math.min(14, Math.max(4, note.split("\n").length + Math.ceil(note.length / 140)))} placeholder="VD: 3 bộ skincare, phong cách tối giản" className={`${FIELD} resize-y`} />
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
          {error && <p className="text-[12.5px] text-pf-danger">Không bắt đầu được: {error}</p>}
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
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {(
          [
            ["Đang build", counts.running, "text-pf-primary-hi"],
            ["Chờ upload .pagefly", counts.export, "text-pf-text"],
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

      {/* built in the Logan store, waiting for someone to export the pages */}
      {waiting.map((j) => (
        <ExportJob key={j.id} job={j} busy={busy} onDone={() => setTick((n) => n + 1)} onCancel={() => void post({ action: "cancel", id: j.id })} />
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
              <JobRow key={j.id} job={j} busy={busy} onCancel={() => void post({ action: "cancel", id: j.id })} onRetry={(mode) => void post({ action: "retry", id: j.id, mode })}
                onAwaitExport={() => void post({ action: "await_export", id: j.id })} />
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

type ExportAnswer = {
  stored: { slug: string; entry: string }[];
  unmatched: string[];
  missing: string[];
  done: boolean;
  /** one page left, one entry unnamed: matched to it, said so */
  auto?: { entry: string; slug: string }[];
};

/* A set the routine built in the Logan store. Someone opens each page in the
   PageFly editor, exports it (one by one, or "All Pages" at once), and drops
   the file here: each page's .pagefly goes into the set; when every page has
   one, the build is done. A page whose name in the file matches none (PageFly
   cuts long names) is picked by hand: a select under the drop zone. */
function ExportJob({ job, busy, onDone, onCancel }: { job: BuildJob; busy: boolean; onDone: () => void; onCancel: () => void }) {
  const [sending, setSending] = useState(false);
  const [answer, setAnswer] = useState<ExportAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  /* the files that held a page nobody could name, kept to send again with the admin's choice */
  const [pending, setPending] = useState<{ file: File; entries: string[] }[]>([]);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [autoNotes, setAutoNotes] = useState<string[]>([]);
  const labelOf = (slug: string) => job.loganPages.find((p) => p.slug === slug)?.label ?? slug;

  const upload = (file: File, assign?: Record<string, string>) =>
    api<ExportAnswer>(
      `/api/admin/collection-pages/claude-build/export?job=${encodeURIComponent(job.id)}&name=${encodeURIComponent(file.name)}${
        assign ? `&assign=${encodeURIComponent(JSON.stringify(assign))}` : ""
      }`,
      { method: "PUT", body: file, headers: { "Content-Type": "application/octet-stream" } },
    );

  const merge = (res: ExportAnswer, prev: ExportAnswer | null): ExportAnswer => {
    const stored = [...(prev?.stored ?? [])];
    for (const s of res.stored) if (!stored.some((x) => x.slug === s.slug)) stored.push(s);
    return { ...res, stored };
  };

  /* Every dropped file goes up one after another; the answers add up, so
     seven single-page .pagefly files tick off seven pages. */
  const send = async (list: FileList | null | undefined) => {
    const files = Array.from(list ?? []);
    if (files.length === 0) return;
    setSending(true);
    setError(null);
    const errors: string[] = [];
    let acc = answer;
    const waiting: { file: File; entries: string[] }[] = [];
    const notes: string[] = [];
    for (const file of files) {
      const res = await upload(file);
      if (!res.ok) {
        errors.push(`${file.name}: ${res.error}`);
        continue;
      }
      acc = merge(res, acc);
      if (res.unmatched.length) waiting.push({ file, entries: res.unmatched });
      for (const a of res.auto ?? []) notes.push(`${a.entry} → ${labelOf(a.slug)} (page duy nhất còn thiếu)`);
    }
    setSending(false);
    if (errors.length) setError(errors.join(" · "));
    setPending((prev) => [...prev, ...waiting]);
    setAutoNotes((prev) => [...prev, ...notes]);
    if (acc) {
      setAnswer(acc);
      onDone();
    }
  };

  /* the admin picked a page for each unnamed entry of one file: send it again with the choice */
  const saveChoice = async (i: number) => {
    const item = pending[i];
    const assign = Object.fromEntries(item.entries.map((e) => [e, choice[`${i}:${e}`]]).filter(([, slug]) => slug));
    if (Object.keys(assign).length === 0) return;
    setSending(true);
    setError(null);
    const res = await upload(item.file, assign);
    setSending(false);
    if (!res.ok) return setError(`${item.file.name}: ${res.error}`);
    setAnswer((prev) => merge(res, prev));
    setPending((prev) => prev.map((x, k) => (k === i ? { ...x, entries: res.unmatched } : x)).filter((x) => x.entries.length));
    onDone();
  };

  const missingLabels = new Set(answer?.missing ?? []);

  return (
    <div className="grid gap-3 rounded-pf-md border border-pf-primary-hi/40 bg-pf-card-hi/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13.5px] font-semibold text-pf-text">
          {job.setName ?? "Bộ mới"}
          <span className="ml-2 text-[12px] font-normal text-pf-faint">{job.loganPages.length} page đã có HTML · chờ upload file .pagefly</span>
        </p>
        <div className="flex items-center gap-2">
          {job.setId && (
            <Link href={`/design/admin/collections/${job.setId}`} className="text-[12.5px] font-semibold text-pf-primary-hi hover:underline">
              Mở bộ
            </Link>
          )}
          <Button size="sm" variant="quiet" icon="X" disabled={busy || sending} onClick={onCancel}>
            Huỷ
          </Button>
        </div>
      </div>
      <p className="text-[12px] text-pf-muted">
        Thả các file .pagefly của bộ vào ô bên dưới — nhiều file một lúc được. Mỗi file tự khớp đúng page theo tên (Home, Product…) và được lưu vào bộ;
        “Download .pagefly” của bộ sẽ tải đúng các file đã upload. Đủ page là bộ xong.
      </p>
      <ul className="grid gap-1 text-[12.5px]">
        {job.loganPages.map((p) => (
          <li key={p.slug} className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <span className="min-w-[110px] font-semibold text-pf-text">{p.label}</span>
            <span className="text-pf-faint">{p.title}</span>
            {p.editorUrl && (
              <a href={p.editorUrl} target="_blank" rel="noreferrer" className="font-semibold text-pf-primary-hi hover:underline">
                Mở editor
              </a>
            )}
            {p.previewUrl && (
              <a href={p.previewUrl} target="_blank" rel="noreferrer" className="font-semibold text-pf-body hover:text-pf-text">
                Xem bản dựng
              </a>
            )}
            {(answer?.stored.some((s) => s.slug === p.slug) || (answer && !missingLabels.has(p.label))) && (
              <span className="inline-flex items-center gap-1 text-pf-success">
                <Icon name="Check" size={12} /> đã có .pagefly
              </span>
            )}
          </li>
        ))}
      </ul>
      <label
        onDragOver={(e) => (e.preventDefault(), setDrag(true))}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void send(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center gap-1 rounded-pf-md border border-dashed px-3 py-4 text-center text-[12.5px] ${
          drag ? "border-pf-primary-hi bg-pf-primary/10 text-pf-text" : "border-pf-border text-pf-muted hover:text-pf-text"
        }`}
      >
        <Icon name={sending ? "Loader" : "Upload"} size={16} className={sending ? "animate-spin" : undefined} />
        {sending ? "Đang lưu…" : "Thả cả 7 file .pagefly (hoặc 1 file All Pages) vào đây, hoặc bấm để chọn"}
        <input type="file" accept=".pagefly,.zip" multiple className="hidden" disabled={sending} onChange={(e) => void send(e.target.files)} />
      </label>
      {answer && (
        <p className="text-[12px] text-pf-muted">
          {answer.missing.length ? `Còn thiếu: ${answer.missing.join(", ")}.` : "Đủ page — bộ đã xong."}
        </p>
      )}
      {autoNotes.length > 0 && <p className="text-[12px] text-pf-success">Tự khớp: {autoNotes.join(" · ")}</p>}
      {pending.length > 0 && (
        <div className="grid gap-2 rounded-pf-md border border-pf-warn/40 bg-pf-warn/5 p-3 text-[12.5px]">
          <p className="font-semibold text-pf-text">Chưa biết là page nào — chọn rồi bấm Lưu</p>
          {pending.map((item, i) => (
            <div key={`${item.file.name}-${i}`} className="grid gap-1.5">
              {item.entries.map((e) => (
                <label key={e} className="flex flex-wrap items-center gap-2">
                  <span className="min-w-[240px] text-pf-body">{e.split("/").pop()}</span>
                  <select
                    value={choice[`${i}:${e}`] ?? ""}
                    onChange={(ev) => setChoice({ ...choice, [`${i}:${e}`]: ev.target.value })}
                    className={`${FIELD} w-[220px]`}
                    aria-label={`Page cho ${e}`}
                  >
                    <option value="">— chọn page —</option>
                    {job.loganPages.map((p) => (
                      <option key={p.slug} value={p.slug}>
                        {p.label}
                        {missingLabels.has(p.label) ? " (còn thiếu)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <div>
                <Button size="sm" icon="Check" disabled={sending || !item.entries.some((e) => choice[`${i}:${e}`])} onClick={() => void saveChoice(i)}>
                  Lưu {item.file.name}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      {error && <p className="text-[12px] text-pf-danger">{error}</p>}
    </div>
  );
}

function JobRow({
  job,
  busy,
  onCancel,
  onRetry,
  onAwaitExport,
}: {
  job: BuildJob;
  busy: boolean;
  onCancel: () => void;
  onRetry: (mode: "resume" | "fresh") => void;
  onAwaitExport: () => void;
}) {
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
        {(job.status === "queued" || job.status === "export") && (
          <Button size="sm" variant="danger" icon="X" className="border-transparent bg-pf-danger text-white hover:bg-pf-danger/85 disabled:bg-pf-card disabled:text-pf-faint" disabled={busy} onClick={onCancel}>
            Huỷ
          </Button>
        )}
        {(job.status === "failed" || job.status === "cancelled" || job.status === "done") && job.setId && (
          <Button size="sm" variant="ghost" icon="Upload" disabled={busy} onClick={onAwaitExport} title="Coi như đã build xong (đã có HTML) — chuyển sang Chờ upload .pagefly">
            Chờ upload .pagefly
          </Button>
        )}
        {(job.status === "failed" || job.status === "cancelled") && job.log.length > 0 && (
          <Button size="sm" icon="Play" disabled={busy} onClick={() => onRetry("resume")} title={`Giữ bộ và các file đã upload, chạy tiếp từ bước ${job.step ?? "đầu"}`}>
            Tiếp tục
          </Button>
        )}
        {(job.status === "failed" || job.status === "cancelled") && (
          <Button size="sm" variant="ghost" icon="RefreshCw" disabled={busy} onClick={() => onRetry("fresh")} title="Bỏ bản cũ, build một bộ mới hoàn toàn theo ghi chú này">
            Build lại từ đầu
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
