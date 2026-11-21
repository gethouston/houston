import assert from "node:assert/strict";
import test from "node:test";
import { NAME_TAKEN, READ_ONLY } from "@houston/protocol/file-refusal";
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
  assert.equal(
    keepBothName(
      [...files, entry("Docs/report (1).pdf")],
      "report.pdf",
      "Docs",
    ),
    "report (2).pdf",
  );
  assert.equal(
    keepBothName([...files, entry("report (1).pdf")], "report.pdf", "Docs"),
    "report (2).pdf",
  );
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
  assert.deepEqual(
    detectRenameConflict([...files, entry("notes.txt")], "notes.txt", "Docs"),
    { kind: "conflict", targetPath: "Docs", name: "Docs" },
  );
});

test("a folder that exists only through children blocks a rename too", () => {
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
  assert.equal(detectRenameConflict(crowded, "report.pdf", name).kind, "clear");
});

test("isNameTakenError reads the host's code, not its status or wording", () => {
  assert.equal(
    isNameTakenError({
      status: 409,
      body: { error: '"a.pdf" already exists there', code: "name_taken" },
    }),
    true,
  );
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
  assert.equal(
    isReadOnlyError({
      status: 403,
      body: { error: "this workspace is read-only", code: "read_only" },
    }),
    true,
  );
  assert.equal(isReadOnlyError({ code: "read_only" }), true);
  assert.equal(isReadOnlyError({ kind: "read_only" }), true);
  assert.equal(
    isReadOnlyError({ status: 403, body: { error: "forbidden" } }),
    false,
  );
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

test("the codes the client explains are the host's own, not a copy of them", () => {
  assert.equal(
    fileRefusal({ status: 409, body: { code: NAME_TAKEN } }),
    NAME_TAKEN,
  );
  assert.equal(
    fileRefusal({ status: 403, body: { code: READ_ONLY } }),
    READ_ONLY,
  );
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
  assert.equal(fileRefusal({ status: 409, body: { code: "quota" } }), null);
  assert.equal(fileRefusal(new Error("boom")), null);
  assert.equal(fileRefusal(undefined), null);
});
