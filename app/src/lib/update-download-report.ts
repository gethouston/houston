import { reportError } from "./error-report";
import { reportQuietError } from "./quiet-error-report";
import { toUpdateDownloadError } from "./update-download-failure";

/**
 * Report a failed release download (PRODUCT-1727). The shell already retried
 * and resumed it; what reaches here is the LAST attempt, with the byte
 * position in the message. A `network` failure is the device's link, not a
 * bug: it captures as the quiet `offline` class (one fingerprinted warning
 * issue, burst-collapsed), the way every other transport drop does. Any other
 * class (an HTTP status, a signature that did not verify, a missing resource)
 * is a real error and files as one.
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
  reportError(command, message, error);
}
