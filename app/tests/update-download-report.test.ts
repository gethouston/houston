import { ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { quietErrorDetails } from "../src/lib/quiet-error-class.ts";
import { UpdateDownloadError } from "../src/lib/update-download-failure.ts";

// PRODUCT-1811 (HOUSTON-APP-5EQ): a 504 from the release host was final on
// first sight and filed as a per-user bug. The shell now retries it and
// rejects with `upstream`; the report path routes that class to its own
// quiet capture, tagged with the status. Asserted against the source: the
// report module pulls error-report (i18n / analytics / the tauri barrel),
// which does not load under this suite's runner.
const source = readFileSync(
  join(import.meta.dirname, "../src/lib/update-download-report.ts"),
  "utf8",
);

describe("reportUpdateDownloadFailure", () => {
  it("routes an upstream failure to the release_host_unavailable class", () => {
    const body = source.slice(
      source.indexOf("export function reportUpdateDownloadFailure("),
    );
    const upstream = body.indexOf('error.kind === "upstream"');
    const quiet = body.indexOf(
      'reportQuietError("release_host_unavailable", command, message, error)',
    );
    const loud = body.indexOf("reportError(command, message, error)");
    ok(upstream !== -1, "the upstream class must be branched on");
    ok(quiet !== -1, "upstream must capture quietly under its own class");
    ok(
      upstream < quiet && quiet < loud,
      "the quiet route must precede the bug route",
    );
  });

  it("keeps the network class on the offline issue", () => {
    ok(source.includes('reportQuietError("offline", command, message, error)'));
  });
});

describe("quietErrorDetails on an UpdateDownloadError", () => {
  it("tags the quiet event with the status the release host answered", () => {
    const details = quietErrorDetails(
      new UpdateDownloadError({
        kind: "upstream",
        message: "Download request failed with status: 504 Gateway Timeout",
        received: 0,
        total: null,
        attempts: 4,
        status: 504,
      }),
    );
    strictEqual(details.status, 504);
    strictEqual(
      details.body,
      "stopped at 0/? bytes after 4 attempts: Download request failed with status: 504 Gateway Timeout",
    );
  });
});
