"use client";

import { toPng } from "html-to-image";

/* ==========================================================================
   Client-side PNG capture.

   Mockups are DOM, and every image inside them is a CSS gradient rather than a
   fetched asset, so a node capture is lossless and needs no network access.
   ========================================================================== */

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export async function captureNode(
  node: HTMLElement,
  background: string,
): Promise<string> {
  return toPng(node, {
    pixelRatio: 2,
    backgroundColor: background,
    // The node is already exactly the size we want; skip html-to-image's
    // own sizing guesswork.
    width: node.scrollWidth,
    height: node.scrollHeight,
    style: { transform: "none", margin: "0" },
  });
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Waits for two frames so React's commit has actually painted. */
export function nextPaint(): Promise<void> {
  return new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
}
