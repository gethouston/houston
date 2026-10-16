import { logAndReportError } from "../../lib/error-report";
import { openExternalUrl } from "../../lib/open-external-url";
import { saveBlob } from "../../lib/save-blob";
import { copyImageWith } from "./org-chart-share-copy";
import type { PasteDeps } from "./org-chart-share-paste";
import type { ShareSheet } from "./org-chart-share-run";
import type { ShareImageDraw } from "./use-share-card-image";

/** `navigator.share` and `canShare`, where there is a share sheet. */
export function shareSheet(): ShareSheet | undefined {
  return typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function"
    ? {
        canShare: (data) => navigator.canShare(data),
        share: (data) => navigator.share(data),
      }
    : undefined;
}

/** Whether the primary pointer is a finger: phones and tablets. */
export function coarsePointer(): boolean {
  return (
    typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches
  );
}

/** Whether this browser can put a PNG on the clipboard. */
export function canCopyImage(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.clipboard?.write === "function" &&
    typeof globalThis.ClipboardItem === "function"
  );
}

/** One PNG `ClipboardItem`; it takes the promise, so the write starts now. */
function writeImage(png: Promise<File>): Promise<void> {
  return navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}

/** Copy and paste (`shareByPaste`) bound to this browser or the desktop app. */
export function pasteDeps(
  post: string,
  png: Promise<File>,
  tauri: boolean,
): PasteDeps {
  return {
    post,
    png,
    copyImage: canCopyImage() ? writeImage : undefined,
    open: (url) => openExternalUrl(url, { command: "org_chart_share" }),
    save: async (file) => (await saveBlob(file.name, file)).kind === "saved",
    report: logAndReportError,
    tauri,
  };
}

/** The dialog's Copy image (`copyImageWith`) on this browser's clipboard. */
export function copyImageToClipboard(png: Promise<File>): Promise<boolean> {
  return copyImageWith(writeImage, logAndReportError, png);
}

/** The dialog's Download image: `true` once saved, `false` when cancelled. */
export async function downloadShareImage(
  drawing: ShareImageDraw,
): Promise<boolean> {
  try {
    const file = await drawing.png;
    return (await saveBlob(file.name, file)).kind === "saved";
  } catch (error) {
    // A failed drawing already reported; the preview offers Try again.
    if (!drawing.failed) logAndReportError("org_chart_share_save", error);
    return false;
  }
}
