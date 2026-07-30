/* Pure colour helpers shared by the client form and the server-side generator.
   Deliberately free of "use client" and of any DOM access: lib/imageAnalysis.ts
   is browser-only (it needs a canvas), and importing that from the API route
   would drag a client module into a server handler. */

/**
 * Merge the palettes of several references into one ordered list.
 * Colours the merchant typed in explicitly always outrank extracted ones.
 */
export function mergePalettes(
  images: { palette?: string[] }[],
  limit = 4,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  // Round-robin so the first image does not monopolise the list.
  const depth = Math.max(0, ...images.map((i) => i.palette?.length ?? 0));
  for (let d = 0; d < depth && out.length < limit; d++) {
    for (const img of images) {
      const hex = img.palette?.[d];
      if (!hex || seen.has(hex)) continue;
      seen.add(hex);
      out.push(hex);
      if (out.length >= limit) break;
    }
  }
  return out;
}
