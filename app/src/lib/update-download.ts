import { osDownloadUpdate } from "./os-bridge";
import {
  applyDownloadEvent,
  type DownloadTally,
  EMPTY_DOWNLOAD_TALLY,
} from "./update-download-progress";
import { downloadAttemptBudget, type UpdateOrigin } from "./update-policy";

export function downloadReleaseBytes(
  updateRid: number,
  origin: UpdateOrigin,
  onProgress: (progress: number | null) => void,
): Promise<number> {
  let tally: DownloadTally = EMPTY_DOWNLOAD_TALLY;
  return osDownloadUpdate(updateRid, downloadAttemptBudget(origin), (event) => {
    const next = applyDownloadEvent(tally, event);
    tally = next.tally;
    onProgress(next.progress);
  });
}
