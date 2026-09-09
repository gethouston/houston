import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  EngineRestartedMidTurnError,
  fenceBypassed,
  settleInterruptedTurns,
} from "./settle-interrupted-turns";
import {
  listInflightMarkers,
  writeInflightMarker,
} from "./turn-inflight-marker";

function seed() {
  const dataDir = mkdtempSync(join(tmpdir(), "houston-settle-"));
  const conversations = join(dataDir, "conversations");
  mkdirSync(conversations, { recursive: true });
  const write = (id: string, messages: unknown[]) =>
    writeFileSync(
      join(conversations, `${encodeURIComponent(id)}.json`),
      JSON.stringify({
        id,
        title: id,
        createdAt: 1,
        updatedAt: 1,
        messages,
      }),
    );
  const read = (id: string) =>
    JSON.parse(
      readFileSync(
        join(conversations, `${encodeURIComponent(id)}.json`),
        "utf8",
      ),
    ) as { messages: Record<string, unknown>[] };
  return { dataDir, write, read };
}

describe("settleInterruptedTurns", () => {
  it("writes the interrupted reply for the dead turn, reports once, clears the marker", () => {
    const { dataDir, write, read } = seed();
    write("chat", [
      { role: "user", content: "export it", ts: 1, turnId: "t-9" },
    ]);
    writeInflightMarker(dataDir, {
      conversationId: "chat",
      turnId: "t-9",
      startedAt: 10_000,
      tool: "bash",
      fenced: true,
    });
    const report = vi.fn();
    const settleMission = vi.fn();
    const settled = settleInterruptedTurns({
      dataDir,
      report,
      settleMission,
      now: () => 73_000,
    });

    expect(settled.map((m) => m.turnId)).toEqual(["t-9"]);
    const last = read("chat").messages.at(-1);
    expect(last).toMatchObject({
      role: "assistant",
      content: "",
      turnId: "t-9",
      interrupted: { cause: "engine_restart", tool: "bash" },
    });
    expect(settleMission).toHaveBeenCalledWith("chat");
    expect(report).toHaveBeenCalledTimes(1);
    const error = report.mock.calls[0]?.[0] as EngineRestartedMidTurnError;
    expect(error).toBeInstanceOf(EngineRestartedMidTurnError);
    expect(error.name).toBe("EngineRestartedMidTurnError");
    expect(error.ranForMs).toBe(63_000);
    expect(error.message).toContain("conversation=chat");
    expect(error.message).toContain("turn=t-9");
    expect(error.message).toContain("ran=63s");
    expect(error.message).toContain("tool=bash");
    expect(error.message).toContain("fenced=true");
    expect(error.message).toContain("memory fence");
    expect(listInflightMarkers(dataDir)).toEqual([]);
  });

  it("a marker without a tool settles without one, and the report names no fence bypass", () => {
    const { dataDir, write, read } = seed();
    write("idle", [{ role: "user", content: "hi", ts: 1, turnId: "t-1" }]);
    writeInflightMarker(dataDir, {
      conversationId: "idle",
      turnId: "t-1",
      startedAt: 0,
      fenced: true,
    });
    const report = vi.fn();
    settleInterruptedTurns({ dataDir, report, settleMission: () => {} });
    const last = read("idle").messages.at(-1);
    expect(last?.interrupted).toEqual({ cause: "engine_restart" });
    const error = report.mock.calls[0]?.[0] as EngineRestartedMidTurnError;
    expect(error.message).toContain("tool=none");
    expect(error.message).not.toContain("memory fence");
  });

  it("a marker whose conversation is gone still clears and reports", () => {
    const { dataDir } = seed();
    writeInflightMarker(dataDir, {
      conversationId: "deleted",
      turnId: "t-d",
      startedAt: 0,
      fenced: false,
    });
    const report = vi.fn();
    const settled = settleInterruptedTurns({
      dataDir,
      report,
      settleMission: () => {},
    });
    expect(settled).toHaveLength(1);
    expect(report).toHaveBeenCalledTimes(1);
    expect(listInflightMarkers(dataDir)).toEqual([]);
  });

  it("a quiet boot settles nothing and reports nothing", () => {
    const { dataDir } = seed();
    const report = vi.fn();
    expect(
      settleInterruptedTurns({ dataDir, report, settleMission: () => {} }),
    ).toEqual([]);
    expect(report).not.toHaveBeenCalled();
  });

  it("a second boot after the settle is quiet (idempotent)", () => {
    const { dataDir, write, read } = seed();
    write("once", [{ role: "user", content: "go", ts: 1, turnId: "t-once" }]);
    writeInflightMarker(dataDir, {
      conversationId: "once",
      turnId: "t-once",
      startedAt: 0,
      fenced: false,
    });
    const report = vi.fn();
    settleInterruptedTurns({ dataDir, report, settleMission: () => {} });
    settleInterruptedTurns({ dataDir, report, settleMission: () => {} });
    expect(report).toHaveBeenCalledTimes(1);
    expect(
      read("once").messages.filter((m) => m.interrupted !== undefined),
    ).toHaveLength(1);
  });
});

describe("fenceBypassed", () => {
  const base = { conversationId: "c", turnId: "t", startedAt: 0 };
  it("is a shell tool under the fence, nothing else", () => {
    expect(fenceBypassed({ ...base, fenced: true, tool: "bash" })).toBe(true);
    expect(fenceBypassed({ ...base, fenced: true, tool: "Bash" })).toBe(true);
    expect(fenceBypassed({ ...base, fenced: false, tool: "bash" })).toBe(false);
    expect(fenceBypassed({ ...base, fenced: true, tool: "read" })).toBe(false);
    expect(fenceBypassed({ ...base, fenced: true })).toBe(false);
  });
});
