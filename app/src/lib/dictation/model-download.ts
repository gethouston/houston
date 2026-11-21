import {
  onDictationModelProgress,
  osDownloadDictationModel,
} from "../os-bridge";

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
