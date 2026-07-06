import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { formatRelativeTime } from "../src/components/organization/org-time.ts";

const NOW = Date.UTC(2026, 6, 6, 12, 0, 0);

describe("org relative time", () => {
  it("picks the right unit bucket in English", () => {
    strictEqual(formatRelativeTime(NOW - 30_000, "en", NOW), "30 seconds ago");
    strictEqual(
      formatRelativeTime(NOW - 5 * 60_000, "en", NOW),
      "5 minutes ago",
    );
    strictEqual(
      formatRelativeTime(NOW - 3 * 3600_000, "en", NOW),
      "3 hours ago",
    );
    strictEqual(
      formatRelativeTime(NOW - 2 * 86400_000, "en", NOW),
      "2 days ago",
    );
  });

  it("uses numeric:auto wording for the immediate buckets", () => {
    strictEqual(formatRelativeTime(NOW - 86400_000, "en", NOW), "yesterday");
  });

  it("localizes without per-language strings", () => {
    strictEqual(
      typeof formatRelativeTime(NOW - 5 * 60_000, "es", NOW),
      "string",
    );
    strictEqual(
      typeof formatRelativeTime(NOW - 5 * 60_000, "pt", NOW),
      "string",
    );
  });
});
