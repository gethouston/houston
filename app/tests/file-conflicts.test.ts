import assert from "node:assert/strict";
import test from "node:test";
import type { FileEntry } from "@houston-ai/agent";
import {
  detectMoveConflict,
  detectRenameConflict,
  fileRefusal,
  isNameTakenError,
  isReadOnlyError,
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

test("renaming onto a name the folder already uses is a conflict", () => {
  assert.deepEqual(
    detectRenameConflict(files, "Docs/notes.txt", "report.pdf"),
    {
      kind: "conflict",
      targetPath: "Docs/report.pdf",
      name: "report.pdf",
    },
  );
  // Root level, same story.
  assert.deepEqual(
    detectRenameConflict([...files, entry("notes.txt")], "notes.txt", "Docs"),
    { kind: "conflict", targetPath: "Docs", name: "Docs" },
  );
});

test("a folder that exists only through children blocks a rename too", () => {
  // Nothing lists "Archive" itself, but a file named that would collide with
  // the folder the children imply: one name, one entry.
  assert.deepEqual(detectRenameConflict(files, "report.pdf", "Archive"), {
    kind: "conflict",
    targetPath: "Archive",
    name: "Archive",
  });
});

test("renaming to the name it already has is a noop", () => {
  assert.equal(
    detectRenameConflict(files, "report.pdf", "report.pdf").kind,
    "noop",
  );
  assert.equal(
    detectRenameConflict(files, "Docs/notes.txt", "notes.txt").kind,
    "noop",
  );
});

test("a free name is clear to rename", () => {
  assert.equal(
    detectRenameConflict(files, "Docs/notes.txt", "notes 2.txt").kind,
    "clear",
  );
  // The source's own subtree never blocks its rename.
  assert.equal(detectRenameConflict(files, "Docs", "Papers").kind, "clear");
});

test("keepBothName never lands on a name either folder already uses", () => {
  const crowded = [
    ...files,
    entry("report (1).pdf"),
    entry("Docs/report (2).pdf"),
    entry("report (3).pdf"),
  ];
  const name = keepBothName(crowded, "report.pdf", "Docs");
  assert.equal(name, "report (4).pdf");
  // Which is exactly what `detectRenameConflict` would wave through: the
  // keep-both rename can never hit the host's 409.
  assert.equal(detectRenameConflict(crowded, "report.pdf", name).kind, "clear");
});

test("isNameTakenError reads the host's code, not its status or wording", () => {
  // What the host actually sends (`turn/files.ts`), as the engine adapter
  // hands it over: status + the parsed body.
  assert.equal(
    isNameTakenError({
      status: 409,
      body: { error: '"a.pdf" already exists there', code: "name_taken" },
    }),
    true,
  );
  // A DIFFERENT 409 on the same route must not inherit the taken-name copy.
  assert.equal(
    isNameTakenError({
      status: 409,
      body: { error: "workspace is read-only" },
    }),
    false,
  );
  assert.equal(isNameTakenError({ status: 404 }), false);
  assert.equal(
    isNameTakenError(new Error('"a.pdf" already exists there')),
    false,
  );
  assert.equal(isNameTakenError("already exists there"), false);
  assert.equal(isNameTakenError(null), false);
});

test("isReadOnlyError reads the host's code, not its status or wording", () => {
  // The TS host's 403 body (`turn/files-names.ts`, raised when the workspace
  // folder answers EACCES/EPERM/EROFS), as the engine adapter hands it over.
  assert.equal(
    isReadOnlyError({
      status: 403,
      body: { error: "this workspace is read-only", code: "read_only" },
    }),
    true,
  );
  // The gateway's flat body and the adapter's own `kind` say the same thing.
  assert.equal(isReadOnlyError({ code: "read_only" }), true);
  assert.equal(isReadOnlyError({ kind: "read_only" }), true);
  // Every OTHER 403 on the route (an authz refusal, a policy block) must not
  // inherit this copy — the status cannot identify the state.
  assert.equal(
    isReadOnlyError({ status: 403, body: { error: "forbidden" } }),
    false,
  );
  // Nor may the host's English wording stand in for the contract.
  assert.equal(
    isReadOnlyError(new Error("this workspace is read-only")),
    false,
  );
  assert.equal(isReadOnlyError(null), false);
});

test("the two refusals never answer for each other", () => {
  const taken = { status: 409, body: { code: "name_taken" } };
  const readOnly = { status: 403, body: { code: "read_only" } };
  assert.equal(isNameTakenError(readOnly), false);
  assert.equal(isReadOnlyError(taken), false);
});

test("fileRefusal routes each host FileOpCode to its own surface", () => {
  assert.equal(
    fileRefusal({ status: 409, body: { code: "name_taken" } }),
    "name_taken",
  );
  assert.equal(
    fileRefusal({ status: 403, body: { code: "read_only" } }),
    "read_only",
  );
  // A code the client does not know is NOT a refusal it can explain: it keeps
  // the report path rather than borrowing the nearest authored copy.
  assert.equal(fileRefusal({ status: 409, body: { code: "quota" } }), null);
  assert.equal(fileRefusal(new Error("boom")), null);
  assert.equal(fileRefusal(undefined), null);
});
