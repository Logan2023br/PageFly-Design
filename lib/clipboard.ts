"use client";

/**
 * Copy text to the clipboard, with a fallback.
 *
 * `navigator.clipboard` only exists in a secure context, so it is missing when
 * the dev server is reached over plain HTTP on a LAN address — exactly the setup
 * used to test on a phone. The hidden-textarea path is deprecated but still
 * works everywhere, and a prompt the merchant cannot copy is a dead feature.
 *
 * Returns false rather than throwing so the caller can show a real message.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }

  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
