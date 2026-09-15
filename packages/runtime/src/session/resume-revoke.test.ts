import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

const settle = vi.fn();
vi.mock("./mission-settle", () => ({
  reportMissionSettle: (...args: unknown[]) => settle(...args),
}));

const { resumeWasRecorded, revokeResume } = await import("./resume-revoke");

function seed(messages: unknown[]) {
  const dataDir = mkdtempSync(join(tmpdir(), "houston-revoke-"));
  const conversations = join(dataDir, "conversations");
  mkdirSync(conversations, { recursive: true });
  writeFileSync(
    join(conversations, "chat.json"),
    JSON.stringify({
      id: "chat",
      title: "chat",
      createdAt: 1,
      updatedAt: 1,
      messages,
    }),
  );
  const read = () =>
    JSON.parse(readFileSync(join(conversations, "chat.json"), "utf8")) as {
      messages: Record<string, unknown>[];
    };
  return { dataDir, read };
}

describe("revokeResume", () => {
  it("drops the resumed promise from the reply and settles the mission card", () => {
    settle.mockClear();
    const { dataDir, read } = seed([
      { role: "user", content: "go", ts: 1, turnId: "t-1" },
      {
        role: "assistant",
        content: "",
        ts: 2,
        turnId: "t-1",
        interrupted: { cause: "engine_restart", resumed: true },
      },
    ]);
    revokeResume(dataDir, "chat", "t-1");
    expect(read().messages[1]?.interrupted).toEqual({
      cause: "engine_restart",
    });
    expect(settle).toHaveBeenCalledWith("chat", "error", null);
  });

  it("still settles the card when there is no reply to rewrite", () => {
    settle.mockClear();
    const { dataDir } = seed([]);
    revokeResume(dataDir, "chat", "t-1");
    expect(settle).toHaveBeenCalledWith("chat", "error", null);
  });
});

describe("resumeWasRecorded", () => {
  it("is true only once the hidden prompt is in the transcript", () => {
    const { dataDir } = seed([
      { role: "user", content: "the resume prompt", ts: 1, turnId: "t-2" },
    ]);
    expect(resumeWasRecorded(dataDir, "chat", "the resume prompt")).toBe(true);
    expect(resumeWasRecorded(dataDir, "chat", "another prompt")).toBe(false);
    expect(resumeWasRecorded(dataDir, "gone", "the resume prompt")).toBe(false);
  });
});
