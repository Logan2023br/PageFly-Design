"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useRef, useState } from "react";
import {
  ACCEPTED_IMAGE_EXTENSIONS,
  ACCEPTED_IMAGE_TYPES,
  MAX_IMAGES,
  MAX_IMAGE_BYTES,
  UPLOAD_REJECT_MESSAGE,
} from "@/lib/briefOptions";
import { useStore } from "@/lib/store";
import type { ReferenceImage } from "@/lib/validation";
import { prepareReferenceImage } from "@/lib/imageAnalysis";
import { Icon, InlineError, SectionCard } from "../ui";

/* ==========================================================================
   Reference images.

   Rejection is checked on BOTH the MIME type and the extension: a file can
   arrive with an empty or spoofed type (common with drag-and-drop from some
   apps), and a .mp4 renamed to .png must not slip through on type alone.
   Video is called out explicitly because it is the most likely wrong drop.
   ========================================================================== */

const ACCEPT_ATTR = ACCEPTED_IMAGE_TYPES.join(",");

function isAcceptedImage(file: File): boolean {
  const name = file.name.toLowerCase();
  const extOk = ACCEPTED_IMAGE_EXTENSIONS.some((ext) => name.endsWith(ext));
  const typeOk = (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type);
  // Empty type happens on some platforms; fall back to the extension alone.
  if (!file.type) return extOk;
  return extOk && typeOk;
}

export function ImageUpload() {
  const images = useStore((s) => s.draft.referenceImages);
  const addImages = useStore((s) => s.addImages);
  const removeImage = useStore((s) => s.removeImage);

  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const full = images.length >= MAX_IMAGES;

  const accept = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;

      const room = MAX_IMAGES - images.length;
      const rejected: string[] = [];
      const tooBig: string[] = [];
      const unreadable: string[] = [];
      const queue: File[] = [];

      for (const file of Array.from(files)) {
        if (!isAcceptedImage(file)) {
          rejected.push(file.name);
          continue;
        }
        if (file.size > MAX_IMAGE_BYTES) {
          tooBig.push(file.name);
          continue;
        }
        if (queue.length >= room) continue;
        queue.push(file);
      }

      if (rejected.length > 0) setError(UPLOAD_REJECT_MESSAGE);
      else if (tooBig.length > 0)
        setError(
          `${tooBig.length === 1 ? tooBig[0] : `${tooBig.length} files`} ${
            tooBig.length === 1 ? "is" : "are"
          } over ${MAX_IMAGE_BYTES / 1024 / 1024} MB. Resize and try again.`,
        );
      else if (queue.length < files.length && room < files.length)
        setError(`Up to ${MAX_IMAGES} images — the extras were skipped.`);
      else setError(null);

      if (queue.length === 0) return;

      /* Each file is decoded on a canvas to pull its palette and produce a
         bounded, stable copy. That work is what makes an upload actually change
         the mockups, so it happens before the image is accepted rather than
         being deferred to generation time. */
      setBusy(true);
      const accepted: ReferenceImage[] = [];
      for (const file of queue) {
        const base = {
          id: `${file.name}-${file.size}-${file.lastModified}`,
          name: file.name,
          url: URL.createObjectURL(file),
          type: file.type,
          size: file.size,
        };
        try {
          const prepared = await prepareReferenceImage(file);
          accepted.push({
            ...base,
            dataUrl: prepared.dataUrl,
            thumbUrl: prepared.thumbUrl,
            slices: prepared.slices,
            palette: prepared.palette,
            /* The page background and ink. When present these decide the
               colour of the built page — see the precedence block in
               `lib/generate/mock.ts`. */
            surface: prepared.surface,
            /* `layout` was computed on every upload and then dropped here,
               which made `refHints` in the generator permanently empty: the
               column counts, the band rhythm and the density measured off the
               merchant's screenshot reached nothing. Little was lost while
               Haiku's read covered the same ground, and it is what the
               no-Anthropic-key path falls back to, so it is attached now. */
            layout: prepared.layout,
          });
        } catch {
          // Keep the thumbnail, lose the palette: better than dropping a file
          // the merchant can plainly see is a valid image.
          unreadable.push(file.name);
          accepted.push({ ...base, palette: [] });
        }
      }
      setBusy(false);

      if (unreadable.length > 0) {
        setError(
          `Couldn't read the colours out of ${
            unreadable.length === 1 ? unreadable[0] : `${unreadable.length} images`
          }. They're still attached, they just won't tint the mockups.`,
        );
      }

      addImages(accepted);
    },
    [images.length, addImages],
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void accept(e.dataTransfer.files);
  };

  const hidden = (
    <input
      ref={inputRef}
      type="file"
      multiple
      accept={ACCEPT_ATTR}
      className="sr-only"
      onChange={(e) => {
        void accept(e.target.files);
        // Allow re-picking the same file after a removal.
        e.target.value = "";
      }}
    />
  );

  return (
    <SectionCard
      id="pfd-images"
      eyebrow="Step 6 · optional"
      title="Reference images"
      help={`Images only — up to ${MAX_IMAGES}, ${MAX_IMAGE_BYTES / 1024 / 1024} MB each.`}
      aside={
        busy ? (
          <span className="text-[11.5px] text-pf-primary-hi">
            Reading colours…
          </span>
        ) : images.length > 0 ? (
          <span className="text-[11.5px] text-pf-faint">
            {images.length}/{MAX_IMAGES}
          </span>
        ) : undefined
      }
    >
      <div className="grid gap-3">
        {/* Before the first upload: the full drop zone.
            After: it collapses into the thumbnail grid below. */}
        {images.length === 0 ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`grid place-items-center gap-2.5 rounded-pf-lg border border-dashed px-6 py-11 text-center transition-colors duration-150 ${
              dragging
                ? "border-pf-primary-hi bg-pf-primary/10"
                : "border-pf-border-hi bg-pf-bg-deep/50 hover:border-pf-primary-hi/60"
            }`}
          >
            <motion.span
              animate={{ y: dragging ? -3 : 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 26 }}
              className="grid size-11 place-items-center rounded-full border border-pf-border bg-pf-card text-pf-primary-hi"
            >
              <Icon name="Upload" size={19} />
            </motion.span>
            <span className="text-[13.5px] font-medium text-pf-text">
              {dragging ? "Drop them here" : "Drag images here, or click to browse"}
            </span>
          </button>
        ) : (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`grid grid-cols-3 gap-2.5 rounded-pf-lg p-1 transition-colors sm:grid-cols-4 lg:grid-cols-6 ${
              dragging ? "bg-pf-primary/10" : ""
            }`}
          >
            <AnimatePresence mode="popLayout">
              {images.map((img, i) => (
                <motion.div
                  key={img.id}
                  layout
                  initial={{ opacity: 0, scale: 0.86, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.86 }}
                  transition={{
                    type: "spring",
                    stiffness: 480,
                    damping: 34,
                    delay: i * 0.035,
                  }}
                  className="group relative aspect-square overflow-hidden rounded-pf-md border border-pf-border"
                  title={img.name}
                >
                  {/* Plain <img>: these are client-side object URLs, so
                      next/image optimisation has nothing to optimise. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.url}
                    alt={img.name}
                    className="size-full object-cover transition-opacity duration-150 group-hover:opacity-45"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(img.id)}
                    aria-label={`Remove ${img.name}`}
                    className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-pf-bg/85 text-pf-body opacity-0 backdrop-blur transition-opacity duration-150 focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Icon name="X" size={13} />
                  </button>
                  <span className="pointer-events-none absolute inset-x-1.5 bottom-1.5 truncate rounded-pf-sm bg-pf-bg/80 px-1.5 py-0.5 text-[10.5px] text-pf-body opacity-0 transition-opacity group-hover:opacity-100">
                    {img.name}
                  </span>
                </motion.div>
              ))}
            </AnimatePresence>

            {/* The last cell becomes "Add another image" — hidden at six. */}
            {!full && (
              <motion.button
                layout
                type="button"
                onClick={() => inputRef.current?.click()}
                className="grid aspect-square place-items-center gap-1.5 rounded-pf-md border border-dashed border-pf-border-hi text-pf-muted transition-colors hover:border-pf-primary-hi hover:text-pf-body"
              >
                <Icon name="ImagePlus" size={18} />
                <span className="px-2 text-center text-[11px] font-medium leading-tight">
                  Add another image
                </span>
              </motion.button>
            )}
          </div>
        )}

        <AnimatePresence>
          {error && (
            <InlineError onDismiss={() => setError(null)}>{error}</InlineError>
          )}
        </AnimatePresence>

        {hidden}
      </div>
    </SectionCard>
  );
}
