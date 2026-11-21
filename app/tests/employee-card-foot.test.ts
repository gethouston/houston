import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const foot = readFileSync(
  join(
    import.meta.dirname,
    "../src/components/employee-card/employee-card-foot.tsx",
  ),
  "utf8",
);

describe("employee card foot", () => {
  it("announces a status change through a stable polite live region", () => {
    const region = foot.indexOf('role="status"');
    assert.ok(region >= 0, "the foot has a status live region");
    assert.ok(
      region < foot.indexOf("<AnimatePresence"),
      "the region wraps the status line's swap, so it outlives each status",
    );
    assert.match(foot, /aria-live="polite"/);
  });
});
