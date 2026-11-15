import { showErrorToast } from "../../lib/error-toast";
import { fileReadRefusal } from "../../lib/file-gone";
import { reportQuietError } from "../../lib/quiet-error-report";
import type { tauriFiles } from "../../lib/tauri";
import type { Loaded } from "./file-preview-body";

/** The bytes a loaded state shows, if it shows any. */
export const shownBytes = (l: Loaded): Blob | undefined =>
  l.state === "pdf" ? l.data : "blob" in l ? l.blob : undefined;

/** Whether a reload brought the bytes already on screen. */
export async function sameBytes(a: Blob, b: Blob): Promise<boolean> {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  const [x, y] = await Promise.all([a.arrayBuffer(), b.arrayBuffer()]);
  const left = new Uint8Array(x);
  const right = new Uint8Array(y);
  return left.every((v, i) => v === right[i]);
}

/** Report a refused conversion: a full capacity quietly, a failed one loudly,
 *  a refused read not here (the panel says so, and the download reports an
 *  outside link itself). */
export function reportPreviewRefusal(
  refusal: ReturnType<typeof tauriFiles.classifyPreviewRefusal>,
  agentPath: string,
): void {
  if (refusal.fallback && refusal.report) {
    if (refusal.quiet)
      reportQuietError(
        refusal.quiet,
        "office_preview",
        refusal.error.message,
        refusal.error,
        { agentPath },
      );
    else showErrorToast("office_preview", refusal.error.message, refusal.error);
  } else if (!refusal.fallback && !fileReadRefusal(refusal.error)) {
    showErrorToast("office_preview", String(refusal.error), refusal.error);
  }
}
