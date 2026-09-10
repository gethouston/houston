import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  describeDownloadFailure,
  isUpdateNetworkFailure,
  toUpdateDownloadError,
  UpdateDownloadError,
} from "../src/lib/update-download-failure.ts";

// PRODUCT-1727: the shell's resumable download rejects with a typed failure;
// the frontend routes `network` to the quiet offline class and everything
// else to a real report, with the byte position in the message either way.
describe("toUpdateDownloadError", () => {
  it("reads the shell's typed rejection", () => {
    const error = toUpdateDownloadError({
      kind: "network",
      message: "error decoding response body",
      received: 123_456_789,
      total: 315_000_000,
      attempts: 4,
    });
    strictEqual(error instanceof UpdateDownloadError, true);
    strictEqual(error.kind, "network");
    strictEqual(error.received, 123_456_789);
    strictEqual(
      error.message,
      "stopped at 123456789/315000000 bytes after 4 attempts: error decoding response body",
    );
  });

  it("wraps an untyped rejection as `other`", () => {
    const error = toUpdateDownloadError("update resource 3 is gone");
    strictEqual(error.kind, "other");
    strictEqual(error.received, 0);
    strictEqual(
      error.message,
      "stopped at 0/? bytes: update resource 3 is gone",
    );
  });

  it("refuses an unknown kind rather than trusting it", () => {
    const error = toUpdateDownloadError({ kind: "weird", message: "x" });
    strictEqual(error.kind, "other");
  });

  it("returns an existing UpdateDownloadError as is", () => {
    const error = new UpdateDownloadError({
      kind: "signature",
      message: "bad",
      received: 10,
      total: 10,
      attempts: 0,
    });
    strictEqual(toUpdateDownloadError(error), error);
  });
});

describe("describeDownloadFailure", () => {
  it("omits the attempt count when nothing was attempted", () => {
    strictEqual(
      describeDownloadFailure({
        kind: "http",
        message: "Download request failed with status: 404",
        received: 0,
        total: null,
        attempts: 0,
      }),
      "stopped at 0/? bytes: Download request failed with status: 404",
    );
  });
});

// The release-feed check's reqwest messages: transport failures are the
// device's link, a 404 / bad manifest is a leaked staging build and must
// keep filing as a bug.
describe("isUpdateNetworkFailure", () => {
  it("matches reqwest's transport shapes", () => {
    for (const message of [
      "error sending request for url (https://github.com/gethouston/houston/releases/latest/download/latest.json)",
      "error decoding response body",
      "dns error: failed to lookup address information",
      "Connection reset by peer (os error 54)",
      "operation timed out",
      "tls handshake eof",
    ]) {
      strictEqual(isUpdateNetworkFailure(message), true, message);
    }
  });

  it("leaves a manifest or status failure as a bug", () => {
    for (const message of [
      "Could not fetch a valid release JSON from the remote",
      "Download request failed with status: 404 Not Found",
      "Update.install called before Update.download",
    ]) {
      strictEqual(isUpdateNetworkFailure(message), false, message);
    }
  });
});
