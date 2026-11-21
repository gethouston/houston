import { reportError } from "./error-report";
import { reportQuietError } from "./quiet-error-report";
import { toUpdateDownloadError } from "./update-download-failure";

export function reportUpdateDownloadFailure(
  version: string,
  err: unknown,
): void {
  const error = toUpdateDownloadError(err);
  if (error.kind === "in_progress") return;
  const command = "update_download";
  const message = `download of ${version} ${error.message}`;
  const progress = {
    received: error.received,
    total: error.total,
    attempts: error.attempts,
  };
  if (error.kind === "network") {
    reportQuietError("offline", command, message, error, undefined, progress);
    return;
  }
  if (error.kind === "upstream") {
    reportQuietError(
      "release_host_unavailable",
      command,
      message,
      error,
      undefined,
      progress,
    );
    return;
  }
  if (error.kind === "storage_full") {
    reportQuietError(
      "storage_full",
      command,
      message,
      error,
      undefined,
      progress,
    );
    return;
  }
  reportError(command, message, error);
}
