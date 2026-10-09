"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { collectionFileUrl, formatPrice } from "@/lib/collectionPages";
import type { CollectionSetRecord } from "@/lib/db/types";
import { Button, Icon, Panel } from "../../ui";
import { PageThumb } from "../../landing/PagePreview";
import { AccessBadge, VisibilityBadge, api } from "./shared";

/* ==========================================================================
   /design/admin/collections — every set, in the order the public page shows
   them.

   A ROW PER SET, NOT A CARD GRID. What an operator does here is compare and
   reorder — which are visible, which cost money, which is first — and a list
   reads down one column where a grid makes the eye zig-zag. The cover is small
   because it is recognition, not inspection; inspection is the editor.

   THE COMMON ACTS ARE ON THE ROW. Hiding a set, moving it and opening it live
   are one press each without opening the editor; only changing what is IN the
   set needs the editor.
   ========================================================================== */

export function CollectionSetsAdmin({
  initial,
  missing: initialMissing,
}: {
  initial: CollectionSetRecord[];
  /** built-in sets not in the table yet, by name */
  missing: string[];
}) {
  const router = useRouter();
  const [sets, setSets] = useState(initial);
  const [missing, setMissing] = useState(initialMissing);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  const reload = async () => {
    const res = await api<{ sets: CollectionSetRecord[]; missing: string[] }>(
      "/api/admin/collection-pages",
    );
    if (res.ok) {
      setSets(res.sets);
      setMissing(res.missing);
    }
  };

  const run = async (key: string, act: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(key);
    setError(null);
    const res = await act();
    if (!res.ok) setError(res.error ?? "Something went wrong.");
    await reload();
    setBusy(null);
  };

  const create = async () => {
    if (!name.trim()) return;
    setBusy("create");
    setError(null);
    const res = await api<{ id: string }>("/api/admin/collection-pages", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    if (res.ok) router.push(`/design/admin/collections/${res.id}`);
    else {
      setError(res.error);
      setBusy(null);
    }
  };

  const move = (at: number, by: -1 | 1) => {
    const ids = sets.map((s) => s.id);
    const to = at + by;
    if (to < 0 || to >= ids.length) return;
    [ids[at], ids[to]] = [ids[to], ids[at]];
    /* Moved on screen now; the answer replaces it with what was stored. */
    setSets(ids.map((id) => sets.find((s) => s.id === id)!));
    void run(`move-${ids[to]}`, () =>
      api("/api/admin/collection-pages", { method: "PUT", body: JSON.stringify({ ids }) }),
    );
  };

  const toggle = (set: CollectionSetRecord) =>
    run(`vis-${set.id}`, () =>
      api(`/api/admin/collection-pages/${set.id}`, {
        method: "PATCH",
        /* Hide takes a set off either listing; Show puts a hidden one on the
           public page. Preview is chosen in the set's own settings. */
        body: JSON.stringify({
          ...settingsOf(set),
          visibility: set.visibility === "hidden" ? "visible" : "hidden",
        }),
      }),
    );

  const remove = (set: CollectionSetRecord) => {
    if (
      !window.confirm(
        `Delete “${set.name}” and all ${set.pages.length} of its pages? This cannot be undone.`,
      )
    )
      return;
    void run(`del-${set.id}`, () =>
      api(`/api/admin/collection-pages/${set.id}`, { method: "DELETE" }),
    );
  };

  const visible = sets.filter((s) => s.visibility === "visible").length;
  const preview = sets.filter((s) => s.visibility === "preview").length;
  const paid = sets.filter((s) => s.access === "paid").length;
  const pages = sets.reduce((n, s) => n + s.pages.length, 0);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-pf-muted">
          {sets.length} {sets.length === 1 ? "set" : "sets"} · {pages} pages · {visible} visible
          {preview > 0 && ` · ${preview} in preview`}
          {paid > 0 && ` · ${paid} paid`}
        </p>
        <div className="flex items-center gap-2">
          <Link
            href="/collection-pages"
            target="_blank"
            className="inline-flex h-10 items-center gap-2 rounded-pf-md border border-pf-border px-4 text-[13.5px] font-semibold text-pf-body transition-colors hover:border-pf-border-hi hover:bg-pf-card"
          >
            <Icon name="ArrowUpRight" size={16} />
            Public page
          </Link>
          <Button icon="Plus" onClick={() => setCreating(true)}>
            New set
          </Button>
        </div>
      </div>

      {creating && (
        <Panel className="flex flex-wrap items-center gap-2 p-3">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void create();
              if (e.key === "Escape") setCreating(false);
            }}
            placeholder="Store name, e.g. Maison Verde"
            className="min-w-0 flex-1 rounded-pf-md border border-pf-border bg-pf-bg-deep px-3 py-2 text-[13.5px] text-pf-text outline-none transition-colors focus:border-pf-primary-hi"
          />
          <Button onClick={() => void create()} disabled={!name.trim() || busy === "create"}>
            {busy === "create" ? "Creating…" : "Create and add pages"}
          </Button>
          <Button variant="quiet" onClick={() => setCreating(false)}>
            Cancel
          </Button>
          <p className="basis-full text-[12px] text-pf-faint">
            A new set starts hidden, so nobody sees it until its pages are in and you switch it on.
          </p>
        </Panel>
      )}

      {missing.length > 0 && (
        <Panel className="flex flex-wrap items-center justify-between gap-3 border-pf-primary-hi/30 p-4">
          <div className="grid gap-0.5">
            <p className="text-[13.5px] font-semibold text-pf-text">
              {missing.length} built-in {missing.length === 1 ? "set is" : "sets are"} not here yet
            </p>
            <p className="text-[12.5px] text-pf-muted">
              {missing.join(", ")} — copied in with every page and file, as free downloads. The
              three landing sets arrive visible, the others as Visible preview.
            </p>
          </div>
          <Button
            icon="Download"
            onClick={() =>
              void run("seed", () =>
                api("/api/admin/collection-pages/seed", { method: "POST" }),
              )
            }
            disabled={busy === "seed"}
          >
            {busy === "seed" ? "Importing…" : `Import ${missing.length}`}
          </Button>
        </Panel>
      )}

      {error && (
        <p role="alert" className="text-[13px] text-pf-danger">
          {error}
        </p>
      )}

      {sets.length === 0 ? (
        <Panel className="grid place-items-center gap-2 px-6 py-16 text-center">
          <Icon name="LayoutGrid" size={28} className="text-pf-faint" />
          <p className="text-[14px] font-semibold text-pf-text">No sets yet</p>
          <p className="max-w-sm text-[13px] text-pf-muted">
            Create a set, then drop its .html previews and .pagefly files into it.
          </p>
        </Panel>
      ) : (
        <ul className="grid gap-2.5">
          {sets.map((set, at) => {
            const cover = set.pages.find((p) => p.htmlSize !== null);
            const shown = set.pages.filter((p) => p.htmlSize !== null).length;
            return (
              <li key={set.id}>
                <Panel
                  className={`flex flex-wrap items-center gap-4 p-3 transition-opacity sm:flex-nowrap ${
                    busy?.endsWith(set.id) ? "opacity-60" : ""
                  }`}
                >
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => move(at, -1)}
                      disabled={at === 0 || busy !== null}
                      aria-label={`Move ${set.name} up`}
                      className="grid size-7 place-items-center rounded-pf-sm text-pf-faint transition-colors hover:bg-pf-card-hi hover:text-pf-text disabled:opacity-30"
                    >
                      <Icon name="ArrowUp" size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(at, 1)}
                      disabled={at === sets.length - 1 || busy !== null}
                      aria-label={`Move ${set.name} down`}
                      className="grid size-7 place-items-center rounded-pf-sm text-pf-faint transition-colors hover:bg-pf-card-hi hover:text-pf-text disabled:opacity-30"
                    >
                      <Icon name="ArrowDown" size={14} />
                    </button>
                  </div>

                  <Link
                    href={`/design/admin/collections/${set.id}`}
                    className="relative block aspect-[4/3] w-[120px] shrink-0 overflow-hidden rounded-pf-md border border-pf-border bg-pf-bg-deep"
                  >
                    {cover ? (
                      <PageThumb
                        set={{ id: set.slug, name: set.name, blurb: set.blurb, pages: [] }}
                        page={{
                          slug: cover.slug,
                          label: cover.label,
                          blurb: cover.blurb,
                          src: collectionFileUrl(set.slug, cover.slug, "html", cover.updatedAt),
                        }}
                        lazy
                      />
                    ) : (
                      <span className="grid h-full place-items-center text-[11px] text-pf-faint">
                        No preview
                      </span>
                    )}
                  </Link>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/design/admin/collections/${set.id}`}
                        className="truncate font-display text-[16px] font-semibold text-pf-text hover:underline"
                      >
                        {set.name}
                      </Link>
                      <VisibilityBadge visibility={set.visibility} />
                      <AccessBadge access={set.access} price={formatPrice(set.priceCents)} />
                    </div>
                    <p className="mt-0.5 truncate text-[12.5px] text-pf-faint">
                      /collection-pages/{set.slug}
                    </p>
                    <p className="mt-1 line-clamp-1 text-[12.5px] text-pf-muted">
                      {set.blurb || "No description yet."}
                    </p>
                    <p className="mt-1 text-[12px] text-pf-faint">
                      {set.pages.length} pages
                      {shown < set.pages.length && ` · ${set.pages.length - shown} without a preview`}
                      {" · "}updated {new Date(set.updatedAt).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={set.visibility === "hidden" ? "Eye" : "EyeOff"}
                      onClick={() => void toggle(set)}
                      disabled={busy !== null}
                    >
                      {set.visibility === "hidden" ? "Show" : "Hide"}
                    </Button>
                    <Link
                      href={`/collection-pages/${set.slug}`}
                      target="_blank"
                      aria-label={`Open ${set.name} on the public page`}
                      title={
                        set.visibility === "hidden"
                          ? "Preview (only admins can see it)"
                          : "Open the public page"
                      }
                      className="grid size-8 place-items-center rounded-pf-md border border-pf-border text-pf-body transition-colors hover:border-pf-border-hi hover:text-pf-text"
                    >
                      <Icon name="ArrowUpRight" size={14} />
                    </Link>
                    <Link
                      href={`/design/admin/collections/${set.id}`}
                      className="inline-flex h-8 items-center gap-1.5 rounded-pf-md bg-pf-primary px-3 text-[12.5px] font-semibold text-white shadow-pf-button transition-colors hover:bg-pf-primary-hi"
                    >
                      <Icon name="Pencil" size={13} />
                      Edit
                    </Link>
                    <button
                      type="button"
                      onClick={() => remove(set)}
                      disabled={busy !== null}
                      aria-label={`Delete ${set.name}`}
                      className="grid size-8 place-items-center rounded-pf-md text-pf-faint transition-colors hover:bg-pf-danger/10 hover:text-pf-danger"
                    >
                      <Icon name="Trash2" size={14} />
                    </button>
                  </div>
                </Panel>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** A set's editable fields, as PATCH takes them. */
export function settingsOf(set: CollectionSetRecord) {
  return {
    name: set.name,
    slug: set.slug,
    blurb: set.blurb,
    visibility: set.visibility,
    access: set.access,
    priceCents: set.priceCents,
    buyUrl: set.buyUrl,
  };
}
