import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import { runWithConversationId } from "./conversation-context";
import {
  CODEX_REFUSALS_FILE,
  clearSessionDirKeepingMarks,
  RECONNECT_OFFERED_FILE,
  readConversationMark,
  writeConversationMark,
} from "./conversation-marks";

const dataDir = () => mkdtempSync(join(tmpdir(), "conversation-marks-"));

test("a mark round-trips through the conversation's session dir, atomically", () => {
  const dir = dataDir();
  runWithConversationId(
    "c1",
    () => writeConversationMark("m.json", { a: 1 }),
    dir,
  );
  expect(readdirSync(join(dir, "sessions", "c1"))).toEqual(["m.json"]);
  expect(
    runWithConversationId("c1", () => readConversationMark("m.json"), dir),
  ).toEqual({ a: 1 });
  expect(
    runWithConversationId("c2", () => readConversationMark("m.json"), dir),
  ).toBeUndefined();
});

test("without a turn's data dir nothing is read or written", () => {
  const dir = dataDir();
  runWithConversationId("c1", () => writeConversationMark("m.json", { a: 1 }));
  writeConversationMark("m.json", { a: 1 });
  expect(existsSync(join(dir, "sessions"))).toBe(false);
  expect(
    runWithConversationId("c1", () => readConversationMark("m.json")),
  ).toBeUndefined();
});

test("a corrupt mark reads as none and says so", () => {
  const dir = dataDir();
  mkdirSync(join(dir, "sessions", "c1"), { recursive: true });
  writeFileSync(join(dir, "sessions", "c1", "m.json"), "{not json");
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  expect(
    runWithConversationId("c1", () => readConversationMark("m.json"), dir),
  ).toBeUndefined();
  expect(warn).toHaveBeenCalledOnce();
  warn.mockRestore();
});

test("a failed write is reported, never thrown", () => {
  const dir = dataDir();
  writeFileSync(join(dir, "sessions"), "a file where the dir should be");
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  runWithConversationId(
    "c1",
    () => writeConversationMark("m.json", { a: 1 }),
    dir,
  );
  expect(error).toHaveBeenCalledOnce();
  error.mockRestore();
});

test("clearing a session dir keeps only the marks", () => {
  const session = join(dataDir(), "sessions", "c1");
  mkdirSync(join(session, "claude", "projects"), { recursive: true });
  for (const file of [
    "s.jsonl",
    "harness.json",
    "autocompact.json",
    CODEX_REFUSALS_FILE,
    RECONNECT_OFFERED_FILE,
  ])
    writeFileSync(join(session, file), "{}");
  clearSessionDirKeepingMarks(session);
  expect(readdirSync(session).sort()).toEqual(
    [CODEX_REFUSALS_FILE, RECONNECT_OFFERED_FILE].sort(),
  );
  clearSessionDirKeepingMarks(join(session, "missing"));
});
