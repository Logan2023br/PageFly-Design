"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  MAX_FILE_BYTES,
  collectionFileUrl,
  formatBytes,
  formatPrice,
  readFileName,
  slugify,
} from "@/lib/collectionPages";
import type { CollectionFileKind, CollectionPageMeta, CollectionSetRecord } from "@/lib/db/types";
import { Button, Icon, Panel } from "../../ui";
import { PageThumb } from "../../landing/PagePreview";
import { settingsOf } from "./CollectionSetsAdmin";
import { AccessBadge, FIELD, FIELD_LABEL, Segmented, VisibilityBadge, api } from "./shared";

/* ==========================================================================
   ONE SET: ITS PAGES ON THE LEFT, ITS SETTINGS ON THE RIGHT.

   The pages are the work, so they get the width. The settings are a short
   form that is set once and checked often, so they sit beside the pages where
   "is this visible, and is it free" can be read without scrolling past seven
   thumbnails.

   FILES GO IN BY DROPPING THEM. A set is fourteen files — an .html and a
   .pagefly per page — and they are paired by name, so a folder dragged in
   whole becomes one row per page. Dropping a file whose name matches a page
   replaces that file on that page; a new name adds a page.

   UPLOADED ONE AT A TIME, IN ORDER. The .html and the .pagefly of a new page
   would otherwise race to create the same page, and the second would lose.
   ========================================================================== */

type Upload = { key: string; name: string; state: "waiting" | "sending" | "done" | "failed"; error?: string };

const toPrice = (cents: number | null) => (cents === null ? "" : String(cents / 100));

export function CollectionSetEditor({ initial }: { initial: CollectionSetRecord }) {
  const router = useRouter();
  const [set, setSet] = useState(initial);
  const [draft, setDraft] = useState(() => ({
    ...settingsOf(initial),
    price: toPrice(initial.priceCents),
  }));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busyPage, setBusyPage] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  /** which page and file a "Replace" press is for */
  const replacing = useRef<{ slug: string; kind: CollectionFileKind } | null>(null);

  const priceCents = draft.price.trim() === "" ? null : Math.round(Number(draft.price) * 100);
  const saved_ = settingsOf(set);
  const dirty =
    draft.name !== saved_.name ||
    draft.slug !== saved_.slug ||
    draft.blurb !== saved_.blurb ||
    draft.visible !== saved_.visible ||
    draft.access !== saved_.access ||
    (draft.access === "paid" && (priceCents !== saved_.priceCents || (draft.buyUrl ?? "") !== (saved_.buyUrl ?? "")));

  const previewable = set.pages.filter((p) => p.htmlSize !== null).length;
  const downloadable = set.pages.filter((p) => p.pageflySize !== null).length;

  const save = async () => {
    if (draft.access === "paid" && (priceCents === null || Number.isNaN(priceCents))) {
      setError("A paid set needs a price.");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await api<{ set: CollectionSetRecord }>(`/api/admin/collection-pages/${set.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: draft.name,
        slug: draft.slug,
        blurb: draft.blurb,
        visible: draft.visible,
        access: draft.access,
        /* A free set keeps no price: switching back to paid later starts from
           an empty field rather than from a number nobody re-checked. */
        priceCents: draft.access === "paid" ? priceCents : null,
        buyUrl: draft.access === "paid" ? draft.buyUrl : null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSet(res.set);
    setDraft({ ...settingsOf(res.set), price: toPrice(res.set.priceCents) });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  /* ---- files ---- */

  const send = async (files: File[], forced?: { slug: string; kind: CollectionFileKind }) => {
    const queue: (Upload & { file: File; slug: string; kind: CollectionFileKind })[] = [];
    const rejected: Upload[] = [];
    files.forEach((file, i) => {
      const key = `${Date.now()}-${i}-${file.name}`;
      const read = forced ?? readFileName(file.name);
      if (!read) {
        rejected.push({ key, name: file.name, state: "failed", error: "Only .html and .pagefly files." });
      } else if (forced && readFileName(file.name)?.kind !== forced.kind) {
        rejected.push({ key, name: file.name, state: "failed", error: `Expected a .${forced.kind} file.` });
      } else if (file.size > MAX_FILE_BYTES) {
        rejected.push({ key, name: file.name, state: "failed", error: "Over 4 MB." });
      } else {
        queue.push({ key, name: file.name, state: "waiting", file, ...read });
      }
    });
    /* HTML first within a page: it is what makes the page show, so a slow
       upload leaves a previewable page rather than a file with nothing to see. */
    const firstSeen = new Map<string, number>();
    queue.forEach((q, i) => firstSeen.has(q.slug) || firstSeen.set(q.slug, i));
    /* Pages keep the order they were dropped in — that is the order the
       operator meant — and within one page the preview goes first. */
    queue.sort(
      (a, b) =>
        firstSeen.get(a.slug)! - firstSeen.get(b.slug)! ||
        (a.kind === b.kind ? 0 : a.kind === "html" ? -1 : 1),
    );
    setUploads((u) => [...rejected, ...queue.map(({ key, name, state }) => ({ key, name, state })), ...u].slice(0, 40));

    const mark = (key: string, patch: Partial<Upload>) =>
      setUploads((u) => u.map((x) => (x.key === key ? { ...x, ...patch } : x)));

    for (const item of queue) {
      mark(item.key, { state: "sending" });
      const res = await api<{ set: CollectionSetRecord }>(
        `/api/admin/collection-pages/${set.id}/files?slug=${encodeURIComponent(item.slug)}&kind=${item.kind}`,
        { method: "POST", body: item.file, headers: { "Content-Type": "application/octet-stream" } },
      );
      if (res.ok) {
        setSet(res.set);
        mark(item.key, { state: "done" });
      } else {
        mark(item.key, { state: "failed", error: res.error });
      }
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void send(Array.from(e.dataTransfer.files));
  };

  const pick = (target: { slug: string; kind: CollectionFileKind } | null) => {
    replacing.current = target;
    if (picker.current) {
      picker.current.accept = target ? `.${target.kind}` : ".html,.htm,.pagefly";
      picker.current.multiple = !target;
      picker.current.click();
    }
  };

  /* ---- pages ---- */

  const pageCall = async (key: string, init: RequestInit, query = "") => {
    setBusyPage(key);
    setPageError(null);
    const res = await api<{ set: CollectionSetRecord }>(
      `/api/admin/collection-pages/${set.id}/pages${query}`,
      init,
    );
    setBusyPage(null);
    if (res.ok) setSet(res.set);
    else setPageError(res.error);
    return res.ok;
  };

  const movePage = (at: number, by: -1 | 1) => {
    const ids = set.pages.map((p) => p.id);
    const to = at + by;
    if (to < 0 || to >= ids.length) return;
    [ids[at], ids[to]] = [ids[to], ids[at]];
    setSet({ ...set, pages: ids.map((id) => set.pages.find((p) => p.id === id)!) });
    void pageCall(ids[to], { method: "PUT", body: JSON.stringify({ ids }) });
  };

  const removePage = (page: CollectionPageMeta) => {
    if (!window.confirm(`Delete the “${page.label}” page and its files?`)) return;
    void pageCall(page.id, { method: "DELETE" }, `?page=${page.id}`);
  };

  const removeSet = async () => {
    if (!window.confirm(`Delete “${set.name}” and all ${set.pages.length} pages? This cannot be undone.`)) return;
    const res = await api(`/api/admin/collection-pages/${set.id}`, { method: "DELETE" });
    if (res.ok) router.push("/design/admin/collections");
    else setError(res.error);
  };

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/design/admin/collections"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-pf-muted transition-colors hover:text-pf-text"
        >
          <Icon name="ArrowLeft" size={14} />
          All sets
        </Link>
        <div className="flex items-center gap-2">
          <VisibilityBadge visible={set.visible} />
          <AccessBadge access={set.access} price={formatPrice(set.priceCents)} />
          <Link
            href={`/collection-pages/${set.slug}`}
            target="_blank"
            className="inline-flex h-8 items-center gap-1.5 rounded-pf-md border border-pf-border px-3 text-[12.5px] font-semibold text-pf-body transition-colors hover:border-pf-border-hi hover:text-pf-text"
          >
            <Icon name="ArrowUpRight" size={13} />
            {set.visible ? "Open public page" : "Preview"}
          </Link>
        </div>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* ============================ PAGES ============================ */}
        <section
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(e) => {
            if (e.currentTarget === e.target) setDragging(false);
          }}
          onDrop={onDrop}
          className="grid gap-3"
        >
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-[15px] font-semibold text-pf-text">Pages · {set.pages.length}</h2>
              <p className="text-[12.5px] text-pf-faint">
                {previewable} with a preview · {downloadable} with a .pagefly · the order here is the order on the public page
              </p>
            </div>
            <Button icon="Upload" size="sm" onClick={() => pick(null)}>
              Add files
            </Button>
          </div>

          <input
            ref={picker}
            type="file"
            multiple
            accept=".html,.htm,.pagefly"
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (files.length) void send(files, replacing.current ?? undefined);
            }}
          />

          <button
            type="button"
            onClick={() => pick(null)}
            className={`grid place-items-center gap-1.5 rounded-pf-card border-2 border-dashed px-6 py-7 text-center transition-colors ${
              dragging
                ? "border-pf-primary-hi bg-pf-primary/10"
                : "border-pf-border hover:border-pf-border-hi hover:bg-pf-card"
            }`}
          >
            <Icon name="Upload" size={22} className="text-pf-primary-hi" />
            <span className="text-[13.5px] font-semibold text-pf-text">
              Drop .html and .pagefly files here
            </span>
            <span className="text-[12px] text-pf-faint">
              Paired by name — <code>home.html</code> + <code>home.pagefly</code> is one page. A name
              that matches a page replaces its file. Up to 4 MB each.
            </span>
          </button>

          {uploads.length > 0 && (
            <Panel className="grid gap-1 p-3">
              <div className="flex items-center justify-between">
                <span className={FIELD_LABEL}>Uploads</span>
                <button
                  type="button"
                  onClick={() => setUploads((u) => u.filter((x) => x.state === "sending" || x.state === "waiting"))}
                  className="text-[12px] text-pf-faint hover:text-pf-text"
                >
                  Clear
                </button>
              </div>
              {uploads.map((u) => (
                <div key={u.key} className="flex items-center gap-2 text-[12.5px]">
                  <Icon
                    name={u.state === "done" ? "CircleCheck" : u.state === "failed" ? "CircleAlert" : "Loader"}
                    size={13}
                    className={
                      u.state === "done"
                        ? "text-pf-success"
                        : u.state === "failed"
                          ? "text-pf-danger"
                          : "animate-spin text-pf-faint"
                    }
                  />
                  <span className="truncate text-pf-body">{u.name}</span>
                  <span className={`ml-auto shrink-0 ${u.state === "failed" ? "text-pf-danger" : "text-pf-faint"}`}>
                    {u.state === "failed" ? u.error : u.state === "done" ? "Added" : u.state === "sending" ? "Uploading…" : "Waiting"}
                  </span>
                </div>
              ))}
            </Panel>
          )}

          {pageError && (
            <p role="alert" className="text-[13px] text-pf-danger">
              {pageError}
            </p>
          )}

          <ul className="grid gap-2.5">
            {set.pages.map((page, at) => (
              <PageRow
                key={page.id}
                setSlug={set.slug}
                page={page}
                first={at === 0}
                last={at === set.pages.length - 1}
                busy={busyPage === page.id}
                free={set.access === "free"}
                onMove={(by) => movePage(at, by)}
                onDelete={() => removePage(page)}
                onReplace={(kind) => pick({ slug: page.slug, kind })}
                onSave={(patch) =>
                  pageCall(page.id, {
                    method: "PATCH",
                    body: JSON.stringify({
                      page: page.id,
                      slug: page.slug,
                      label: page.label,
                      blurb: page.blurb,
                      ...patch,
                    }),
                  })
                }
              />
            ))}
          </ul>
        </section>

        {/* =========================== SETTINGS =========================== */}
        <aside className="lg:sticky lg:top-4">
          <Panel className="grid gap-4 p-4">
            <h2 className="text-[15px] font-semibold text-pf-text">Settings</h2>

            <label className="grid gap-1.5">
              <span className={FIELD_LABEL}>Name</span>
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className={FIELD}
              />
            </label>

            <label className="grid gap-1.5">
              <span className={FIELD_LABEL}>URL</span>
              <div className="flex items-center rounded-pf-md border border-pf-border bg-pf-bg-deep focus-within:border-pf-primary-hi">
                <span className="shrink-0 pl-3 text-[12.5px] text-pf-faint">/collection-pages/</span>
                <input
                  value={draft.slug}
                  onChange={(e) => setDraft({ ...draft, slug: e.target.value.toLowerCase() })}
                  onBlur={() => setDraft((d) => ({ ...d, slug: slugify(d.slug) || d.slug }))}
                  className="min-w-0 flex-1 bg-transparent py-2 pr-3 text-[13px] text-pf-text outline-none"
                />
              </div>
            </label>

            <label className="grid gap-1.5">
              <span className={FIELD_LABEL}>Description</span>
              <textarea
                value={draft.blurb}
                onChange={(e) => setDraft({ ...draft, blurb: e.target.value })}
                rows={3}
                maxLength={300}
                placeholder="One line naming the look — shown under the set's name."
                className={`${FIELD} resize-y`}
              />
            </label>

            <div className="grid gap-1.5">
              <span className={FIELD_LABEL}>Visibility</span>
              <Segmented
                label="Visibility"
                value={draft.visible ? "visible" : "hidden"}
                onChange={(v) => setDraft({ ...draft, visible: v === "visible" })}
                options={[
                  { id: "visible", label: "Visible" },
                  { id: "hidden", label: "Hidden" },
                ]}
              />
              <p className="text-[12px] text-pf-faint">
                {draft.visible
                  ? previewable === 0
                    ? "Visible, but it has no page with a preview yet, so it will not show."
                    : "Listed on /collection-pages for everyone."
                  : "Only admins can open it — use Preview to check it first."}
              </p>
            </div>

            <div className="grid gap-1.5">
              <span className={FIELD_LABEL}>Access</span>
              <Segmented
                label="Access"
                value={draft.access}
                onChange={(v) => setDraft({ ...draft, access: v })}
                options={[
                  { id: "free", label: "Free download" },
                  { id: "paid", label: "Paid" },
                ]}
              />
              <p className="text-[12px] text-pf-faint">
                {draft.access === "free"
                  ? "Anyone can download every page and the whole set."
                  : "Previews stay open; the files are held back and the button goes to your buy link."}
              </p>
            </div>

            {draft.access === "paid" && (
              <>
                <label className="grid gap-1.5">
                  <span className={FIELD_LABEL}>Price (USD)</span>
                  <div className="flex items-center rounded-pf-md border border-pf-border bg-pf-bg-deep focus-within:border-pf-primary-hi">
                    <span className="pl-3 text-[13px] text-pf-faint">$</span>
                    <input
                      inputMode="decimal"
                      value={draft.price}
                      onChange={(e) => setDraft({ ...draft, price: e.target.value.replace(/[^0-9.]/g, "") })}
                      placeholder="29"
                      className="min-w-0 flex-1 bg-transparent px-2 py-2 text-[13px] text-pf-text outline-none"
                    />
                  </div>
                </label>
                <label className="grid gap-1.5">
                  <span className={FIELD_LABEL}>Buy link</span>
                  <input
                    value={draft.buyUrl ?? ""}
                    onChange={(e) => setDraft({ ...draft, buyUrl: e.target.value })}
                    placeholder="https://… checkout, product page or contact form"
                    className={FIELD}
                  />
                  <p className="text-[12px] text-pf-faint">
                    There is no checkout in this app — the Buy button opens this link.
                  </p>
                </label>
              </>
            )}

            {error && (
              <p role="alert" className="text-[13px] text-pf-danger">
                {error}
              </p>
            )}

            <div className="flex items-center gap-2">
              <Button onClick={() => void save()} disabled={!dirty || saving} className="flex-1">
                {saving ? "Saving…" : saved ? "Saved" : "Save changes"}
              </Button>
              {dirty && !saving && (
                <Button
                  variant="quiet"
                  onClick={() => {
                    setDraft({ ...settingsOf(set), price: toPrice(set.priceCents) });
                    setError(null);
                  }}
                >
                  Discard
                </Button>
              )}
            </div>
          </Panel>

          <div className="mt-3 flex justify-end">
            <Button variant="danger" size="sm" icon="Trash2" onClick={() => void removeSet()}>
              Delete set
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ==========================================================================
   ONE PAGE: its preview, its words, its two files.

   The words save when the field is left, not on a button: there are seven of
   these, and a Save per row is seven chances to forget one. Each file shows
   its size, or says it is missing and what that costs — no preview means the
   page is not shown, no .pagefly means it cannot be downloaded.
   ========================================================================== */
function PageRow({
  setSlug,
  page,
  first,
  last,
  busy,
  free,
  onMove,
  onDelete,
  onReplace,
  onSave,
}: {
  setSlug: string;
  page: CollectionPageMeta;
  first: boolean;
  last: boolean;
  busy: boolean;
  free: boolean;
  onMove: (by: -1 | 1) => void;
  onDelete: () => void;
  onReplace: (kind: CollectionFileKind) => void;
  onSave: (patch: Partial<Pick<CollectionPageMeta, "label" | "slug" | "blurb">>) => Promise<boolean>;
}) {
  const [label, setLabel] = useState(page.label);
  const [blurb, setBlurb] = useState(page.blurb);
  const [slug, setPageSlug] = useState(page.slug);
  const html = page.htmlSize !== null ? collectionFileUrl(setSlug, page.slug, "html", page.updatedAt) : null;

  const commit = async (patch: Partial<Pick<CollectionPageMeta, "label" | "slug" | "blurb">>) => {
    const ok = await onSave(patch);
    /* A refused edit goes back to what is stored, so the field never shows a
       value the page does not have. */
    if (!ok) {
      setLabel(page.label);
      setBlurb(page.blurb);
      setPageSlug(page.slug);
    }
  };

  return (
    <li>
      <Panel className={`flex gap-3 p-3 transition-opacity ${busy ? "opacity-60" : ""}`}>
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={first}
            aria-label={`Move ${page.label} up`}
            className="grid size-7 place-items-center rounded-pf-sm text-pf-faint transition-colors hover:bg-pf-card-hi hover:text-pf-text disabled:opacity-30"
          >
            <Icon name="ArrowUp" size={14} />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={last}
            aria-label={`Move ${page.label} down`}
            className="grid size-7 place-items-center rounded-pf-sm text-pf-faint transition-colors hover:bg-pf-card-hi hover:text-pf-text disabled:opacity-30"
          >
            <Icon name="ArrowDown" size={14} />
          </button>
        </div>

        {html ? (
          <a
            href={html}
            target="_blank"
            rel="noreferrer"
            title="Open the preview full size"
            className="group relative block aspect-[3/4] w-[88px] shrink-0 overflow-hidden rounded-pf-md border border-pf-border"
          >
            <PageThumb
              set={{ id: setSlug, name: "", blurb: "", pages: [] }}
              page={{ slug: page.slug, label: page.label, blurb: page.blurb, src: html }}
              lazy
            />
            <span className="absolute inset-0 grid place-items-center bg-pf-bg/60 opacity-0 transition-opacity group-hover:opacity-100">
              <Icon name="Maximize" size={16} className="text-pf-text" />
            </span>
          </a>
        ) : (
          <button
            type="button"
            onClick={() => onReplace("html")}
            className="grid aspect-[3/4] w-[88px] shrink-0 place-items-center rounded-pf-md border border-dashed border-pf-border px-2 text-center text-[11px] text-pf-faint transition-colors hover:border-pf-border-hi hover:text-pf-text"
          >
            Add an .html preview
          </button>
        )}

        <div className="grid min-w-0 flex-1 content-start gap-2">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onBlur={() => label.trim() !== page.label && void commit({ label: label.trim() })}
              aria-label="Page name"
              className={`${FIELD} font-semibold`}
            />
            <div className="flex items-center rounded-pf-md border border-pf-border bg-pf-bg-deep focus-within:border-pf-primary-hi">
              <span className="shrink-0 pl-3 text-[12px] text-pf-faint">/</span>
              <input
                value={slug}
                onChange={(e) => setPageSlug(e.target.value.toLowerCase())}
                onBlur={() => {
                  const next = slugify(slug);
                  setPageSlug(next || page.slug);
                  if (next && next !== page.slug) void commit({ slug: next });
                }}
                aria-label="Page URL"
                className="min-w-0 flex-1 bg-transparent py-2 pl-1 pr-3 text-[12.5px] text-pf-body outline-none"
              />
            </div>
          </div>
          <input
            value={blurb}
            onChange={(e) => setBlurb(e.target.value)}
            onBlur={() => blurb.trim() !== page.blurb && void commit({ blurb: blurb.trim() })}
            placeholder="One line under the card — what this page is for"
            aria-label="Page description"
            className={FIELD}
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <FileChip kind="html" size={page.htmlSize} onReplace={() => onReplace("html")} note="not shown" />
            <FileChip
              kind="pagefly"
              size={page.pageflySize}
              onReplace={() => onReplace("pagefly")}
              note={free ? "no download" : "none held"}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${page.label}`}
          className="grid size-8 shrink-0 place-items-center self-start rounded-pf-md text-pf-faint transition-colors hover:bg-pf-danger/10 hover:text-pf-danger"
        >
          <Icon name="Trash2" size={14} />
        </button>
      </Panel>
    </li>
  );
}

function FileChip({
  kind,
  size,
  onReplace,
  note,
}: {
  kind: CollectionFileKind;
  size: number | null;
  onReplace: () => void;
  /** what a missing file costs, said on the chip */
  note: string;
}) {
  const has = size !== null;
  return (
    <button
      type="button"
      onClick={onReplace}
      title={has ? `Replace the .${kind}` : `Upload the .${kind}`}
      className={`group inline-flex items-center gap-1.5 rounded-pf-pill border px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
        has
          ? "border-pf-border text-pf-muted hover:border-pf-border-hi hover:text-pf-text"
          : "border-pf-warn/40 text-pf-warn hover:bg-pf-warn/10"
      }`}
    >
      <Icon name={has ? (kind === "html" ? "FileText" : "Package") : "CircleAlert"} size={12} />
      .{kind} · {has ? formatBytes(size) : `missing — ${note}`}
      <span className="hidden text-pf-primary-hi group-hover:inline">{has ? "Replace" : "Upload"}</span>
    </button>
  );
}
