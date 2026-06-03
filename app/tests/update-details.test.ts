import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { normalizeUpdateNotes } from "../src/lib/update-details.ts";

describe("normalizeUpdateNotes", () => {
  it("returns null for empty, whitespace, null, and undefined bodies", () => {
    strictEqual(normalizeUpdateNotes(null), null);
    strictEqual(normalizeUpdateNotes(undefined), null);
    strictEqual(normalizeUpdateNotes(""), null);
    strictEqual(normalizeUpdateNotes("   \n  \t "), null);
  });

  it("suppresses the generic Tauri placeholder so the card shows the fallback", () => {
    strictEqual(
      normalizeUpdateNotes("See the assets to download and install this version."),
      null,
    );
  });

  it("normalizes CRLF to LF so markdown blocks parse consistently", () => {
    strictEqual(
      normalizeUpdateNotes("## Houston 0.4.16\r\n\r\nArchive missions."),
      "## Houston 0.4.16\n\nArchive missions.",
    );
  });

  it("trims surrounding whitespace but preserves the markdown body", () => {
    const body = "\n\n## Houston 0.4.16\n\n- Archive missions\n- Manage apps\n\n";
    strictEqual(
      normalizeUpdateNotes(body),
      "## Houston 0.4.16\n\n- Archive missions\n- Manage apps",
    );
  });
});
