import { logAndReportError } from "../../lib/error-report";
import { openExternalUrl } from "../../lib/open-external-url";
import { saveBlob } from "../../lib/save-blob";
import { copyImageWith } from "./org-chart-share-copy";
import type { PasteDeps } from "./org-chart-share-paste";
import type { ShareSheet } from "./org-chart-share-run";
import type { ShareImageDraw } from "./use-share-card-image";

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

export function coarsePointer(): boolean {
  return (
    typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches
  );
}

export function canCopyImage(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.clipboard?.write === "function" &&
    typeof globalThis.ClipboardItem === "function"
  );
}

function writeImage(png: Promise<File>): Promise<void> {
  return navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}

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

export function copyImageToClipboard(png: Promise<File>): Promise<boolean> {
  return copyImageWith(writeImage, logAndReportError, png);
}

export async function downloadShareImage(
  drawing: ShareImageDraw,
): Promise<boolean> {
  try {
    const file = await drawing.png;
    return (await saveBlob(file.name, file)).kind === "saved";
  } catch (error) {
    if (!drawing.failed) logAndReportError("org_chart_share_save", error);
    return false;
  }
}
