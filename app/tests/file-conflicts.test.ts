import assert from "node:assert/strict";
import test from "node:test";
import type { FileEntry } from "@houston-ai/agent";
import {
  detectMoveConflict,
  keepBothName,
  moveTargetPath,
} from "../src/lib/file-conflicts.ts";

const entry = (path: string, is_directory = false): FileEntry => ({
  path,
  name: path.split("/").pop() ?? path,
  extension: is_directory ? "" : (path.split(".").pop() ?? ""),
  size: 1,
  is_directory,
});

const files = [
  entry("report.pdf"),
  entry("Docs", true),
  entry("Docs/report.pdf"),
  entry("Docs/notes.txt"),
  // An implied folder: no explicit entry, only a child.
  entry("Archive/old/report.pdf"),
];

test("moveTargetPath joins the name onto the destination", () => {
  assert.equal(moveTargetPath("Docs/report.pdf", null), "report.pdf");
  assert.equal(moveTargetPath("report.pdf", "Docs"), "Docs/report.pdf");
});

test("moving onto an occupied name is a conflict in both directions", () => {
  assert.deepEqual(detectMoveConflict(files, "report.pdf", "Docs"), {
    kind: "conflict",
    targetPath: "Docs/report.pdf",
    name: "report.pdf",
  });
  assert.deepEqual(detectMoveConflict(files, "Docs/report.pdf", null), {
    kind: "conflict",
    targetPath: "report.pdf",
    name: "report.pdf",
  });
});

test("a folder that exists only through children still conflicts", () => {
  // Moving a file named like the implied "Archive" folder's sibling is clear,
  // but a folder named "old" into Archive collides with the implied dir.
  assert.equal(
    detectMoveConflict([entry("stuff/old", true)], "stuff/old", "Archive").kind,
    "clear",
  );
  assert.equal(
    detectMoveConflict(
      [...files, entry("stuff/old", true)],
      "stuff/old",
      "Archive",
    ).kind,
    "conflict",
  );
});

test("same-place and into-own-subtree moves are noops", () => {
  assert.equal(detectMoveConflict(files, "report.pdf", null).kind, "noop");
  assert.equal(
    detectMoveConflict(files, "Docs/notes.txt", "Docs").kind,
    "noop",
  );
  assert.equal(detectMoveConflict(files, "Docs", "Docs").kind, "noop");
  assert.equal(
    detectMoveConflict([...files, entry("Docs/sub", true)], "Docs", "Docs/sub")
      .kind,
    "noop",
  );
});

test("non-colliding moves are clear", () => {
  assert.equal(detectMoveConflict(files, "Docs/notes.txt", null).kind, "clear");
});

test("keepBothName picks the first free numbered name in both folders", () => {
  assert.equal(keepBothName(files, "report.pdf", "Docs"), "report (1).pdf");
  // "report (1).pdf" taken in the destination: skip to (2).
  assert.equal(
    keepBothName(
      [...files, entry("Docs/report (1).pdf")],
      "report.pdf",
      "Docs",
    ),
    "report (2).pdf",
  );
  // Taken in the SOURCE folder also skips (the item renames there first).
  assert.equal(
    keepBothName([...files, entry("report (1).pdf")], "report.pdf", "Docs"),
    "report (2).pdf",
  );
  // Folders have no extension: suffix goes at the end.
  assert.equal(
    keepBothName([...files, entry("stuff/Docs", true)], "stuff/Docs", null),
    "Docs (1)",
  );
});
