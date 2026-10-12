import "server-only";

import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

/* ==========================================================================
   Design files on disk, outside `public/`.

   UPSELL_STORAGE_DIR on the VPS (e.g. /var/data/upsell). Unset, a directory in
   the project — fine for development, and gitignored.

   The database stores paths RELATIVE to the root, so moving the directory is
   changing one variable, not rewriting rows.
   ========================================================================== */

export const MAX_UPSELL_FILE_BYTES = 15 * 1024 * 1024;

export function storageRoot(): string {
  return resolve(process.env.UPSELL_STORAGE_DIR?.trim() || join(process.cwd(), ".pfd-upsell"));
}

/** `{design}/v{version}/page{slot}.{ext}` */
export function relPath(designId: string, version: number, slot: number, ext: "html" | "pagefly" | "png"): string {
  return `${designId}/v${version}/page${slot}.${ext}`;
}

/** Absolute path, refusing anything that would land outside the root. */
function abs(rel: string): string {
  const root = storageRoot();
  const full = resolve(root, rel);
  if (full !== root && !full.startsWith(root + sep)) throw new Error("Path escapes the storage root.");
  return full;
}

export async function putFile(rel: string, bytes: Uint8Array): Promise<void> {
  const full = abs(rel);
  await mkdir(resolve(full, ".."), { recursive: true });
  await writeFile(full, bytes);
}

export async function getFile(rel: string | null): Promise<Buffer | null> {
  if (!rel) return null;
  try {
    return await readFile(abs(rel));
  } catch {
    return null;
  }
}

export async function fileExists(rel: string | null): Promise<boolean> {
  if (!rel) return false;
  try {
    return (await stat(abs(rel))).isFile();
  } catch {
    return false;
  }
}

/** Every version of a design's files. The rows and events stay. */
export async function removeDesignFiles(designId: string): Promise<void> {
  await rm(abs(designId), { recursive: true, force: true });
}
