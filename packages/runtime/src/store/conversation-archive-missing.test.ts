import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChatMessage } from "@houston/runtime-client";
import { expect, test, vi } from "vitest";
import {
  archiveDirFor,
  segmentFileFor,
  segments,
} from "./conversation-archive";
import { ArchiveSegmentMissingError } from "./conversation-archive-missing";
import { segmentsInWindow } from "./conversation-archive-window";
import { getHistoryAt, loadFullConversation } from "./conversation-file";
import { importConversationMessagesAt } from "./conversation-import";

const msg = (n: number): ChatMessage => ({
  role: n % 2 ? "assistant" : "user",
  content: `m${n}`,
  ts: n,
});

function rotated(): string {
  const dir = mkdtempSync(join(tmpdir(), "archive-missing-"));
  mkdirSync(archiveDirFor(dir, "c1"), { recursive: true });
  for (const n of [1, 2, 3]) {
    const first = (n - 1) * 3;
    writeFileSync(
      segmentFileFor(dir, "c1", n),
      JSON.stringify({
        id: "c1",
        segment: n,
        messages: [first, first + 1, first + 2].map(msg),
      }),
    );
  }
  writeFileSync(
    join(dir, "c1.json"),
    JSON.stringify({
      id: "c1",
      title: "Routine",
      createdAt: 1,
      updatedAt: 2,
      messages: [9, 10].map(msg),
      archived: { messages: 9, segments: [3, 3, 3] },
    }),
  );
  segments.clear();
  return dir;
}

test("a window names exactly the segments it reaches into", () => {
  const archived = { messages: 9, segments: [3, 3, 3] };
  expect(segmentsInWindow(archived, 11, {})).toEqual([1, 2, 3]);
  expect(segmentsInWindow(archived, 11, { limit: 2 })).toEqual([]);
  expect(segmentsInWindow(archived, 11, { limit: 3 })).toEqual([3]);
  expect(segmentsInWindow(archived, 11, { limit: 6 })).toEqual([2, 3]);
  expect(segmentsInWindow(archived, 11, { limit: 2, before: 4 })).toEqual([
    1, 2,
  ]);
  expect(segmentsInWindow(undefined, 2, {})).toEqual([]);
});

test("a missing segment reads as a reported gap, never a failed chat", () => {
  const dir = rotated();
  rmSync(segmentFileFor(dir, "c1", 1));
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    expect(getHistoryAt(dir, "c1", { limit: 5 })?.messages.length).toBe(5);
    expect(errors).not.toHaveBeenCalled();
    expect(getHistoryAt(dir, "c1")?.messages.map((m) => m.content)).toEqual(
      Array.from({ length: 8 }, (_, n) => `m${n + 3}`),
    );
    getHistoryAt(dir, "c1");
    expect(errors).toHaveBeenCalledTimes(1);
    expect(errors.mock.calls[0]?.[1]).toBeInstanceOf(
      ArchiveSegmentMissingError,
    );
  } finally {
    errors.mockRestore();
  }
  writeFileSync(
    segmentFileFor(dir, "c1", 1),
    JSON.stringify({ id: "c1", segment: 1, messages: [0, 1, 2].map(msg) }),
  );
  expect(getHistoryAt(dir, "c1")?.messages.map((m) => m.content)).toEqual(
    Array.from({ length: 11 }, (_, n) => `m${n}`),
  );
});

test("a whole-document read refuses a missing segment: a repair never ships the hole", () => {
  const dir = rotated();
  rmSync(segmentFileFor(dir, "c1", 2));
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    expect(() => loadFullConversation(dir, "c1")).toThrow(
      ArchiveSegmentMissingError,
    );
    expect(errors).toHaveBeenCalledTimes(1);
  } finally {
    errors.mockRestore();
  }
});

test("an import still lands in a chat that lost a segment", () => {
  const dir = rotated();
  rmSync(segmentFileFor(dir, "c1", 1));
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    expect(
      importConversationMessagesAt(dir, "c1", {
        importId: "onboarding:first_run",
        messages: [{ role: "assistant", content: "Hi!" }],
      }),
    ).toBe(1);
    expect(errors).toHaveBeenCalledTimes(1);
  } finally {
    errors.mockRestore();
  }
});
