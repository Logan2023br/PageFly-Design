"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useMemo, useState } from "react";
import type {
  SectionResponse,
  SectionsResponse,
} from "@/app/api/admin/training/sections/route";
import type {
  TrainingImage,
  TrainingSection,
  TrainingSectionSummary,
} from "@/lib/db/types";
import { COMMON_SECTION_ELEMENTS, PAGEFLY_ELEMENTS } from "@/lib/pagefly/elements";
import { Button, Icon, Panel, Tag } from "../ui";

/* ==========================================================================
   Training Section.

   Reference screenshots for ONE PageFly element, and Haiku's reading of them.
   A template reference says what a good footwear store looks like; this says
   what a good `ProductBox` looks like, and a build reaches for it when it is
   about to write that element and the merchant gave it nothing to go on.

   THE READING IS THE POINT, not the pictures. DeepSeek cannot see an image, so
   the screenshots exist to be turned into text once, on save, by Haiku — and
   the text is what a build reads. That is why a card shows the analysis rather
   than only a thumbnail: the operator is reviewing what the model will be told,
   and a picture does not tell them whether it was understood.

   ONE ENTRY PER ELEMENT. The server enforces it; this screen explains it. Two
   entries for one element would leave a build choosing between two collections
   with no way to choose, and the answer to "I have another good product box" is
   another screenshot on the entry that exists.
   ========================================================================== */

const MAX_EDGE = 1600;
const QUALITY = 0.82;
const MAX_IMAGES = 8;

/* Same treatment as the template tab, and for the same reason: a Retina
   screenshot arrives at two or three megabytes and travels in the row. */
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
  return canvas.toDataURL("image/jpeg", QUALITY);
}

async function fetchSection(id: string): Promise<TrainingSection | null> {
  try {
    const res = await fetch(`/api/admin/training/sections?id=${encodeURIComponent(id)}`);
    const body = (await res.json()) as SectionResponse;
    return body.ok ? body.item : null;
  } catch {
    return null;
  }
}

/* ---- the screen --------------------------------------------------------- */

/** `bedding-textiles` → `Bedding textiles`. The chip labels live in a different
    list and do not cover every slug in the skill file, so the slug is prettified
    rather than looked up — a dropdown that silently omits an industry is worse
    than one with a plain label. */
function industryLabel(slug: string): string {
  const s = slug.replace(/-/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const ALL_INDUSTRIES = "__all__";

export function TrainingSections({
  initial,
  verticals,
}: {
  initial: TrainingSectionSummary[];
  /** industry slugs from `30-verticals.md`, in file order */
  verticals: string[];
}) {
  const [items, setItems] = useState(initial);
  const [editing, setEditing] = useState<TrainingSection | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const totals = useMemo(() => {
    const images = items.reduce((n, i) => n + i.imageCount, 0);
    const read = items.filter((i) => i.analysis).length;
    const on = items.filter((i) => i.enabled !== false).length;
    return { images, read, on };
  }, [items]);

  const open = useCallback(async (id: string) => {
    setError(null);
    const item = await fetchSection(id);
    if (!item) {
      setError("Couldn't load that section.");
      return;
    }
    setEditing(item);
  }, []);

  const remove = useCallback(async (id: string) => {
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/training/sections?id=${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      const body = (await res.json()) as SectionsResponse;
      if (body.ok) setItems(body.items);
      else setError(body.error);
    } catch {
      setError("Couldn't reach the server.");
    }
  }, []);

  /* The switch saves on its own, without opening the dialog. It is the one
     control an operator reaches for repeatedly — turning a reference off
     because a build went wrong — and making that a four-click round trip
     through a form is how it stops being used. */
  const toggle = useCallback(
    async (summary: TrainingSectionSummary) => {
      setError(null);
      const full = await fetchSection(summary.id);
      if (!full) {
        setError("Couldn't load that section.");
        return;
      }
      try {
        const res = await fetch("/api/admin/training/sections", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: full.id,
            element: full.element,
            vertical: full.vertical,
            note: full.note,
            enabled: full.enabled === false,
            images: full.images,
          }),
        });
        const body = (await res.json()) as SectionsResponse;
        if (body.ok) setItems(body.items);
        else setError(body.error);
      } catch {
        setError("Couldn't reach the server.");
      }
    },
    [],
  );

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button icon="Plus" onClick={() => setEditing("new")}>
          Add section
        </Button>

        <span className="text-[12.5px] text-pf-muted">
          {items.length} {items.length === 1 ? "element" : "elements"}
          {totals.images > 0 && ` · ${totals.images} screenshots`}
          {items.length > 0 && ` · ${totals.read} analysed`}
          {items.length > 0 && ` · ${totals.on} on`}
        </span>
      </div>

      {error && (
        <p className="text-[12.5px] text-pf-danger" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="text-[12.5px] text-pf-muted" role="status">
          {notice}
        </p>
      )}

      {items.length === 0 ? (
        <Panel className="grid place-items-center gap-2 p-10 text-center">
          <Icon name="Images" size={22} />
          <p className="text-[13.5px] font-semibold text-pf-text">No sections filed yet</p>
          <p className="max-w-md text-[12.5px] leading-relaxed text-pf-muted">
            Pick a PageFly element, add screenshots of good examples of it, and
            Haiku writes down what makes them work. A build reads that writing —
            never the pictures — so it costs nothing after the first save.
          </p>
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence initial={false}>
            {items.map((item) => (
              <SectionCardView
                key={item.id}
                item={item}
                onOpen={() => open(item.id)}
                onToggle={() => toggle(item)}
                onDelete={() => remove(item.id)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      <AnimatePresence>
        {editing && (
          <SectionDialog
            item={editing === "new" ? null : editing}
            verticals={verticals}
            taken={items.map((i) => `${i.element}\u0000${i.vertical ?? ""}`)}
            onClose={() => setEditing(null)}
            onSaved={(next, analysed) => {
              setItems(next);
              setEditing(null);
              setNotice(
                analysed
                  ? "Saved, and Haiku read the screenshots."
                  : "Saved. The screenshots were not re-read.",
              );
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---- a card ------------------------------------------------------------- */

function SectionCardView({
  item,
  onOpen,
  onToggle,
  onDelete,
}: {
  item: TrainingSectionSummary;
  onOpen: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const on = item.enabled !== false;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.18 }}
    >
      <Panel className="grid gap-2.5 overflow-hidden p-3">
        <div className="flex items-center gap-2">
          <Switch on={on} onClick={onToggle} />
          <code className="truncate text-[12.5px] font-semibold text-pf-text">
            {item.element}
          </code>
          {/* Which trade, on the card. Without it an operator with a ProductBox
              filed three times cannot tell which is which. */}
          <span className="shrink-0">
            <Tag>{item.vertical ? industryLabel(item.vertical) : "All"}</Tag>
          </span>
          <span className="ml-auto shrink-0">
            <Tag>{item.imageCount}</Tag>
          </span>
        </div>

        <button
          type="button"
          onClick={onOpen}
          className="grid gap-2 text-left"
          aria-label={`Open ${item.element}`}
        >
          {item.cover && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.cover}
              alt=""
              className={[
                "h-28 w-full rounded-pf-md border border-pf-border object-cover object-top transition-opacity",
                on ? "" : "opacity-40",
              ].join(" ")}
            />
          )}

          {/* The reading, not the note. This is what a build will be told, and
              it is the only thing on the card an operator can actually check. */}
          {item.analysis ? (
            <p className="line-clamp-4 whitespace-pre-wrap text-[11.5px] leading-relaxed text-pf-muted">
              {item.analysis}
            </p>
          ) : (
            <p className="text-[11.5px] leading-relaxed text-pf-danger">
              Not analysed — open it and save again to retry.
            </p>
          )}
        </button>

        {item.note && (
          <p className="text-[11.5px] italic leading-relaxed text-pf-faint">{item.note}</p>
        )}

        <div className="flex items-center gap-1.5">
          <IconButton label="Open" icon="Pencil" onClick={onOpen} />
          <IconButton label="Delete" icon="Trash2" onClick={onDelete} />
          <span className="ml-auto text-[11px] text-pf-faint">
            {on ? "Model may read this" : "Model must ignore this"}
          </span>
        </div>
      </Panel>
    </motion.div>
  );
}

function Switch({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="switch"
      aria-checked={on}
      aria-label={on ? "Turn off" : "Turn on"}
      className={[
        "relative h-5 w-9 shrink-0 rounded-full border transition-colors duration-150",
        on ? "border-pf-accent bg-pf-accent" : "border-pf-border bg-pf-surface",
      ].join(" ")}
    >
      <span
        className={[
          "absolute top-1/2 size-3.5 -translate-y-1/2 rounded-full bg-white transition-all duration-150",
          on ? "left-[18px]" : "left-[2px] opacity-60",
        ].join(" ")}
      />
    </button>
  );
}

function IconButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: "Pencil" | "Trash2";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid size-8 place-items-center rounded-full border border-pf-border text-pf-body transition-colors hover:border-pf-border-hi hover:text-pf-text"
    >
      <Icon name={icon} size={13} />
    </button>
  );
}

/* ---- add / edit --------------------------------------------------------- */

function SectionDialog({
  item,
  taken,
  verticals,
  onClose,
  onSaved,
}: {
  item: TrainingSection | null;
  /** `element\u0000vertical` for every filing that exists — the pair is what is
      unique, so the pair is what a clash is checked against */
  taken: string[];
  verticals: string[];
  onClose: () => void;
  onSaved: (items: TrainingSectionSummary[], analysed: boolean) => void;
}) {
  const [element, setElement] = useState(item?.element ?? "ProductBox");
  const [vertical, setVertical] = useState(item?.vertical ?? ALL_INDUSTRIES);
  const [note, setNote] = useState(item?.note ?? "");
  const [enabled, setEnabled] = useState(item?.enabled !== false);
  const [images, setImages] = useState<TrainingImage[]>(item?.images ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Named before the request is sent, because a clash is the one failure an
     operator can fix without leaving the dialog — and being told after a
     ten-second upload is being told too late. */
  /* The PAIR, because the pair is what is unique. `ProductBox` for audio and
     `ProductBox` for skincare are two filings; a second `ProductBox` for audio
     is a build choosing between two with no way to choose. */
  const slot = `${element}\u0000${vertical === ALL_INDUSTRIES ? "" : vertical}`;
  const clash = !item && taken.some((t) => t.toLowerCase() === slot.toLowerCase());

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    const room = MAX_IMAGES - images.length;
    if (room <= 0) {
      setError(`${MAX_IMAGES} screenshots is the limit for one element.`);
      return;
    }
    try {
      const next: TrainingImage[] = [];
      for (const file of Array.from(files).slice(0, room))
        next.push({ src: await downscale(file), note: null });
      setImages((prev) => [...prev, ...next]);
    } catch {
      setError("Couldn't read one of those files.");
    }
  };

  const save = async () => {
    if (images.length === 0) {
      setError("Add at least one screenshot.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/training/sections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: item?.id,
          element,
          note: note.trim() || null,
          enabled,
          images,
        }),
      });
      const body = (await res.json()) as SectionsResponse;
      if (body.ok) onSaved(body.items, body.analysed === true);
      else setError(body.error);
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  };

  /* The common ones first, then everything, because a dropdown of ninety-five
     names alphabetically puts `Accordion3.Content.Wrapper` above `ProductBox`. */
  const rest = PAGEFLY_ELEMENTS.filter(
    (e) => !COMMON_SECTION_ELEMENTS.includes(e),
  );

  return (
    <motion.div
      className="fixed inset-0 z-50 grid place-items-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      role="dialog"
      aria-modal="true"
      aria-label={item ? "Edit section" : "Add section"}
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
              {item ? item.element : "Add section"}
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

          {!item && (
            <label className="grid gap-1.5">
              <span className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-pf-faint">
                PageFly element
              </span>
              <select
                value={element}
                onChange={(e) => setElement(e.target.value)}
                className="rounded-pf-md border border-pf-border bg-pf-bg-deep px-3 py-2 text-[13px] text-pf-text outline-none transition-colors focus:border-pf-primary-hi"
              >
                <optgroup label="Sections you will file most">
                  {COMMON_SECTION_ELEMENTS.map((e) => (
                    <option key={e} value={e}>
                      {e}
                      {taken.some(
                        (t) =>
                          t.toLowerCase() ===
                          `${e}\u0000${vertical === ALL_INDUSTRIES ? "" : vertical}`.toLowerCase(),
                      )
                        ? " · filed"
                        : ""}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Everything else">
                  {rest.map((e) => (
                    <option key={e} value={e}>
                      {e}
                      {taken.some(
                        (t) =>
                          t.toLowerCase() ===
                          `${e}\u0000${vertical === ALL_INDUSTRIES ? "" : vertical}`.toLowerCase(),
                      )
                        ? " · filed"
                        : ""}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
          )}

          {/* The trade this filing is for. "Every industry" is a real answer,
              not a default to get past: a reading about how a thumbnail strip
              sits is worth having once, for everybody. A reading about what a
              headphone buyer needs proved is not. */}
          <label className="grid gap-1.5">
            <span className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-pf-faint">
              Industry
            </span>
            <select
              value={vertical}
              onChange={(e) => setVertical(e.target.value)}
              className="rounded-pf-md border border-pf-border bg-pf-bg-deep px-3 py-2 text-[13px] text-pf-text outline-none transition-colors focus:border-pf-primary-hi"
            >
              <option value={ALL_INDUSTRIES}>Every industry — shared fallback</option>
              {verticals.map((v) => (
                <option key={v} value={v}>
                  {industryLabel(v)}
                </option>
              ))}
            </select>
            <span className="text-[11.5px] leading-relaxed text-pf-faint">
              A build prefers the filing that names its industry, and falls back
              to the shared one.
            </span>
            {clash && (
              <span className="text-[11.5px] leading-relaxed text-pf-danger">
                {element}{" "}
                {vertical === ALL_INDUSTRIES
                  ? "shared across every industry"
                  : `for ${industryLabel(vertical)}`}{" "}
                is already filed. Open that entry and add the screenshots to it,
                or file this one under a different industry.
              </span>
            )}
          </label>

          <label className="grid gap-1.5">
            <span className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-pf-faint">
              Note — for you, not for the model
            </span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="where these came from, what to watch for"
              className="rounded-pf-md border border-pf-border bg-pf-bg-deep px-3 py-2 text-[13px] text-pf-text outline-none transition-colors placeholder:text-pf-faint focus:border-pf-primary-hi"
            />
          </label>

          <div className="flex items-center gap-2 rounded-pf-md border border-pf-border p-2.5">
            <Switch on={enabled} onClick={() => setEnabled((v) => !v)} />
            <span className="text-[12.5px] text-pf-body">
              {enabled
                ? "Builds may read this element's analysis"
                : "Builds must ignore this and work it out themselves"}
            </span>
          </div>

          {/* The reading. Shown on the edit path because it is the thing being
              reviewed — and shown as it is stored, so nobody is surprised by
              what the model was handed. */}
          {item?.analysis && (
            <div className="grid gap-1.5">
              <span className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-pf-faint">
                What Haiku read {item.analysedAt ? `· ${item.analysedAt.slice(0, 10)}` : ""}
              </span>
              <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-pf-md border border-pf-border bg-pf-bg-deep p-2.5 text-[11.5px] leading-relaxed text-pf-muted">
                {item.analysis}
              </pre>
              <span className="text-[11px] leading-relaxed text-pf-faint">
                Re-read only when the screenshots change. Adding or removing one
                and saving is what triggers it.
              </span>
            </div>
          )}

          <div className="grid gap-1.5">
            <span className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-pf-faint">
              Screenshots · {images.length}/{MAX_IMAGES}
            </span>
            {images.length > 0 && (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {images.map((img, i) => (
                  <div key={i} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.src}
                      alt=""
                      className="h-20 w-full rounded-pf-md border border-pf-border object-cover object-top"
                    />
                    <button
                      type="button"
                      aria-label="Remove screenshot"
                      onClick={() => setImages((p) => p.filter((_, j) => j !== i))}
                      className="absolute right-1 top-1 grid size-6 place-items-center rounded-full border border-pf-border bg-pf-bg-deep/90 text-pf-body transition-colors hover:text-pf-danger"
                    >
                      <Icon name="X" size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => add(e.target.files)}
              className="rounded-pf-md border border-dashed border-pf-border bg-pf-bg-deep px-3 py-2 text-[12.5px] text-pf-muted file:mr-3 file:rounded-pf-sm file:border-0 file:bg-pf-surface file:px-2.5 file:py-1 file:text-[12px] file:text-pf-text"
            />
          </div>

          {error && (
            <p className="text-[12.5px] text-pf-danger" role="alert">
              {error}
            </p>
          )}

          <div className="flex items-center gap-2">
            <Button onClick={save} disabled={busy || clash || images.length === 0}>
              {busy
                ? "Saving… reading the screenshots"
                : item
                  ? "Save changes"
                  : "Add section"}
            </Button>
            <span className="text-[11px] leading-relaxed text-pf-faint">
              Saving reads the screenshots once. A build never reads them again.
            </span>
          </div>
        </Panel>
      </motion.div>
    </motion.div>
  );
}
