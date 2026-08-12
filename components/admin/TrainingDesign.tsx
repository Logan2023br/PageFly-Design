"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  TrainingItemResponse,
  TrainingResponse,
} from "@/app/api/admin/training/route";
import type { TrainingItem, TrainingSummary } from "@/lib/db/types";
import { VERTICAL_IDS, VERTICAL_LABELS, verticalLabel } from "@/lib/verticals";
import { Button, Icon, Panel, Tag } from "../ui";

/* ==========================================================================
   Training Design.

   Reference screenshots an operator files by industry: pages that got the
   structure, the type and the palette right, kept so a build for that industry
   has something to look at other than the brief. A reference is several
   screenshots, not one — usually the same store's home, product and about, or
   one page at several widths.

   NOTHING IN A BUILD READS THESE YET, and that is deliberate rather than
   unfinished. The collection is being made first and connected second, so it
   can be judged on its own before it is allowed to change what a merchant sees.

   The grid never loads the whole set. Twenty references at eight screenshots
   each is roughly fifty megabytes, and a card only ever draws one image, so the
   listing carries a cover and a count and the rest is fetched for the one
   reference being opened.
   ========================================================================== */

const MAX_EDGE = 1600;
const QUALITY = 0.82;
const MAX_IMAGES = 8;

/* A screenshot arrives from a Retina display at two or three megabytes and the
   row carries it as a data URL, so it is re-encoded before it is sent. 1600px
   is wider than anything in this grid renders and wide enough to read the type
   in the lightbox. */
async function downscale(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  /* JPEG, not PNG. These are pictures of pages; a PNG screenshot at 1600px is
     several megabytes where a JPEG is a few hundred KB, and nothing here needs
     a lossless pixel. */
  return canvas.toDataURL("image/jpeg", QUALITY);
}

async function fetchItem(id: string): Promise<TrainingItem | null> {
  try {
    const res = await fetch(`/api/admin/training?id=${encodeURIComponent(id)}`);
    const body = (await res.json()) as TrainingItemResponse;
    return body.ok ? body.item : null;
  } catch {
    return null;
  }
}

/* ---- the screen --------------------------------------------------------- */

export function TrainingDesign({ initial }: { initial: TrainingSummary[] }) {
  const [items, setItems] = useState(initial);
  const [filter, setFilter] = useState<string>("all");
  const [editing, setEditing] = useState<TrainingItem | "new" | null>(null);
  const [lightbox, setLightbox] = useState<TrainingItem | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const shown = useMemo(
    () => (filter === "all" ? items : items.filter((i) => i.vertical === filter)),
    [items, filter],
  );

  /* Only industries that actually have something filed. A dropdown of twelve is
     a form control; a filter row of twelve when eleven are empty is noise. */
  const present = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) counts.set(item.vertical, (counts.get(item.vertical) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1]);
  }, [items]);

  const totalImages = items.reduce((n, i) => n + i.imageCount, 0);

  const open = useCallback(async (id: string, mode: "view" | "edit") => {
    setError(null);
    setLoadingId(id);
    const item = await fetchItem(id);
    setLoadingId(null);
    if (!item) {
      setError("Couldn't load that reference.");
      return;
    }
    if (mode === "view") setLightbox(item);
    else setEditing(item);
  }, []);

  const remove = useCallback(async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/admin/training?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const body = (await res.json()) as TrainingResponse;
      if (body.ok) setItems(body.items);
      else setError(body.error);
    } catch {
      setError("Couldn't reach the server.");
    }
  }, []);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button icon="Plus" onClick={() => setEditing("new")}>
          Add reference
        </Button>

        <span className="text-[12.5px] text-pf-muted">
          {items.length} {items.length === 1 ? "reference" : "references"}
          {totalImages > 0 && ` · ${totalImages} screenshots`}
          {present.length > 0 && ` · ${present.length} industries`}
        </span>

        <span className="ml-auto text-[11.5px] text-pf-faint">
          Not used by page builds yet
        </span>
      </div>

      {present.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
            All {items.length}
          </FilterChip>
          {present.map(([vertical, n]) => (
            <FilterChip
              key={vertical}
              active={filter === vertical}
              onClick={() => setFilter(vertical)}
            >
              {verticalLabel(vertical)} {n}
            </FilterChip>
          ))}
        </div>
      )}

      {error && (
        <p className="text-[12.5px] text-pf-danger" role="alert">
          {error}
        </p>
      )}

      {items.length === 0 ? (
        <Panel className="grid place-items-center gap-2 p-10 text-center">
          <Icon name="Images" size={22} />
          <p className="text-[13.5px] font-semibold text-pf-text">Nothing filed yet</p>
          <p className="max-w-md text-[12.5px] leading-relaxed text-pf-muted">
            Add screenshots of pages that got it right, and say which industry they
            belong to. Structure, type and palette are what these are for — not the
            products on them.
          </p>
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <AnimatePresence initial={false}>
            {shown.map((item) => (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.18 }}
              >
                <Card
                  item={item}
                  busy={loadingId === item.id}
                  onOpen={() => void open(item.id, "view")}
                  onEdit={() => void open(item.id, "edit")}
                  onDelete={() => void remove(item.id)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <AnimatePresence>
        {editing && (
          <EditDialog
            item={editing === "new" ? null : editing}
            onClose={() => setEditing(null)}
            onSaved={(next) => {
              setItems(next);
              setEditing(null);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {lightbox && <Lightbox item={lightbox} onClose={() => setLightbox(null)} />}
      </AnimatePresence>
    </div>
  );
}

/* ---- card --------------------------------------------------------------- */

function Card({
  item,
  busy,
  onOpen,
  onEdit,
  onDelete,
}: {
  item: TrainingSummary;
  busy: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  /* Two presses to delete, in place. A modal for one reference is more ceremony
     than the act deserves; doing it silently on one press is less. */
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(t);
  }, [confirming]);

  return (
    <Panel className="group overflow-hidden transition-colors duration-200 hover:border-pf-border-hi">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${verticalLabel(item.vertical)} reference`}
        className="relative block w-full cursor-zoom-in overflow-hidden bg-pf-bg-deep"
      >
        {item.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.cover}
            alt=""
            className="aspect-[4/3] w-full object-cover object-top transition-transform duration-500 ease-out group-hover:scale-[1.04]"
          />
        ) : (
          <div className="grid aspect-[4/3] w-full place-items-center text-pf-faint">
            <Icon name="Images" size={20} />
          </div>
        )}

        {item.imageCount > 1 && (
          <span className="absolute right-2 top-2 rounded-pf-pill bg-pf-bg-deep/80 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-pf-text backdrop-blur-sm">
            {item.imageCount} shots
          </span>
        )}

        <span className="pointer-events-none absolute inset-0 grid place-items-center bg-pf-bg-deep/55 opacity-0 backdrop-blur-[1px] transition-opacity duration-200 group-hover:opacity-100">
          <span className="flex items-center gap-1.5 rounded-pf-pill bg-pf-card px-3 py-1.5 text-[12px] font-semibold text-pf-text">
            <Icon name={busy ? "Loader" : "Maximize"} size={13} />
            {busy ? "Loading…" : "Preview"}
          </span>
        </span>
      </button>

      <div className="grid gap-2 p-3">
        <div className="flex items-center gap-2">
          <Tag>{verticalLabel(item.vertical)}</Tag>
        </div>

        {item.note && (
          <p className="line-clamp-2 text-[12px] leading-relaxed text-pf-muted">
            {item.note}
          </p>
        )}

        <div className="flex items-center gap-1.5">
          <IconButton label="Edit" icon="Pencil" onClick={onEdit} />
          {confirming ? (
            <button
              type="button"
              onClick={onDelete}
              className="rounded-pf-md border border-pf-danger/50 px-2.5 py-1 text-[11.5px] font-semibold text-pf-danger transition-colors hover:bg-pf-danger/10"
            >
              Delete for good?
            </button>
          ) : (
            <IconButton
              label="Delete"
              icon="Trash2"
              danger
              onClick={() => setConfirming(true)}
            />
          )}
        </div>
      </div>
    </Panel>
  );
}

function IconButton({
  label,
  icon,
  onClick,
  danger,
}: {
  label: string;
  icon: "Pencil" | "Trash2";
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid size-8 place-items-center rounded-pf-md border border-pf-border transition-colors ${
        danger
          ? "text-pf-muted hover:border-pf-danger/50 hover:text-pf-danger"
          : "text-pf-body hover:border-pf-border-hi hover:bg-pf-card-hi hover:text-pf-text"
      }`}
    >
      <Icon name={icon} size={14} />
    </button>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-pf-pill border px-3 py-1 text-[12px] font-semibold transition-colors ${
        active
          ? "border-pf-primary-hi/60 bg-pf-primary/15 text-pf-text"
          : "border-pf-border text-pf-muted hover:border-pf-border-hi hover:text-pf-text"
      }`}
    >
      {children}
    </button>
  );
}

/* ---- add / edit --------------------------------------------------------- */

function EditDialog({
  item,
  onClose,
  onSaved,
}: {
  item: TrainingItem | null;
  onClose: () => void;
  onSaved: (items: TrainingSummary[]) => void;
}) {
  const [vertical, setVertical] = useState(item?.vertical ?? VERTICAL_IDS[0]);
  const [note, setNote] = useState(item?.note ?? "");
  const [images, setImages] = useState<string[]>(item?.images ?? []);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const add = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    setReading(true);
    try {
      const room = MAX_IMAGES - images.length;
      const picked = [...files].slice(0, Math.max(0, room));
      if (picked.length < files.length)
        setError(`Only ${MAX_IMAGES} screenshots per reference — the rest were skipped.`);
      const encoded = await Promise.all(picked.map(downscale));
      setImages((prev) => [...prev, ...encoded]);
    } catch {
      setError("Couldn't read one of those files. PNG or JPEG works.");
    } finally {
      setReading(false);
      /* Cleared so choosing the same file twice in a row still fires a change. */
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const save = async () => {
    if (images.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/training", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: item?.id, vertical, note: note.trim() || null, images }),
      });
      const body = (await res.json()) as TrainingResponse;
      if (body.ok) onSaved(body.items);
      else setError(body.error);
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 grid place-items-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      role="dialog"
      aria-modal="true"
      aria-label={item ? "Edit reference" : "Add reference"}
    >
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 z-0 bg-pf-bg-deep/85"
      />

      <motion.div
        initial={{ scale: 0.97, y: 8 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.97, y: 8 }}
        transition={{ duration: 0.18 }}
        className="relative z-10 w-full max-w-2xl"
      >
        <Panel className="grid max-h-[86vh] gap-3 overflow-y-auto p-4">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-semibold text-pf-text">
              {item ? "Edit reference" : "Add reference"}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="ml-auto grid size-8 place-items-center rounded-pf-md border border-pf-border text-pf-body transition-colors hover:border-pf-border-hi hover:text-pf-text"
            >
              <Icon name="X" size={14} />
            </button>
          </div>

          <label className="grid gap-1.5">
            <span className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-pf-faint">
              Industry
            </span>
            <select
              value={vertical}
              onChange={(e) => setVertical(e.target.value)}
              className="rounded-pf-md border border-pf-border bg-pf-bg-deep px-3 py-2 text-[13px] text-pf-text outline-none transition-colors focus:border-pf-primary-hi"
            >
              {VERTICAL_IDS.map((id) => (
                <option key={id} value={id}>
                  {VERTICAL_LABELS[id]}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-1.5">
            <span className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-pf-faint">
              Screenshots{" "}
              <span className="normal-case tracking-normal text-pf-faint">
                {images.length}/{MAX_IMAGES}
              </span>
            </span>

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => void add(e.target.files)}
            />

            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {images.map((src, i) => (
                <div
                  key={i}
                  className="group relative overflow-hidden rounded-pf-md border border-pf-border"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="aspect-[4/3] w-full object-cover object-top" />
                  {i === 0 && (
                    <span className="absolute left-1 top-1 rounded-pf-pill bg-pf-bg-deep/80 px-1.5 py-0.5 text-[10px] font-semibold text-pf-text">
                      Cover
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                    aria-label="Remove screenshot"
                    className="absolute inset-0 grid place-items-center bg-pf-bg-deep/70 text-pf-danger opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <Icon name="Trash2" size={16} />
                  </button>
                </div>
              ))}

              {images.length < MAX_IMAGES && (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={reading}
                  className="grid aspect-[4/3] place-items-center gap-1 rounded-pf-md border border-dashed border-pf-border text-pf-muted transition-colors hover:border-pf-border-hi hover:text-pf-text disabled:opacity-60"
                >
                  <Icon name={reading ? "Loader" : "Upload"} size={16} />
                  <span className="text-[11px] font-semibold">
                    {reading ? "Reading…" : images.length ? "Add more" : "Choose images"}
                  </span>
                </button>
              )}
            </div>

            <span className="text-[11px] text-pf-faint">
              Pick several at once. Each is resized to {MAX_EDGE}px before it is saved.
              The first one is the card&apos;s cover.
            </span>
          </div>

          <label className="grid gap-1.5">
            <span className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-pf-faint">
              What to take from it
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={400}
              placeholder="Serif headings, warm neutral palette, hero split 1.2fr / 1fr"
              className="resize-none rounded-pf-md border border-pf-border bg-pf-bg-deep px-3 py-2 text-[13px] text-pf-text outline-none transition-colors placeholder:text-pf-faint focus:border-pf-primary-hi"
            />
          </label>

          {error && (
            <p className="text-[12px] text-pf-danger" role="alert">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2">
            <Button variant="quiet" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={save} disabled={images.length === 0 || busy} icon="Check">
              {busy ? "Saving…" : item ? "Save changes" : "Add reference"}
            </Button>
          </div>
        </Panel>
      </motion.div>
    </motion.div>
  );
}

/* ---- lightbox ----------------------------------------------------------- */

function Lightbox({ item, onClose }: { item: TrainingItem; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const count = item.images.length;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setIndex((i) => (i + 1) % count);
      if (e.key === "ArrowLeft") setIndex((i) => (i - 1 + count) % count);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, count]);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      role="dialog"
      aria-modal="true"
      aria-label="Reference preview"
    >
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 z-0 bg-pf-bg-deep/92"
      />

      <div className="relative z-10 flex items-center gap-2 border-b border-pf-border px-4 py-2.5">
        <Tag>{verticalLabel(item.vertical)}</Tag>
        {item.note && (
          <span className="min-w-0 truncate text-[12.5px] text-pf-muted">{item.note}</span>
        )}

        {count > 1 && (
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIndex((i) => (i - 1 + count) % count)}
              aria-label="Previous screenshot"
              className="grid size-9 place-items-center rounded-pf-md border border-pf-border text-pf-body transition-colors hover:border-pf-border-hi hover:text-pf-text"
            >
              <Icon name="ChevronLeft" size={15} />
            </button>
            <span className="text-[12px] tabular-nums text-pf-muted">
              {index + 1} / {count}
            </span>
            <button
              type="button"
              onClick={() => setIndex((i) => (i + 1) % count)}
              aria-label="Next screenshot"
              className="grid size-9 place-items-center rounded-pf-md border border-pf-border text-pf-body transition-colors hover:border-pf-border-hi hover:text-pf-text"
            >
              <Icon name="ChevronRight" size={15} />
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          aria-label="Close preview"
          className={`${count > 1 ? "" : "ml-auto"} grid size-9 shrink-0 place-items-center rounded-pf-md border border-pf-border text-pf-body transition-colors hover:border-pf-border-hi hover:text-pf-text`}
        >
          <Icon name="X" size={15} />
        </button>
      </div>

      {/* Scrolls rather than fits: these are whole pages, and a page made to fit
          a screen is a page nobody can read the type on — which is the only
          reason to look at one of these. */}
      <div className="relative z-10 min-h-0 flex-1 overflow-auto p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.images[index]}
          alt=""
          className="mx-auto w-full max-w-5xl rounded-pf-md"
        />
      </div>
    </motion.div>
  );
}
