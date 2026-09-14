import { reportError } from "./error-report";
import { reportQuietError } from "./quiet-error-report";
import { toUpdateDownloadError } from "./update-download-failure";

/**
 * Report a failed release download (PRODUCT-1727). The shell already retried
 * and resumed it; what reaches here is the LAST attempt, with the byte
 * position in the message. A `network` failure is the device's link, not a
 * bug: it captures as the quiet `offline` class (one fingerprinted warning
 * issue, burst-collapsed), the way every other transport drop does. An
 * `upstream` failure is the release host answering a transient status for
 * the whole budget (a 504 from GitHub's asset CDN mid-roll, PRODUCT-1811):
 * its own quiet class, tagged with the status, so an outage is one counted
 * issue and never a per-user bug. Any other class (a final HTTP status, a
 * signature that did not verify, a missing resource) is a real error and
 * files as one.
 */
export function reportUpdateDownloadFailure(
  version: string,
  err: unknown,
): void {
  const error = toUpdateDownloadError(err);
  const command = "update_download";
  const message = `download of ${version} ${error.message}`;
  if (error.kind === "network") {
    reportQuietError("offline", command, message, error);
    return;
  }
  if (error.kind === "upstream") {
    reportQuietError("release_host_unavailable", command, message, error);
    return;
  }
  reportError(command, message, error);
}
