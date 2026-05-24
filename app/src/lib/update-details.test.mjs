import test from "node:test";
import assert from "node:assert/strict";
import { normalizeUpdateNotes } from "./update-details.ts";

test("hides generic updater notes", () => {
  assert.equal(
    normalizeUpdateNotes(
      "See the assets to download and install this version.",
    ),
    null,
  );
});

test("normalizes real release notes", () => {
  assert.equal(
    normalizeUpdateNotes("\r\n### Fixes\r\n\r\n- Updated banner\r\n"),
    "### Fixes\n\n- Updated banner",
  );
});
