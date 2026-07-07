/**
 * Thin wrapper around the model-download IPC pair (`osDownloadDictationModel`
 * + the `dictation-model-progress` event) so `use-dictation.ts` doesn't carry
 * the subscribe/unsubscribe boilerplate inline.
 */
import {
  onDictationModelProgress,
  osDownloadDictationModel,
} from "../os-bridge";

/** Download (and sha256-verify) the pinned dictation model, reporting 0-100
 *  progress as it streams. Rethrows any failure after cleaning up the
 *  progress subscription — the caller is responsible for surfacing it. */
export async function downloadDictationModel(
  onProgress: (pct: number) => void,
): Promise<void> {
  const unlisten = await onDictationModelProgress((p) => {
    onProgress(p.total > 0 ? Math.round((p.received / p.total) * 100) : 0);
  }).catch(() => undefined);
  try {
    await osDownloadDictationModel();
  } finally {
    unlisten?.();
  }
}
