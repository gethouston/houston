import { expect, test } from "vitest";
import {
  MAX_UNSAVED_FILES,
  parseUnsavedFiles,
  userVisibleUnsavedFiles,
} from "./turn-unsaved-files";

test("parses the terminal frame's unsaved files", () => {
  expect(
    parseUnsavedFiles({
      timingsMs: { accept: 0 },
      unsavedFiles: {
        files: [
          {
            path: "notes.md",
            reason: "conflict_copy",
            copyPath: "notes (conflict 2026-11-22).md",
          },
          { path: "data/x.json", reason: "conflict", internal: true },
        ],
        total: 3,
        counts: { conflict_copy: 1, conflict: 2 },
      },
    }),
  ).toEqual({
    files: [
      {
        path: "notes.md",
        reason: "conflict_copy",
        copyPath: "notes (conflict 2026-11-22).md",
      },
      { path: "data/x.json", reason: "conflict", internal: true },
    ],
    total: 3,
    counts: { conflict_copy: 1, conflict: 2 },
  });
});

test.each([
  null,
  {},
  { unsavedFiles: "x" },
  { unsavedFiles: { files: [], total: 0, counts: {} } },
  { unsavedFiles: { files: {}, total: 1 } },
  { unsavedFiles: { files: [], total: -1 } },
])("no report from %j", (data) => {
  expect(parseUnsavedFiles(data)).toBeNull();
});

test("a malformed entry or count drops only itself", () => {
  const report = parseUnsavedFiles({
    unsavedFiles: {
      files: [
        { path: "a.md", reason: "nope" },
        { path: "", reason: "conflict" },
        { path: "b.md", reason: "too_large" },
      ],
      total: 3,
      counts: { too_large: 1, nope: 4, conflict: "x" },
    },
  });
  expect(report).toEqual({
    files: [{ path: "b.md", reason: "too_large" }],
    total: 3,
    counts: { too_large: 1 },
  });
});

test("entries past the cap are not read", () => {
  const files = Array.from({ length: 30 }, (_, i) => ({
    path: `f${i}.md`,
    reason: "conflict",
  }));
  const report = parseUnsavedFiles({ unsavedFiles: { files, total: 30 } });
  expect(report?.files).toHaveLength(MAX_UNSAVED_FILES);
  expect(report?.total).toBe(30);
});

test("only the person's own files are user-visible", () => {
  expect(
    userVisibleUnsavedFiles({
      files: [
        { path: "notes.md", reason: "conflict" },
        { path: ".houston/activity/activity.json", reason: "conflict" },
        { path: "data/x.json", reason: "conflict", internal: true },
      ],
      total: 3,
      counts: { conflict: 3 },
    }),
  ).toEqual([{ path: "notes.md", reason: "conflict" }]);
  expect(userVisibleUnsavedFiles(null)).toEqual([]);
});
